/**
 * Client-side indicator math.
 *
 * Ye backend (`backend/trading/backend_api.py`) ke `calculate_ema` / `calculate_rsi`
 * ka exact mirror hai — EMA = pandas `ewm(span, adjust=False)`, RSI = gains/losses
 * ka simple rolling mean (Wilder smoothing nahi). Formula same rehna zaroori hai,
 * warna strategy page ka live signal aur backend ka backtest alag jawab denge.
 */

/** `ewm(span=period, adjust=False)` — pehli value se seed, isliye har index par value milti hai. */
export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  if (period <= 1) return values.slice();
  const alpha = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
  }
  return out;
}

/**
 * RSI — pehle `period` bars par null (rolling window abhi bhara nahi).
 * Flat window (na gain na loss) par backend NaN deta hai, isliye yahan null.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (period <= 0 || values.length <= period) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let j = 0; j < gains.length; j++) {
    gainSum += gains[j];
    lossSum += losses[j];
    if (j >= period) {
      gainSum -= gains[j - period];
      lossSum -= losses[j - period];
    }
    if (j < period - 1) continue;

    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    // gains[j] ka source candle values[j + 1] hai.
    if (avgGain === 0 && avgLoss === 0) continue;
    out[j + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdPoint {
  macd: number;
  signal: number;
  hist: number;
}

/** MACD = EMA(fast) − EMA(slow), signal = uska EMA, histogram = dono ka fark. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line = values.map((_, i) => fastLine[i] - slowLine[i]);
  const signal = ema(line, signalPeriod);
  return line.map((m, i) => ({ macd: m, signal: signal[i], hist: m - signal[i] }));
}

export type CrossDirection = "up" | "down" | null;

/** `a` ne `b` ko is bar par cross kiya ya nahi. */
export function crossDirection(
  aPrev: number | null | undefined,
  aNow: number | null | undefined,
  bPrev: number | null | undefined,
  bNow: number | null | undefined,
): CrossDirection {
  if (aPrev == null || aNow == null || bPrev == null || bNow == null) return null;
  if (aPrev <= bPrev && aNow > bNow) return "up";
  if (aPrev >= bPrev && aNow < bNow) return "down";
  return null;
}

export interface Pivot {
  index: number;
  value: number;
}

/**
 * Swing points — ek bar tab pivot hai jab uske dono taraf `span` bars usse chhote
 * (high ke liye) ya bade (low ke liye) hon. Divergence detect karne ke liye chahiye.
 */
export function pivots(values: (number | null)[], span: number, kind: "high" | "low"): Pivot[] {
  const found: Pivot[] = [];
  for (let i = span; i < values.length - span; i++) {
    const value = values[i];
    if (value == null) continue;
    let isPivot = true;
    for (let k = i - span; k <= i + span && isPivot; k++) {
      if (k === i) continue;
      const other = values[k];
      if (other == null) { isPivot = false; break; }
      isPivot = kind === "high" ? other <= value : other >= value;
    }
    if (isPivot) found.push({ index: i, value });
  }
  return found;
}

export type Divergence = "bullish" | "bearish" | null;

/**
 * Classic RSI divergence: price naya high banaye par RSI na banaye = bearish,
 * price naya low banaye par RSI na banaye = bullish. Sirf aakhri do swings dekhte hain.
 */
export function findDivergence(
  highs: number[],
  lows: number[],
  rsiValues: (number | null)[],
  span = 3,
  maxAgeBars = 40,
): { type: Divergence; barsAgo: number } {
  const lastIndex = rsiValues.length - 1;

  const highPivots = pivots(highs, span, "high").filter((p) => rsiValues[p.index] != null);
  if (highPivots.length >= 2) {
    const [prev, last] = highPivots.slice(-2);
    const rsiPrev = rsiValues[prev.index] as number;
    const rsiLast = rsiValues[last.index] as number;
    if (last.value > prev.value && rsiLast < rsiPrev && lastIndex - last.index <= maxAgeBars) {
      return { type: "bearish", barsAgo: lastIndex - last.index };
    }
  }

  const lowPivots = pivots(lows, span, "low").filter((p) => rsiValues[p.index] != null);
  if (lowPivots.length >= 2) {
    const [prev, last] = lowPivots.slice(-2);
    const rsiPrev = rsiValues[prev.index] as number;
    const rsiLast = rsiValues[last.index] as number;
    if (last.value < prev.value && rsiLast > rsiPrev && lastIndex - last.index <= maxAgeBars) {
      return { type: "bullish", barsAgo: lastIndex - last.index };
    }
  }

  return { type: null, barsAgo: 0 };
}

/* ── Multi-timeframe aur trend-strength indicators ─────────
   Ye "OTM Directional" strategy ke liye chahiye — wo 15M par regime decide
   karti hai aur 5M par entry leti hai. */

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Chhote timeframe ki candles ko bade timeframe mein jodo (5m -> 15m).
 * Buckets clock par align hote hain (:00, :15, :30, :45), isliye result wahi
 * banta hai jo exchange ka apna 15m candle hota.
 */
export function resample<T extends Bar>(candles: T[], bucketMinutes: number): Bar[] {
  if (!candles.length || bucketMinutes <= 0) return [];
  const bucketMs = bucketMinutes * 60 * 1000;
  const out: Bar[] = [];
  let current: Bar | null = null;
  let currentKey = NaN;

  for (const c of candles) {
    const key = Math.floor(c.time / bucketMs);
    if (!current || key !== currentKey) {
      if (current) out.push(current);
      currentKey = key;
      current = { time: key * bucketMs, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 };
      continue;
    }
    current.high = Math.max(current.high, c.high);
    current.low = Math.min(current.low, c.low);
    current.close = c.close;
    current.volume += c.volume ?? 0;
  }
  if (current) out.push(current);
  return out;
}

/**
 * VWAP — har UTC din par reset hota hai. Crypto 24/7 chalta hai, isliye "session"
 * ka matlab yahan UTC day hai; bina reset ke VWAP puraani history mein dab jaata
 * hai aur intraday signal ke kaam ka nahi rehta.
 */
export function vwap(candles: Bar[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumPV = 0;
  let cumVol = 0;
  let day = "";

  for (const c of candles) {
    const candleDay = new Date(c.time).toISOString().slice(0, 10);
    if (candleDay !== day) {
      day = candleDay;
      cumPV = 0;
      cumVol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume ?? 0;
    cumPV += typical * vol;
    cumVol += vol;
    out.push(cumVol > 0 ? cumPV / cumVol : null);
  }
  return out;
}

/** True Range — ATR aur ADX dono ki buniyad. */
function trueRanges(candles: Bar[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

/** Wilder smoothing — pehli value simple average, phir smoothed. */
function wilder(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let smoothed = sum / period;
  out[period - 1] = smoothed;
  for (let i = period; i < values.length; i++) {
    smoothed = (smoothed * (period - 1) + values[i]) / period;
    out[i] = smoothed;
  }
  return out;
}

/** ATR (Wilder). */
export function atr(candles: Bar[], period = 14): (number | null)[] {
  return wilder(trueRanges(candles), period);
}

export interface AdxPoint {
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
}

/**
 * ADX (Wilder, 14) — trend kitna strong hai. Strategy A isse decide karti hai ki
 * market TRENDING hai (>= 20) ya RANGE (< 20).
 */
export function adx(candles: Bar[], period = 14): AdxPoint[] {
  const empty: AdxPoint = { adx: null, plusDi: null, minusDi: null };
  if (candles.length < period * 2) return candles.map(() => empty);

  const tr = trueRanges(candles);
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smTr = wilder(tr, period);
  const smPlus = wilder(plusDm, period);
  const smMinus = wilder(minusDm, period);

  const plusDi: (number | null)[] = [];
  const minusDi: (number | null)[] = [];
  const dx: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const t = smTr[i];
    const p = smPlus[i];
    const m = smMinus[i];
    if (t == null || p == null || m == null || t === 0) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(NaN);
      continue;
    }
    const pdi = (p / t) * 100;
    const mdi = (m / t) * 100;
    plusDi.push(pdi);
    minusDi.push(mdi);
    const denom = pdi + mdi;
    dx.push(denom === 0 ? 0 : (Math.abs(pdi - mdi) / denom) * 100);
  }

  // ADX = DX ka Wilder average, par sirf un indexes se jahan DX valid hai.
  const firstValid = dx.findIndex((v) => Number.isFinite(v));
  const out: AdxPoint[] = candles.map((_, i) => ({ adx: null, plusDi: plusDi[i], minusDi: minusDi[i] }));
  if (firstValid < 0) return out;

  const validDx = dx.slice(firstValid).map((v) => (Number.isFinite(v) ? v : 0));
  const adxSeries = wilder(validDx, period);
  for (let i = 0; i < adxSeries.length; i++) {
    out[firstValid + i].adx = adxSeries[i];
  }
  return out;
}

/** Aakhri confirmed swing high (pivot) ki value — breakout check ke liye. */
export function lastSwingHigh(candles: Bar[], span: number): number | null {
  const found = pivots(candles.map((c) => c.high), span, "high");
  return found.length ? found[found.length - 1].value : null;
}

export function lastSwingLow(candles: Bar[], span: number): number | null {
  const found = pivots(candles.map((c) => c.low), span, "low");
  return found.length ? found[found.length - 1].value : null;
}

/** Aakhri N bars ka average volume (current bar chhod kar). */
export function averageVolume(candles: Bar[], lookback: number): number | null {
  if (candles.length < lookback + 1) return null;
  const slice = candles.slice(-lookback - 1, -1);
  const sum = slice.reduce((acc, c) => acc + (c.volume ?? 0), 0);
  return slice.length ? sum / slice.length : null;
}
