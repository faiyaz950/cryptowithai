"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Flame, Radar, ShieldAlert, ShieldCheck } from "lucide-react";
import { computeLiquidationDistance, type Side } from "@/lib/calculators/liquidationDistance";
import { fmtMoney, fmtNum, fmtPct, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  DirectionToggle,
  EmptyState,
  Field,
  Flow,
  Hero,
  Meter,
  Notice,
  Optional,
  Pill,
  SectionTitle,
  SideBadge,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as Side,
  entry: "65000",
  markPrice: "63500",
  liqPrice: "59200",
  stopLoss: "",
};

const SCENARIOS = [
  {
    label: "Safe Long (6.8% away)",
    side: "long" as Side,
    entry: "65000",
    mark: "63500",
    liq: "59200",
  },
  {
    label: "High Risk Long (3.5% away)",
    side: "long" as Side,
    entry: "65000",
    mark: "61400",
    liq: "59200",
  },
  {
    label: "Critical Danger Long (1.2% away)",
    side: "long" as Side,
    entry: "65000",
    mark: "59900",
    liq: "59200",
  },
  {
    label: "Short Safe (9.5% away)",
    side: "short" as Side,
    entry: "3500",
    mark: "3550",
    liq: "3890",
  },
];

export default function LiquidationDistanceCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [markPrice, setMarkPrice] = useState(DEFAULTS.markPrice);
  const [liqPrice, setLiqPrice] = useState(DEFAULTS.liqPrice);
  const [stopLoss, setStopLoss] = useState(DEFAULTS.stopLoss);

  const n = {
    entry: toNum(entry),
    markPrice: toNum(markPrice),
    liqPrice: toNum(liqPrice),
    stopLoss: toNum(stopLoss, NaN),
  };

  const outcome = useMemo(
    () =>
      computeLiquidationDistance({
        side,
        entry: n.entry,
        markPrice: n.markPrice,
        liqPrice: n.liqPrice,
        stopLoss: n.stopLoss,
      }),
    [side, n.entry, n.markPrice, n.liqPrice, n.stopLoss],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setEntry(DEFAULTS.entry);
    setMarkPrice(DEFAULTS.markPrice);
    setLiqPrice(DEFAULTS.liqPrice);
    setStopLoss(DEFAULTS.stopLoss);
  };

  const bad = {
    entry: entry !== "" && !(n.entry > 0),
    markPrice: markPrice !== "" && !(n.markPrice > 0),
    liqPrice: liqPrice !== "" && !(n.liqPrice > 0),
    stopLoss: stopLoss !== "" && !(n.stopLoss > 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />

      <Field
        label="Entry Price"
        hint="Position open hone ka price"
        value={entry}
        onChange={setEntry}
        prefix="$"
        min={0}
        invalid={bad.entry}
      />

      <Field
        label="Current Mark Price"
        hint="Live futures index/mark price"
        value={markPrice}
        onChange={setMarkPrice}
        prefix="$"
        min={0}
        invalid={bad.markPrice}
      />

      <Field
        label="Liquidation Price"
        hint="Exchange position ticket ka exact liq price"
        value={liqPrice}
        onChange={setLiqPrice}
        prefix="$"
        min={0}
        invalid={bad.liqPrice}
      />

      <Chips
        options={SCENARIOS.map((s) => s.label)}
        value={
          SCENARIOS.find(
            (s) =>
              s.side === side &&
              s.entry === entry &&
              s.mark === markPrice &&
              s.liq === liqPrice,
          )?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SCENARIOS.find((s) => s.label === lbl);
          if (match) {
            setSide(match.side);
            setEntry(match.entry);
            setMarkPrice(match.mark);
            setLiqPrice(match.liq);
          }
        }}
        label="Scenarios"
      />

      <Optional>
        <Field
          label="Stop Loss Price"
          hint="Verify karein ki SL liquidation se pehle trigger hoga"
          value={stopLoss}
          onChange={setStopLoss}
          prefix="$"
          min={0}
          optional
          placeholder="e.g. 61000"
          invalid={bad.stopLoss}
        />
      </Optional>
    </>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.riskLevel === "liquidated" || res.riskLevel === "critical"
      ? "down"
      : res.riskLevel === "high"
      ? "down"
      : res.riskLevel === "moderate"
      ? "flat"
      : "up"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Radar}>
      Entry price, current mark price aur liquidation price enter karein — exact liquidation distance % aur risk alert live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Metric */}
      <Hero
        label={`Distance to Liquidation (${res.side.toUpperCase()})`}
        value={`${res.distancePct.toFixed(2)}%`}
        tone={heroTone}
        sub={
          <>
            <SideBadge side={res.side} />
            <Pill tone={heroTone}>{res.riskTitle}</Pill>
            <span>Gap: {fmtMoney(res.distancePrice)}</span>
          </>
        }
      />

      {/* Risk Warning Notice */}
      <Notice
        kind={
          res.riskLevel === "liquidated" || res.riskLevel === "critical"
            ? "error"
            : res.riskLevel === "high"
            ? "warn"
            : "info"
        }
      >
        <span>
          <strong>{res.riskTitle}:</strong> {res.riskMessage}
          <div className="mt-1 text-xs opacity-90">
            *Note: Liquidation price hamesha exchange ke official position ticket ya verified MMR rules ke anusaar confirm karein.
          </div>
        </span>
      </Notice>

      {/* Stop Loss Verification if provided */}
      {res.slSafetyStatus != null && (
        <Notice kind={res.slSafetyStatus === "safe" ? "info" : "error"}>
          <span>
            {res.slSafetyStatus === "safe" ? (
              <span className="text-emerald-400">
                ✓ <strong>Stop Loss Protected:</strong> Aapka Stop Loss ({fmtMoney(n.stopLoss)}) liquidation price ({fmtMoney(res.liqPrice)}) se pehle trigger hoga ({res.slDistanceToLiqPct?.toFixed(2)}% safety cushion).
              </span>
            ) : (
              <span className="text-rose-400">
                ⚠ <strong>DANGER — SL Invalid:</strong> Aapka Stop Loss liquidation price ke baad pad raha hai! Price wahan pahunchne se pehle hi position liquidate ho jayegi!
              </span>
            )}
          </span>
        </Notice>
      )}

      {/* Distance Meter */}
      <Meter
        label="Liquidation Buffer Distance"
        valueText={`${res.distancePct.toFixed(2)}%`}
        pct={Math.min(100, (res.distancePct / 20) * 100)}
        high={res.distancePct < 3}
      />

      {/* Visual Level Flow */}
      <SectionTitle>Price Levels & Distance Gap</SectionTitle>
      <Flow
        rows={[
          { label: "Entry Price", value: res.entry, text: fmtMoney(res.entry) },
          { label: "Current Mark Price", value: res.markPrice, text: fmtMoney(res.markPrice) },
          { label: "Liquidation Price", value: res.liqPrice, text: fmtMoney(res.liqPrice) },
          { label: "Price Gap to Liquidation", value: res.distancePrice, text: fmtMoney(res.distancePrice), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Current Mark Price", value: fmtMoney(res.markPrice), tone: "up" as const },
          { label: "Liquidation Price", value: fmtMoney(res.liqPrice), tone: "down" as const },
          { label: "Distance in Price", value: fmtMoney(res.distancePrice) },
          {
            label: "Distance in %",
            value: `${res.distancePct.toFixed(2)}%`,
            tone: res.distancePct < 5 ? ("down" as const) : ("up" as const),
          },
          { label: "Distance from Entry ($)", value: fmtMoney(res.distanceFromEntryPrice) },
          { label: "Distance from Entry (%)", value: `${res.distanceFromEntryPct.toFixed(2)}%` },
          {
            label: "Unrealized Move from Entry",
            value: fmtPct(res.currentUnrealizedMovePct),
            tone: res.currentUnrealizedMovePct >= 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Risk Assessment",
            value: res.riskTitle,
            tone: res.riskTone === "warn" ? ("warn" as const) : res.riskTone,
          },
          ...(res.slSafetyStatus != null
            ? [
                {
                  label: "Stop Loss Safety",
                  value: res.slSafetyStatus === "safe" ? "Protected ✓" : "Danger (Behind Liq) ⚠",
                  tone: res.slSafetyStatus === "safe" ? ("up" as const) : ("down" as const),
                },
              ]
            : []),
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: `Formula (${res.side === "long" ? "Long Position" : "Short Position"})`,
            math:
              res.side === "long"
                ? `Long Distance % = (Mark Price − Liquidation Price) ÷ Mark Price × 100`
                : `Short Distance % = (Liquidation Price − Mark Price) ÷ Mark Price × 100`,
          },
          {
            title: "Calculation",
            math:
              res.side === "long"
                ? `(${fmtMoney(res.markPrice)} − ${fmtMoney(res.liqPrice)}) ÷ ${fmtMoney(res.markPrice)} × 100 = ${res.distancePct.toFixed(2)}%`
                : `(${fmtMoney(res.liqPrice)} − ${fmtMoney(res.markPrice)}) ÷ ${fmtMoney(res.markPrice)} × 100 = ${res.distancePct.toFixed(2)}%`,
          },
          {
            title: "Price Gap",
            math: `|${fmtMoney(res.markPrice)} − ${fmtMoney(res.liqPrice)}| = ${fmtMoney(res.distancePrice)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Position & price levels"
      inputsIcon={Radar}
      onReset={reset}
      inputs={inputs}
      resultTitle="Liquidation distance & risk"
      resultIcon={ShieldAlert}
      badge={<Pill tone={heroTone}>{res ? `${res.distancePct.toFixed(1)}% Away` : "Distance"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Liq Distance",
              value: `${res.distancePct.toFixed(2)}%`,
              sub: `Gap: ${fmtMoney(res.distancePrice)} · Mark: ${fmtMoney(res.markPrice)}`,
              tone: heroTone,
            }
          : null
      }
      note="Liquidation price exchange ke official position data ya verified exchange-specific formula se lena chahiye. Market volatility aur dynamic funding rates se real liquidation price vary kar sakti hai. Trading advice nahi."
    />
  );
}
