import { Activity, BarChart3, Boxes, Crosshair, Flame, Gauge, Layers, Shield, SignalHigh, Target, TrendingUp, Waves, Zap, type LucideIcon } from "lucide-react";
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
import { AVPT_DEFAULTS, AVPT_KEYS, replayAvpt, type AvptFilterMode, type AvptParams } from "./avpt";
import {
  BGRH_DEFAULTS,
  BGRH_KEYS,
  BUY_LOT_SEQUENCE,
  bgrhParamsFromValues,
  replayBuyGridRecovery,
} from "./buyGridRecovery";
import { TREND_KEYS, replayTrendRider, trendRiderQuantity } from "./trendRider";
import { TRIDENT_DEFAULTS, TRIDENT_KEYS, replayTrident, validHorizons } from "./trident";

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
  /** Server bot deploy par strategy ke apne extra params (jaise Steady ka tp1 / AVPT filter). */
  botParams?: (values: StrategyValues) => Record<string, number | boolean | string>;
  /** Ek click wale setups (Safe / Balanced / Growth) — kisi doosri strategy ke bhi ho sakte hain. */
  presets?: StrategyPreset[];
  /** In coins par ek click mein paper bots (capital barabar baant kar). */
  portfolio?: string[];
  /** Alt coin ka signal BTC ki candles se pakka hota hai — runner BTC bhi laata hai. */
  needsBtc?: boolean;
  /** Strategies tab ka scanner is strategy ko isi timeframe par chalaye (research wala), apne wale par nahi. */
  fixedTimeframe?: string;
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
  analyze: (candles: Candle[], values: StrategyValues, ctx?: { btc?: Candle[] }) => StrategyAnalysis;
  toBacktest: (values: StrategyValues) => BacktestParams;
}

/**
 * Ek click wala setup. `values` sirf research wale rules aur risk badalta hai — user ka
 * coin aur capital waise hi rehte hain. `expect` ke numbers backtest ke hain (guarantee nahi).
 */
export interface StrategyPreset {
  id: "safe" | "balanced" | "growth";
  label: string;
  color: string;
  /** Kis strategy page par ye setup chalta hai. */
  strategyId: string;
  /** "Steady · 1% risk" jaisa chhota naam. */
  summary: string;
  values: StrategyValues;
  expect: {
    yearly: string;
    maxDrawdown: string;
    worstMonth: string;
    positiveMonths: string;
    worstYear: string;
    tradesPerMonth: string;
  };
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
  headline: "Waiting for data",
  detail: "Signal updates once candles load.",
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
  { key: "sl_points", label: "Stop loss · pts", kind: "number", group: "risk", min: 1, hint: "Exit if price moves this many points against entry." },
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
  { key: "lots", label: "Contracts", kind: "number", group: "backtest", min: 1, step: 1, hint: "On Delta, 1 BTC option contract = 0.001 BTC." },
];

const OPTIONS_ENGINE_NOTE =
  "Backtest uses real Delta option data: picks listed expiry/strike by the same rules as live, tracks premium via mark. Half of max bid/ask as slippage per fill; fees excluded. Strike delta from ATM IV; volume/OI filters can’t apply to history.";

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
  blurb: "Buy on fast EMA cross above slow; sell on cross below.",
  logic:
    "BUY when fast EMA crosses above slow EMA; SELL on a cross below. Simple trend-follow — expect whipsaws in ranges; keep SL/target discipline.",
  accent: FAST_COLOR,
  icon: TrendingUp,
  engineNote:
    "Backtest uses the EMA engine: entry on fast vs slow cross (engine sets both ema21 and ema50 to the slow period).",
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
      signal = { headline: `BUY — EMA ${fast} crossed above EMA ${slow}`, tone: "buy", readouts: [] };
    } else if (cross === "down") {
      signal = { headline: `SELL — EMA ${fast} crossed below EMA ${slow}`, tone: "sell", readouts: [] };
    } else {
      signal = {
        headline: spread >= 0 ? "Bullish — fast EMA above" : "Bearish — fast EMA below",
        detail: "No fresh crossover on this bar.",
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
  blurb: "RSI divergences flag reversals. 70+ overbought, below 30 oversold.",
  logic:
    "Bearish divergence: price makes a new high, RSI does not. Bullish: new price low without RSI. Leaving overbought/oversold is also a mean-reversion signal.",
  accent: SLOW_COLOR,
  icon: Gauge,
  engineNote:
    "No standalone RSI backtest on the backend — backtest runs on the EMA crossover engine with these RSI levels as confirmation filters (BUY when RSI is below overbought, SELL when above oversold).",
  fields: [
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "overbought", label: "Overbought", kind: "number", group: "signal", min: 50, max: 95, onCard: true },
    { key: "oversold", label: "Oversold", kind: "number", group: "signal", min: 5, max: 50, onCard: true },
    { key: "pivot_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10, hint: "This many smaller bars on each side of the pivot." },
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
        detail: `Price made a new low but RSI did not (${divergence.barsAgo} bars ago).`,
        tone: "buy",
        readouts: [],
      };
    } else if (divergence.type === "bearish") {
      signal = {
        headline: "SELL — bearish divergence",
        detail: `Price made a new high but RSI did not (${divergence.barsAgo} bars ago).`,
        tone: "sell",
        readouts: [],
      };
    } else if (prev != null && prev >= overbought && now < overbought) {
      signal = { headline: "SELL — RSI left overbought", tone: "sell", readouts: [] };
    } else if (prev != null && prev <= oversold && now > oversold) {
      signal = { headline: "BUY — RSI left oversold", tone: "buy", readouts: [] };
    } else if (now >= overbought) {
      signal = { headline: "Overbought — waiting for reversal", detail: "Divergence not confirmed yet.", tone: "sell", readouts: [] };
    } else if (now <= oversold) {
      signal = { headline: "Oversold — waiting for reversal", detail: "Divergence not confirmed yet.", tone: "buy", readouts: [] };
    } else {
      signal = { headline: "Neutral — no divergence", tone: "neutral", readouts: [] };
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
  blurb: "Bullish when MACD crosses above its signal line; bearish on a cross below.",
  logic:
    "MACD line = EMA(fast) − EMA(slow). The signal line is an EMA of MACD. A cross above the signal is bullish momentum; below is bearish. The histogram is the difference — momentum weakens near zero.",
  accent: THIRD_COLOR,
  icon: BarChart3,
  engineNote:
    "The backend has no MACD engine — backtest uses the underlying EMA fast/slow crossover (zero-line cross). Signal period affects live signals only.",
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
      signal = { headline: "BUY — MACD crossed above signal", tone: "buy", readouts: [] };
    } else if (cross === "down") {
      signal = { headline: "SELL — MACD crossed below signal", tone: "sell", readouts: [] };
    } else {
      const rising = last.hist > prev.hist;
      signal = {
        headline: last.hist >= 0 ? "Bullish momentum" : "Bearish momentum",
        detail: `Histogram ${rising ? "rising" : "falling"} — no fresh cross yet.`,
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
  blurb: "BUY when EMA 9 and 21 both cross above EMA 50; SELL when both cross below.",
  logic:
    "Three-EMA setup: BUY when both EMA 9 and EMA 21 are above EMA 50; SELL when both are below. The backend pro backtest engine uses the same rule, so this strategy’s backtest is exact — no approximation.",
  accent: FAST_COLOR,
  icon: Zap,
  featured: true,
  engineNote: "Native backend engine — live signal and backtest share the same rules.",
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
      signal = { headline: `BUY — EMA ${fast} & ${mid} crossed above EMA ${slow}`, tone: "buy", readouts: [] };
    } else if (below && !wasBelow) {
      signal = { headline: `SELL — EMA ${fast} & ${mid} crossed below EMA ${slow}`, tone: "sell", readouts: [] };
    } else if (above) {
      signal = { headline: "Bullish — both EMAs above slow", detail: "No fresh cross yet.", tone: "buy", readouts: [] };
    } else if (below) {
      signal = { headline: "Bearish — both EMAs below slow", detail: "No fresh cross yet.", tone: "sell", readouts: [] };
    } else {
      signal = { headline: "Mixed — EMAs not aligned", tone: "neutral", readouts: [] };
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
  blurb: "Build a high/low range in a fixed time window; enter on a breakout with RSI confirmation.",
  logic:
    "The day’s range is the high/low of a chosen time window (default 11:00–13:00 IST). After the window, the first candle that closes outside the range is the breakout candle. Then BUY when a candle breaks that candle’s high and RSI is above the upper level; SELL on a break of the low with RSI below the lower level. Entry is at the breakout candle high/low; SL/target use points.",
  accent: RANGE_COLOR,
  icon: Boxes,
  engineNote:
    "This is the backend’s second native engine (`range-breakout`) — window, timezone, and RSI levels match backtest. Sensible on intraday timeframes (5m/15m) only; a window cannot form on 1d.",
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
          headline: "Invalid range window",
          detail: "Start time must be before end time (HH:MM).",
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
        ? `Range window has not started yet (${str(values, "range_start", "11:00")})`
        : "No candles for this window today";
      return {
        candles: decorated,
        overlays: [],
        signal: {
          headline,
          detail: `Window ${str(values, "range_start", "11:00")}–${str(values, "range_end", "13:00")} ${timeZone}. Load more chart history or use a shorter timeframe.`,
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
          headline: "Building range",
          detail: `Window closes at ${str(values, "range_end", "13:00")}, then watch for breakout.`,
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
      headline: "Range set — waiting for breakout",
      detail: "No candle has closed outside the range yet.",
      tone: "neutral",
      readouts: rangeReadouts,
    };

    for (const { index } of afterWindow) {
      const candle = candles[index];
      const candleRsi = rsiSeries[index];
      if (!breakoutLong && candle.close > rangeHigh) {
        breakoutLong = { high: candle.high };
        signal = {
          headline: "Upside breakout candle — waiting for trigger",
          detail: `Enter when a candle breaks ${price(breakoutLong.high)} and RSI is above ${upper}.`,
          tone: "neutral",
          readouts: rangeReadouts,
        };
        continue;
      }
      if (!breakoutShort && candle.close < rangeLow) {
        breakoutShort = { low: candle.low };
        signal = {
          headline: "Downside breakout candle — waiting for trigger",
          detail: `Enter when a candle breaks ${price(breakoutShort.low)} and RSI is below ${lower}.`,
          tone: "neutral",
          readouts: rangeReadouts,
        };
        continue;
      }
      if (candleRsi == null) continue;
      if (breakoutLong && candle.high > breakoutLong.high && candleRsi > upper) {
        signal = {
          headline: "BUY — upside breakout triggered",
          detail: `Entry ${price(breakoutLong.high)}, RSI ${candleRsi.toFixed(1)} (> ${upper}).`,
          tone: "buy",
          readouts: rangeReadouts,
        };
        breakoutLong = null;
        continue;
      }
      if (breakoutShort && candle.low < breakoutShort.low && candleRsi < lower) {
        signal = {
          headline: "SELL — downside breakout triggered",
          detail: `Entry ${price(breakoutShort.low)}, RSI ${candleRsi.toFixed(1)} (< ${lower}).`,
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
  blurb: "15m trend + 5m breakout → OTM Call or Put.",
  logic:
    "First 15M regime: EMA 9 > EMA 21, price above VWAP, and ADX above 20 — then the market is treated as trending. Then 5M entry: EMA 9 > EMA 21, close above recent swing high, volume above average. Six conditions are scored; need at least 5/6. Bearish side is mirrored — no SELL, buy OTM Put. Strike chosen from Delta 0.25–0.35 band, not fixed % OTM.",
  accent: "#7c3aed",
  icon: Target,
  optionChain: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 10, max: 60, onCard: true, hint: "Below this, treat the market as range-bound." },
    { key: "volume_lookback", label: "Volume average · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Minimum score (of 6)", kind: "number", group: "signal", min: 3, max: 6 },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "delta_min", label: "Strike delta · min", kind: "number", group: "risk", min: 0.05, max: 0.9, step: 0.01 },
    { key: "delta_max", label: "Strike delta · max", kind: "number", group: "risk", min: 0.05, max: 0.9, step: 0.01 },
    { key: "sl_premium_pct", label: "Stop loss · % premium", kind: "number", group: "risk", min: 10, max: 90, hint: "Doc: exit at 40–50% premium loss." },
    { key: "tp1_pct", label: "Partial book · % gain", kind: "number", group: "risk", min: 20, max: 500, hint: "Book half the quantity at +100%." },
    { key: "tp2_pct", label: "Final target · % gain", kind: "number", group: "risk", min: 20, max: 1000 },
    { key: "time_exit_hours", label: "Exit before expiry · hours", kind: "number", group: "risk", min: 0.5, max: 24, step: 0.5 },
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
        headline: "NO TRADE — market not trending",
        detail: `ADX ${adxNow?.toFixed(1) ?? "—"} vs threshold ${adxMin}. This strategy does not enter in range regimes.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (direction === "bull" && score >= minScore) {
      signal = {
        headline: "BUY CALL — bullish setup confirmed",
        detail: `Entry score ${score}/6. Strike Delta ${num(values, "delta_min", 0.25)}-${num(values, "delta_max", 0.35)} band — see the option chain below.`,
        tone: "buy",
        readouts: [],
      };
    } else if (direction === "bear" && score >= minScore) {
      signal = {
        headline: "BUY PUT — bearish setup confirmed",
        detail: `Entry score ${score}/6. Strike Delta ${num(values, "delta_min", 0.25)}-${num(values, "delta_max", 0.35)} band — see the option chain below.`,
        tone: "sell",
        readouts: [],
      };
    } else {
      const bias = direction === "bull" ? "Bullish" : direction === "bear" ? "Bearish" : "Mixed";
      const reasons = [...failed];
      if (slopeBlocked) reasons.push(`EMA ${fast} slope is against the bias`);
      signal = {
        headline: `${bias} — no entry yet (${score}/6)`,
        detail: reasons.length ? `Still need: ${reasons.join(", ")}.` : `Need at least ${minScore}/6.`,
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
  blurb: "ADX 20–30 Bull Call / Bear Put debit spread.",
  logic:
    "Trending but not too strong — 15M: EMA 9 > EMA 21, price above VWAP, ADX between 20 and 30. 5M: breakout and volume confirmation. Then buy near-the-money call and sell higher call (bull call spread); bearish mirror with puts. Short leg reduces cost and theta pain but caps profit — max profit = strike width minus net debit. Exit: SL at 40–50% of debit lost, book at 70–80% of max profit, mandatory exit 1–2 hours before expiry.",
  accent: "#0891b2",
  icon: Layers,
  optionSpread: { bullish: "call", bearish: "put" },
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200, onCard: true },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "adx_min", label: "ADX minimum", kind: "number", group: "signal", min: 5, max: 60, onCard: true },
    { key: "adx_max", label: "ADX maximum", kind: "number", group: "signal", min: 10, max: 90, onCard: true, hint: "Above this, trend is strong — naked buy works better." },
    { key: "volume_lookback", label: "Volume average · bars", kind: "number", group: "signal", min: 5, max: 100 },
    { key: "swing_span", label: "Swing span · bars", kind: "number", group: "signal", min: 1, max: 10 },
    { key: "min_score", label: "Minimum score (of 5)", kind: "number", group: "signal", min: 2, max: 5 },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "spread_width", label: "Strike width", kind: "number", group: "risk", min: 100, step: 100, hint: "Distance between strikes — max profit is capped by this." },
    { key: "long_delta", label: "Long leg delta", kind: "number", group: "risk", min: 0.2, max: 0.8, step: 0.05, hint: "0.5 = near the money, as in the doc example." },
    { key: "sl_debit_pct", label: "Stop loss · % of debit", kind: "number", group: "risk", min: 10, max: 90, hint: "Doc: exit when debit is down 40–50%." },
    { key: "tp_max_profit_pct", label: "Target · % of max profit", kind: "number", group: "risk", min: 20, max: 100, hint: "Doc: 70–80% of max profit." },
    { key: "time_exit_hours", label: "Exit before expiry · hours", kind: "number", group: "risk", min: 0.5, max: 24, step: 0.5 },
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
          { label: `ADX ${adxMin}-${adxMax} in band`, ok: adxInBand },
          { label: "Swing low breakdown (5M)", ok: brokeLow && !entryTrendUp },
          { label: "Volume confirmation", ok: volOk || regimeVolOk },
        ]
      : [
          { label: `EMA ${fast} > EMA ${slow} (15M)`, ok: trendUp },
          { label: "Price > VWAP (15M)", ok: aboveVwap },
          { label: `ADX ${adxMin}-${adxMax} in band`, ok: adxInBand },
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
        headline: "NO TRADE — trend too weak",
        detail: `ADX ${adxNow.toFixed(1)}, band ${adxMin}-${adxMax}. In ranges, spread debit gets eaten by theta.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (adxTooStrong) {
      signal = {
        headline: "Trend too strong — skip spreads",
        detail: `ADX ${adxNow?.toFixed(1)} is above the band. In this strong move the short leg caps upside — naked buy (OTM Directional) fits better.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (direction === "bull" && score >= minScore) {
      signal = {
        headline: "BULL CALL SPREAD — bullish setup confirmed",
        detail: `Score ${score}/5. Buy near-the-money call + sell call ${num(values, "spread_width", 2000)} higher — see legs below.`,
        tone: "buy",
        readouts: [],
      };
    } else if (direction === "bear" && score >= minScore) {
      signal = {
        headline: "BEAR PUT SPREAD — bearish setup confirmed",
        detail: `Score ${score}/5. Buy near-the-money put + sell put ${num(values, "spread_width", 2000)} lower — see legs below.`,
        tone: "sell",
        readouts: [],
      };
    } else {
      const bias = direction === "bull" ? "Bullish" : direction === "bear" ? "Bearish" : "Mixed";
      signal = {
        headline: `${bias} — no entry yet (${score}/5)`,
        detail: failed.length ? `Still need: ${failed.join(", ")}.` : `Need at least ${minScore}/5.`,
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
  blurb: "Range (ADX < 20): four-leg iron condor for premium.",
  logic:
    "Market going nowhere — ADX below 20, EMA 9 and 21 nearly flat, price inside its range, volatility calm. Then sell a call and buy a farther call above, sell a put and buy a farther put below. Short legs ~0.15–0.20 delta, protection ~0.05–0.10. Full credit if price stays between short strikes. Max loss = wider wing minus credit. Exit: book at ~50% of credit profit, or cut at 1.5× credit loss. Also exit if short-strike delta spikes.",
  accent: "#d97706",
  icon: Waves,
  optionCondor: true,
  engineNote: OPTIONS_ENGINE_NOTE,
  fields: [
    { key: "adx_max", label: "ADX maximum", kind: "number", group: "signal", min: 5, max: 40, onCard: true, hint: "Above this is a trend — skip condors." },
    { key: "adx_period", label: "ADX period", kind: "number", group: "signal", min: 5, max: 50 },
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 100 },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 3, max: 200 },
    { key: "ema_gap_pct", label: "EMA gap · max %", kind: "number", group: "signal", min: 0.01, max: 2, step: 0.01, onCard: true, hint: "EMA 9 and 21 must be this close to count as 'flat'." },
    { key: "range_lookback", label: "Range lookback · bars", kind: "number", group: "signal", min: 20, max: 300 },
    { key: "range_buffer_pct", label: "Range edge buffer · %", kind: "number", group: "signal", min: 1, max: 40, hint: "Price this far from range edge — else breakout risk." },
    { key: "atr_spike_mult", label: "ATR spike limit · x", kind: "number", group: "signal", min: 1, max: 5, step: 0.1, hint: "Volatility spike when current ATR exceeds this multiple of its average." },
    ...marketFields,
    ...optionsBacktestFields,
    { key: "short_delta", label: "Short legs delta", kind: "number", group: "risk", min: 0.05, max: 0.4, step: 0.005, hint: "Doc: 0.15-0.20." },
    { key: "long_delta", label: "Protection delta", kind: "number", group: "risk", min: 0.01, max: 0.2, step: 0.005, hint: "Doc: 0.05-0.10." },
    { key: "max_iv_pct", label: "Max IV · %", kind: "number", group: "risk", min: 10, max: 200, hint: "Above this, IV is treated as elevated — doc blocks new entries." },
    { key: "tp_credit_pct", label: "Target · % of credit", kind: "number", group: "risk", min: 10, max: 100, hint: "Doc: book ~50% of credit as profit." },
    { key: "sl_credit_mult", label: "Stop loss · x credit", kind: "number", group: "risk", min: 1, max: 5, step: 0.1, hint: "Doc: 1.5x credit, configurable." },
    { key: "emergency_delta", label: "Emergency exit delta", kind: "number", group: "risk", min: 0.2, max: 0.8, step: 0.05, hint: "Defensive action if short-strike delta goes above this." },
    { key: "time_exit_hours", label: "Exit before expiry · hours", kind: "number", group: "risk", min: 1, max: 72, step: 1 },
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
      { label: "Price inside range", ok: insideRange },
      { label: "No fresh breakout", ok: noBreakout },
      { label: "Calm volatility (ATR)", ok: atrCalm },
    ];
    const score = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).map((c) => c.label);
    const decorated = attachEma(candles, [fast, slow]);

    let signal: LiveSignal;
    if (score === checks.length) {
      signal = {
        headline: "IRON CONDOR — range regime confirmed",
        detail: `Range ${price(rangeLow)}-${price(rangeHigh)}. See legs and credit below; also check IV before entry.`,
        tone: "neutral",
        readouts: [],
        entry: true,
      };
    } else if (!adxCalm) {
      signal = {
        headline: "NO TRADE — market is trending",
        detail: `ADX ${adxNow?.toFixed(1) ?? "—"}, need below ${adxMax}. Trending markets break condor short strikes.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: `Building range — no entry yet (${score}/5)`,
        detail: `Still need: ${failed.join(", ")}.`,
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
  blurb: "Close outside ATR channel + strong ADX → futures entry.",
  logic:
    "Midline = EMA(period). Upper = midline + ATR×multiplier, lower = midline − ATR×multiplier. Bullish: close above upper band + ADX ≥ min + volume above average. Bearish: close below lower band + same filters. ADX filter cuts whipsaws — in sideways markets the channel breaks repeatedly.",
  accent: "#f97316",
  icon: Flame,
  featured: true,
  engineNote:
    "Live signal uses ATR channel + ADX. Backtest approximates on the backend EMA crossover engine (fast/slow = EMA period / 2×period) — not an exact ATR breakout replica.",
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
      signal = { headline: "Break up — ADX weak, skip", detail: "Channel broke but trend strength is weak.", tone: "neutral", readouts: [] };
    } else if (lower != null && close < lower && !trendOk) {
      signal = { headline: "Break down — ADX weak, skip", detail: "Channel broke but trend strength is weak.", tone: "neutral", readouts: [] };
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
  blurb: "VWAP reclaim + EMA align + volume → momentum entry.",
  logic:
    "UTC-day VWAP midline. Long: first bar below (or touching) VWAP, next bar closes above VWAP + EMA fast > slow + volume > average. Short: mirror. Pros use this on session open / trend days — VWAP reclaim often signals institutional flow.",
  accent: "#0891b2",
  icon: Crosshair,
  featured: true,
  engineNote:
    "Live signal uses VWAP reclaim + EMA alignment + volume. Backtest is EMA crossover approximation — VWAP session logic is not in the backend engine.",
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_slow", label: "EMA slow", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "volume_lookback", label: "Volume avg · bars", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "rsi_period", label: "RSI period", kind: "number", group: "signal", min: 2, max: 50 },
    { key: "require_rsi", label: "RSI not extreme", kind: "toggle", group: "signal", hint: "Long: RSI < overbought; short: RSI > oversold." },
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
        detail: "Reclaimed VWAP after dip, EMA bullish, volume confirmed.",
        tone: "buy",
        readouts: [],
      };
    } else if (reclaimDown && bearTrend && volOk && rsiShortOk) {
      signal = {
        headline: "SHORT — VWAP lose + trend",
        detail: "Close below VWAP, EMA bearish, volume confirmed.",
        tone: "sell",
        readouts: [],
      };
    } else if (reclaimUp) {
      signal = { headline: "VWAP reclaim — filters incomplete", detail: "Complete trend / volume / RSI checks.", tone: "neutral", readouts: [] };
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
  blurb: "EMA stack + ADX: trade the pullback bounce.",
  logic:
    "Bullish stack: EMA fast > mid > slow and ADX ≥ min. Pullback: price near mid EMA (within band %) then close back above mid. Optional RSI bounce out of oversold. Bearish mirror. Pro desk ‘buy the dip in trend’ — better R:R than chasing breakouts.",
  accent: FAST_COLOR,
  icon: Activity,
  featured: true,
  engineNote:
    "Live signal uses EMA stack + pullback band + ADX. Backtest approximates on EMA crossover engine — pullback timing will not match exactly.",
  fields: [
    { key: "ema_fast", label: "EMA fast", kind: "number", group: "signal", min: 2, max: 50, onCard: true },
    { key: "ema_mid", label: "EMA mid (pullback)", kind: "number", group: "signal", min: 5, max: 100, onCard: true },
    { key: "ema_slow", label: "EMA slow (trend)", kind: "number", group: "signal", min: 10, max: 200, onCard: true },
    { key: "pullback_pct", label: "Touch band · %", kind: "number", group: "signal", min: 0.05, max: 2, step: 0.05, hint: "Price comes within this % of mid EMA." },
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
      signal = { headline: "Bull trend — waiting for pullback", tone: "buy", readouts: [] };
    } else if (bearStack && trendOk) {
      signal = { headline: "Bear trend — waiting for pullback", tone: "sell", readouts: [] };
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
  blurb: "Strong trend + swing break → OTM Call/Put.",
  logic:
    "Regime TF (entry×3): EMA fast > slow, price above VWAP, ADX ≥ min and rising. Entry TF: swing high/low break + volume > avg + RSI on momentum side. At score ≥ min_score, OTM Call (bull) / Put (bear). Tighter delta band (0.30–0.40) — slightly higher delta in momentum to catch the move.",
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
        detail: "Regime + breakout + volume aligned. Use OTM Call from the delta band.",
        tone: "buy",
        readouts: [],
      };
    } else if (bearScore >= minScore) {
      signal = {
        headline: `BUY PUT — momentum ${bearScore}/6`,
        detail: "Bear regime + breakdown. Use OTM Put from the delta band.",
        tone: "sell",
        readouts: [],
      };
    } else {
      signal = {
        headline: `Momentum building — ${Math.max(bullScore, bearScore)}/6`,
        detail: "Score still low; wait for breakout + rising ADX.",
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
  blurb: "ADX 22–35 Bull Call / Bear Put debit spread.",
  logic:
    "15M regime: EMA align + VWAP side + ADX between min–max (very strong ADX → naked OTM better). 5M: pullback complete (RSI bounce from mid-zone) + EMA reclaim. Score ≥ 4/5. Long delta ~0.45–0.55, configurable width. Max loss = debit; target = 60–75% of max profit.",
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
    { key: "adx_max", label: "ADX max", kind: "number", group: "signal", min: 25, max: 50, onCard: true, hint: "Above this, prefer naked OTM." },
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
        detail: `ADX ${adxNow.toFixed(1)} > ${adxMax}. Debit spread R:R is weak here.`,
        tone: "neutral",
        readouts: [],
      };
    } else if (bullScore >= minScore && bullScore >= bearScore) {
      signal = {
        headline: `BULL CALL SPREAD — ${bullScore}/5`,
        detail: "Defined-risk call debit. Tune width and long delta.",
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
  blurb: "Post-vol crush: calm range → sell iron condor.",
  logic:
    "Enter when: (1) ATR meaningfully below recent high (crush), (2) ADX < max, (3) small EMA fast/slow gap, (4) price mid-range, (5) no fresh breakout. Classic post-event IV crush — iron condor short wings for theta, hedge on emergency delta.",
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
    { key: "crush_pct", label: "ATR crush · % below peak", kind: "number", group: "signal", min: 10, max: 60, hint: "Current ATR this % below peak." },
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
        detail: "ATR below peak, range-bound. Short + long wings from the Condor panel.",
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

/** Research mein yahi teen saath sabse smooth rahe — portfolio backtest inhi par. */
export const TREND_RIDER_PORTFOLIO = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const TR_UP = "#10b981";
const TR_DOWN = "#ef4444";
const TR_STOP = "#f59e0b";

function coinOf(symbol: string): string {
  return symbol.replace(/USDT?$/, "") || symbol;
}

function fmtWhen(timeMs: number): string {
  return new Date(timeMs).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Research wale rules — preset inhi par chalte hain (sirf risk alag). */
const TREND_RULES: StrategyValues = {
  timeframe: "4h",
  channel: 30,
  exit_channel: 15,
  stop_atr: 2,
  allow_shorts: true,
  backtest_scope: "portfolio",
};

/**
 * Sep 2020 → Oct 2026, BTC + ETH + SOL barabar, Delta fees + GST, slippage, funding ke baad
 * (scratchpad research `presets.py`). Teeno ka koi bhi calendar saal minus nahi gaya.
 */
export const TREND_PRESETS: StrategyPreset[] = [
  {
    id: "safe",
    label: "Safe",
    color: "#10b981",
    strategyId: "trend-rider-steady",
    summary: "Bank Steady · 1% risk",
    values: { ...TREND_RULES, risk_pct: 1, tp1_r: 1, tp1_pct: 25 },
    expect: { yearly: "~10.6%", maxDrawdown: "11.1%", worstMonth: "−3.4%", positiveMonths: "58%", worstYear: "+1.8%", tradesPerMonth: "~10" },
  },
  {
    id: "balanced",
    label: "Balanced",
    color: "#f59e0b",
    strategyId: "trend-rider",
    summary: "Channel Break · 1% risk",
    values: { ...TREND_RULES, risk_pct: 1 },
    expect: { yearly: "~13.5%", maxDrawdown: "12.5%", worstMonth: "−3.7%", positiveMonths: "53%", worstYear: "+1.0%", tradesPerMonth: "~9" },
  },
  {
    id: "growth",
    label: "Growth",
    color: "#ef4444",
    strategyId: "trend-rider-steady",
    summary: "Bank Steady · 2% risk",
    values: { ...TREND_RULES, risk_pct: 2, tp1_r: 1, tp1_pct: 25 },
    expect: { yearly: "~20.7%", maxDrawdown: "20.8%", worstMonth: "−6.7%", positiveMonths: "58%", worstYear: "+3.1%", tradesPerMonth: "~10" },
  },
];

/** Ye values kis preset jaisi hain — koi rule badla ho to null (custom). */
export function matchPreset(def: StrategyDef, values: StrategyValues): StrategyPreset | null {
  return (
    (def.presets ?? []).find(
      (p) =>
        p.strategyId === def.id &&
        Object.entries(p.values).every(([key, want]) => {
          // Backtest kis par chale ye trading rule nahi — preset wahi rehta hai.
          if (key === "backtest_scope") return true;
          const got = values[key];
          return typeof want === "number" ? Number(got) === want : String(got) === String(want);
        }),
    ) ?? null
  );
}

/**
 * Trend Rider + Steady + Pro share one engine. Steady adds a first profit (tp1);
 * Pro adds weekend skip + BTC confirmation. Backtest, live signal, and server bot
 * all use `trend_rider.py`.
 */
function makeTrendRider(variant: "base" | "steady" | "pro"): StrategyDef {
  const steady = variant !== "base";
  const pro = variant === "pro";
  const tp1R = (values: StrategyValues) => (steady ? num(values, "tp1_r", 1) : 0);
  const tp1Frac = (values: StrategyValues) => (steady ? num(values, "tp1_pct", 25) / 100 : 0);
  return {
    id: pro ? "trend-rider-pro" : steady ? "trend-rider-steady" : "trend-rider",
    name: pro ? "Rider Pro" : steady ? "Bank Steady" : "Channel Break",
    category: pro ? "Trend following · weekday + BTC filter" : steady ? "Trend following · ~50% win rate" : "Trend following · Perp long/short",
    blurb: pro
      ? "Bank Steady + weekend filter + BTC confirm."
      : steady
      ? "Channel Break + 25% at +1R, stop to entry."
      : "30-bar breakout · EMA 200 · trailing stop.",
    logic: pro
      ? "Bank Steady rules (30-bar breakout, EMA 200, 2× ATR stop, 15-bar trail, 25% at +1R → stop to entry) plus: (1) no signals on Sat/Sun UTC candles; (2) alt LONG only if BTC is above EMA 200, SHORT only if BTC is in bear regime. Holdout 2023–26: PF ~1.71, max DD ~8.3%, ~52% win rate on BTC+ETH+SOL."
      : steady
      ? "LONG when a 4h close breaks the prior 30-bar high above EMA 200; SHORT on a 30-bar low break in a confirmed bear (EMA 50 < EMA 200). Stop 2× ATR, then trail on 15-bar low/high. At +1R book 25% and move stop to entry+fees. Win rate ~50%; runners keep 75% of the position."
      : "Trade only in trend. LONG: 4h close above prior 30-bar high and above EMA 200. SHORT: close below 30-bar low, below EMA 200, and EMA 50 < EMA 200. Enter next open. Stop = 2× ATR from signal close; trail to prior 15-bar low/high (never worse). Size so a stop loses ~1% of capital. Edge is low win rate with large winners.",
    accent: pro ? "#a855f7" : steady ? "#0ea5e9" : TR_UP,
    icon: pro ? Crosshair : steady ? Shield : Waves,
    featured: true,
    autoTrade: true,
    minHistoryBars: 1000,
    backtestable: true,
    engineNote: "Native `trend-rider` engine · 4h recommended · Delta fees + slippage + funding in backtests · evaluate over 6–12 months.",
    botParams: (values): Record<string, number | boolean> => ({
      ...(steady ? { tp1_r: tp1R(values), tp1_frac: tp1Frac(values) } : {}),
      ...(pro ? { skip_weekend: true, btc_confirm: true } : {}),
    }),
    presets: pro ? undefined : TREND_PRESETS,
    portfolio: TREND_RIDER_PORTFOLIO,
    needsBtc: pro,
    fixedTimeframe: "4h",
    fields: [
      { key: "channel", label: "Entry channel", kind: "number", group: "signal", min: 5, max: 200, onCard: true, hint: "Entry when a closed candle breaks this channel high/low." },
      { key: "exit_channel", label: "Trail channel", kind: "number", group: "signal", min: 3, max: 200, hint: "Stop trails the prior N-bar low (long) / high (short)." },
      { key: "stop_atr", label: "Stop ATR ×", kind: "number", group: "signal", min: 0.5, max: 6, step: 0.5 },
      ...(steady
        ? ([
            { key: "tp1_r", label: "First profit R", kind: "number", group: "signal", min: 0.5, max: 5, step: 0.25, onCard: true, hint: "Book the first slice this many R from entry. Research: 1R." },
            { key: "tp1_pct", label: "Book at first %", kind: "number", group: "signal", min: 5, max: 90, step: 5, hint: "25% balanced best; more book = same win rate, less profit." },
          ] satisfies StrategyField[])
        : []),
      { key: "allow_shorts", label: "Allow shorts (bear only)", kind: "toggle", group: "signal" },
      ...marketFields,
      {
        key: "capital",
        label: "Capital ($)",
        kind: "number",
        group: "risk",
        min: 10,
        step: 10,
        onCard: true,
        hint: "Portfolio backtest splits this evenly across BTC, ETH, SOL.",
      },
      {
        key: "risk_pct",
        label: "Risk %",
        kind: "number",
        group: "risk",
        min: 0.1,
        max: 5,
        step: 0.1,
        onCard: true,
        hint: "% of capital lost if the stop hits. 1% is standard; 2% can push max DD near ~30%.",
      },
      {
        key: "backtest_scope",
        label: "Backtest on",
        kind: "select",
        group: "backtest",
        options: [
          { value: "portfolio", label: "Portfolio · BTC + ETH + SOL" },
          { value: "single", label: "Selected coin only" },
        ],
        hint: "A single coin can range for a year; the portfolio rides whichever trends.",
      },
      { key: "days", label: "History · days", kind: "number", group: "backtest", min: 30, max: 700, hint: "Use 365+ days — short windows show luck, not edge." },
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
      backtest_scope: "portfolio",
      days: 365,
      ...(steady ? { tp1_r: 1, tp1_pct: 25 } : {}),
    },
    analyze(candles, values, ctx) {
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
        tp1R: tp1R(values),
        tp1Frac: tp1Frac(values),
        skipWeekend: pro,
        btcConfirm: pro,
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
            headline: "Need more history",
            detail: `Need at least ${params.emaSlow + params.channel + 10} candles for EMA ${params.emaSlow} and the ${params.channel}-bar channel.`,
            tone: "neutral",
            readouts: [],
          },
        };
      }

      const isBtc = symbol.toUpperCase().startsWith("BTC");
      const btc = pro && !isBtc ? ctx?.btc ?? [] : undefined;
      if (btc && btc.length < params.emaSlow + 10) {
        return {
          ...emptyAnalysis(candles, overlays),
          signal: { headline: "Waiting for BTC data", detail: "Pro confirms alt signals with BTC regime — loading BTC candles.", tone: "neutral", readouts: [] },
        };
      }
      const r = replayTrendRider(candles, params, intervalMs, undefined, btc);
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
        const booked = steady && p.tp1Done;
        signal = {
          headline: booked
            ? `${long ? "LONG" : "SHORT"} open — ${Math.round(tp1Frac(values) * 100)}% booked, stop ${price(p.stop)}`
            : `${long ? "LONG" : "SHORT"} open — trail ${price(p.stop)}`,
          detail:
            `Entry ${price(p.entryPrice)} (${fmtWhen(p.entryTime)}), now ${move >= 0 ? "+" : ""}${move.toFixed(2)}%. ` +
            (steady && p.tp1Price != null && !p.tp1Done
              ? `First profit at ${price(p.tp1Price)} — book ${Math.round(tp1Frac(values) * 100)}% and move stop to entry. `
              : booked
                ? "First profit booked — trade is breakeven except for gaps. "
                : "") +
            `Stop trails the prior ${params.exitChannel}-bar ${long ? "low" : "high"} each close — never ${long ? "down" : "up"}.`,
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
          headline: long ? `BUY — ${params.channel}-bar breakout` : `SELL — ${params.channel}-bar breakdown (bear)`,
          detail:
            `Closed candle broke the channel ${long ? "high" : "low"}. Entry near ${price(entry)}, stop ${price(p.stop)}` +
            (steady && p.tp1Price != null ? `, first profit ${price(p.tp1Price)}` : "") +
            `. $${capital.toLocaleString("en-US")} @ ${riskPct}% risk = ${qty.toFixed(4)} ${coin}.`,
          tone: long ? "buy" : "sell",
          entry: true,
          readouts: [],
        };
      } else if (r.regime === "bull") {
        signal = {
          headline: "Flat — waiting for breakout",
          detail: `LONG when a 4h candle closes above ${price(r.upper)}. Sitting out ranges is part of the edge.`,
          tone: "neutral",
          readouts: [],
        };
      } else if (r.regime === "bear" && params.allowShorts) {
        signal = {
          headline: "Flat — bear regime, waiting for breakdown",
          detail: `SHORT when a 4h candle closes below ${price(r.lower)}. No longs until price is above EMA ${params.emaSlow}.`,
          tone: "neutral",
          readouts: [],
        };
      } else {
        signal = {
          headline: "Flat — no clear trend",
          detail: `Price is below EMA ${params.emaSlow} but EMA 50 is still above — cash is the position.`,
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
        ...(steady
          ? [
              {
                label: `First profit · ${Math.round(tp1Frac(values) * 100)}%`,
                value: r.position
                  ? r.position.tp1Done
                    ? "Booked ✓"
                    : price(r.position.tp1Price)
                  : r.pending?.tp1Price != null
                    ? price(r.pending.tp1Price)
                    : `+${price(tp1R(values) * stopDist)} (${tp1R(values)}R)`,
                color: "#0ea5e9",
              },
            ]
          : []),
        ...(pro ? proReadouts(btc, params, last.time + intervalMs) : []),
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
        symbols: str(values, "backtest_scope", "portfolio") === "portfolio" ? TREND_RIDER_PORTFOLIO.join(",") : undefined,
        ...(steady ? { tp1_r: tp1R(values), tp1_frac: tp1Frac(values) } : {}),
        ...(pro ? { skip_weekend: true, btc_confirm: true } : {}),
      };
    },
  };
}

/** Pro filter status for the next closed candle. */
function proReadouts(btc: Candle[] | undefined, params: { emaFast: number; emaSlow: number }, nextCloseMs: number): LiveReadout[] {
  const day = new Date(nextCloseMs - 1).getUTCDay();
  const weekend = day === 0 || day === 6;
  const out: LiveReadout[] = [
    { label: "Weekend filter", value: weekend ? "Weekend — no new signal" : "Weekday — signals on", color: weekend ? "var(--amber)" : "var(--green)" },
  ];
  if (btc?.length) {
    const closes = btc.map((b) => b.close);
    const ef = ema(closes, params.emaFast);
    const es = ema(closes, params.emaSlow);
    const k = closes.length - 1;
    const up = closes[k] > es[k];
    const dn = closes[k] < es[k] && ef[k] < es[k];
    out.push({
      label: "BTC regime",
      value: up ? "Bull — longs only" : dn ? "Bear — shorts only" : "Neutral — no alt trades",
      color: up ? "var(--green)" : dn ? "var(--red)" : undefined,
    });
  }
  return out;
}

const trendRider = makeTrendRider("base");
const trendRiderSteady = makeTrendRider("steady");
const trendRiderPro = makeTrendRider("pro");

/* ── Trident Momentum — teen horizon ka momentum ek taraf ─ */

const TD_ACCENT = "#f97316";
const TD_REF_COLORS = ["#38bdf8", "#818cf8", "#e879f9"] as const;

/** "30 candles" ko timeframe ke hisaab se din mein — 4h par 30 = 5 din. */
function horizonLabel(bars: number, timeframe: string): string {
  const days = (bars * intervalMinutes(timeframe)) / 1440;
  return days >= 1 ? `${Number(days.toFixed(1))}d` : `${Math.round(days * 24)}h`;
}

function voteMark(v: number | null): string {
  return v == null ? "…" : v > 0 ? "▲" : v < 0 ? "▼" : "•";
}

/**
 * Trend Rider asks "new high?"; Trident asks "is price above the 5/15/30-day closes?"
 * Backtest, live signal, and server bot share `trident.py` / `trident.ts`.
 */
const tridentMomentum: StrategyDef = {
  id: "trident-momentum",
  name: "Trident Momentum 4H",
  category: "Momentum consensus · 5/15/30d",
  blurb: "Enter when 5/15/30-day momentum agree; exit when two flip.",
  logic:
    "Each horizon votes: is the close above or below the close N bars ago (30/90/180 on 4h ≈ 5/15/30 days). First closed bar where all three vote up → LONG next open. All three down + EMA 50 < EMA 200 → SHORT. Exit next open after two votes flip. Fixed stop = 2.5× ATR at entry (~1% risk sizing). Unlike Channel Break, no new-high requirement and no trail — exit on momentum break. Win rate ~25–30%; ~70% of time in market.",
  accent: TD_ACCENT,
  icon: SignalHigh,
  featured: true,
  autoTrade: true,
  minHistoryBars: 1000,
  backtestable: true,
  engineNote: "Native `trident-momentum` engine · exit set on closed bar, filled next open · 4h · evaluate over 6–12 months.",
  botParams: (values): Record<string, number | boolean> => ({
    h1: num(values, "h1", 30),
    h2: num(values, "h2", 90),
    h3: num(values, "h3", 180),
  }),
  portfolio: TREND_RIDER_PORTFOLIO,
  fixedTimeframe: "4h",
  fields: [
    { key: "h1", label: "Short horizon", kind: "number", group: "signal", min: 5, max: 400, onCard: true, hint: "On 4h, 30 bars ≈ 5 days." },
    { key: "h2", label: "Mid horizon", kind: "number", group: "signal", min: 6, max: 400, hint: "On 4h, 90 ≈ 15 days. Keep above the short horizon." },
    { key: "h3", label: "Long horizon", kind: "number", group: "signal", min: 7, max: 400, hint: "On 4h, 180 ≈ 30 days. Research favored ~30 days." },
    { key: "stop_atr", label: "Stop ATR ×", kind: "number", group: "signal", min: 0.5, max: 6, step: 0.5, hint: "Stop does not trail — exit when momentum breaks." },
    { key: "allow_shorts", label: "Allow shorts (bear only)", kind: "toggle", group: "signal" },
    ...marketFields,
    {
      key: "capital",
      label: "Capital ($)",
      kind: "number",
      group: "risk",
      min: 10,
      step: 10,
      onCard: true,
      hint: "Portfolio backtest splits this evenly across BTC, ETH, SOL.",
    },
    {
      key: "risk_pct",
      label: "Risk %",
      kind: "number",
      group: "risk",
      min: 0.1,
      max: 5,
      step: 0.1,
      onCard: true,
      hint: "% of capital lost if the stop hits. Research used 1%.",
    },
    {
      key: "backtest_scope",
      label: "Backtest on",
      kind: "select",
      group: "backtest",
      options: [
        { value: "portfolio", label: "Portfolio · BTC + ETH + SOL" },
        { value: "single", label: "Selected coin only" },
      ],
    },
    { key: "days", label: "History (days)", kind: "number", group: "backtest", min: 30, max: 700, hint: "Use 365+ days — short windows show luck, not edge." },
  ],
  defaults: {
    symbol: "BTCUSDT",
    timeframe: "4h",
    h1: 30,
    h2: 90,
    h3: 180,
    stop_atr: 2.5,
    allow_shorts: true,
    capital: 1000,
    risk_pct: 1,
    backtest_scope: "portfolio",
    days: 365,
  },
  analyze(candles, values) {
    const symbol = str(values, "symbol", "BTCUSDT");
    const timeframe = str(values, "timeframe", "4h");
    const intervalMs = intervalMinutes(timeframe) * 60_000;
    const horizons: [number, number, number] = [
      Math.round(num(values, "h1", 30)),
      Math.round(num(values, "h2", 90)),
      Math.round(num(values, "h3", 180)),
    ];
    const params = { ...TRIDENT_DEFAULTS, horizons, stopAtr: num(values, "stop_atr", 2.5), allowShorts: bool(values, "allow_shorts") };
    const capital = num(values, "capital", 1000);
    const riskPct = num(values, "risk_pct", 1);
    const labels = horizons.map((hz) => horizonLabel(hz, timeframe));
    const overlays: ChartOverlay[] = [
      ...horizons.map((_, i) => ({ key: TRIDENT_KEYS.ref[i], label: `${labels[i]} ago close`, color: TD_REF_COLORS[i] })),
      { key: emaKey(params.emaSlow), label: `EMA ${params.emaSlow}`, color: THIRD_COLOR },
      { key: TRIDENT_KEYS.stop, label: "Active stop", color: TR_STOP },
    ];
    if (!validHorizons(horizons)) {
      return {
        ...emptyAnalysis(candles, overlays),
        signal: { headline: "Fix horizons", detail: "Keep horizons ascending (e.g. 30 / 90 / 180), each between 5–400 bars.", tone: "neutral", readouts: [] },
      };
    }
    const need = Math.max(horizons[2], params.emaSlow) + 20;
    if (candles.length < need) {
      return {
        ...emptyAnalysis(candles, overlays),
        signal: {
          headline: "Need more history",
          detail: `Need at least ${need} candles for the ${horizons[2]}-bar horizon and EMA ${params.emaSlow}.`,
          tone: "neutral",
          readouts: [],
        },
      };
    }

    const r = replayTrident(candles, params, intervalMs);
    const coin = coinOf(symbol);
    const last = candles[candles.length - 1];
    const ups = r.votes.filter((v) => v != null && v > 0).length;
    const downs = r.votes.filter((v) => v != null && v < 0).length;

    let signal: LiveSignal;
    let desired: AutoTradeState["desired"] = null;
    const p = r.position;
    if (p && !r.exiting) {
      const long = p.side === "long";
      const move = ((last.close - p.entryPrice) / p.entryPrice) * 100 * (long ? 1 : -1);
      desired = { side: p.side, entryTime: p.entryTime, stop: p.stop };
      signal = {
        headline: `${long ? "LONG" : "SHORT"} open — ${long ? ups : downs}/3 horizons aligned`,
        detail:
          `Entry ${price(p.entryPrice)} (${fmtWhen(p.entryTime)}), now ${move >= 0 ? "+" : ""}${move.toFixed(2)}%. Stop ${price(p.stop)} (fixed). ` +
          `Exit when 2 of 3 horizons flip ${long ? "down" : "up"} — decided on the close, filled next open.`,
        tone: long ? "buy" : "sell",
        readouts: [],
      };
    } else if (r.pending) {
      const pd = r.pending;
      const long = pd.side === "long";
      const entry = pd.entryPrice ?? last.close;
      const qty = trendRiderQuantity(capital, riskPct, entry, pd.stop);
      desired = { side: pd.side, entryTime: pd.entryTime, stop: pd.stop };
      signal = {
        headline: long ? `BUY — all horizons up (${labels.join(" / ")})` : `SELL — all horizons down (bear)`,
        detail:
          (p && r.exiting ? `Closing prior ${p.side.toUpperCase()}. ` : "") +
          `Entry near ${price(entry)}, stop ${price(pd.stop)}. $${capital.toLocaleString("en-US")} @ ${riskPct}% risk = ${qty.toFixed(4)} ${coin}.`,
        tone: long ? "buy" : "sell",
        entry: true,
        readouts: [],
      };
    } else if (p && r.exiting) {
      signal = {
        headline: `EXIT — momentum broke, close ${p.side.toUpperCase()}`,
        detail: "Two of three horizons flipped — exit at the open of the current bar. New trade when all three agree again.",
        tone: "neutral",
        readouts: [],
      };
    } else {
      const longNeed = r.refs.filter((ref, i): ref is number => ref != null && !(r.votes[i] != null && r.votes[i]! > 0));
      signal = {
        headline: `Flat — ${ups}/3 up, ${downs}/3 down`,
        detail:
          ups === 3
            ? "All up, but not a fresh signal (prior trade stopped out) — wait for momentum to reset."
            : `LONG needs a 4h close above ${price(longNeed.length ? Math.max(...longNeed) : last.close)}. ` +
              (downs === 3
                ? "All down, but not a fresh SHORT — signal fires on the first bar all three turn down in bear regime."
                : params.allowShorts && r.regime === "bear"
                  ? "Bear regime — SHORT when all three turn down."
                  : "Shorts only in bear regime (EMA 50 < EMA 200)."),
        tone: "neutral",
        readouts: [],
      };
    }

    const stopDist = params.stopAtr * (r.atr ?? 0);
    const holding = p && !r.exiting ? p : null;
    const refPrice = holding?.entryPrice ?? last.close;
    const refStop = holding?.stop ?? r.pending?.stop ?? refPrice - stopDist;
    const sizeQty = trendRiderQuantity(capital, riskPct, refPrice, refStop);
    signal.readouts = [
      { label: "Votes", value: labels.map((lb, i) => `${lb} ${voteMark(r.votes[i])}`).join(" · "), color: ups === 3 ? "var(--green)" : downs === 3 ? "var(--red)" : undefined },
      ...horizons.map((_, i) => ({ label: `${labels[i]} reference`, value: price(r.refs[i]), color: TD_REF_COLORS[i] })),
      { label: "Regime", value: r.regime === "bear" ? (params.allowShorts ? "Bear · shorts on" : "Bear · shorts off") : "Longs only", color: r.regime === "bear" ? "var(--red)" : undefined },
      {
        label: holding ? "Stop (fixed)" : "Stop distance",
        value: holding ? price(holding.stop) : `${price(stopDist)} (${((stopDist / last.close) * 100).toFixed(2)}%)`,
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
      strategy: "trident-momentum",
      timeframe: str(values, "timeframe", "4h"),
      days: num(values, "days", 365),
      capital: num(values, "capital", 1000),
      risk_pct: num(values, "risk_pct", 1),
      h1: num(values, "h1", 30),
      h2: num(values, "h2", 90),
      h3: num(values, "h3", 180),
      stop_atr: num(values, "stop_atr", 2.5),
      allow_shorts: bool(values, "allow_shorts"),
      symbols: str(values, "backtest_scope", "portfolio") === "portfolio" ? TREND_RIDER_PORTFOLIO.join(",") : undefined,
    };
  },
};

/**
 * Anchored VWAP Pullback & Target Zones — PhenLabs Pine port (`avpt.py` / `avpt.ts`).
 * BOS swing → AVWAP ±σ pullback reclaim → ENTRY/SL/TP1–3 with BE after TP1.
 */
const avptPullback: StrategyDef = {
  id: "avpt-pullback",
  name: "AVPT · Anchored VWAP Pullback",
  category: "AVWAP reclaim · PhenLabs",
  blurb: "Auto-anchored VWAP pullback reclaim with TP1–TP3 ladder and chop filter.",
  logic:
    "Confirmed swing low/high anchors a volume-weighted AVWAP. After the impulse expands ≥ min ATR, price must pull into the ±σ value band, then reclaim AVWAP with candle conviction. Kaufman efficiency + quality score block chop (SKIP). Entry at reclaim close; stop beyond pullback / band (ATR buffer); TP1/2/3 at 1R/2R/3R with optional impulse magnet; stop ratchets to breakeven after TP1. Auto-Optimize runs 6 profiles and binds alerts to the best TP1+ win rate.",
  accent: "#00E6A8",
  icon: Crosshair,
  featured: true,
  autoTrade: true,
  minHistoryBars: 400,
  backtestable: true,
  engineNote:
    "Native `avpt-pullback` engine · reclaim signal on closed bar, fill next open · server bot · fees + slippage + funding · 4h recommended.",
  botParams: (values): Record<string, number | boolean | string> => ({
    swing_len: num(values, "swing_len", 10),
    filter_mode: str(values, "filter_mode", "vol_climax"),
    min_impulse_atr: num(values, "min_impulse_atr", 1.4),
    sl_buffer_atr: num(values, "sl_buffer_atr", 0.2),
    target_mode: str(values, "target_mode", "hybrid"),
    use_be_ratchet: bool(values, "use_be_ratchet"),
    allow_shorts: bool(values, "allow_shorts"),
    custom_min_er: num(values, "custom_min_er", 26),
    custom_band_sig: num(values, "custom_band_sig", 1),
  }),
  portfolio: TREND_RIDER_PORTFOLIO,
  fixedTimeframe: "4h",
  fields: [
    {
      key: "swing_len",
      label: "Swing lookback",
      kind: "number",
      group: "signal",
      min: 3,
      max: 40,
      onCard: true,
      hint: "Confirmed left/right bars for structural pivot anchors (default 10).",
    },
    {
      key: "filter_mode",
      label: "Pullback filter",
      kind: "select",
      group: "signal",
      onCard: true,
      options: [
        { value: "auto", label: "Auto-Optimize (best win rate)" },
        { value: "balanced", label: "Balanced · 1.0σ · 26% Eff" },
        { value: "conservative", label: "Conservative · 0.8σ · 35% Eff" },
        { value: "aggressive", label: "Aggressive · 1.25σ · 18% Eff" },
        { value: "shallow", label: "Shallow · 0.65σ · 30% Eff" },
        { value: "deep", label: "Deep Value · 1.45σ · 22% Eff" },
        { value: "vol_climax", label: "Volume Climax · 1.0σ + 1.25× vol" },
        { value: "custom", label: "Custom thresholds" },
      ],
    },
    {
      key: "min_impulse_atr",
      label: "Min impulse (ATR)",
      kind: "number",
      group: "signal",
      min: 0.6,
      max: 3.5,
      step: 0.1,
      hint: "Impulse must expand this many ATR from the anchor before pullbacks arm.",
    },
    {
      key: "sl_buffer_atr",
      label: "SL buffer (ATR)",
      kind: "number",
      group: "signal",
      min: 0.05,
      max: 1,
      step: 0.05,
    },
    {
      key: "target_mode",
      label: "Targets",
      kind: "select",
      group: "signal",
      options: [
        { value: "hybrid", label: "R ladder + impulse magnet" },
        { value: "r_multiples", label: "Fixed 1R / 2R / 3R" },
      ],
    },
    { key: "use_be_ratchet", label: "BE stop after TP1", kind: "toggle", group: "signal" },
    { key: "allow_shorts", label: "Allow shorts", kind: "toggle", group: "signal" },
    {
      key: "custom_min_er",
      label: "Custom min ER %",
      kind: "number",
      group: "signal",
      min: 10,
      max: 70,
      step: 2,
      showIf: (v) => str(v, "filter_mode", "auto") === "custom",
    },
    {
      key: "custom_band_sig",
      label: "Custom band σ",
      kind: "number",
      group: "signal",
      min: 0.4,
      max: 2.2,
      step: 0.05,
      showIf: (v) => str(v, "filter_mode", "auto") === "custom",
    },
    ...marketFields,
    {
      key: "capital",
      label: "Capital ($)",
      kind: "number",
      group: "risk",
      min: 10,
      step: 10,
      onCard: true,
    },
    {
      key: "risk_pct",
      label: "Risk %",
      kind: "number",
      group: "risk",
      min: 0.1,
      max: 5,
      step: 0.1,
      onCard: true,
    },
    {
      key: "backtest_scope",
      label: "Backtest on",
      kind: "select",
      group: "backtest",
      options: [
        { value: "portfolio", label: "Portfolio · BTC + ETH + SOL" },
        { value: "single", label: "Selected coin only" },
      ],
    },
    { key: "days", label: "History (days)", kind: "number", group: "backtest", min: 30, max: 700 },
  ],
  defaults: {
    symbol: "ETHUSDT",
    timeframe: "4h",
    swing_len: 10,
    // Research (Binance 4h 365d): Vol Climax beat Auto on alts; BTC still weak — start on ETH.
    filter_mode: "vol_climax",
    min_impulse_atr: 1.4,
    sl_buffer_atr: 0.2,
    target_mode: "hybrid",
    use_be_ratchet: true,
    allow_shorts: true,
    custom_min_er: 26,
    custom_band_sig: 1,
    capital: 1000,
    risk_pct: 1,
    backtest_scope: "portfolio",
    days: 365,
  },
  analyze(candles, values) {
    const symbol = str(values, "symbol", "BTCUSDT");
    const timeframe = str(values, "timeframe", "4h");
    const intervalMs = intervalMinutes(timeframe) * 60_000;
    const params: AvptParams = {
      ...AVPT_DEFAULTS,
      swingLen: Math.round(num(values, "swing_len", 10)),
      filterMode: str(values, "filter_mode", "vol_climax") as AvptFilterMode,
      minImpulseAtr: num(values, "min_impulse_atr", 1.4),
      slBufferAtr: num(values, "sl_buffer_atr", 0.2),
      targetMode: str(values, "target_mode", "hybrid") === "r_multiples" ? "r_multiples" : "hybrid",
      useBeRatchet: bool(values, "use_be_ratchet"),
      allowShorts: bool(values, "allow_shorts"),
      customMinEr: num(values, "custom_min_er", 26),
      customBandSig: num(values, "custom_band_sig", 1),
    };
    const capital = num(values, "capital", 1000);
    const riskPct = num(values, "risk_pct", 1);
    const overlays: ChartOverlay[] = [
      { key: AVPT_KEYS.avwap, label: "Anchored VWAP", color: "#00E6A8" },
      { key: AVPT_KEYS.bandTop, label: "Value band +σ", color: "rgba(0,230,168,0.45)" },
      { key: AVPT_KEYS.bandBot, label: "Value band −σ", color: "rgba(0,230,168,0.45)" },
      { key: AVPT_KEYS.entry, label: "Entry", color: "#e2e8f0" },
      { key: AVPT_KEYS.stop, label: "Stop", color: "#FF3B69" },
      { key: AVPT_KEYS.tp1, label: "TP1", color: "#34d399" },
    ];
    const need = Math.max(80, params.swingLen * 4 + 30);
    if (candles.length < need) {
      return {
        ...emptyAnalysis(candles, overlays),
        signal: {
          headline: "Need more history",
          detail: `Need at least ${need} candles for swing anchors and AVWAP.`,
          tone: "neutral",
          readouts: [],
        },
      };
    }

    const r = replayAvpt(candles, params, intervalMs);
    const coin = coinOf(symbol);
    let signal: LiveSignal;
    let desired: AutoTradeState["desired"] = null;
    const holding = r.selected.active && r.selected.active.status === 0 ? r.selected.active : null;
    const barTime = (bar: number) =>
      bar >= 0 && bar < candles.length ? candles[bar].time : (candles[r.lastClosed]?.time ?? candles[candles.length - 1]?.time ?? 0);

    const chartDays = candles.length
      ? Math.max(1, (candles[candles.length - 1].time - candles[0].time) / 86_400_000)
      : 365;
    const closedPlans = r.selected.total;
    const tradesPerMonth = closedPlans / (chartDays / 30.4375);

    let sizeQty: number | null = null;
    let plannedLossUsd: number | null = null;
    let stopDistPct: number | null = null;

    const lastBar = candles[candles.length - 1];
    const lastClose = lastBar?.close ?? 0;
    const lastHigh = lastBar?.high ?? lastClose;
    const lastLow = lastBar?.low ?? lastClose;

    // Placeholder detail — replaced with structured Why after status/levels known.
    if (holding) {
      const long = holding.dir === 1;
      const stop = holding.activeSl;
      // Same candle series as chart — if mark already through SL, do not show as active.
      const stoppedOut = long
        ? lastLow <= stop || lastClose <= stop
        : lastHigh >= stop || lastClose >= stop;
      sizeQty = trendRiderQuantity(capital, riskPct, holding.entry, holding.activeSl);
      stopDistPct = holding.entry > 0 ? (Math.abs(holding.entry - holding.activeSl) / holding.entry) * 100 : 0;
      plannedLossUsd = (capital * riskPct) / 100;
      if (stoppedOut) {
        desired = null;
        signal = {
          headline: `${long ? "LONG" : "SHORT"} plan INVALIDATED — stop reached`,
          detail: "",
          tone: "neutral",
          readouts: [],
        };
      } else {
        // Fill next open after reclaim — bot entry_time = signal bar + 1 interval.
        desired = { side: long ? "long" : "short", entryTime: barTime(holding.entryBar) + intervalMs, stop: holding.activeSl };
        signal = {
          // Chart plan ≠ exchange position (bot OFF pe bhi "open" dikhna misleading tha).
          headline: `${long ? "LONG" : "SHORT"} plan on chart — ${r.selected.name}`,
          detail: "",
          tone: long ? "buy" : "sell",
          readouts: [],
        };
      }
    } else if (r.pending) {
      const pd = r.pending;
      const long = pd.side === "long";
      sizeQty = trendRiderQuantity(capital, riskPct, pd.entry, pd.stop);
      stopDistPct = pd.entry > 0 ? (Math.abs(pd.entry - pd.stop) / pd.entry) * 100 : 0;
      plannedLossUsd = (capital * riskPct) / 100;
      desired = {
        side: pd.side,
        entryTime: (candles[r.lastClosed]?.time ?? Date.now()) + intervalMs,
        stop: pd.stop,
      };
      signal = {
        headline: long ? `Signal armed — BUY reclaim (${pd.qual.toFixed(0)}%)` : `Signal armed — SELL reclaim (${pd.qual.toFixed(0)}%)`,
        detail: "",
        tone: long ? "buy" : "sell",
        entry: true,
        readouts: [],
      };
    } else {
      const side = r.bias === 1 ? "Bull AVWAP armed" : r.bias === -1 ? "Bear AVWAP armed" : "No active impulse";
      signal = {
        headline: `Flat — ${side}`,
        detail: "",
        tone: "neutral",
        readouts: [],
      };
    }

    const sizeReadouts =
      sizeQty != null && plannedLossUsd != null && stopDistPct != null
        ? [
            { label: "Pos size (sim)", value: `${sizeQty.toFixed(4)} ${coin}` },
            { label: "Loss at SL", value: `~$${plannedLossUsd.toFixed(0)} (${stopDistPct.toFixed(2)}% stop)` },
          ]
        : [];

    const holdingLive =
      holding != null &&
      !(holding.dir === 1
        ? lastLow <= holding.activeSl || lastClose <= holding.activeSl
        : lastHigh >= holding.activeSl || lastClose >= holding.activeSl);
    const beStop =
      holding != null && holding.entry > 0 && Math.abs(holding.activeSl - holding.entry) / holding.entry < 0.0005;

    const level =
      holding != null
        ? [
            { label: "Entry", value: price(holding.entry) },
            {
              label: beStop ? "Stop (Breakeven)" : "Stop",
              value: price(holding.activeSl),
              color: "#FF3B69",
            },
            { label: "TP1", value: price(holding.tp1), color: "#34d399" },
            { label: "TP2 / TP3", value: `${price(holding.tp2)} · ${price(holding.tp3)}` },
            ...(holdingLive ? sizeReadouts : []),
          ]
        : r.pending
          ? [
              { label: "Entry", value: `~${price(r.pending.entry)} next open` },
              { label: "Stop", value: price(r.pending.stop), color: "#FF3B69" },
              { label: "TP1", value: price(r.pending.tp1), color: "#34d399" },
              { label: "TP2 / TP3", value: `${price(r.pending.tp2)} · ${price(r.pending.tp3)}` },
              ...sizeReadouts,
            ]
          : [];

    const signalBarMs = holding != null ? barTime(holding.entryBar) : candles[r.lastClosed]?.time;
    const candleCloseMs =
      signalBarMs != null ? signalBarMs + intervalMs : lastBar?.time != null ? lastBar.time + intervalMs : null;
    const ageBars =
      holding != null && candles.length
        ? Math.max(0, candles.length - 1 - holding.entryBar)
        : r.pending
          ? 0
          : null;
    const lastBarMs = lastBar?.time ?? 0;

    // Chart plan statuses — never imply exchange fill (bot panel = execution).
    let entryStatus: string;
    let entryStatusColor = "var(--text-muted)";
    if (holding != null && !holdingLive) {
      entryStatus = "Invalidated";
      entryStatusColor = "var(--amber)";
    } else if (holdingLive) {
      entryStatus = "Triggered";
      entryStatusColor = "var(--green)";
    } else if (r.pending) {
      entryStatus = "Awaiting Trigger";
      entryStatusColor = "#38bdf8";
    } else if (r.bias !== 0) {
      entryStatus = "Expired";
      entryStatusColor = "var(--text-muted)";
    } else {
      entryStatus = "Flat";
    }

    const planEntry = holdingLive ? holding!.entry : r.pending?.entry ?? null;
    const planStop = holdingLive ? holding!.activeSl : r.pending?.stop ?? null;
    const planInitStop = holding != null ? holding.activeSl : r.pending?.stop ?? null;
    const planTp1 = holdingLive ? holding!.tp1 : r.pending?.tp1 ?? null;
    const planTp2 = holdingLive ? holding!.tp2 : r.pending?.tp2 ?? null;
    const planTp3 = holdingLive ? holding!.tp3 : r.pending?.tp3 ?? null;
    const planSide: "L" | "S" | "F" =
      holding != null ? (holding.dir === 1 ? "L" : "S") : r.pending ? (r.pending.side === "long" ? "L" : "S") : "F";
    const signalId = `AVPT-${symbolLabel(symbol)}-${timeframe}-${planSide}-${signalBarMs ?? lastBarMs}`;
    const riskDist =
      planEntry != null && planStop != null ? Math.abs(planEntry - planStop) : null;
    const reward1 =
      planEntry != null && planTp1 != null ? Math.abs(planTp1 - planEntry) : null;
    const rr =
      riskDist != null && riskDist > 0 && reward1 != null ? reward1 / riskDist : null;
    const maxLev = 3;
    const notional = sizeQty != null && planEntry != null ? sizeQty * planEntry : null;
    const marginReq = notional != null ? notional / maxLev : null;
    const simLev =
      notional != null && capital > 0 ? Math.min(maxLev, notional / capital) : null;
    const signalExpiry =
      holdingLive
        ? "While stop holds · max ~60 bars / TP ladder"
        : r.pending
          ? "Next open fill window · invalidated if reclaim fails"
          : "—";

    const longSide = planSide === "L";
    const stopWhy =
      holding != null && beStop
        ? "Ratcheted to breakeven after TP1"
        : "Beyond pullback / value-band extreme + ATR buffer";
    const invalidate =
      holding != null && !holdingLive
        ? `Price already through SL ${price(holding.activeSl)} on chart series`
        : holdingLive
          ? `Stop ${price(holding!.activeSl)} hit, signal reverse, or max hold`
          : r.pending
            ? "Reclaim fails next open or filter skips"
            : "No active plan";
    const entryCondition =
      holdingLive || r.pending
        ? `${longSide ? "Long" : "Short"} AVWAP reclaim after value-band pullback · ${r.selected.name}`
        : r.selected.lastText !== "NONE"
          ? r.selected.lastText
          : "Wait for value-band pullback + reclaim with efficiency filter";
    const volumeNote =
      params.filterMode === "vol_climax"
        ? "Volume climax filter (≈1.25× avg vol on reclaim)"
        : `Pullback filter mode: ${params.filterMode}`;

    signal.detail = [
      `Signal ID ${signalId}`,
      `Generated ${signalBarMs != null ? fmtWhen(signalBarMs) : "—"} · candle close ${candleCloseMs != null ? fmtWhen(candleCloseMs) : "—"}`,
      `Status: ${entryStatus} (chart plan — not an exchange fill)`,
      `Trend: ${r.bias === 1 ? "Bullish (long bias from AVWAP impulse)" : r.bias === -1 ? "Bearish (short bias from AVWAP impulse)" : "No active impulse / neutral"}`,
      `AVWAP: ${
        r.avwap != null && r.avwap > 0
          ? lastClose >= r.avwap
            ? `Price ${price(lastClose)} at/above AVWAP ${price(r.avwap)}`
            : `Price ${price(lastClose)} below AVWAP ${price(r.avwap)}`
          : "AVWAP not formed yet"
      }`,
      `Volume / filter: ${volumeNote} · profile ${r.selected.name}`,
      `Efficiency / quality: ${r.er != null ? `${r.er.toFixed(0)}% ER` : "ER n/a"} · quality ${
        holding?.qual != null ? `${holding.qual.toFixed(0)}%` : r.pending ? `${r.pending.qual.toFixed(0)}%` : r.quality != null ? `${r.quality.toFixed(0)}%` : "—"
      }`,
      `Entry condition: ${entryCondition}`,
      planEntry != null
        ? `Levels: Entry ${price(planEntry)} · SL ${price(planStop)} · TP1 ${price(planTp1)} / TP2 ${price(planTp2)} / TP3 ${price(planTp3)}`
        : "No armed levels",
      `Stop reason: ${stopWhy}`,
      `Invalidates when: ${invalidate}`,
      `Sim sizing: ${riskPct}% of $${capital.toLocaleString("en-US")} · chart ≠ exchange position`,
    ].join("\n");

    signal.readouts = [
      { label: "Signal ID", value: signalId, color: "#00E6A8" },
      { label: "Profile", value: r.selected.name, color: "#00E6A8" },
      { label: "Scope", value: `${symbolLabel(symbol)} · ${timeframe.toUpperCase()} · chart window only` },
      {
        label: "Entry status",
        value: `${entryStatus}${entryStatus === "Triggered" || entryStatus === "Awaiting Trigger" ? " · chart plan ≠ exchange fill" : ""}`,
        color: entryStatusColor,
      },
      {
        label: "Signal generated",
        value: signalBarMs != null ? fmtWhen(signalBarMs) : "—",
      },
      {
        label: "Candle close",
        value: candleCloseMs != null ? fmtWhen(candleCloseMs) : "—",
      },
      {
        label: "Exchange / source",
        value: `${symbolLabel(symbol)} ${timeframe} closed candle · chart feed`,
      },
      { label: "Signal expiry", value: signalExpiry },
      {
        label: "Last close (chart)",
        value: `${price(lastClose)} · ${fmtWhen(lastBarMs)}`,
        color: holdingLive ? "var(--text-primary)" : "var(--amber)",
      },
      ...level,
      ...(holdingLive && holding
        ? [{ label: "Initial stop", value: price(planInitStop ?? holding.activeSl), color: "#FF3B69" }]
        : []),
      ...(rr != null
        ? [{ label: "R:R to TP1", value: `${rr.toFixed(2)} : 1`, color: rr >= 1 ? "var(--green)" : "var(--amber)" }]
        : []),
      ...(plannedLossUsd != null
        ? [{ label: "Planned risk $", value: `~$${plannedLossUsd.toFixed(2)} (${riskPct}%)` }]
        : []),
      ...(simLev != null && marginReq != null
        ? [
            {
              label: "Sim leverage / margin",
              value: `${simLev.toFixed(2)}× / ~$${marginReq.toFixed(0)} (cap ${maxLev}× · deploy settings, not exchange)`,
            },
          ]
        : []),
      { label: "AVWAP", value: price(r.avwap), color: "#00E6A8" },
      { label: "Trend Eff", value: r.er != null ? `${r.er.toFixed(0)}%` : "—" },
      {
        label: "Chart TP1+ hit rate",
        value: closedPlans
          ? `${r.winRate.toFixed(1)}% (${r.selected.wins}W/${r.selected.losses}L) · not portfolio WR`
          : "0 closed",
      },
      {
        label: "Net R (R-ledger)",
        value: `${r.cumNetR >= 0 ? "+" : ""}${r.cumNetR.toFixed(1)}R · chart plans, not $ equity`,
      },
      {
        label: "Chart closed plans",
        value: closedPlans ? `${closedPlans} · ~${tradesPerMonth.toFixed(1)}/mo on this chart` : "0",
      },
      {
        label: "Signal age",
        value:
          signalBarMs != null
            ? `${fmtWhen(signalBarMs)}${ageBars != null ? ` · ${ageBars} bars` : ""}`
            : "—",
      },
      { label: "Risk basis", value: `${riskPct}% of starting $${capital.toLocaleString("en-US")}` },
    ];

    return { candles: r.candles, overlays, signal, autoTrade: { desired, intervalMs } };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      strategy: "avpt-pullback",
      timeframe: str(values, "timeframe", "4h"),
      days: num(values, "days", 365),
      capital: num(values, "capital", 1000),
      risk_pct: num(values, "risk_pct", 1),
      swing_len: num(values, "swing_len", 10),
      filter_mode: str(values, "filter_mode", "vol_climax"),
      min_impulse_atr: num(values, "min_impulse_atr", 1.4),
      sl_buffer_atr: num(values, "sl_buffer_atr", 0.2),
      target_mode: str(values, "target_mode", "hybrid"),
      use_be_ratchet: bool(values, "use_be_ratchet"),
      allow_shorts: bool(values, "allow_shorts"),
      custom_min_er: num(values, "custom_min_er", 26),
      custom_band_sig: num(values, "custom_band_sig", 1),
      symbols: str(values, "backtest_scope", "portfolio") === "portfolio" ? TREND_RIDER_PORTFOLIO.join(",") : undefined,
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
  return `Backtest does not run this strategy’s live logic — it uses the EMA crossover engine: ${rule}. Long + short, fixed SL/target only, 11:00–14:00 IST entries blocked (default ON), no fees/slippage. P&L = points × lots × 0.001 coin. ${missing} So backtest is not proof of the live rules above.`;
}

/** Paanchon ka live signal isi tarah chalta hai — Logic text ke aakhir mein yahi sach. */
const CAPITAL_LIVE_CAVEAT =
  " Signal is evaluated on the forming candle and can change before it closes. BUY only (no shorts). No live exit rules — SL/target readouts are reference levels recomputed each refresh.";

const donchianBreakout20k: StrategyDef = {
  id: "donchian-breakout-20k",
  name: "Donchian Breakout (₹20,000)",
  category: "Capital · ₹20k · 4h Breakout",
  blurb: "4h 20-bar breakout + volume above EMA 200.",
  logic:
    "Live signal (default 4H): close above the highest high of the prior 20 candles (channel lookback), volume > 1.5× the 20-bar average, green candle with body > half its range, and price above EMA 200 — then BUY. 'SL ref' = close − 3× ATR (trail ATR multiple)." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#10b981",
  icon: TrendingUp,
  featured: true,
  engineNote: emaEngineNote(
    "BUY when EMA 20 crosses above both EMA 50 and EMA 200; SELL when below both",
    "Donchian channel, volume filter, 3× ATR trail, 1% risk sizing, and 3% daily loss limit are not in backtest.",
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
        detail: `Price ${price(last.close)} broke ${lookback}-bar high (${price(prevHigh20)}), volume ${(currentVol / avgVol).toFixed(1)}× average.`,
        tone: "buy",
        readouts: [],
      };
    } else if (last.close > ema200Val) {
      signal = {
        headline: "Uptrend — waiting for breakout",
        detail: `Price above EMA 200; waiting for Donchian High ${price(prevHigh20)} to break.`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Bearish/Neutral — Below EMA 200",
        detail: "Price below macro EMA 200; Donchian entries paused.",
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
  blurb: "EMA 20/50 cross + ADX > 25 above EMA 200.",
  logic:
    "Live signal (default 1H): BUY when fast EMA (default 20) crosses above slow EMA (default 50), ADX(14) above threshold (default 25), and price above EMA 200. After the cross, while fast > slow and price above EMA 200, shows 'Bullish Trend Active'. 'SL ref' = close − 2× ATR." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#3b82f6",
  icon: Zap,
  engineNote: emaEngineNote(
    "BUY when fast EMA crosses above slow EMA and EMA 200; SELL when below both",
    "ADX filter, 2× ATR trail, 1% risk sizing, and 72-bar max hold are not in backtest.",
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
        detail: `Fresh crossover confirmed. ADX ${lastAdx.toFixed(1)} (> ${adxThresh}) shows strong momentum.`,
        tone: "buy",
        readouts: [],
      };
    } else if (fNow > sNow && isAboveEma200) {
      signal = {
        headline: "Bullish Trend Active",
        detail: `${adxStrong ? `Trend strong (ADX ${lastAdx?.toFixed(1)}).` : `Trend on but ADX weak (${lastAdx?.toFixed(1) ?? "—"}).`} This signal does not exit — manage your stop.`,
        tone: "buy",
        readouts: [],
      };
    } else {
      signal = {
        headline: "No Momentum Signal",
        detail: "EMA crossover or ADX criteria not met yet.",
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
  blurb: "Uptrend RSI < 25 dip + volume spike.",
  logic:
    "Live signal (default 15m): BUY when RSI(14) below oversold (default 25), price above EMA 200, and volume above Volume Multiplier (default 1.5×) of the 20-bar average. 'Target ref' = 20-SMA, 'SL ref' = close − 1.5× ATR." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#f59e0b",
  icon: Gauge,
  engineNote: emaEngineNote(
    "BUY when EMA 9 crosses EMA 21 and EMA 50, and enter only when RSI(14) is below 25 or above 60",
    "Dip-buy logic, volume spike, 20-SMA take-profit, 1.5× ATR stop, and 1% risk sizing are not in backtest.",
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
        detail: "Price above 20-MA. Wait for a new dip.",
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Neutral / In Range",
        detail: `RSI ${lastRsi.toFixed(1)}. Waiting for oversold trigger < ${rsiThresh}.`,
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
  blurb: "Lower Bollinger + RSI < 30 above EMA 200.",
  logic:
    "Live signal (default 15m): BUY when close below lower Bollinger (SMA − 2σ, default period 20), RSI(14) below oversold (default 30), and price above EMA 200. 'Target ref' = middle band (SMA). No crash/volatility filter yet." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#8b5cf6",
  icon: Target,
  engineNote: emaEngineNote(
    "BUY when EMA 9 crosses EMA 21 and EMA 50, and enter only when RSI(14) is below 30 or above 60",
    "Bollinger band, middle-band target, and crash-candle filter are not in backtest (crash filter not in live signal either yet).",
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
        detail: `Price ${price(last.close)} slipped below lower band (${price(lowerVal)}). RSI: ${lastRsi.toFixed(1)}. Target mid: ${price(midVal)}.`,
        tone: "buy",
        readouts: [],
      };
    } else if (last.close < lowerVal) {
      signal = {
        headline: "Band Penetration — Checking RSI",
        detail: `Price below lower band; buy triggers when RSI ${lastRsi.toFixed(1)} confirms (< ${rsiThresh}).`,
        tone: "neutral",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Inside Normal Volatility Bands",
        detail: "Price trading inside normal range.",
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
  blurb: "EMA 20/50 cross above EMA 200 on one symbol.",
  logic:
    "Live signal runs on one selected symbol only (default BTC/USD, 1H): BUY when EMA 20 crosses above EMA 50 and price is above EMA 200; while EMA 20 > EMA 50 and price above EMA 200, shows 'Uptrend active'. BTC/ETH/SOL basket, BTC trend filter, and mean-reversion blend are not implemented yet. Capital and Risk % only build a 'Risk budget' readout (capital × risk%) — this strategy does not set size or stop." +
    CAPITAL_LIVE_CAVEAT,
  accent: "#06b6d4",
  icon: Boxes,
  featured: true,
  engineNote: emaEngineNote(
    "BUY when EMA 20 crosses above both EMA 50 and EMA 200; SELL when below both — sirf chune hue ek symbol par",
    "BTC/ETH/SOL basket, BTC trend filter, and Capital / Risk % fields are not used in backtest.",
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
        headline: "BUY — EMA 20/50 golden cross (above EMA 200)",
        detail: `Risk budget ${riskBudget} (${riskPct}% of ₹${capital.toLocaleString("en-IN")}). Set size and stop yourself — this signal does not.`,
        tone: "buy",
        readouts: [],
      };
    } else if (isTrendBullish) {
      signal = {
        headline: "Uptrend active",
        detail: "EMA 20 above EMA 50 and price above EMA 200. This signal does not exit — manage your stop.",
        tone: "buy",
        readouts: [],
      };
    } else {
      signal = {
        headline: "Waiting for golden cross",
        detail: "EMA 20 has not crossed above EMA 50 (while price stays above EMA 200).",
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

/**
 * Buy Grid Recovery + Fixed Sell Hedge — MT5 XAUUSD EA catalogue entry.
 * Live trading = `mt5/BuyGridRecoveryHedge.mq5`. Desk chart = closed-bar preview only.
 */
const buyGridRecoveryHedge: StrategyDef = {
  id: "buy-grid-recovery-hedge",
  name: "Buy Grid Recovery · Hedge",
  category: "XAUUSD · MT5 grid recovery",
  blurb: "Initial Buy 0.01 scalp → downside grid unlocks both sides + fixed 0.01 Sell hedge → basket TP.",
  logic:
    "NEW CYCLE opens BUY 0.01 with upside grid OFF. If price rises without a downside fill, no extra Buys — close on Mini Profit (default $0.20) and restart. First downside −GridStep (default $5) opens the next predefined Buy lot + SELL 0.01 and turns UpsideGrid ON for the rest of the basket. From then on both directions continue with the fixed Buy lot array (0.01…7.10); Sell stays 0.01 with independent sell-level spacing. One basket until Basket Profit Target (default $96), then close all and BUY 0.01 again. Daily DD limit (default 30%) closes and pauses until the next broker day. Designed for XAUUSD on MT5 — desk candle backtest uses the same rules on O→L→H→C path (not tick-accurate).",
  accent: "#ffa825",
  icon: Layers,
  featured: true,
  autoTrade: false,
  backtestable: true,
  minHistoryBars: 120,
  engineNote:
    "Candle-path backtest on the desk (O→L→H→C) · XAU-style $100/pt/lot P&L · Daily DD enforced · not MT5 tick-accurate. Live EA: `mt5/BuyGridRecoveryHedge.mq5`. Buy lots are a fixed array — not martingale math.",
  fields: [
    { key: "symbol", label: "Symbol", kind: "symbol", group: "signal", onCard: true, hint: "Live EA is for XAUUSD on MT5 — desk runs the same rules on crypto candles." },
    { key: "timeframe", label: "Timeframe", kind: "interval", group: "signal", onCard: true },
    {
      key: "grid_step",
      label: "Grid step ($)",
      kind: "number",
      group: "signal",
      min: 0.5,
      max: 500,
      step: 0.5,
      onCard: true,
      hint: "XAUUSD default 5. On crypto raise this — $5 is tiny vs BTC.",
    },
    {
      key: "mini_profit",
      label: "Mini profit ($)",
      kind: "number",
      group: "signal",
      min: 0.05,
      max: 50,
      step: 0.05,
      onCard: true,
      hint: "Only while waiting for downside trigger.",
    },
    {
      key: "basket_target",
      label: "Basket profit target ($)",
      kind: "number",
      group: "risk",
      min: 1,
      max: 5000,
      step: 1,
      onCard: true,
    },
    {
      key: "initial_lot",
      label: "Initial buy lot",
      kind: "number",
      group: "risk",
      min: 0.01,
      max: 1,
      step: 0.01,
    },
    {
      key: "sell_lot",
      label: "Sell hedge lot",
      kind: "number",
      group: "risk",
      min: 0.01,
      max: 1,
      step: 0.01,
      hint: "Always fixed — never increases with Buy size.",
    },
    {
      key: "daily_dd",
      label: "Daily DD limit %",
      kind: "number",
      group: "risk",
      min: 0,
      max: 90,
      step: 1,
      hint: "Closes basket and pauses until next UTC day. 0 = off.",
    },
    {
      key: "capital",
      label: "Capital ($)",
      kind: "number",
      group: "backtest",
      min: 100,
      max: 1_000_000,
      step: 100,
      hint: "Starting equity for candle-path backtest.",
    },
    {
      key: "days",
      label: "History · days",
      kind: "number",
      group: "backtest",
      min: 7,
      max: 700,
      hint: "Candle path ≠ MT5 ticks — use longer windows to see grid stress.",
    },
  ],
  defaults: {
    symbol: "BTCUSDT",
    timeframe: "1h",
    grid_step: 50,
    mini_profit: 0.2,
    basket_target: 96,
    initial_lot: 0.01,
    sell_lot: 0.01,
    daily_dd: 30,
    capital: 1000,
    days: 90,
  },
  analyze(candles, values) {
    const overlays = [
      { key: BGRH_KEYS.lastBuy, label: "Last Buy", color: "#E0AD3A" },
      { key: BGRH_KEYS.nextDown, label: "Next Buy ↓", color: "#38bdf8" },
      { key: BGRH_KEYS.nextUp, label: "Next Buy ↑", color: "#34d399" },
    ];
    const params = bgrhParamsFromValues(values);
    if (candles.length < 20) {
      return {
        ...emptyAnalysis(candles, overlays),
        signal: {
          headline: "Need more history",
          detail: "Load more candles to preview grid phase.",
          tone: "neutral",
          readouts: [],
        },
      };
    }
    const r = replayBuyGridRecovery(candles, params);
    const nextLot = r.seqIndex < BUY_LOT_SEQUENCE.length ? BUY_LOT_SEQUENCE[r.seqIndex] : null;
    const tone: SignalTone =
      r.phase === "grid_active" ? "buy" : r.phase === "waiting_downside" ? "sell" : "neutral";
    const signal: LiveSignal = {
      headline: r.status,
      detail: `${r.detail} Cycles ${r.cycles} · mini ${r.miniCloses} · basket ${r.basketCloses}.`,
      tone,
      readouts: [
        { label: "Phase", value: r.phase.replace(/_/g, " "), color: "#E0AD3A" },
        { label: "Upside grid", value: r.upsideActive ? "ACTIVE" : "WAITING", color: r.upsideActive ? "#34d399" : "#fbbf24" },
        { label: "Buys / Sells", value: `${r.buyCount} / ${r.sellCount}` },
        { label: "Last Buy", value: r.lastBuy != null ? r.lastBuy.toFixed(2) : "—" },
        { label: "Next Buy lot", value: nextLot != null ? String(nextLot) : "exhausted" },
        { label: "Grid step", value: `$${params.gridStep}` },
        { label: "Mini / Basket TP", value: `$${params.miniProfit} / $${params.basketTarget}` },
        { label: "Backtest", value: "Candle path · Run below", color: "#94a3b8" },
      ],
    };
    return { candles: r.candles, overlays, signal };
  },
  toBacktest(values) {
    return {
      ...baseParams(values),
      days: num(values, "days", 90),
      capital: num(values, "capital", 1000),
    };
  },
};

export const STRATEGIES: StrategyDef[] = [
  buyGridRecoveryHedge,
  avptPullback,
  tridentMomentum,
  trendRiderPro,
  trendRider,
  trendRiderSteady,
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
