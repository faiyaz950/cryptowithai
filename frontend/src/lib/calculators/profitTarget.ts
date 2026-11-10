/**
 * Profit Target Calculator — pure math.
 *
 * Purpose: Target price par kitna profit ho sakta hai, calculate karna.
 *
 * Inputs:
 * - Investment Amount
 * - Entry Price
 * - Target Price
 * - Long / Short
 * - Fees %
 *
 * Logic (Spot / Long):
 *   Quantity = Investment / Entry Price
 *   Gross Profit = (Target Price - Entry Price) × Quantity
 *   Net Profit = Gross Profit - Trading Fees
 *   ROI % = Net Profit / Investment × 100
 */

export type Side = "long" | "short";

export interface ProfitTargetInput {
  side: Side;
  investment: number;
  entry: number;
  targetPrice: number;
  feePct?: number; // per side %, default 0.1%
}

export interface ProfitTargetResult {
  side: Side;
  investment: number;
  entry: number;
  targetPrice: number;
  quantity: number;
  targetValue: number;
  grossProfit: number;
  grossRoiPct: number;
  entryFee: number;
  exitFee: number;
  totalFees: number;
  netProfit: number;
  roiPct: number;
  priceMovePct: number;
  breakevenPrice: number;
}

export type ProfitTargetOutcome =
  | { ok: true; result: ProfitTargetResult }
  | { ok: false; error: string };

export function computeProfitTarget(input: ProfitTargetInput): ProfitTargetOutcome | null {
  const { side, investment, entry, targetPrice, feePct = 0.1 } = input;

  if (
    !Number.isFinite(investment) ||
    !Number.isFinite(entry) ||
    !Number.isFinite(targetPrice)
  ) {
    return null;
  }

  if (investment <= 0) return { ok: false, error: "Investment amount must be greater than 0." };
  if (entry <= 0) return { ok: false, error: "Entry price must be greater than 0." };
  if (targetPrice <= 0) return { ok: false, error: "Target price must be greater than 0." };

  if (side === "long" && targetPrice <= entry) {
    return { ok: false, error: "For a long, target price must be above entry." };
  }
  if (side === "short" && targetPrice >= entry) {
    return { ok: false, error: "For a short, target price must be below entry." };
  }

  const quantity = investment / entry;
  const targetValue = quantity * targetPrice;

  const dir = side === "long" ? 1 : -1;
  const grossProfit = (targetPrice - entry) * quantity * dir;
  const grossRoiPct = (grossProfit / investment) * 100;

  const f = Math.max(0, feePct) / 100;
  const entryFee = investment * f;
  const exitFee = targetValue * f;
  const totalFees = entryFee + exitFee;

  const netProfit = grossProfit - totalFees;
  const roiPct = (netProfit / investment) * 100;

  const priceMovePct = Math.abs((targetPrice - entry) / entry) * 100;

  // Breakeven price including fees
  const breakevenPrice =
    side === "long"
      ? (entry * (1 + f)) / (1 - f)
      : (entry * (1 - f)) / (1 + f);

  return {
    ok: true,
    result: {
      side,
      investment,
      entry,
      targetPrice,
      quantity,
      targetValue,
      grossProfit,
      grossRoiPct,
      entryFee,
      exitFee,
      totalFees,
      netProfit,
      roiPct,
      priceMovePct,
      breakevenPrice,
    },
  };
}
