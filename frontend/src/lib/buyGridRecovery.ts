/**
 * Buy Grid Recovery + Fixed Sell Hedge — desk preview + candle-path backtest.
 * Live source of truth: `mt5/BuyGridRecoveryHedge.mq5` (XAUUSD, tick fills).
 * Desk uses closed-bar O→L→H→C path — approximate vs MT5 Strategy Tester.
 */

import {
  barsForDays,
  candlesSpanDays,
  fetchCandles,
  type BacktestResult,
  type BacktestTrade,
  type Candle,
} from "./cryptoApi";

/** Loose values bag — avoid importing strategies.ts (circular). */
type Values = Record<string, number | string | boolean | undefined | null>;

export const BUY_LOT_SEQUENCE = [
  0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.27, 0.41, 0.62, 0.93, 1.4, 2.1, 3.15, 4.73, 7.1,
] as const;

export const BGRH_KEYS = {
  lastBuy: "bgrh_last_buy",
  nextDown: "bgrh_next_down",
  nextUp: "bgrh_next_up",
} as const;

export interface BgrhParams {
  gridStep: number;
  miniProfit: number;
  basketTarget: number;
  initialLot: number;
  sellLot: number;
  /** Daily DD % from day-start equity (floating). 0 = off. */
  dailyDdPct: number;
  /** Starting account equity for backtest ($) */
  capital: number;
}

export const BGRH_DEFAULTS: BgrhParams = {
  gridStep: 5,
  miniProfit: 0.2,
  basketTarget: 96,
  initialLot: 0.01,
  sellLot: 0.01,
  dailyDdPct: 30,
  capital: 1000,
};

export type BgrhPhase = "flat" | "waiting_downside" | "grid_active";

export interface BgrhReplay {
  candles: Candle[];
  phase: BgrhPhase;
  buyCount: number;
  sellCount: number;
  seqIndex: number;
  lastBuy: number | null;
  initialBuy: number | null;
  upsideActive: boolean;
  cycles: number;
  miniCloses: number;
  basketCloses: number;
  status: string;
  detail: string;
}

type Pos = { side: "buy" | "sell"; lots: number; price: number };

/** $1 move × 1.00 lot ≈ $100 (XAU-style contract). Desk approximation. */
export const BGRH_POINT_VALUE = 100;

function basketPnl(positions: Pos[], px: number): number {
  let p = 0;
  for (const x of positions) {
    if (x.side === "buy") p += (px - x.price) * x.lots * BGRH_POINT_VALUE;
    else p += (x.price - px) * x.lots * BGRH_POINT_VALUE;
  }
  return p;
}

function candleMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

function brokerDay(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function numVal(values: Values, key: string, fallback: number): number {
  const raw = Number(values[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function strVal(values: Values, key: string, fallback: string): string {
  const raw = values[key];
  return typeof raw === "string" && raw ? raw : fallback;
}

export function bgrhParamsFromValues(values: Values): BgrhParams {
  return {
    gridStep: numVal(values, "grid_step", BGRH_DEFAULTS.gridStep),
    miniProfit: numVal(values, "mini_profit", BGRH_DEFAULTS.miniProfit),
    basketTarget: numVal(values, "basket_target", BGRH_DEFAULTS.basketTarget),
    initialLot: numVal(values, "initial_lot", BGRH_DEFAULTS.initialLot),
    sellLot: numVal(values, "sell_lot", BGRH_DEFAULTS.sellLot),
    dailyDdPct: numVal(values, "daily_dd", BGRH_DEFAULTS.dailyDdPct),
    capital: numVal(values, "capital", BGRH_DEFAULTS.capital),
  };
}

interface SimTrade extends BacktestTrade {
  reason: "mini" | "basket" | "daily_dd";
}

interface SimResult {
  trades: SimTrade[];
  equityCurve: [number, number][];
  capital: number;
  finalEquity: number;
  maxDrawdownPct: number;
  miniCloses: number;
  basketCloses: number;
  ddCloses: number;
  cycles: number;
  barsHeldSum: number;
  open: {
    buyCount: number;
    sellCount: number;
    lastBuy: number | null;
    initialBuy: number | null;
    upside: boolean;
    seq: number;
    unrealized: number;
    mark: number;
  };
}

/**
 * Full path simulation for preview + backtest.
 * Path per bar: open → low → high → close (or open → high → low → close if inverted).
 */
function simulate(candles: Candle[], params: Partial<BgrhParams> = {}): SimResult {
  const p = { ...BGRH_DEFAULTS, ...params };
  const capital = Math.max(1, p.capital);

  let positions: Pos[] = [];
  let upside = false;
  let seq = 0;
  let lastBuy: number | null = null;
  let initialBuy: number | null = null;
  let cycleStartMs = 0;
  let cycleStartBar = 0;
  const usedBuys = new Set<string>();
  const usedSells = new Set<string>();

  let equity = capital;
  let dayStartEquity = capital;
  let dayStamp = 0;
  let dailyStopped = false;
  let peak = capital;
  let maxDdPct = 0;

  let cycles = 0;
  let miniCloses = 0;
  let basketCloses = 0;
  let ddCloses = 0;
  let barsHeldSum = 0;

  const trades: SimTrade[] = [];
  const curveRaw: [number, number][] = [];

  const key = (x: number) => x.toFixed(2);

  const reset = () => {
    positions = [];
    upside = false;
    seq = 0;
    lastBuy = null;
    initialBuy = null;
    usedBuys.clear();
    usedSells.clear();
  };

  const openBuy = (price: number, lots: number) => {
    const k = key(price);
    if (usedBuys.has(k)) return false;
    positions.push({ side: "buy", lots, price });
    usedBuys.add(k);
    lastBuy = price;
    if (initialBuy == null) initialBuy = price;
    seq += 1;
    return true;
  };

  const trySell = (price: number) => {
    for (const s of usedSells) {
      if (Math.abs(Number(s) - price) < p.gridStep - 1e-9) return false;
    }
    positions.push({ side: "sell", lots: p.sellLot, price });
    usedSells.add(key(price));
    return true;
  };

  const startCycle = (price: number, ms: number, barIndex: number) => {
    if (dailyStopped) return;
    cycles += 1;
    cycleStartMs = ms;
    cycleStartBar = barIndex;
    openBuy(price, p.initialLot);
  };

  const closeAll = (reason: "mini" | "basket" | "daily_dd", exitPrice: number, exitMs: number, barIndex: number) => {
    if (!positions.length) return;
    const pnl = basketPnl(positions, exitPrice);
    const buys = positions.filter((x) => x.side === "buy");
    const sells = positions.filter((x) => x.side === "sell");
    const buyLots = buys.reduce((a, x) => a + x.lots, 0);
    equity += pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDdPct = Math.max(maxDdPct, dd);

    if (reason === "mini") miniCloses += 1;
    else if (reason === "basket") basketCloses += 1;
    else ddCloses += 1;

    barsHeldSum += Math.max(1, barIndex - cycleStartBar + 1);

    const status =
      reason === "mini" ? "MINI_TP" : reason === "basket" ? "BASKET_TP" : "DAILY_DD";

    trades.push({
      entry_time: cycleStartMs,
      exit_time: exitMs,
      side: "buy",
      entry_price: initialBuy ?? exitPrice,
      exit_price: exitPrice,
      pnl,
      pnl_points: exitPrice - (initialBuy ?? exitPrice),
      status,
      quantity: buyLots,
      bars_held: Math.max(1, barIndex - cycleStartBar + 1),
      instrument: `${buys.length}B/${sells.length}S`,
      reason,
    });

    reset();
  };

  const markEquity = (px: number, ms: number) => {
    const floating = basketPnl(positions, px);
    const eq = equity + floating;
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    maxDdPct = Math.max(maxDdPct, dd);
    curveRaw.push([ms, eq]);
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ms = candleMs(c.time);
    const day = brokerDay(ms);
    if (day !== dayStamp) {
      dayStamp = day;
      dayStartEquity = equity + basketPnl(positions, c.open);
      dailyStopped = false;
    }

    const path = c.low <= c.high ? [c.open, c.low, c.high, c.close] : [c.open, c.high, c.low, c.close];
    for (const px of path) {
      if (dailyStopped) break;

      if (!positions.length) {
        startCycle(px, ms, i);
        continue;
      }

      const floating = basketPnl(positions, px);
      if (p.dailyDdPct > 0) {
        const dayEq = dayStartEquity;
        const cur = equity + floating;
        if (dayEq > 0 && ((dayEq - cur) / dayEq) * 100 >= p.dailyDdPct) {
          closeAll("daily_dd", px, ms, i);
          dailyStopped = true;
          break;
        }
      }

      if (!upside) {
        if (floating >= p.miniProfit) {
          closeAll("mini", px, ms, i);
          startCycle(px, ms, i);
          continue;
        }
        if (lastBuy != null && px <= lastBuy - p.gridStep && seq < BUY_LOT_SEQUENCE.length) {
          if (openBuy(px, BUY_LOT_SEQUENCE[seq])) {
            upside = true;
            trySell(px);
          }
        }
        continue;
      }

      if (floating >= p.basketTarget) {
        closeAll("basket", px, ms, i);
        startCycle(px, ms, i);
        continue;
      }
      if (seq >= BUY_LOT_SEQUENCE.length || lastBuy == null) continue;
      if (px <= lastBuy - p.gridStep) {
        if (openBuy(px, BUY_LOT_SEQUENCE[seq])) trySell(px);
      } else if (px >= lastBuy + p.gridStep) {
        if (openBuy(px, BUY_LOT_SEQUENCE[seq])) trySell(px);
      }
    }

    markEquity(c.close, ms);
  }

  // Downsample equity curve (~400 pts)
  const maxPts = 400;
  let equityCurve = curveRaw;
  if (curveRaw.length > maxPts) {
    const step = Math.ceil(curveRaw.length / maxPts);
    equityCurve = curveRaw.filter((_, i) => i % step === 0 || i === curveRaw.length - 1);
  }

  const lastPx = candles.length ? candles[candles.length - 1].close : 0;
  const unrealized = basketPnl(positions, lastPx);
  const finalEquity = equity + unrealized;

  return {
    trades,
    equityCurve,
    capital,
    finalEquity,
    maxDrawdownPct: maxDdPct,
    miniCloses,
    basketCloses,
    ddCloses,
    cycles,
    barsHeldSum,
    open: {
      buyCount: positions.filter((x) => x.side === "buy").length,
      sellCount: positions.filter((x) => x.side === "sell").length,
      lastBuy,
      initialBuy,
      upside,
      seq,
      unrealized,
      mark: lastPx,
    },
  };
}

/**
 * Closed-bar path preview: paints overlay levels + phase labels.
 */
export function replayBuyGridRecovery(candles: Candle[], params: Partial<BgrhParams> = {}): BgrhReplay {
  const p = { ...BGRH_DEFAULTS, ...params };
  const decorated = candles.map((c) => ({ ...c })) as Array<Candle & Record<string, number | undefined>>;
  if (decorated.length < 2) {
    return {
      candles: decorated as Candle[],
      phase: "flat",
      buyCount: 0,
      sellCount: 0,
      seqIndex: 0,
      lastBuy: null,
      initialBuy: null,
      upsideActive: false,
      cycles: 0,
      miniCloses: 0,
      basketCloses: 0,
      status: "Need history",
      detail: "Load candles to preview grid state.",
    };
  }

  const sim = simulate(candles, p);
  const { open } = sim;

  if (open.lastBuy != null) {
    for (const c of decorated) {
      c[BGRH_KEYS.lastBuy] = open.lastBuy;
      c[BGRH_KEYS.nextDown] = open.lastBuy - p.gridStep;
      if (open.upside) c[BGRH_KEYS.nextUp] = open.lastBuy + p.gridStep;
    }
  }

  const phase: BgrhPhase =
    open.buyCount + open.sellCount === 0 ? "flat" : open.upside ? "grid_active" : "waiting_downside";
  const status =
    phase === "flat"
      ? "NEW CYCLE"
      : phase === "waiting_downside"
        ? "WAITING FOR DOWNSIDE TRIGGER"
        : "GRID ACTIVE";
  const nextLot = open.seq < BUY_LOT_SEQUENCE.length ? BUY_LOT_SEQUENCE[open.seq] : null;
  const detail =
    phase === "waiting_downside"
      ? `Initial scalping Buy · mini TP $${p.miniProfit}. Upside grid OFF until −$${p.gridStep} from last Buy.`
      : phase === "grid_active"
        ? `Both-direction grid · next Buy lot ${nextLot ?? "exhausted"} · Sell hedge ${p.sellLot} · basket TP $${p.basketTarget}.`
        : `Ready for BUY ${p.initialLot}. MT5 EA file: mt5/BuyGridRecoveryHedge.mq5`;

  return {
    candles: decorated as Candle[],
    phase,
    buyCount: open.buyCount,
    sellCount: open.sellCount,
    seqIndex: open.seq,
    lastBuy: open.lastBuy,
    initialBuy: open.initialBuy,
    upsideActive: open.upside,
    cycles: sim.cycles,
    miniCloses: sim.miniCloses,
    basketCloses: sim.basketCloses,
    status,
    detail,
  };
}

function toBacktestResult(
  sim: SimResult,
  meta: { symbol: string; timeframe: string; daysRequested: number; candles: Candle[]; params: BgrhParams },
): BacktestResult {
  const { symbol, timeframe, daysRequested, candles, params } = meta;
  const wins = sim.trades.filter((t) => t.pnl > 0).length;
  const losses = sim.trades.filter((t) => t.pnl <= 0).length;
  const settled = wins + losses;
  const grossWin = sim.trades.reduce((a, t) => a + (t.pnl > 0 ? t.pnl : 0), 0);
  const grossLoss = sim.trades.reduce((a, t) => a + (t.pnl > 0 ? 0 : -t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : settled === 0 ? null : 999;
  const daysCovered = candlesSpanDays(candles);
  const returnPct = ((sim.finalEquity - sim.capital) / sim.capital) * 100;
  const first = candles[0]?.close ?? 0;
  const last = candles[candles.length - 1]?.close ?? 0;
  const buyHoldPct = first > 0 ? ((last - first) / first) * 100 : 0;

  const rs = sim.trades.map((t) => {
    // Synthetic R vs mini target (desk)
    const risk = Math.max(params.miniProfit, 0.01);
    return t.pnl / risk;
  });
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const bestR = rs.length ? Math.max(...rs) : 0;
  const worstR = rs.length ? Math.min(...rs) : 0;

  const inMarketBars = sim.trades.reduce((a, t) => a + (t.bars_held ?? 0), 0) + (sim.open.buyCount > 0 ? 1 : 0);
  const exposurePct = candles.length > 0 ? Math.min(100, (inMarketBars / candles.length) * 100) : 0;

  const trades: BacktestTrade[] = sim.trades.map(({ reason: _r, ...t }) => t);

  return {
    success: true,
    strategy: "buy-grid-recovery-hedge",
    symbol,
    timeframe,
    days_requested: daysRequested,
    days_covered: Math.round(daysCovered * 10) / 10,
    total_candles: candles.length,
    total_trades: trades.length,
    total_signals: sim.cycles,
    winning_trades: wins,
    losing_trades: losses,
    sl_hits: sim.ddCloses,
    target_hits: sim.miniCloses + sim.basketCloses,
    win_rate: settled > 0 ? Math.round((wins / settled) * 1000) / 10 : 0,
    total_profit: Math.round((sim.finalEquity - sim.capital) * 100) / 100,
    trades,
    capital: sim.capital,
    equity_curve: sim.equityCurve,
    open_position:
      sim.open.buyCount > 0 && sim.open.initialBuy != null
        ? {
            side: "buy",
            entry_time: trades.length ? trades[trades.length - 1].exit_time : candleMs(candles[0]?.time ?? 0),
            entry_price: sim.open.initialBuy,
            stop_loss: sim.open.lastBuy != null ? sim.open.lastBuy - params.gridStep : sim.open.initialBuy,
            initial_stop: sim.open.initialBuy - params.gridStep,
            quantity: BUY_LOT_SEQUENCE.slice(0, sim.open.seq).reduce((a, x) => a + x, 0) || params.initialLot,
            unrealized_pnl: Math.round(sim.open.unrealized * 100) / 100,
            mark_price: sim.open.mark,
          }
        : null,
    stats: {
      final_equity: Math.round(sim.finalEquity * 100) / 100,
      return_pct: Math.round(returnPct * 100) / 100,
      max_drawdown_pct: Math.round(sim.maxDrawdownPct * 100) / 100,
      profit_factor: profitFactor == null ? null : Math.round(profitFactor * 100) / 100,
      avg_r: Math.round(avgR * 100) / 100,
      best_r: Math.round(bestR * 100) / 100,
      worst_r: Math.round(worstR * 100) / 100,
      fees_paid: 0,
      funding_paid: 0,
      exposure_pct: Math.round(exposurePct * 10) / 10,
      buy_hold_pct: Math.round(buyHoldPct * 100) / 100,
    },
    rules: {
      stop_atr: params.gridStep,
      ema_fast: 0,
      ema_slow: 0,
      allow_shorts: true,
      channel: params.gridStep,
      exit_channel: params.basketTarget,
    },
    costs: { fee_pct_per_side: 0, slippage_pct_per_side: 0, long_funding_pct_per_8h: 0 },
  };
}

/** Client-side candle backtest — same path rules as chart preview. */
export async function runBgrhBacktest(values: Values): Promise<BacktestResult> {
  const symbol = strVal(values, "symbol", "BTCUSDT");
  const timeframe = strVal(values, "timeframe", "1h");
  const days = Math.max(1, Math.min(700, numVal(values, "days", 90)));
  const params = bgrhParamsFromValues(values);

  const limit = barsForDays(days, timeframe);
  const res = await fetchCandles({ symbol, interval: timeframe, limit });
  if (!res.success || !res.candles?.length) {
    return { success: false, error: res.error || "Could not load candles for backtest" };
  }

  const candles = res.candles;
  if (candles.length < 20) {
    return { success: false, error: "Need more candles — try a longer history window." };
  }

  const sim = simulate(candles, params);
  return toBacktestResult(sim, {
    symbol,
    timeframe,
    daysRequested: days,
    candles,
    params,
  });
}

export function isBgrhStrategy(id: string | undefined): boolean {
  return id === "buy-grid-recovery-hedge";
}
