"use client";

import { useMemo, useState } from "react";
import { FileText, Percent, Receipt, SlidersHorizontal } from "lucide-react";
import { computeCryptoTax, JURISDICTIONS, type TaxJurisdiction } from "@/lib/calculators/tax";
import { fmtMoney, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Optional,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  purchaseCost: "50000",
  saleValue: "80000",
  eligibleFees: "200",
  jurisdiction: "india" as TaxJurisdiction,
  customRatePct: "20",
  customTdsPct: "1",
};

export default function TaxCalculator() {
  const [purchaseCost, setPurchaseCost] = useState(DEFAULTS.purchaseCost);
  const [saleValue, setSaleValue] = useState(DEFAULTS.saleValue);
  const [eligibleFees, setEligibleFees] = useState(DEFAULTS.eligibleFees);
  const [jurisdiction, setJurisdiction] = useState<TaxJurisdiction>(DEFAULTS.jurisdiction);
  const [customRatePct, setCustomRatePct] = useState(DEFAULTS.customRatePct);
  const [customTdsPct, setCustomTdsPct] = useState(DEFAULTS.customTdsPct);

  const n = {
    purchaseCost: toNum(purchaseCost),
    saleValue: toNum(saleValue),
    eligibleFees: toNum(eligibleFees, 0),
    customRatePct: toNum(customRatePct, 20),
    customTdsPct: toNum(customTdsPct, 0),
  };

  const outcome = useMemo(
    () =>
      computeCryptoTax({
        purchaseCost: n.purchaseCost,
        saleValue: n.saleValue,
        eligibleFees: n.eligibleFees,
        jurisdiction,
        customRatePct: n.customRatePct,
        customTdsPct: n.customTdsPct,
      }),
    [n.purchaseCost, n.saleValue, n.eligibleFees, jurisdiction, n.customRatePct, n.customTdsPct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setPurchaseCost(DEFAULTS.purchaseCost);
    setSaleValue(DEFAULTS.saleValue);
    setEligibleFees(DEFAULTS.eligibleFees);
    setJurisdiction(DEFAULTS.jurisdiction);
    setCustomRatePct(DEFAULTS.customRatePct);
    setCustomTdsPct(DEFAULTS.customTdsPct);
  };

  const bad = {
    purchaseCost: purchaseCost !== "" && !(n.purchaseCost >= 0),
    saleValue: saleValue !== "" && !(n.saleValue >= 0),
    eligibleFees: eligibleFees !== "" && !(n.eligibleFees >= 0),
  };

  const inputs = (
    <>
      <div className="cx-field">
        <label className="cx-label">Tax Jurisdiction / Regime</label>
        <div className="grid grid-cols-1 gap-1.5">
          {(Object.keys(JURISDICTIONS) as TaxJurisdiction[]).map((jId) => (
            <button
              key={jId}
              type="button"
              className={`text-left p-2.5 rounded-lg text-xs font-medium border transition-colors ${
                jurisdiction === jId
                  ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setJurisdiction(jId)}
            >
              <div className="font-semibold text-white">{JURISDICTIONS[jId].name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                {JURISDICTIONS[jId].notes}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Purchase Cost (Cost of Acquisition)"
        hint="Original buy amount ($ / ₹)"
        value={purchaseCost}
        onChange={setPurchaseCost}
        prefix="$"
        min={0}
        invalid={bad.purchaseCost}
      />

      <Field
        label="Sale Value (Sale Consideration)"
        hint="Total selling price / turnover ($ / ₹)"
        value={saleValue}
        onChange={setSaleValue}
        prefix="$"
        min={0}
        invalid={bad.saleValue}
      />

      <Field
        label="Eligible Transfer & Gas Fees"
        hint="Brokerage, network gas ya exchange fee ($ / ₹)"
        value={eligibleFees}
        onChange={setEligibleFees}
        prefix="$"
        min={0}
        invalid={bad.eligibleFees}
      />

      {jurisdiction === "custom" && (
        <div className="cx-row-2">
          <Field
            label="Custom Tax Rate %"
            value={customRatePct}
            onChange={setCustomRatePct}
            suffix="%"
            min={0}
          />
          <Field
            label="TDS / Withholding %"
            value={customTdsPct}
            onChange={setCustomTdsPct}
            suffix="%"
            min={0}
          />
        </div>
      )}
    </>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.isGain
      ? "up"
      : "down"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Receipt}>
      Purchase cost, sale value aur jurisdiction select karein — taxable gain aur estimated tax liability live dikhegi.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label="Estimated Tax Liability"
        value={fmtMoney(res.totalTaxLiability)}
        tone={res.totalTaxLiability > 0 ? "down" : "flat"}
        sub={
          <>
            <Pill tone={res.isGain ? "up" : "down"}>
              Realized Gain: {fmtSigned(res.realizedGainLoss)}
            </Pill>
            <span>After-Tax Proceeds: {fmtMoney(res.afterTaxProceeds)}</span>
          </>
        }
      />

      {/* Jurisdiction Guidance Notice */}
      <Notice kind={jurisdiction === "india" ? "warn" : "info"}>
        <span>
          <strong>{res.jurisdiction.name}:</strong>{" "}
          {jurisdiction === "india" ? (
            <span>
              India mein 1 April 2022 se Virtual Digital Assets (VDA) par <strong>flat 30% tax + 4% cess (31.2%)</strong> lagta hai. Section 115BBH ke anusaar <strong>losses kisi bhi doosre profit se set-off nahi ho sakte</strong>, aur sirf actual cost of acquisition deduct ho sakti hai. Saath hi Section 194S ke tehat <strong>1% TDS</strong> kata jata hai.
            </span>
          ) : (
            <span>{res.jurisdiction.notes}</span>
          )}
        </span>
      </Notice>

      {/* Breakdown Flow */}
      <SectionTitle>Proceeds & Tax Waterfall</SectionTitle>
      <Flow
        rows={[
          { label: "Gross Sale Consideration", value: res.saleValue, text: fmtMoney(res.saleValue) },
          { label: "Purchase Cost Basis", value: -res.purchaseCost, text: `-${fmtMoney(res.purchaseCost)}` },
          ...(res.estimatedTax > 0
            ? [{ label: `Income Tax (${res.taxRatePct}%)`, value: -res.estimatedTax, text: `-${fmtMoney(res.estimatedTax)}` }]
            : []),
          ...(res.tdsAmount > 0
            ? [{ label: "1% TDS Withholding", value: -res.tdsAmount, text: `-${fmtMoney(res.tdsAmount)}` }]
            : []),
          { label: "Net After-Tax Proceeds", value: res.afterTaxProceeds, text: fmtMoney(res.afterTaxProceeds), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Realized Net Gain/Loss", value: fmtSigned(res.realizedGainLoss), tone: res.isGain ? ("up" as const) : ("down" as const) },
          { label: "Taxable Gain Amount", value: fmtMoney(res.taxableGain), tone: "down" as const },
          { label: "Estimated Income Tax", value: fmtMoney(res.estimatedTax), tone: "down" as const },
          { label: "TDS Amount", value: fmtMoney(res.tdsAmount) },
          { label: "Total Tax + TDS", value: fmtMoney(res.totalTaxLiability), tone: "down" as const },
          { label: "Effective Tax Rate %", value: `${res.effectiveTaxRatePct.toFixed(1)}%` },
          { label: "Net After-Tax Proceeds", value: fmtMoney(res.afterTaxProceeds), tone: "up" as const },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Taxable Gain Calculation",
            math: `Taxable Gain = Sale Consideration (${fmtMoney(res.saleValue)}) − Deductible Cost (${fmtMoney(res.deductibleCosts)}) = ${fmtMoney(res.taxableGain)}`,
          },
          {
            title: "2. Tax Liability",
            math: `Tax = ${fmtMoney(res.taxableGain)} × ${res.taxRatePct}% = ${fmtMoney(res.estimatedTax)} | TDS = ${fmtMoney(res.saleValue)} × 1% = ${fmtMoney(res.tdsAmount)}`,
          },
          {
            title: "3. After-Tax Proceeds",
            math: `After-Tax = Sale (${fmtMoney(res.saleValue)}) − Tax (${fmtMoney(res.totalTaxLiability)}) − Fees (${fmtMoney(res.eligibleFees)}) = ${fmtMoney(res.afterTaxProceeds)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Tax Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Tax Estimate Result"
      resultIcon={FileText}
      badge={<Pill tone={res?.isGain ? "up" : "flat"}>{res ? `Tax: ${fmtMoney(res.totalTaxLiability)}` : "Tax Estimator"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Estimated Tax",
              value: fmtMoney(res.totalTaxLiability),
              sub: `Gain: ${fmtSigned(res.realizedGainLoss)} · Net: ${fmtMoney(res.afterTaxProceeds)}`,
              tone: "down",
            }
          : null
      }
      note="Yeh calculator sirf illustrative tax estimations ke liye hai. Exact tax filing ke liye chartered accountant ya tax consultant se verify karein. Tax advice nahi."
    />
  );
}
