import { BarChart3, Boxes, Gauge, Target, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import type { BacktestParams, Candle } from "./cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, intervalMinutes } from "./cryptoApi";
import {
  adx,
  averageVolume,
  crossDirection,
  ema,
  findDivergence,
  lastSwingHigh,
  lastSwingLow,
  macd,
  resample,
  rsi,
  vwap,
} from "./indicators";

const RANGE_COLOR = "#0891b2";

/**
 * Strategy registry — har strategy apne parameters, live analysis aur backtest
 * mapping khud describe karti hai. `/trade/strategies/[id]` page isi se render
 * hota hai, isliye nayi strategy add karne ke liye sirf yahan entry daalni hai.
 */

export type FieldKind = "number" | "symbol" | "interval" | "toggle" | "time" | "select";

export interface StrategyField {
  key: string;
  label: string;
  kind: FieldKind;
  group: "signal" | "risk" | "backtest";
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  /** Sirf `select` kind ke liye. */
  options?: readonly { value: string; label: string }[];
  /** Strategies tab ke compact card par bhi dikhana hai? */
  onCard?: boolean;
  /** Field tabhi dikhe jab ye sach ho (jaise RSI params sirf filter ON par). */
  showIf?: (values: StrategyValues) => boolean;
}

export type StrategyValues = Record<string, number | string | boolean>;

export type SignalTone = "buy" | "sell" | "neutral";

export interface LiveReadout {
  label: string;
  value: string;
  color?: string;
}

export interface LiveSignal {
  headline: string;
  detail?: string;
  tone: SignalTone;
  readouts: LiveReadout[];
}

export interface ChartOverlay {
  key: string;
  label: string;
  color: string;
}

export interface StrategyAnalysis {
  /** Chart ke liye candles — indicator values fields mein attach ho chuki hain. */
  candles: Candle[];
  overlays: ChartOverlay[];
  signal: LiveSignal;
}

export interface StrategyDef {
  id: string;
  name: string;
  category: string;
  /** Card par dikhne wali ek-do line. */
  blurb: string;
  /** Detail page par poori logic. */
  logic: string;
  accent: string;
  icon: LucideIcon;
  featured?: boolean;
  fields: StrategyField[];
  defaults: StrategyValues;
  /** Backend engine strategy ko kaise chalata hai — jahan approximation hai wahan honest note. */
  engineNote?: string;
  /**
   * `false` ho to backtest button chhupta hai. Kuch strategies (jaise options
   * wali) ko humara candle-based engine imaandari se backtest nahi kar sakta —
   * galat number dikhane se behtar hai kuch na dikhana.
   */
  backtestable?: boolean;
  /** Signal aane par option chain se strike bhi chunna hai? */
  optionChain?: {
    /** Bullish signal par kaunsa option — call ya put. */
    bullish: "call" | "put";
    bearish: "call" | "put";
  };
  analyze: (candles: Candle[], values: StrategyValues) => StrategyAnalysis;
  toBacktest: (values: StrategyValues) => BacktestParams;
}

/* ── Value helpers ─────────────────────────────────────── */

export function num(values: StrategyValues, key: string, fallback = 0): number {
  const raw = Number(values[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

export function str(values: StrategyValues, key: string, fallback = ""): string {
  const raw = values[key];
  return typeof raw === "string" && raw ? raw : fallback;
}

export function bool(values: StrategyValues, key: string): boolean {
  return values[key] === true || values[key] === "true";
}

const FAST_COLOR = "#2563eb";
const SLOW_COLOR = "#d97706";
const THIRD_COLOR = "#7c3aed";

function price(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function emaKey(period: number): `ema_${number}` {
  return `ema_${period}` as `ema_${number}`;
}

/** Chart overlay ke liye candles par EMA values chipka do. */
function attachEma(candles: Candle[], periods: number[]): Candle[] {
  const closes = candles.map((c) => c.close);
  const series = periods.map((p) => ema(closes, p));
  return candles.map((candle, i) => {
    const next: Candle = { ...candle };
    periods.forEach((period, k) => {
      next[emaKey(period)] = series[k][i];
    });
    return next;
  });
}

const idleSignal: LiveSignal = {
  headline: "Data ka intezaar",
  detail: "Candles load hote hi signal yahan update hoga.",
  tone: "neutral",
  readouts: [],
};

function emptyAnalysis(candles: Candle[], overlays: ChartOverlay[] = []): StrategyAnalysis {
  return { candles, overlays, signal: idleSignal };
}

/* ── Shared fields ─────────────────────────────────────── */

const marketFields: StrategyField[] = [
  { key: "symbol", label: "Symbol", kind: "symbol", group: "signal", onCard: true },
  { key: "timeframe", label: "Timeframe", kind: "interval", group: "signal", onCard: true },
];

const riskFields: StrategyField[] = [
  { key: "sl_points", label: "Stop loss · pts", kind: "number", group: "risk", min: 1, hint: "Entry se itna ulta move par exit." },
  { key: "target_points", label: "Target · pts", kind: "number", group: "risk", min: 1 },
  { key: "lots", label: "Lots", kind: "number", group: "risk", min: 0.01, step: 0.01 },
  { key: "no_entry_window", label: "Block entries 11:00–14:00 IST", kind: "toggle", group: "risk" },
];

/** Range breakout par 11:00–14:00 no-entry window lagu nahi hota. */
const riskFieldsNoWindow: StrategyField[] = riskFields.filter((f) => f.key !== "no_entry_window");

export const RANGE_TIMEZONES = [
  { value: "Asia/Kolkata", label: "IST · Asia/Kolkata" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York" },
  { value: "Asia/Dubai", label: "Dubai" },
] as const;

const backtestFields: StrategyField[] = [
  { key: "days", label: "History · days", kind: "number", group: "backtest", min: 1, max: 700 },
];

const sharedDefaults: StrategyValues = {
  symbol: "BTCUSDT",
  timeframe: "1h",
  sl_points: 400,
  target_points: 800,
  lots: 1,
  no_entry_window: true,
  days: 30,
};

/** Har strategy ka backtest isi base par banta hai — backend do hi engines janta hai. */
function baseParams(values: StrategyValues): BacktestParams {
  return {
    strategy: "ema-crossover",
    symbol: str(values, "symbol", "BTCUSDT"),
    timeframe: str(values, "timeframe", "1h"),
    days: num(values, "days", 30),
    sl_points: num(values, "sl_points", 400),
    target_points: num(values, "target_points", 800),
    lots: num(values, "lots", 1),
    ema9: 9,
    ema21: 21,
    ema50: 50,
    use_rsi_filter: false,
    rsi_period: 14,
    rsi_overbought: 60,
    rsi_oversold: 40,
    use_no_entry_window: bool(values, "no_entry_window"),
    // Backend inhe sirf range-breakout par padhta hai; baaki strategies ke liye safe defaults.
    range_start: str(values, "range_start", "11:00"),
    range_end: str(values, "range_end", "13:00"),
    range_timezone: str(values, "range_timezone", "Asia/Kolkata"),
  };
}


/* ── Range breakout helpers ────────────────────────────── */

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

interface LocalStamp {
  dayKey: string;
  minutes: number;
}

/** Candle ka local (chosen timezone) din aur midnight se minutes. */
function localStamp(timeMs: number, timeZone: string): LocalStamp | null {
  try {
    const parts = zoneFormatter(timeZone).formatToParts(new Date(timeMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    // Kuch zones "24" as midnight dete hain — usko 0 maano.
    return { dayKey: day, minutes: (hour % 24) * 60 + minute };
  } catch {
    // Galat timezone string — analysis chup-chaap skip ho jaye.
    return null;
  }
}

/** "HH:MM" ko midnight se minutes mein. */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/* ── Strategies ────────────────────────────────────────── */

const emaCrossover: StrategyDef = {
  id: "ema-crossover",
  name: "EMA Crossover",
  category: "Trend following",
  blurb:
    "Exponential Moving Average crossovers se buy/sell signal milta hai. Short EMA jab long EMA ke upar cross kare to buy, neeche to sell.",
  logic:
    "Fast EMA jab slow EMA ko upar ki taraf cross kare to BUY, aur neeche cross kare to SELL. Trend ke saath chalne wali simple strategy — sideways market mein whipsaw zyada aate hain, isliye SL/target discipline zaroori hai.",
  accent: FAST_COLOR,
  icon: TrendingUp,
  engineNote:
    "Backtest backend ke EMA engine par chalta hai: fast EMA ko slow ke upar/neeche cross hone par entry (engine ke ema21 aur ema50 dono slow set hote hain).",
  fields: [
    { key: "fast", label: "Fast EMA", kind: "number", group: "signal", min: 1, max: 200, onCard: true },
    { key: "slow", label: "Slow EMA", kind: "number", group: "signal", min: 2, max: 400, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: { ...sharedDefaults, fast: 9, slow: 21 },
  analyze(candles, values) {
    const fast = num(values, "fast", 9);
    const slow = num(values, "slow", 21);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (candles.length < 2) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, slow]);
    const last = decorated[decorated.length - 1];
    const prev = decorated[decorated.length - 2];
    const fastNow = last[emaKey(fast)] as number;
    const slowNow = last[emaKey(slow)] as number;
    const cross = crossDirection(prev[emaKey(fast)], fastNow, prev[emaKey(slow)], slowNow);
    const spread = fastNow - slowNow;

    let signal: LiveSignal;
    if (cross === "up") {
      signal = { headline: `BUY — EMA ${fast} ne EMA ${slow} ko upar cross kiya`, tone: "buy", readouts: [] };
    } else if (cross === "down") {
      signal = { headline: `SELL — EMA ${fast} ne EMA ${slow} ko neeche cross kiya`, tone: "sell", readouts: [] };
    } else {
      signal = {
        headline: spread >= 0 ? "Bullish — fast EMA upar hai" : "Bearish — fast EMA neeche hai",
        detail: "Abhi is bar par koi fresh crossover nahi hua.",
        tone: spread >= 0 ? "buy" : "sell",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: `EMA ${fast}`, value: price(fastNow), color: FAST_COLOR },
      { label: `EMA ${slow}`, value: price(slowNow), color: SLOW_COLOR },
      { label: "Spread", value: price(spread), color: spread >= 0 ? "var(--green)" : "var(--red)" },
      { label: "Price", value: price(last.close) },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    const fast = num(values, "fast", 9);
    const slow = num(values, "slow", 21);
    // Engine "ema9 > ema21 && ema9 > ema50" dekhta hai — dono slow rakhne se
    // wahi do-EMA crossover ban jata hai jo card describe karta hai.
    return { ...baseParams(values), ema9: fast, ema21: slow, ema50: slow };
  },
};

const rsiDivergence: StrategyDef = {
  id: "rsi-divergence",
  name: "RSI Divergence",
  category: "Mean reversion",
  blurb: "RSI divergences se reversal points milte hain. 70+ overbought, 30 se neeche oversold.",
  logic:
    "Price naya high banaye par RSI na banaye to bearish divergence (reversal down), aur price naya low banaye par RSI na banaye to bullish divergence (reversal up). Iske alawa overbought/oversold zone se wapas aana bhi mean-reversion signal hai.",
  accent: SLOW_COLOR,
  icon: Gauge,
  engineNote:
    "Backend mein standalone RSI backtest nahi hai — backtest EMA crossover engine par chalta hai jismein ye RSI levels confirmation filter ki tarah lagte hain (BUY par RSI overbought se neeche, SELL par oversold se upar).",
  fields: [
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "overbought", label: "Overbought", kind: "number", group: "signal", min: 50, max: 95, onCard: true },
    { key: "oversold", label: "Oversold", kind: "number", group: "signal", min: 5, max: 50, onCard: true },
    { key: "pivot_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10, hint: "Pivot ke dono taraf itne chhote bars chahiye." },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: { ...sharedDefaults, rsi_period: 14, overbought: 70, oversold: 30, pivot_span: 3 },
  analyze(candles, values) {
    const period = num(values, "rsi_period", 14);
    const overbought = num(values, "overbought", 70);
    const oversold = num(values, "oversold", 30);
    const span = Math.max(1, num(values, "pivot_span", 3));
    if (candles.length < period + 2) return emptyAnalysis(candles);

    const closes = candles.map((c) => c.close);
    const series = rsi(closes, period);
    const decorated = candles.map((candle, i) => ({ ...candle, rsi: series[i] }));
    const now = series[series.length - 1];
    const prev = series[series.length - 2];
    if (now == null) return emptyAnalysis(decorated);

    const divergence = findDivergence(
      candles.map((c) => c.high),
      candles.map((c) => c.low),
      series,
      span,
    );

    let signal: LiveSignal;
    if (divergence.type === "bullish") {
      signal = {
        headline: "BUY — bullish divergence",
        detail: `Price ne naya low banaya par RSI ne nahi (${divergence.barsAgo} bars pehle ka swing).`,
        tone: "buy",
        readouts: [],
      };
    } else if (divergence.type === "bearish") {
      signal = {
        headline: "SELL — bearish divergence",
        detail: `Price ne naya high banaya par RSI ne nahi (${divergence.barsAgo} bars pehle ka swing).`,
        tone: "sell",
        readouts: [],
      };
    } else if (prev != null && prev >= overbought && now < overbought) {
      signal = { headline: "SELL — RSI overbought zone se bahar aaya", tone: "sell", readouts: [] };
    } else if (prev != null && prev <= oversold && now > oversold) {
      signal = { headline: "BUY — RSI oversold zone se bahar aaya", tone: "buy", readouts: [] };
    } else if (now >= overbought) {
      signal = { headline: "Overbought — reversal ka intezaar", detail: "Divergence abhi confirm nahi hui.", tone: "sell", readouts: [] };
    } else if (now <= oversold) {
      signal = { headline: "Oversold — reversal ka intezaar", detail: "Divergence abhi confirm nahi hui.", tone: "buy", readouts: [] };
    } else {
      signal = { headline: "Neutral zone — koi divergence nahi", tone: "neutral", readouts: [] };
    }

    const rsiColor = now >= overbought ? "var(--red)" : now <= oversold ? "var(--green)" : undefined;
    signal.readouts = [
      { label: `RSI ${period}`, value: now.toFixed(1), color: rsiColor },
      { label: "Overbought", value: overbought.toFixed(0), color: "var(--red)" },
      { label: "Oversold", value: oversold.toFixed(0), color: "var(--green)" },
      { label: "Price", value: price(candles[candles.length - 1].close) },
    ];
    return { candles: decorated, overlays: [], signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      use_rsi_filter: true,
      rsi_period: num(values, "rsi_period", 14),
      rsi_overbought: num(values, "overbought", 70),
      rsi_oversold: num(values, "oversold", 30),
    };
  },
};

const macdStrategy: StrategyDef = {
  id: "macd",
  name: "MACD",
  category: "Momentum",
  blurb: "MACD line jab signal line ke upar cross kare to bullish signal. Neeche cross par bearish.",
  logic:
    "MACD line = EMA(fast) − EMA(slow). Signal line usi ka EMA hai. MACD jab signal ko upar cross kare to bullish momentum, neeche cross kare to bearish. Histogram dono ka fark hai — zero ke aas-paas momentum kamzor hota hai.",
  accent: THIRD_COLOR,
  icon: BarChart3,
  engineNote:
    "Backend ke paas MACD engine nahi hai — backtest MACD ke underlying EMA fast/slow crossover par chalta hai (yani zero-line cross). Signal period sirf live signal ko affect karta hai.",
  fields: [
    { key: "fast", label: "Fast period", kind: "number", group: "signal", min: 1, max: 100, onCard: true },
    { key: "slow", label: "Slow period", kind: "number", group: "signal", min: 2, max: 200, onCard: true },
    { key: "signal", label: "Signal period", kind: "number", group: "signal", min: 1, max: 50, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: { ...sharedDefaults, fast: 12, slow: 26, signal: 9 },
  analyze(candles, values) {
    const fast = num(values, "fast", 12);
    const slow = num(values, "slow", 26);
    const signalPeriod = num(values, "signal", 9);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (candles.length < 2) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, slow]);
    const points = macd(candles.map((c) => c.close), fast, slow, signalPeriod);
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const cross = crossDirection(prev.macd, last.macd, prev.signal, last.signal);

    let signal: LiveSignal;
    if (cross === "up") {
      signal = { headline: "BUY — MACD ne signal line ko upar cross kiya", tone: "buy", readouts: [] };
    } else if (cross === "down") {
      signal = { headline: "SELL — MACD ne signal line ko neeche cross kiya", tone: "sell", readouts: [] };
    } else {
      const rising = last.hist > prev.hist;
      signal = {
        headline: last.hist >= 0 ? "Bullish momentum" : "Bearish momentum",
        detail: `Histogram ${rising ? "badh raha hai" : "ghat raha hai"} — fresh cross abhi nahi hua.`,
        tone: last.hist >= 0 ? "buy" : "sell",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "MACD", value: last.macd.toFixed(2), color: FAST_COLOR },
      { label: "Signal", value: last.signal.toFixed(2), color: SLOW_COLOR },
      { label: "Histogram", value: last.hist.toFixed(2), color: last.hist >= 0 ? "var(--green)" : "var(--red)" },
      { label: "Price", value: price(candles[candles.length - 1].close) },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    const fast = num(values, "fast", 12);
    const slow = num(values, "slow", 26);
    return { ...baseParams(values), ema9: fast, ema21: slow, ema50: slow };
  },
};

const customEma: StrategyDef = {
  id: "custom-ema",
  name: "Custom EMA Crossover",
  category: "Trend following · pro",
  blurb: "EMA 9 aur 21 dono jab EMA 50 ke upar cross karein to BUY, neeche cross karein to SELL.",
  logic:
    "Teen EMA ka setup: EMA 9 aur EMA 21 dono jab EMA 50 ke upar aayein to BUY, aur dono neeche jaayein to SELL. Backend ka professional backtest engine bilkul yahi rule chalata hai, isliye is strategy ka backtest exact hai — koi approximation nahi.",
  accent: FAST_COLOR,
  icon: Zap,
  featured: true,
  engineNote: "Ye backend ka native engine hai — live signal aur backtest dono ek hi rule follow karte hain.",
  fields: [
    { key: "ema9", label: "EMA 9", kind: "number", group: "signal", min: 1, max: 200, onCard: true },
    { key: "ema21", label: "EMA 21", kind: "number", group: "signal", min: 1, max: 200, onCard: true },
    { key: "ema50", label: "EMA 50", kind: "number", group: "signal", min: 1, max: 400, onCard: true },
    ...marketFields,
    { key: "use_rsi_filter", label: "RSI confirmation filter", kind: "toggle", group: "signal" },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50, showIf: (v) => bool(v, "use_rsi_filter") },
    { key: "rsi_overbought", label: "Overbought", kind: "number", group: "signal", min: 50, max: 100, showIf: (v) => bool(v, "use_rsi_filter") },
    { key: "rsi_oversold", label: "Oversold", kind: "number", group: "signal", min: 0, max: 50, showIf: (v) => bool(v, "use_rsi_filter") },
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    ema9: 9,
    ema21: 21,
    ema50: 50,
    use_rsi_filter: false,
    rsi_period: 14,
    rsi_overbought: 60,
    rsi_oversold: 40,
  },
  analyze(candles, values) {
    const fast = num(values, "ema9", 9);
    const mid = num(values, "ema21", 21);
    const slow = num(values, "ema50", 50);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(mid), label: `EMA ${mid}`, color: SLOW_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: THIRD_COLOR },
    ];
    if (candles.length < 2) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, mid, slow]);
    const last = decorated[decorated.length - 1];
    const prev = decorated[decorated.length - 2];
    const f = last[emaKey(fast)] as number;
    const m = last[emaKey(mid)] as number;
    const s = last[emaKey(slow)] as number;
    const pf = prev[emaKey(fast)] as number;
    const pm = prev[emaKey(mid)] as number;
    const ps = prev[emaKey(slow)] as number;

    const above = f > s && m > s;
    const below = f < s && m < s;
    const wasAbove = pf > ps && pm > ps;
    const wasBelow = pf < ps && pm < ps;

    let signal: LiveSignal;
    if (above && !wasAbove) {
      signal = { headline: `BUY — EMA ${fast} & ${mid} ne EMA ${slow} ko upar cross kiya`, tone: "buy", readouts: [] };
    } else if (below && !wasBelow) {
      signal = { headline: `SELL — EMA ${fast} & ${mid} ne EMA ${slow} ko neeche cross kiya`, tone: "sell", readouts: [] };
    } else if (above) {
      signal = { headline: "Bullish — dono EMA slow ke upar", detail: "Fresh cross abhi nahi hua.", tone: "buy", readouts: [] };
    } else if (below) {
      signal = { headline: "Bearish — dono EMA slow ke neeche", detail: "Fresh cross abhi nahi hua.", tone: "sell", readouts: [] };
    } else {
      signal = { headline: "Mixed — EMAs abhi align nahi hain", tone: "neutral", readouts: [] };
    }

    signal.readouts = [
      { label: `EMA ${fast}`, value: price(f), color: FAST_COLOR },
      { label: `EMA ${mid}`, value: price(m), color: SLOW_COLOR },
      { label: `EMA ${slow}`, value: price(s), color: THIRD_COLOR },
      { label: "Price", value: price(last.close) },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      ema9: num(values, "ema9", 9),
      ema21: num(values, "ema21", 21),
      ema50: num(values, "ema50", 50),
      use_rsi_filter: bool(values, "use_rsi_filter"),
      rsi_period: num(values, "rsi_period", 14),
      rsi_overbought: num(values, "rsi_overbought", 60),
      rsi_oversold: num(values, "rsi_oversold", 40),
    };
  },
};

const rangeBreakout: StrategyDef = {
  id: "range-breakout",
  name: "Range Breakout",
  category: "Breakout",
  blurb: "Ek fixed time window ka high/low range banta hai; us range ke bahar breakout par RSI confirmation ke saath entry.",
  logic:
    "Chuni hui time window (default 11:00–13:00 IST) ke high aur low se din ka range banta hai. Window khatam hone ke baad jo candle range ke bahar close kare wo breakout candle hai. Uske baad koi candle us breakout candle ka high tod de aur RSI upper level se upar ho to BUY; low tode aur RSI lower level se neeche ho to SELL. Entry breakout candle ke high/low par lagti hai, aur SL/target points se.",
  accent: RANGE_COLOR,
  icon: Boxes,
  engineNote:
    "Ye backend ka doosra native engine hai (`range-breakout`) — window, timezone aur RSI levels wahi hain jo backtest use karta hai. Intraday timeframe (5m/15m) par hi sensible hai; 1d par window ban hi nahi sakta.",
  fields: [
    { key: "range_start", label: "Range start", kind: "time", group: "signal", onCard: true },
    { key: "range_end", label: "Range end", kind: "time", group: "signal", onCard: true },
    { key: "range_timezone", label: "Timezone", kind: "select", group: "signal", options: RANGE_TIMEZONES },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50 },
    { key: "rsi_overbought", label: "RSI upper · long", kind: "number", group: "signal", min: 50, max: 100 },
    { key: "rsi_oversold", label: "RSI lower · short", kind: "number", group: "signal", min: 0, max: 50 },
    ...marketFields,
    ...riskFieldsNoWindow,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    range_start: "11:00",
    range_end: "13:00",
    range_timezone: "Asia/Kolkata",
    rsi_period: 14,
    rsi_overbought: 60,
    rsi_oversold: 40,
  },
  analyze(candles, values) {
    const timeZone = str(values, "range_timezone", "Asia/Kolkata");
    const startMin = parseHhMm(str(values, "range_start", "11:00"));
    const endMin = parseHhMm(str(values, "range_end", "13:00"));
    const period = num(values, "rsi_period", 14);
    const upper = num(values, "rsi_overbought", 60);
    const lower = num(values, "rsi_oversold", 40);

    if (startMin == null || endMin == null || startMin >= endMin) {
      return {
        candles,
        overlays: [],
        signal: {
          headline: "Range window galat hai",
          detail: "Start time end time se pehle honi chahiye (HH:MM).",
          tone: "neutral",
          readouts: [],
        },
      };
    }
    if (candles.length < period + 2) return emptyAnalysis(candles);

    const rsiSeries = rsi(candles.map((c) => c.close), period);
    const decorated = candles.map((candle, i) => ({ ...candle, rsi: rsiSeries[i] }));

    // Sirf aakhri local din ki candles chahiye — poori history scan karne ki zarurat nahi.
    const lastStamp = localStamp(candles[candles.length - 1].time, timeZone);
    if (!lastStamp) return emptyAnalysis(decorated);

    const today: { index: number; stamp: LocalStamp }[] = [];
    for (let i = candles.length - 1; i >= 0; i--) {
      const stamp = localStamp(candles[i].time, timeZone);
      if (!stamp) continue;
      if (stamp.dayKey !== lastStamp.dayKey) break;
      today.unshift({ index: i, stamp });
    }

    const inWindow = today.filter((c) => c.stamp.minutes >= startMin && c.stamp.minutes < endMin);
    const afterWindow = today.filter((c) => c.stamp.minutes >= endMin);
    const last = decorated[decorated.length - 1];
    const lastRsi = rsiSeries[rsiSeries.length - 1];
    const nowMinutes = lastStamp.minutes;

    const baseReadouts: LiveReadout[] = [
      { label: "Price", value: price(last.close) },
      { label: `RSI ${period}`, value: lastRsi == null ? "—" : lastRsi.toFixed(1) },
    ];

    if (inWindow.length === 0) {
      const headline = nowMinutes < startMin
        ? `Range window abhi shuru nahi hua (${str(values, "range_start", "11:00")})`
        : "Aaj is window ki candles nahi mili";
      return {
        candles: decorated,
        overlays: [],
        signal: {
          headline,
          detail: `Window ${str(values, "range_start", "11:00")}–${str(values, "range_end", "13:00")} ${timeZone}. Chart history badhao ya chhota timeframe chuno.`,
          tone: "neutral",
          readouts: baseReadouts,
        },
      };
    }

    const rangeHigh = Math.max(...inWindow.map((c) => candles[c.index].high));
    const rangeLow = Math.min(...inWindow.map((c) => candles[c.index].low));
    const rangeReadouts: LiveReadout[] = [
      { label: "Range high", value: price(rangeHigh), color: "var(--green)" },
      { label: "Range low", value: price(rangeLow), color: "var(--red)" },
      ...baseReadouts,
    ];

    if (nowMinutes < endMin) {
      return {
        candles: decorated,
        overlays: [],
        signal: {
          headline: "Range ban raha hai",
          detail: `Window ${str(values, "range_end", "13:00")} par band hoga, phir breakout dekha jayega.`,
          tone: "neutral",
          readouts: rangeReadouts,
        },
      };
    }

    // Window ke baad wahi kram jo backend chalata hai: breakout candle, phir uske
    // high/low ka break + RSI confirmation.
    let breakoutLong: { high: number } | null = null;
    let breakoutShort: { low: number } | null = null;
    let signal: LiveSignal = {
      headline: "Range ban chuki hai — breakout ka intezaar",
      detail: "Abhi tak koi candle range ke bahar close nahi hui.",
      tone: "neutral",
      readouts: rangeReadouts,
    };

    for (const { index } of afterWindow) {
      const candle = candles[index];
      const candleRsi = rsiSeries[index];
      if (!breakoutLong && candle.close > rangeHigh) {
        breakoutLong = { high: candle.high };
        signal = {
          headline: "Breakout candle upar bani — trigger ka intezaar",
          detail: `Entry tabhi jab koi candle ${price(breakoutLong.high)} tode aur RSI ${upper} se upar ho.`,
          tone: "neutral",
          readouts: rangeReadouts,
        };
        continue;
      }
      if (!breakoutShort && candle.close < rangeLow) {
        breakoutShort = { low: candle.low };
        signal = {
          headline: "Breakout candle neeche bani — trigger ka intezaar",
          detail: `Entry tabhi jab koi candle ${price(breakoutShort.low)} tode aur RSI ${lower} se neeche ho.`,
          tone: "neutral",
          readouts: rangeReadouts,
        };
        continue;
      }
      if (candleRsi == null) continue;
      if (breakoutLong && candle.high > breakoutLong.high && candleRsi > upper) {
        signal = {
          headline: "BUY — upar ka breakout trigger hua",
          detail: `Entry ${price(breakoutLong.high)} par, RSI ${candleRsi.toFixed(1)} (> ${upper}).`,
          tone: "buy",
          readouts: rangeReadouts,
        };
        breakoutLong = null;
        continue;
      }
      if (breakoutShort && candle.low < breakoutShort.low && candleRsi < lower) {
        signal = {
          headline: "SELL — neeche ka breakout trigger hua",
          detail: `Entry ${price(breakoutShort.low)} par, RSI ${candleRsi.toFixed(1)} (< ${lower}).`,
          tone: "sell",
          readouts: rangeReadouts,
        };
        breakoutShort = null;
      }
    }

    return { candles: decorated, overlays: [], signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      strategy: "range-breakout",
      use_rsi_filter: true,
      rsi_period: num(values, "rsi_period", 14),
      rsi_overbought: num(values, "rsi_overbought", 60),
      rsi_oversold: num(values, "rsi_oversold", 40),
      range_start: str(values, "range_start", "11:00"),
      range_end: str(values, "range_end", "13:00"),
      range_timezone: str(values, "range_timezone", "Asia/Kolkata"),
    };
  },
};

/**
 * Strategy A — OTM Directional Option Buying.
 *
 * Spec "app algo strategy.docx" se: 15M par market regime tay hota hai, 5M par
 * entry confirm hoti hai, aur 6-point entry score minimum 5/6 hona chahiye tabhi
 * trade. Strike fixed "5% OTM" se nahi, Delta band (0.25-0.35) se chunta hai —
 * wo kaam option chain panel karta hai.
 *
 * Regime timeframe = entry timeframe x3 (doc ka 5M/15M pair). Candles ek hi baar
 * entry timeframe par aati hain aur 15M unhi se resample hota hai, isliye dono
 * hamesha ek hi data par bane rehte hain.
 */
const otmDirectional: StrategyDef = {
  id: "otm-directional",
  name: "OTM Directional",
  category: "Options · directional",
  blurb:
    "15M par trend regime (EMA + VWAP + ADX), 5M par breakout entry. Strong bullish par OTM Call, strong bearish par OTM Put.",
  logic:
    "Pehle 15M par regime: EMA 9 > EMA 21, price VWAP ke upar, aur ADX 20 se upar — tabhi market ko trending maana jata hai. Phir 5M par entry confirmation: EMA 9 > EMA 21, price recent swing high ke upar close kare, aur volume average se zyada ho. Chhe conditions ka score banta hai aur kam se kam 5/6 chahiye. Bearish taraf sab ulta — SELL nahi, OTM Put buy. Strike Delta 0.25-0.35 band se chunta hai, fixed percentage se nahi.",
  accent: "#7c3aed",
  icon: Target,
  backtestable: false,
  optionChain: { bullish: "call", bearish: "put" },
  engineNote:
    "Ye options strategy hai — humara backtest engine sirf perpetual candles par chalta hai, isliye iska backtest button nahi hai. Signal engine poora doc ke hisaab se hai; premium par SL/target aur time-exit rules parameters mein hain par unhe execute karne ke liye options order routing chahiye, jo abhi nahi hai.",
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 10, max: 60, onCard: true, hint: "Isse neeche market range-bound maana jata hai." },
    { key: "volume_lookback", label: "Volume average · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Minimum score (of 6)", kind: "number", group: "signal", min: 3, max: 6 },
    ...marketFields,
    { key: "delta_min", label: "Strike delta · min", kind: "number", group: "risk", min: 0.05, max: 0.9, step: 0.01 },
    { key: "delta_max", label: "Strike delta · max", kind: "number", group: "risk", min: 0.05, max: 0.9, step: 0.01 },
    { key: "sl_premium_pct", label: "Stop loss · % premium", kind: "number", group: "risk", min: 10, max: 90, hint: "Doc: 40-50% premium loss par exit." },
    { key: "tp1_pct", label: "Partial book · % gain", kind: "number", group: "risk", min: 20, max: 500, hint: "+100% par aadhi quantity book." },
    { key: "tp2_pct", label: "Final target · % gain", kind: "number", group: "risk", min: 20, max: 1000 },
    { key: "time_exit_hours", label: "Expiry se pehle exit · hours", kind: "number", group: "risk", min: 0.5, max: 24, step: 0.5 },
    { key: "max_spread_pct", label: "Max bid/ask spread · %", kind: "number", group: "risk", min: 0.5, max: 30, step: 0.5 },
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    ema_fast: 9,
    ema_slow: 21,
    adx_period: 14,
    adx_min: 20,
    volume_lookback: 20,
    swing_span: 3,
    min_score: 5,
    delta_min: 0.25,
    delta_max: 0.35,
    sl_premium_pct: 45,
    tp1_pct: 100,
    tp2_pct: 200,
    time_exit_hours: 2,
    max_spread_pct: 5,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 20);
    const volLookback = num(values, "volume_lookback", 20);
    const span = Math.max(1, num(values, "swing_span", 3));
    const minScore = num(values, "min_score", 5);

    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
      { key: "vwap", label: "VWAP", color: THIRD_COLOR },
    ];

    // Regime timeframe = entry ka 3x (5M -> 15M), doc ke pair ke hisaab se.
    const entryMinutes = intervalMinutes(str(values, "timeframe", "5m"));
    const regime = resample(candles, entryMinutes * 3);
    if (candles.length < 60 || regime.length < adxPeriod * 2 + 2) {
      return emptyAnalysis(candles, overlays);
    }

    // ── 15M regime ──────────────────────────────────────
    const rCloses = regime.map((c) => c.close);
    const rFast = ema(rCloses, fast);
    const rSlow = ema(rCloses, slow);
    const rVwap = vwap(regime);
    const rAdx = adx(regime, adxPeriod);
    const rLast = regime.length - 1;

    const emaFastNow = rFast[rLast];
    const emaSlowNow = rSlow[rLast];
    const vwapNow = rVwap[rLast];
    const adxNow = rAdx[rLast].adx;
    const regimePrice = regime[rLast].close;
    // Doc section 3/4: core conditions ke upar "additional confirmation" —
    // EMA 9 ka slope bhi bias ki taraf hona chahiye, tabhi regime maana jayega.
    const emaSlopeUp = rFast[rLast] > rFast[rLast - 1];
    const emaSlopeDown = rFast[rLast] < rFast[rLast - 1];
    const regimeAvgVol = averageVolume(regime, volLookback);
    const regimeVolOk = regimeAvgVol != null && regime[rLast].volume > regimeAvgVol;

    const trendUp = emaFastNow > emaSlowNow;
    const aboveVwap = vwapNow != null && regimePrice > vwapNow;
    const belowVwap = vwapNow != null && regimePrice < vwapNow;
    const adxOk = adxNow != null && adxNow >= adxMin;

    // ── 5M entry ────────────────────────────────────────
    const closes = candles.map((c) => c.close);
    const eFast = ema(closes, fast);
    const eSlow = ema(closes, slow);
    const last = candles.length - 1;
    const entryPrice = candles[last].close;
    const entryTrendUp = eFast[last] > eSlow[last];
    const avgVol = averageVolume(candles, volLookback);
    const volOk = avgVol != null && (candles[last].volume ?? 0) > avgVol;
    // Swing pivot mein aakhri `span` bars abhi confirm nahi hote, isliye breakout
    // check unse pehle wale confirmed swing ke against hota hai.
    const swingHigh = lastSwingHigh(candles, span);
    const swingLow = lastSwingLow(candles, span);
    const brokeHigh = swingHigh != null && entryPrice > swingHigh;
    const brokeLow = swingLow != null && entryPrice < swingLow;

    const bullish = trendUp && aboveVwap && emaSlopeUp;
    const bearish = !trendUp && belowVwap && emaSlopeDown;
    const direction: "bull" | "bear" | null = bullish ? "bull" : bearish ? "bear" : null;
    // Slope ke alawa sab theek ho to user ko wajah dikhni chahiye.
    const slopeBlocked = !direction && ((trendUp && aboveVwap) || (!trendUp && belowVwap));

    // ── Entry score (doc: 6 confirmations, minimum 5) ───
    const checks = direction === "bear"
      ? [
          { label: `EMA ${fast} < EMA ${slow} (15M)`, ok: !trendUp },
          { label: "Price < VWAP (15M)", ok: belowVwap },
          { label: `ADX >= ${adxMin}`, ok: adxOk },
          { label: "Volume confirmation", ok: volOk || regimeVolOk },
          { label: "Swing low breakdown", ok: brokeLow },
          { label: "Entry timeframe confirmation", ok: !entryTrendUp },
        ]
      : [
          { label: `EMA ${fast} > EMA ${slow} (15M)`, ok: trendUp },
          { label: "Price > VWAP (15M)", ok: aboveVwap },
          { label: `ADX >= ${adxMin}`, ok: adxOk },
          { label: "Volume confirmation", ok: volOk || regimeVolOk },
          { label: "Swing high breakout", ok: brokeHigh },
          { label: "Entry timeframe confirmation", ok: entryTrendUp },
        ];
    const score = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).map((c) => c.label);

    const decorated = attachEma(candles, [fast, slow]).map((candle, i) => ({
      ...candle,
      vwap: vwap(candles)[i],
    })) as Candle[];

    let signal: LiveSignal;
    if (!adxOk) {
      signal = {
        headline: "NO TRADE — market trending nahi hai",
        detail: `ADX ${adxNow?.toFixed(1) ?? "—"} aur threshold ${adxMin} hai. Range regime mein ye strategy entry nahi leti.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (direction === "bull" && score >= minScore) {
      signal = {
        headline: "BUY CALL — bullish setup confirmed",
        detail: `Entry score ${score}/6. Strike Delta ${num(values, "delta_min", 0.25)}-${num(values, "delta_max", 0.35)} band se — neeche option chain dekhein.`,
        tone: "buy",
        readouts: [],
      };
    } else if (direction === "bear" && score >= minScore) {
      signal = {
        headline: "BUY PUT — bearish setup confirmed",
        detail: `Entry score ${score}/6. Strike Delta ${num(values, "delta_min", 0.25)}-${num(values, "delta_max", 0.35)} band se — neeche option chain dekhein.`,
        tone: "sell",
        readouts: [],
      };
    } else {
      const bias = direction === "bull" ? "Bullish" : direction === "bear" ? "Bearish" : "Mixed";
      const reasons = [...failed];
      if (slopeBlocked) reasons.push(`EMA ${fast} ka slope bias ke against hai`);
      signal = {
        headline: `${bias} — abhi entry nahi (${score}/6)`,
        detail: reasons.length ? `Baaki hai: ${reasons.join(", ")}.` : `Minimum ${minScore}/6 chahiye.`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Entry score", value: `${score}/6`, color: score >= minScore ? "var(--green)" : "var(--text-primary)" },
      { label: `ADX ${adxPeriod} (15M)`, value: adxNow?.toFixed(1) ?? "—", color: adxOk ? "var(--green)" : "var(--red)" },
      { label: "VWAP (15M)", value: price(vwapNow), color: THIRD_COLOR },
      { label: "Price", value: price(candles[last].close) },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    // backtestable: false hai, par interface ke liye sabse nazdeek mapping.
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

export const STRATEGIES: StrategyDef[] = [emaCrossover, rsiDivergence, macdStrategy, customEma, rangeBreakout, otmDirectional];

export function getStrategy(id: string | undefined): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

export function visibleFields(def: StrategyDef, values: StrategyValues): StrategyField[] {
  return def.fields.filter((f) => !f.showIf || f.showIf(values));
}

/* ── URL <-> values ────────────────────────────────────── */

function clampNumber(field: StrategyField, raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  let value = raw;
  if (field.min != null) value = Math.max(field.min, value);
  if (field.max != null) value = Math.min(field.max, value);
  return value;
}

/** Query string se values banao — har value validate hoti hai, defaults fallback hain. */
export function valuesFromQuery(def: StrategyDef, query: URLSearchParams | null): StrategyValues {
  const values: StrategyValues = { ...def.defaults };
  if (!query) return values;

  for (const field of def.fields) {
    const raw = query.get(field.key);
    if (raw == null) continue;
    const fallback = def.defaults[field.key];
    switch (field.kind) {
      case "number":
        values[field.key] = clampNumber(field, Number(raw), Number(fallback));
        break;
      case "toggle":
        values[field.key] = raw === "true";
        break;
      case "symbol":
        if (CRYPTO_SYMBOLS.some((s) => s.value === raw)) values[field.key] = raw;
        break;
      case "interval":
        if (CRYPTO_INTERVALS.some((s) => s.value === raw)) values[field.key] = raw;
        break;
      case "time":
        if (parseHhMm(raw) != null) values[field.key] = raw;
        break;
      case "select":
        if (field.options?.some((o) => o.value === raw)) values[field.key] = raw;
        break;
    }
  }
  return values;
}

/** Card ke tuned params detail page tak le jaane ke liye. */
export function queryFromValues(def: StrategyDef, values: StrategyValues): string {
  const query = new URLSearchParams();
  for (const field of def.fields) {
    const value = values[field.key];
    if (value == null || value === def.defaults[field.key]) continue;
    query.set(field.key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function strategyHref(def: StrategyDef, values?: StrategyValues): string {
  return `/trade/strategies/${def.id}${values ? queryFromValues(def, values) : ""}`;
}

/* ── Active strategies (browser-local) ─────────────────── */

const ACTIVE_KEY = "arjunai_active_strategies";
export const STRATEGIES_CHANGED_EVENT = "arjunai:strategies-changed";

export function readActiveStrategies(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    // Private mode / blocked storage — activation sirf is tab tak rahegi.
    return {};
  }
}

export function writeActiveStrategy(id: string, active: boolean): void {
  if (typeof window === "undefined") return;
  const next = { ...readActiveStrategies() };
  if (active) next[id] = true;
  else delete next[id];
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
  } catch {
    // Storage band ho to bhi UI chalta rahe.
  }
  window.dispatchEvent(new Event(STRATEGIES_CHANGED_EVENT));
}
