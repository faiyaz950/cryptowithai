"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, Layers, SlidersHorizontal, TrendingDown } from "lucide-react";
import { computeAverageDown } from "@/lib/calculators/averageDown";
import { fmtMoney, fmtNum, fmtQty, toNum } from "@/lib/calculators/format";
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
  existingQuantity: "10",
  existingAveragePrice: "100",
  additionalInvestment: "1000",
  newPurchasePrice: "60",
  feePct: "0.1",
};

const SCENARIOS = [
  { label: "$100 → $60 (-40% dip)", qty: "10", avg: "100", addInv: "1000", newPrice: "60" },
  { label: "BTC Dip ($68k → $54k)", qty: "0.5", avg: "68000", addInv: "25000", newPrice: "54000" },
  { label: "ETH Dip ($3800 → $2800)", qty: "5", avg: "3800", addInv: "10000", newPrice: "2800" },
  { label: "Double Down ($100 → $50)", qty: "10", avg: "100", addInv: "2000", newPrice: "50" },
];

export default function AverageDownCalculator() {
  const [existingQuantity, setExistingQuantity] = useState(DEFAULTS.existingQuantity);
  const [existingAveragePrice, setExistingAveragePrice] = useState(DEFAULTS.existingAveragePrice);
  const [additionalInvestment, setAdditionalInvestment] = useState(DEFAULTS.additionalInvestment);
  const [newPurchasePrice, setNewPurchasePrice] = useState(DEFAULTS.newPurchasePrice);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);

  const n = {
    existingQuantity: toNum(existingQuantity),
    existingAveragePrice: toNum(existingAveragePrice),
    additionalInvestment: toNum(additionalInvestment),
    newPurchasePrice: toNum(newPurchasePrice),
    feePct: toNum(feePct, 0.1),
  };

  const outcome = useMemo(
    () =>
      computeAverageDown({
        existingQuantity: n.existingQuantity,
        existingAveragePrice: n.existingAveragePrice,
        additionalInvestment: n.additionalInvestment,
        newPurchasePrice: n.newPurchasePrice,
        feePct: n.feePct,
      }),
    [n.existingQuantity, n.existingAveragePrice, n.additionalInvestment, n.newPurchasePrice, n.feePct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setExistingQuantity(DEFAULTS.existingQuantity);
    setExistingAveragePrice(DEFAULTS.existingAveragePrice);
    setAdditionalInvestment(DEFAULTS.additionalInvestment);
    setNewPurchasePrice(DEFAULTS.newPurchasePrice);
    setFeePct(DEFAULTS.feePct);
  };

  const bad = {
    existingQuantity: existingQuantity !== "" && !(n.existingQuantity > 0),
    existingAveragePrice: existingAveragePrice !== "" && !(n.existingAveragePrice > 0),
    additionalInvestment: additionalInvestment !== "" && !(n.additionalInvestment > 0),
    newPurchasePrice: newPurchasePrice !== "" && !(n.newPurchasePrice > 0),
    feePct: feePct !== "" && !(n.feePct >= 0),
  };

  const inputs = (
    <>
      <Field
        label="Existing Coin Quantity"
        hint="Pehle se hold ki gayi coins ki sankhya"
        value={existingQuantity}
        onChange={setExistingQuantity}
        min={0.000001}
        invalid={bad.existingQuantity}
      />

      <Field
        label="Existing Average Buy Price"
        hint="Current holding ka average purchase price ($)"
        value={existingAveragePrice}
        onChange={setExistingAveragePrice}
        prefix="$"
        min={0}
        invalid={bad.existingAveragePrice}
      />

      <Field
        label="Additional Investment Amount"
        hint="Dip par kitna aur naya capital lagana hai ($)"
        value={additionalInvestment}
        onChange={setAdditionalInvestment}
        prefix="$"
        min={1}
        invalid={bad.additionalInvestment}
      />

      <Field
        label="New Purchase Price"
        hint="Current dip / market purchase price ($)"
        value={newPurchasePrice}
        onChange={setNewPurchasePrice}
        prefix="$"
        min={0}
        invalid={bad.newPurchasePrice}
      />

      <Chips
        options={SCENARIOS.map((s) => s.label)}
        value={
          SCENARIOS.find(
            (s) =>
              s.qty === existingQuantity &&
              s.avg === existingAveragePrice &&
              s.addInv === additionalInvestment &&
              s.newPrice === newPurchasePrice,
          )?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SCENARIOS.find((s) => s.label === lbl);
          if (match) {
            setExistingQuantity(match.qty);
            setExistingAveragePrice(match.avg);
            setAdditionalInvestment(match.addInv);
            setNewPurchasePrice(match.newPrice);
          }
        }}
        label="Dip scenarios"
      />

      <Optional>
        <Field
          label="Trading Fee %"
          hint="Exchange trading fee % (default: 0.10%)"
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
          optional
          placeholder="0.10"
          invalid={bad.feePct}
        />
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={ArrowDownRight}>
      Existing holdings aur additional investment details enter karein — new average entry price aur breakeven live calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label="New Average Entry Price"
        value={fmtMoney(res.newAveragePrice)}
        tone="up"
        sub={
          <>
            <Pill tone="up">
              Avg Reduced: -{res.averagePriceDropPct.toFixed(1)}%
            </Pill>
            <span>Total Coins: {fmtQty(res.totalQuantity)}</span>
          </>
        }
      />

      {/* Critical Averaging Down Risk Warning (Spec Requirement) */}
      <Notice kind="warn">
        <span>
          <strong>Capital Risk Warning:</strong> Averaging down se aapki entry price zaroor neeche aati hai, lekin{" "}
          <strong>total capital at risk badh jata hai</strong> (Total Invested:{" "}
          <strong className="text-amber-300">{fmtMoney(res.totalInvestment)}</strong>).
          Agar market aur neeche girti hai toh losses tezi se multiply ho sakte hain. Sirf strong fundamentals wale assets par strict portfolio limits ke andar karein.
        </span>
      </Notice>

      {/* Break-even Edge Notice */}
      <Notice kind="info">
        <span>
          <strong>Breakeven Advantage:</strong> Pehle break-even ke liye market ko{" "}
          <strong>+{res.requiredGainWithoutAveraging.toFixed(1)}%</strong> pump karna padta. Naye purchase ke baad sirf{" "}
          <strong className="text-cyan-400">+{res.requiredGainFromNewPriceToBreakeven.toFixed(1)}% gain</strong> par aapka poora portfolio zero-loss / break-even ho jayega.
        </span>
      </Notice>

      {/* Breakdown Flow */}
      <SectionTitle>Capital Allocation Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: "Existing Capital Invested", value: res.existingCost, text: fmtMoney(res.existingCost) },
          { label: "Additional Capital Added", value: res.additionalInvestment, text: fmtMoney(res.additionalInvestment) },
          { label: "Total Capital Committed", value: res.totalInvestment, text: fmtMoney(res.totalInvestment), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "New Average Entry", value: fmtMoney(res.newAveragePrice), tone: "up" as const },
          { label: "Existing Average Price", value: fmtMoney(res.existingAveragePrice) },
          { label: "New Purchase Price", value: fmtMoney(res.newPurchasePrice) },
          { label: "Additional Coins Acquired", value: `+${fmtQty(res.additionalQuantity)} coins`, tone: "up" as const },
          { label: "Total Coins in Holding", value: `${fmtQty(res.totalQuantity)} coins` },
          { label: "Total Investment Committed", value: fmtMoney(res.totalInvestment) },
          { label: "Average Entry Reduction", value: `-${res.averagePriceDropPct.toFixed(2)}%`, tone: "up" as const },
          { label: "Break-even Price (with fee)", value: fmtMoney(res.breakevenPrice) },
          {
            label: "Gain Needed from Dip to Break Even",
            value: `+${res.requiredGainFromNewPriceToBreakeven.toFixed(1)}%`,
            tone: "up" as const,
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Additional Coins Bought",
            math: `Additional Coins = Additional Capital ÷ New Price = ${fmtMoney(res.additionalInvestment)} ÷ ${fmtMoney(res.newPurchasePrice)} = ${fmtQty(res.additionalQuantity)} coins`,
          },
          {
            title: "2. Total Cost & Quantity",
            math: `Total Cost = ${fmtMoney(res.existingCost)} + ${fmtMoney(res.additionalInvestment)} = ${fmtMoney(res.totalInvestment)} | Total Coins = ${fmtQty(res.totalQuantity)} coins`,
          },
          {
            title: "3. New Average Entry Price",
            math: `New Average = Total Cost ÷ Total Coins = ${fmtMoney(res.totalInvestment)} ÷ ${fmtQty(res.totalQuantity)} = ${fmtMoney(res.newAveragePrice)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Holdings & Purchase Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Average Down Analytics"
      resultIcon={Layers}
      badge={<Pill tone="up">{res ? `Avg: ${fmtMoney(res.newAveragePrice)}` : "Average Down"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "New Avg Entry",
              value: fmtMoney(res.newAveragePrice),
              sub: `Drop: -${res.averagePriceDropPct.toFixed(1)}% · Total: ${fmtMoney(res.totalInvestment)}`,
              tone: "up",
            }
          : null
      }
      note="Averaging down position ke average entry price ko kam karta hai, par portfolio exposure ko badhata hai. Spot assets par hi karein; high-leverage futures par averaging down liquidation risk ko barha deta hai. Trading advice nahi."
    />
  );
}
