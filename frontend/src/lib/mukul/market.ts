import { ema, rsi } from "@/lib/indicators";
import type { Candle } from "@/lib/cryptoApi";

export interface RadarRead {
  symbol: string;
  base: string;
  price: number;
  trend: "Bullish" | "Bearish" | "Sideways";
  momentum: "Strong" | "Neutral" | "Weak";
  volume: "Above Average" | "Average" | "Below Average";
  volatility: "High" | "Normal" | "Low";
  structure: "Bullish" | "Bearish" | "Mixed";
  setup: "WATCH" | "ALIGNED" | "STAND ASIDE";
  why: string;
}

export interface AlgoCheck {
  label: string;
  ok: boolean;
  note: string;
}

export interface AlgoRead {
  name: "MUKUL TREND";
  checks: AlgoCheck[];
  status: "forming" | "awaited" | "invalidated";
  explanation: string;
}

export interface StudyRules {
  emaFast: number;
  emaSlow: number;
  rsiMin: number;
  volMult: number;
}

export interface StudyBacktest {
  trades: number;
  winRate: number;
  profitFactor: number | null;
  maxDrawdown: number;
  averageTrade: number;
  losingStreak: number;
  buyHold: number;
}

export interface AlertRule {
  id: string;
  symbol: string;
  rsiGt: boolean;
  priceAboveEma50: boolean;
  volumeAbove: boolean;
  trendBullish: boolean;
  structureBullish: boolean;
  email: string;
  telegram: boolean;
}

function last<T>(values: T[]): T | undefined {
  return values[values.length - 1];
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

export function baseOf(symbol: string): string {
  return symbol.replace(/USDT$|USD$/i, "") || symbol;
}

export function readRadar(symbol: string, candles: Candle[]): RadarRead | null {
  if (candles.length < 55) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiLine = rsi(closes, 14);
  const rsiNow = last(rsiLine);
  const e20 = last(ema20) ?? price;
  const e50 = last(ema50) ?? price;

  const trend: RadarRead["trend"] =
    price > e50 && e20 > e50 ? "Bullish" : price < e50 && e20 < e50 ? "Bearish" : "Sideways";

  const momentum: RadarRead["momentum"] =
    rsiNow == null ? "Neutral" : rsiNow >= 60 ? "Strong" : rsiNow <= 40 ? "Weak" : "Neutral";

  const volumes = candles.map((c) => c.volume);
  const recent = volumes[volumes.length - 1] ?? 0;
  const baseline = avg(volumes.slice(-21, -1));
  const volRatio = baseline > 0 ? recent / baseline : 1;
  const volume: RadarRead["volume"] =
    volRatio >= 1.5 ? "Above Average" : volRatio >= 0.8 ? "Average" : "Below Average";

  const ranges = candles.slice(-20).map((c) => (c.high - c.low) / Math.max(c.close, 1e-9));
  const atrPct = avg(ranges);
  const volatility: RadarRead["volatility"] = atrPct >= 0.025 ? "High" : atrPct >= 0.012 ? "Normal" : "Low";

  const swing = closes.slice(-12);
  const higher = swing[swing.length - 1] > swing[0] && e20 >= e50;
  const lower = swing[swing.length - 1] < swing[0] && e20 <= e50;
  const structure: RadarRead["structure"] = higher ? "Bullish" : lower ? "Bearish" : "Mixed";

  const aligned =
    trend === "Bullish" && momentum === "Strong" && volume === "Above Average" && structure === "Bullish";
  const conflict = trend === "Bearish" || (trend === "Bullish" && momentum === "Weak");
  const setup: RadarRead["setup"] = aligned ? "ALIGNED" : conflict ? "STAND ASIDE" : "WATCH";

  const why = [
    trend === "Bullish"
      ? "Price trend filter ke upar hai."
      : trend === "Bearish"
        ? "Price trend filter ke neeche hai."
        : "Price trend filter clear nahi hai.",
    momentum === "Strong"
      ? "Momentum positive hai."
      : momentum === "Weak"
        ? "Momentum weak hai."
        : "Momentum abhi neutral hai.",
    volume === "Above Average"
      ? "Volume confirmation mil chuki hai."
      : "Volume confirmation abhi incomplete hai.",
    "Ye padhai ka readout hai — buy ya sell instruction nahi.",
  ].join(" ");

  return { symbol, base: baseOf(symbol), price, trend, momentum, volume, volatility, structure, setup, why };
}

export function readAlgo(candles: Candle[]): AlgoRead | null {
  if (candles.length < 55) return null;
  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiLine = rsi(closes, 14);
  const price = closes[closes.length - 1];
  const e20 = last(ema20) ?? price;
  const e50 = last(ema50) ?? price;
  const rsiNow = last(rsiLine);
  const volumes = candles.map((c) => c.volume);
  const volOk = volumes[volumes.length - 1] > avg(volumes.slice(-21, -1)) * 1.5;
  const priorHigh = Math.max(...candles.slice(-20, -1).map((c) => c.high));
  const breakout = price > priorHigh;
  const structure = e20 > e50 && price > e20;

  const checks: AlgoCheck[] = [
    { label: "EMA structure", ok: e20 > e50, note: e20 > e50 ? "EMA 20 EMA 50 ke upar hai." : "EMA 20 EMA 50 ke neeche aa gayi hai." },
    { label: "RSI", ok: rsiNow != null && rsiNow > 55, note: rsiNow == null ? "RSI abhi ready nahi." : `RSI ${rsiNow.toFixed(1)}.` },
    { label: "Volume", ok: volOk, note: volOk ? "Volume 1.5× average se upar hai." : "Volume abhi average ke aas-paas hai." },
    { label: "Breakout", ok: breakout, note: breakout ? "Price recent high ke upar hai." : "Breakout abhi confirm nahi hua." },
    { label: "Market structure", ok: structure, note: structure ? "Structure upar ki taraf hai." : "Structure mixed ya weak hai." },
  ];

  const passed = checks.filter((c) => c.ok).length;
  const emaBroken = !checks[0].ok;
  const status: AlgoRead["status"] = emaBroken ? "invalidated" : passed >= 4 ? "awaited" : passed >= 2 ? "forming" : "invalidated";
  const explanation =
    status === "invalidated"
      ? "EMA structure toot chuki hai, isliye ye setup invalidated hai. Auto buy/sell nahi hota."
      : status === "awaited"
        ? `${passed}/5 conditions pass hain. Confirmation awaited — ek missing piece ke bina ye trade signal nahi hai.`
        : `${passed}/5 conditions pass hain. Setup forming hai. Ye explanation hai, order nahi.`;

  return { name: "MUKUL TREND", checks, status, explanation };
}

export function countAlert(rule: AlertRule, read: RadarRead): { met: number; total: number } {
  const selected: boolean[] = [];
  if (rule.rsiGt) selected.push(read.momentum === "Strong");
  if (rule.priceAboveEma50) selected.push(read.trend === "Bullish");
  if (rule.volumeAbove) selected.push(read.volume === "Above Average");
  if (rule.trendBullish) selected.push(read.trend === "Bullish");
  if (rule.structureBullish) selected.push(read.structure === "Bullish");
  return { met: selected.filter(Boolean).length, total: selected.length };
}

export function studyBacktest(candles: Candle[], rules: StudyRules): StudyBacktest | null {
  const need = Math.max(rules.emaSlow, 20) + 2;
  if (candles.length < need) return null;
  const closes = candles.map((c) => c.close);
  const fast = ema(closes, rules.emaFast);
  const slow = ema(closes, rules.emaSlow);
  const rsiLine = rsi(closes, 14);
  const volumes = candles.map((c) => c.volume);

  let inTrade = false;
  let entry = 0;
  const returns: number[] = [];
  for (let i = need; i < candles.length; i++) {
    const base = avg(volumes.slice(Math.max(0, i - 21), i));
    const volOk = base > 0 && volumes[i] >= base * rules.volMult;
    const rsiNow = rsiLine[i];
    const signal = fast[i] > slow[i] && rsiNow != null && rsiNow > rules.rsiMin && volOk;
    if (!inTrade && signal) {
      inTrade = true;
      entry = closes[i];
    } else if (inTrade && !signal) {
      returns.push(closes[i] / entry - 1);
      inTrade = false;
    }
  }
  if (inTrade) returns.push(closes[closes.length - 1] / entry - 1);

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let streak = 0;
  let losingStreak = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    if (r > 0) {
      wins += 1;
      grossWin += r;
      streak = 0;
    } else {
      grossLoss += Math.abs(r);
      streak += 1;
      losingStreak = Math.max(losingStreak, streak);
    }
  }

  const first = closes[need];
  const buyHold = first > 0 ? closes[closes.length - 1] / first - 1 : 0;
  return {
    trades: returns.length,
    winRate: returns.length ? (wins / returns.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    maxDrawdown: maxDrawdown * 100,
    averageTrade: returns.length ? (avg(returns) * 100) : 0,
    losingStreak,
    buyHold: buyHold * 100,
  };
}

export function swings(candles: Candle[]): { support: number; resistance: number } | null {
  if (candles.length < 10) return null;
  const window = candles.slice(-30);
  return {
    support: Math.min(...window.map((c) => c.low)),
    resistance: Math.max(...window.map((c) => c.high)),
  };
}
