import { Activity, BarChart3, Boxes, Crosshair, Flame, Gauge, Layers, Shield, Target, TrendingUp, Waves, Zap, type LucideIcon } from "lucide-react";
import type { BacktestParams, Candle } from "./cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, intervalMinutes, symbolLabel } from "./cryptoApi";
import {
  adx,
  atr,
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
import { TREND_KEYS, replayTrendRider, trendRiderQuantity } from "./trendRider";

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
  /** Condor jaisi non-directional entry — tone "neutral" rehta hai, isliye alag flag. */
  entry?: boolean;
}

export interface ChartOverlay {
  key: string;
  label: string;
  color: string;
}

/**
 * Strategy is waqt kis position mein honi chahiye — sirf band candles se nikla.
 * Paper auto-trader isi ko account se milata hai (entry, trailing stop, exit).
 */
export interface AutoTradeState {
  desired: {
    side: "long" | "short";
    /** Entry candle ka open time (ms) — ek trade ki pehchaan. */
    entryTime: number;
    stop: number;
  } | null;
  intervalMs: number;
}

export interface StrategyAnalysis {
  /** Chart ke liye candles — indicator values fields mein attach ho chuki hain. */
  candles: Candle[];
  overlays: ChartOverlay[];
  signal: LiveSignal;
  /** Sirf `autoTrade` wali strategies bharti hain. */
  autoTrade?: AutoTradeState;
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
  /**
   * Paper deploy par turant order nahi lagta — auto-trader `analysis.autoTrade` ke
   * hisaab se sirf asli signal par entry leta hai aur stop trail karta hai.
   */
  autoTrade?: boolean;
  /**
   * Chart range chhota chuna ho tab bhi kam se kam itni candles laao — EMA 200 jaisi
   * lambi lines ko settle hone ke liye, taaki live signal chart zoom par na badle.
   */
  minHistoryBars?: number;
  /** Range regime par iron condor ke chaar legs chunne hain? */
  optionCondor?: boolean;
  /** Signal aane par debit spread ke dono legs chunne hain? */
  optionSpread?: {
    bullish: "call" | "put";
    bearish: "call" | "put";
  };
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

/** Delta ki expired option listing ~2 mahine se peeche bharosemand nahi, isliye 60 din. */
const optionsBacktestFields: StrategyField[] = [
  { key: "days", label: "History · days", kind: "number", group: "backtest", min: 1, max: 60 },
  { key: "lots", label: "Contracts", kind: "number", group: "backtest", min: 1, step: 1, hint: "Delta par BTC option ka 1 contract = 0.001 BTC." },
];

const OPTIONS_ENGINE_NOTE =
  "Backtest asli Delta option data par chalta hai: har signal par us waqt listed contracts mein se wahi expiry/strike chuna jaata hai jo live rules chunte hain, aur premium Delta ke mark price se track hota hai. Purane bid/ask nahi milte, isliye har fill par max bid/ask spread ka aadha slippage lagta hai; fees shaamil nahi. Strike delta ATM IV se nikalta hai, aur liquidity (volume/OI) ka filter history mein nahi lag sakta.";

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
  optionChain: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 10, max: 60, onCard: true, hint: "Isse neeche market range-bound maana jata hai." },
    { key: "volume_lookback", label: "Volume average · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Minimum score (of 6)", kind: "number", group: "signal", min: 3, max: 6 },
    ...marketFields,
    ...optionsBacktestFields,
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
    days: 14,
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

    // VWAP ek hi baar — pehle ye map ke andar tha, matlab har candle ke liye
    // poori series dobara banti thi (4000 candles = ~1.6 crore operations har
    // render par). Chart overlay entry timeframe ka VWAP dikhata hai.
    const entryVwap = vwap(candles);
    const decorated = attachEma(candles, [fast, slow]).map((candle, i) => ({
      ...candle,
      vwap: entryVwap[i],
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
    // Options backtest `runOptionsBacktest` se chalta hai; ye sirf interface ke liye.
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/**
 * Strategy B — Debit Spreads (Bull Call / Bear Put).
 *
 * Spec doc section 11-14. Strategy A se teen farq hain:
 *  1. ADX band 20-30 — ye "moderate" trend ke liye hai. Bahut strong momentum
 *     (ADX 30+) par spread ka short leg upside kaat deta hai, wahan naked buy
 *     (Strategy A) behtar baithti hai.
 *  2. Do legs — near-the-money BUY + `width` door SELL.
 *  3. Risk math capped hai: max loss = net debit, max profit = width - debit.
 *     Exits bhi usi par lagte hain, premium % par nahi.
 */
const debitSpread: StrategyDef = {
  id: "debit-spread",
  name: "Debit Spread",
  category: "Options · moderate trend",
  blurb:
    "Moderate trend (ADX 20-30) par do-leg spread: bullish mein Bull Call, bearish mein Bear Put. Risk aur reward dono capped.",
  logic:
    "Trend ho par bahut strong na ho — 15M par EMA 9 > EMA 21, price VWAP ke upar, aur ADX 20 se 30 ke beech. 5M par breakout aur volume confirmation. Tab near-the-money call BUY karke usse upar wali call SELL kar dete hain (Bull Call Spread); bearish mein put ke saath ulta (Bear Put Spread). Short leg premium ghatata hai, theta ka nuksaan kam karta hai, par profit bhi cap kar deta hai — maximum profit = strike width minus net debit. Exit: debit ka 40-50% doob jaaye to SL, maximum profit ka 70-80% mil jaaye to book, aur expiry se 1-2 ghante pehle mandatory.",
  accent: "#0891b2",
  icon: Layers,
  optionSpread: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 5, max: 60, onCard: true },
    { key: "adx_max", label: "ADX maximum", kind: "number", group: "signal", min: 10, max: 90, onCard: true, hint: "Isse upar trend strong hai — wahan naked buy behtar." },
    { key: "volume_lookback", label: "Volume average · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Minimum score (of 5)", kind: "number", group: "signal", min: 2, max: 5 },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "spread_width", label: "Strike width", kind: "number", group: "risk", min: 100, step: 100, hint: "Dono strikes ke beech ka fasla — max profit isi se bandha hai." },
    { key: "long_delta", label: "Long leg delta", kind: "number", group: "risk", min: 0.2, max: 0.8, step: 0.05, hint: "0.5 = near the money, jaisa doc ka example." },
    { key: "sl_debit_pct", label: "Stop loss · % of debit", kind: "number", group: "risk", min: 10, max: 90, hint: "Doc: debit ka 40-50% doobne par exit." },
    { key: "tp_max_profit_pct", label: "Target · % of max profit", kind: "number", group: "risk", min: 20, max: 100, hint: "Doc: max profit ka 70-80%." },
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
    adx_max: 30,
    volume_lookback: 20,
    swing_span: 3,
    min_score: 4,
    spread_width: 2000,
    long_delta: 0.5,
    days: 14,
    sl_debit_pct: 45,
    tp_max_profit_pct: 75,
    time_exit_hours: 1.5,
    max_spread_pct: 8,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 20);
    const adxMax = num(values, "adx_max", 30);
    const volLookback = num(values, "volume_lookback", 20);
    const span = Math.max(1, num(values, "swing_span", 3));
    const minScore = num(values, "min_score", 4);

    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
      { key: "vwap", label: "VWAP", color: THIRD_COLOR },
    ];

    const entryMinutes = intervalMinutes(str(values, "timeframe", "5m"));
    const regime = resample(candles, entryMinutes * 3);
    if (candles.length < 60 || regime.length < adxPeriod * 2 + 2) {
      return emptyAnalysis(candles, overlays);
    }

    const rCloses = regime.map((c) => c.close);
    const rFast = ema(rCloses, fast);
    const rSlow = ema(rCloses, slow);
    const rVwap = vwap(regime);
    const rAdx = adx(regime, adxPeriod);
    const rLast = regime.length - 1;

    const vwapNow = rVwap[rLast];
    const adxNow = rAdx[rLast].adx;
    const regimePrice = regime[rLast].close;
    const regimeAvgVol = averageVolume(regime, volLookback);
    const regimeVolOk = regimeAvgVol != null && regime[rLast].volume > regimeAvgVol;

    const trendUp = rFast[rLast] > rSlow[rLast];
    const aboveVwap = vwapNow != null && regimePrice > vwapNow;
    const belowVwap = vwapNow != null && regimePrice < vwapNow;
    // Yahi Strategy A se asli farq hai — band, threshold nahi.
    const adxInBand = adxNow != null && adxNow >= adxMin && adxNow <= adxMax;
    const adxTooStrong = adxNow != null && adxNow > adxMax;

    const entryVwap = vwap(candles);
    const closes = candles.map((c) => c.close);
    const eFast = ema(closes, fast);
    const eSlow = ema(closes, slow);
    const last = candles.length - 1;
    const entryPrice = candles[last].close;
    const entryTrendUp = eFast[last] > eSlow[last];
    const avgVol = averageVolume(candles, volLookback);
    const volOk = avgVol != null && (candles[last].volume ?? 0) > avgVol;
    const swingHigh = lastSwingHigh(candles, span);
    const swingLow = lastSwingLow(candles, span);
    const brokeHigh = swingHigh != null && entryPrice > swingHigh;
    const brokeLow = swingLow != null && entryPrice < swingLow;

    const direction: "bull" | "bear" | null =
      trendUp && aboveVwap ? "bull" : !trendUp && belowVwap ? "bear" : null;

    // Doc section 12 ki 5 conditions.
    const checks = direction === "bear"
      ? [
          { label: `EMA ${fast} < EMA ${slow} (15M)`, ok: !trendUp },
          { label: "Price < VWAP (15M)", ok: belowVwap },
          { label: `ADX ${adxMin}-${adxMax} band mein`, ok: adxInBand },
          { label: "Swing low breakdown (5M)", ok: brokeLow && !entryTrendUp },
          { label: "Volume confirmation", ok: volOk || regimeVolOk },
        ]
      : [
          { label: `EMA ${fast} > EMA ${slow} (15M)`, ok: trendUp },
          { label: "Price > VWAP (15M)", ok: aboveVwap },
          { label: `ADX ${adxMin}-${adxMax} band mein`, ok: adxInBand },
          { label: "Swing high breakout (5M)", ok: brokeHigh && entryTrendUp },
          { label: "Volume confirmation", ok: volOk || regimeVolOk },
        ];
    const score = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).map((c) => c.label);

    const decorated = attachEma(candles, [fast, slow]).map((candle, i) => ({
      ...candle,
      vwap: entryVwap[i],
    })) as Candle[];

    let signal: LiveSignal;
    if (adxNow != null && adxNow < adxMin) {
      signal = {
        headline: "NO TRADE — trend kamzor hai",
        detail: `ADX ${adxNow.toFixed(1)}, band ${adxMin}-${adxMax}. Range mein spread ka debit theta khaa jaata hai.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (adxTooStrong) {
      signal = {
        headline: "Trend bahut strong — spread ke liye nahi",
        detail: `ADX ${adxNow?.toFixed(1)} band ke upar hai. Itne strong move mein short leg upside kaat dega — naked buy (OTM Directional) behtar baithegi.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (direction === "bull" && score >= minScore) {
      signal = {
        headline: "BULL CALL SPREAD — bullish setup confirmed",
        detail: `Score ${score}/5. Near-the-money call BUY + ${num(values, "spread_width", 2000)} upar wali call SELL — neeche legs dekhein.`,
        tone: "buy",
        readouts: [],
      };
    } else if (direction === "bear" && score >= minScore) {
      signal = {
        headline: "BEAR PUT SPREAD — bearish setup confirmed",
        detail: `Score ${score}/5. Near-the-money put BUY + ${num(values, "spread_width", 2000)} neeche wali put SELL — neeche legs dekhein.`,
        tone: "sell",
        readouts: [],
      };
    } else {
      const bias = direction === "bull" ? "Bullish" : direction === "bear" ? "Bearish" : "Mixed";
      signal = {
        headline: `${bias} — abhi entry nahi (${score}/5)`,
        detail: failed.length ? `Baaki hai: ${failed.join(", ")}.` : `Minimum ${minScore}/5 chahiye.`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Entry score", value: `${score}/5`, color: score >= minScore ? "var(--green)" : "var(--text-primary)" },
      {
        label: `ADX ${adxPeriod} (15M)`,
        value: adxNow?.toFixed(1) ?? "—",
        color: adxInBand ? "var(--green)" : adxTooStrong ? "var(--amber)" : "var(--red)",
      },
      { label: "VWAP (15M)", value: price(vwapNow), color: THIRD_COLOR },
      { label: "Price", value: price(entryPrice) },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/**
 * Strategy C — Iron Condor.
 *
 * Spec doc section 15-20. A aur B trend par paise banate hain; ye uske ulta hai —
 * market kahin na jaaye to profit. Isliye regime check bhi ulta hai: ADX 20 se
 * NEECHE, EMA flat, price range ke andar.
 *
 * Doc saaf kehta hai "ye daily trade nahi karega" — signal kam aayenge, aur wahi
 * theek hai.
 */
const ironCondor: StrategyDef = {
  id: "iron-condor",
  name: "Iron Condor",
  category: "Options · range",
  blurb:
    "Range market (ADX < 20, flat EMA) mein chaar legs bech-khareed kar premium collect karti hai. Trend aaya to nuksaan.",
  logic:
    "Market kahin nahi jaa raha — ADX 20 se neeche, EMA 9 aur 21 lagbhag barabar, price apni range ke andar, aur volatility shaant. Tab upar ek call bech kar usse door wali call khareedte hain, aur neeche ek put bech kar usse door wali put. Short legs ~0.15-0.20 delta par, protection ~0.05-0.10 par. Price dono short strikes ke beech rahe to poora credit milta hai. Max loss = bada wing minus credit. Exit: credit ka aadha profit ban jaaye to book, ya nuksaan credit ke 1.5 guna ho jaaye to nikal jao. Short strike ka delta bahut badh jaaye to bhi turant nikalna hai.",
  accent: "#d97706",
  icon: Waves,
  optionCondor: true,
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "adx_max", label: "ADX maximum", kind: "number", group: "signal", min: 5, max: 40, onCard: true, hint: "Isse upar trend hai — condor ke liye nahi." },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100 },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200 },
    { key: "ema_gap_pct", label: "EMA gap · max %", kind: "number", group: "signal", min: 0.01, max: 2, step: 0.01, onCard: true, hint: "EMA 9 aur 21 itne paas hon tabhi 'flat' maana jayega." },
    { key: "range_lookback", label: "Range lookback · bars", kind: "number", group: "signal", min: 20, max: 300 },
    { key: "range_buffer_pct", label: "Range edge buffer · %", kind: "number", group: "signal", min: 1, max: 40, hint: "Price range ke kinare se itna door ho — warna breakout ka risk." },
    { key: "atr_spike_mult", label: "ATR spike limit · x", kind: "number", group: "signal", min: 1, max: 5, step: 0.1, hint: "Current ATR apne average se itna guna se zyada ho to volatility spike." },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "short_delta", label: "Short legs delta", kind: "number", group: "risk", min: 0.05, max: 0.4, step: 0.005, hint: "Doc: 0.15-0.20." },
    { key: "long_delta", label: "Protection delta", kind: "number", group: "risk", min: 0.01, max: 0.2, step: 0.005, hint: "Doc: 0.05-0.10." },
    { key: "max_iv_pct", label: "Max IV · %", kind: "number", group: "risk", min: 10, max: 200, hint: "Isse upar IV elevated maani jayegi — doc naye entries block karta hai." },
    { key: "tp_credit_pct", label: "Target · % of credit", kind: "number", group: "risk", min: 10, max: 100, hint: "Doc: credit ka ~50% profit book." },
    { key: "sl_credit_mult", label: "Stop loss · x credit", kind: "number", group: "risk", min: 1, max: 5, step: 0.1, hint: "Doc: 1.5x credit, configurable." },
    { key: "emergency_delta", label: "Emergency exit delta", kind: "number", group: "risk", min: 0.2, max: 0.8, step: 0.05, hint: "Short strike ka delta isse upar gaya to defensive action." },
    { key: "time_exit_hours", label: "Expiry se pehle exit · hours", kind: "number", group: "risk", min: 1, max: 72, step: 1 },
    { key: "max_spread_pct", label: "Max bid/ask spread · %", kind: "number", group: "risk", min: 0.5, max: 30, step: 0.5 },
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    adx_max: 20,
    adx_period: 14,
    ema_fast: 9,
    ema_slow: 21,
    ema_gap_pct: 0.15,
    range_lookback: 96,
    range_buffer_pct: 15,
    atr_spike_mult: 1.8,
    days: 14,
    short_delta: 0.175,
    long_delta: 0.075,
    max_iv_pct: 60,
    tp_credit_pct: 50,
    sl_credit_mult: 1.5,
    emergency_delta: 0.35,
    time_exit_hours: 12,
    max_spread_pct: 10,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMax = num(values, "adx_max", 20);
    const gapLimit = num(values, "ema_gap_pct", 0.15);
    const lookback = Math.max(20, num(values, "range_lookback", 96));
    const bufferPct = num(values, "range_buffer_pct", 15);
    const atrMult = num(values, "atr_spike_mult", 1.8);

    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (candles.length < Math.max(lookback, adxPeriod * 3) + 2) {
      return emptyAnalysis(candles, overlays);
    }

    const closes = candles.map((c) => c.close);
    const eFast = ema(closes, fast);
    const eSlow = ema(closes, slow);
    const adxSeries = adx(candles, adxPeriod);
    const atrSeries = atr(candles, adxPeriod);
    const last = candles.length - 1;
    const spot = candles[last].close;

    const adxNow = adxSeries[last].adx;
    const adxCalm = adxNow != null && adxNow < adxMax;

    // EMA "≈" ka matlab: dono ke beech ka fasla price ke % mein chhota ho.
    const emaGapPct = (Math.abs(eFast[last] - eSlow[last]) / spot) * 100;
    const emaFlat = emaGapPct <= gapLimit;

    // Established range: pichhle N bars ka high/low.
    const window = candles.slice(-lookback);
    const rangeHigh = Math.max(...window.map((c) => c.high));
    const rangeLow = Math.min(...window.map((c) => c.low));
    const rangeSize = rangeHigh - rangeLow;
    const buffer = (rangeSize * bufferPct) / 100;
    const insideRange = rangeSize > 0 && spot > rangeLow + buffer && spot < rangeHigh - buffer;
    // Breakout: aakhri kuch bars mein range toota to nahi.
    const recent = candles.slice(-Math.max(3, Math.round(lookback / 12)));
    const noBreakout =
      rangeSize > 0 &&
      !recent.some((c) => c.high > rangeHigh - buffer * 0.2 || c.low < rangeLow + buffer * 0.2);

    // Volatility spike (doc section 6) — ATR apne average se kitna upar hai.
    const atrNow = atrSeries[last];
    const atrValues = atrSeries.slice(-lookback).filter((v): v is number => v != null);
    const atrAvg = atrValues.length ? atrValues.reduce((a, b) => a + b, 0) / atrValues.length : null;
    const atrCalm = atrNow != null && atrAvg != null && atrAvg > 0 ? atrNow / atrAvg <= atrMult : false;

    const checks = [
      { label: `ADX < ${adxMax}`, ok: adxCalm },
      { label: `EMA gap <= ${gapLimit}%`, ok: emaFlat },
      { label: "Price range ke andar", ok: insideRange },
      { label: "Koi fresh breakout nahi", ok: noBreakout },
      { label: "Volatility shaant (ATR)", ok: atrCalm },
    ];
    const score = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).map((c) => c.label);
    const decorated = attachEma(candles, [fast, slow]);

    let signal: LiveSignal;
    if (score === checks.length) {
      signal = {
        headline: "IRON CONDOR — range regime confirmed",
        detail: `Range ${price(rangeLow)}-${price(rangeHigh)}. Neeche legs aur credit dekhein; entry se pehle IV bhi check karein.`,
        tone: "neutral",
        readouts: [],
        entry: true,
      };
    } else if (!adxCalm) {
      signal = {
        headline: "NO TRADE — market trend mein hai",
        detail: `ADX ${adxNow?.toFixed(1) ?? "—"}, chahiye ${adxMax} se kam. Trending market condor ke short strikes tod deta hai.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: `Range ban raha hai — abhi entry nahi (${score}/5)`,
        detail: `Baaki hai: ${failed.join(", ")}.`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Setup score", value: `${score}/5`, color: score === checks.length ? "var(--green)" : "var(--text-primary)" },
      { label: `ADX ${adxPeriod}`, value: adxNow?.toFixed(1) ?? "—", color: adxCalm ? "var(--green)" : "var(--red)" },
      { label: "EMA gap", value: `${emaGapPct.toFixed(2)}%`, color: emaFlat ? "var(--green)" : "var(--red)" },
      { label: "Range", value: `${price(rangeLow)} – ${price(rangeHigh)}` },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/* ── Futures / perpetual · pro ─────────────────────────── */

/**
 * ATR Channel Breakout — futures trend continuation.
 * Price jab ATR bands (EMA ± ATR×mult) todta hai aur ADX strong ho, tabhi entry.
 */
const atrChannelPro: StrategyDef = {
  id: "atr-channel-pro",
  name: "ATR Channel Breakout",
  category: "Futures · breakout · pro",
  blurb:
    "EMA ke aas-paas ATR channel. Price channel todkar band ke bahar close kare aur ADX strong ho — futures trend entry.",
  logic:
    "Midline = EMA(period). Upper = midline + ATR×multiplier, lower = midline − ATR×multiplier. Bullish: close upper band ke upar + ADX ≥ min + volume average se upar. Bearish: close lower band ke neeche + same filters. Whipsaw kam karne ke liye ADX filter zaroori hai — sideways mein channel repeatedly toot-ta hai.",
  accent: "#0ca678",
  icon: Flame,
  featured: true,
  engineNote:
    "Live signal ATR channel + ADX par chalta hai. Backtest backend ke EMA crossover engine par approximate hai (fast/slow = EMA period / 2×period) — ATR breakout ka exact replica nahi.",
  fields: [
    { key: "ema_period", label: "EMA period", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "atr_period", label: "ATR period", kind: "number", group: "signal", min: 5, max: 50, onCard: true },
    { key: "atr_mult", label: "ATR multiplier", kind: "number", group: "signal", min: 0.5, max: 5, step: 0.1, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 10, max: 50, onCard: true },
    { key: "volume_lookback", label: "Volume avg · bars", kind: "number", group: "signal", min: 5, max: 100 },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    ema_period: 21,
    atr_period: 14,
    atr_mult: 2,
    adx_period: 14,
    adx_min: 22,
    volume_lookback: 20,
    sl_points: 500,
    target_points: 1200,
  },
  analyze(candles, values) {
    const emaPeriod = num(values, "ema_period", 21);
    const atrPeriod = num(values, "atr_period", 14);
    const mult = num(values, "atr_mult", 2);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 22);
    const volLookback = num(values, "volume_lookback", 20);
    const overlays: ChartOverlay[] = [
      { key: emaKey(emaPeriod), label: `EMA ${emaPeriod}`, color: FAST_COLOR },
    ];
    if (candles.length < Math.max(emaPeriod, atrPeriod, adxPeriod) + 5) {
      return emptyAnalysis(candles, overlays);
    }

    const closes = candles.map((c) => c.close);
    const mid = ema(closes, emaPeriod);
    const atrLine = atr(candles, atrPeriod);
    const adxLine = adx(candles, adxPeriod);
    const avgVol = averageVolume(candles, volLookback);
    const last = candles.length - 1;
    const m = mid[last];
    const a = atrLine[last];
    const adxNow = adxLine[last]?.adx;
    const upper = m != null && a != null ? m + a * mult : null;
    const lower = m != null && a != null ? m - a * mult : null;
    const prevUpper = mid[last - 1] != null && atrLine[last - 1] != null
      ? (mid[last - 1] as number) + (atrLine[last - 1] as number) * mult
      : null;
    const prevLower = mid[last - 1] != null && atrLine[last - 1] != null
      ? (mid[last - 1] as number) - (atrLine[last - 1] as number) * mult
      : null;

    const decorated = candles.map((c, i) => {
      const next: Candle = { ...c, [emaKey(emaPeriod)]: mid[i] };
      if (mid[i] != null && atrLine[i] != null) {
        next.ema_9 = mid[i]! + atrLine[i]! * mult; // upper for chart readout reuse
        next.ema_21 = mid[i]! - atrLine[i]! * mult; // lower
      }
      return next;
    });

    const close = candles[last].close;
    const prevClose = candles[last - 1].close;
    const volOk = avgVol != null && (candles[last].volume ?? 0) > avgVol;
    const trendOk = adxNow != null && adxNow >= adxMin;
    const breakUp = upper != null && prevUpper != null && prevClose <= prevUpper && close > upper;
    const breakDown = lower != null && prevLower != null && prevClose >= prevLower && close < lower;

    let signal: LiveSignal;
    if (breakUp && trendOk && volOk) {
      signal = {
        headline: "LONG — ATR upper channel break",
        detail: `Close ${price(close)} > upper ${price(upper)} · ADX ${adxNow?.toFixed(1)}`,
        tone: "buy",
        readouts: [],
      };
    } else if (breakDown && trendOk && volOk) {
      signal = {
        headline: "SHORT — ATR lower channel break",
        detail: `Close ${price(close)} < lower ${price(lower)} · ADX ${adxNow?.toFixed(1)}`,
        tone: "sell",
        readouts: [],
      };
    } else if (upper != null && close > upper && !trendOk) {
      signal = { headline: "Break up — ADX weak, skip", detail: "Channel toot gaya par trend strength nahi.", tone: "neutral", readouts: [] };
    } else if (lower != null && close < lower && !trendOk) {
      signal = { headline: "Break down — ADX weak, skip", detail: "Channel toot gaya par trend strength nahi.", tone: "neutral", readouts: [] };
    } else {
      signal = { headline: "Inside ATR channel — wait", tone: "neutral", readouts: [] };
    }

    signal.readouts = [
      { label: "Upper", value: price(upper), color: "var(--green)" },
      { label: "Lower", value: price(lower), color: "var(--red)" },
      { label: `ADX ${adxPeriod}`, value: adxNow?.toFixed(1) ?? "—", color: trendOk ? "var(--green)" : "var(--amber)" },
      { label: "Volume", value: volOk ? "Above avg" : "Weak", color: volOk ? "var(--green)" : "var(--text-muted)" },
    ];
    return {
      candles: decorated,
      overlays: [
        ...overlays,
        { key: "ema_9", label: `Upper · ${mult}×ATR`, color: "#059669" },
        { key: "ema_21", label: `Lower · ${mult}×ATR`, color: "#dc2626" },
      ],
      signal,
    };
  },
  toBacktest(values) {
    const period = num(values, "ema_period", 21);
    return {
      ...baseParams(values),
      ema9: Math.max(2, Math.round(period / 2)),
      ema21: period,
      ema50: period * 2,
    };
  },
};

/**
 * VWAP Reclaim — futures momentum after mean-reversion dip.
 */
const vwapReclaimPro: StrategyDef = {
  id: "vwap-reclaim-pro",
  name: "VWAP Reclaim",
  category: "Futures · momentum · pro",
  blurb:
    "Price VWAP ke neeche dip karke wapas reclaim kare + EMA trend align + volume spike — futures long/short momentum.",
  logic:
    "UTC-day VWAP midline. Long: pehli bar VWAP ke neeche (ya touch), agli bar VWAP ke upar close + EMA fast > slow + volume > average. Short: mirror. Pro traders isko session open / trend day par use karte hain — VWAP reclaim often institutional flow ka signal hota hai.",
  accent: "#0891b2",
  icon: Crosshair,
  featured: true,
  engineNote:
    "Live signal VWAP reclaim + EMA align + volume par. Backtest EMA crossover approximation hai — VWAP session logic backend engine mein nahi hai.",
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "volume_lookback", label: "Volume avg · bars", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50 },
    { key: "require_rsi", label: "RSI not extreme", kind: "toggle", group: "signal", hint: "Long par RSI < overbought, short par RSI > oversold." },
    { key: "rsi_overbought", label: "RSI overbought", kind: "number", group: "signal", min: 50, max: 90, showIf: (v) => bool(v, "require_rsi") },
    { key: "rsi_oversold", label: "RSI oversold", kind: "number", group: "signal", min: 10, max: 50, showIf: (v) => bool(v, "require_rsi") },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    ema_fast: 9,
    ema_slow: 21,
    volume_lookback: 20,
    rsi_period: 14,
    require_rsi: true,
    rsi_overbought: 70,
    rsi_oversold: 30,
    sl_points: 350,
    target_points: 900,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const volLookback = num(values, "volume_lookback", 20);
    const rsiPeriod = num(values, "rsi_period", 14);
    const useRsi = bool(values, "require_rsi");
    const ob = num(values, "rsi_overbought", 70);
    const os = num(values, "rsi_oversold", 30);
    const overlays: ChartOverlay[] = [
      { key: "vwap", label: "VWAP", color: RANGE_COLOR },
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (candles.length < slow + 5) return emptyAnalysis(candles, overlays);

    const closes = candles.map((c) => c.close);
    const vwapLine = vwap(candles);
    const fastLine = ema(closes, fast);
    const slowLine = ema(closes, slow);
    const rsiLine = rsi(closes, rsiPeriod);
    const avgVol = averageVolume(candles, volLookback);
    const last = candles.length - 1;
    const decorated = candles.map((c, i) => ({
      ...c,
      vwap: vwapLine[i],
      [emaKey(fast)]: fastLine[i],
      [emaKey(slow)]: slowLine[i],
      rsi: rsiLine[i],
    }));

    const c0 = candles[last].close;
    const c1 = candles[last - 1].close;
    const v0 = vwapLine[last];
    const v1 = vwapLine[last - 1];
    const f0 = fastLine[last];
    const s0 = slowLine[last];
    const r0 = rsiLine[last];
    const volOk = avgVol != null && (candles[last].volume ?? 0) > avgVol;
    const bullTrend = f0 != null && s0 != null && f0 > s0;
    const bearTrend = f0 != null && s0 != null && f0 < s0;
    const reclaimUp = v0 != null && v1 != null && c1 <= v1 && c0 > v0;
    const reclaimDown = v0 != null && v1 != null && c1 >= v1 && c0 < v0;
    const rsiLongOk = !useRsi || (r0 != null && r0 < ob);
    const rsiShortOk = !useRsi || (r0 != null && r0 > os);

    let signal: LiveSignal;
    if (reclaimUp && bullTrend && volOk && rsiLongOk) {
      signal = {
        headline: "LONG — VWAP reclaim + trend",
        detail: "Dip ke baad VWAP wapas liya, EMA bullish, volume confirm.",
        tone: "buy",
        readouts: [],
      };
    } else if (reclaimDown && bearTrend && volOk && rsiShortOk) {
      signal = {
        headline: "SHORT — VWAP lose + trend",
        detail: "VWAP ke neeche close, EMA bearish, volume confirm.",
        tone: "sell",
        readouts: [],
      };
    } else if (reclaimUp) {
      signal = { headline: "VWAP reclaim — filters incomplete", detail: "Trend / volume / RSI check karo.", tone: "neutral", readouts: [] };
    } else {
      signal = { headline: "No VWAP reclaim — wait", tone: "neutral", readouts: [] };
    }

    signal.readouts = [
      { label: "VWAP", value: price(v0) },
      { label: "Price", value: price(c0) },
      { label: `RSI ${rsiPeriod}`, value: r0?.toFixed(1) ?? "—" },
      { label: "Volume", value: volOk ? "Strong" : "Weak", color: volOk ? "var(--green)" : "var(--text-muted)" },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      ema9: num(values, "ema_fast", 9),
      ema21: num(values, "ema_slow", 21),
      ema50: num(values, "ema_slow", 21),
      use_rsi_filter: bool(values, "require_rsi"),
      rsi_period: num(values, "rsi_period", 14),
      rsi_overbought: num(values, "rsi_overbought", 70),
      rsi_oversold: num(values, "rsi_oversold", 30),
    };
  },
};

/**
 * EMA Pullback — trend continuation on dip to EMA.
 */
const emaPullbackPro: StrategyDef = {
  id: "ema-pullback-pro",
  name: "EMA Pullback Pro",
  category: "Futures · trend · pro",
  blurb:
    "Strong trend (EMA stack + ADX) mein pullback EMA pe touch karke bounce — futures continuation entry.",
  logic:
    "Bullish stack: EMA fast > mid > slow aur ADX ≥ min. Pullback: price mid EMA ke paas aaye (band % ke andar) aur close phir mid ke upar. RSI oversold zone se bahar bounce optional confirmation. Bearish mirror. Pro desk par ye 'buy the dip in trend' play hai — breakout chase se better R:R.",
  accent: FAST_COLOR,
  icon: Activity,
  featured: true,
  engineNote:
    "Live signal EMA stack + pullback band + ADX. Backtest EMA crossover engine par approximate — pullback timing exact nahi milegi.",
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_mid", label: "EMA mid (pullback)", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow (trend)", kind: "number", group: "signal", min: 10, max: 200, onCard: true },
    { key: "pullback_pct", label: "Touch band · %", kind: "number", group: "signal", min: 0.05, max: 2, step: 0.05, hint: "Price mid EMA ke itne % ke andar aaye." },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 15, max: 50, onCard: true },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50 },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    ema_fast: 9,
    ema_mid: 21,
    ema_slow: 50,
    pullback_pct: 0.25,
    adx_period: 14,
    adx_min: 25,
    rsi_period: 14,
    sl_points: 400,
    target_points: 1000,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const mid = num(values, "ema_mid", 21);
    const slow = num(values, "ema_slow", 50);
    const bandPct = num(values, "pullback_pct", 0.25) / 100;
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 25);
    const rsiPeriod = num(values, "rsi_period", 14);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(mid), label: `EMA ${mid}`, color: SLOW_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: THIRD_COLOR },
    ];
    if (candles.length < slow + 5) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, mid, slow]);
    const closes = candles.map((c) => c.close);
    const adxLine = adx(candles, adxPeriod);
    const rsiLine = rsi(closes, rsiPeriod);
    const last = candles.length - 1;
    const f = decorated[last][emaKey(fast)] as number;
    const m = decorated[last][emaKey(mid)] as number;
    const s = decorated[last][emaKey(slow)] as number;
    const close = candles[last].close;
    const low = candles[last].low;
    const high = candles[last].high;
    const adxNow = adxLine[last]?.adx;
    const r0 = rsiLine[last];
    const trendOk = adxNow != null && adxNow >= adxMin;
    const bullStack = f > m && m > s;
    const bearStack = f < m && m < s;
    const nearMid = Math.abs(close - m) / m <= bandPct || Math.abs(low - m) / m <= bandPct || Math.abs(high - m) / m <= bandPct;
    const bounceLong = nearMid && close >= m && candles[last - 1].close < m * (1 + bandPct);
    const bounceShort = nearMid && close <= m && candles[last - 1].close > m * (1 - bandPct);

    let signal: LiveSignal;
    if (bullStack && trendOk && bounceLong) {
      signal = {
        headline: "LONG — pullback to EMA mid",
        detail: `Trend stack intact · ADX ${adxNow?.toFixed(1)} · RSI ${r0?.toFixed(1) ?? "—"}`,
        tone: "buy",
        readouts: [],
      };
    } else if (bearStack && trendOk && bounceShort) {
      signal = {
        headline: "SHORT — pullback to EMA mid",
        detail: `Bear stack intact · ADX ${adxNow?.toFixed(1)} · RSI ${r0?.toFixed(1) ?? "—"}`,
        tone: "sell",
        readouts: [],
      };
    } else if (bullStack && trendOk) {
      signal = { headline: "Bull trend — pullback ka wait", tone: "buy", readouts: [] };
    } else if (bearStack && trendOk) {
      signal = { headline: "Bear trend — pullback ka wait", tone: "sell", readouts: [] };
    } else {
      signal = { headline: "No pro pullback setup", tone: "neutral", readouts: [] };
    }

    signal.readouts = [
      { label: "Stack", value: bullStack ? "Bull" : bearStack ? "Bear" : "Mixed", color: bullStack ? "var(--green)" : bearStack ? "var(--red)" : undefined },
      { label: `ADX ${adxPeriod}`, value: adxNow?.toFixed(1) ?? "—", color: trendOk ? "var(--green)" : "var(--amber)" },
      { label: `EMA ${mid}`, value: price(m) },
      { label: `RSI ${rsiPeriod}`, value: r0?.toFixed(1) ?? "—" },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      ema9: num(values, "ema_fast", 9),
      ema21: num(values, "ema_mid", 21),
      ema50: num(values, "ema_slow", 50),
    };
  },
};

/* ── Options · pro ─────────────────────────────────────── */

/**
 * Momentum OTM — strong trend + breakout pe directional option buy.
 */
const momentumOtmPro: StrategyDef = {
  id: "momentum-otm-pro",
  name: "Momentum OTM Pro",
  category: "Options · momentum · pro",
  blurb:
    "15M strong trend (ADX↑ + EMA) + 5M swing break + volume — OTM Call/Put buy. Pure momentum options desk play.",
  logic:
    "Regime TF (entry×3): EMA fast > slow, price VWAP upar, ADX ≥ min aur rising. Entry TF: swing high/low break + volume > avg + RSI momentum side. Score ≥ min_score par OTM Call (bull) / Put (bear). Delta band tighter (0.30–0.40) — momentum mein thoda zyada delta lete hain taaki move catch ho.",
  accent: "#7c3aed",
  icon: Zap,
  featured: true,
  optionChain: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 15, max: 50, onCard: true },
    { key: "volume_lookback", label: "Volume avg · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Min score (of 6)", kind: "number", group: "signal", min: 3, max: 6, onCard: true },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "delta_min", label: "Strike delta · min", kind: "number", group: "risk", min: 0.1, max: 0.6, step: 0.01 },
    { key: "delta_max", label: "Strike delta · max", kind: "number", group: "risk", min: 0.15, max: 0.7, step: 0.01 },
    { key: "sl_premium_pct", label: "SL · % premium", kind: "number", group: "risk", min: 20, max: 80 },
    { key: "tp1_pct", label: "Partial book · %", kind: "number", group: "risk", min: 50, max: 300 },
    { key: "tp2_pct", label: "Final target · %", kind: "number", group: "risk", min: 50, max: 500 },
    { key: "time_exit_hours", label: "Time exit · hours", kind: "number", group: "risk", min: 0.5, max: 12, step: 0.5 },
    { key: "max_spread_pct", label: "Max bid/ask · %", kind: "number", group: "risk", min: 0.5, max: 20, step: 0.5 },
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    ema_fast: 9,
    ema_slow: 21,
    adx_period: 14,
    adx_min: 25,
    volume_lookback: 20,
    swing_span: 3,
    min_score: 5,
    days: 14,
    delta_min: 0.3,
    delta_max: 0.4,
    sl_premium_pct: 40,
    tp1_pct: 80,
    tp2_pct: 160,
    time_exit_hours: 2,
    max_spread_pct: 5,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 25);
    const volLookback = num(values, "volume_lookback", 20);
    const swingSpan = num(values, "swing_span", 3);
    const minScore = num(values, "min_score", 5);
    const entryMinutes = intervalMinutes(str(values, "timeframe", "5m"));
    const regime = resample(candles, entryMinutes * 3);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
      { key: "vwap", label: "VWAP", color: RANGE_COLOR },
    ];
    if (regime.length < 30 || candles.length < 40) return emptyAnalysis(candles, overlays);

    const rCloses = regime.map((c) => c.close);
    const rEmaF = ema(rCloses, fast);
    const rEmaS = ema(rCloses, slow);
    const rVwap = vwap(regime);
    const rAdx = adx(regime, adxPeriod);
    const rLast = regime.length - 1;
    const regimeBull =
      rEmaF[rLast]! > rEmaS[rLast]! &&
      regime[rLast].close > (rVwap[rLast] ?? 0) &&
      (rAdx[rLast]?.adx ?? 0) >= adxMin &&
      (rAdx[rLast]?.adx ?? 0) >= (rAdx[rLast - 1]?.adx ?? 0);
    const regimeBear =
      rEmaF[rLast]! < rEmaS[rLast]! &&
      regime[rLast].close < (rVwap[rLast] ?? Infinity) &&
      (rAdx[rLast]?.adx ?? 0) >= adxMin &&
      (rAdx[rLast]?.adx ?? 0) >= (rAdx[rLast - 1]?.adx ?? 0);

    const vwapLine = vwap(candles);
    const decorated = attachEma(candles, [fast, slow]).map((c, i) => {
      const next: Candle = { ...c };
      (next as Candle & { vwap?: number | null }).vwap = vwapLine[i];
      return next;
    });
    const last = candles.length - 1;
    const eF = decorated[last][emaKey(fast)] as number;
    const eS = decorated[last][emaKey(slow)] as number;
    const swingHi = lastSwingHigh(candles, swingSpan);
    const swingLo = lastSwingLow(candles, swingSpan);
    const avgVol = averageVolume(candles, volLookback);
    const volOk = avgVol != null && (candles[last].volume ?? 0) > avgVol;
    const breakHi = swingHi != null && candles[last].close > swingHi;
    const breakLo = swingLo != null && candles[last].close < swingLo;
    const lastVwap = vwapLine[last];

    const bullChecks = [regimeBull, eF > eS, candles[last].close > (lastVwap ?? 0), volOk, breakHi, (rAdx[rLast]?.adx ?? 0) >= adxMin];
    const bearChecks = [regimeBear, eF < eS, candles[last].close < (lastVwap ?? Infinity), volOk, breakLo, (rAdx[rLast]?.adx ?? 0) >= adxMin];
    const bullScore = bullChecks.filter(Boolean).length;
    const bearScore = bearChecks.filter(Boolean).length;

    let signal: LiveSignal;
    if (bullScore >= minScore && bullScore >= bearScore) {
      signal = {
        headline: `BUY CALL — momentum ${bullScore}/6`,
        detail: "Regime + breakout + volume aligned. OTM Call delta band se lo.",
        tone: "buy",
        readouts: [],
      };
    } else if (bearScore >= minScore) {
      signal = {
        headline: `BUY PUT — momentum ${bearScore}/6`,
        detail: "Bear regime + breakdown. OTM Put delta band se lo.",
        tone: "sell",
        readouts: [],
      };
    } else {
      signal = {
        headline: `Momentum building — ${Math.max(bullScore, bearScore)}/6`,
        detail: "Score abhi kam hai; breakout + ADX rising ka wait.",
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Bull score", value: `${bullScore}/6`, color: bullScore >= minScore ? "var(--green)" : undefined },
      { label: "Bear score", value: `${bearScore}/6`, color: bearScore >= minScore ? "var(--red)" : undefined },
      { label: "ADX", value: rAdx[rLast]?.adx?.toFixed(1) ?? "—" },
      { label: "Volume", value: volOk ? "Hot" : "Cold" },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/**
 * Trend Debit Pro — defined-risk debit spread when trend is clean but not parabolic.
 */
const trendDebitPro: StrategyDef = {
  id: "trend-debit-pro",
  name: "Trend Debit Pro",
  category: "Options · debit · pro",
  blurb:
    "Clean trend (ADX 22–35) mein Bull Call / Bear Put debit spread — capped risk, better than naked when IV mid.",
  logic:
    "15M regime: EMA align + VWAP side + ADX between min–max (bahut strong ADX par naked OTM better). 5M: pullback complete (RSI mid-zone se bounce) + EMA reclaim. Score ≥ 4/5. Long delta ~0.45–0.55, width configurable. Max loss = debit; target = 60–75% of max profit.",
  accent: "#2563eb",
  icon: Shield,
  featured: true,
  optionSpread: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX min", kind: "number", group: "signal", min: 15, max: 40, onCard: true },
    { key: "adx_max", label: "ADX max", kind: "number", group: "signal", min: 25, max: 50, onCard: true, hint: "Isse upar naked OTM prefer karo." },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50 },
    { key: "min_score", label: "Min score (of 5)", kind: "number", group: "signal", min: 3, max: 5 },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "spread_width", label: "Strike width", kind: "number", group: "risk", min: 100, max: 20000, step: 100 },
    { key: "long_delta", label: "Long leg delta", kind: "number", group: "risk", min: 0.25, max: 0.7, step: 0.01 },
    { key: "sl_debit_pct", label: "SL · % of debit", kind: "number", group: "risk", min: 20, max: 90 },
    { key: "tp_max_profit_pct", label: "TP · % max profit", kind: "number", group: "risk", min: 30, max: 95 },
    { key: "time_exit_hours", label: "Time exit · hours", kind: "number", group: "risk", min: 0.5, max: 12, step: 0.5 },
    { key: "max_spread_pct", label: "Max bid/ask · %", kind: "number", group: "risk", min: 0.5, max: 20, step: 0.5 },
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "5m",
    ema_fast: 9,
    ema_slow: 21,
    adx_period: 14,
    adx_min: 22,
    adx_max: 35,
    rsi_period: 14,
    min_score: 4,
    spread_width: 2000,
    long_delta: 0.5,
    days: 14,
    sl_debit_pct: 45,
    tp_max_profit_pct: 70,
    time_exit_hours: 2,
    max_spread_pct: 8,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMin = num(values, "adx_min", 22);
    const adxMax = num(values, "adx_max", 35);
    const rsiPeriod = num(values, "rsi_period", 14);
    const minScore = num(values, "min_score", 4);
    const entryMinutes = intervalMinutes(str(values, "timeframe", "5m"));
    const regime = resample(candles, entryMinutes * 3);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (regime.length < 25 || candles.length < 30) return emptyAnalysis(candles, overlays);

    const rCloses = regime.map((c) => c.close);
    const rAdx = adx(regime, adxPeriod);
    const rEmaF = ema(rCloses, fast);
    const rEmaS = ema(rCloses, slow);
    const rVwap = vwap(regime);
    const rLast = regime.length - 1;
    const adxNow = rAdx[rLast]?.adx ?? 0;
    const adxBand = adxNow >= adxMin && adxNow <= adxMax;
    const regimeBull = rEmaF[rLast]! > rEmaS[rLast]! && regime[rLast].close > (rVwap[rLast] ?? 0) && adxBand;
    const regimeBear = rEmaF[rLast]! < rEmaS[rLast]! && regime[rLast].close < (rVwap[rLast] ?? Infinity) && adxBand;
    const tooStrong = adxNow > adxMax;

    const decorated = attachEma(candles, [fast, slow]);
    const closes = candles.map((c) => c.close);
    const rsiLine = rsi(closes, rsiPeriod);
    const last = candles.length - 1;
    const eF = decorated[last][emaKey(fast)] as number;
    const eS = decorated[last][emaKey(slow)] as number;
    const r0 = rsiLine[last];
    const r1 = rsiLine[last - 1];
    const reclaimBull = eF > eS && candles[last].close > eF && (r1 ?? 50) < 45 && (r0 ?? 0) > (r1 ?? 0);
    const reclaimBear = eF < eS && candles[last].close < eF && (r1 ?? 50) > 55 && (r0 ?? 100) < (r1 ?? 100);

    const bullScore = [regimeBull, eF > eS, reclaimBull, adxBand, (r0 ?? 0) > 40 && (r0 ?? 100) < 65].filter(Boolean).length;
    const bearScore = [regimeBear, eF < eS, reclaimBear, adxBand, (r0 ?? 0) < 60 && (r0 ?? 0) > 35].filter(Boolean).length;

    let signal: LiveSignal;
    if (tooStrong) {
      signal = {
        headline: "ADX too strong — prefer naked OTM",
        detail: `ADX ${adxNow.toFixed(1)} > ${adxMax}. Debit spread ka RR yahan weak padta hai.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (bullScore >= minScore && bullScore >= bearScore) {
      signal = {
        headline: `BULL CALL SPREAD — ${bullScore}/5`,
        detail: "Defined-risk call debit. Width aur long delta tune karo.",
        tone: "buy",
        readouts: [],
      };
    } else if (bearScore >= minScore) {
      signal = {
        headline: `BEAR PUT SPREAD — ${bearScore}/5`,
        detail: "Defined-risk put debit.",
        tone: "sell",
        readouts: [],
      };
    } else {
      signal = {
        headline: `Debit setup forming — ${Math.max(bullScore, bearScore)}/5`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Bull", value: `${bullScore}/5` },
      { label: "Bear", value: `${bearScore}/5` },
      { label: "ADX", value: adxNow.toFixed(1), color: adxBand ? "var(--green)" : "var(--amber)" },
      { label: "RSI", value: r0?.toFixed(1) ?? "—" },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/**
 * Vol Crush Condor — after volatility spike settles, sell iron condor.
 */
const volCrushCondor: StrategyDef = {
  id: "vol-crush-condor",
  name: "Vol Crush Condor",
  category: "Options · range · pro",
  blurb:
    "ATR spike ke baad calm + low ADX + tight EMA — iron condor se premium sell. Pro vol-crush play.",
  logic:
    "Entry jab: (1) ATR abhi recent high se meaningfully neeche (crush), (2) ADX < max, (3) EMA fast/slow gap chhota, (4) price mid-range, (5) koi fresh breakout nahi. Ye classic 'event ke baad IV crush' setup hai — iron condor short wings se theta kamao, emergency delta pe hedge.",
  accent: "#b45309",
  icon: Boxes,
  featured: true,
  optionCondor: true,
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_max", label: "ADX max (range)", kind: "number", group: "signal", min: 10, max: 30, onCard: true },
    { key: "atr_period", label: "ATR period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "atr_lookback", label: "ATR spike lookback", kind: "number", group: "signal", min: 10, max: 100, onCard: true },
    { key: "crush_pct", label: "ATR crush · % below peak", kind: "number", group: "signal", min: 10, max: 60, hint: "Current ATR peak se itna % neeche ho." },
    { key: "ema_gap_pct", label: "Max EMA gap · %", kind: "number", group: "signal", min: 0.05, max: 2, step: 0.05 },
    { key: "range_lookback", label: "Range bars", kind: "number", group: "signal", min: 10, max: 100 },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "short_delta", label: "Short wing delta", kind: "number", group: "risk", min: 0.1, max: 0.35, step: 0.01 },
    { key: "long_delta", label: "Long wing delta", kind: "number", group: "risk", min: 0.02, max: 0.2, step: 0.01 },
    { key: "max_iv_pct", label: "Max IV · %", kind: "number", group: "risk", min: 20, max: 200 },
    { key: "tp_credit_pct", label: "TP · % credit", kind: "number", group: "risk", min: 20, max: 90 },
    { key: "sl_credit_mult", label: "SL · × credit", kind: "number", group: "risk", min: 1, max: 4, step: 0.1 },
    { key: "emergency_delta", label: "Emergency delta", kind: "number", group: "risk", min: 0.2, max: 0.6, step: 0.01 },
    { key: "time_exit_hours", label: "Time exit · hours", kind: "number", group: "risk", min: 0.5, max: 24, step: 0.5 },
    { key: "max_spread_pct", label: "Max bid/ask · %", kind: "number", group: "risk", min: 0.5, max: 25, step: 0.5 },
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    ema_fast: 9,
    ema_slow: 21,
    adx_period: 14,
    adx_max: 18,
    atr_period: 14,
    atr_lookback: 40,
    crush_pct: 25,
    ema_gap_pct: 0.35,
    range_lookback: 30,
    days: 14,
    short_delta: 0.2,
    long_delta: 0.08,
    max_iv_pct: 90,
    tp_credit_pct: 50,
    sl_credit_mult: 2,
    emergency_delta: 0.35,
    time_exit_hours: 4,
    max_spread_pct: 10,
  },
  analyze(candles, values) {
    const fast = num(values, "ema_fast", 9);
    const slow = num(values, "ema_slow", 21);
    const adxPeriod = num(values, "adx_period", 14);
    const adxMax = num(values, "adx_max", 18);
    const atrPeriod = num(values, "atr_period", 14);
    const atrLookback = num(values, "atr_lookback", 40);
    const crushPct = num(values, "crush_pct", 25) / 100;
    const gapMax = num(values, "ema_gap_pct", 0.35) / 100;
    const rangeN = num(values, "range_lookback", 30);
    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
    ];
    if (candles.length < Math.max(atrLookback, rangeN, slow) + 5) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, slow]);
    const atrLine = atr(candles, atrPeriod);
    const adxLine = adx(candles, adxPeriod);
    const last = candles.length - 1;
    const atrNow = atrLine[last];
    const slice = atrLine.slice(Math.max(0, last - atrLookback), last + 1).filter((v): v is number => v != null);
    const atrPeak = slice.length ? Math.max(...slice) : null;
    const crushed = atrNow != null && atrPeak != null && atrNow <= atrPeak * (1 - crushPct);
    const adxNow = adxLine[last]?.adx;
    const adxCalm = adxNow != null && adxNow < adxMax;
    const f = decorated[last][emaKey(fast)] as number;
    const s = decorated[last][emaKey(slow)] as number;
    const emaGapPct = s !== 0 ? Math.abs(f - s) / Math.abs(s) : 1;
    const emaFlat = emaGapPct <= gapMax;
    const window = candles.slice(Math.max(0, last - rangeN + 1), last + 1);
    const rangeHigh = Math.max(...window.map((c) => c.high));
    const rangeLow = Math.min(...window.map((c) => c.low));
    const mid = (rangeHigh + rangeLow) / 2;
    const close = candles[last].close;
    const inMid = Math.abs(close - mid) / mid < 0.015;
    const noBreak = close < rangeHigh * 0.998 && close > rangeLow * 1.002;

    const checks = [crushed, adxCalm, emaFlat, inMid, noBreak];
    const score = checks.filter(Boolean).length;
    const labels = ["ATR crush", "ADX calm", "EMA flat", "Mid-range", "No breakout"];

    let signal: LiveSignal;
    if (score === 5) {
      signal = {
        headline: "SELL IRON CONDOR — vol crush",
        detail: "ATR peak se neeche, range-bound. Short wings + long wings Condor panel se.",
        tone: "neutral",
        readouts: [],
        entry: true,
      };
    } else {
      const failed = labels.filter((_, i) => !checks[i]);
      signal = {
        headline: `Vol crush forming — ${score}/5`,
        detail: `Pending: ${failed.join(", ")}.`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Setup", value: `${score}/5`, color: score === 5 ? "var(--green)" : undefined },
      { label: "ATR vs peak", value: atrNow != null && atrPeak != null ? `${((1 - atrNow / atrPeak) * 100).toFixed(0)}%↓` : "—" },
      { label: "ADX", value: adxNow?.toFixed(1) ?? "—", color: adxCalm ? "var(--green)" : "var(--red)" },
      { label: "EMA gap", value: `${(emaGapPct * 100).toFixed(2)}%` },
    ];
    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: num(values, "ema_fast", 9), ema21: num(values, "ema_slow", 21), ema50: num(values, "ema_slow", 21) };
  },
};

/* ── Trend Rider (research-backed, backend native engine) ─ */

const TR_UP = "#10b981";
const TR_DOWN = "#ef4444";
const TR_STOP = "#f59e0b";

function coinOf(symbol: string): string {
  return symbol.replace(/USDT?$/, "") || symbol;
}

function fmtWhen(timeMs: number): string {
  return new Date(timeMs).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

const trendRider: StrategyDef = {
  id: "trend-rider",
  name: "Trend Rider 4H",
  category: "Trend following · Perp long/short",
  blurb:
    "30-candle breakout + EMA 200 regime + trailing stop. 2019–2026 ke data par BTC, ETH, SOL, BNB, XRP paanchon par fees ke baad profitable.",
  logic:
    "Market jab trend mein ho tabhi trade, range mein bahar. LONG: 4h candle pichhli 30 candles ke highest high ke upar band ho aur price EMA 200 ke upar ho. SHORT: 30-candle low ke neeche band ho, price EMA 200 ke neeche aur EMA 50 bhi EMA 200 ke neeche (sirf pakka bear market). Entry agli candle ke open par. Stop = signal close se 2× ATR; har band candle par stop pichhli 15 candles ke low (short mein high) tak khiskta hai, kabhi peeche nahi. Size aisa ki stop lagne par capital ka sirf 1% jaaye. Win rate ~30–37% hi rehta hai — chhote loss bahut, par jeet wale trades 5–16R tak chalte hain. Yahi edge hai.",
  accent: TR_UP,
  icon: Waves,
  featured: true,
  autoTrade: true,
  // EMA 200 ka seed ~1000 candles mein mit jaata hai — backtest (600 warmup) se signal mel khaata hai.
  minHistoryBars: 1000,
  backtestable: true,
  engineNote:
    "Backend ka native engine (`trend-rider`) — live signal, backtest aur paper auto-trader teeno same rule. Backtest mein Delta taker fee + 18% GST, 0.02% slippage aur longs par funding (0.01%/8h) kat'ta hai. Research 4h par hui hai: 1h par same rules ka drawdown ~2.5× tha, isliye 4h hi rakho. Trend system ko kam se kam 6–12 mahine par parkho — 30 din mein 2-3 trades hi hote hain.",
  fields: [
    { key: "channel", label: "Entry channel · candles", kind: "number", group: "signal", min: 5, max: 200, onCard: true, hint: "Band candle is channel ke high/low ke paar ho to entry." },
    { key: "exit_channel", label: "Trailing channel · candles", kind: "number", group: "signal", min: 3, max: 200, hint: "Stop pichhli itni candles ke low/high par trail hota hai." },
    { key: "stop_atr", label: "Initial stop · ATR ×", kind: "number", group: "signal", min: 0.5, max: 6, step: 0.5 },
    { key: "allow_shorts", label: "Shorts bhi lo (sirf bear regime mein)", kind: "toggle", group: "signal" },
    ...marketFields,
    { key: "capital", label: "Capital · $", kind: "number", group: "risk", min: 10, step: 10, onCard: true },
    {
      key: "risk_pct",
      label: "Risk per trade · %",
      kind: "number",
      group: "risk",
      min: 0.1,
      max: 5,
      step: 0.1,
      onCard: true,
      hint: "Stop lagne par capital ka itna % jaata hai. 1% pro standard hai; 2% par max drawdown ~30% tak gaya.",
    },
    { key: "days", label: "History · days", kind: "number", group: "backtest", min: 30, max: 700, hint: "365+ din rakho — trend system chhote window mein luck dikhata hai, edge nahi." },
  ],
  defaults: {
    symbol: "BTCUSDT",
    timeframe: "4h",
    channel: 30,
    exit_channel: 15,
    stop_atr: 2,
    allow_shorts: true,
    capital: 1000,
    risk_pct: 1,
    days: 365,
  },
  analyze(candles, values) {
    const symbol = str(values, "symbol", "BTCUSDT");
    const timeframe = str(values, "timeframe", "4h");
    const intervalMs = intervalMinutes(timeframe) * 60_000;
    const params = {
      channel: Math.max(5, Math.round(num(values, "channel", 30))),
      exitChannel: Math.max(3, Math.round(num(values, "exit_channel", 15))),
      stopAtr: num(values, "stop_atr", 2),
      allowShorts: bool(values, "allow_shorts"),
      emaFast: 50,
      emaSlow: 200,
    };
    const capital = num(values, "capital", 1000);
    const riskPct = num(values, "risk_pct", 1);
    const overlays: ChartOverlay[] = [
      { key: TREND_KEYS.upper, label: `${params.channel}-candle high`, color: TR_UP },
      { key: TREND_KEYS.lower, label: `${params.channel}-candle low`, color: TR_DOWN },
      { key: emaKey(params.emaSlow), label: `EMA ${params.emaSlow}`, color: THIRD_COLOR },
      { key: TREND_KEYS.stop, label: "Active stop", color: TR_STOP },
    ];
    if (candles.length < params.emaSlow + params.channel + 10) {
      return {
        ...emptyAnalysis(candles, overlays),
        signal: {
          headline: "Zyada history chahiye",
          detail: `EMA ${params.emaSlow} aur ${params.channel}-candle channel ke liye kam se kam ${params.emaSlow + params.channel + 10} candles chahiye — chart history badhao.`,
          tone: "neutral",
          readouts: [],
        },
      };
    }

    const r = replayTrendRider(candles, params, intervalMs);
    const coin = coinOf(symbol);
    const last = candles[candles.length - 1];
    const lastAtr = r.atr ?? 0;

    let signal: LiveSignal;
    let desired: AutoTradeState["desired"] = null;
    if (r.position) {
      const p = r.position;
      const long = p.side === "long";
      const move = ((last.close - p.entryPrice) / p.entryPrice) * 100 * (long ? 1 : -1);
      desired = { side: p.side, entryTime: p.entryTime, stop: p.stop };
      signal = {
        headline: `${long ? "LONG" : "SHORT"} chalu — trailing stop ${price(p.stop)}`,
        detail: `Entry ${price(p.entryPrice)} (${fmtWhen(p.entryTime)}), abhi ${move >= 0 ? "+" : ""}${move.toFixed(2)}%. Stop har band candle par pichhli ${params.exitChannel} candles ke ${long ? "low" : "high"} tak khiskta hai — kabhi ${long ? "neeche" : "upar"} nahi.`,
        tone: long ? "buy" : "sell",
        readouts: [],
      };
    } else if (r.pending) {
      const p = r.pending;
      const long = p.side === "long";
      const entry = p.entryPrice ?? last.close;
      const qty = trendRiderQuantity(capital, riskPct, entry, p.stop);
      desired = { side: p.side, entryTime: p.entryTime, stop: p.stop };
      signal = {
        headline: long ? `BUY — ${params.channel}-candle breakout confirm` : `SELL — ${params.channel}-candle breakdown (bear regime)`,
        detail: `Band candle ne channel ${long ? "upar" : "neeche"} toda. Entry ${price(entry)} ke paas, stop ${price(p.stop)}. $${capital.toLocaleString("en-US")} par ${riskPct}% risk = ${qty.toFixed(4)} ${coin}.`,
        tone: long ? "buy" : "sell",
        entry: true,
        readouts: [],
      };
    } else if (r.regime === "bull") {
      signal = {
        headline: "Flat — breakout ka intezaar",
        detail: `4h candle ${price(r.upper)} ke upar band ho to LONG. Range mein bahar baithna hi is system ki taqat hai — false breakouts yahin se aate hain.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (r.regime === "bear" && params.allowShorts) {
      signal = {
        headline: "Flat — bear regime, breakdown ka intezaar",
        detail: `4h candle ${price(r.lower)} ke neeche band ho to SHORT. Long tab tak band jab tak price EMA ${params.emaSlow} ke upar na aaye.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Flat — koi saaf trend nahi",
        detail: `Price EMA ${params.emaSlow} ke neeche hai par EMA 50 abhi upar — na long, na short. Aise market mein cash hi position hai.`,
        tone: "neutral",
        readouts: [],
      };
    }

    const stopDist = params.stopAtr * lastAtr;
    const refPrice = r.position?.entryPrice ?? last.close;
    const refStop = r.position?.stop ?? r.pending?.stop ?? refPrice - stopDist;
    const sizeQty = trendRiderQuantity(capital, riskPct, refPrice, refStop);
    const regimeLabel = r.regime === "bull" ? "Bull · longs on" : r.regime === "bear" ? (params.allowShorts ? "Bear · shorts on" : "Bear · shorts off") : "Neutral · flat";
    signal.readouts = [
      { label: "Regime", value: regimeLabel, color: r.regime === "bull" ? "var(--green)" : r.regime === "bear" ? "var(--red)" : undefined },
      { label: "Long trigger", value: price(r.upper), color: TR_UP },
      { label: "Short trigger", value: price(r.lower), color: TR_DOWN },
      { label: `EMA ${params.emaSlow}`, value: price(r.emaSlow), color: THIRD_COLOR },
      {
        label: r.position ? "Active stop" : "Stop distance",
        value: r.position ? price(r.position.stop) : `${price(stopDist)} (${((stopDist / last.close) * 100).toFixed(2)}%)`,
        color: TR_STOP,
      },
      { label: `Size · ${riskPct}% risk`, value: `${sizeQty.toFixed(4)} ${coin} (~$${(sizeQty * refPrice).toFixed(0)})` },
      { label: "Pair", value: `${symbolLabel(symbol)} · ${timeframe.toUpperCase()}` },
    ];

    return { candles: r.candles, overlays, signal, autoTrade: { desired, intervalMs } };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      strategy: "trend-rider",
      timeframe: str(values, "timeframe", "4h"),
      days: num(values, "days", 365),
      capital: num(values, "capital", 1000),
      risk_pct: num(values, "risk_pct", 1),
      channel: num(values, "channel", 30),
      exit_channel: num(values, "exit_channel", 15),
      stop_atr: num(values, "stop_atr", 2),
      allow_shorts: bool(values, "allow_shorts"),
    };
  },
};

/* ── Capital-Based Strategies (₹3k to ₹50k) ───────────── */

/**
 * In strategies ka apna backend engine nahi hai — backtest EMA crossover engine par
 * chalta hai. Note mein wahi likho jo engine sach mein karta hai, taaki backtest ka
 * number is strategy ki logic ka saboot na samjha jaye.
 */
function emaEngineNote(rule: string, missing: string): string {
  return `Backtest is strategy ki apni logic par nahi chalta — backend ke EMA crossover engine par chalta hai: ${rule}. Long aur short dono, exit sirf fixed SL/target points par, 11:00–14:00 IST entries block (default ON), aur fees/slippage shaamil nahi. P&L = points × lots × 0.001 coin, capital par nahi. ${missing} Isliye backtest ka nateeja upar wali live logic ka saboot nahi hai.`;
}

/** Paanchon ka live signal isi tarah chalta hai — Logic text ke aakhir mein yahi sach. */
const CAPITAL_LIVE_CAVEAT =
  " Signal chalu (adhoori) candle par check hota hai, isliye candle band hone se pehle badal sakta hai. Sirf BUY signal aata hai (short nahi), aur exit ka koi rule nahi chalta — jo SL/target readouts dikhte hain wo har refresh par abhi ke price se dobara bante hain, sirf reference levels hain.";

const donchianBreakout20k: StrategyDef = {
  id: "donchian-breakout-20k",
  name: "Donchian Breakout (₹20,000)",
  category: "Capital · ₹20k · 4h Breakout",
  blurb:
    "Live signal: 4H par 20-candle high ka breakout, 1.5× volume aur strong body ke saath, EMA 200 ke upar. Backtest approximate hai — EMA crossover engine par chalta hai.",
  logic:
    "Live signal (default 4H): close pichhli candle se pehle ki 20 candles (Channel lookback) ke highest high ke upar ho, volume pichhli 20 candles ke average ka 1.5× se zyada ho, candle green ho aur body uski range ke aadhe se badi ho, aur price EMA 200 ke upar ho — tab BUY. 'SL ref' = close − 3× ATR (Trail ATR multiple)." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#10b981",
  icon: TrendingUp,
  featured: true,
  engineNote: emaEngineNote(
    "EMA 20 jab EMA 50 aur EMA 200 dono ke upar cross kare to BUY, dono ke neeche to SELL",
    "Donchian channel, volume filter, 3× ATR trailing stop, 1% risk sizing aur 3% daily loss limit backtest mein nahi hain.",
  ),
  fields: [
    { key: "lookback", label: "Channel lookback", kind: "number", group: "signal", min: 10, max: 100, onCard: true },
    { key: "trail_atr", label: "Trail ATR multiple", kind: "number", group: "signal", min: 1, max: 5, step: 0.5, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "4h",
    lookback: 20,
    trail_atr: 3.0,
    sl_points: 600,
    target_points: 1800,
  },
  analyze(candles, values) {
    const lookback = num(values, "lookback", 20);
    const trailMult = num(values, "trail_atr", 3.0);
    const ema200Period = 200;

    const overlays: ChartOverlay[] = [
      { key: "donchian_high", label: `Donchian High ${lookback}`, color: "#10b981" },
      { key: emaKey(ema200Period), label: `EMA ${ema200Period}`, color: THIRD_COLOR },
    ];
    if (candles.length < Math.max(lookback + 2, 50)) return emptyAnalysis(candles, overlays);

    const decoratedEma = attachEma(candles, [ema200Period]);
    const highs = decoratedEma.map((c) => c.high);
    const atrSeries = atr(decoratedEma, 14);

    const decorated = decoratedEma.map((c, i) => {
      let hh = c.high;
      if (i >= lookback) {
        let maxH = -Infinity;
        for (let j = i - lookback; j < i; j++) {
          if (highs[j] > maxH) maxH = highs[j];
        }
        hh = maxH;
      }
      return { ...c, donchian_high: hh, atr: atrSeries[i] };
    });

    const last = decorated[decorated.length - 1];
    const prev = decorated[decorated.length - 2];
    const prevHigh20 = prev.donchian_high as number;
    const ema200Val = (last as Candle)[emaKey(ema200Period)] as number;

    const avgVol = averageVolume(decorated, 20) ?? 1;
    const currentVol = last.volume ?? 0;
    const volOk = currentVol > 1.5 * avgVol;

    const candleRange = last.high - last.low;
    const bodySize = last.close - last.open;
    const isStrongBody = candleRange > 0 && bodySize > 0.5 * candleRange;

    const isBreakout = last.close > prevHigh20 && last.close > ema200Val && volOk && isStrongBody;
    const lastAtr = atrSeries[atrSeries.length - 1] ?? 0;
    const suggestedSl = last.close - trailMult * lastAtr;

    let signal: LiveSignal;
    if (isBreakout) {
      signal = {
        headline: `BUY — ${lookback}-candle channel breakout`,
        detail: `Price ${price(last.close)} ne ${lookback}-bar high (${price(prevHigh20)}) tode, volume ${(currentVol / avgVol).toFixed(1)}x average hai.`,
        tone: "buy",
        readouts: [],
      };
    } else if (last.close > ema200Val) {
      signal = {
        headline: "Uptrend — Breakout ka intezaar",
        detail: `Price EMA 200 ke upar hai, Donchian High ${price(prevHigh20)} ke break hone ka intezaar hai.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Bearish/Neutral — Below EMA 200",
        detail: "Price macro EMA 200 ke neeche hai, Donchian entries paused hain.",
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Price", value: price(last.close) },
      { label: "Donchian High", value: price(prevHigh20), color: "#10b981" },
      { label: `EMA ${ema200Period}`, value: price(ema200Val), color: THIRD_COLOR },
      { label: "Volume Ratio", value: `${(currentVol / (avgVol || 1)).toFixed(2)}x`, color: volOk ? "var(--green)" : undefined },
      { label: "ATR", value: price(lastAtr) },
      { label: `SL ref (${trailMult}× ATR)`, value: price(suggestedSl), color: "var(--red)" },
    ];

    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: 20, ema21: 50, ema50: 200 };
  },
};

const emaAdx10k: StrategyDef = {
  id: "ema-adx-10k",
  name: "EMA + ADX (₹10,000)",
  category: "Capital · ₹10k · 1h Momentum",
  blurb:
    "Live signal: EMA 20/50 golden cross + ADX > 25 + price EMA 200 ke upar. 2× ATR trailing stop sirf suggested level hai. Backtest approximate — EMA crossover engine par.",
  logic:
    "Live signal (default 1H): fast EMA (default 20) jab slow EMA (default 50) ko neeche se upar cross kare, ADX(14) threshold (default 25) se upar ho, aur price EMA 200 ke upar ho — tab BUY. Cross ke baad jab tak fast > slow aur price EMA 200 ke upar hai, 'Bullish Trend Active' dikhta hai. 'SL ref' = close − 2× ATR." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#3b82f6",
  icon: Zap,
  engineNote: emaEngineNote(
    "fast EMA jab slow EMA aur EMA 200 dono ke upar cross kare to BUY, dono ke neeche to SELL",
    "ADX filter, 2× ATR trailing stop, 1% risk sizing aur 72-bar max holding backtest mein nahi hain.",
  ),
  fields: [
    { key: "fast", label: "Fast EMA", kind: "number", group: "signal", min: 5, max: 50, onCard: true },
    { key: "slow", label: "Slow EMA", kind: "number", group: "signal", min: 20, max: 100, onCard: true },
    { key: "adx_thresh", label: "ADX Threshold", kind: "number", group: "signal", min: 15, max: 40, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "1h",
    fast: 20,
    slow: 50,
    adx_thresh: 25,
    sl_points: 500,
    target_points: 1500,
  },
  analyze(candles, values) {
    const fast = num(values, "fast", 20);
    const slow = num(values, "slow", 50);
    const adxThresh = num(values, "adx_thresh", 25);
    const ema200Period = 200;

    const overlays: ChartOverlay[] = [
      { key: emaKey(fast), label: `EMA ${fast}`, color: FAST_COLOR },
      { key: emaKey(slow), label: `EMA ${slow}`, color: SLOW_COLOR },
      { key: emaKey(ema200Period), label: `EMA ${ema200Period}`, color: THIRD_COLOR },
    ];
    if (candles.length < Math.max(slow + 2, 60)) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [fast, slow, ema200Period]);
    const adxPoints = adx(candles, 14);
    const atrPoints = atr(candles, 14);

    const last = decorated[decorated.length - 1];
    const prev = decorated[decorated.length - 2];
    const fNow = last[emaKey(fast)] as number;
    const sNow = last[emaKey(slow)] as number;
    const fPrev = prev[emaKey(fast)] as number;
    const sPrev = prev[emaKey(slow)] as number;
    const ema200Val = (last as Candle)[emaKey(ema200Period)] as number;

    const lastAdx = adxPoints[adxPoints.length - 1]?.adx ?? null;
    const lastAtr = atrPoints[atrPoints.length - 1] ?? 0;

    const cross = crossDirection(fPrev, fNow, sPrev, sNow);
    const adxStrong = lastAdx != null && lastAdx > adxThresh;
    const isAboveEma200 = last.close > ema200Val;

    let signal: LiveSignal;
    if (cross === "up" && adxStrong && isAboveEma200) {
      signal = {
        headline: `BUY — EMA ${fast}/${slow} golden cross + strong ADX`,
        detail: `Fresh crossover confirm hua. ADX ${lastAdx.toFixed(1)} (> ${adxThresh}) strong momentum dikha raha hai.`,
        tone: "buy",
        readouts: [],
      };
    } else if (fNow > sNow && isAboveEma200) {
      signal = {
        headline: "Bullish Trend Active",
        detail: `${adxStrong ? `Trend strong hai (ADX ${lastAdx?.toFixed(1)}).` : `Trend chal raha hai lekin ADX kamzor hai (${lastAdx?.toFixed(1) ?? "—"}).`} Ye signal exit nahi deta — stop khud manage karein.`,
        tone: "buy",
        readouts: [],
      };
    } else {
      signal = {
        headline: "No Momentum Signal",
        detail: "EMA crossover ya ADX criteria abhi meet nahi ho raha.",
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: `EMA ${fast}`, value: price(fNow), color: FAST_COLOR },
      { label: `EMA ${slow}`, value: price(sNow), color: SLOW_COLOR },
      { label: "ADX (14)", value: lastAdx != null ? lastAdx.toFixed(1) : "—", color: adxStrong ? "var(--green)" : undefined },
      { label: "ATR", value: price(lastAtr) },
      { label: "SL ref (2× ATR)", value: price(last.close - 2 * lastAtr), color: "var(--red)" },
      { label: "Price", value: price(last.close) },
    ];

    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    const fast = num(values, "fast", 20);
    const slow = num(values, "slow", 50);
    return { ...baseParams(values), ema9: fast, ema21: slow, ema50: 200 };
  },
};

const rsiReversion3k: StrategyDef = {
  id: "rsi-reversion-3k",
  name: "RSI Reversion (₹3,000)",
  category: "Capital · ₹3k · 15m Reversion",
  blurb:
    "Live signal: uptrend (EMA 200 ke upar) mein RSI < 25 ka dip, volume spike ke saath; 20-SMA suggested target. Backtest approximate — EMA crossover engine par.",
  logic:
    "Live signal (default 15m): RSI(14) oversold level (default 25) se neeche ho, price EMA 200 ke upar ho, aur volume pichhli 20 candles ke average ka Volume Multiplier (default 1.5×) se zyada ho — tab BUY. 'Target ref' = 20-SMA, 'SL ref' = close − 1.5× ATR." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#f59e0b",
  icon: Gauge,
  engineNote: emaEngineNote(
    "EMA 9 jab EMA 21 aur EMA 50 dono ko cross kare, aur entry tabhi jab RSI(14) 25 se neeche ya 60 se upar ho",
    "Dip-buy logic, volume spike, 20-SMA take-profit, 1.5× ATR stop aur 1% risk sizing backtest mein nahi hain.",
  ),
  fields: [
    { key: "rsi_thresh", label: "RSI Oversold Level", kind: "number", group: "signal", min: 15, max: 35, onCard: true },
    { key: "vol_mult", label: "Volume Multiplier", kind: "number", group: "signal", min: 1.0, max: 3.0, step: 0.1, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    rsi_thresh: 25,
    vol_mult: 1.5,
    sl_points: 300,
    target_points: 600,
  },
  analyze(candles, values) {
    const rsiThresh = num(values, "rsi_thresh", 25);
    const volMult = num(values, "vol_mult", 1.5);
    const ema200Period = 200;

    const overlays: ChartOverlay[] = [
      { key: "mid_sma20", label: "20 SMA (target ref)", color: "#f59e0b" },
      { key: emaKey(ema200Period), label: `EMA ${ema200Period}`, color: THIRD_COLOR },
    ];
    if (candles.length < Math.max(ema200Period + 2, 60)) return emptyAnalysis(candles, overlays);

    const decoratedEma = attachEma(candles, [ema200Period]);
    const closes = decoratedEma.map((c) => c.close);
    const rsiSeries = rsi(closes, 14);
    const atrSeries = atr(decoratedEma, 14);

    const decorated = decoratedEma.map((c, i) => {
      let sma20 = c.close;
      if (i >= 19) {
        let sum = 0;
        for (let j = i - 19; j <= i; j++) sum += closes[j];
        sma20 = sum / 20;
      }
      return { ...c, rsi: rsiSeries[i], mid_sma20: sma20, atr: atrSeries[i] };
    });

    const last = decorated[decorated.length - 1];
    const lastRsi = rsiSeries[rsiSeries.length - 1] ?? 50;
    const lastAtr = atrSeries[atrSeries.length - 1] ?? 0;
    const ema200Val = (last as Candle)[emaKey(ema200Period)] as number;
    const midVal = last.mid_sma20 as number;

    const avgVol = averageVolume(decorated, 20) ?? 1;
    const currentVol = last.volume ?? 0;
    const volOk = currentVol > volMult * avgVol;

    const isOversoldUptrend = lastRsi < rsiThresh && last.close > ema200Val && volOk;

    let signal: LiveSignal;
    if (isOversoldUptrend) {
      signal = {
        headline: "BUY — Oversold Dip Reversion",
        detail: `RSI ${lastRsi.toFixed(1)} (< ${rsiThresh}) in uptrend with ${(currentVol / avgVol).toFixed(1)}x volume. Target ref (20 SMA): ${price(midVal)}.`,
        tone: "buy",
        readouts: [],
      };
    } else if (last.close > midVal) {
      signal = {
        headline: "Above Mean — Waiting for Pullback",
        detail: "Price 20-MA ke upar hai. Naye dip ka intezaar karein.",
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Neutral / In Range",
        detail: `RSI ${lastRsi.toFixed(1)}. Oversold trigger < ${rsiThresh} ka intezaar hai.`,
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Price", value: price(last.close) },
      { label: "RSI (14)", value: lastRsi.toFixed(1), color: lastRsi < rsiThresh ? "var(--green)" : undefined },
      { label: "Target ref (20 SMA)", value: price(midVal), color: "#f59e0b" },
      { label: "SL ref (1.5× ATR)", value: price(last.close - 1.5 * lastAtr), color: "var(--red)" },
      { label: "Volume Ratio", value: `${(currentVol / (avgVol || 1)).toFixed(2)}x` },
    ];

    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), use_rsi_filter: true, rsi_period: 14, rsi_oversold: 25 };
  },
};

const bollingerRsi5k: StrategyDef = {
  id: "bollinger-rsi-5k",
  name: "Bollinger + RSI (₹5,000)",
  category: "Capital · ₹5k · 15m Bounce",
  blurb:
    "Live signal: close lower Bollinger Band ke neeche + RSI < 30 + price EMA 200 ke upar. Backtest approximate — EMA crossover engine par.",
  logic:
    "Live signal (default 15m): close lower Bollinger Band (Band Period ka SMA − 2 standard deviation, default 20) ke neeche ho, RSI(14) oversold level (default 30) se neeche ho, aur price EMA 200 ke upar ho — tab BUY. 'Target ref' = middle band (SMA). Crash/volatility filter abhi nahi hai." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#8b5cf6",
  icon: Target,
  engineNote: emaEngineNote(
    "EMA 9 jab EMA 21 aur EMA 50 dono ko cross kare, aur entry tabhi jab RSI(14) 30 se neeche ya 60 se upar ho",
    "Bollinger Band, middle-band target aur crash-candle filter backtest mein nahi hain (crash filter live signal mein bhi abhi nahi hai).",
  ),
  fields: [
    { key: "period", label: "Band Period", kind: "number", group: "signal", min: 10, max: 50, onCard: true },
    { key: "rsi_thresh", label: "RSI Oversold", kind: "number", group: "signal", min: 20, max: 40, onCard: true },
    ...marketFields,
    ...riskFields,
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    timeframe: "15m",
    period: 20,
    rsi_thresh: 30,
    sl_points: 350,
    target_points: 700,
  },
  analyze(candles, values) {
    const period = num(values, "period", 20);
    const rsiThresh = num(values, "rsi_thresh", 30);
    const ema200Period = 200;

    const overlays: ChartOverlay[] = [
      { key: "bb_mid", label: `BB Mid (SMA ${period})`, color: "#8b5cf6" },
      { key: "bb_lower", label: "BB Lower", color: "var(--red)" },
      { key: emaKey(ema200Period), label: `EMA ${ema200Period}`, color: THIRD_COLOR },
    ];
    if (candles.length < Math.max(period + 2, 60)) return emptyAnalysis(candles, overlays);

    const decoratedEma = attachEma(candles, [ema200Period]);
    const closes = decoratedEma.map((c) => c.close);
    const rsiSeries = rsi(closes, 14);
    const atrSeries = atr(decoratedEma, 14);

    const decorated = decoratedEma.map((c, i) => {
      let mid = c.close;
      let lower = c.close;
      if (i >= period - 1) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += closes[j];
        mid = sum / period;
        let sumSq = 0;
        for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid) ** 2;
        const sd = Math.sqrt(sumSq / period);
        lower = mid - 2 * sd;
      }
      return { ...c, bb_mid: mid, bb_lower: lower, rsi: rsiSeries[i], atr: atrSeries[i] };
    });

    const last = decorated[decorated.length - 1];
    const lastRsi = rsiSeries[rsiSeries.length - 1] ?? 50;
    const lastAtr = atrSeries[atrSeries.length - 1] ?? 0;
    const midVal = last.bb_mid as number;
    const lowerVal = last.bb_lower as number;
    const ema200Val = (last as Candle)[emaKey(ema200Period)] as number;

    const isLowerBandTouch = last.close < lowerVal && lastRsi < rsiThresh && last.close > ema200Val;

    let signal: LiveSignal;
    if (isLowerBandTouch) {
      signal = {
        headline: "BUY — Lower Bollinger Band Oversold Bounce",
        detail: `Price ${price(last.close)} Lower Band (${price(lowerVal)}) ke neeche slip hua. RSI: ${lastRsi.toFixed(1)}. Target Mid: ${price(midVal)}.`,
        tone: "buy",
        readouts: [],
      };
    } else if (last.close < lowerVal) {
      signal = {
        headline: "Band Penetration — Checking RSI",
        detail: `Price lower band ke neeche hai, RSI ${lastRsi.toFixed(1)} (< ${rsiThresh}) confirm hone par buy trigger hoga.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Inside Normal Volatility Bands",
        detail: "Price normal range mein trade ho raha hai.",
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Price", value: price(last.close) },
      { label: "BB Lower", value: price(lowerVal), color: "var(--red)" },
      { label: "BB Mid (target ref)", value: price(midVal), color: "#8b5cf6" },
      { label: "RSI", value: lastRsi.toFixed(1), color: lastRsi < rsiThresh ? "var(--green)" : undefined },
      { label: "ATR", value: price(lastAtr) },
    ];

    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), use_rsi_filter: true, rsi_period: 14, rsi_oversold: 30 };
  },
};

const cryptoPortfolio50k: StrategyDef = {
  id: "crypto-portfolio-50k",
  name: "Multi-Asset Basket (₹50,000)",
  category: "Capital · ₹50k · 1h Portfolio",
  blurb:
    "Live signal: chune hue ek symbol par EMA 20/50 golden cross, price EMA 200 ke upar. BTC/ETH/SOL basket abhi na live signal mein lagu hai na backtest mein — backtest EMA crossover engine par.",
  logic:
    "Live signal sirf chune hue ek symbol par chalta hai (default BTC/USD, 1H): EMA 20 jab EMA 50 ko neeche se upar cross kare aur price EMA 200 ke upar ho — tab BUY; uske baad jab tak EMA 20 > EMA 50 aur price EMA 200 ke upar hai, 'Uptrend active' dikhta hai. BTC/ETH/SOL basket, BTC trend filter aur mean-reversion blend abhi implement nahi hain. Capital aur Risk % se sirf 'Risk budget' readout banta hai (capital × risk%) — position size ya stop ye strategy tay nahi karti." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#06b6d4",
  icon: Boxes,
  featured: true,
  engineNote: emaEngineNote(
    "EMA 20 jab EMA 50 aur EMA 200 dono ke upar cross kare to BUY, dono ke neeche to SELL — sirf chune hue ek symbol par",
    "BTC/ETH/SOL basket, BTC trend filter, aur Capital / Risk % fields backtest mein use nahi hote.",
  ),
  fields: [
    ...marketFields,
    { key: "capital", label: "Capital Allocation", kind: "number", group: "risk", min: 10000, max: 500000, onCard: true },
    { key: "risk_per_trade", label: "Risk % per trade", kind: "number", group: "risk", min: 0.1, max: 2.0, step: 0.1, onCard: true },
    ...backtestFields,
  ],
  defaults: {
    ...sharedDefaults,
    symbol: "BTCUSDT",
    timeframe: "1h",
    capital: 50000,
    risk_per_trade: 0.7,
    sl_points: 600,
    target_points: 1500,
  },
  analyze(candles, values) {
    const ema200Period = 200;
    const capital = num(values, "capital", 50000);
    const riskPct = num(values, "risk_per_trade", 0.7);
    const riskBudget = `₹${((capital * riskPct) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const overlays: ChartOverlay[] = [
      { key: emaKey(20), label: "EMA 20", color: FAST_COLOR },
      { key: emaKey(50), label: "EMA 50", color: SLOW_COLOR },
      { key: emaKey(ema200Period), label: `EMA ${ema200Period}`, color: THIRD_COLOR },
    ];
    if (candles.length < Math.max(ema200Period + 2, 60)) return emptyAnalysis(candles, overlays);

    const decorated = attachEma(candles, [20, 50, ema200Period]);
    const last = decorated[decorated.length - 1];
    const prev = decorated[decorated.length - 2];
    const fNow = last[emaKey(20)] as number;
    const sNow = last[emaKey(50)] as number;
    const fPrev = prev[emaKey(20)] as number;
    const sPrev = prev[emaKey(50)] as number;
    const ema200Val = last[emaKey(ema200Period)] as number;

    const isTrendBullish = fNow > sNow && last.close > ema200Val;
    const cross = crossDirection(fPrev, fNow, sPrev, sNow);

    let signal: LiveSignal;
    if (cross === "up" && last.close > ema200Val) {
      signal = {
        headline: "BUY — EMA 20/50 golden cross (EMA 200 ke upar)",
        detail: `Risk budget ${riskBudget} (₹${capital.toLocaleString("en-IN")} ka ${riskPct}%). Position size aur stop khud tay karein — ye signal nahi deta.`,
        tone: "buy",
        readouts: [],
      };
    } else if (isTrendBullish) {
      signal = {
        headline: "Uptrend active",
        detail: "EMA 20 EMA 50 ke upar aur price EMA 200 ke upar. Ye signal exit nahi deta — stop khud manage karein.",
        tone: "buy",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Golden cross ka intezaar",
        detail: "EMA 20 ka EMA 50 ke upar cross (price EMA 200 ke upar rehte hue) abhi nahi hua.",
        tone: "neutral",
        readouts: [],
      };
    }

    signal.readouts = [
      { label: "Price", value: price(last.close) },
      { label: "EMA 20", value: price(fNow), color: FAST_COLOR },
      { label: "EMA 50", value: price(sNow), color: SLOW_COLOR },
      { label: "EMA 200", value: price(ema200Val), color: THIRD_COLOR },
      { label: `Risk budget · ${riskPct}%`, value: riskBudget },
      { label: "Trend Status", value: isTrendBullish ? "Bullish" : "Neutral", color: isTrendBullish ? "var(--green)" : undefined },
    ];

    return { candles: decorated, overlays, signal };
  },
  toBacktest(values) {
    return { ...baseParams(values), ema9: 20, ema21: 50, ema50: 200 };
  },
};

export const STRATEGIES: StrategyDef[] = [
  trendRider,
  donchianBreakout20k,
  emaAdx10k,
  rsiReversion3k,
  bollingerRsi5k,
  cryptoPortfolio50k,
  emaCrossover,
  rsiDivergence,
  macdStrategy,
  customEma,
  rangeBreakout,
  atrChannelPro,
  vwapReclaimPro,
  emaPullbackPro,
  otmDirectional,
  debitSpread,
  ironCondor,
  momentumOtmPro,
  trendDebitPro,
  volCrushCondor,
];

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
