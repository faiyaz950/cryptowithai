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
