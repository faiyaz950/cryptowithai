/**
 * Crypto Tax Estimator — pure math and jurisdiction rules.
 *
 * Inputs:
 * - Purchase Cost
 * - Sale Value
 * - Eligible Fees
 * - Tax Jurisdiction (India VDA, USA Short/Long, Custom)
 *
 * Logic:
 *   Estimated Gain = Sale Value - Purchase Cost - Eligible Costs
 *   Estimated Tax  = Taxable Gain × Applicable Tax Rate
 *   After-Tax      = Sale Value - Estimated Tax - Eligible Fees - TDS
 */

export type TaxJurisdiction = "india" | "usa_short" | "usa_long" | "custom";

export interface JurisdictionProfile {
  id: TaxJurisdiction;
  name: string;
  ratePct: number;
  tdsPct: number;
  allowFeeDeduction: boolean;
  allowLossOffset: boolean;
  notes: string;
}

export const JURISDICTIONS: Record<TaxJurisdiction, JurisdictionProfile> = {
  india: {
    id: "india",
    name: "India (VDA flat 30% + 4% cess + 1% TDS)",
    ratePct: 31.2, // 30% + 4% health & education cess
    tdsPct: 1.0,  // Section 194S 1% TDS on sale turnover
    allowFeeDeduction: false, // Under Sec 115BBH, no deduction except cost of acquisition
    allowLossOffset: false,   // Losses cannot be set off against any other income
    notes: "Section 115BBH ke tehat flat 30% tax + 4% cess = 31.2% lagta hai. Sirf cost of acquisition deduct ho sakti hai (fees ya losses offset allow nahi hain). Section 194S ke tehat 1% TDS lagta hai.",
  },
  usa_short: {
    id: "usa_short",
    name: "USA Short-Term (< 1 Year, Ordinary Income ~24%)",
    ratePct: 24.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "1 saal se kam holding period par ordinary income tax bracket apply hota hai (typically 22% - 37%). Trading fees deduct hoti hain aur capital loss offset allow hota hai.",
  },
  usa_long: {
    id: "usa_long",
    name: "USA Long-Term (> 1 Year, 15% / 20%)",
    ratePct: 15.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "1 saal se zyada hold karne par preferential long-term capital gains tax (0%, 15%, ya 20%) lagta hai. Fees deductible hoti hain.",
  },
  custom: {
    id: "custom",
    name: "Custom Tax Rate",
    ratePct: 20.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "Apne desh ya custom bracket ke anusaar tax rate enter karein.",
  },
};

export interface TaxInput {
  purchaseCost: number;
  saleValue: number;
  eligibleFees?: number;
  jurisdiction: TaxJurisdiction;
  customRatePct?: number;
  customTdsPct?: number;
}

export interface TaxResult {
  purchaseCost: number;
  saleValue: number;
  eligibleFees: number;
  jurisdiction: JurisdictionProfile;
  realizedGainLoss: number;
  isGain: boolean;
  deductibleCosts: number;
  taxableGain: number;
  taxRatePct: number;
  estimatedTax: number;
  tdsAmount: number;
  totalTaxLiability: number;
  effectiveTaxRatePct: number;
  afterTaxProceeds: number;
}

export type TaxOutcome = { ok: true; result: TaxResult } | { ok: false; error: string };

export function computeCryptoTax(input: TaxInput): TaxOutcome | null {
  const {
    purchaseCost,
    saleValue,
    eligibleFees: rawFees = 0,
    jurisdiction,
    customRatePct,
    customTdsPct,
  } = input;

  if (!Number.isFinite(purchaseCost) || !Number.isFinite(saleValue)) {
    return null;
  }

  if (purchaseCost < 0) return { ok: false, error: "Purchase cost negative nahi ho sakti." };
  if (saleValue < 0) return { ok: false, error: "Sale value negative nahi ho sakti." };

  const fees = Number.isFinite(rawFees) && rawFees > 0 ? rawFees : 0;
  const profile = JURISDICTIONS[jurisdiction] ?? JURISDICTIONS.india;

  const taxRate =
    jurisdiction === "custom" && Number.isFinite(customRatePct) && (customRatePct as number) >= 0
      ? (customRatePct as number)
      : profile.ratePct;

  const tdsRate =
    jurisdiction === "custom" && Number.isFinite(customTdsPct) && (customTdsPct as number) >= 0
      ? (customTdsPct as number)
      : profile.tdsPct;

  const realizedGainLoss = saleValue - purchaseCost - fees;
  const isGain = realizedGainLoss > 0;

  // In India VDA, only purchase cost is deductible from sale consideration; no fee deduction
  const deductibleFees = profile.allowFeeDeduction ? fees : 0;
  const rawGain = saleValue - purchaseCost - deductibleFees;
  const taxableGain = rawGain > 0 ? rawGain : 0;

  const estimatedTax = taxableGain > 0 ? (taxableGain * taxRate) / 100 : 0;
  const tdsAmount = (saleValue * tdsRate) / 100;
  const totalTaxLiability = estimatedTax + tdsAmount;

  const effectiveTaxRatePct =
    isGain && realizedGainLoss > 0 ? (totalTaxLiability / realizedGainLoss) * 100 : 0;

  const afterTaxProceeds = saleValue - totalTaxLiability - fees;

  return {
    ok: true,
    result: {
      purchaseCost,
      saleValue,
      eligibleFees: fees,
      jurisdiction: profile,
      realizedGainLoss,
      isGain,
      deductibleCosts: purchaseCost + deductibleFees,
      taxableGain,
      taxRatePct: taxRate,
      estimatedTax,
      tdsAmount,
      totalTaxLiability,
      effectiveTaxRatePct,
      afterTaxProceeds,
    },
  };
}
