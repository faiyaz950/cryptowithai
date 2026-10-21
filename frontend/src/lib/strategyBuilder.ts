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

export type StrategyStatus = "draft" | "live" | "paper" | "paused" | "archived";
export type StrategyCategory = "options" | "futures" | "hedging" | "indicators";
export type InstrumentType = "perps" | "options";
export type TradeDirection = "long" | "short" | "both";
export type MarginMode = "isolated" | "cross";
export type TriggerType = "indicator" | "time";
export type BuilderView = "cockpit" | "simulator" | "flow" | "chart";

export interface PaperDeploymentSettings {
  capitalUsd: number;
  leverage: number;
  autoExecute: boolean;
  deployedAt: string;
  symbol: string;
  timeframe: string;
  confirmedTpPct: number;
  confirmedSlPct: number;
  trailingStopPct?: number;
  simScore?: number;
}

export interface OptionsStrategyConfig {
  structure: "single" | "bull_spread" | "bear_spread" | "iron_condor" | "straddle";
  legType: "call" | "put" | "both";
  strikeSelection: "atm" | "otm" | "itm" | "delta";
  targetDelta: number;
  expiryPreference: "daily" | "weekly" | "monthly";
  maxIvThreshold?: number;
}

export interface HedgingStrategyConfig {
  hedgeType: "spot_futures" | "protective_put" | "covered_call" | "pair_hedge";
  hedgeRatioPct: number;
  rebalanceTriggerPct: number;
  secondarySymbol?: string;
}

export interface FuturesStrategyConfig {
  orderType: "market" | "limit";
  liquidationBufferAtr: number;
  trailingType: "percent" | "atr";
}

export const STRATEGY_CATEGORIES: {
  id: StrategyCategory;
  label: string;
  blurb: string;
  icon: string;
}[] = [
  {
    id: "options",
    label: "Options Strategy",
    blurb: "Call, Put, Spreads & Iron Condor with Greeks and Payoff curves",
    icon: "Sigma",
  },
  {
    id: "futures",
    label: "Futures Strategy",
    blurb: "Perpetual futures with leverage, liquidation buffers & dynamic stops",
    icon: "TrendingUp",
  },
  {
    id: "hedging",
    label: "Hedging Strategy",
    blurb: "Delta neutral cash & carry, protective puts, and portfolio downside shield",
    icon: "ShieldCheck",
  },
  {
    id: "indicators",
    label: "Indicator-Based Strategy",
    blurb: "Multi-condition entry & exit rules using RSI, EMA, MACD, ATR & Volume",
    icon: "LineChart",
  },
];

export type IndicatorId =
  | "rsi"
  | "ema"
  | "macd"
  | "macd_line"
  | "macd_signal"
  | "macd_hist"
  | "macd_highest"
  | "atr"
  | "price"
  | "volume"
  | "price_volume";

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
  strategyType: StrategyCategory;
  instrument: InstrumentType;
  exchange: string;
  symbols: string[];
  direction: TradeDirection;
  margin: MarginMode;
  leverage: number;
  interval: string;
  run247: boolean;
  optionsConfig?: OptionsStrategyConfig;
  hedgingConfig?: HedgingStrategyConfig;
  futuresConfig?: FuturesStrategyConfig;
}

export interface SignalConfig {
  triggerType: TriggerType;
  entryGroups: ConditionGroup[];
  exitOnSignal: boolean;
  exitOnReversal: boolean;
  /** Time trigger: HH:MM IST — desk ka timezone (dekho DESK_TZ). */
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
  paperSettings?: PaperDeploymentSettings;
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
  { value: "macd", label: "MACD", defaultPeriod: 12 },
  { value: "macd_line", label: "MACD Line", defaultPeriod: 12 },
  { value: "macd_signal", label: "Signal Line", defaultPeriod: 9 },
  { value: "macd_highest", label: "Highest MACD", defaultPeriod: 20 },
  { value: "atr", label: "ATR", defaultPeriod: 14 },
  { value: "price_volume", label: "Price & Volume", defaultPeriod: 20 },
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

export const EXCHANGES = ["Delta Exchange", "CoinDCX", "Binance", "Bybit"] as const;

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
    strategyType: "indicators",
    instrument: "perps",
    exchange: "Delta Exchange",
    symbols: ["BTCUSDT"],
    direction: "long",
    margin: "isolated",
    leverage: 20,
    interval: "5m",
    run247: true,
    optionsConfig: {
      structure: "single",
      legType: "call",
      strikeSelection: "otm",
      targetDelta: 0.35,
      expiryPreference: "weekly",
      maxIvThreshold: 75,
    },
    hedgingConfig: {
      hedgeType: "spot_futures",
      hedgeRatioPct: 100,
      rebalanceTriggerPct: 5,
      secondarySymbol: "ETHUSDT",
    },
    futuresConfig: {
      orderType: "market",
      liquidationBufferAtr: 2.5,
      trailingType: "percent",
    },
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
  strategyType: StrategyCategory;
  blurb: string;
  tag: string;
  accent: string;
  apply: (symbol?: string) => CustomStrategy;
}

function baseFromTemplate(partial: {
  name: string;
  description: string;
  strategyType?: StrategyCategory;
  instrument?: InstrumentType;
  direction: TradeDirection;
  interval?: string;
  leverage?: number;
  conditions: Condition[];
  join?: "and" | "or";
  tp?: number;
  sl?: number;
  exitOnSignal?: boolean;
  exitOnReversal?: boolean;
  optionsConfig?: OptionsStrategyConfig;
  hedgingConfig?: HedgingStrategyConfig;
  futuresConfig?: FuturesStrategyConfig;
}, symbol = "BTCUSDT"): CustomStrategy {
  const s = createBlankStrategy(symbol);
  s.name = partial.name;
  s.description = partial.description;
  if (partial.strategyType) s.market.strategyType = partial.strategyType;
  if (partial.instrument) s.market.instrument = partial.instrument;
  s.market.direction = partial.direction;
  if (partial.interval) s.market.interval = partial.interval;
  if (partial.leverage) s.market.leverage = partial.leverage;
  if (partial.optionsConfig) s.market.optionsConfig = partial.optionsConfig;
  if (partial.hedgingConfig) s.market.hedgingConfig = partial.hedgingConfig;
  if (partial.futuresConfig) s.market.futuresConfig = partial.futuresConfig;
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
  // ── 1. Indicator-Based Strategies (5 Core Setups) ──────────
  {
    id: "rsi-oversold-long",
    name: "RSI Oversold Long",
    strategyType: "indicators",
    blurb: "RSI 14 jab oversold zone (< 32) mein dip kare to long entry — classic mean-reversion.",
    tag: "Mean reversion",
    accent: "#059669",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "RSI Oversold Long",
          description: "Enter long when RSI crosses below 32; TP 2.5% / SL 1.2%.",
          strategyType: "indicators",
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
    id: "ema-crossover",
    name: "EMA Crossover",
    strategyType: "indicators",
    blurb: "Fast EMA (9) slow EMA (21) ke upar cross kare — trend ke saath long entry.",
    tag: "Trend",
    accent: "#2563eb",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "EMA Crossover",
          description: "Long when EMA 9 crosses above EMA 21.",
          strategyType: "indicators",
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
    id: "macd",
    name: "MACD",
    strategyType: "indicators",
    blurb: "MACD Line jab Signal Line ke upar cross kare — momentum breakout entry.",
    tag: "Momentum",
    accent: "#7c3aed",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "MACD",
          description: "Enter long when MACD crosses above its signal line.",
          strategyType: "indicators",
          direction: "long",
          interval: "1h",
          leverage: 5,
          conditions: [
            {
              id: "x",
              indicator: "macd_line",
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
    id: "rsi-ema",
    name: "RSI + EMA",
    strategyType: "indicators",
    blurb: "Trend filter (Price above EMA 21) + RSI pullback recovery — confluence entry.",
    tag: "Confluence",
    accent: "#d97706",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "RSI + EMA",
          description: "Price above EMA 21 AND RSI crosses above 40 after dip.",
          strategyType: "indicators",
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
    id: "rsi-combo",
    name: "RSI Combo",
    strategyType: "indicators",
    blurb: "Dual RSI rules (Oversold rebound + momentum confirmation) — high probability setup.",
    tag: "Combo",
    accent: "#0891b2",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "RSI Combo",
          description: "RSI crosses above 30 (dip recovery) AND RSI is below 65 (room to run).",
          strategyType: "indicators",
          direction: "long",
          interval: "15m",
          leverage: 10,
          join: "and",
          conditions: [
            {
              id: "a",
              indicator: "rsi",
              period: 14,
              operator: "crosses_above",
              compareTo: "value",
              comparePeriod: 14,
              value: 30,
            },
            {
              id: "b",
              indicator: "rsi",
              period: 14,
              operator: "below",
              compareTo: "value",
              comparePeriod: 14,
              value: 65,
            },
          ],
          tp: 3.5,
          sl: 1.5,
          exitOnSignal: true,
        },
        symbol,
      ),
  },

  // ── 2. Options Strategies ─────────────────────────────────
  {
    id: "options-bull-call",
    name: "Bull Call Spread",
    strategyType: "options",
    blurb: "Buy ATM Call + Sell OTM Call. Capped risk, predefined max profit & theta discount.",
    tag: "Options Spread",
    accent: "#3b82f6",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Bull Call Debit Spread",
          description: "Buy Call (Delta ~0.50) and Sell OTM Call (Delta ~0.30) on weekly expiry.",
          strategyType: "options",
          instrument: "options",
          direction: "long",
          interval: "1h",
          optionsConfig: {
            structure: "bull_spread",
            legType: "call",
            strikeSelection: "otm",
            targetDelta: 0.35,
            expiryPreference: "weekly",
            maxIvThreshold: 70,
          },
          conditions: [
            {
              id: "opt_cond_1",
              indicator: "price",
              period: 1,
              operator: "above",
              compareTo: "ema",
              comparePeriod: 21,
              value: 0,
            },
          ],
          tp: 50,
          sl: 30,
        },
        symbol,
      ),
  },
  {
    id: "options-iron-condor",
    name: "Delta Neutral Iron Condor",
    strategyType: "options",
    blurb: "Sell OTM Call Spread + Put Spread. Range-bound theta collection in low volatility.",
    tag: "Options Neutral",
    accent: "#8b5cf6",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Delta Neutral Iron Condor",
          description: "Sell 0.20 Delta wings on both sides; profit when market stays in range.",
          strategyType: "options",
          instrument: "options",
          direction: "both",
          interval: "4h",
          optionsConfig: {
            structure: "iron_condor",
            legType: "both",
            strikeSelection: "delta",
            targetDelta: 0.2,
            expiryPreference: "weekly",
            maxIvThreshold: 65,
          },
          conditions: [
            {
              id: "opt_cond_2",
              indicator: "atr",
              period: 14,
              operator: "below",
              compareTo: "value",
              comparePeriod: 14,
              value: 1500,
            },
          ],
          tp: 60,
          sl: 100,
        },
        symbol,
      ),
  },

  // ── 3. Futures Strategies ─────────────────────────────────
  {
    id: "futures-trend-rider",
    name: "Futures Trend Rider (20x)",
    strategyType: "futures",
    blurb: "20x isolated perpetual trend strategy with ATR trailing stop and dynamic profit locking.",
    tag: "Futures Perp",
    accent: "#10b981",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Futures Trend Rider 20x",
          description: "Ride strong momentum with isolated 20x leverage and trailing stop-loss.",
          strategyType: "futures",
          instrument: "perps",
          direction: "long",
          interval: "15m",
          leverage: 20,
          futuresConfig: {
            orderType: "market",
            liquidationBufferAtr: 2.5,
            trailingType: "percent",
          },
          conditions: [
            {
              id: "fut_1",
              indicator: "ema",
              period: 9,
              operator: "crosses_above",
              compareTo: "ema",
              comparePeriod: 21,
              value: 0,
            },
          ],
          tp: 5,
          sl: 2,
        },
        symbol,
      ),
  },
  {
    id: "futures-breakout-scalp",
    name: "Futures Volatility Scalper",
    strategyType: "futures",
    blurb: "High-speed perp breakout using ATR volatility expansion & volume confirmation.",
    tag: "Futures Scalp",
    accent: "#f59e0b",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Futures Volatility Scalper",
          description: "Scalp quick volatility surges with 15x leverage and strict R:R.",
          strategyType: "futures",
          instrument: "perps",
          direction: "both",
          interval: "5m",
          leverage: 15,
          futuresConfig: {
            orderType: "market",
            liquidationBufferAtr: 2.0,
            trailingType: "atr",
          },
          conditions: [
            {
              id: "fut_2",
              indicator: "price_volume",
              period: 20,
              operator: "above",
              compareTo: "value",
              comparePeriod: 20,
              value: 1000,
            },
          ],
          tp: 3,
          sl: 1.5,
        },
        symbol,
      ),
  },

  // ── 4. Hedging Strategies ─────────────────────────────────
  {
    id: "hedge-delta-neutral",
    name: "Delta-Neutral Cash & Carry",
    strategyType: "hedging",
    blurb: "Hold Spot Crypto + Short Perps (100% hedge). Harvest funding rate yield with zero directional risk.",
    tag: "Hedging Neutral",
    accent: "#06b6d4",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Delta-Neutral Cash & Carry Hedge",
          description: "Hold 1x Spot and short 1x Perps to lock in high funding yield without price risk.",
          strategyType: "hedging",
          instrument: "perps",
          direction: "short",
          interval: "1h",
          leverage: 1,
          hedgingConfig: {
            hedgeType: "spot_futures",
            hedgeRatioPct: 100,
            rebalanceTriggerPct: 5,
          },
          conditions: [
            {
              id: "hdg_1",
              indicator: "price",
              period: 1,
              operator: "above",
              compareTo: "value",
              comparePeriod: 1,
              value: 0,
            },
          ],
          tp: 10,
          sl: 5,
        },
        symbol,
      ),
  },
  {
    id: "hedge-protective-put",
    name: "Protective Put Portfolio Shield",
    strategyType: "hedging",
    blurb: "Long Spot + Long OTM Put Option. Complete downside protection below strike while keeping upside open.",
    tag: "Hedging Shield",
    accent: "#ec4899",
    apply: (symbol) =>
      baseFromTemplate(
        {
          name: "Protective Put Portfolio Shield",
          description: "Cap downside drawdown to strike level; keep 100% unlimited upside potential.",
          strategyType: "hedging",
          instrument: "options",
          direction: "long",
          interval: "1d",
          hedgingConfig: {
            hedgeType: "protective_put",
            hedgeRatioPct: 100,
            rebalanceTriggerPct: 5,
          },
          optionsConfig: {
            structure: "single",
            legType: "put",
            strikeSelection: "otm",
            targetDelta: 0.25,
            expiryPreference: "monthly",
          },
          conditions: [
            {
              id: "hdg_2",
              indicator: "rsi",
              period: 14,
              operator: "below",
              compareTo: "value",
              comparePeriod: 14,
              value: 50,
            },
          ],
          tp: 20,
          sl: 10,
        },
        symbol,
      ),
  },

  // ── 5. Blank Template ─────────────────────────────────────
  {
    id: "blank",
    name: "Start from scratch",
    strategyType: "indicators",
    blurb: "Khali cockpit — strategy type, rules, indicators aur parameters khud define karo.",
    tag: "Custom",
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
    deployedAt: status === "live" || status === "paper" ? new Date().toISOString() : s.deployedAt,
  };
  return saveCustomStrategy(next);
}

export function deployStrategyToPaper(
  strategyId: string,
  settings: PaperDeploymentSettings,
  catalogueDef?: { name: string; description: string; category?: StrategyCategory }
): CustomStrategy | null {
  let s = getCustomStrategy(strategyId);
  if (!s) {
    // If it's a catalogue strategy or template, auto-initialize a strategy instance
    const tmpl = getTemplate(strategyId);
    if (tmpl) {
      s = tmpl.apply(settings.symbol);
      s.id = strategyId;
    } else {
      s = createBlankStrategy(settings.symbol || "BTCUSDT");
      s.id = strategyId;
      s.name = catalogueDef?.name || strategyId;
      s.description = catalogueDef?.description || "Catalogue strategy deployed to Paper Trading";
      if (catalogueDef?.category) s.market.strategyType = catalogueDef.category;
      s.market.symbols = [settings.symbol || "BTCUSDT"];
      s.market.interval = settings.timeframe || "1h";
      s.risk.takeProfit = { enabled: true, value: settings.confirmedTpPct, unit: "%" };
      s.risk.stopLoss = { enabled: true, value: settings.confirmedSlPct, unit: "%" };
      s.risk.positionSizeUsd = settings.capitalUsd;
      s.market.leverage = settings.leverage;
    }
  }

  const next: CustomStrategy = {
    ...s,
    status: "paper",
    deployedAt: settings.deployedAt || new Date().toISOString(),
    paperSettings: settings,
  };
  return saveCustomStrategy(next);
}

export function listPaperDeployedStrategies(): CustomStrategy[] {
  return listCustomStrategies().filter(
    (s) => s.status === "paper" || (s.status === "live" && s.paperSettings != null)
  );
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
  const left =
    c.indicator === "price" || c.indicator === "volume" || c.indicator === "price_volume"
      ? ind
      : `${ind} ${c.period}`;
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
  const cat = s.market.strategyType ?? "indicators";
  const catPrefix =
    cat === "options"
      ? `[Options · ${s.market.optionsConfig?.structure?.replace("_", " ") ?? "Spread"}]`
      : cat === "futures"
      ? `[Futures · ${s.market.leverage}x]`
      : cat === "hedging"
      ? `[Hedging · ${s.market.hedgingConfig?.hedgeRatioPct ?? 100}%]`
      : "[Indicators]";
  const head = `${catPrefix} ${directionPhrase(s.market.direction)} ${inst} on ${s.market.exchange} (${s.market.leverage}x ${s.market.margin}) · ${coin}.`;

  const session = s.market.run247
    ? `Runs 24/7 on the ${s.market.interval} chart.`
    : `Session-bound on the ${s.market.interval} chart.`;

  let entry = "";
  if (s.signal.triggerType === "time") {
    entry = `Enter at ${s.signal.entryTime ?? "—"} IST.`;
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
    case "price_volume": {
      const avgVol = ema(volumes, Math.max(1, period));
      return closes.map((c, idx) => {
        const av = avgVol[idx];
        const volRatio = av && av > 0 ? (volumes[idx] || 0) / av : 1;
        return c * volRatio;
      });
    }
    case "macd":
    case "macd_line":
    case "macd_signal":
    case "macd_hist": {
      const m = macd(closes, 12, 26, 9);
      if (indicator === "macd" || indicator === "macd_line") return m.map((p) => p.macd);
      if (indicator === "macd_signal") return m.map((p) => p.signal);
      return m.map((p) => p.hist);
    }
    case "macd_highest": {
      const m = macd(closes, 12, 26, 9);
      const macdLines = m.map((p) => p.macd);
      const lookback = Math.max(1, period);
      return macdLines.map((val, idx) => {
        if (val == null) return null;
        const start = Math.max(0, idx - lookback + 1);
        let max = -Infinity;
        for (let k = start; k <= idx; k++) {
          const v = macdLines[k];
          if (v != null && v > max) max = v;
        }
        return max === -Infinity ? null : max;
      });
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
    featured: custom.status === "live" || custom.status === "paper",
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
    headline = `Time entry · ${custom.signal.entryTime ?? "—"} IST`;
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

/* ── Simulation / Backtest Engine ────────────────────────── */

export interface SimulationTrade {
  id: string;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  direction: "long" | "short";
  exitIndex: number;
  exitTime: number;
  exitPrice: number;
  exitReason: "Take Profit" | "Stop Loss" | "Trailing Stop" | "Signal Reversal" | "End of Period";
  pnlPct: number;
  pnlUsd: number;
}

export interface StrategyEffectiveness {
  score: number; // 0 to 100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  status: "Highly Effective" | "Effective" | "Moderate Risk" | "Suboptimal" | "Ineffective";
  summary: string;
  checklist: {
    label: string;
    passed: boolean;
    value: string;
    hint: string;
  }[];
  insights: string[];
  readyForPaperTrading: boolean;
}

export interface SimOverrides {
  tpVal?: number;
  slVal?: number;
  trailing?: boolean;
  trailingPct?: number;
  positionSizeUsd?: number;
  leverage?: number;
}

export interface SimulationResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  netPnlUsd: number;
  netPnlPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgTradePnlUsd: number;
  trades: SimulationTrade[];
  equityCurve: { time: number; equity: number }[];
  targetHits: number;
  slHits: number;
  trailingHits: number;
  signalExitHits: number;
  endOfPeriodHits: number;
  riskRewardRatio: number;
  avgWinUsd: number;
  avgLossUsd: number;
  bestTradeUsd: number;
  worstTradeUsd: number;
  avgHoldingCandles: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  effectiveness: StrategyEffectiveness;
}

export function simulateStrategy(
  s: CustomStrategy,
  candles: Candle[],
  overrides?: SimOverrides
): SimulationResult {
  const initialEquity = 10000;
  const defaultEffectiveness: StrategyEffectiveness = {
    score: 0,
    grade: "F",
    status: "Ineffective",
    summary: "Candle data na-kafi hai ya koi trades trigger nahi hui.",
    checklist: [
      { label: "Win Rate Consistency", passed: false, value: "0%", hint: "Target is ≥ 45% win rate" },
      { label: "Profit Factor", passed: false, value: "0.00x", hint: "Target is ≥ 1.3x profit factor" },
      { label: "Risk : Reward Expectancy", passed: false, value: "1 : 0.0", hint: "Target is ≥ 1.5:1 ratio" },
      { label: "Drawdown Envelope", passed: false, value: "0%", hint: "Drawdown should be ≤ 12%" },
    ],
    insights: ["Kam se kam 30 candles aur valid entry rules zaroori hain simulation ke liye."],
    readyForPaperTrading: false,
  };

  if (!candles || candles.length < 30) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePct: 0,
      netPnlUsd: 0,
      netPnlPct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      avgTradePnlUsd: 0,
      trades: [],
      equityCurve: [{ time: Date.now(), equity: initialEquity }],
      targetHits: 0,
      slHits: 0,
      trailingHits: 0,
      signalExitHits: 0,
      endOfPeriodHits: 0,
      riskRewardRatio: 0,
      avgWinUsd: 0,
      avgLossUsd: 0,
      bestTradeUsd: 0,
      worstTradeUsd: 0,
      avgHoldingCandles: 0,
      grossProfitUsd: 0,
      grossLossUsd: 0,
      effectiveness: defaultEffectiveness,
    };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);
  const trades: SimulationTrade[] = [];
  let equity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdown = 0;
  const equityCurve: { time: number; equity: number }[] = [{ time: candles[30].time, equity }];

  let inTrade: {
    direction: "long" | "short";
    entryIndex: number;
    entryTime: number;
    entryPrice: number;
    tpPrice: number;
    slPrice: number;
    trailingPeak: number;
  } | null = null;

  const positionSize = overrides?.positionSizeUsd ?? (s.risk.positionSizeUsd || 1000);
  const leverage = overrides?.leverage ?? (s.market.leverage || 1);
  const tpVal = overrides?.tpVal ?? (s.risk.takeProfit.value || 2.5);
  const slVal = overrides?.slVal ?? (s.risk.stopLoss.value || 1.2);
  const useTrailing = overrides?.trailing ?? s.risk.trailing;
  const trailingPct = overrides?.trailingPct ?? (s.risk.trailingPct || 0.8);

  for (let i = 30; i < candles.length; i++) {
    const c = candles[i];

    if (inTrade) {
      let exitPrice: number | null = null;
      let exitReason: SimulationTrade["exitReason"] = "Take Profit";

      // Trailing stop update
      if (useTrailing && trailingPct > 0) {
        if (inTrade.direction === "long") {
          if (c.high > inTrade.trailingPeak) {
            inTrade.trailingPeak = c.high;
            const newSl = c.high * (1 - trailingPct / 100);
            if (newSl > inTrade.slPrice) inTrade.slPrice = newSl;
          }
        } else {
          if (c.low < inTrade.trailingPeak) {
            inTrade.trailingPeak = c.low;
            const newSl = c.low * (1 + trailingPct / 100);
            if (newSl < inTrade.slPrice) inTrade.slPrice = newSl;
          }
        }
      }

      if (inTrade.direction === "long") {
        if (s.risk.takeProfit.enabled && c.high >= inTrade.tpPrice) {
          exitPrice = inTrade.tpPrice;
          exitReason = "Take Profit";
        } else if (s.risk.stopLoss.enabled && c.low <= inTrade.slPrice) {
          exitPrice = inTrade.slPrice;
          exitReason = useTrailing && inTrade.slPrice > inTrade.entryPrice ? "Trailing Stop" : "Stop Loss";
        }
      } else {
        if (s.risk.takeProfit.enabled && c.low <= inTrade.tpPrice) {
          exitPrice = inTrade.tpPrice;
          exitReason = "Take Profit";
        } else if (s.risk.stopLoss.enabled && c.high >= inTrade.slPrice) {
          exitPrice = inTrade.slPrice;
          exitReason = useTrailing && inTrade.slPrice < inTrade.entryPrice ? "Trailing Stop" : "Stop Loss";
        }
      }

      // Check reversal exit
      if (!exitPrice && s.signal.exitOnReversal) {
        const fired = evalGroups(s.signal.entryGroups, closes, volumes, candles, i);
        if (fired) {
          exitPrice = c.close;
          exitReason = "Signal Reversal";
        }
      }

      // If at last candle, force exit
      if (!exitPrice && i === candles.length - 1) {
        exitPrice = c.close;
        exitReason = "End of Period";
      }

      if (exitPrice !== null) {
        const rawPct =
          inTrade.direction === "long"
            ? (exitPrice - inTrade.entryPrice) / inTrade.entryPrice
            : (inTrade.entryPrice - exitPrice) / inTrade.entryPrice;
        const pnlPct = rawPct * 100 * leverage;
        const pnlUsd = positionSize * (rawPct * leverage);
        equity += pnlUsd;
        if (equity > peakEquity) peakEquity = equity;
        const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;

        trades.push({
          id: `t_${trades.length + 1}`,
          entryIndex: inTrade.entryIndex,
          entryTime: inTrade.entryTime,
          entryPrice: inTrade.entryPrice,
          direction: inTrade.direction,
          exitIndex: i,
          exitTime: c.time,
          exitPrice,
          exitReason,
          pnlPct,
          pnlUsd,
        });
        equityCurve.push({ time: c.time, equity });
        inTrade = null;
      }
    } else {
      // Evaluate entry
      const fired = evalGroups(s.signal.entryGroups, closes, volumes, candles, i);
      const wantsLong = s.market.direction !== "short";
      const wantsShort = s.market.direction === "short" || s.market.direction === "both";

      if (fired) {
        const dir: "long" | "short" = wantsLong ? "long" : "short";
        const entryPrice = c.close;
        let tpPrice = entryPrice;
        let slPrice = entryPrice;

        if (dir === "long") {
          tpPrice = entryPrice * (1 + tpVal / 100);
          slPrice = entryPrice * (1 - slVal / 100);
        } else {
          tpPrice = entryPrice * (1 - tpVal / 100);
          slPrice = entryPrice * (1 + slVal / 100);
        }

        inTrade = {
          direction: dir,
          entryIndex: i,
          entryTime: c.time,
          entryPrice,
          tpPrice,
          slPrice,
          trailingPeak: entryPrice,
        };
      }
    }
  }

  const winningTrades = trades.filter((t) => t.pnlUsd > 0).length;
  const losingTrades = trades.filter((t) => t.pnlUsd <= 0).length;
  const winRatePct = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const grossProfitUsd = trades.filter((t) => t.pnlUsd > 0).reduce((acc, t) => acc + t.pnlUsd, 0);
  const grossLossUsd = Math.abs(trades.filter((t) => t.pnlUsd < 0).reduce((acc, t) => acc + t.pnlUsd, 0));
  const profitFactor = grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : grossProfitUsd > 0 ? 99 : 0;
  const netPnlUsd = equity - initialEquity;
  const netPnlPct = (netPnlUsd / initialEquity) * 100;
  const avgTradePnlUsd = trades.length > 0 ? netPnlUsd / trades.length : 0;

  const targetHits = trades.filter((t) => t.exitReason === "Take Profit").length;
  const slHits = trades.filter((t) => t.exitReason === "Stop Loss").length;
  const trailingHits = trades.filter((t) => t.exitReason === "Trailing Stop").length;
  const signalExitHits = trades.filter((t) => t.exitReason === "Signal Reversal").length;
  const endOfPeriodHits = trades.filter((t) => t.exitReason === "End of Period").length;
  const riskRewardRatio = slVal > 0 ? Number((tpVal / slVal).toFixed(2)) : 2.0;
  const avgWinUsd = winningTrades > 0 ? grossProfitUsd / winningTrades : 0;
  const avgLossUsd = losingTrades > 0 ? grossLossUsd / losingTrades : 0;
  const bestTradeUsd = trades.length > 0 ? Math.max(...trades.map((t) => t.pnlUsd)) : 0;
  const worstTradeUsd = trades.length > 0 ? Math.min(...trades.map((t) => t.pnlUsd)) : 0;
  const avgHoldingCandles =
    trades.length > 0
      ? Math.round(trades.reduce((acc, t) => acc + (t.exitIndex - t.entryIndex), 0) / trades.length)
      : 0;

  // ── Strategy Effectiveness Scoring ─────────────────────────
  let winRateScore = 0;
  if (winRatePct >= 65) winRateScore = 30;
  else if (winRatePct >= 55) winRateScore = 26;
  else if (winRatePct >= 48) winRateScore = 20;
  else if (winRatePct >= 40) winRateScore = 14;
  else winRateScore = 5;

  let pfScore = 0;
  if (profitFactor >= 2.2) pfScore = 30;
  else if (profitFactor >= 1.6) pfScore = 25;
  else if (profitFactor >= 1.25) pfScore = 18;
  else if (profitFactor >= 1.0) pfScore = 10;
  else pfScore = 0;

  let rrScore = 0;
  if (riskRewardRatio >= 2.5) rrScore = 20;
  else if (riskRewardRatio >= 1.8) rrScore = 16;
  else if (riskRewardRatio >= 1.3) rrScore = 12;
  else if (riskRewardRatio >= 1.0) rrScore = 8;
  else rrScore = 4;

  let ddScore = 0;
  if (maxDrawdown <= 4) ddScore = 20;
  else if (maxDrawdown <= 8) ddScore = 16;
  else if (maxDrawdown <= 14) ddScore = 11;
  else if (maxDrawdown <= 22) ddScore = 6;
  else ddScore = 1;

  const rawScore =
    trades.length === 0 ? 0 : Math.min(100, Math.max(0, winRateScore + pfScore + rrScore + ddScore));
  const score = Math.round(rawScore);

  let grade: StrategyEffectiveness["grade"] = "F";
  if (score >= 90) grade = "A+";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 40) grade = "D";

  let status: StrategyEffectiveness["status"] = "Ineffective";
  if (score >= 80) status = "Highly Effective";
  else if (score >= 68) status = "Effective";
  else if (score >= 50) status = "Moderate Risk";
  else if (score >= 35) status = "Suboptimal";

  const insights: string[] = [];
  if (profitFactor >= 1.6) {
    insights.push(`Strong profit engine: ${profitFactor.toFixed(2)}x profit factor ensures high payout vs risk.`);
  }
  if (targetHits >= slHits && targetHits > 0) {
    insights.push(`Target precision: Reached target ${targetHits} times compared to ${slHits} stop-outs.`);
  } else if (slHits > targetHits) {
    insights.push(`High stop-out frequency: ${slHits} stop losses hit. Consider widening SL buffer or checking entry filter.`);
  }
  if (riskRewardRatio >= 1.8) {
    insights.push(`Positive expectancy: 1 : ${riskRewardRatio.toFixed(1)} Risk-Reward ratio allows profitability even with modest win rates.`);
  }
  if (maxDrawdown <= 8) {
    insights.push(`Capital preservation: Maximum drawdown kept under ${maxDrawdown.toFixed(1)}%, well inside safe bounds.`);
  } else {
    insights.push(`Risk caution: Drawdown peaked at ${maxDrawdown.toFixed(1)}%. Recommend lowering leverage or tightening SL.`);
  }
  if (trailingHits > 0) {
    insights.push(`Dynamic protection: Trailing stop locked in gains on ${trailingHits} trades during market pullbacks.`);
  }

  const checklist: StrategyEffectiveness["checklist"] = [
    {
      label: "Win Rate Consistency",
      passed: winRatePct >= 45,
      value: `${winRatePct.toFixed(1)}%`,
      hint: "Target is ≥ 45% win rate for steady trend compounding",
    },
    {
      label: "Profit Factor",
      passed: profitFactor >= 1.3,
      value: `${profitFactor.toFixed(2)}x`,
      hint: "Gross profit should outpace gross losses by at least 1.3x",
    },
    {
      label: "Risk : Reward Expectancy",
      passed: riskRewardRatio >= 1.5,
      value: `1 : ${riskRewardRatio.toFixed(1)}`,
      hint: "Target should offer at least 1.5x the risk taken",
    },
    {
      label: "Drawdown Envelope",
      passed: maxDrawdown <= 12,
      value: `−${maxDrawdown.toFixed(1)}%`,
      hint: "Drawdown should remain under 12% to prevent account depletion",
    },
  ];

  const readyForPaperTrading = score >= 55 && trades.length >= 2;
  const summary = readyForPaperTrading
    ? `Strategy exhibits solid statistical edge (Score ${score}/100, Grade ${grade}). Ready for zero-risk Paper Trading execution.`
    : `Strategy needs rule tuning (Score ${score}/100). Adjust SL/Target parameters or tighten entry conditions before deploying.`;

  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRatePct,
    netPnlUsd,
    netPnlPct,
    profitFactor,
    maxDrawdownPct: maxDrawdown,
    avgTradePnlUsd,
    trades: trades.slice(-30),
    equityCurve,
    targetHits,
    slHits,
    trailingHits,
    signalExitHits,
    endOfPeriodHits,
    riskRewardRatio,
    avgWinUsd,
    avgLossUsd,
    bestTradeUsd,
    worstTradeUsd,
    avgHoldingCandles,
    grossProfitUsd,
    grossLossUsd,
    effectiveness: {
      score,
      grade,
      status,
      summary,
      checklist,
      insights,
      readyForPaperTrading,
    },
  };
}
