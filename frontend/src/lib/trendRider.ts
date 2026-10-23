import type { Candle } from "./cryptoApi";
import { atr, ema } from "./indicators";

/**
 * Trend Rider ka client-side replay — `backend/trading/trend_rider.py` ka mirror.
 * Backtest, live signal aur paper auto-trader teeno isi rule par chalte hain, isliye
 * yahan kuch badlo to backend file bhi saath badlo.
 *
 * Sirf BAND candles par signal banta hai. Chalu candle sirf chart lines ke liye hai —
 * uspar signal dene se breakout candle band hone se pehle hi "repaint" ho jaata.
 */

export interface TrendRiderParams {
  channel: number;
  exitChannel: number;
  stopAtr: number;
  allowShorts: boolean;
  emaFast: number;
  emaSlow: number;
  /** Steady: entry se itne R aage pehla profit (null/0 = band). */
  tp1R?: number | null;
  /** Steady: pehle profit par kitna hissa book (0–1). */
  tp1Frac?: number;
}

export const TREND_RIDER_DEFAULTS: TrendRiderParams = {
  channel: 30,
  exitChannel: 15,
  stopAtr: 2,
  allowShorts: true,
  emaFast: 50,
  emaSlow: 200,
};

/** Backend jaisa — entry par slippage ke baad bhi stop sahi taraf ho tabhi trade. */
const SLIPPAGE = 0.0002;
/** Delta taker + GST — Steady ka breakeven stop dono taraf ki fees cover karta hai. */
const FEE_RATE = 0.0005 * 1.18;
/** Backend ki tarah risk ke hisaab se size, par notional capital ke 3x se upar nahi. */
export const TREND_RIDER_MAX_LEVERAGE = 3;

export type TrendSide = "long" | "short";

export interface TrendRiderPosition {
  side: TrendSide;
  /** Entry candle ka open time (ms). */
  entryTime: number;
  entryPrice: number;
  /** Abhi lagu stop — agli candle par isi se exit. */
  stop: number;
  initialStop: number;
  /** Steady: pehle profit ka level (null = Steady band). */
  tp1Price: number | null;
  tp1Done: boolean;
}

export interface TrendRiderTrade {
  side: TrendSide;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  initialStop: number;
  status: "SL_HIT" | "TRAILING_STOP";
  tp1Hit: boolean;
}

/** Aakhri band candle par signal aaya — entry chalu candle ke open par. */
export interface TrendRiderPending {
  side: TrendSide;
  entryTime: number;
  /** Chalu candle ka open, agar chalu candle aa chuki hai. */
  entryPrice: number | null;
  stop: number;
  /** Steady: open pata ho to pehle profit ka level. */
  tp1Price: number | null;
}

export interface TrendRiderReplay {
  /** Har candle (chalu bhi) par chart lines. */
  candles: Candle[];
  trades: TrendRiderTrade[];
  position: TrendRiderPosition | null;
  pending: TrendRiderPending | null;
  /** Aakhri band candle ka index; -1 = koi band candle nahi. */
  lastClosed: number;
  upper: number | null;
  lower: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  atr: number | null;
  regime: "bull" | "bear" | "neutral";
}

export const TREND_KEYS = {
  upper: "tr_upper",
  lower: "tr_lower",
  stop: "tr_stop",
} as const;

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function replayTrendRider(
  candles: Candle[],
  params: TrendRiderParams,
  intervalMs: number,
  nowMs: number = Date.now(),
): TrendRiderReplay {
  const n = candles.length;
  const o = candles.map((c) => c.open);
  const h = candles.map((c) => c.high);
  const l = candles.map((c) => c.low);
  const c = candles.map((x) => x.close);

  const a = atr(candles, 14);
  const eFast = ema(c, params.emaFast);
  const eSlow = ema(c, params.emaSlow);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  const trailLong: (number | null)[] = new Array(n).fill(null);
  const trailShort: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= params.channel) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - params.channel; j < i; j++) {
        if (h[j] > hi) hi = h[j];
        if (l[j] < lo) lo = l[j];
      }
      upper[i] = hi;
      lower[i] = lo;
    }
    if (i >= params.exitChannel - 1) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = i - params.exitChannel + 1; j <= i; j++) {
        if (l[j] < lo) lo = l[j];
        if (h[j] > hi) hi = h[j];
      }
      trailLong[i] = lo;
      trailShort[i] = hi;
    }
  }

  const signal = (k: number): TrendSide | null => {
    const ak = a[k];
    const up = upper[k];
    const dn = lower[k];
    if (!finite(ak) || !finite(up) || !finite(dn)) return null;
    if (c[k] > up && c[k] > eSlow[k]) return "long";
    if (params.allowShorts && c[k] < dn && c[k] < eSlow[k] && eFast[k] < eSlow[k]) return "short";
    return null;
  };

  let lastClosed = n - 1;
  while (lastClosed >= 0 && candles[lastClosed].time + intervalMs > nowMs) lastClosed--;

  // EMA slow ke settle hone tak trades nahi — backend bhi warmup ke baad hi gin'ta hai.
  const start = Math.max(1, Math.min(params.emaSlow + 10, lastClosed));
  const stopDuring: (number | null)[] = new Array(n).fill(null);
  const trades: TrendRiderTrade[] = [];
  let pos: TrendRiderPosition | null = null;
  // Slippage ke baad wala fill — backend tp1 aur breakeven isi se nikalta hai.
  let fill = 0;

  const tp1R = params.tp1R || 0;
  const tp1Frac = params.tp1Frac ?? 0;
  const steady = tp1R > 0 && tp1Frac > 0 && tp1Frac < 1;
  // entry + d·tp1R·risk, jahan risk = d·(entry − stop) — dono d milkar kat jaate hain.
  const tp1From = (filled: number, stop: number) => filled + tp1R * (filled - stop);

  for (let i = start; i <= lastClosed; i++) {
    const k = i - 1;
    if (!pos) {
      const side = signal(k);
      const ak = a[k];
      if (side && finite(ak)) {
        const d = side === "long" ? 1 : -1;
        const stop = c[k] - d * params.stopAtr * ak;
        const filled = o[i] * (1 + d * SLIPPAGE);
        if (d * (filled - stop) > 0) {
          fill = filled;
          pos = {
            side,
            entryTime: candles[i].time,
            entryPrice: o[i],
            stop,
            initialStop: stop,
            tp1Price: steady ? tp1From(filled, stop) : null,
            tp1Done: false,
          };
        }
      }
    }
    if (!pos) continue;

    const d = pos.side === "long" ? 1 : -1;
    stopDuring[i] = pos.stop;
    const gapped = d > 0 ? o[i] <= pos.stop : o[i] >= pos.stop;
    const touched = d > 0 ? l[i] <= pos.stop : h[i] >= pos.stop;
    if (gapped || touched) {
      const moved = d > 0 ? pos.stop > pos.initialStop : pos.stop < pos.initialStop;
      trades.push({
        side: pos.side,
        entryTime: pos.entryTime,
        exitTime: candles[i].time,
        entryPrice: pos.entryPrice,
        exitPrice: gapped ? o[i] : pos.stop,
        initialStop: pos.initialStop,
        status: moved ? "TRAILING_STOP" : "SL_HIT",
        tp1Hit: pos.tp1Done,
      });
      pos = null;
      continue;
    }
    // Steady: stop ke baad dekha (backend jaisa) — pehla profit book, stop entry + fees par.
    if (pos.tp1Price != null && !pos.tp1Done && (d > 0 ? h[i] >= pos.tp1Price : l[i] <= pos.tp1Price)) {
      pos.tp1Done = true;
      const be = fill * (1 + d * 2 * (FEE_RATE + SLIPPAGE));
      pos.stop = d > 0 ? Math.max(pos.stop, be) : Math.min(pos.stop, be);
    }
    const tv = d > 0 ? trailLong[i] : trailShort[i];
    if (finite(tv)) pos.stop = d > 0 ? Math.max(pos.stop, tv) : Math.min(pos.stop, tv);
  }

  let pending: TrendRiderPending | null = null;
  if (!pos && lastClosed >= start - 1 && lastClosed >= 0) {
    const side = signal(lastClosed);
    const ak = a[lastClosed];
    if (side && finite(ak)) {
      const d = side === "long" ? 1 : -1;
      const forming = lastClosed + 1 < n ? candles[lastClosed + 1] : null;
      const stop = c[lastClosed] - d * params.stopAtr * ak;
      pending = {
        side,
        entryTime: candles[lastClosed].time + intervalMs,
        entryPrice: forming ? forming.open : null,
        stop,
        tp1Price: steady && forming ? tp1From(forming.open * (1 + d * SLIPPAGE), stop) : null,
      };
    }
  }

  // Chalu candle par abhi lagu stop dikhao (chal rahi position ya abhi bhari entry ka).
  const formingIdx = lastClosed + 1 < n ? lastClosed + 1 : -1;
  if (formingIdx >= 0) stopDuring[formingIdx] = pos?.stop ?? pending?.stop ?? null;

  const slowKey = `ema_${params.emaSlow}` as const;
  const decorated = candles.map((candle, i) => ({
    ...candle,
    [slowKey]: eSlow[i],
    [TREND_KEYS.upper]: upper[i],
    [TREND_KEYS.lower]: lower[i],
    [TREND_KEYS.stop]: stopDuring[i],
  })) as Candle[];

  const ref = lastClosed >= 0 ? lastClosed : n - 1;
  const ref1 = Math.min(ref + 1, n - 1);
  const slow = ref >= 0 ? eSlow[ref] : null;
  const fast = ref >= 0 ? eFast[ref] : null;
  const close = ref >= 0 ? c[ref] : null;
  let regime: TrendRiderReplay["regime"] = "neutral";
  if (finite(close) && finite(slow) && finite(fast)) {
    if (close > slow) regime = "bull";
    else if (fast < slow) regime = "bear";
  }

  return {
    candles: decorated,
    trades,
    position: pos,
    pending,
    lastClosed,
    // Agli band candle kis level ke paar jaaye to signal — chalu candle ka channel.
    upper: n ? upper[ref1] : null,
    lower: n ? lower[ref1] : null,
    emaFast: fast,
    emaSlow: slow,
    atr: ref >= 0 ? a[ref] : null,
    regime,
  };
}

/** Stop lagne par capital ka `riskPct`% hi jaaye — backend jaisa size, 3x notional cap. */
export function trendRiderQuantity(capital: number, riskPct: number, entry: number, stop: number): number {
  const dist = Math.abs(entry - stop);
  if (!(capital > 0) || !(entry > 0) || !(dist > 0)) return 0;
  return Math.min((capital * riskPct) / 100 / dist, (capital * TREND_RIDER_MAX_LEVERAGE) / entry);
}
