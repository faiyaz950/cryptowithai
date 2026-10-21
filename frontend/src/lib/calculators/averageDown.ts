/**
 * Average Down Calculator — pure math.
 *
 * Purpose: Price girne par additional purchase karne ke baad average entry price dekhna.
 *
 * Logic:
 *   Existing Cost       = Existing Quantity × Existing Average Price
 *   Additional Quantity = Additional Investment / New Purchase Price
 *   New Average Price   = (Existing Cost + Additional Investment) / (Existing Quantity + Additional Quantity)
 *   Total Investment    = Existing Cost + Additional Investment
 *   Total Quantity      = Existing Quantity + Additional Quantity
 */

export interface AverageDownInput {
  existingQuantity: number;
  existingAveragePrice: number;
  additionalInvestment: number;
  newPurchasePrice: number;
  feePct?: number;
}

export interface AverageDownResult {
  existingQuantity: number;
  existingAveragePrice: number;
  existingCost: number;
  additionalInvestment: number;
  newPurchasePrice: number;
  additionalQuantity: number;
  totalInvestment: number;
  totalQuantity: number;
  newAveragePrice: number;
  breakevenPrice: number;
  averagePriceDropPct: number;
  requiredGainFromNewPriceToBreakeven: number;
  requiredGainWithoutAveraging: number;
}

export type AverageDownOutcome =
  | { ok: true; result: AverageDownResult }
  | { ok: false; error: string };

export function computeAverageDown(input: AverageDownInput): AverageDownOutcome | null {
  const {
    existingQuantity,
    existingAveragePrice,
    additionalInvestment,
    newPurchasePrice,
    feePct = 0.1,
  } = input;

  if (
    !Number.isFinite(existingQuantity) ||
    !Number.isFinite(existingAveragePrice) ||
    !Number.isFinite(additionalInvestment) ||
    !Number.isFinite(newPurchasePrice)
  ) {
    return null;
  }

  if (existingQuantity <= 0) return { ok: false, error: "Existing quantity 0 se badi honi chahiye." };
  if (existingAveragePrice <= 0) return { ok: false, error: "Existing average price 0 se bada hona chahiye." };
  if (additionalInvestment <= 0) return { ok: false, error: "Additional investment 0 se bada hona chahiye." };
  if (newPurchasePrice <= 0) return { ok: false, error: "New purchase price 0 se bada hona chahiye." };

  const existingCost = existingQuantity * existingAveragePrice;
  const additionalQuantity = additionalInvestment / newPurchasePrice;

  const totalInvestment = existingCost + additionalInvestment;
  const totalQuantity = existingQuantity + additionalQuantity;

  const newAveragePrice = totalInvestment / totalQuantity;

  const f = Math.max(0, feePct) / 100;
  // Breakeven accounting for exit fee:
  const breakevenPrice = f < 1 ? newAveragePrice / (1 - f) : newAveragePrice;

  // Percentage drop in average price
  const averagePriceDropPct =
    existingAveragePrice > 0
      ? ((existingAveragePrice - newAveragePrice) / existingAveragePrice) * 100
      : 0;

  // Gain required from new purchase price to reach breakeven
  const requiredGainFromNewPriceToBreakeven =
    newPurchasePrice > 0 ? ((newAveragePrice - newPurchasePrice) / newPurchasePrice) * 100 : 0;

  // Gain required if user had NOT averaged down:
  const requiredGainWithoutAveraging =
    newPurchasePrice > 0 ? ((existingAveragePrice - newPurchasePrice) / newPurchasePrice) * 100 : 0;

  return {
    ok: true,
    result: {
      existingQuantity,
      existingAveragePrice,
      existingCost,
      additionalInvestment,
      newPurchasePrice,
      additionalQuantity,
      totalInvestment,
      totalQuantity,
      newAveragePrice,
      breakevenPrice,
      averagePriceDropPct,
      requiredGainFromNewPriceToBreakeven,
      requiredGainWithoutAveraging,
    },
  };
}
