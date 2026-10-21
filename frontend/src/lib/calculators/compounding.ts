/**
 * Compounding Calculator — Pure Math Engine.
 *
 *   Simple Compound:
 *     FV = P(1 + r)^n
 *
 *   With Periodic Contributions:
 *     FV = P(1 + r)^n + C × [((1 + r)^n − 1) / r]
 *
 * Where:
 *   P = Initial Capital
 *   C = Periodic Contribution
 *   r = Periodic return rate
 *   n = Number of periods
 */

export type CompoundFrequency = "daily" | "monthly" | "annually";

export interface CompoundYearMilestone {
  year: number;
  deposits: number;
  interest: number;
  totalValue: number;
}

export interface CompoundInput {
  initialCapital: number;
  periodicContribution: number;
  expectedReturnPct: number; // Annual rate %, e.g. 10
  frequency: CompoundFrequency;
  durationYears: number; // in years
}

export interface CompoundResult {
  initialCapital: number;
  periodicContribution: number;
  expectedReturnPct: number;
  frequency: CompoundFrequency;
  durationYears: number;
  totalPeriods: number;
  periodicRate: number;
  futureValue: number;
  totalDeposited: number;
  totalInterest: number;
  interestToDepositedRatio: number;
  milestones: CompoundYearMilestone[];
}

export type CompoundOutcome = { ok: true; result: CompoundResult } | { ok: false; error: string };

export function computeCompounding(i: CompoundInput): CompoundOutcome | null {
  const { initialCapital, periodicContribution, expectedReturnPct, frequency, durationYears } = i;

  if (
    ![initialCapital, periodicContribution, expectedReturnPct, durationYears].every(Number.isFinite)
  ) {
    return null;
  }

  if (initialCapital < 0) return { ok: false, error: "Initial capital negative nahi ho sakta." };
  if (periodicContribution < 0) return { ok: false, error: "Contribution negative nahi ho sakti." };
  if (durationYears <= 0) return { ok: false, error: "Duration 0 se zyada honi chahiye." };
  if (durationYears > 50) return { ok: false, error: "Duration maximum 50 saal tak ho sakti hai." };
  if (expectedReturnPct < -90 || expectedReturnPct > 500) {
    return { ok: false, error: "Return rate -90% se 500% ke beech honi chahiye." };
  }

  const periodsPerYear = frequency === "daily" ? 365 : frequency === "monthly" ? 12 : 1;
  const totalPeriods = Math.round(durationYears * periodsPerYear);
  const periodicRate = expectedReturnPct / 100 / periodsPerYear;

  const P = initialCapital;
  const C = periodicContribution;

  const calcFV = (n: number) => {
    if (n === 0) return P;
    if (Math.abs(periodicRate) < 1e-12) {
      return P + C * n;
    }
    const growthFactor = Math.pow(1 + periodicRate, n);
    const initialGrowth = P * growthFactor;
    const annuityGrowth = C * ((growthFactor - 1) / periodicRate);
    return initialGrowth + annuityGrowth;
  };

  const futureValue = calcFV(totalPeriods);
  const totalDeposited = P + C * totalPeriods;
  const totalInterest = futureValue - totalDeposited;
  const interestToDepositedRatio = totalDeposited > 0 ? (totalInterest / totalDeposited) * 100 : 0;

  // Generate annual milestones
  const milestones: CompoundYearMilestone[] = [];
  const yearsRounded = Math.ceil(durationYears);
  for (let y = 1; y <= yearsRounded; y++) {
    const curPeriods = Math.min(totalPeriods, Math.round(y * periodsPerYear));
    const val = calcFV(curPeriods);
    const dep = P + C * curPeriods;
    milestones.push({
      year: y,
      deposits: dep,
      interest: Math.max(0, val - dep),
      totalValue: val,
    });
  }

  return {
    ok: true,
    result: {
      initialCapital: P,
      periodicContribution: C,
      expectedReturnPct,
      frequency,
      durationYears,
      totalPeriods,
      periodicRate,
      futureValue,
      totalDeposited,
      totalInterest,
      interestToDepositedRatio,
      milestones,
    },
  };
}
