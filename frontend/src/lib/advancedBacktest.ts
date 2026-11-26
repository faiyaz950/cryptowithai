import { simulate, type LabSeries } from "@/lib/labRun";

/**
 * Visual rule lab for one family: EMA cross, then a pullback, then a stop order.
 * Fills are candle-honest. A stop order cannot fill on the retest candle.
 * If one candle touches the stop and the target, the stop is taken.
 * A stop that moves (partial, breakeven, trail) protects the next candle.
 */

export type LabPeriod = "6M" | "1Y" | "2Y" | "3Y" | "5Y" | "custom";
export type StopMode = "bar" | "pct" | "points" | "atr";
export type PadUnit = "pct" | "points";
export type TargetMode = "r" | "pct" | "points" | "none";
export type TrailMode = "off" | "points" | "atr";
export type SizeMode = "lots" | "risk" | "capitalPct" | "fixed";
export type SellMode = "flip" | "own";
export type StopMaxMode = "off" | "cap" | "skip";
export type PullBand = "pct" | "points";
export type Reentry = "off" | "same";
export type DayStart = "00:00" | "05:30";

export interface LabSpec {
  name: string;
  side: "long" | "short" | "both";
  symbol: string;
  timeframe: string;
  period: LabPeriod;
  customBars: number;
  holdout: string;
  fast: number;
  slow: number;
  setupBarName: string;
  andOn: boolean;
  andSide: "above" | "below";
  andEma: number;
  pullLen: number;
  pullBand: PullBand;
  pullPct: number;
  pullPoints: number;
  pullWindow: number;
  pullNo: number;
  retestBarName: string;
  expireBars: number;
  stopMode: StopMode;
  stopPadUnit: PadUnit;
  stopPadPct: number;
  stopPoints: number;
  stopAtrLen: number;
  stopAtrMult: number;
  stopMaxMode: StopMaxMode;
  stopMaxPoints: number;
  targetMode: TargetMode;
  targetR: number;
  targetPct: number;
  targetPoints: number;
  trailMode: TrailMode;
  trailPoints: number;
  trailAtrLen: number;
  trailAtrMult: number;
  beAfterR: number;
  timeStopBars: number;
  partialOn: boolean;
  partialQtyPct: number;
  partialAtPct: number;
  stopLockPct: number;
  useRsi: boolean;
  rsiPeriod: number;
  rsiLongAbove: number;
  rsiShortBelow: number;
  cancelOnCross: boolean;
  sellMode: SellMode;
  shortStopPadPct: number;
  windowOn: boolean;
  windowFrom: string;
  windowTo: string;
  nextDayAllowed: boolean;
  blockHoursOn: boolean;
  blockedHours: number[];
  skipMonthsOn: boolean;
  skippedMonths: number[];
  weekdaysOnly: boolean;
  allowedDays: number[];
  noEntryBefore: string;
  noEntryAfter: string;
  squareOff: string;
  maxTradesDay: number;
  reverse: boolean;
  dayStart: DayStart;
  reentry: Reentry;
  sizeMode: SizeMode;
  capital: number;
  lots: number;
  lotSize: number;
  leverage: number;
  riskPct: number;
  capitalPct: number;
  fixedQty: number;
  feePct: number;
  gstPct: number;
  feePerOrder: number;
  slipPct: number;
  /** Assumed funding, bps per 8h, paid by the position. 0 = off. Not a historical print. */
  fundingBps8h: number;
  /** BTC, ETH and SOL on one capital and one daily trade cap. */
  basket: boolean;
}

export const EXAMPLE_SPEC: LabSpec = {
  name: "EMA 20/100 first pullback",
  side: "both",
  symbol: "BTCUSDT",
  timeframe: "30m",
  period: "2Y",
  customBars: 2500,
  holdout: "2026-02-07",
  fast: 20,
  slow: 100,
  setupBarName: "setup",
  andOn: false,
  andSide: "above",
  andEma: 200,
  pullLen: 50,
  pullBand: "pct",
  pullPct: 0.25,
  pullPoints: 50,
  pullWindow: 30,
  pullNo: 1,
  retestBarName: "retest",
  expireBars: 10,
  stopMode: "bar",
  stopPadUnit: "pct",
  stopPadPct: 0.1,
  stopPoints: 50,
  stopAtrLen: 14,
  stopAtrMult: 1,
  stopMaxMode: "off",
  stopMaxPoints: 200,
  targetMode: "r",
  targetR: 4,
  targetPct: 1,
  targetPoints: 200,
  trailMode: "off",
  trailPoints: 100,
  trailAtrLen: 14,
  trailAtrMult: 1,
  beAfterR: 0,
  timeStopBars: 0,
  partialOn: true,
  partialQtyPct: 70,
  partialAtPct: 70,
  stopLockPct: 60,
  useRsi: true,
  rsiPeriod: 14,
  rsiLongAbove: 60,
  rsiShortBelow: 40,
  cancelOnCross: true,
  sellMode: "flip",
  shortStopPadPct: 0.1,
  windowOn: true,
  windowFrom: "17:30",
  windowTo: "03:00",
  nextDayAllowed: true,
  blockHoursOn: false,
  blockedHours: [],
  skipMonthsOn: false,
  skippedMonths: [],
  weekdaysOnly: false,
  allowedDays: [1, 2, 3, 4, 5],
  noEntryBefore: "",
  noEntryAfter: "",
  squareOff: "",
  maxTradesDay: 3,
  reverse: true,
  dayStart: "00:00",
  reentry: "off",
  sizeMode: "lots",
  capital: 2000,
  lots: 20,
  lotSize: 0.001,
  leverage: 10,
  riskPct: 1,
  capitalPct: 10,
  fixedQty: 0.02,
  feePct: 0.05,
  gstPct: 18,
  feePerOrder: 0,
  slipPct: 0.02,
  fundingBps8h: 0,
  basket: true,
};

export function cloneSpec(spec: LabSpec = EXAMPLE_SPEC): LabSpec {
  return {
    ...spec,
    blockedHours: [...spec.blockedHours],
    skippedMonths: [...spec.skippedMonths],
    allowedDays: [...spec.allowedDays],
  };
}

const PERIODS = new Set<LabPeriod>(["6M", "1Y", "2Y", "3Y", "5Y", "custom"]);
const SIDES = new Set<LabSpec["side"]>(["long", "short", "both"]);

export function hydrateSpec(raw: unknown): LabSpec {
  const base = cloneSpec();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<LabSpec>;
  const next: LabSpec = { ...base, ...row };
  if (!SIDES.has(next.side)) next.side = "both";
  if (!PERIODS.has(next.period)) next.period = "2Y";
  if (typeof row.basket !== "boolean") next.basket = true;
  if (Array.isArray(row.blockedHours)) next.blockedHours = row.blockedHours.filter((n) => typeof n === "number");
  if (Array.isArray(row.skippedMonths)) next.skippedMonths = row.skippedMonths.filter((n) => typeof n === "number");
  if (Array.isArray(row.allowedDays)) next.allowedDays = row.allowedDays.filter((n) => typeof n === "number");
  return next;
}

export interface SavedLab {
  id: string;
  savedAt: number;
  spec: LabSpec;
}

export const LAB_STORAGE_KEY = "cm.advancedBacktests";

export function readSavedLabs(): SavedLab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Partial<SavedLab>;
      if (!item.spec) return [];
      return [{
        id: typeof item.id === "string" ? item.id : String(item.savedAt ?? Date.now()),
        savedAt: typeof item.savedAt === "number" ? item.savedAt : Date.now(),
        spec: hydrateSpec(item.spec),
      }];
    });
  } catch {
    return [];
  }
}

export function writeSavedLabs(rows: SavedLab[]): void {
  localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(rows.slice(0, 30)));
}

export function upsertSavedLab(spec: LabSpec): SavedLab[] {
  const all = readSavedLabs();
  const idx = all.findIndex((row) => row.spec.name === spec.name);
  const next: SavedLab = {
    id: idx >= 0 ? all[idx].id : String(Date.now()),
    savedAt: Date.now(),
    spec: cloneSpec(spec),
  };
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  writeSavedLabs(all);
  return all;
}

export function deleteSavedLab(id: string): SavedLab[] {
  const all = readSavedLabs().filter((row) => row.id !== id);
  writeSavedLabs(all);
  return all;
}

export interface LabTrade {
  n: number;
  side: "long" | "short";
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  target: number | null;
  exit: number;
  qty: number;
  pnl: number;
  r: number;
  reason: string;
  holdout: boolean;
  symbol: string;
}

export interface LabMark {
  time: number;
  price: number;
  kind: "expired" | "rsi" | "cancel";
  side: "long" | "short";
  symbol: string;
}

export interface SymbolScore {
  symbol: string;
  net: number;
  trades: number;
}

export interface Stability {
  flips: number;
  finalTrades: number;
  exam: "too-small" | "ok";
  headline: string;
}

export interface Bucket {
  label: string;
  trades: number;
  net: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  profitFactor: number | null;
  maxDd: number;
}

export interface LabReport {
  trades: LabTrade[];
  bars: number;
  from: number;
  to: number;
  setups: number;
  expired: number;
  rsiBlocked: number;
  cancelled: number;
  skipped: number;
  andBlocked: number;
  practice: Bucket;
  finalTest: Bucket;
  folds: Bucket[];
  notes: string[];
  marks: LabMark[];
  bySymbol: SymbolScore[];
  stability: Stability;
  solo: string | null;
}

export interface StrategyRow {
  k: string;
  v: string;
}

export interface CandlePlan {
  need: number;
  load: number;
  days: number;
}

const TF_MIN: Record<string, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440,
};

const PERIOD_DAYS: Record<Exclude<LabPeriod, "custom">, number> = {
  "6M": 183,
  "1Y": 365,
  "2Y": 730,
  "3Y": 1095,
  "5Y": 1825,
};

/** Eight pages of the exchange limit. 30-minute 2Y fits. 1-minute years do not. */
export const CANDLE_CAP = 40000;
export const BASKET_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

export function candlePlan(timeframe: string, period: LabPeriod, customBars: number): CandlePlan {
  const mins = TF_MIN[timeframe] ?? 30;
  const need = period === "custom"
    ? Math.max(1, Math.round(customBars))
    : Math.ceil((PERIOD_DAYS[period] * 24 * 60) / mins);
  const load = Math.min(CANDLE_CAP, Math.max(1, need));
  return { need, load, days: (load * mins) / (60 * 24) };
}

export function specIssues(spec: LabSpec): string[] {
  const issues: string[] = [];
  const plan = candlePlan(spec.timeframe, spec.period, spec.customBars);
  if (spec.fast < 1 || spec.slow < 1 || spec.pullLen < 1) issues.push("EMA lengths start at 1.");
  if (spec.andOn && spec.andEma < 1) issues.push("The AND average starts at 1.");
  if (spec.pullWindow < 1 || spec.expireBars < 1) issues.push("The pullback window and the order life need at least 1 bar.");
  if (plan.load < spec.slow + 5) issues.push("This window is shorter than the slow average. Pick a longer period.");
  if (spec.capital <= 0) issues.push("Capital has to be above 0.");
  if (spec.leverage < 1) issues.push("Leverage starts at 1×.");
  if (spec.sizeMode === "lots" && (spec.lots <= 0 || spec.lotSize <= 0)) issues.push("Lots and the lot size have to be above 0.");
  if (spec.sizeMode === "fixed" && spec.fixedQty <= 0) issues.push("Quantity has to be above 0.");
  if (spec.sizeMode === "risk" && spec.riskPct <= 0) issues.push("Risk % has to be above 0.");
  if (spec.sizeMode === "capitalPct" && spec.capitalPct <= 0) issues.push("Capital % has to be above 0.");
  if (spec.targetMode === "r" && spec.targetR <= 0) issues.push("Target R has to be above 0.");
  if (spec.targetMode === "pct" && spec.targetPct <= 0) issues.push("Target % has to be above 0.");
  if (spec.targetMode === "points" && spec.targetPoints <= 0) issues.push("Target points have to be above 0.");
  if (spec.partialOn && spec.targetMode !== "none" && (spec.partialQtyPct <= 0 || spec.partialQtyPct >= 100)) {
    issues.push("The partial books between 0% and 100% of the size.");
  }
  if (spec.useRsi && spec.rsiPeriod < 2) issues.push("RSI length starts at 2.");
  if (spec.maxTradesDay < 1) issues.push("Max trades per day starts at 1.");
  if (spec.stopMode === "atr" && spec.stopAtrLen < 1) issues.push("ATR length starts at 1.");
  if (spec.stopMaxMode !== "off" && spec.stopMaxPoints <= 0) issues.push("Max points has to be above 0, or turn the cap off.");
  return issues;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function strategyRows(spec: LabSpec): StrategyRow[] {
  const plan = candlePlan(spec.timeframe, spec.period, spec.customBars);
  const symbol = spec.symbol.replace(/USDT$/, "USD");
  const periodLabel = spec.period === "custom" ? `${plan.load} candles` : spec.period;
  const cross = spec.side === "short" ? "below" : "above";
  const band = spec.pullBand === "points" ? `${num(spec.pullPoints)} points` : `${num(spec.pullPct)}%`;
  const rows: StrategyRow[] = [
    { k: "Market", v: `${symbol} · ${spec.timeframe} · ${periodLabel} · Crypto` },
    {
      k: "Basket",
      v: spec.basket
        ? "BTC, ETH and SOL share one capital and one daily trade cap."
        : `${symbol} only.`,
    },
  ];
  if (plan.need > plan.load) {
    rows.push({
      k: "History",
      v: `${periodLabel} wants ${plan.need.toLocaleString("en-IN")} candles. This feed loads ${plan.load.toLocaleString("en-IN")}, about ${Math.round(plan.days)} days.`,
    });
  }
  rows.push(
    { k: "Direction", v: directionLine(spec) },
    { k: "Setup", v: setupLine(spec, cross) },
  );
  if (spec.andOn) {
    rows.push({
      k: "And",
      v: `On the ${spec.setupBarName} bar, close is ${spec.andSide} EMA ${num(spec.andEma)}. A short flips that side.`,
    });
  }
  rows.push(
    {
      k: "Then",
      v: `${ordinal(spec.pullNo)} pullback to EMA ${num(spec.pullLen)} within ${band}, inside ${num(spec.pullWindow)} bars. That bar is “${spec.retestBarName}”.`,
    },
    { k: "Entry", v: entryLine(spec) },
    { k: "Only if", v: rsiLine(spec) },
    {
      k: "Cancel",
      v: spec.cancelOnCross
        ? `Cancel the setup if EMA ${num(spec.fast)} crosses back through EMA ${num(spec.slow)}.`
        : "No cancel rule.",
    },
    { k: "Stop", v: stopLine(spec) },
    { k: "Target", v: targetLine(spec) },
    { k: "Partial", v: partialLine(spec) },
    { k: "Trail", v: trailLine(spec) },
    { k: "Breakeven", v: spec.beAfterR > 0 ? `After ${num(spec.beAfterR)}R, move the stop to the entry. It protects the next candle.` : "Off" },
    { k: "Time stop", v: spec.timeStopBars > 0 ? `Exit at the close of the ${num(spec.timeStopBars)}th candle after the fill, if still open.` : "Off" },
    { k: "Time", v: timeLine(spec) },
    { k: "Session", v: sessionLine(spec) },
    { k: "Size", v: sizeLine(spec) },
    {
      k: "Costs",
      v: `${num(spec.feePct)}% brokerage + ${num(spec.gstPct)}% GST, $${num(spec.feePerOrder)} per order, ${num(spec.slipPct)}% slippage. A candle that touches the stop and the target counts as the stop.`,
    },
    {
      k: "Funding",
      v: spec.fundingBps8h > 0
        ? `${num(spec.fundingBps8h)} bps per 8h, typed in by you. These candles do not carry the historical funding print.`
        : "Off. These candles do not carry historical funding.",
    },
    {
      k: "Final test",
      v: `From ${spec.holdout}. Same rules, scored apart from the earlier candles. The date is not used to tune.`,
    },
  );
  return rows;
}

export interface LabCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function runAdvancedBacktest(raw: LabCandle[], spec: LabSpec): LabReport {
  return simulate([{ symbol: spec.symbol, candles: raw }], spec);
}

export function runBasket(series: LabSeries[], spec: LabSpec): LabReport {
  return simulate(series, spec);
}

export interface SweepAxis {
  label: string;
  values: number[];
}

export interface SweepPoint {
  id: string;
  stopText: string;
  targetText: string;
  patch: Partial<LabSpec>;
}

/** Values for the stop and target knobs that are actually on. Modes stay as they are. */
export function sweepGrid(spec: LabSpec): { stop: SweepAxis; target: SweepAxis; points: SweepPoint[] } {
  const stop = stopAxis(spec);
  const target = targetAxis(spec);
  const targets = target.values.length ? target.values : [null];
  const points: SweepPoint[] = [];
  for (const stopValue of stop.values) {
    for (const targetValue of targets) {
      const patch: Partial<LabSpec> = { ...stopPatch(spec, stopValue) };
      if (targetValue != null) Object.assign(patch, targetPatch(spec, targetValue));
      const stopText = `${trimNum(stopValue)}${stop.suffix}`;
      const targetText = targetValue == null ? "No target" : `${trimNum(targetValue)}${target.suffix}`;
      points.push({
        id: `${stopText}|${targetText}`,
        stopText,
        targetText,
        patch,
      });
    }
  }
  return { stop: { label: stop.label, values: stop.values }, target: { label: target.label, values: target.values }, points };
}

function around(current: number, defaults: number[]): number[] {
  const cur = Number.isFinite(current) && current > 0 ? current : defaults.find((n) => n > 0) ?? 1;
  const pool = [...new Set([cur, ...defaults].filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.round(n * 1e8) / 1e8))];
  pool.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur) || a - b);
  return pool.slice(0, 5).sort((a, b) => a - b);
}

function stopAxis(spec: LabSpec): { label: string; suffix: string; values: number[] } {
  if (spec.stopMode === "atr") {
    return { label: "ATR multiple", suffix: "× ATR", values: around(spec.stopAtrMult, [0.5, 1, 1.5, 2, 3]) };
  }
  if (spec.stopMode === "points" || (spec.stopMode === "bar" && spec.stopPadUnit === "points")) {
    return { label: "Stop points", suffix: " pt", values: around(spec.stopPoints, [25, 50, 100, 200, 400]) };
  }
  return { label: "Stop pad %", suffix: "%", values: around(spec.stopPadPct, [0.05, 0.1, 0.2, 0.5, 1]) };
}

function targetAxis(spec: LabSpec): { label: string; suffix: string; values: number[] } {
  if (spec.targetMode === "none") return { label: "Target", suffix: "", values: [] };
  if (spec.targetMode === "pct") return { label: "Target %", suffix: "%", values: around(spec.targetPct, [0.5, 1, 1.5, 2, 3]) };
  if (spec.targetMode === "points") return { label: "Target points", suffix: " pt", values: around(spec.targetPoints, [50, 100, 200, 400, 800]) };
  return { label: "Target R", suffix: "R", values: around(spec.targetR, [2, 3, 4, 5, 6]) };
}

function stopPatch(spec: LabSpec, value: number): Partial<LabSpec> {
  if (spec.stopMode === "atr") return { stopAtrMult: value };
  if (spec.stopMode === "points" || (spec.stopMode === "bar" && spec.stopPadUnit === "points")) return { stopPoints: value };
  return { stopPadPct: value };
}

function targetPatch(spec: LabSpec, value: number): Partial<LabSpec> {
  if (spec.targetMode === "pct") return { targetPct: value };
  if (spec.targetMode === "points") return { targetPoints: value };
  if (spec.targetMode === "r") return { targetR: value };
  return {};
}

function trimNum(n: number): string {
  return String(Math.round(n * 1e8) / 1e8);
}

function directionLine(spec: LabSpec): string {
  if (spec.side === "long") return "Long only.";
  if (spec.side === "short") return "Short only.";
  if (spec.sellMode === "own") {
    return `Long, plus a short that uses RSI below ${num(spec.rsiShortBelow)} and a ${num(spec.shortStopPadPct)}% stop pad. The averages, pullback, target, and session stay shared.`;
  }
  return "Long and short. Short is the same rules, flipped.";
}

function setupLine(spec: LabSpec, cross: string): string {
  if (spec.side === "both") {
    return `EMA ${num(spec.fast)} crosses EMA ${num(spec.slow)} on close. A long cross is up, a short cross is down. That bar is “${spec.setupBarName}”.`;
  }
  return `EMA ${num(spec.fast)} crosses ${cross} EMA ${num(spec.slow)} on close. That bar is “${spec.setupBarName}”.`;
}

function entryLine(spec: LabSpec): string {
  if (spec.side === "both") {
    return `Buy stop at the ${spec.retestBarName} high, sell stop at the ${spec.retestBarName} low. The order dies after ${num(spec.expireBars)} bars.`;
  }
  const verb = spec.side === "short" ? "Sell" : "Buy";
  const edge = spec.side === "short" ? "low" : "high";
  return `${verb} stop at the ${spec.retestBarName} ${edge}. The order dies after ${num(spec.expireBars)} bars.`;
}

function rsiLine(spec: LabSpec): string {
  if (!spec.useRsi) return "No extra filter.";
  const len = num(spec.rsiPeriod);
  if (spec.side === "long") return `RSI ${len} is above ${num(spec.rsiLongAbove)}.`;
  if (spec.side === "short") return `RSI ${len} is below ${num(spec.rsiShortBelow)}.`;
  if (spec.sellMode === "own") return `RSI ${len} above ${num(spec.rsiLongAbove)} for a long, below ${num(spec.rsiShortBelow)} for a short.`;
  return `RSI ${len} above ${num(spec.rsiLongAbove)} for a long, below ${num(100 - spec.rsiLongAbove)} for a short.`;
}

function stopLine(spec: LabSpec): string {
  let core: string;
  if (spec.stopMode === "pct") core = `${num(spec.stopPadPct)}% from the fill`;
  else if (spec.stopMode === "points") core = `${num(spec.stopPoints)} points from the fill`;
  else if (spec.stopMode === "atr") core = `${num(spec.stopAtrMult)}× ATR ${num(spec.stopAtrLen)} from the fill`;
  else if (spec.side === "short") {
    core = spec.stopPadUnit === "points"
      ? `${spec.retestBarName} high + ${num(spec.stopPoints)} points`
      : `${spec.retestBarName} high + ${num(spec.stopPadPct)}%`;
  } else if (spec.side === "long") {
    core = spec.stopPadUnit === "points"
      ? `${spec.retestBarName} low − ${num(spec.stopPoints)} points`
      : `${spec.retestBarName} low − ${num(spec.stopPadPct)}%`;
  } else if (spec.stopPadUnit === "points") {
    core = `long: ${spec.retestBarName} low − ${num(spec.stopPoints)} points · short: ${spec.retestBarName} high + ${num(spec.stopPoints)} points`;
  } else {
    const shortPad = spec.sellMode === "own" ? spec.shortStopPadPct : spec.stopPadPct;
    core = `long: ${spec.retestBarName} low − ${num(spec.stopPadPct)}% · short: ${spec.retestBarName} high + ${num(shortPad)}%`;
  }
  if (spec.stopMaxMode === "cap") return `${core}. Distance is capped at ${num(spec.stopMaxPoints)} points.`;
  if (spec.stopMaxMode === "skip") return `${core}. Skip the trade if the stop is more than ${num(spec.stopMaxPoints)} points away.`;
  return core;
}

function targetLine(spec: LabSpec): string {
  if (spec.targetMode === "none") return "No target.";
  if (spec.targetMode === "pct") return `${num(spec.targetPct)}% from the fill.`;
  if (spec.targetMode === "points") return `${num(spec.targetPoints)} points from the fill.`;
  return `${num(spec.targetR)} × the risk (R).`;
}

function partialLine(spec: LabSpec): string {
  if (!spec.partialOn || spec.targetMode === "none") return "Off.";
  return `Book ${num(spec.partialQtyPct)}% once price has travelled ${num(spec.partialAtPct)}% of the way, then move the stop to ${num(spec.stopLockPct)}% of the way.`;
}

function trailLine(spec: LabSpec): string {
  if (spec.trailMode === "points") return `${num(spec.trailPoints)} points behind the best price. It updates for the next candle.`;
  if (spec.trailMode === "atr") return `${num(spec.trailAtrMult)}× ATR ${num(spec.trailAtrLen)} behind the best price. It updates for the next candle.`;
  return "Off.";
}

function timeLine(spec: LabSpec): string {
  const parts: string[] = [];
  if (!spec.windowOn) parts.push("Entries any hour");
  else {
    const wrap = toMin(spec.windowFrom) > toMin(spec.windowTo);
    const next = wrap ? (spec.nextDayAllowed ? "next day allowed" : "stops at midnight") : "same day";
    parts.push(`${spec.windowFrom}–${spec.windowTo} IST · ${next}`);
  }
  if (spec.blockHoursOn && spec.blockedHours.length) parts.push(`blocked ${hourList(spec.blockedHours)}`);
  if (spec.skipMonthsOn && spec.skippedMonths.length) parts.push(`skip ${spec.skippedMonths.slice().sort((a, b) => a - b).map((m) => MONTHS[m - 1] ?? m).join(", ")}`);
  if (spec.weekdaysOnly) parts.push(dayList(spec.allowedDays));
  if (spec.noEntryBefore) parts.push(`no entry before ${spec.noEntryBefore}`);
  if (spec.noEntryAfter) parts.push(`no entry after ${spec.noEntryAfter}`);
  return parts.join(" · ");
}

function sessionLine(spec: LabSpec): string {
  const parts = [
    spec.squareOff ? `square-off ${spec.squareOff} IST` : "carry overnight",
    `max ${num(spec.maxTradesDay)} entries / day`,
    spec.reverse ? "an opposite fill closes the trade and reverses" : "one trade at a time",
    spec.dayStart === "05:30" ? "day starts 05:30 IST" : "day starts 00:00 IST",
    spec.reentry === "same" ? "the same order can be placed again until it expires" : "after a stop, wait for a new setup",
  ];
  return parts.join(" · ");
}

function sizeLine(spec: LabSpec): string {
  const lev = `${num(spec.leverage)}×`;
  const shared = spec.basket ? " One capital covers every open coin." : "";
  if (spec.sizeMode === "risk") return `${num(spec.riskPct)}% of $${num(spec.capital)} at risk, capped at ${lev}.${shared}`;
  if (spec.sizeMode === "capitalPct") return `${num(spec.capitalPct)}% of $${num(spec.capital)} at ${lev}.${shared}`;
  if (spec.sizeMode === "fixed") return `${num(spec.fixedQty)} units, capped at ${lev} on $${num(spec.capital)}.${shared}`;
  return `${num(spec.lots)} lots × ${num(spec.lotSize)} = ${num(spec.lots * spec.lotSize)} · ${lev} · $${num(spec.capital)}.${shared}`;
}

function hourList(hours: number[]): string {
  return hours.slice().sort((a, b) => a - b).map((h) => `${String(h).padStart(2, "0")}:00`).join(", ");
}

function dayList(days: number[]): string {
  const sorted = days.slice().sort((a, b) => a - b);
  if (sorted.join() === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.length === 7) return "all days";
  return sorted.map((d) => DAYS[d] ?? String(d)).join(", ");
}

function ordinal(n: number): string {
  const v = Math.round(n);
  if (v === 1) return "1st";
  if (v === 2) return "2nd";
  if (v === 3) return "3rd";
  return `${v}th`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 1e8) / 1e8);
}

function toMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

