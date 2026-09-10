/**
 * Custom Strategy Builder — users apni no-code strategies bana sakte hain.
 * Persistence localStorage mein; live signal client-side indicators se evaluate hota hai.
 */

import { Wand2 } from "lucide-react";
import type { Candle } from "./cryptoApi";
import { CRYPTO_SYMBOLS, symbolLabel } from "./cryptoApi";
import { atr, crossDirection, ema, macd, rsi } from "./indicators";
import {
  num,
  str,
  type ChartOverlay,
  type StrategyAnalysis,
  type StrategyDef,
  type StrategyField,
  type StrategyValues,
} from "./strategies";

export const CUSTOM_STRATEGIES_KEY = "arjunai_custom_strategies";
export const CUSTOM_STRATEGIES_CHANGED = "arjunai:custom-strategies-changed";

/* ── Types ──────────────────────────────────────────────── */

export type StrategyStatus = "draft" | "live" | "paused" | "archived";
export type InstrumentType = "perps" | "options";
export type TradeDirection = "long" | "short" | "both";
export type MarginMode = "isolated" | "cross";
export type TriggerType = "indicator" | "time";
export type BuilderView = "cockpit" | "flow" | "chart";

export type IndicatorId =
  | "rsi"
  | "ema"
  | "macd"
  | "macd_signal"
  | "macd_hist"
  | "atr"
  | "price"
  | "volume";

export type CompareOp =
  | "crosses_above"
  | "crosses_below"
  | "above"
  | "below"
  | "equals";

export type CompareTarget = "value" | "ema" | "price";

export type TpUnit = "%" | "pts" | "price" | "rr";
export type SlUnit = "atr" | "%" | "pts" | "price";

export interface Condition {
  id: string;
  indicator: IndicatorId;
  period: number;
  operator: CompareOp;
  compareTo: CompareTarget;
  comparePeriod: number;
  value: number;
}

export interface ConditionGroup {
  id: string;
  /** Group ke andar conditions AND se judti hain; groups OR se. */
  join: "and" | "or";
  conditions: Condition[];
}

export interface MarketConfig {
  instrument: InstrumentType;
  exchange: string;
  symbols: string[];
  direction: TradeDirection;
  margin: MarginMode;
  leverage: number;
  interval: string;
  run247: boolean;
}

export interface SignalConfig {
  triggerType: TriggerType;
  entryGroups: ConditionGroup[];
  exitOnSignal: boolean;
  exitOnReversal: boolean;
  /** Time trigger: HH:MM UTC */
  entryTime?: string;
}

export interface ExitLevel {
  enabled: boolean;
  value: number;
  unit: TpUnit | SlUnit;
}

export interface RiskConfig {
  takeProfit: { enabled: boolean; value: number; unit: TpUnit };
  stopLoss: { enabled: boolean; value: number; unit: SlUnit };
  trailing: boolean;
  trailingPct: number;
  timeStop: boolean;
  timeStopCandles: number;
  liveSafety: boolean;
  positionSizeUsd: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  /** Daily loss cap hit hone par strategy pause. */
  dailyCapEnabled: boolean;
  /** Lagataar losing trades ke baad kill. */
  killSwitch: boolean;
  killSwitchLosses: number;
}

export interface CustomStrategy {
  id: string;
  name: string;
  description: string;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  market: MarketConfig;
  signal: SignalConfig;
  risk: RiskConfig;
  /** Soft stats — UI ke liye; real PnL abhi demo. */
  stats?: {
    closedPnl30d: number;
    openPnl: number | null;
    closedTrades: number;
  };
}

export interface ValidationIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export interface LiveEval {
  tone: "buy" | "sell" | "neutral";
  headline: string;
  detail: string;
  readouts: { label: string; value: string; color?: string }[];
}

/* ── Catalogs ───────────────────────────────────────────── */

export const INDICATOR_OPTIONS: { value: IndicatorId; label: string; defaultPeriod: number }[] = [
  { value: "rsi", label: "RSI", defaultPeriod: 14 },
  { value: "ema", label: "EMA", defaultPeriod: 21 },
  { value: "macd", label: "MACD line", defaultPeriod: 12 },
  { value: "macd_signal", label: "MACD signal", defaultPeriod: 9 },
  { value: "macd_hist", label: "MACD hist", defaultPeriod: 9 },
  { value: "atr", label: "ATR", defaultPeriod: 14 },
  { value: "price", label: "Price", defaultPeriod: 1 },
  { value: "volume", label: "Volume", defaultPeriod: 1 },
];

export const OPERATOR_OPTIONS: { value: CompareOp; label: string }[] = [
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
  { value: "above", label: "is above" },
  { value: "below", label: "is below" },
  { value: "equals", label: "equals" },
];

export const COMPARE_OPTIONS: { value: CompareTarget; label: string }[] = [
  { value: "value", label: "Value" },
  { value: "ema", label: "EMA" },
  { value: "price", label: "Price" },
];

export const INTERVAL_CHIPS = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

export const EXCHANGES = ["Delta Exchange", "Binance", "Bybit"] as const;

/* ── Factories ──────────────────────────────────────────── */

function uid(prefix = "c"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newCondition(partial?: Partial<Condition>): Condition {
  return {
    id: uid("cond"),
    indicator: "rsi",
    period: 14,
    operator: "crosses_below",
    compareTo: "value",
    comparePeriod: 21,
    value: 32,
    ...partial,
  };
}

export function newGroup(partial?: Partial<ConditionGroup>): ConditionGroup {
  return {
    id: uid("grp"),
    join: "and",
    conditions: [newCondition()],
    ...partial,
  };
}

export function defaultMarket(): MarketConfig {
  return {
    instrument: "perps",
    exchange: "Delta Exchange",
    symbols: ["BTCUSDT"],
    direction: "long",
    margin: "isolated",
    leverage: 20,
    interval: "5m",
    run247: true,
  };
}

export function defaultSignal(): SignalConfig {
  return {
    triggerType: "indicator",
    entryGroups: [newGroup()],
    exitOnSignal: true,
    exitOnReversal: false,
    entryTime: "09:30",
  };
}

export function defaultRisk(): RiskConfig {
  return {
    takeProfit: { enabled: true, value: 2.5, unit: "%" },
    stopLoss: { enabled: true, value: 1.2, unit: "%" },
    trailing: false,
    trailingPct: 0.8,
    timeStop: false,
    timeStopCandles: 48,
    liveSafety: true,
    positionSizeUsd: 100,
    maxDailyLossPct: 5,
    maxOpenPositions: 3,
    dailyCapEnabled: true,
    killSwitch: false,
    killSwitchLosses: 3,
  };
}

export function createBlankStrategy(symbol = "BTCUSDT"): CustomStrategy {
  const now = new Date().toISOString();
  const market = defaultMarket();
  market.symbols = [symbol];
  return {
    id: uid("strat"),
    name: "",
    description: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    market,
    signal: defaultSignal(),
    risk: defaultRisk(),
    stats: { closedPnl30d: 0, openPnl: null, closedTrades: 0 },
  };
}

/* ── Ready-made templates ───────────────────────────────── */

export interface StrategyTemplate {
  id: string;
  name: string;
  blurb: string;
  tag: string;
  accent: string;
  apply: (symbol?: string) => CustomStrategy;
}

function baseFromTemplate(partial: {
  name: string;
  description: string;
  direction: TradeDirection;
  interval?: string;
  leverage?: number;
  conditions: Condition[];
  join?: "and" | "or";
  tp?: number;
  sl?: number;
  exitOnSignal?: boolean;
  exitOnReversal?: boolean;
}, symbol = "BTCUSDT"): CustomStrategy {
  const s = createBlankStrategy(symbol);
  s.name = partial.name;
  s.description = partial.description;
  s.market.direction = partial.direction;
  if (partial.interval) s.market.interval = partial.interval;
  if (partial.leverage) s.market.leverage = partial.leverage;
  s.signal.entryGroups = [
    {
      id: uid("grp"),
      join: partial.join ?? "and",
      conditions: partial.conditions.map((c) => ({ ...c, id: uid("cond") })),
    },
  ];
  if (partial.tp != null) s.risk.takeProfit = { enabled: true, value: partial.tp, unit: "%" };
  if (partial.sl != null) s.risk.stopLoss = { enabled: true, value: partial.sl, unit: "%" };
  if (partial.exitOnSignal != null) s.signal.exitOnSignal = partial.exitOnSignal;
  if (partial.exitOnReversal != null) s.signal.exitOnReversal = partial.exitOnReversal;
  return s;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "rsi-oversold-long",
    name: "RSI Oversold Long",
    blurb: "RSI 14 jab 32 ke neeche cross kare to long — classic mean-reversion.",
    tag: "Mean reversion",
    accent: "#059669",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "RSI Oversold Long",
          description: "Enter long when RSI crosses below 32; TP 2.5% / SL 1.2%.",
          direction: "long",
          interval: "5m",
          conditions: [
            {
              id: "x",
              indicator: "rsi",
              period: 14,
              operator: "crosses_below",
              compareTo: "value",
              comparePeriod: 21,
              value: 32,
            },
          ],
          tp: 2.5,
          sl: 1.2,
          exitOnReversal: true,
        },
        symbol,
      ),
  },
  {
    id: "ema-cross-long",
    name: "EMA 9/21 Crossover",
    blurb: "Fast EMA jab slow ke upar cross kare — trend ke saath long.",
    tag: "Trend",
    accent: "#2563eb",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "EMA 9/21 Crossover",
          description: "Long when EMA 9 crosses above EMA 21.",
          direction: "long",
          interval: "15m",
          leverage: 10,
          conditions: [
            {
              id: "x",
              indicator: "ema",
              period: 9,
              operator: "crosses_above",
              compareTo: "ema",
              comparePeriod: 21,
              value: 0,
            },
          ],
          tp: 3,
          sl: 1.5,
          exitOnSignal: true,
        },
        symbol,
      ),
  },
  {
    id: "macd-momentum",
    name: "MACD Momentum",
    blurb: "MACD line signal ke upar cross — momentum entry.",
    tag: "Momentum",
    accent: "#7c3aed",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "MACD Momentum Long",
          description: "Enter when MACD crosses above its signal line.",
          direction: "long",
          interval: "1h",
          leverage: 5,
          conditions: [
            {
              id: "x",
              indicator: "macd",
              period: 12,
              operator: "crosses_above",
              compareTo: "value",
              comparePeriod: 9,
              value: 0,
            },
          ],
          tp: 4,
          sl: 2,
          exitOnReversal: true,
        },
        symbol,
      ),
  },
  {
    id: "rsi-overbought-short",
    name: "RSI Overbought Short",
    blurb: "RSI 70 ke upar cross par short — fade the spike.",
    tag: "Mean reversion",
    accent: "#dc2626",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "RSI Overbought Short",
          description: "Short when RSI crosses above 70.",
          direction: "short",
          interval: "5m",
          conditions: [
            {
              id: "x",
              indicator: "rsi",
              period: 14,
              operator: "crosses_above",
              compareTo: "value",
              comparePeriod: 21,
              value: 70,
            },
          ],
          tp: 2.5,
          sl: 1.2,
          exitOnReversal: true,
        },
        symbol,
      ),
  },
  {
    id: "ema-rsi-combo",
    name: "EMA + RSI Combo",
    blurb: "Trend filter (EMA) + RSI pullback — do conditions AND.",
    tag: "Combo",
    accent: "#d97706",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "EMA + RSI Combo Long",
          description: "Price above EMA 21 AND RSI crosses above 40 after dip.",
          direction: "long",
          interval: "15m",
          leverage: 10,
          join: "and",
          conditions: [
            {
              id: "a",
              indicator: "price",
              period: 1,
              operator: "above",
              compareTo: "ema",
              comparePeriod: 21,
              value: 0,
            },
            {
              id: "b",
              indicator: "rsi",
              period: 14,
              operator: "crosses_above",
              compareTo: "value",
              comparePeriod: 21,
              value: 40,
            },
          ],
          tp: 3,
          sl: 1.5,
          exitOnSignal: true,
        },
        symbol,
      ),
  },
  {
    id: "blank",
    name: "Start from scratch",
    blurb: "Khali cockpit — market, signal aur risk khud set karo.",
    tag: "Blank",
    accent: "#64748b",
    apply: (symbol) => {
      const s = createBlankStrategy(symbol);
      s.name = "";
      s.description = "";
      return s;
    },
  },
];

export function getTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}

/* ── Persistence ────────────────────────────────────────── */

export function listCustomStrategies(): CustomStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_STRATEGIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as CustomStrategy[]) : [];
  } catch {
    return [];
  }
}

export function getCustomStrategy(id: string): CustomStrategy | null {
  return listCustomStrategies().find((s) => s.id === id) ?? null;
}

export function saveCustomStrategy(strategy: CustomStrategy): CustomStrategy {
  const next = { ...strategy, updatedAt: new Date().toISOString() };
  const all = listCustomStrategies();
  const idx = all.findIndex((s) => s.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  try {
    window.localStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(all));
  } catch {
    // private mode
  }
  window.dispatchEvent(new Event(CUSTOM_STRATEGIES_CHANGED));
  return next;
}

export function deleteCustomStrategy(id: string): void {
  const all = listCustomStrategies().filter((s) => s.id !== id);
  try {
    window.localStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CUSTOM_STRATEGIES_CHANGED));
}

export function setCustomStrategyStatus(id: string, status: StrategyStatus): CustomStrategy | null {
  const s = getCustomStrategy(id);
  if (!s) return null;
  const next: CustomStrategy = {
    ...s,
    status,
    deployedAt: status === "live" ? new Date().toISOString() : s.deployedAt,
  };
  return saveCustomStrategy(next);
}

/* ── Validation ─────────────────────────────────────────── */

export function validateStrategy(s: CustomStrategy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!s.name.trim()) {
    issues.push({ level: "error", field: "name", message: "Strategy ka naam zaroori hai" });
  }
  if (!s.market.symbols.length) {
    issues.push({ level: "error", field: "symbols", message: "Kam se kam ek coin select karo" });
  }
  if (s.market.leverage < 1 || s.market.leverage > 100) {
    issues.push({ level: "error", field: "leverage", message: "Leverage 1x–100x ke beech hona chahiye" });
  }

  if (s.signal.triggerType === "indicator") {
    const conds = s.signal.entryGroups.flatMap((g) => g.conditions);
    if (!conds.length) {
      issues.push({ level: "error", field: "entry", message: "Kam se kam ek entry condition add karo" });
    }
    for (const c of conds) {
      if (c.period < 1) {
        issues.push({ level: "error", field: "entry", message: "Indicator period ≥ 1 hona chahiye" });
      }
    }
  } else if (!s.signal.entryTime) {
    issues.push({ level: "error", field: "entry", message: "Entry time set karo" });
  }

  if (!s.risk.takeProfit.enabled && !s.risk.stopLoss.enabled) {
    issues.push({
      level: "warning",
      field: "risk",
      message: "Na TP na SL — position bina protection ke chalega",
    });
  }
  if (!s.risk.liveSafety && !s.risk.stopLoss.enabled) {
    issues.push({
      level: "warning",
      field: "risk",
      message: "Live safety off hai aur stop-loss bhi nahi — risky",
    });
  }
  if (s.risk.takeProfit.enabled && s.risk.stopLoss.enabled && s.risk.takeProfit.unit === "%" && s.risk.stopLoss.unit === "%") {
    if (s.risk.takeProfit.value < s.risk.stopLoss.value) {
      issues.push({
        level: "warning",
        field: "risk",
        message: "Take-profit stop-loss se chhota hai (R:R < 1)",
      });
    }
  }
  if (s.market.instrument === "options") {
    issues.push({
      level: "warning",
      field: "market",
      message: "Options builder abhi beta hai — signal logic perps jaisa evaluate hoga",
    });
  }

  return issues;
}

/* ── Natural-language summary ───────────────────────────── */

function directionPhrase(d: TradeDirection): string {
  if (d === "long") return "Go long";
  if (d === "short") return "Go short";
  return "Trade both sides on";
}

function conditionPhrase(c: Condition): string {
  const ind = INDICATOR_OPTIONS.find((i) => i.value === c.indicator)?.label ?? c.indicator;
  const left = c.indicator === "price" || c.indicator === "volume" ? ind : `${ind} ${c.period}`;
  const op = OPERATOR_OPTIONS.find((o) => o.value === c.operator)?.label ?? c.operator;
  let right: string;
  if (c.compareTo === "value") right = String(c.value);
  else if (c.compareTo === "ema") right = `EMA ${c.comparePeriod}`;
  else right = "price";
  return `${left} ${op} ${right}`;
}

export function summarizeStrategy(s: CustomStrategy): string {
  const coin =
    s.market.symbols.length === 0
      ? "—"
      : s.market.symbols.length === 1
        ? symbolLabel(s.market.symbols[0])
        : `${s.market.symbols.length} coins`;
  const inst = s.market.instrument === "perps" ? "perp" : "options";
  const head = `${directionPhrase(s.market.direction)} ${inst} on ${s.market.exchange} (${s.market.leverage}x ${s.market.margin}) · ${coin}.`;

  const session = s.market.run247
    ? `Runs 24/7 on the ${s.market.interval} chart.`
    : `Session-bound on the ${s.market.interval} chart.`;

  let entry = "";
  if (s.signal.triggerType === "time") {
    entry = `Enter at ${s.signal.entryTime ?? "—"} UTC.`;
  } else {
    const parts = s.signal.entryGroups.map((g) =>
      g.conditions.map(conditionPhrase).join(` ${g.join.toUpperCase()} `),
    );
    entry = parts.length ? `Enter when ${parts.join(" OR ")}.` : "No entry rule yet.";
  }

  const exits: string[] = [];
  if (s.risk.takeProfit.enabled) {
    exits.push(
      s.risk.takeProfit.unit === "rr"
        ? `take profit at ${s.risk.takeProfit.value}:1 R:R`
        : `take profit at +${s.risk.takeProfit.value}${s.risk.takeProfit.unit === "%" ? "%" : ` ${s.risk.takeProfit.unit}`}`,
    );
  }
  if (s.risk.stopLoss.enabled) {
    exits.push(
      s.risk.stopLoss.unit === "atr"
        ? `stop-loss at ${s.risk.stopLoss.value}× ATR`
        : `stop-loss at -${s.risk.stopLoss.value}${s.risk.stopLoss.unit === "%" ? "%" : ` ${s.risk.stopLoss.unit}`}`,
    );
  }
  if (s.risk.trailing) exits.push(`trailing ${s.risk.trailingPct}%`);
  if (s.risk.timeStop) exits.push(`time-stop after ${s.risk.timeStopCandles} candles`);
  if (s.signal.exitOnReversal) exits.push("exit on reversal");
  if (s.signal.exitOnSignal) exits.push("exit on opposite signal");

  const exitLine = exits.length ? `Exit: ${exits.join(", ")}.` : "No exit rules.";

  return [head, session, entry, exitLine].join(" ");
}

/* ── Live evaluation ────────────────────────────────────── */

function seriesFor(
  indicator: IndicatorId,
  period: number,
  closes: number[],
  volumes: number[],
  candles: Candle[],
): (number | null)[] {
  switch (indicator) {
    case "rsi":
      return rsi(closes, period);
    case "ema":
      return ema(closes, period);
    case "atr":
      return atr(candles, period);
    case "price":
      return closes;
    case "volume":
      return volumes;
    case "macd":
    case "macd_signal":
    case "macd_hist": {
      const m = macd(closes, 12, 26, 9);
      if (indicator === "macd") return m.map((p) => p.macd);
      if (indicator === "macd_signal") return m.map((p) => p.signal);
      return m.map((p) => p.hist);
    }
    default:
      return closes;
  }
}

function compareSeries(
  compareTo: CompareTarget,
  comparePeriod: number,
  value: number,
  closes: number[],
): (number | null)[] {
  if (compareTo === "value") return closes.map(() => value);
  if (compareTo === "ema") return ema(closes, comparePeriod);
  return closes;
}

function evalCondition(
  c: Condition,
  closes: number[],
  volumes: number[],
  candles: Candle[],
  i: number,
): boolean {
  if (i < 1) return false;
  const left = seriesFor(c.indicator, c.period, closes, volumes, candles);
  const right = compareSeries(c.compareTo, c.comparePeriod, c.value, closes);
  const aPrev = left[i - 1];
  const aNow = left[i];
  const bPrev = right[i - 1];
  const bNow = right[i];
  if (aNow == null || bNow == null) return false;

  switch (c.operator) {
    case "crosses_above":
      return crossDirection(aPrev, aNow, bPrev, bNow) === "up";
    case "crosses_below":
      return crossDirection(aPrev, aNow, bPrev, bNow) === "down";
    case "above":
      return aNow > bNow;
    case "below":
      return aNow < bNow;
    case "equals":
      return Math.abs(aNow - bNow) < Math.max(1e-8, Math.abs(bNow) * 1e-6);
    default:
      return false;
  }
}

function evalGroups(
  groups: ConditionGroup[],
  closes: number[],
  volumes: number[],
  candles: Candle[],
  i: number,
): boolean {
  if (!groups.length) return false;
  return groups.some((g) => {
    if (!g.conditions.length) return false;
    if (g.join === "or") {
      return g.conditions.some((c) => evalCondition(c, closes, volumes, candles, i));
    }
    return g.conditions.every((c) => evalCondition(c, closes, volumes, candles, i));
  });
}

export function evaluateStrategyLive(s: CustomStrategy, candles: Candle[]): LiveEval {
  if (candles.length < 30) {
    return {
      tone: "neutral",
      headline: "Waiting for data",
      detail: "Signal evaluate karne ke liye zyada candles chahiye.",
      readouts: [],
    };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const i = candles.length - 1;
  const fired = evalGroups(s.signal.entryGroups, closes, volumes, candles, i);

  const rsi14 = rsi(closes, 14);
  const ema21 = ema(closes, 21);
  const lastRsi = rsi14[i];
  const lastEma = ema21[i];
  const last = candles[i];

  const readouts = [
    {
      label: "Price",
      value: last.close >= 1000 ? `$${last.close.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${last.close.toFixed(4)}`,
    },
    {
      label: "RSI 14",
      value: lastRsi != null ? lastRsi.toFixed(1) : "—",
      color: lastRsi != null && lastRsi < 30 ? "var(--green)" : lastRsi != null && lastRsi > 70 ? "var(--red)" : undefined,
    },
    {
      label: "EMA 21",
      value: lastEma != null ? lastEma.toFixed(2) : "—",
    },
  ];

  const wantsLong = s.market.direction !== "short";
  const wantsShort = s.market.direction !== "long";

  if (fired && wantsLong) {
    return {
      tone: "buy",
      headline: "Entry long",
      detail: "Aapki entry conditions is bar par true hain.",
      readouts,
    };
  }
  if (fired && wantsShort) {
    return {
      tone: "sell",
      headline: "Entry short",
      detail: "Aapki entry conditions is bar par true hain.",
      readouts,
    };
  }

  return {
    tone: "neutral",
    headline: "No signal",
    detail: "Entry conditions abhi match nahi kar rahi.",
    readouts,
  };
}

/** Coin picker ke liye popular set — CRYPTO_SYMBOLS se. */
export function availableCoins(): { value: string; label: string }[] {
  return CRYPTO_SYMBOLS.map((s) => ({ value: s.value, label: s.label }));
}

export function riskRewardRatio(s: CustomStrategy): number | null {
  const tp = s.risk.takeProfit;
  const sl = s.risk.stopLoss;
  if (!tp.enabled || !sl.enabled) return null;
  if (tp.unit === "rr") return tp.value;
  if (tp.unit === "%" && sl.unit === "%" && sl.value > 0) return tp.value / sl.value;
  return null;
}

export function customStrategyHref(id: string): string {
  return `/trade/strategies/${id}`;
}

/** % TP/SL ko rough points mein — BTC ~$100k pe 1% ≈ 1000 pts. */
function pctToPoints(pct: number, refPrice: number): number {
  const price = refPrice > 0 ? refPrice : 100_000;
  return Math.max(1, Math.round((price * pct) / 100));
}

/**
 * Builder strategy ko catalogue StrategyDef mein wrap karo —
 * `/trade/strategies/[id]` aur StrategyRunner bilkul built-in jaisa chalte hain.
 */
export function toStrategyDef(custom: CustomStrategy): StrategyDef {
  const primary = custom.market.symbols[0] ?? "BTCUSDT";
  const name = custom.name.trim() || "Untitled strategy";
  const logic = summarizeStrategy(custom);

  const fields: StrategyField[] = [
    { key: "symbol", label: "Symbol", kind: "symbol", group: "signal", onCard: true },
    { key: "timeframe", label: "Timeframe", kind: "interval", group: "signal", onCard: true },
    {
      key: "sl_points",
      label: "Stop loss · pts",
      kind: "number",
      group: "risk",
      min: 1,
      hint: "Builder ke SL se seed — runner par tune kar sakte ho.",
    },
    {
      key: "target_points",
      label: "Target · pts",
      kind: "number",
      group: "risk",
      min: 1,
    },
    { key: "lots", label: "Lots", kind: "number", group: "risk", min: 0.01, step: 0.01 },
    { key: "days", label: "History · days", kind: "number", group: "backtest", min: 1, max: 700 },
  ];

  const slPts =
    custom.risk.stopLoss.enabled && custom.risk.stopLoss.unit === "%"
      ? pctToPoints(custom.risk.stopLoss.value, 100_000)
      : custom.risk.stopLoss.enabled
        ? Math.max(1, Math.round(custom.risk.stopLoss.value * 100))
        : 400;
  const tpPts =
    custom.risk.takeProfit.enabled && custom.risk.takeProfit.unit === "%"
      ? pctToPoints(custom.risk.takeProfit.value, 100_000)
      : custom.risk.takeProfit.enabled
        ? Math.max(1, Math.round(custom.risk.takeProfit.value * 100))
        : 800;

  const defaults: StrategyValues = {
    symbol: primary,
    timeframe: custom.market.interval,
    sl_points: slPts,
    target_points: tpPts,
    lots: Math.max(0.01, custom.risk.positionSizeUsd / 1000),
    days: 30,
  };

  // EMA periods jo conditions mein hain — chart overlay ke liye.
  const emaPeriods = new Set<number>();
  for (const g of custom.signal.entryGroups) {
    for (const c of g.conditions) {
      if (c.indicator === "ema") emaPeriods.add(c.period);
      if (c.compareTo === "ema") emaPeriods.add(c.comparePeriod);
    }
  }
  if (emaPeriods.size === 0) {
    emaPeriods.add(9);
    emaPeriods.add(21);
  }

  return {
    id: custom.id,
    name,
    category: `Custom · ${custom.status}`,
    blurb: custom.description.trim() || logic.slice(0, 140),
    logic,
    accent: "#2563eb",
    icon: Wand2,
    featured: custom.status === "live",
    engineNote:
      "Live signal aapki builder conditions se client-side evaluate hota hai. Backtest backend ke EMA engine par approximate chalta hai — exact multi-condition match nahi.",
    backtestable: custom.market.instrument !== "options",
    fields,
    defaults,
    analyze(candles, values) {
      return analyzeCustomStrategy(custom, candles, values, [...emaPeriods]);
    },
    toBacktest(values) {
      const symbol = str(values, "symbol", primary);
      const timeframe = str(values, "timeframe", custom.market.interval);
      const periods = [...emaPeriods].sort((a, b) => a - b);
      const fast = periods[0] ?? 9;
      const slow = periods[1] ?? periods[0] ?? 21;
      return {
        strategy: "ema-crossover",
        symbol,
        timeframe,
        days: num(values, "days", 30),
        sl_points: num(values, "sl_points", slPts),
        target_points: num(values, "target_points", tpPts),
        lots: num(values, "lots", 1),
        ema9: fast,
        ema21: slow,
        ema50: slow,
        use_rsi_filter: custom.signal.entryGroups.some((g) =>
          g.conditions.some((c) => c.indicator === "rsi"),
        ),
        rsi_period: 14,
        rsi_overbought: 70,
        rsi_oversold: 30,
        use_no_entry_window: !custom.market.run247,
        range_start: "11:00",
        range_end: "13:00",
        range_timezone: "Asia/Kolkata",
      };
    },
  };
}

function analyzeCustomStrategy(
  custom: CustomStrategy,
  candles: Candle[],
  values: StrategyValues,
  emaPeriods: number[],
): StrategyAnalysis {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const overlays: ChartOverlay[] = emaPeriods.slice(0, 3).map((p, i) => ({
    key: `ema_${p}`,
    label: `EMA ${p}`,
    color: i === 0 ? "#2563eb" : i === 1 ? "#d97706" : "#7c3aed",
  }));

  // Overlay values candles par chipkao.
  const series = emaPeriods.map((p) => ema(closes, p));
  const decorated: Candle[] = candles.map((candle, i) => {
    const next: Candle = { ...candle };
    emaPeriods.forEach((period, k) => {
      next[`ema_${period}` as `ema_${number}`] = series[k][i];
    });
    return next;
  });

  if (candles.length < 30) {
    return {
      candles: decorated,
      overlays,
      signal: {
        headline: "Data ka intezaar",
        detail: "Candles load hote hi aapki entry conditions evaluate hongi.",
        tone: "neutral",
        readouts: [],
      },
    };
  }

  const i = candles.length - 1;
  const fired =
    custom.signal.triggerType === "time"
      ? false
      : evalGroups(custom.signal.entryGroups, closes, volumes, candles, i);

  const wantsLong = custom.market.direction !== "short";
  const wantsShort = custom.market.direction !== "long";
  let tone: "buy" | "sell" | "neutral" = "neutral";
  let headline = "No signal — conditions wait";
  let detail = "Entry conditions abhi match nahi kar rahi.";

  if (custom.signal.triggerType === "time") {
    headline = `Time entry · ${custom.signal.entryTime ?? "—"} UTC`;
    detail = "Time-based entries session clock par fire hoti hain; indicator wait nahi.";
  } else if (fired && wantsLong && !wantsShort) {
    tone = "buy";
    headline = "BUY — entry conditions true";
    detail = "Long setup aapki builder rules se match ho raha hai.";
  } else if (fired && wantsShort && !wantsLong) {
    tone = "sell";
    headline = "SELL — entry conditions true";
    detail = "Short setup aapki builder rules se match ho raha hai.";
  } else if (fired) {
    tone = "buy";
    headline = "Signal — both-sides entry armed";
    detail = "Conditions true hain; direction Both hai.";
  }

  const last = candles[i];
  const rsi14 = rsi(closes, 14)[i];
  const ema21 = ema(closes, 21)[i];
  const readouts = [
    {
      label: "Price",
      value:
        last.close >= 1000
          ? `$${last.close.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
          : `$${last.close.toFixed(4)}`,
    },
    {
      label: "RSI 14",
      value: rsi14 != null ? rsi14.toFixed(1) : "—",
      color: rsi14 != null && rsi14 < 30 ? "var(--green)" : rsi14 != null && rsi14 > 70 ? "var(--red)" : undefined,
    },
    {
      label: "EMA 21",
      value: ema21 != null ? ema21.toFixed(2) : "—",
    },
    {
      label: str(values, "symbol", custom.market.symbols[0] ?? "—"),
      value: `${custom.market.leverage}x · ${custom.market.direction}`,
    },
  ];

  return {
    candles: decorated,
    overlays,
    signal: { headline, detail, tone, readouts },
  };
}
