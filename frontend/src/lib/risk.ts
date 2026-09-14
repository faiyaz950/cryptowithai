/**
 * Risk Desk ka poora math — position sizing, liquidation, R-ladder, funding
 * cost, Kelly aur Monte Carlo risk-of-ruin.
 *
 * Yahan sab pure functions hain (localStorage helpers chhod kar) taaki UI sirf
 * render kare aur wahi number har jagah ek jaisa nikle.
 */

import { atr, lastSwingHigh, lastSwingLow, type Bar } from "./indicators";

export const RISK_PLANS_KEY = "arjunai_risk_plans";
export const RISK_PLANS_CHANGED = "arjunai:risk-plans-changed";
export const RISK_SETTINGS_KEY = "arjunai_risk_settings";

export type Side = "long" | "short";
export type PlanStatus = "planned" | "open" | "closed";
export type WarnLevel = "critical" | "warn" | "ok";

/* ── Inputs ─────────────────────────────────────────────── */

export interface PlanInput {
  symbol: string;
  side: Side;
  /** Account equity (USD) — risk isi ka percent hota hai. */
  equity: number;
  riskPct: number;
  entry: number;
  stop: number;
  leverage: number;
  /** Ek side ki taker fee, percent mein (Delta ~0.05%). */
  feePct: number;
  /** Maintenance margin requirement, percent. Liquidation isse shift hota hai. */
  maintMarginPct: number;
  /** Perp funding, percent per interval. Positive = longs pay. */
  fundingPct: number;
  fundingIntervalHours: number;
  /** Trade kitne ghante hold karne ka plan hai — funding cost isse nikalta hai. */
  holdHours: number;
  /** Take-profit ladder, R multiples mein. */
  targetsR: number[];
}

export const DEFAULT_PLAN: PlanInput = {
  symbol: "BTCUSDT",
  side: "long",
  equity: 10000,
  riskPct: 1,
  entry: 0,
  stop: 0,
  leverage: 10,
  feePct: 0.05,
  maintMarginPct: 0.5,
  fundingPct: 0,
  fundingIntervalHours: 8,
  holdHours: 24,
  targetsR: [1, 2, 3],
};

/* ── Outputs ────────────────────────────────────────────── */

export interface RiskWarning {
  id: string;
  level: Exclude<WarnLevel, "ok">;
  text: string;
}

export interface LadderRung {
  r: number;
  price: number;
  pnl: number;
}

export interface PlanMath {
  valid: boolean;
  /** Kyun invalid hai — UI seedha yahi dikhata hai. */
  invalidReason: string | null;
  riskAmount: number;
  stopDistance: number;
  stopPct: number;
  qty: number;
  notional: number;
  margin: number;
  /** Notional / equity — "asli" leverage, chahe exchange par kuch bhi set ho. */
  effectiveLeverage: number;
  liqPrice: number | null;
  liqDistancePct: number | null;
  /** Stop se pehle liquidation lag jayegi — ye plan ki sabse badi galti hai. */
  liqBeforeStop: boolean;
  feeCost: number;
  /** Signed — negative matlab funding aapko mil raha hai. */
  fundingCost: number;
  totalCost: number;
  /** Fees + funding ke baad asli risk. */
  netRisk: number;
  netRiskPct: number;
  breakeven: number;
  ladder: LadderRung[];
  warnings: RiskWarning[];
  grade: WarnLevel;
}

function bad(reason: string): PlanMath {
  return {
    valid: false,
    invalidReason: reason,
    riskAmount: 0,
    stopDistance: 0,
    stopPct: 0,
    qty: 0,
    notional: 0,
    margin: 0,
    effectiveLeverage: 0,
    liqPrice: null,
    liqDistancePct: null,
    liqBeforeStop: false,
    feeCost: 0,
    fundingCost: 0,
    totalCost: 0,
    netRisk: 0,
    netRiskPct: 0,
    breakeven: 0,
    ladder: [],
    warnings: [],
    grade: "ok",
  };
}

/**
 * Liquidation price — isolated margin, linear USDT perp.
 *
 * Initial margin rate = 1/leverage, maintenance = MMR. Long tab liquidate hota
 * hai jab price entry se (IMR - MMR) fraction neeche chala jaye.
 */
export function liquidationPrice(
  entry: number,
  side: Side,
  leverage: number,
  maintMarginPct: number,
): number | null {
  if (!(entry > 0) || !(leverage > 0)) return null;
  const buffer = 1 / leverage - maintMarginPct / 100;
  if (buffer <= 0) return null; // MMR se kam leverage — position khulegi hi nahi.
  const liq = side === "long" ? entry * (1 - buffer) : entry * (1 + buffer);
  return liq > 0 ? liq : null;
}

/** Poora plan — size, liquidation, cost aur warnings ek pass mein. */
export function computePlan(input: PlanInput): PlanMath {
  const { entry, stop, side, equity, riskPct, leverage } = input;

  if (!(entry > 0)) return bad("Entry price daalo");
  if (!(stop > 0)) return bad("Stop-loss daalo");
  if (!(equity > 0)) return bad("Account equity daalo");
  if (!(riskPct > 0)) return bad("Risk % daalo");
  if (side === "long" && stop >= entry) return bad("Long mein stop entry se neeche hona chahiye");
  if (side === "short" && stop <= entry) return bad("Short mein stop entry se upar hona chahiye");

  const stopDistance = Math.abs(entry - stop);
  const stopPct = (stopDistance / entry) * 100;
  const riskAmount = (equity * riskPct) / 100;
  const qty = riskAmount / stopDistance;
  const notional = qty * entry;
  const lev = leverage > 0 ? leverage : 1;
  const margin = notional / lev;
  const effectiveLeverage = notional / equity;

  const liqPrice = liquidationPrice(entry, side, lev, input.maintMarginPct);
  const liqDistancePct = liqPrice == null ? null : (Math.abs(liqPrice - entry) / entry) * 100;
  const liqBeforeStop =
    liqPrice == null ? false : side === "long" ? liqPrice >= stop : liqPrice <= stop;

  // Entry + exit, dono taraf taker fee.
  const feeCost = (notional * input.feePct * 2) / 100;

  const intervals =
    input.fundingIntervalHours > 0 ? input.holdHours / input.fundingIntervalHours : 0;
  // Positive funding = longs pay, shorts receive.
  const fundingCost =
    (notional * (input.fundingPct / 100) * intervals) * (side === "long" ? 1 : -1);

  const totalCost = feeCost + fundingCost;
  const netRisk = riskAmount + totalCost;
  const netRiskPct = (netRisk / equity) * 100;

  // Breakeven = entry ko itna hilao ki costs nikal jayein.
  const costPerUnit = qty > 0 ? totalCost / qty : 0;
  const breakeven = side === "long" ? entry + costPerUnit : entry - costPerUnit;

  const ladder = input.targetsR
    .filter((r) => r > 0)
    .sort((a, b) => a - b)
    .map((r) => ({
      r,
      price: side === "long" ? entry + r * stopDistance : entry - r * stopDistance,
      pnl: r * riskAmount - totalCost,
    }));

  const warnings: RiskWarning[] = [];

  if (liqBeforeStop) {
    warnings.push({
      id: "liq",
      level: "critical",
      text: `${lev}x par liquidation ${fmtNum(liqPrice ?? 0)} par lagti hai — stop ${fmtNum(stop)} tak pahunchne se pehle hi position khatam. Leverage ${Math.max(1, Math.floor(safeMaxLeverage(entry, stop, input.maintMarginPct)))}x ya usse kam rakho.`,
    });
  }
  if (margin > equity) {
    warnings.push({
      id: "margin",
      level: "critical",
      text: `Is size ke liye ${fmtUsd(margin)} margin chahiye, equity sirf ${fmtUsd(equity)} hai.`,
    });
  }
  if (riskPct > 5) {
    warnings.push({ id: "risk-hi", level: "critical", text: `Ek trade par ${riskPct}% risk bahut zyada hai — 0.5–2% standard hai.` });
  } else if (riskPct > 2) {
    warnings.push({ id: "risk-mid", level: "warn", text: `${riskPct}% risk aggressive hai. 20 trade ki losing streak account ka bada hissa le jayegi.` });
  }
  if (effectiveLeverage > 20) {
    warnings.push({ id: "lev", level: "warn", text: `Effective leverage ${effectiveLeverage.toFixed(1)}x — notional equity se bahut bada hai.` });
  }
  if (stopPct < 0.15) {
    warnings.push({ id: "tight", level: "warn", text: `Stop entry se sirf ${stopPct.toFixed(2)}% door hai — normal noise isse hit kar dega.` });
  }
  if (riskAmount > 0 && Math.abs(totalCost) / riskAmount > 0.25) {
    warnings.push({
      id: "cost",
      level: "warn",
      text: `Fees + funding ${fmtUsd(Math.abs(totalCost))} — risk ka ${((Math.abs(totalCost) / riskAmount) * 100).toFixed(0)}%. Hold time ya size kam karo.`,
    });
  }

  const grade: WarnLevel = warnings.some((w) => w.level === "critical")
    ? "critical"
    : warnings.length
      ? "warn"
      : "ok";

  return {
    valid: true,
    invalidReason: null,
    riskAmount,
    stopDistance,
    stopPct,
    qty,
    notional,
    margin,
    effectiveLeverage,
    liqPrice,
    liqDistancePct,
    liqBeforeStop,
    feeCost,
    fundingCost,
    totalCost,
    netRisk,
    netRiskPct,
    breakeven,
    ladder,
    warnings,
    grade,
  };
}

/**
 * Sabse zyada leverage jispar liquidation stop ke *paar* rahegi.
 * Stop distance fraction = d; liquidation buffer = 1/L - mmr; chahiye buffer > d.
 */
export function safeMaxLeverage(entry: number, stop: number, maintMarginPct: number): number {
  if (!(entry > 0) || !(stop > 0)) return 1;
  const d = Math.abs(entry - stop) / entry;
  const denom = d + maintMarginPct / 100;
  if (denom <= 0) return 100;
  return 1 / denom;
}

/* ── ATR / structure se stop suggestions ────────────────── */

export interface StopSuggestion {
  id: string;
  label: string;
  hint: string;
  price: number;
}

/**
 * Stop kahan rakhein — volatility (ATR) aur market structure (swing) dono se.
 * Fixed percent stops crypto mein bekaar hain kyunki volatility har coin aur
 * har timeframe par alag hoti hai; ATR usi ko naapta hai.
 */
export function stopSuggestions(
  candles: Bar[],
  side: Side,
  entry: number,
  atrPeriod = 14,
): StopSuggestion[] {
  if (!candles.length || !(entry > 0)) return [];
  const series = atr(candles, atrPeriod);
  const a = series.at(-1);
  const out: StopSuggestion[] = [];

  if (a != null && a > 0) {
    for (const mult of [1, 1.5, 2, 3]) {
      const price = side === "long" ? entry - a * mult : entry + a * mult;
      if (price > 0) {
        out.push({
          id: `atr-${mult}`,
          label: `${mult}× ATR`,
          hint: `${((a * mult) / entry * 100).toFixed(2)}% · ATR ${fmtNum(a)}`,
          price,
        });
      }
    }
  }

  const swing = side === "long" ? lastSwingLow(candles, 5) : lastSwingHigh(candles, 5);
  if (swing != null && swing > 0 && (side === "long" ? swing < entry : swing > entry)) {
    // Structure ke thoda paar — exact swing par stop ko hunt kar liya jata hai.
    const pad = a != null && a > 0 ? a * 0.25 : entry * 0.001;
    const price = side === "long" ? swing - pad : swing + pad;
    out.push({
      id: "swing",
      label: "Structure",
      hint: `Swing ${side === "long" ? "low" : "high"} ${fmtNum(swing)} ke paar`,
      price,
    });
  }

  return out;
}

/** Aakhri ATR value — UI mein volatility dikhane ke liye. */
export function lastAtr(candles: Bar[], period = 14): number | null {
  if (!candles.length) return null;
  return atr(candles, period).at(-1) ?? null;
}

/* ── Edge math ──────────────────────────────────────────── */

/** Expectancy R mein — ek trade par average kitne R milte hain. */
export function expectancyR(winRate: number, rr: number): number {
  const w = winRate / 100;
  return w * rr - (1 - w);
}

/** Jitna win rate chahiye sirf breakeven rehne ke liye. */
export function breakevenWinRate(rr: number): number {
  return rr > 0 ? (1 / (1 + rr)) * 100 : 100;
}

/**
 * Kelly fraction — theoretical optimal risk per trade. Practice mein log-utility
 * ke assumptions crypto par tootte hain, isliye UI half-Kelly recommend karta hai.
 */
export function kellyFraction(winRate: number, rr: number): number {
  if (rr <= 0) return 0;
  const w = winRate / 100;
  return w - (1 - w) / rr;
}

/* ── Monte Carlo ────────────────────────────────────────── */

export interface SimInput {
  equity: number;
  riskPct: number;
  winRate: number;
  rr: number;
  trades: number;
  runs: number;
  /** Starting equity ka itna percent bach jaye to "ruin" maana jata hai. */
  ruinPct: number;
  seed: number;
}

export interface SimResult {
  median: number;
  p5: number;
  p95: number;
  best: number;
  worst: number;
  profitProb: number;
  ruinProb: number;
  medianMaxDD: number;
  p95MaxDD: number;
  /** Fan chart ke liye per-step percentile bands. */
  band: { p10: number[]; p50: number[]; p90: number[] };
  /** Dikhane ke liye kuch sample paths. */
  samples: number[][];
}

/** Mulberry32 — chhota, fast aur seedable, taaki same input par same chart bane. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Fixed-fractional sizing par N trades ki M simulations.
 *
 * Yahi wo cheez hai jo "70% win rate" ko reality check deti hai: same edge par
 * bhi drawdown aur ruin ka distribution kaafi chaura hota hai.
 */
export function simulate(input: SimInput): SimResult {
  const trades = Math.max(1, Math.min(500, Math.round(input.trades)));
  const runs = Math.max(50, Math.min(5000, Math.round(input.runs)));
  const rand = rng(input.seed || 1);
  const ruinLevel = (input.equity * input.ruinPct) / 100;
  const risk = input.riskPct / 100;

  const steps = trades + 1;
  const paths = new Float64Array(runs * steps);
  const finals: number[] = [];
  const maxDDs: number[] = [];
  let ruined = 0;
  let profitable = 0;

  for (let r = 0; r < runs; r++) {
    let eq = input.equity;
    let peak = eq;
    let maxDD = 0;
    let dead = false;
    const base = r * steps;
    paths[base] = eq;

    for (let t = 1; t <= trades; t++) {
      if (!dead) {
        const stake = eq * risk;
        eq += rand() * 100 < input.winRate ? stake * input.rr : -stake;
        if (eq > peak) peak = eq;
        const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
        if (eq <= ruinLevel) {
          dead = true;
          eq = ruinLevel;
        }
      }
      paths[base + t] = eq;
    }

    if (dead) ruined++;
    if (eq > input.equity) profitable++;
    finals.push(eq);
    maxDDs.push(maxDD);
  }

  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);

  const scratch = new Float64Array(runs);
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (let t = 0; t < steps; t++) {
    for (let r = 0; r < runs; r++) scratch[r] = paths[r * steps + t];
    const col = Array.from(scratch).sort((a, b) => a - b);
    p10.push(percentile(col, 0.1));
    p50.push(percentile(col, 0.5));
    p90.push(percentile(col, 0.9));
  }

  const sampleCount = Math.min(24, runs);
  const stride = Math.max(1, Math.floor(runs / sampleCount));
  const samples: number[][] = [];
  for (let r = 0; r < runs && samples.length < sampleCount; r += stride) {
    samples.push(Array.from(paths.subarray(r * steps, r * steps + steps)));
  }

  return {
    median: percentile(finals, 0.5),
    p5: percentile(finals, 0.05),
    p95: percentile(finals, 0.95),
    best: finals[finals.length - 1],
    worst: finals[0],
    profitProb: (profitable / runs) * 100,
    ruinProb: (ruined / runs) * 100,
    medianMaxDD: percentile(maxDDs, 0.5),
    p95MaxDD: percentile(maxDDs, 0.95),
    band: { p10, p50, p90 },
    samples,
  };
}

/* ── Risk book (saved plans) ────────────────────────────── */

export interface SavedPlan extends PlanInput {
  id: string;
  createdAt: string;
  status: PlanStatus;
  note: string;
}

export interface BookHeat {
  count: number;
  openRisk: number;
  heatPct: number;
  longRisk: number;
  shortRisk: number;
  notional: number;
  grossLeverage: number;
  /** Ek hi taraf jhuka hua risk — majors aapas mein correlated chalte hain. */
  clusterPct: number;
  clusterSide: Side | null;
  warnings: RiskWarning[];
}

/**
 * Poori book ka risk — per-trade risk sahi hone ke bawajood 8 open trades
 * ek saath 8% de sakte hain. Traders isse "portfolio heat" kehte hain.
 */
export function bookHeat(plans: SavedPlan[], equity: number): BookHeat {
  const live = plans.filter((p) => p.status !== "closed");
  let openRisk = 0;
  let longRisk = 0;
  let shortRisk = 0;
  let notional = 0;

  for (const p of live) {
    const m = computePlan(p);
    if (!m.valid) continue;
    openRisk += m.riskAmount;
    notional += m.notional;
    if (p.side === "long") longRisk += m.riskAmount;
    else shortRisk += m.riskAmount;
  }

  const base = equity > 0 ? equity : 1;
  const heatPct = (openRisk / base) * 100;
  const clusterSide: Side | null =
    longRisk === shortRisk ? null : longRisk > shortRisk ? "long" : "short";
  const clusterPct = (Math.max(longRisk, shortRisk) / base) * 100;

  const warnings: RiskWarning[] = [];
  if (heatPct > 10) {
    warnings.push({ id: "heat-hi", level: "critical", text: `Total heat ${heatPct.toFixed(1)}% — sab stops ek saath lage to equity ka ${heatPct.toFixed(0)}% chala jayega.` });
  } else if (heatPct > 6) {
    warnings.push({ id: "heat-mid", level: "warn", text: `Total heat ${heatPct.toFixed(1)}% hai. 6% se neeche rakhna safe maana jata hai.` });
  }
  if (clusterSide && clusterPct > 4 && live.length > 1) {
    warnings.push({
      id: "cluster",
      level: "warn",
      text: `${clusterPct.toFixed(1)}% risk sirf ${clusterSide === "long" ? "longs" : "shorts"} mein hai. Majors ek saath chalte hain — ye ek hi trade jaisa behave karega.`,
    });
  }
  if (notional / base > 20) {
    warnings.push({ id: "notional", level: "warn", text: `Gross notional ${(notional / base).toFixed(1)}x equity — ek gap poori book ko hila dega.` });
  }

  return {
    count: live.length,
    openRisk,
    heatPct,
    longRisk,
    shortRisk,
    notional,
    grossLeverage: notional / base,
    clusterPct,
    clusterSide,
    warnings,
  };
}

export function listPlans(): SavedPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RISK_PLANS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

function writePlans(plans: SavedPlan[]): void {
  try {
    window.localStorage.setItem(RISK_PLANS_KEY, JSON.stringify(plans));
  } catch {
    // private mode — plan sirf is session mein rahega
  }
  window.dispatchEvent(new Event(RISK_PLANS_CHANGED));
}

export function savePlan(plan: SavedPlan): SavedPlan {
  const all = listPlans();
  const idx = all.findIndex((p) => p.id === plan.id);
  if (idx >= 0) all[idx] = plan;
  else all.unshift(plan);
  writePlans(all);
  return plan;
}

export function deletePlan(id: string): void {
  writePlans(listPlans().filter((p) => p.id !== id));
}

export function setPlanStatus(id: string, status: PlanStatus): void {
  writePlans(listPlans().map((p) => (p.id === id ? { ...p, status } : p)));
}

export function newPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Formatting ─────────────────────────────────────────── */

export function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs < 0.00005) return "$0";
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toFixed(6);
}

export function fmtQty(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (abs >= 1) return n.toFixed(3);
  return n.toFixed(6);
}

/** AI tab ke liye plan ka summary — wahi prompt jo baaki panels bhejte hain. */
export function buildRiskPrompt(input: PlanInput, math: PlanMath, heat: BookHeat): string {
  return [
    `${input.symbol} par ${input.side} trade ka risk review karo.`,
    `Equity ${fmtUsd(input.equity)}, risk ${input.riskPct}% (${fmtUsd(math.riskAmount)}).`,
    `Entry ${fmtNum(input.entry)}, stop ${fmtNum(input.stop)} (${math.stopPct.toFixed(2)}% door), size ${fmtQty(math.qty)} units = ${fmtUsd(math.notional)} notional at ${input.leverage}x.`,
    math.liqPrice != null
      ? `Liquidation ${fmtNum(math.liqPrice)} (${math.liqDistancePct?.toFixed(2)}% door)${math.liqBeforeStop ? " — ye stop se pehle lagti hai." : "."}`
      : "",
    `Fees + funding ${fmtUsd(math.totalCost)}, breakeven ${fmtNum(math.breakeven)}.`,
    math.ladder.length
      ? `Targets: ${math.ladder.map((l) => `${l.r}R @ ${fmtNum(l.price)}`).join(", ")}.`
      : "",
    heat.count > 0 ? `Book mein ${heat.count} trades, total heat ${heat.heatPct.toFixed(1)}%.` : "",
    "Position sizing, liquidation buffer aur targets par feedback do.",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface RiskSweepPoint {
  riskPct: number;
  ruinProb: number;
  medianFinal: number;
  medianMaxDD: number;
}

/**
 * Wahi edge, alag-alag risk % — sizing ka asar sabse saaf yahin dikhta hai.
 *
 * Har row *wahi* seed use karti hai (common random numbers): matlab sab rows ko
 * bilkul ek jaisi win/loss sequence milti hai, isliye rows ka farq sirf sizing
 * ka hota hai, sampling luck ka nahi. Iska ek aur fayda — user ke apne risk %
 * wali row headline simulation se hu-ba-hu match karti hai.
 */
export function sweepRisk(base: Omit<SimInput, "riskPct">, riskPcts: number[]): RiskSweepPoint[] {
  const trades = Math.max(1, Math.min(500, Math.round(base.trades)));
  const runs = Math.max(50, Math.min(5000, Math.round(base.runs)));
  const ruinLevel = (base.equity * base.ruinPct) / 100;

  return riskPcts.map((riskPct) => {
    const rand = rng(base.seed || 1);
    const risk = riskPct / 100;
    const finals: number[] = [];
    const dds: number[] = [];
    let ruined = 0;

    for (let r = 0; r < runs; r++) {
      let eq = base.equity;
      let peak = eq;
      let maxDD = 0;
      for (let t = 0; t < trades; t++) {
        const stake = eq * risk;
        eq += rand() * 100 < base.winRate ? stake * base.rr : -stake;
        if (eq > peak) peak = eq;
        const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
        if (eq <= ruinLevel) {
          eq = ruinLevel;
          ruined++;
          break;
        }
      }
      finals.push(eq);
      dds.push(maxDD);
    }

    finals.sort((a, b) => a - b);
    dds.sort((a, b) => a - b);
    return {
      riskPct,
      ruinProb: (ruined / runs) * 100,
      medianFinal: percentile(finals, 0.5),
      medianMaxDD: percentile(dds, 0.5),
    };
  });
}

/** SavedPlan se sirf wo fields jo planner edit karta hai (id/status/note chhod kar). */
export function toPlanInput(plan: SavedPlan): PlanInput {
  return {
    symbol: plan.symbol,
    side: plan.side,
    equity: plan.equity,
    riskPct: plan.riskPct,
    entry: plan.entry,
    stop: plan.stop,
    leverage: plan.leverage,
    feePct: plan.feePct,
    maintMarginPct: plan.maintMarginPct,
    fundingPct: plan.fundingPct,
    fundingIntervalHours: plan.fundingIntervalHours,
    holdHours: plan.holdHours,
    targetsR: [...plan.targetsR],
  };
}
