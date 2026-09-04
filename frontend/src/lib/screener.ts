import { intervalMinutes, type Candle } from "./cryptoApi";
import { ema, macd, rsi } from "./indicators";
import { STRATEGIES, type SignalTone } from "./strategies";

/**
 * AI coin screener ka scoring.
 *
 * Signals yahan dobara nahi likhe gaye — har coin par wahi `analyze()` chalta hai
 * jo strategy pages par chalta hai (`src/lib/strategies.ts`). Isliye screener ka
 * verdict aur strategy page ka verdict kabhi alag nahi ho sakte.
 */

export type Bias = "bullish" | "bearish" | "neutral";

export interface StrategyVote {
  id: string;
  name: string;
  tone: SignalTone;
  headline: string;
}

export interface ScreenerRow {
  symbol: string;
  price: number;
  /** Chart history ke andar 24h purani candle se change; history chhoti ho to null. */
  change24h: number | null;
  votes: number;
  bullish: number;
  bearish: number;
  neutral: number;
  bias: Bias;
  /** 0-100 — kitna strong setup hai (sirf direction nahi). */
  strength: number;
  /** (EMA9 - EMA50) / price * 100 */
  trendPct: number | null;
  rsi: number | null;
  /** MACD histogram, price ke % mein — coins ki alag-alag price scale normalise karne ke liye. */
  macdPct: number | null;
  signals: StrategyVote[];
}

/** Strength ke components ka weight — sab milakar 1. */
const WEIGHTS = { agreement: 0.4, trend: 0.25, macd: 0.2, rsi: 0.15 };

/** Har component ka "full marks" point — isse upar sab 100% maana jata hai. */
const CAPS = { trendPct: 3, macdPct: 0.8, rsiDistance: 30 };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

  // Har strategy ka apna verdict — yahi cheez strategy page par bhi dikhti hai.
  const signals: StrategyVote[] = STRATEGIES.map((def) => {
    const { signal } = def.analyze(candles, def.defaults);
    return { id: def.id, name: def.name, tone: signal.tone, headline: signal.headline };
  });

  const bullish = signals.filter((s) => s.tone === "buy").length;
  const bearish = signals.filter((s) => s.tone === "sell").length;
  const neutral = signals.length - bullish - bearish;
  const votes = bullish - bearish;

  const ema9 = ema(closes, 9);
  const ema50 = ema(closes, 50);
  const trendPct = ((ema9[ema9.length - 1] - ema50[ema50.length - 1]) / price) * 100;

  const rsiSeries = rsi(closes, 14);
  const rsiNow = rsiSeries[rsiSeries.length - 1];

  const macdSeries = macd(closes, 12, 26, 9);
  const macdPct = (macdSeries[macdSeries.length - 1].hist / price) * 100;

  const agreement = clamp01(Math.abs(votes) / signals.length);
  const trendPart = clamp01(Math.abs(trendPct) / CAPS.trendPct);
  const macdPart = clamp01(Math.abs(macdPct) / CAPS.macdPct);
  const rsiPart = rsiNow == null ? 0 : clamp01(Math.abs(rsiNow - 50) / CAPS.rsiDistance);

  const strength = Math.round(
    100 *
      (WEIGHTS.agreement * agreement +
        WEIGHTS.trend * trendPart +
        WEIGHTS.macd * macdPart +
        WEIGHTS.rsi * rsiPart),
  );

  return {
    symbol,
    price,
    change24h: change24h(candles, interval),
    votes,
    bullish,
    bearish,
    neutral,
    bias: votes > 0 ? "bullish" : votes < 0 ? "bearish" : "neutral",
    strength,
    trendPct: Number.isFinite(trendPct) ? trendPct : null,
    rsi: rsiNow,
    macdPct: Number.isFinite(macdPct) ? macdPct : null,
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
      return sorted.sort((a, b) => b.votes - a.votes || b.strength - a.strength);
    case "strength":
    default:
      // Direction ke saath strength: bullish strongest sabse upar, bearish strongest sabse neeche.
      return sorted.sort((a, b) => {
        const sa = a.votes === 0 ? 0 : Math.sign(a.votes) * a.strength;
        const sb = b.votes === 0 ? 0 : Math.sign(b.votes) * b.strength;
        return sb - sa;
      });
  }
}

/** AI ko bhejne ke liye ek chhota, padhne layak summary. */
export function buildAiPrompt(rows: ScreenerRow[], interval: string): string {
  const line = (r: ScreenerRow) =>
    `${r.symbol}: ${r.bias}, score ${r.votes >= 0 ? "+" : ""}${r.votes}/${r.signals.length}, ` +
    `strength ${r.strength}, trend ${r.trendPct?.toFixed(2) ?? "-"}%, RSI ${r.rsi?.toFixed(0) ?? "-"}, ` +
    `24h ${r.change24h?.toFixed(2) ?? "-"}%`;

  const bulls = rows.filter((r) => r.bias === "bullish").slice(0, 5);
  const bears = rows.filter((r) => r.bias === "bearish").slice(-5).reverse();

  return [
    `Maine ${rows.length} crypto coins ko ${interval} timeframe par screen kiya hai.`,
    "Signals EMA crossover, RSI divergence, MACD, custom EMA aur range breakout se aaye hain.",
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
