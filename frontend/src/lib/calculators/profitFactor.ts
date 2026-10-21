/**
 * Profit Factor Calculator (Backtester / Trading Journal)
 *
 * Formula:
 * Profit Factor = Gross Profit / Gross Loss
 *
 * Example:
 * Gross Profit = ₹50,000
 * Gross Loss = ₹25,000
 * Profit Factor = 2.0
 */

export interface ProfitFactorInput {
  grossProfit: number;
  grossLoss: number;
  winningTrades?: number;
  losingTrades?: number;
}

export type ProfitFactorTier = "unprofitable" | "marginal" | "good" | "excellent" | "undefeated";

export interface ProfitFactorResult {
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  netProfit: number;
  isInfinite: boolean;
  tier: ProfitFactorTier;
  tierLabel: string;
  tierTone: "up" | "down" | "flat" | "warn";
  returnOnLossRatio: number;
  winningTrades?: number;
  losingTrades?: number;
  totalTrades?: number;
  avgWin?: number;
  avgLoss?: number;
  payoffRatio?: number;
  impliedWinRateNeeded?: number;
}

export type ProfitFactorOutcome =
  | { ok: true; result: ProfitFactorResult }
  | { ok: false; error: string };

export function computeProfitFactor(input: ProfitFactorInput): ProfitFactorOutcome | null {
  const { grossProfit, grossLoss, winningTrades, losingTrades } = input;

  if (!Number.isFinite(grossProfit) || !Number.isFinite(grossLoss)) return null;
  if (grossProfit < 0) {
    return { ok: false, error: "Gross Profit negative nahi ho sakta (0 ya usse bada enter karein)." };
  }
  if (grossLoss < 0) {
    return { ok: false, error: "Gross Loss negative nahi ho sakta (0 ya usse bada enter karein)." };
  }
  if (grossProfit === 0 && grossLoss === 0) {
    return { ok: false, error: "Gross Profit aur Gross Loss dono zero nahi ho sakte." };
  }

  const netProfit = grossProfit - grossLoss;
  let profitFactor: number;
  let isInfinite = false;

  if (grossLoss === 0) {
    profitFactor = 999;
    isInfinite = true;
  } else {
    profitFactor = grossProfit / grossLoss;
  }

  let tier: ProfitFactorTier = "good";
  let tierLabel = "Solid Trading System";
  let tierTone: "up" | "down" | "flat" | "warn" = "up";

  if (isInfinite) {
    tier = "undefeated";
    tierLabel = "Undefeated (Zero Losses Recorded)";
    tierTone = "up";
  } else if (profitFactor < 1.0) {
    tier = "unprofitable";
    tierLabel = "Losing Strategy (Negative Expectancy)";
    tierTone = "down";
  } else if (profitFactor < 1.5) {
    tier = "marginal";
    tierLabel = "Marginally Profitable (Fees & slippage may erase gains)";
    tierTone = "warn";
  } else if (profitFactor < 2.0) {
    tier = "good";
    tierLabel = "Solid Trading Strategy";
    tierTone = "up";
  } else {
    tier = "excellent";
    tierLabel = "High-Performance Strategy";
    tierTone = "up";
  }

  const returnOnLossRatio = isInfinite ? 999 : profitFactor - 1;

  let avgWin: number | undefined;
  let avgLoss: number | undefined;
  let payoffRatio: number | undefined;
  let totalTrades: number | undefined;
  let impliedWinRateNeeded: number | undefined;

  const w = winningTrades != null && Number.isFinite(winningTrades) && winningTrades > 0 ? winningTrades : undefined;
  const l = losingTrades != null && Number.isFinite(losingTrades) && losingTrades > 0 ? losingTrades : undefined;

  if (w != null || l != null) {
    totalTrades = (w ?? 0) + (l ?? 0);
  }

  if (w != null && w > 0) {
    avgWin = grossProfit / w;
  }

  if (l != null && l > 0 && grossLoss > 0) {
    avgLoss = grossLoss / l;
  }

  if (avgWin != null && avgLoss != null && avgLoss > 0) {
    payoffRatio = avgWin / avgLoss;
    // Win rate needed to break even with this payoff ratio: 1 / (1 + Payoff)
    impliedWinRateNeeded = (1 / (1 + payoffRatio)) * 100;
  }

  return {
    ok: true,
    result: {
      grossProfit,
      grossLoss,
      profitFactor,
      netProfit,
      isInfinite,
      tier,
      tierLabel,
      tierTone,
      returnOnLossRatio,
      winningTrades: w,
      losingTrades: l,
      totalTrades,
      avgWin,
      avgLoss,
      payoffRatio,
      impliedWinRateNeeded,
    },
  };
}
