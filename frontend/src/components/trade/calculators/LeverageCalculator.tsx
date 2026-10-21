"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Zap } from "lucide-react";
import { computeLeverage, type Side } from "@/lib/calculators/leverage";
import { fmtMoney, fmtNum, fmtQty, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  DirectionToggle,
  EmptyState,
  Field,
  Hero,
  Meter,
  Notice,
  Optional,
  Pill,
  PriceRuler,
  SectionTitle,
  SideBadge,
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as Side,
  margin: "1000",
  leverage: "10",
  entry: "100",
  positionSize: "",
};

const LEVERAGE_PRESETS = ["2", "5", "10", "20", "50", "100"];

export default function LeverageCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [margin, setMargin] = useState(DEFAULTS.margin);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [positionSize, setPositionSize] = useState(DEFAULTS.positionSize);

  const n = {
    margin: toNum(margin),
    leverage: toNum(leverage),
    entry: toNum(entry),
    positionSize: toNum(positionSize, NaN),
  };

  const outcome = useMemo(
    () =>
      computeLeverage({
        side,
        margin: n.margin,
        leverage: n.leverage,
        entry: n.entry,
        positionSize: n.positionSize,
      }),
    [side, n.margin, n.leverage, n.entry, n.positionSize],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setMargin(DEFAULTS.margin);
    setLeverage(DEFAULTS.leverage);
    setEntry(DEFAULTS.entry);
    setPositionSize(DEFAULTS.positionSize);
  };

  const bad = {
    margin: margin !== "" && !(n.margin > 0),
    leverage: leverage !== "" && !(n.leverage >= 1 && n.leverage <= 200),
    entry: entry !== "" && !(n.entry > 0),
    positionSize: positionSize !== "" && !(n.positionSize > 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />
      <Field
        label="Capital / Margin"
        hint="Aapka lagaya hua margin / initial collateral."
        value={margin}
        onChange={setMargin}
        prefix="$"
        min={0}
        invalid={bad.margin}
      />

      <div>
        <Field
          label="Leverage"
          hint="Position multiplier (e.g. 10×)."
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
          options={LEVERAGE_PRESETS}
          value={leverage}
          onPick={setLeverage}
          suffix="×"
          label="Leverage presets"
        />
      </div>

      <Field
        label="Entry price"
        value={entry}
        onChange={setEntry}
        prefix="$"
        min={0}
        invalid={bad.entry}
      />

      <Optional>
        <Field
          label="Position size"
          optional
          hint="Direct target position value ($) — isse required margin = Position Size ÷ Leverage calculate hota hai."
          value={positionSize}
          onChange={setPositionSize}
          prefix="$"
          min={0}
          invalid={bad.positionSize}
          placeholder="e.g. 10000"
        />
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Zap}>
      Margin, leverage aur entry price daalein — position value aur quantity yahan live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Position value"
        value={fmtMoney(res.positionValue)}
        sub={
          <>
            <Pill tone="up">{fmtQty(res.quantity)} coins</Pill>
            <span>
              Margin {fmtMoney(res.margin)} · {res.leverage}× Leverage
            </span>
          </>
        }
      />

      {/* Important UI Warning required by prompt */}
      <Notice kind="warn">
        <strong>Leverage increases position exposure relative to your margin and can significantly increase liquidation risk.</strong>
        <p style={{ marginTop: 4, fontSize: "12px", opacity: 0.9 }}>
          Calculator ye claim nahi karta ki {res.leverage}× leverage par aap 10× ya {res.leverage}× nuksaan karenge. Isolated margin par aapka loss margin ({fmtMoney(res.margin)}) tak hi simit rehta hai, lekin market ke sirf ~{res.liquidationDistancePct.toFixed(1)}% adverse move hone par poora margin liquidate ho sakta hai.
        </p>
      </Notice>

      <SectionTitle>Exposure &amp; liquidation levels</SectionTitle>
      <PriceRuler stop={res.estLiquidationPrice} entry={n.entry} fmt={fmtMoney} />

      <Meter
        label="Adverse move to liquidation"
        valueText={`${res.liquidationDistancePct.toFixed(1)}%`}
        pct={Math.min(100, (1 / res.leverage) * 100)}
        high={res.leverage >= 20}
      />

      <Stats
        items={[
          { label: "Position value", value: fmtMoney(res.positionValue) },
          { label: "Quantity", value: `${fmtQty(res.quantity)} coins` },
          { label: "Capital / Margin", value: fmtMoney(res.margin) },
          { label: "Leverage", value: `${res.leverage}×` },
          { label: "Entry price", value: fmtMoney(n.entry) },
          { label: "Est. liquidation", value: fmtMoney(res.estLiquidationPrice), tone: "down" },
          { label: "Liquidation distance", value: `${res.liquidationDistancePct.toFixed(2)}%`, tone: "down" },
          ...(res.targetPositionSize != null && res.requiredMarginForTarget != null
            ? [
                { label: "Target position", value: fmtMoney(res.targetPositionSize) },
                { label: "Target quantity", value: `${fmtQty(res.targetQuantity ?? 0)} coins` },
                { label: "Required margin", value: fmtMoney(res.requiredMarginForTarget) },
              ]
            : []),
        ]}
      />

      {res.marginDiff != null && res.marginDiff > 0 && (
        <Notice kind="info">
          Target position {fmtMoney(res.targetPositionSize ?? 0)} lene ke liye {res.leverage}× par <b>{fmtMoney(res.requiredMarginForTarget ?? 0)}</b> margin chahiye — aapke current margin se <b>{fmtMoney(res.marginDiff)}</b> zyada.
        </Notice>
      )}

      <Walkthrough
        steps={[
          {
            title: "Position Value = Margin × Leverage",
            math: `${fmtMoney(res.margin)} × ${res.leverage}× = ${fmtMoney(res.positionValue)}`,
          },
          {
            title: "Quantity = Position Value ÷ Entry Price",
            math: `${fmtMoney(res.positionValue)} ÷ ${fmtMoney(n.entry)} = ${fmtQty(res.quantity)} coins`,
          },
          {
            title: "Liquidation distance = 1 ÷ Leverage × 100%",
            math: `1 ÷ ${res.leverage} × 100% = ${res.liquidationDistancePct.toFixed(2)}%`,
          },
          {
            title:
              side === "long"
                ? "Long Est. Liquidation = Entry × (1 − 1 ÷ Leverage)"
                : "Short Est. Liquidation = Entry × (1 + 1 ÷ Leverage)",
            math:
              side === "long"
                ? `${fmtMoney(n.entry)} × (1 − ${(1 / res.leverage).toFixed(4)}) = ${fmtMoney(res.estLiquidationPrice)}`
                : `${fmtMoney(n.entry)} × (1 + ${(1 / res.leverage).toFixed(4)}) = ${fmtMoney(res.estLiquidationPrice)}`,
          },
          ...(res.targetPositionSize != null && res.requiredMarginForTarget != null
            ? [
                {
                  title: "Required Margin = Target Position ÷ Leverage",
                  math: `${fmtMoney(res.targetPositionSize)} ÷ ${res.leverage}× = ${fmtMoney(res.requiredMarginForTarget)}`,
                },
              ]
            : []),
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Leverage parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Position & risk"
      resultIcon={Zap}
      badge={<SideBadge side={side} />}
      result={body}
      dock={
        res
          ? {
              label: "Position Value",
              value: fmtMoney(res.positionValue),
              sub: `${fmtQty(res.quantity)} coins · ${res.leverage}×`,
            }
          : null
      }
      note="Liquidation price ka anuman isolated margin par aadharit hai. Exchange maintenance margin rate (MMR) aur fees ke karan asal liquidation price thoda pehle trigger ho sakta hai. Trading advice nahi."
    />
  );
}
