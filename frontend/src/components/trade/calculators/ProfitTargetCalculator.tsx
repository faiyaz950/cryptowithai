"use client";

import { useMemo, useState } from "react";
import { Crosshair, SlidersHorizontal, Target } from "lucide-react";
import { computeProfitTarget, type Side } from "@/lib/calculators/profitTarget";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  DirectionToggle,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Optional,
  Pill,
  PriceRuler,
  SectionTitle,
  SideBadge,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as Side,
  investment: "1000",
  entry: "100",
  targetPrice: "130",
  feePct: "0.1",
};

const SCENARIOS = [
  { label: "+30% Long ($100 → $130)", side: "long" as Side, entry: "100", target: "130", inv: "1000" },
  { label: "+50% Breakout ($100 → $150)", side: "long" as Side, entry: "100", target: "150", inv: "1000" },
  { label: "-20% Short ($100 → $80)", side: "short" as Side, entry: "100", target: "80", inv: "1000" },
  { label: "BTC Target ($65k → $85k)", side: "long" as Side, entry: "65000", target: "85000", inv: "5000" },
];

export default function ProfitTargetCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [investment, setInvestment] = useState(DEFAULTS.investment);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [targetPrice, setTargetPrice] = useState(DEFAULTS.targetPrice);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);

  const n = {
    investment: toNum(investment),
    entry: toNum(entry),
    targetPrice: toNum(targetPrice),
    feePct: toNum(feePct, 0.1),
  };

  const outcome = useMemo(
    () =>
      computeProfitTarget({
        side,
        investment: n.investment,
        entry: n.entry,
        targetPrice: n.targetPrice,
        feePct: n.feePct,
      }),
    [side, n.investment, n.entry, n.targetPrice, n.feePct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setInvestment(DEFAULTS.investment);
    setEntry(DEFAULTS.entry);
    setTargetPrice(DEFAULTS.targetPrice);
    setFeePct(DEFAULTS.feePct);
  };

  const bad = {
    investment: investment !== "" && !(n.investment > 0),
    entry: entry !== "" && !(n.entry > 0),
    targetPrice:
      targetPrice !== "" &&
      (!(n.targetPrice > 0) ||
        (side === "long" ? n.targetPrice <= n.entry : n.targetPrice >= n.entry)),
    feePct: feePct !== "" && !(n.feePct >= 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />

      <Field
        label="Investment Amount"
        hint="Kul lagaya gaya capital ($ / ₹)"
        value={investment}
        onChange={setInvestment}
        prefix="$"
        min={0}
        invalid={bad.investment}
      />

      <Field
        label="Entry Price"
        hint="Jis price par buy ya short kiya"
        value={entry}
        onChange={setEntry}
        prefix="$"
        min={0}
        invalid={bad.entry}
      />

      <Field
        label="Target Price"
        hint={side === "long" ? "Entry se upar ka profit target" : "Entry se neeche ka profit target"}
        value={targetPrice}
        onChange={setTargetPrice}
        prefix="$"
        min={0}
        invalid={bad.targetPrice}
      />

      <Chips
        options={SCENARIOS.map((s) => s.label)}
        value={
          SCENARIOS.find(
            (s) =>
              s.side === side &&
              s.entry === entry &&
              s.target === targetPrice &&
              s.inv === investment,
          )?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SCENARIOS.find((s) => s.label === lbl);
          if (match) {
            setSide(match.side);
            setEntry(match.entry);
            setTargetPrice(match.target);
            setInvestment(match.inv);
          }
        }}
        label="Target scenarios"
      />

      <Optional>
        <Field
          label="Trading Fee % (per side)"
          hint="Exchange fee rate (default: 0.10%)"
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

  const heroTone: "up" | "down" | "flat" = res
    ? res.netProfit > 0
      ? "up"
      : res.netProfit < 0
      ? "down"
      : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Target}>
      Investment amount, entry price aur target price enter karein — expected profit aur ROI live calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label="Estimated Net Profit"
        value={fmtSigned(res.netProfit)}
        tone={heroTone}
        sub={
          <>
            <SideBadge side={res.side} />
            <Pill tone={heroTone}>
              ROI: {res.roiPct >= 0 ? "+" : ""}
              {res.roiPct.toFixed(2)}%
            </Pill>
            <span>Target Value: {fmtMoney(res.targetValue)}</span>
          </>
        }
      />

      {/* Target Price Ruler */}
      <SectionTitle>Price Levels</SectionTitle>
      <PriceRuler
        stop={res.entry * (res.side === "long" ? 0.95 : 1.05)}
        entry={res.entry}
        target={res.targetPrice}
        fmt={fmtMoney}
      />

      {/* Notice with Move % */}
      <Notice kind="info">
        <span>
          <strong>Target Projection:</strong> Agar price <strong>{fmtMoney(res.entry)}</strong> se{" "}
          <strong className="text-cyan-400">+{res.priceMovePct.toFixed(2)}% move</strong> karke{" "}
          <strong>{fmtMoney(res.targetPrice)}</strong> hit karta hai, toh aapko{" "}
          <strong className="text-emerald-400">+{fmtMoney(res.netProfit)} net profit</strong> milega (Fees deduction: {fmtMoney(res.totalFees)}).
        </span>
      </Notice>

      {/* Breakdown Flow */}
      <SectionTitle>Capital & Profit Flow</SectionTitle>
      <Flow
        rows={[
          { label: "Initial Investment", value: res.investment, text: fmtMoney(res.investment) },
          { label: "Target Position Value", value: res.targetValue, text: fmtMoney(res.targetValue) },
          { label: "Gross Profit", value: res.grossProfit, text: fmtSigned(res.grossProfit) },
          ...(res.totalFees > 0
            ? [{ label: "Trading Fees", value: -res.totalFees, text: `-${fmtMoney(res.totalFees)}` }]
            : []),
          { label: "Net Profit", value: res.netProfit, text: fmtSigned(res.netProfit), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Target Position Value", value: fmtMoney(res.targetValue), tone: "up" as const },
          { label: "Expected Gross Profit", value: fmtSigned(res.grossProfit), tone: "up" as const },
          { label: "Estimated Net Profit", value: fmtSigned(res.netProfit), tone: "up" as const },
          {
            label: "Net ROI %",
            value: `${res.roiPct >= 0 ? "+" : ""}${res.roiPct.toFixed(2)}%`,
            tone: "up" as const,
          },
          { label: "Coin Quantity", value: `${fmtQty(res.quantity)} coins` },
          { label: "Total Estimated Fees", value: fmtMoney(res.totalFees) },
          { label: "Price Move % Required", value: `+${res.priceMovePct.toFixed(2)}%` },
          { label: "Break-even Price", value: fmtMoney(res.breakevenPrice) },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Coin Quantity",
            math: `Quantity = Investment ÷ Entry Price = ${fmtMoney(res.investment)} ÷ ${fmtMoney(res.entry)} = ${fmtQty(res.quantity)} coins`,
          },
          {
            title: "2. Gross Profit",
            math: `Gross Profit = (${fmtMoney(res.targetPrice)} − ${fmtMoney(res.entry)}) × ${fmtQty(res.quantity)} = ${fmtSigned(res.grossProfit)}`,
          },
          {
            title: "3. Net Profit & ROI",
            math: `Net Profit = ${fmtSigned(res.grossProfit)} − ${fmtMoney(res.totalFees)} (Fees) = ${fmtSigned(res.netProfit)} | ROI = (${fmtSigned(res.netProfit)} ÷ ${fmtMoney(res.investment)}) × 100 = ${res.roiPct.toFixed(2)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Target Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Profit Target Result"
      resultIcon={Target}
      badge={<Pill tone={heroTone}>{res ? `+${res.roiPct.toFixed(1)}% ROI` : "Target"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Net Target Profit",
              value: fmtSigned(res.netProfit),
              sub: `ROI: +${res.roiPct.toFixed(1)}% · Target: ${fmtMoney(res.targetPrice)}`,
              tone: heroTone,
            }
          : null
      }
      note="Profit target projections entry aur target levels par based hain. Market orders aur slippage se actual realized profit minor vary kar sakta hai. Trading advice nahi."
    />
  );
}
