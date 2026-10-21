"use client";

import { useMemo, useState } from "react";
import { Activity, Flame, SlidersHorizontal, TrendingUp } from "lucide-react";
import { computeFutures, type Side } from "@/lib/calculators/futures";
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
  SectionTitle,
  SideBadge,
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as Side,
  entry: "100",
  exit: "110",
  margin: "1000",
  leverage: "10",
  feePct: "0.05",
  fundingRatePct: "0.01",
  fundingPeriods: "1",
  mmrPct: "0.5",
};

const LEVERAGE_CHIPS = ["2", "5", "10", "20", "50", "100"];

const SCENARIOS = [
  {
    label: "10× Long (+$10% move)",
    side: "long" as Side,
    entry: "100",
    exit: "110",
    margin: "1000",
    lev: "10",
  },
  {
    label: "20× Short (-$5% move)",
    side: "short" as Side,
    entry: "100",
    exit: "95",
    margin: "500",
    lev: "20",
  },
  {
    label: "50× Scalp (+$2% move)",
    side: "long" as Side,
    entry: "100",
    exit: "102",
    margin: "200",
    lev: "50",
  },
];

export default function FuturesCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [exit, setExit] = useState(DEFAULTS.exit);
  const [margin, setMargin] = useState(DEFAULTS.margin);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [fundingRatePct, setFundingRatePct] = useState(DEFAULTS.fundingRatePct);
  const [fundingPeriods, setFundingPeriods] = useState(DEFAULTS.fundingPeriods);
  const [mmrPct, setMmrPct] = useState(DEFAULTS.mmrPct);

  const n = {
    entry: toNum(entry),
    exit: toNum(exit),
    margin: toNum(margin),
    leverage: toNum(leverage),
    feePct: toNum(feePct, 0.05),
    fundingRatePct: toNum(fundingRatePct, 0),
    fundingPeriods: toNum(fundingPeriods, 1),
    mmrPct: toNum(mmrPct, 0.5),
  };

  const outcome = useMemo(
    () =>
      computeFutures({
        side,
        entry: n.entry,
        exit: n.exit,
        margin: n.margin,
        leverage: n.leverage,
        feePct: n.feePct,
        fundingRatePct: n.fundingRatePct,
        fundingPeriods: n.fundingPeriods,
        mmrPct: n.mmrPct,
      }),
    [side, n.entry, n.exit, n.margin, n.leverage, n.feePct, n.fundingRatePct, n.fundingPeriods, n.mmrPct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setEntry(DEFAULTS.entry);
    setExit(DEFAULTS.exit);
    setMargin(DEFAULTS.margin);
    setLeverage(DEFAULTS.leverage);
    setFeePct(DEFAULTS.feePct);
    setFundingRatePct(DEFAULTS.fundingRatePct);
    setFundingPeriods(DEFAULTS.fundingPeriods);
    setMmrPct(DEFAULTS.mmrPct);
  };

  const bad = {
    entry: entry !== "" && !(n.entry > 0),
    exit: exit !== "" && !(n.exit > 0),
    margin: margin !== "" && !(n.margin > 0),
    leverage: leverage !== "" && !(n.leverage >= 1 && n.leverage <= 125),
    feePct: feePct !== "" && !(n.feePct >= 0),
    fundingRatePct: fundingRatePct !== "" && !Number.isFinite(n.fundingRatePct),
    fundingPeriods: fundingPeriods !== "" && !(n.fundingPeriods >= 0),
    mmrPct: mmrPct !== "" && !(n.mmrPct >= 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />

      <Field
        label="Margin Amount"
        hint="Initial collateral / margin deposited"
        value={margin}
        onChange={setMargin}
        prefix="$"
        min={0}
        invalid={bad.margin}
      />

      <div>
        <Field
          label="Leverage (1× – 125×)"
          hint="Position exposure multiplier"
          value={leverage}
          onChange={setLeverage}
          suffix="×"
          min={1}
          invalid={bad.leverage}
        />
        <Slider
          value={n.leverage}
          onChange={setLeverage}
          min={1}
          max={100}
          step={1}
          scale={["1×", "100×"]}
        />
        <Chips
          options={LEVERAGE_CHIPS}
          value={leverage}
          onPick={setLeverage}
          suffix="×"
          label="Leverage presets"
        />
      </div>

      <Field
        label="Entry Price"
        hint="Futures contract opening price"
        value={entry}
        onChange={setEntry}
        prefix="$"
        min={0}
        invalid={bad.entry}
      />

      <Field
        label="Current / Exit Price"
        hint="Anticipated close or market price"
        value={exit}
        onChange={setExit}
        prefix="$"
        min={0}
        invalid={bad.exit}
      />

      <Chips
        options={SCENARIOS.map((s) => s.label)}
        value={
          SCENARIOS.find(
            (s) =>
              s.side === side &&
              s.entry === entry &&
              s.exit === exit &&
              s.margin === margin &&
              s.lev === leverage,
          )?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SCENARIOS.find((s) => s.label === lbl);
          if (match) {
            setSide(match.side);
            setEntry(match.entry);
            setExit(match.exit);
            setMargin(match.margin);
            setLeverage(match.lev);
          }
        }}
        label="Quick Futures Setups"
      />

      <Optional>
        <Field
          label="Trading Fee % (per side)"
          hint="Taker/Maker fee rate (default: 0.05%)"
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
          optional
          placeholder="0.05"
          invalid={bad.feePct}
        />
        <Field
          label="Funding Rate % (8h)"
          hint="8-hour funding rate (default: 0.01%)"
          value={fundingRatePct}
          onChange={setFundingRatePct}
          suffix="%"
          optional
          placeholder="0.01"
          invalid={bad.fundingRatePct}
        />
        <Field
          label="Funding Intervals"
          hint="Kitne 8h intervals position open rahegi"
          value={fundingPeriods}
          onChange={setFundingPeriods}
          min={0}
          optional
          placeholder="1"
          invalid={bad.fundingPeriods}
        />
        <Field
          label="Maintenance Margin Rate (MMR %)"
          hint="Exchange tier MMR (default: 0.50%)"
          value={mmrPct}
          onChange={setMmrPct}
          suffix="%"
          min={0}
          optional
          placeholder="0.50"
          invalid={bad.mmrPct}
        />
      </Optional>
    </>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.netPnl > 0
      ? "up"
      : res.netPnl < 0
      ? "down"
      : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Activity}>
      Margin, leverage, entry aur exit price enter karein — position value, quantity, maintenance margin aur net P&L live calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero P&L */}
      <Hero
        label="Net Futures P&L (After Fees & Funding)"
        value={fmtSigned(res.netPnl)}
        tone={heroTone}
        sub={
          <>
            <SideBadge side={res.side} />
            <Pill tone={heroTone}>
              ROI on Margin: {res.netRoiPct >= 0 ? "+" : ""}
              {res.netRoiPct.toFixed(2)}%
            </Pill>
            <span>Position: {fmtMoney(res.positionValue)}</span>
          </>
        }
      />

      {/* Critical Futures Warning Notice */}
      <Notice kind={res.leverage >= 20 ? "warn" : "info"}>
        <span>
          <strong>Leverage & Liquidation Notice:</strong> Leverage margin ke mukable position exposure ko{" "}
          <strong>{res.leverage}×</strong> bada deta hai. Estimated Liquidation Price ≈{" "}
          <strong className="text-amber-300">{fmtMoney(res.estLiquidationPrice)}</strong> (
          {res.liqDistancePct.toFixed(2)}% adverse price move door hai).
        </span>
      </Notice>

      {/* Visual Flow / Breakdown */}
      <SectionTitle>Capital, Exposure & Fee Deductions</SectionTitle>
      <Flow
        rows={[
          { label: "Initial Margin", value: res.margin, text: fmtMoney(res.margin) },
          { label: `Position Value (${res.leverage}×)`, value: res.positionValue, text: fmtMoney(res.positionValue) },
          { label: "Gross P&L", value: res.grossPnl, text: fmtSigned(res.grossPnl) },
          ...(res.totalTradingFees > 0
            ? [{ label: "Trading Fees", value: -res.totalTradingFees, text: `-${fmtMoney(res.totalTradingFees)}` }]
            : []),
          ...(res.fundingFee !== 0
            ? [{ label: "Funding Fee", value: -res.fundingFee, text: fmtSigned(-res.fundingFee) }]
            : []),
          { label: "Net P&L", value: res.netPnl, text: fmtSigned(res.netPnl), total: true },
        ]}
      />

      {/* Comprehensive Stats Grid */}
      <Stats
        items={[
          { label: "Position Value", value: fmtMoney(res.positionValue), tone: "up" as const },
          { label: "Coin Quantity", value: `${fmtQty(res.quantity)} coins` },
          { label: "Initial Margin", value: fmtMoney(res.margin) },
          {
            label: "Gross P&L",
            value: fmtSigned(res.grossPnl),
            tone: res.grossPnl > 0 ? ("up" as const) : res.grossPnl < 0 ? ("down" as const) : ("flat" as const),
          },
          {
            label: "Trading Fees (Entry+Exit)",
            value: fmtMoney(res.totalTradingFees),
            tone: res.totalTradingFees > 0 ? ("down" as const) : undefined,
          },
          {
            label: "Funding Fees (Separate)",
            value: fmtSigned(res.fundingFee),
            tone: res.fundingFee > 0 ? ("down" as const) : res.fundingFee < 0 ? ("up" as const) : undefined,
          },
          {
            label: "Maintenance Margin (MMR)",
            value: `${fmtMoney(res.maintenanceMargin)} (${res.mmrPct.toFixed(2)}%)`,
          },
          {
            label: "Est. Liquidation Price",
            value: fmtMoney(res.estLiquidationPrice),
            tone: "warn" as const,
          },
          {
            label: "Liquidation Distance",
            value: `${res.liqDistancePct.toFixed(2)}%`,
            tone: res.liqDistancePct < 5 ? ("down" as const) : undefined,
          },
          {
            label: "Net P&L",
            value: fmtSigned(res.netPnl),
            tone: res.netPnl > 0 ? ("up" as const) : res.netPnl < 0 ? ("down" as const) : ("flat" as const),
          },
          {
            label: "ROI on Margin %",
            value: `${res.netRoiPct >= 0 ? "+" : ""}${res.netRoiPct.toFixed(2)}%`,
            tone: res.netRoiPct > 0 ? ("up" as const) : res.netRoiPct < 0 ? ("down" as const) : ("flat" as const),
          },
          ...(res.breakevenExitPrice != null
            ? [
                {
                  label: "Break-even Exit Price",
                  value: fmtMoney(res.breakevenExitPrice),
                },
              ]
            : []),
        ]}
      />

      {/* Step by Step Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Position Value & Quantity",
            math: `Position Value = ${fmtMoney(res.margin)} × ${res.leverage}× = ${fmtMoney(res.positionValue)} | Quantity = ${fmtMoney(res.positionValue)} ÷ ${fmtMoney(res.entry)} = ${fmtQty(res.quantity)} coins`,
          },
          {
            title: "2. Gross P&L",
            math: `${res.side === "long" ? `(${fmtMoney(res.exit)} − ${fmtMoney(res.entry)})` : `(${fmtMoney(res.entry)} − ${fmtMoney(res.exit)})`} × ${fmtQty(res.quantity)} = ${fmtSigned(res.grossPnl)}`,
          },
          {
            title: "3. Fees & Maintenance Margin",
            math: `Trading Fees: ${fmtMoney(res.totalTradingFees)} | Funding Fee: ${fmtMoney(res.fundingFee)} | Maintenance Margin: ${fmtMoney(res.maintenanceMargin)}`,
          },
          {
            title: "4. Net P&L & ROI on Margin",
            math: `Net P&L = ${fmtSigned(res.grossPnl)} − ${fmtMoney(res.totalTradingFees + res.fundingFee)} = ${fmtSigned(res.netPnl)} | ROI = (${fmtSigned(res.netPnl)} ÷ ${fmtMoney(res.margin)}) × 100 = ${res.netRoiPct.toFixed(2)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Futures trade parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Futures margin & P&L"
      resultIcon={Activity}
      badge={<Pill tone={heroTone}>{res ? `${res.leverage}× ${res.side.toUpperCase()}` : "Futures"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Net Futures P&L",
              value: fmtSigned(res.netPnl),
              sub: `ROI: ${res.netRoiPct >= 0 ? "+" : ""}${res.netRoiPct.toFixed(1)}% · Val: ${fmtMoney(res.positionValue)}`,
              tone: heroTone,
            }
          : null
      }
      note="Crypto futures mein high leverage liquidation risk ko tezi se badha deta hai. Funding rate har 8 ghante mein adjust hoti hai aur long/short imbalance par depend karti hai. Trading advice nahi."
    />
  );
}
