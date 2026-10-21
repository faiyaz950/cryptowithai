import { intervalMinutes, type Candle } from "./cryptoApi";
import { atr, ema, macd, rsi } from "./indicators";
import { STRATEGIES, type SignalTone } from "./strategies";

/**
 * AI coin screener ka scoring.
 *
 * Har coin par chart wale hi indicators (EMA 9/50, MACD 12-26-9, RSI 14) aur
 * strategy pages wala hi `analyze()` chalta hai. Score in sab ka signed jod hai,
 * isliye bias aur strength ek hi number se nikalte hain — chart ki disha se alag
 * "teji" tabhi dikhegi jab strategies sach mein ulta bol rahi hon (tab "Mixed").
 */

export type Bias = "bullish" | "bearish" | "neutral";

export interface StrategyVote {
  id: string;
  name: string;
  tone: SignalTone;
  headline: string;
  /** Score mein gina gaya? Range/mean-reversion strategies sirf dikhti hain. */
  counted: boolean;
}

export interface ScorePart {
  key: "trend" | "momentum" | "rsi" | "strategies";
  label: string;
  /** Kya dekha — padhne layak, jaise "EMA9 81,700 > EMA50 81,200". */
  reading: string;
  /** -1..+1 */
  score: number;
  weight: number;
  /** score × weight × 100 — kul score mein kitna joda. */
  points: number;
}

export interface ScreenerRow {
  symbol: string;
  price: number;
  /** Aakhri candle ka open time (ms). */
  lastTime: number;
  /** Chart history ke andar 24h purani candle se change; history chhoti ho to null. */
  change24h: number | null;
  votes: number;
  bullish: number;
  bearish: number;
  neutral: number;
  /** Kitni strategies score mein gini gayi. */
  counted: number;
  bias: Bias;
  /** -100..+100 — plus = teji, minus = mandi. */
  score: number;
  /** |score| — setup kitna strong hai. */
  strength: number;
  /** Strategies ka vote trend ke ulta hai — chart aur signal mel nahi kha rahe. */
  mixed: boolean;
  /** (EMA9 - EMA50) / price * 100 */
  trendPct: number | null;
  rsi: number | null;
  /** MACD histogram, price ke % mein. */
  macdPct: number | null;
  parts: ScorePart[];
  signals: StrategyVote[];
}

export const SCORE_WEIGHTS = { trend: 0.35, momentum: 0.2, rsi: 0.15, strategies: 0.3 } as const;

/** Full marks kahan: EMA spread 2 ATR, MACD hist 0.3 ATR, RSI 50 se 20 point door. */
const CAPS = { trendAtr: 2, macdAtr: 0.3, rsiDistance: 20 } as const;

/** Is se kam |score| = neutral. */
export const BIAS_THRESHOLD = 15;

/** Range / reversal strategies disha nahi batati (ya trend ke ulta intezaar karti hain). */
function countsForDirection(category: string): boolean {
  const c = category.toLowerCase();
  return !c.includes("range") && !c.includes("mean reversion");
}

export const COUNTED_STRATEGIES = STRATEGIES.filter((s) => countsForDirection(s.category));
export const WATCH_ONLY_STRATEGIES = STRATEGIES.filter((s) => !countsForDirection(s.category));

function clamp(value: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, value));
}

function px(n: number): string {
  const digits = n >= 1000 ? 0 : n >= 1 ? 3 : 6;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Candle history ke andar se ~24 ghante purani candle dhoondh kar % change. */
function change24h(candles: Candle[], interval: string): number | null {
  const barsPerDay = Math.round((24 * 60) / intervalMinutes(interval));
  if (barsPerDay < 1 || candles.length <= barsPerDay) return null;
  const then = candles[candles.length - 1 - barsPerDay].close;
  const now = candles[candles.length - 1].close;
  if (!then) return null;
  return ((now - then) / then) * 100;
}

export function scoreSymbol(symbol: string, candles: Candle[], interval: string): ScreenerRow | null {
  if (candles.length < 60) return null;
  const last = candles[candles.length - 1];
  const price = last.close;
  if (!price || !Number.isFinite(price)) return null;

  const closes = candles.map((c) => c.close);
  const atrNow = atr(candles, 14).at(-1) ?? null;
  const unit = atrNow && atrNow > 0 ? atrNow : price * 0.01;

  const ema9 = ema(closes, 9).at(-1)!;
  const ema50 = ema(closes, 50).at(-1)!;
  const trendAtr = (ema9 - ema50) / unit;
  const trendScore = clamp(trendAtr / CAPS.trendAtr);

  const hist = macd(closes, 12, 26, 9).at(-1)!.hist;
  const macdScore = clamp(hist / unit / CAPS.macdAtr);

  const rsiNow = rsi(closes, 14).at(-1) ?? null;
  const rsiScore = rsiNow == null ? 0 : clamp((rsiNow - 50) / CAPS.rsiDistance);

  const signals: StrategyVote[] = STRATEGIES.map((def) => {
    const { signal } = def.analyze(candles, def.defaults);
    return {
      id: def.id,
      name: def.name,
      tone: signal.tone,
      headline: signal.headline,
      counted: countsForDirection(def.category),
    };
  });
  const counted = signals.filter((s) => s.counted);
  const bullish = counted.filter((s) => s.tone === "buy").length;
  const bearish = counted.filter((s) => s.tone === "sell").length;
  const neutral = counted.length - bullish - bearish;
  const votes = bullish - bearish;
  // Zyada strategies aksar "wait" (neutral) par hoti hain — sirf bolne walon se tolo, kam se kam 3.
  const voteScore = clamp(votes / Math.max(3, bullish + bearish));

  const part = (key: ScorePart["key"], label: string, reading: string, score: number): ScorePart => {
    const weight = SCORE_WEIGHTS[key];
    return { key, label, reading, score, weight, points: Math.round(score * weight * 100) };
  };
  const parts: ScorePart[] = [
    part(
      "trend",
      "Trend · EMA 9 vs EMA 50",
      `EMA9 ${px(ema9)} ${ema9 >= ema50 ? ">" : "<"} EMA50 ${px(ema50)} (${trendAtr >= 0 ? "+" : ""}${trendAtr.toFixed(2)} ATR)`,
      trendScore,
    ),
    part(
      "momentum",
      "Momentum · MACD 12/26/9",
      `Histogram ${hist >= 0 ? "+" : ""}${px(hist)} (${(hist / unit).toFixed(2)} ATR)`,
      macdScore,
    ),
    part("rsi", "RSI 14", rsiNow == null ? "—" : `${rsiNow.toFixed(1)} (50 se ${rsiNow >= 50 ? "upar" : "neeche"})`, rsiScore),
    part("strategies", "Strategy votes", `${bullish} buy · ${bearish} sell · ${neutral} wait (${counted.length} mein se)`, voteScore),
  ];

  const score = Math.round(parts.reduce((sum, p) => sum + p.score * p.weight * 100, 0));
  const bias: Bias = score >= BIAS_THRESHOLD ? "bullish" : score <= -BIAS_THRESHOLD ? "bearish" : "neutral";
  const mixed = Math.abs(trendScore) >= 0.25 && Math.abs(voteScore) >= 0.34 && Math.sign(trendScore) !== Math.sign(voteScore);
  const trendPct = ((ema9 - ema50) / price) * 100;
  const macdPct = (hist / price) * 100;

  return {
    symbol,
    price,
    lastTime: last.time > 1e12 ? last.time : last.time * 1000,
    change24h: change24h(candles, interval),
    votes,
    bullish,
    bearish,
    neutral,
    counted: counted.length,
    bias,
    score,
    strength: Math.abs(score),
    mixed,
    trendPct: Number.isFinite(trendPct) ? trendPct : null,
    rsi: rsiNow,
    macdPct: Number.isFinite(macdPct) ? macdPct : null,
    parts,
    signals,
  };
}

export type SortKey = "strength" | "votes" | "change24h" | "symbol";

/** Bullish upar se, bearish neeche se — dono taraf strongest pehle. */
export function sortRows(rows: ScreenerRow[], key: SortKey): ScreenerRow[] {
  const sorted = [...rows];
  switch (key) {
    case "symbol":
      return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    case "change24h":
      return sorted.sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity));
    case "votes":
      return sorted.sort((a, b) => b.votes - a.votes || b.score - a.score);
    case "strength":
    default:
      return sorted.sort((a, b) => b.score - a.score);
  }
}

/** AI ko bhejne ke liye ek chhota, padhne layak summary. */
export function buildAiPrompt(rows: ScreenerRow[], interval: string): string {
  const line = (r: ScreenerRow) =>
    `${r.symbol}: ${r.bias}${r.mixed ? " (mixed)" : ""}, score ${r.score >= 0 ? "+" : ""}${r.score}, ` +
    `votes ${r.bullish} buy/${r.bearish} sell, trend ${r.trendPct?.toFixed(2) ?? "-"}%, RSI ${r.rsi?.toFixed(0) ?? "-"}, ` +
    `24h ${r.change24h?.toFixed(2) ?? "-"}%`;

  const bulls = rows.filter((r) => r.bias === "bullish").slice(0, 5);
  const bears = rows.filter((r) => r.bias === "bearish").slice(-5).reverse();

  return [
    `Maine ${rows.length} crypto coins ko ${interval} timeframe par Delta perpetual candles se screen kiya hai.`,
    "Score (-100..+100) = EMA9 vs EMA50 trend (35%) + MACD momentum (20%) + RSI (15%) + trend/momentum strategies ke votes (30%).",
    "",
    "Top bullish:",
    ...bulls.map((r) => `- ${line(r)}`),
    "",
    "Top bearish:",
    ...bears.map((r) => `- ${line(r)}`),
    "",
    "In numbers ko samjhao: kaunse setups sabse solid lagte hain aur kyun, kahan risk hai, " +
      "aur kis coin par kaunsi strategy behtar baithegi. Koi bhi price target invent mat karna — " +
      "sirf diye gaye data par baat karo.",
  ].join("\n");
}
