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
    notes: "Under Section 115BBH: flat 30% tax + 4% cess = 31.2%. Only cost of acquisition is deductible (fees/losses cannot offset). Section 194S: 1% TDS.",
  },
  usa_short: {
    id: "usa_short",
    name: "USA Short-Term (< 1 Year, Ordinary Income ~24%)",
    ratePct: 24.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "Holdings under 1 year are typically taxed as ordinary income (often 22%–37%). Trading fees are deductible and capital losses may offset gains.",
  },
  usa_long: {
    id: "usa_long",
    name: "USA Long-Term (> 1 Year, 15% / 20%)",
    ratePct: 15.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "Holdings over 1 year may qualify for LTCG rates (0%, 15%, or 20%). Fees are deductible.",
  },
  custom: {
    id: "custom",
    name: "Custom Tax Rate",
    ratePct: 20.0,
    tdsPct: 0.0,
    allowFeeDeduction: true,
    allowLossOffset: true,
    notes: "Enter the tax rate for your country or custom bracket.",
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

  if (purchaseCost < 0) return { ok: false, error: "Purchase cost cannot be negative." };
  if (saleValue < 0) return { ok: false, error: "Sale value cannot be negative." };

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
