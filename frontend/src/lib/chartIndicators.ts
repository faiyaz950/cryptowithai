import type { Candle } from "@/lib/cryptoApi";

/**
 * Market chart ke indicators — sab browser mein, poori loaded history par.
 * Server wale EMA har page alag compute hote the, isliye peeche scroll karne
 * par page ki seam par line jhatka khaati thi. Yahan ek hi array par chalta hai.
 */

export type Num = number | null;
type Series = Num[];

export interface IndicatorParam {
  key: string;
  label: string;
  def: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface IndicatorOutput {
  key: string;
  label: string;
  color: string;
  /** line (default), histogram, ya sirf dots (Parabolic SAR jaisa). */
  type?: "line" | "histogram" | "dots";
  /** Histogram ka rang: 0 se upar/neeche (sign) ya pichhle bar se bada/chhota (rise). */
  histMode?: "sign" | "rise";
  width?: 1 | 2 | 3;
  dashed?: boolean;
}

export type IndicatorCategory = "Moving Averages" | "Bands & Channels" | "Trend" | "Momentum" | "Volatility" | "Volume" | "Price";

export interface IndicatorContext {
  /** Ek candle kitne minute ki hai — candles ke beech ke gap se nikaala. */
  barMinutes: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  short: string;
  category: IndicatorCategory;
  /** true = price ke neeche apne alag pane mein. */
  pane: boolean;
  params: IndicatorParam[];
  outputs: IndicatorOutput[];
  /** Pane mein dotted reference lines (RSI 70/30 jaisa). */
  levels?: number[];
  /** Fixed scale — RSI hamesha 0–100 dikhe, data ke hisaab se na khinche. */
  bounds?: [number, number];
  compute: (c: Candle[], p: Record<string, number>, ctx: IndicatorContext) => Series[];
}

export interface ActiveIndicator {
  uid: string;
  id: string;
  params: Record<string, number>;
  hidden?: boolean;
}

// ── Primitives ───────────────────────────────────────────

function filled(n: number): Series {
  return new Array<Num>(n).fill(null);
}

function sma(src: Series, n: number): Series {
  const out = filled(src.length);
  let sum = 0;
  let run = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v == null) {
      sum = 0;
      run = 0;
      continue;
    }
    sum += v;
    run++;
    if (run > n) sum -= src[i - n] as number;
    if (run >= n) out[i] = sum / n;
  }
  return out;
}

function smooth(src: Series, alpha: number, n: number): Series {
  const out = filled(src.length);
  let prev: number | null = null;
  let sum = 0;
  let run = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v == null) {
      prev = null;
      sum = 0;
      run = 0;
      continue;
    }
    if (prev == null) {
      sum += v;
      run++;
      if (run === n) {
        prev = sum / n;
        out[i] = prev;
      }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

const ema = (src: Series, n: number) => smooth(src, 2 / (n + 1), n);
/** Wilder ka smoothing (RSI, ATR, ADX). */
const rma = (src: Series, n: number) => smooth(src, 1 / n, n);

function wma(src: Series, n: number): Series {
  const out = filled(src.length);
  const denom = (n * (n + 1)) / 2;
  let run = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] == null) {
      run = 0;
      continue;
    }
    run++;
    if (run < n) continue;
    let acc = 0;
    for (let j = 0; j < n; j++) acc += (src[i - j] as number) * (n - j);
    out[i] = acc / denom;
  }
  return out;
}

function stdev(src: Series, n: number): Series {
  const out = filled(src.length);
  let sum = 0;
  let sq = 0;
  let run = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v == null) {
      sum = 0;
      sq = 0;
      run = 0;
      continue;
    }
    sum += v;
    sq += v * v;
    run++;
    if (run > n) {
      const old = src[i - n] as number;
      sum -= old;
      sq -= old * old;
    }
    if (run >= n) {
      const mean = sum / n;
      out[i] = Math.sqrt(Math.max(0, sq / n - mean * mean));
    }
  }
  return out;
}

function rollingSum(src: Series, n: number): Series {
  const out = filled(src.length);
  let sum = 0;
  let run = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v == null) {
      sum = 0;
      run = 0;
      continue;
    }
    sum += v;
    run++;
    if (run > n) sum -= src[i - n] as number;
    if (run >= n) out[i] = sum;
  }
  return out;
}

/** Monotonic deque — 52 week window 1m par bhi O(n). */
function rolling(src: number[], n: number, pickMax: boolean): Series {
  const out = filled(src.length);
  const dq: number[] = [];
  let head = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    while (dq.length > head && (pickMax ? src[dq[dq.length - 1]] <= v : src[dq[dq.length - 1]] >= v)) dq.pop();
    dq.push(i);
    if (dq[head] <= i - n) head++;
    if (i >= n - 1) out[i] = src[dq[head]];
  }
  return out;
}
const highest = (src: number[], n: number) => rolling(src, n, true);
const lowest = (src: number[], n: number) => rolling(src, n, false);

function map2(a: Series, b: Series, fn: (x: number, y: number) => number | null): Series {
  return a.map((x, i) => {
    const y = b[i];
    return x == null || y == null ? null : fn(x, y);
  });
}

function lag(src: Series, n: number): Series {
  return src.map((_, i) => (i >= n ? src[i - n] : null));
}

function cumulative(steps: number[]): Series {
  let acc = 0;
  return steps.map((s) => (acc += s));
}

function trueRange(c: Candle[]): number[] {
  return c.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const pc = c[i - 1].close;
    return Math.max(k.high - k.low, Math.abs(k.high - pc), Math.abs(k.low - pc));
  });
}

function rsiOf(src: Series, n: number): Series {
  const up: Series = src.map((v, i) => (i === 0 || v == null || src[i - 1] == null ? null : Math.max(0, v - (src[i - 1] as number))));
  const dn: Series = src.map((v, i) => (i === 0 || v == null || src[i - 1] == null ? null : Math.max(0, (src[i - 1] as number) - v)));
  return map2(rma(up, n), rma(dn, n), (u, d) => (d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d)));
}

function stochOf(src: Series, hi: Series, lo: Series, n: number): Series {
  const out = filled(src.length);
  for (let i = n - 1; i < src.length; i++) {
    let h = -Infinity;
    let l = Infinity;
    let ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      const hv = hi[j];
      const lv = lo[j];
      if (hv == null || lv == null) {
        ok = false;
        break;
      }
      if (hv > h) h = hv;
      if (lv < l) l = lv;
    }
    const v = src[i];
    if (!ok || v == null) continue;
    out[i] = h === l ? 50 : ((v - l) / (h - l)) * 100;
  }
  return out;
}

function dmi(c: Candle[], n: number, smoothing: number) {
  const plusDM: Series = c.map((k, i) => {
    if (i === 0) return null;
    const up = k.high - c[i - 1].high;
    const down = c[i - 1].low - k.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDM: Series = c.map((k, i) => {
    if (i === 0) return null;
    const up = k.high - c[i - 1].high;
    const down = c[i - 1].low - k.low;
    return down > up && down > 0 ? down : 0;
  });
  const tr = rma(trueRange(c).map((v, i) => (i === 0 ? null : v)), n);
  const plus = map2(rma(plusDM, n), tr, (a, t) => (t === 0 ? 0 : (100 * a) / t));
  const minus = map2(rma(minusDM, n), tr, (a, t) => (t === 0 ? 0 : (100 * a) / t));
  const dx = map2(plus, minus, (a, b) => (a + b === 0 ? 0 : (100 * Math.abs(a - b)) / (a + b)));
  return { plus, minus, adx: rma(dx, smoothing) };
}

const closes = (c: Candle[]): Series => c.map((k) => k.close);
const vols = (c: Candle[]) => c.map((k) => k.volume ?? 0);
const hl2 = (c: Candle[]): Series => c.map((k) => (k.high + k.low) / 2);
const hlc3 = (c: Candle[]): Series => c.map((k) => (k.high + k.low + k.close) / 3);

function roc(src: Series, n: number): Series {
  return map2(src, lag(src, n), (v, p) => (p === 0 ? null : (100 * (v - p)) / p));
}

function linreg(src: Series, n: number): Series {
  const out = filled(src.length);
  const sx = (n * (n - 1)) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const den = n * sxx - sx * sx;
  for (let i = n - 1; i < src.length; i++) {
    let sy = 0;
    let sxy = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const v = src[i - n + 1 + j];
      if (v == null) {
        ok = false;
        break;
      }
      sy += v;
      sxy += j * v;
    }
    if (!ok) continue;
    const slope = (n * sxy - sx * sy) / den;
    const icpt = (sy - slope * sx) / n;
    out[i] = icpt + slope * (n - 1);
  }
  return out;
}

// ── Palette ──────────────────────────────────────────────

const BLUE = "#60a5fa";
const AMBER = "#fbbf24";
const PURPLE = "#c084fc";
const PINK = "#f472b6";
const CYAN = "#22d3ee";
const GREEN = "#22c55e";
const RED = "#ef4444";
const ORANGE = "#fb923c";
const SLATE = "#94a3b8";

const len = (def: number, label = "Length"): IndicatorParam => ({ key: "length", label, def, min: 1, max: 500 });

function maDef(id: string, name: string, short: string, def: number, color: string, fn: (s: Series, n: number, c: Candle[]) => Series): IndicatorDef {
  return {
    id,
    name,
    short,
    category: "Moving Averages",
    pane: false,
    params: [len(def)],
    outputs: [{ key: "ma", label: short, color, width: 2 }],
    compute: (c, p) => [fn(closes(c), p.length, c)],
  };
}

// ── Library ──────────────────────────────────────────────

export const INDICATORS: IndicatorDef[] = [
  maDef("sma", "Moving Average Simple", "SMA", 20, BLUE, sma),
  maDef("ema", "Moving Average Exponential", "EMA", 21, AMBER, ema),
  maDef("wma", "Moving Average Weighted", "WMA", 20, PURPLE, wma),
  maDef("smma", "Smoothed Moving Average", "SMMA", 20, CYAN, rma),
  maDef("hma", "Hull Moving Average", "HMA", 20, PINK, (s, n) => {
    const half = wma(s, Math.max(1, Math.round(n / 2)));
    const full = wma(s, n);
    return wma(map2(half, full, (a, b) => 2 * a - b), Math.max(1, Math.round(Math.sqrt(n))));
  }),
  maDef("dema", "Double EMA", "DEMA", 20, ORANGE, (s, n) => {
    const e1 = ema(s, n);
    return map2(e1, ema(e1, n), (a, b) => 2 * a - b);
  }),
  maDef("tema", "Triple EMA", "TEMA", 20, GREEN, (s, n) => {
    const e1 = ema(s, n);
    const e2 = ema(e1, n);
    const e3 = ema(e2, n);
    return e1.map((a, i) => (a == null || e2[i] == null || e3[i] == null ? null : 3 * a - 3 * (e2[i] as number) + (e3[i] as number)));
  }),
  maDef("vwma", "Volume Weighted Moving Average", "VWMA", 20, CYAN, (s, n, c) => {
    const v = vols(c);
    return map2(rollingSum(s.map((x, i) => (x == null ? null : x * v[i])), n), rollingSum(v, n), (a, b) => (b === 0 ? null : a / b));
  }),
  maDef("lsma", "Least Squares Moving Average", "LSMA", 25, PINK, linreg),
  {
    id: "alma",
    name: "Arnaud Legoux Moving Average",
    short: "ALMA",
    category: "Moving Averages",
    pane: false,
    params: [len(9), { key: "offset", label: "Offset", def: 0.85, min: 0, max: 1, step: 0.05 }, { key: "sigma", label: "Sigma", def: 6, min: 1, max: 50 }],
    outputs: [{ key: "alma", label: "ALMA", color: BLUE, width: 2 }],
    compute: (c, p) => {
      const n = p.length;
      const m = p.offset * (n - 1);
      const s = n / p.sigma;
      const w = Array.from({ length: n }, (_, j) => Math.exp(-((j - m) ** 2) / (2 * s * s)));
      const wsum = w.reduce((a, b) => a + b, 0);
      const src = closes(c);
      return [src.map((_, i) => {
        if (i < n - 1) return null;
        let acc = 0;
        for (let j = 0; j < n; j++) acc += (src[i - n + 1 + j] as number) * w[j];
        return acc / wsum;
      })];
    },
  },
  {
    id: "macross",
    name: "MA Cross",
    short: "MA Cross",
    category: "Moving Averages",
    pane: false,
    params: [{ key: "fast", label: "Fast", def: 9, min: 1, max: 500 }, { key: "slow", label: "Slow", def: 21, min: 1, max: 500 }],
    outputs: [{ key: "fast", label: "Fast", color: GREEN, width: 2 }, { key: "slow", label: "Slow", color: RED, width: 2 }],
    compute: (c, p) => [sma(closes(c), p.fast), sma(closes(c), p.slow)],
  },

  {
    id: "bb",
    name: "Bollinger Bands",
    short: "BB",
    category: "Bands & Channels",
    pane: false,
    params: [len(20), { key: "mult", label: "StdDev", def: 2, min: 0.1, max: 10, step: 0.1 }],
    outputs: [
      { key: "basis", label: "Basis", color: ORANGE },
      { key: "upper", label: "Upper", color: BLUE },
      { key: "lower", label: "Lower", color: BLUE },
    ],
    compute: (c, p) => {
      const basis = sma(closes(c), p.length);
      const sd = stdev(closes(c), p.length);
      return [basis, map2(basis, sd, (b, d) => b + p.mult * d), map2(basis, sd, (b, d) => b - p.mult * d)];
    },
  },
  {
    id: "kc",
    name: "Keltner Channels",
    short: "KC",
    category: "Bands & Channels",
    pane: false,
    params: [len(20), { key: "mult", label: "Multiplier", def: 2, min: 0.1, max: 10, step: 0.1 }],
    outputs: [
      { key: "basis", label: "Basis", color: BLUE },
      { key: "upper", label: "Upper", color: CYAN },
      { key: "lower", label: "Lower", color: CYAN },
    ],
    compute: (c, p) => {
      const basis = ema(closes(c), p.length);
      const atr = rma(trueRange(c), p.length);
      return [basis, map2(basis, atr, (b, a) => b + p.mult * a), map2(basis, atr, (b, a) => b - p.mult * a)];
    },
  },
  {
    id: "dc",
    name: "Donchian Channels",
    short: "DC",
    category: "Bands & Channels",
    pane: false,
    params: [len(20)],
    outputs: [
      { key: "upper", label: "Upper", color: BLUE },
      { key: "basis", label: "Basis", color: ORANGE },
      { key: "lower", label: "Lower", color: BLUE },
    ],
    compute: (c, p) => {
      const up = highest(c.map((k) => k.high), p.length);
      const lo = lowest(c.map((k) => k.low), p.length);
      return [up, map2(up, lo, (a, b) => (a + b) / 2), lo];
    },
  },
  {
    id: "env",
    name: "Envelopes",
    short: "Env",
    category: "Bands & Channels",
    pane: false,
    params: [len(20), { key: "pct", label: "Percent", def: 2.5, min: 0.1, max: 50, step: 0.1 }],
    outputs: [
      { key: "basis", label: "Basis", color: ORANGE },
      { key: "upper", label: "Upper", color: BLUE },
      { key: "lower", label: "Lower", color: BLUE },
    ],
    compute: (c, p) => {
      const basis = sma(closes(c), p.length);
      return [basis, basis.map((b) => (b == null ? null : b * (1 + p.pct / 100))), basis.map((b) => (b == null ? null : b * (1 - p.pct / 100)))];
    },
  },
  {
    id: "vwap",
    name: "VWAP (Daily)",
    short: "VWAP",
    category: "Volume",
    pane: false,
    params: [],
    outputs: [{ key: "vwap", label: "VWAP", color: PINK, width: 2 }],
    compute: (c) => {
      let day = -1;
      let pv = 0;
      let vv = 0;
      return [c.map((k) => {
        const d = Math.floor(k.time / 86_400_000);
        if (d !== day) {
          day = d;
          pv = 0;
          vv = 0;
        }
        const v = k.volume ?? 0;
        pv += ((k.high + k.low + k.close) / 3) * v;
        vv += v;
        return vv === 0 ? null : pv / vv;
      })];
    },
  },

  {
    id: "psar",
    name: "Parabolic SAR",
    short: "SAR",
    category: "Trend",
    pane: false,
    params: [
      { key: "start", label: "Start", def: 0.02, min: 0.001, max: 1, step: 0.001 },
      { key: "inc", label: "Increment", def: 0.02, min: 0.001, max: 1, step: 0.001 },
      { key: "max", label: "Max", def: 0.2, min: 0.01, max: 1, step: 0.01 },
    ],
    outputs: [{ key: "sar", label: "SAR", color: SLATE, type: "dots" }],
    compute: (c, p) => {
      const out = filled(c.length);
      if (c.length < 2) return [out];
      let long = c[1].close >= c[0].close;
      let af = p.start;
      let ep = long ? c[0].high : c[0].low;
      let sar = long ? c[0].low : c[0].high;
      for (let i = 1; i < c.length; i++) {
        sar = sar + af * (ep - sar);
        if (long) {
          sar = Math.min(sar, c[i - 1].low, i > 1 ? c[i - 2].low : c[i - 1].low);
          if (c[i].low < sar) {
            long = false;
            sar = ep;
            ep = c[i].low;
            af = p.start;
          } else if (c[i].high > ep) {
            ep = c[i].high;
            af = Math.min(p.max, af + p.inc);
          }
        } else {
          sar = Math.max(sar, c[i - 1].high, i > 1 ? c[i - 2].high : c[i - 1].high);
          if (c[i].high > sar) {
            long = true;
            sar = ep;
            ep = c[i].high;
            af = p.start;
          } else if (c[i].low < ep) {
            ep = c[i].low;
            af = Math.min(p.max, af + p.inc);
          }
        }
        out[i] = sar;
      }
      return [out];
    },
  },
  {
    id: "supertrend",
    name: "Supertrend",
    short: "Supertrend",
    category: "Trend",
    pane: false,
    params: [{ key: "atr", label: "ATR Length", def: 10, min: 1, max: 200 }, { key: "factor", label: "Factor", def: 3, min: 0.1, max: 20, step: 0.1 }],
    outputs: [{ key: "up", label: "Up", color: GREEN, width: 2 }, { key: "down", label: "Down", color: RED, width: 2 }],
    compute: (c, p) => {
      const atr = rma(trueRange(c), p.atr);
      const up = filled(c.length);
      const down = filled(c.length);
      let finalUp = 0;
      let finalDn = 0;
      let trend = 1;
      let started = false;
      for (let i = 0; i < c.length; i++) {
        const a = atr[i];
        if (a == null) continue;
        const mid = (c[i].high + c[i].low) / 2;
        const bu = mid - p.factor * a;
        const bd = mid + p.factor * a;
        if (!started) {
          finalUp = bu;
          finalDn = bd;
          started = true;
        } else {
          const pc = c[i - 1].close;
          finalUp = pc > finalUp ? Math.max(bu, finalUp) : bu;
          finalDn = pc < finalDn ? Math.min(bd, finalDn) : bd;
        }
        if (trend === -1 && c[i].close > finalDn) trend = 1;
        else if (trend === 1 && c[i].close < finalUp) trend = -1;
        if (trend === 1) up[i] = finalUp;
        else down[i] = finalDn;
      }
      return [up, down];
    },
  },
  {
    id: "ichimoku",
    name: "Ichimoku Cloud",
    short: "Ichimoku",
    category: "Trend",
    pane: false,
    params: [
      { key: "conv", label: "Conversion", def: 9, min: 1, max: 200 },
      { key: "base", label: "Base", def: 26, min: 1, max: 200 },
      { key: "spanB", label: "Span B", def: 52, min: 1, max: 400 },
      { key: "disp", label: "Displacement", def: 26, min: 1, max: 200 },
    ],
    outputs: [
      { key: "conv", label: "Conv", color: BLUE },
      { key: "base", label: "Base", color: RED },
      { key: "spanA", label: "Span A", color: GREEN },
      { key: "spanB", label: "Span B", color: ORANGE },
      { key: "lag", label: "Lagging", color: PURPLE },
    ],
    compute: (c, p) => {
      const hi = c.map((k) => k.high);
      const lo = c.map((k) => k.low);
      const mid = (n: number) => map2(highest(hi, n), lowest(lo, n), (a, b) => (a + b) / 2);
      const conv = mid(p.conv);
      const base = mid(p.base);
      const spanA = lag(map2(conv, base, (a, b) => (a + b) / 2), p.disp - 1);
      const spanB = lag(mid(p.spanB), p.disp - 1);
      const lagging = c.map((_, i) => (i + p.disp - 1 < c.length ? c[i + p.disp - 1].close : null));
      return [conv, base, spanA, spanB, lagging];
    },
  },
  {
    id: "hl52",
    name: "52 Week High/Low",
    short: "52W H/L",
    category: "Price",
    pane: false,
    params: [],
    outputs: [{ key: "high", label: "High", color: GREEN, dashed: true }, { key: "low", label: "Low", color: RED, dashed: true }],
    compute: (c, _p, ctx) => {
      const n = Math.max(1, Math.round((52 * 7 * 1440) / ctx.barMinutes));
      const w = Math.min(n, c.length);
      const hi = rolling(c.map((k) => k.high), w, true);
      const lo = rolling(c.map((k) => k.low), w, false);
      // Itni history na ho to jitni hai utne ka high/low — line shuru se dikhe.
      let h = -Infinity;
      let l = Infinity;
      for (let i = 0; i < w - 1 && i < c.length; i++) {
        h = Math.max(h, c[i].high);
        l = Math.min(l, c[i].low);
        hi[i] = h;
        lo[i] = l;
      }
      return [hi, lo];
    },
  },
  {
    id: "avgprice",
    name: "Average Price",
    short: "OHLC4",
    category: "Price",
    pane: false,
    params: [],
    outputs: [{ key: "v", label: "OHLC4", color: SLATE }],
    compute: (c) => [c.map((k) => (k.open + k.high + k.low + k.close) / 4)],
  },
  {
    id: "medprice",
    name: "Median Price",
    short: "HL2",
    category: "Price",
    pane: false,
    params: [],
    outputs: [{ key: "v", label: "HL2", color: SLATE }],
    compute: (c) => [hl2(c)],
  },
  {
    id: "typprice",
    name: "Typical Price",
    short: "HLC3",
    category: "Price",
    pane: false,
    params: [],
    outputs: [{ key: "v", label: "HLC3", color: SLATE }],
    compute: (c) => [hlc3(c)],
  },

  {
    id: "rsi",
    name: "Relative Strength Index",
    short: "RSI",
    category: "Momentum",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "rsi", label: "RSI", color: PURPLE, width: 2 }],
    levels: [70, 30],
    bounds: [0, 100],
    compute: (c, p) => [rsiOf(closes(c), p.length)],
  },
  {
    id: "macd",
    name: "MACD",
    short: "MACD",
    category: "Momentum",
    pane: true,
    params: [
      { key: "fast", label: "Fast", def: 12, min: 1, max: 200 },
      { key: "slow", label: "Slow", def: 26, min: 1, max: 400 },
      { key: "signal", label: "Signal", def: 9, min: 1, max: 200 },
    ],
    outputs: [
      { key: "hist", label: "Hist", color: GREEN, type: "histogram", histMode: "sign" },
      { key: "macd", label: "MACD", color: BLUE, width: 2 },
      { key: "signal", label: "Signal", color: ORANGE, width: 2 },
    ],
    levels: [0],
    compute: (c, p) => {
      const macd = map2(ema(closes(c), p.fast), ema(closes(c), p.slow), (a, b) => a - b);
      const signal = ema(macd, p.signal);
      return [map2(macd, signal, (a, b) => a - b), macd, signal];
    },
  },
  {
    id: "stoch",
    name: "Stochastic",
    short: "Stoch",
    category: "Momentum",
    pane: true,
    params: [
      { key: "k", label: "%K Length", def: 14, min: 1, max: 200 },
      { key: "smooth", label: "%K Smoothing", def: 1, min: 1, max: 50 },
      { key: "d", label: "%D Smoothing", def: 3, min: 1, max: 50 },
    ],
    outputs: [{ key: "k", label: "%K", color: BLUE, width: 2 }, { key: "d", label: "%D", color: ORANGE }],
    levels: [80, 20],
    bounds: [0, 100],
    compute: (c, p) => {
      const raw = stochOf(closes(c), c.map((k) => k.high), c.map((k) => k.low), p.k);
      const k = sma(raw, p.smooth);
      return [k, sma(k, p.d)];
    },
  },
  {
    id: "stochrsi",
    name: "Stochastic RSI",
    short: "Stoch RSI",
    category: "Momentum",
    pane: true,
    params: [
      { key: "rsi", label: "RSI Length", def: 14, min: 1, max: 200 },
      { key: "stoch", label: "Stoch Length", def: 14, min: 1, max: 200 },
      { key: "k", label: "K", def: 3, min: 1, max: 50 },
      { key: "d", label: "D", def: 3, min: 1, max: 50 },
    ],
    outputs: [{ key: "k", label: "K", color: BLUE, width: 2 }, { key: "d", label: "D", color: ORANGE }],
    levels: [80, 20],
    bounds: [0, 100],
    compute: (c, p) => {
      const r = rsiOf(closes(c), p.rsi);
      const k = sma(stochOf(r, r, r, p.stoch), p.k);
      return [k, sma(k, p.d)];
    },
  },
  {
    id: "cci",
    name: "Commodity Channel Index",
    short: "CCI",
    category: "Momentum",
    pane: true,
    params: [len(20)],
    outputs: [{ key: "cci", label: "CCI", color: CYAN, width: 2 }],
    levels: [100, -100],
    compute: (c, p) => {
      const tp = hlc3(c);
      const mean = sma(tp, p.length);
      const n = p.length;
      return [tp.map((v, i) => {
        const m = mean[i];
        if (v == null || m == null) return null;
        let dev = 0;
        for (let j = i - n + 1; j <= i; j++) dev += Math.abs((tp[j] as number) - m);
        dev /= n;
        return dev === 0 ? 0 : (v - m) / (0.015 * dev);
      })];
    },
  },
  {
    id: "willr",
    name: "Williams %R",
    short: "%R",
    category: "Momentum",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "r", label: "%R", color: PURPLE, width: 2 }],
    levels: [-20, -80],
    bounds: [-100, 0],
    compute: (c, p) => [stochOf(closes(c), c.map((k) => k.high), c.map((k) => k.low), p.length).map((v) => (v == null ? null : v - 100))],
  },
  {
    id: "adx",
    name: "Average Directional Index",
    short: "ADX",
    category: "Trend",
    pane: true,
    params: [{ key: "di", label: "DI Length", def: 14, min: 1, max: 200 }, { key: "smooth", label: "ADX Smoothing", def: 14, min: 1, max: 200 }],
    outputs: [
      { key: "adx", label: "ADX", color: RED, width: 2 },
      { key: "plus", label: "+DI", color: GREEN },
      { key: "minus", label: "-DI", color: ORANGE },
    ],
    levels: [25],
    compute: (c, p) => {
      const d = dmi(c, p.di, p.smooth);
      return [d.adx, d.plus, d.minus];
    },
  },
  {
    id: "aroon",
    name: "Aroon",
    short: "Aroon",
    category: "Trend",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "up", label: "Up", color: GREEN, width: 2 }, { key: "down", label: "Down", color: RED, width: 2 }],
    bounds: [0, 100],
    compute: (c, p) => {
      const n = p.length;
      const up = filled(c.length);
      const down = filled(c.length);
      for (let i = n; i < c.length; i++) {
        let hi = i;
        let lo = i;
        for (let j = i - n; j <= i; j++) {
          if (c[j].high >= c[hi].high) hi = j;
          if (c[j].low <= c[lo].low) lo = j;
        }
        up[i] = (100 * (n - (i - hi))) / n;
        down[i] = (100 * (n - (i - lo))) / n;
      }
      return [up, down];
    },
  },
  {
    id: "mom",
    name: "Momentum",
    short: "Mom",
    category: "Momentum",
    pane: true,
    params: [len(10)],
    outputs: [{ key: "mom", label: "Mom", color: BLUE, width: 2 }],
    levels: [0],
    compute: (c, p) => [map2(closes(c), lag(closes(c), p.length), (a, b) => a - b)],
  },
  {
    id: "roc",
    name: "Rate Of Change",
    short: "ROC",
    category: "Momentum",
    pane: true,
    params: [len(9)],
    outputs: [{ key: "roc", label: "ROC", color: BLUE, width: 2 }],
    levels: [0],
    compute: (c, p) => [roc(closes(c), p.length)],
  },
  {
    id: "ao",
    name: "Awesome Oscillator",
    short: "AO",
    category: "Momentum",
    pane: true,
    params: [],
    outputs: [{ key: "ao", label: "AO", color: GREEN, type: "histogram", histMode: "rise" }],
    compute: (c) => [map2(sma(hl2(c), 5), sma(hl2(c), 34), (a, b) => a - b)],
  },
  {
    id: "ac",
    name: "Accelerator Oscillator",
    short: "AC",
    category: "Momentum",
    pane: true,
    params: [],
    outputs: [{ key: "ac", label: "AC", color: GREEN, type: "histogram", histMode: "rise" }],
    compute: (c) => {
      const ao = map2(sma(hl2(c), 5), sma(hl2(c), 34), (a, b) => a - b);
      return [map2(ao, sma(ao, 5), (a, b) => a - b)];
    },
  },
  {
    id: "trix",
    name: "TRIX",
    short: "TRIX",
    category: "Momentum",
    pane: true,
    params: [len(18)],
    outputs: [{ key: "trix", label: "TRIX", color: RED, width: 2 }],
    levels: [0],
    compute: (c, p) => {
      const t = ema(ema(ema(c.map((k) => Math.log(k.close)), p.length), p.length), p.length);
      return [map2(t, lag(t, 1), (a, b) => 10000 * (a - b))];
    },
  },
  {
    id: "uo",
    name: "Ultimate Oscillator",
    short: "UO",
    category: "Momentum",
    pane: true,
    params: [
      { key: "fast", label: "Fast", def: 7, min: 1, max: 100 },
      { key: "mid", label: "Middle", def: 14, min: 1, max: 200 },
      { key: "slow", label: "Slow", def: 28, min: 1, max: 400 },
    ],
    outputs: [{ key: "uo", label: "UO", color: PINK, width: 2 }],
    levels: [70, 30],
    bounds: [0, 100],
    compute: (c, p) => {
      const bp: Series = c.map((k, i) => (i === 0 ? null : k.close - Math.min(k.low, c[i - 1].close)));
      const tr: Series = trueRange(c).map((v, i) => (i === 0 ? null : v));
      const avg = (n: number) => map2(rollingSum(bp, n), rollingSum(tr, n), (a, b) => (b === 0 ? 0 : a / b));
      const a1 = avg(p.fast);
      const a2 = avg(p.mid);
      const a3 = avg(p.slow);
      return [a1.map((x, i) => (x == null || a2[i] == null || a3[i] == null ? null : (100 * (4 * x + 2 * (a2[i] as number) + (a3[i] as number))) / 7))];
    },
  },
  {
    id: "cmo",
    name: "Chande Momentum Oscillator",
    short: "CMO",
    category: "Momentum",
    pane: true,
    params: [len(9)],
    outputs: [{ key: "cmo", label: "CMO", color: BLUE, width: 2 }],
    levels: [50, -50],
    bounds: [-100, 100],
    compute: (c, p) => {
      const ch: Series = c.map((k, i) => (i === 0 ? null : k.close - c[i - 1].close));
      const up = rollingSum(ch.map((v) => (v == null ? null : Math.max(0, v))), p.length);
      const dn = rollingSum(ch.map((v) => (v == null ? null : Math.max(0, -v))), p.length);
      return [map2(up, dn, (u, d) => (u + d === 0 ? 0 : (100 * (u - d)) / (u + d)))];
    },
  },
  {
    id: "tsi",
    name: "True Strength Index",
    short: "TSI",
    category: "Momentum",
    pane: true,
    params: [
      { key: "long", label: "Long", def: 25, min: 1, max: 200 },
      { key: "short", label: "Short", def: 13, min: 1, max: 200 },
      { key: "signal", label: "Signal", def: 13, min: 1, max: 200 },
    ],
    outputs: [{ key: "tsi", label: "TSI", color: BLUE, width: 2 }, { key: "signal", label: "Signal", color: RED }],
    levels: [0],
    compute: (c, p) => {
      const ch: Series = c.map((k, i) => (i === 0 ? null : k.close - c[i - 1].close));
      const num = ema(ema(ch, p.long), p.short);
      const den = ema(ema(ch.map((v) => (v == null ? null : Math.abs(v))), p.long), p.short);
      const tsi = map2(num, den, (a, b) => (b === 0 ? 0 : (100 * a) / b));
      return [tsi, ema(tsi, p.signal)];
    },
  },
  {
    id: "coppock",
    name: "Coppock Curve",
    short: "Coppock",
    category: "Momentum",
    pane: true,
    params: [{ key: "wma", label: "WMA Length", def: 10, min: 1, max: 200 }, { key: "long", label: "Long ROC", def: 14, min: 1, max: 200 }, { key: "short", label: "Short ROC", def: 11, min: 1, max: 200 }],
    outputs: [{ key: "c", label: "Coppock", color: BLUE, width: 2 }],
    levels: [0],
    compute: (c, p) => [wma(map2(roc(closes(c), p.long), roc(closes(c), p.short), (a, b) => a + b), p.wma)],
  },
  {
    id: "dpo",
    name: "Detrended Price Oscillator",
    short: "DPO",
    category: "Momentum",
    pane: true,
    params: [len(21)],
    outputs: [{ key: "dpo", label: "DPO", color: GREEN, width: 2 }],
    levels: [0],
    compute: (c, p) => [map2(closes(c), lag(sma(closes(c), p.length), Math.floor(p.length / 2) + 1), (a, b) => a - b)],
  },
  {
    id: "bbp",
    name: "Bull Bear Power",
    short: "BBP",
    category: "Momentum",
    pane: true,
    params: [len(13)],
    outputs: [{ key: "bbp", label: "BBP", color: GREEN, type: "histogram", histMode: "sign" }],
    compute: (c, p) => {
      const e = ema(closes(c), p.length);
      return [c.map((k, i) => (e[i] == null ? null : k.high - (e[i] as number) + (k.low - (e[i] as number))))];
    },
  },
  {
    id: "bop",
    name: "Balance of Power",
    short: "BOP",
    category: "Momentum",
    pane: true,
    params: [],
    outputs: [{ key: "bop", label: "BOP", color: RED, width: 2 }],
    levels: [0],
    bounds: [-1, 1],
    compute: (c) => [c.map((k) => (k.high === k.low ? 0 : (k.close - k.open) / (k.high - k.low)))],
  },

  {
    id: "atr",
    name: "Average True Range",
    short: "ATR",
    category: "Volatility",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "atr", label: "ATR", color: RED, width: 2 }],
    compute: (c, p) => [rma(trueRange(c), p.length)],
  },
  {
    id: "stdev",
    name: "Standard Deviation",
    short: "StdDev",
    category: "Volatility",
    pane: true,
    params: [len(20)],
    outputs: [{ key: "sd", label: "StdDev", color: BLUE, width: 2 }],
    compute: (c, p) => [stdev(closes(c), p.length)],
  },
  {
    id: "hv",
    name: "Historical Volatility",
    short: "HV",
    category: "Volatility",
    pane: true,
    params: [len(10)],
    outputs: [{ key: "hv", label: "HV", color: CYAN, width: 2 }],
    compute: (c, p, ctx) => {
      const lr: Series = c.map((k, i) => (i === 0 || c[i - 1].close <= 0 ? null : Math.log(k.close / c[i - 1].close)));
      const perYear = (365 * 1440) / ctx.barMinutes;
      return [stdev(lr, p.length).map((v) => (v == null ? null : 100 * v * Math.sqrt(perYear)))];
    },
  },
  {
    id: "bbw",
    name: "Bollinger Bands Width",
    short: "BBW",
    category: "Volatility",
    pane: true,
    params: [len(20), { key: "mult", label: "StdDev", def: 2, min: 0.1, max: 10, step: 0.1 }],
    outputs: [{ key: "w", label: "BBW", color: BLUE, width: 2 }],
    compute: (c, p) => [map2(sma(closes(c), p.length), stdev(closes(c), p.length), (b, d) => (b === 0 ? null : (2 * p.mult * d) / b))],
  },
  {
    id: "chop",
    name: "Choppiness Index",
    short: "CHOP",
    category: "Volatility",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "chop", label: "CHOP", color: AMBER, width: 2 }],
    levels: [61.8, 38.2],
    bounds: [0, 100],
    compute: (c, p) => {
      const n = p.length;
      const sumTr = rollingSum(trueRange(c), n);
      const hh = highest(c.map((k) => k.high), n);
      const ll = lowest(c.map((k) => k.low), n);
      return [sumTr.map((s, i) => {
        const range = hh[i] != null && ll[i] != null ? (hh[i] as number) - (ll[i] as number) : 0;
        return s == null || range <= 0 ? null : (100 * Math.log10(s / range)) / Math.log10(n);
      })];
    },
  },

  {
    id: "obv",
    name: "On Balance Volume",
    short: "OBV",
    category: "Volume",
    pane: true,
    params: [],
    outputs: [{ key: "obv", label: "OBV", color: BLUE, width: 2 }],
    compute: (c) => [cumulative(c.map((k, i) => (i === 0 ? 0 : Math.sign(k.close - c[i - 1].close) * (k.volume ?? 0))))],
  },
  {
    id: "ad",
    name: "Accumulation/Distribution",
    short: "A/D",
    category: "Volume",
    pane: true,
    params: [],
    outputs: [{ key: "ad", label: "A/D", color: AMBER, width: 2 }],
    compute: (c) => [cumulative(c.map((k) => (k.high === k.low ? 0 : (((k.close - k.low) - (k.high - k.close)) / (k.high - k.low)) * (k.volume ?? 0))))],
  },
  {
    id: "pvt",
    name: "Price Volume Trend",
    short: "PVT",
    category: "Volume",
    pane: true,
    params: [],
    outputs: [{ key: "pvt", label: "PVT", color: CYAN, width: 2 }],
    compute: (c) => [cumulative(c.map((k, i) => (i === 0 || c[i - 1].close === 0 ? 0 : ((k.close - c[i - 1].close) / c[i - 1].close) * (k.volume ?? 0))))],
  },
  {
    id: "cmf",
    name: "Chaikin Money Flow",
    short: "CMF",
    category: "Volume",
    pane: true,
    params: [len(20)],
    outputs: [{ key: "cmf", label: "CMF", color: GREEN, width: 2 }],
    levels: [0],
    compute: (c, p) => {
      const mfv: Series = c.map((k) => (k.high === k.low ? 0 : (((k.close - k.low) - (k.high - k.close)) / (k.high - k.low)) * (k.volume ?? 0)));
      return [map2(rollingSum(mfv, p.length), rollingSum(vols(c), p.length), (a, b) => (b === 0 ? 0 : a / b))];
    },
  },
  {
    id: "mfi",
    name: "Money Flow Index",
    short: "MFI",
    category: "Volume",
    pane: true,
    params: [len(14)],
    outputs: [{ key: "mfi", label: "MFI", color: PURPLE, width: 2 }],
    levels: [80, 20],
    bounds: [0, 100],
    compute: (c, p) => {
      const tp = hlc3(c) as number[];
      const pos: Series = c.map((k, i) => (i === 0 ? null : tp[i] > tp[i - 1] ? tp[i] * (k.volume ?? 0) : 0));
      const neg: Series = c.map((k, i) => (i === 0 ? null : tp[i] < tp[i - 1] ? tp[i] * (k.volume ?? 0) : 0));
      return [map2(rollingSum(pos, p.length), rollingSum(neg, p.length), (a, b) => (b === 0 ? 100 : 100 - 100 / (1 + a / b)))];
    },
  },
  {
    id: "efi",
    name: "Elder Force Index",
    short: "EFI",
    category: "Volume",
    pane: true,
    params: [len(13)],
    outputs: [{ key: "efi", label: "EFI", color: RED, width: 2 }],
    levels: [0],
    compute: (c, p) => [ema(c.map((k, i) => (i === 0 ? null : (k.close - c[i - 1].close) * (k.volume ?? 0))), p.length)],
  },
  {
    id: "vo",
    name: "Volume Oscillator",
    short: "Vol Osc",
    category: "Volume",
    pane: true,
    params: [{ key: "short", label: "Short", def: 5, min: 1, max: 200 }, { key: "long", label: "Long", def: 10, min: 1, max: 400 }],
    outputs: [{ key: "vo", label: "Vol Osc", color: BLUE, width: 2 }],
    levels: [0],
    compute: (c, p) => [map2(ema(vols(c), p.short), ema(vols(c), p.long), (a, b) => (b === 0 ? 0 : (100 * (a - b)) / b))],
  },
];

export const INDICATOR_BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

/** Volume alag series hai (har chart ke saath) — list mein toggle ki tarah dikhta hai. */
export const VOLUME_ID = "volume";

export const DEFAULT_INDICATORS: ActiveIndicator[] = [
  { uid: "ema-9", id: "ema", params: { length: 9 } },
  { uid: "ema-21", id: "ema", params: { length: 21 } },
  { uid: "ema-50", id: "ema", params: { length: 50 } },
];

/** Ek hi indicator do baar lage (EMA 9 aur EMA 21) to rang alag ho. */
const REPEAT_COLORS = [BLUE, AMBER, PURPLE, PINK, CYAN, GREEN, ORANGE, RED];

export function outputColor(ind: ActiveIndicator, outIndex: number, all: ActiveIndicator[]): string {
  const def = INDICATOR_BY_ID.get(ind.id);
  if (!def) return SLATE;
  if (def.outputs.length > 1) return def.outputs[outIndex]?.color ?? SLATE;
  const same = all.filter((a) => a.id === ind.id);
  if (same.length <= 1) return def.outputs[0].color;
  return REPEAT_COLORS[same.indexOf(ind) % REPEAT_COLORS.length];
}

export function defaultParams(def: IndicatorDef): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.def]));
}

export function indicatorTitle(ind: ActiveIndicator): string {
  const def = INDICATOR_BY_ID.get(ind.id);
  if (!def) return ind.id;
  const vals = def.params.map((p) => ind.params[p.key] ?? p.def);
  return vals.length ? `${def.short} ${vals.join(" ")}` : def.short;
}

export function barMinutesOf(c: Candle[]): number {
  if (c.length < 3) return 60;
  const gaps: number[] = [];
  for (let i = Math.max(1, c.length - 50); i < c.length; i++) gaps.push(c[i].time - c[i - 1].time);
  gaps.sort((a, b) => a - b);
  return Math.max(1, gaps[Math.floor(gaps.length / 2)] / 60_000);
}

export function computeIndicator(ind: ActiveIndicator, candles: Candle[], ctx: IndicatorContext): Series[] {
  const def = INDICATOR_BY_ID.get(ind.id);
  if (!def || !candles.length) return [];
  const params = { ...defaultParams(def), ...ind.params };
  try {
    return def.compute(candles, params, ctx);
  } catch {
    return def.outputs.map(() => filled(candles.length));
  }
}
