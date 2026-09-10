/**
 * Custom Strategy Builder — users apni no-code strategies bana sakte hain.
 * Persistence localStorage mein; live signal client-side indicators se evaluate hota hai.
 */

import type { Candle } from "./cryptoApi";
import { CRYPTO_SYMBOLS, symbolLabel } from "./cryptoApi";
import { atr, crossDirection, ema, macd, rsi } from "./indicators";

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
  };
}

export function createBlankStrategy(): CustomStrategy {
  const now = new Date().toISOString();
  return {
    id: uid("strat"),
    name: "",
    description: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    market: defaultMarket(),
    signal: defaultSignal(),
    risk: defaultRisk(),
    stats: { closedPnl30d: 0, openPnl: null, closedTrades: 0 },
  };
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
