import type { Candle } from "./cryptoApi";
import { atr, ema } from "./indicators";

/**
 * Trident Momentum ka client-side replay — `backend/trading/trident.py` ka mirror.
 * Live signal, chart lines aur backtest/server bot ek hi rule par rahein, isliye yahan kuch
 * badlo to backend file bhi saath badlo.
 *
 * Har horizon ek "vote" hai: close us horizon pehle ke close se upar (+1) ya neeche (−1).
 * Teeno +1 = LONG, teeno −1 (aur bear regime) = SHORT. Teen mein se do palat jaayein to exit.
 * Sirf BAND candles par signal — chalu candle sirf chart lines ke liye.
 */

export interface TridentParams {
  /** Chhota → lamba, candles mein (4h par 30/90/180 = 5/15/30 din). */
  horizons: [number, number, number];
  stopAtr: number;
  allowShorts: boolean;
  emaFast: number;
  emaSlow: number;
}

export const TRIDENT_DEFAULTS: TridentParams = {
  horizons: [30, 90, 180],
  stopAtr: 2.5,
  allowShorts: true,
  emaFast: 50,
  emaSlow: 200,
};

/** Backend jaisa — entry/exit par slippage. */
const SLIPPAGE = 0.0002;

export type TridentSide = "long" | "short";

export interface TridentPosition {
  side: TridentSide;
  /** Entry candle ka open time (ms). */
  entryTime: number;
  entryPrice: number;
  /** Trident stop trail nahi karti — poore trade mein initial stop hi. */
  stop: number;
}

export interface TridentTrade {
  side: TridentSide;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stop: number;
  status: "SL_HIT" | "MOMENTUM_EXIT";
}

export interface TridentPending {
  side: TridentSide;
  entryTime: number;
  /** Chalu candle ka open, agar chalu candle aa chuki hai. */
  entryPrice: number | null;
  stop: number;
}

export interface TridentReplay {
  candles: Candle[];
  trades: TridentTrade[];
  /** Replay mein chalu trade — `exiting` ho to chalu candle ke open par band ho chuka (backtest jaisa). */
  position: TridentPosition | null;
  /** Aakhri band candle par momentum toota — position chalu candle ke open par band. */
  exiting: boolean;
  pending: TridentPending | null;
  lastClosed: number;
  /** Aakhri band candle par har horizon ka vote (+1 / −1 / 0), chhote se lambe. */
  votes: (number | null)[];
  score: number | null;
  /** Agli band candle in teeno ke upar ho to har vote "upar" — chalu candle ke reference levels. */
  refs: (number | null)[];
  emaFast: number | null;
  emaSlow: number | null;
  atr: number | null;
  /** Shorts sirf "bear" mein (EMA fast < slow). */
  regime: "bear" | "other";
}

export const TRIDENT_KEYS = {
  ref: ["td_ref1", "td_ref2", "td_ref3"],
  stop: "td_stop",
} as const;

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validHorizons(h: readonly number[]): boolean {
  return h.length === 3 && h[0] >= 5 && h[0] < h[1] && h[1] < h[2] && h[2] <= 400;
}

export function replayTrident(
  candles: Candle[],
  params: TridentParams,
  intervalMs: number,
  nowMs: number = Date.now(),
): TridentReplay {
  const n = candles.length;
  const o = candles.map((x) => x.open);
  const h = candles.map((x) => x.high);
  const l = candles.map((x) => x.low);
  const c = candles.map((x) => x.close);
  const a = atr(candles, 14);
  const eFast = ema(c, params.emaFast);
  const eSlow = ema(c, params.emaSlow);
  const [h1, h2, h3] = params.horizons;

  const vote = (i: number, k: number): number | null => (i - k >= 0 ? Math.sign(c[i] - c[i - k]) : null);
  const score: (number | null)[] = c.map((_, i) => {
    const v = [vote(i, h1), vote(i, h2), vote(i, h3)];
    return v.some((x) => x == null) ? null : (v as number[]).reduce((s, x) => s + x, 0) / 3;
  });

  const signal = (k: number): TridentSide | null => {
    const s = score[k];
    if (!finite(s) || !finite(a[k])) return null;
    const prev = k > 0 ? score[k - 1] : null;
    if (s >= 1 && !(finite(prev) && prev >= 1)) return "long";
    if (params.allowShorts && s <= -1 && !(finite(prev) && prev <= -1) && eFast[k] < eSlow[k]) return "short";
    return null;
  };
  const exitFlag = (k: number, side: TridentSide): boolean => {
    const s = score[k];
    return finite(s) && (side === "long" ? s <= 0 : s >= 0);
  };

  let lastClosed = n - 1;
  while (lastClosed >= 0 && candles[lastClosed].time + intervalMs > nowMs) lastClosed--;

  // Horizon aur EMA slow bharne tak trades nahi — backend `min_bars` jaisa.
  const start = Math.max(1, Math.min(Math.max(h3, params.emaSlow) + 10, lastClosed));
  const stopDuring: (number | null)[] = new Array(n).fill(null);
  const trades: TridentTrade[] = [];
  let pos: TridentPosition | null = null;

  const close = (i: number, px: number, status: TridentTrade["status"]) => {
    if (!pos) return;
    trades.push({ side: pos.side, entryTime: pos.entryTime, exitTime: candles[i].time, entryPrice: pos.entryPrice, exitPrice: px, stop: pos.stop, status });
    pos = null;
  };

  for (let i = start; i <= lastClosed; i++) {
    const k = i - 1;
    // Momentum pichhli band candle par toota — is candle ke open par band.
    if (pos && exitFlag(k, pos.side)) close(i, o[i], "MOMENTUM_EXIT");
    if (!pos) {
      const side = signal(k);
      const ak = a[k];
      if (side && finite(ak)) {
        const d = side === "long" ? 1 : -1;
        const stop = c[k] - d * params.stopAtr * ak;
        if (d * (o[i] * (1 + d * SLIPPAGE) - stop) > 0) {
          pos = { side, entryTime: candles[i].time, entryPrice: o[i], stop };
        }
      }
    }
    if (!pos) continue;
    const p: TridentPosition = pos;
    const d = p.side === "long" ? 1 : -1;
    stopDuring[i] = p.stop;
    if (d > 0 ? o[i] <= p.stop : o[i] >= p.stop) close(i, o[i], "SL_HIT");
    else if (d > 0 ? l[i] <= p.stop : h[i] >= p.stop) close(i, p.stop, "SL_HIT");
  }

  const current = pos as TridentPosition | null;
  const exiting = current != null && lastClosed >= 0 && exitFlag(lastClosed, current.side);
  let pending: TridentPending | null = null;
  if ((!current || exiting) && lastClosed >= start - 1 && lastClosed >= 0) {
    const side = signal(lastClosed);
    const ak = a[lastClosed];
    if (side && finite(ak)) {
      const d = side === "long" ? 1 : -1;
      const forming = lastClosed + 1 < n ? candles[lastClosed + 1] : null;
      pending = {
        side,
        entryTime: candles[lastClosed].time + intervalMs,
        entryPrice: forming ? forming.open : null,
        stop: c[lastClosed] - d * params.stopAtr * ak,
      };
    }
  }

  const formingIdx = lastClosed + 1 < n ? lastClosed + 1 : -1;
  if (formingIdx >= 0) stopDuring[formingIdx] = (exiting ? null : current?.stop) ?? pending?.stop ?? null;

  const slowKey = `ema_${params.emaSlow}` as const;
  // Candle i par horizon wala reference = i − horizon candle pehle ka close.
  const refAt = (i: number, k: number) => (i - k >= 0 ? c[i - k] : null);
  const decorated = candles.map((candle, i) => ({
    ...candle,
    [slowKey]: eSlow[i],
    [TRIDENT_KEYS.ref[0]]: refAt(i, h1),
    [TRIDENT_KEYS.ref[1]]: refAt(i, h2),
    [TRIDENT_KEYS.ref[2]]: refAt(i, h3),
    [TRIDENT_KEYS.stop]: stopDuring[i],
  })) as Candle[];

  const ref = lastClosed >= 0 ? lastClosed : n - 1;
  // Agli band candle (chalu wali) kis level ke upar/neeche band ho — uske apne reference.
  const next = Math.min(ref + 1, n);
  return {
    candles: decorated,
    trades,
    position: current,
    exiting,
    pending,
    lastClosed,
    votes: ref >= 0 ? [vote(ref, h1), vote(ref, h2), vote(ref, h3)] : [null, null, null],
    score: ref >= 0 ? score[ref] : null,
    refs: [refAt(next, h1), refAt(next, h2), refAt(next, h3)],
    emaFast: ref >= 0 ? eFast[ref] : null,
    emaSlow: ref >= 0 ? eSlow[ref] : null,
    atr: ref >= 0 ? a[ref] : null,
    regime: ref >= 0 && eFast[ref] < eSlow[ref] ? "bear" : "other",
  };
}
