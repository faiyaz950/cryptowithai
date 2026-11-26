/**
 * Applied strategy ki asli haalat — "abhi BUY chal raha hai ya SELL, kab aur kahan se khula,
 * kab band hua". Teen source milate hain:
 *  - Execution (browser runner) — Strateo ne jo order lagaya, asli fill price ke saath.
 *  - StrategyBot (server runner) — backend worker ki khuli position.
 *  - StrateoStats — strategy ka apna signal (backtest), jab order na laga ho.
 * User ki asli position pehle; signal sirf tab jab order nahi laga — aur saaf likha ho kyun.
 */
import { intervalMinutes, type StrategyBot } from "@/lib/cryptoApi";
import { num, type StrategyDef } from "@/lib/strategies";
import {
  costUsd,
  executionPnl,
  isOptionsStrategy,
  isResearchOnly,
  netOfCosts,
  signalKey,
  strateoValues,
  type AppliedStrategy,
  type Execution,
  type StrateoStats,
  type StrateoTrade,
} from "@/lib/strateo";

export type PositionState =
  /** Strateo ka order laga hai — asli position khuli. */
  | "open"
  /** Server bot abhi order laga raha hai. */
  | "entering"
  /** Strategy trade mein hai, par is account par order nahi laga. */
  | "signal"
  /** Koi trade nahi — agli entry ka intezaar. */
  | "flat"
  | "loading"
  /** Is coin par strategy nahi chalti. */
  | "error";

/** Signal par order kyun nahi laga. */
export type NotPlacedWhy =
  /** Trade apply karne se pehle khula — Strateo sirf agli taaza entry leta hai. */
  | "before-apply"
  /** Options — Strateo legs ka order nahi lagata. */
  | "options"
  /** Research-only (grid EA) — Strateo trade nahi karta. */
  | "research"
  /** Apply par "Signals only" chuna — user khud lagaye. */
  | "signals-only"
  /** Strategy Auto par hai par Auto-trade master switch band. */
  | "auto-off"
  /** Auto-trade on tha par order nahi laga (fail / page band tha). */
  | "auto-missed"
  /** Server bot ne ye entry chhod di (ya abhi uthayi nahi). */
  | "server";

export interface StrateoPosition {
  key: string;
  row: AppliedStrategy;
  def: StrategyDef;
  stats: StrateoStats | undefined;
  state: PositionState;
  side: "long" | "short" | null;
  options: boolean;
  /** Options structure, jaise "Iron condor". */
  structure: string | null;
  /** Kahan se khula — asli fill, warna signal ka price (options par premium). */
  entry: number | null;
  /** Kab khula — order ka waqt, warna signal candle. */
  entryTime: number | null;
  stop: number | null;
  /** Options (buy call / put): yahan aadha book hota hai; `target` par baaki. */
  tp1: number | null;
  target: number | null;
  qty: number | null;
  mark: number | null;
  /** Entry se abhi tak, side ke hisaab se (bina leverage), fees + slippage ke baad. Options par premium ka. */
  pct: number | null;
  /** Asli order par $ P&L, fees ke baad (andaaza). */
  usd: number | null;
  premium: boolean;
  exec: Execution | null;
  bot: StrategyBot | null;
  why: NotPlacedWhy | null;
  /** Strategy ka abhi khula trade (model). */
  signal: StrateoTrade | null;
  /** Aakhri band trade (strategy ke hisaab se). */
  lastClosed: StrateoTrade | null;
}

function move(side: "long" | "short", entry: number | null, mark: number | null): number | null {
  if (!entry || !mark || !(entry > 0) || !(mark > 0)) return null;
  return ((side === "long" ? 1 : -1) * (mark - entry) * 100) / entry;
}

/** Coin trade ka % fees + slippage ke baad. */
function netMove(side: "long" | "short", entry: number | null, mark: number | null): number | null {
  const m = move(side, entry, mark);
  return m == null ? null : netOfCosts(m);
}

/** Ek-leg options — inke SL / target premium par lagte hain. Spread / condor ke niyam alag. */
const SINGLE_LEG = new Set(["Buy call", "Buy put"]);

export interface PremiumLevels {
  /** Premium yahan aaya to poora band. */
  stop: number;
  /** Yahan aadha book. TP1 ≥ final ho to null — backend bhi tab book nahi karta. */
  tp1: number | null;
  /** Baaki aadha yahan. */
  target: number;
  /** Settings ke % — card par "SL −40%" likhne ke liye. */
  slPct: number;
  tp1Pct: number | null;
  targetPct: number;
}

/**
 * Buy call / put ka SL aur target, premium par. Backend trade ke saath ye levels nahi bhejta, par
 * options_backtest.simulate yahi formula lagata hai: SL = entry × (1 − SL%), aadha entry × (1 + TP1%),
 * baaki entry × (1 + final%). Strateo hamesha strategy ki default settings se chalta hai
 * (strateoValues), isliye wahi values.
 */
export function premiumLevels(
  def: StrategyDef,
  symbol: string,
  structure: string | null | undefined,
  entry: number | null,
): PremiumLevels | null {
  if (!structure || !SINGLE_LEG.has(structure) || entry == null || !(entry > 0)) return null;
  const values = strateoValues(def, symbol);
  const slPct = num(values, "sl_premium_pct");
  const tp1Pct = num(values, "tp1_pct");
  const targetPct = num(values, "tp2_pct");
  if (!(slPct > 0) || !(targetPct > 0)) return null;
  const book = tp1Pct > 0 && tp1Pct < targetPct;
  return {
    stop: entry * (1 - slPct / 100),
    tp1: book ? entry * (1 + tp1Pct / 100) : null,
    target: entry * (1 + targetPct / 100),
    slPct,
    tp1Pct: book ? tp1Pct : null,
    targetPct,
  };
}

export function buildPosition(opts: {
  row: AppliedStrategy;
  def: StrategyDef;
  stats: StrateoStats | undefined;
  executions: Execution[];
  bots: StrategyBot[];
  /** Chart wale coin ka live price — doosre coin par null (stats ka mark lete hain). */
  livePrice: number | null;
  /** Auto-trade master switch (aur trade gate) on hai. */
  autoMaster: boolean;
}): StrateoPosition {
  const { row, def, stats, executions, bots, livePrice, autoMaster } = opts;
  const options = isOptionsStrategy(def);
  const ok = stats && !stats.error ? stats : null;
  const signal = ok?.open ?? null;
  const lastClosed = ok ? [...ok.trades].reverse().find((t) => !t.open) ?? null : null;
  const coinMark = livePrice ?? ok?.lastPrice ?? null;
  const exec =
    executions
      .filter((e) => e.strategyId === row.id && e.symbol === row.symbol && !e.closed)
      .sort((a, b) => b.at - a.at)[0] ?? null;
  const bot = row.botId ? bots.find((b) => b.id === row.botId) ?? null : null;

  const base: StrateoPosition = {
    key: `${row.id}|${row.symbol}`,
    row,
    def,
    stats,
    state: "flat",
    side: null,
    options,
    structure: signal?.structure ?? null,
    entry: null,
    entryTime: null,
    stop: null,
    tp1: null,
    target: null,
    qty: null,
    mark: null,
    pct: null,
    usd: null,
    premium: false,
    exec,
    bot,
    why: null,
    signal,
    lastClosed,
  };

  if (exec) {
    return {
      ...base,
      state: "open",
      side: exec.side,
      entry: exec.entry,
      entryTime: exec.at,
      stop: exec.stop,
      target: exec.target,
      qty: exec.qty,
      mark: coinMark,
      pct: netMove(exec.side, exec.entry, coinMark),
      usd: coinMark ? executionPnl(exec, coinMark) : null,
    };
  }

  if (bot && bot.trade_state === "open" && (bot.side === "long" || bot.side === "short")) {
    const pct = netMove(bot.side, bot.entry_price, coinMark);
    return {
      ...base,
      state: "open",
      side: bot.side,
      entry: bot.entry_price,
      entryTime: bot.entry_time,
      stop: bot.stop_loss,
      target: bot.tp1_done ? null : bot.tp1_price,
      qty: bot.quantity,
      mark: coinMark,
      pct,
      usd:
        coinMark && bot.entry_price && bot.quantity
          ? (bot.side === "short" ? -1 : 1) * (coinMark - bot.entry_price) * bot.quantity -
            costUsd(bot.entry_price, bot.quantity)
          : null,
    };
  }

  if (bot && bot.trade_state === "entering") {
    const side = bot.side === "long" || bot.side === "short" ? bot.side : signal?.side ?? null;
    return { ...base, state: "entering", side, entry: signal?.entry ?? null, entryTime: bot.entry_time ?? signal?.entryTime ?? null };
  }

  if (!stats) return { ...base, state: "loading" };
  if (stats.error) return { ...base, state: "error" };

  if (signal) {
    const barMs = intervalMinutes(row.timeframe) * 60_000;
    // Monitor sirf apply ke baad wali entry par order lagata hai — usse pehle khula trade "pichhla" hai.
    const fresh = signal.entryTime + barMs > row.appliedAt;
    const why: NotPlacedWhy = options
      ? "options"
      : isResearchOnly(def)
        ? "research"
        : // "Signals only" par order kabhi nahi lagta — apply se pehle ho ya baad, wajah yahi hai.
          row.auto === false && row.runner !== "server"
          ? "signals-only"
          : !fresh
            ? "before-apply"
            : row.runner === "server"
              ? "server"
              : !autoMaster
                ? "auto-off"
                : "auto-missed";
    // Options par entry premium hai — coin price se % galat hota; strategy wala % lo.
    const premium = Boolean(signal.premium);
    const mark = premium || signal.basket ? signal.exit : coinMark;
    const lv = premiumLevels(def, row.symbol, signal.structure, signal.entry);
    return {
      ...base,
      state: "signal",
      side: signal.side,
      entry: signal.entry,
      entryTime: signal.entryTime,
      stop: lv ? lv.stop : signal.stop,
      tp1: lv?.tp1 ?? null,
      target: lv ? lv.target : signal.target,
      mark,
      pct: premium || signal.basket ? signal.pct : netMove(signal.side, signal.entry, mark),
      premium,
      why,
    };
  }

  return base;
}

/* ── History — har trade ek row: kab / kahan khula, kab / kahan band ── */

export type HistoryStatus =
  /** Strateo ne order lagaya. */
  | "placed"
  /** Apply ke baad aaya, order nahi laga. */
  | "signal"
  /** Server bot ka trade (bot log mein detail). */
  | "server"
  /** Apply se pehle — sirf strategy ka record. */
  | "before";

export interface HistoryRow {
  key: string;
  side: "long" | "short";
  structure: string | null;
  entryTime: number;
  exitTime: number | null;
  entry: number;
  exit: number | null;
  /** Fees + slippage ke baad (options par premium ka, bina fees). */
  pct: number;
  /** Fees se pehle — target ka asli size. */
  gross: number;
  outcome: StrateoTrade["outcome"];
  open: boolean;
  premium: boolean;
  /** Grid basket — pct basket ka P&L, fees alag nahi. */
  basket: boolean;
  /** Options: aadha TP1 par book, baaki baad mein band — pct poore trade ka. */
  partial: boolean;
  status: HistoryStatus;
  exec: Execution | null;
  /** Strateo ne band kiya to wajah — "Target hit" / "SL hit" / "Strategy exit". */
  closedReason: string | null;
  /** Trade ka stop-loss (options par premium ka). */
  stop: number | null;
  /** Options (buy call / put): yahan aadha book hua / hota. */
  tp1: number | null;
  /** Target — options par baaki aadhe ka final target. */
  target: number | null;
  /** Options ke SL / target settings ke % ("SL −40%"); coin trade par null. */
  levelPcts: { stop: number; tp1: number | null; target: number } | null;
}

/**
 * Trade history ki Result line aur chart ka exit label — ek hi lafz.
 * Alag likhne se chart "SL Hit" bolta tha aur bagal "Target hit".
 */
export function historyResultLabel(r: Pick<HistoryRow, "open" | "closedReason" | "partial" | "outcome">): string {
  if (r.open) return "Running";
  if (r.closedReason) return r.closedReason;
  if (r.partial && r.outcome === "stop") return "TP1, then SL";
  if (r.partial && r.outcome === "exit") return "TP1, then exit";
  switch (r.outcome) {
    case "target":
      return "Target hit";
    case "stop":
      return "SL hit";
    case "trail":
      return "Trail stop";
    case "exit":
      return "Strategy exit";
    default:
      return "Running";
  }
}

/**
 * Kaunse level chhue — senior ka sawaal "algo target tak ruka ya beech mein nikal gaya". Result se:
 * "TP1, then SL" = Target 1 aur SL dono; "Target hit" (options) = pehle Target 1, phir final.
 */
export function levelHits(
  r: Pick<HistoryRow, "open" | "outcome" | "partial" | "closedReason" | "tp1">,
): { stop: boolean; tp1: boolean; target: boolean } {
  if (r.open) return { stop: false, tp1: false, target: false };
  const outcome =
    r.closedReason === "SL hit" ? "stop" : r.closedReason === "Target hit" ? "target" : r.closedReason ? "exit" : r.outcome;
  return {
    stop: outcome === "stop",
    tp1: r.tp1 != null && (r.partial || outcome === "target"),
    target: outcome === "target",
  };
}

export function positionHistory(pos: StrateoPosition, executions: Execution[]): HistoryRow[] {
  const { row, stats } = pos;
  const trades = stats && !stats.error ? stats.trades : [];
  const mine = executions.filter((e) => e.strategyId === row.id && e.symbol === row.symbol);
  const byKey = new Map(mine.map((e) => [e.key, e]));
  const used = new Set<string>();
  const barMs = intervalMinutes(row.timeframe) * 60_000;
  const out: HistoryRow[] = [];

  for (const t of trades) {
    const key = signalKey(row.id, row.symbol, t.entryTime);
    const exec = byKey.get(key) ?? null;
    if (exec) used.add(key);
    const after = t.entryTime + barMs > row.appliedAt;
    const status: HistoryStatus = exec ? "placed" : !after ? "before" : row.runner === "server" ? "server" : "signal";
    // Asli order ho to uske apne price / waqt — strategy ke candle wale nahi. Server bot ka
    // abhi khula trade bhi bot ke fill par.
    const closed = exec?.closed;
    const botFill =
      !exec && t.open && pos.bot?.trade_state === "open" && pos.bot.entry_time === t.entryTime ? pos.bot.entry_price : null;
    const entry = exec ? exec.entry : botFill ?? t.entry;
    const exit = closed ? closed.price : t.open ? (pos.mark ?? t.exit) : t.exit;
    const live = (exec || t.open) && !t.premium && !t.basket ? move(t.side, entry, exit) : null;
    const gross = live ?? t.gross;
    const pct = live != null ? netOfCosts(live) : t.pct;
    const lv = premiumLevels(pos.def, row.symbol, t.structure, entry);
    out.push({
      key,
      side: t.side,
      structure: t.structure ?? null,
      entryTime: exec ? exec.at : t.entryTime,
      exitTime: closed ? closed.at : t.open ? null : t.exitTime,
      entry,
      exit,
      pct,
      gross,
      outcome: closed ? "exit" : t.outcome,
      open: closed ? false : t.open,
      premium: Boolean(t.premium),
      basket: Boolean(t.basket),
      partial: Boolean(t.partial) && !closed,
      status,
      exec,
      closedReason: closed?.reason ?? null,
      stop: lv ? lv.stop : (exec?.stop ?? t.stop),
      tp1: lv?.tp1 ?? null,
      target: lv ? lv.target : (exec?.target ?? t.target),
      levelPcts: lv ? { stop: -lv.slPct, tp1: lv.tp1Pct, target: lv.targetPct } : null,
    });
  }

  // Strateo ke order jinka trade ab backtest window mein nahi (purane ya signal palat gaya).
  for (const e of mine) {
    if (used.has(e.key)) continue;
    const exit = e.closed ? e.closed.price : pos.mark;
    const gross = move(e.side, e.entry, exit) ?? 0;
    out.push({
      key: e.key,
      side: e.side,
      structure: null,
      entryTime: e.at,
      exitTime: e.closed?.at ?? null,
      entry: e.entry,
      exit,
      pct: netOfCosts(gross),
      gross,
      outcome: e.closed ? "exit" : "open",
      open: !e.closed,
      premium: false,
      basket: false,
      partial: false,
      status: "placed",
      exec: e,
      closedReason: e.closed?.reason ?? null,
      stop: e.stop,
      tp1: null,
      target: e.target,
      levelPcts: null,
    });
  }

  return out.sort((a, b) => b.entryTime - a.entryTime);
}

/** "42m", "5h 12m", "3d 4h" — position kitni der se khuli. */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** BUY / SELL — user isi zubaan mein sochta hai; options par structure. */
export function sideName(side: "long" | "short" | null, structure?: string | null): string {
  if (structure) return structure.toUpperCase();
  return side === "short" ? "SELL" : "BUY";
}

const SHORT_STRUCTURE: Record<string, string> = {
  "Iron condor": "CONDOR",
  "Bull call spread": "BULL CALL",
  "Bear put spread": "BEAR PUT",
  "Buy call": "CALL",
  "Buy put": "PUT",
};

/** Tang jagah (timeline, dock) ke liye — "IRON CONDOR" ki jagah "CONDOR". */
export function sideShort(side: "long" | "short" | null, structure?: string | null): string {
  if (structure) return SHORT_STRUCTURE[structure] ?? "OPTIONS";
  return side === "short" ? "SELL" : "BUY";
}
