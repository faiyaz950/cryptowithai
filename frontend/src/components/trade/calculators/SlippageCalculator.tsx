"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Percent,
  SlidersHorizontal,
} from "lucide-react";
import {
  computeSlippage,
  SLIPPAGE_PRESETS,
  type SlippagePreset,
  type TradeSide,
} from "@/lib/calculators/slippage";
import { fmtMoney, fmtPct, fmtQty, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  DirectionToggle,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  presetId: "btc-spot-buy",
  side: "buy" as TradeSide,
  expectedPrice: "65000",
  executionPrice: "65120",
  quantity: "0.5",
  feePct: "0.1",
  isEstimate: false,
};

export default function SlippageCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [side, setSide] = useState<TradeSide>(DEFAULTS.side);
  const [expectedPrice, setExpectedPrice] = useState(DEFAULTS.expectedPrice);
  const [executionPrice, setExecutionPrice] = useState(DEFAULTS.executionPrice);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [isEstimate, setIsEstimate] = useState(DEFAULTS.isEstimate);

  const n = {
    expectedPrice: toNum(expectedPrice),
    executionPrice: toNum(executionPrice),
    quantity: toNum(quantity),
    feePct: toNum(feePct),
  };

  const outcome = useMemo(
    () =>
      computeSlippage({
        expectedPrice: n.expectedPrice,
        executionPrice: n.executionPrice,
        quantity: n.quantity,
        side,
        feePct: n.feePct,
        isEstimate,
      }),
    [n.expectedPrice, n.executionPrice, n.quantity, n.feePct, side, isEstimate]
  );

  const applyPreset = (preset: SlippagePreset) => {
    setActivePreset(preset.id);
    setSide(preset.side);
    setExpectedPrice(String(preset.expectedPrice));
    setExecutionPrice(String(preset.executionPrice));
    setQuantity(String(preset.quantity));
    setFeePct(String(preset.feePct));
    setIsEstimate(preset.isEstimate);
  };

  const handleReset = () => {
    setActivePreset(null);
    setSide(DEFAULTS.side);
    setExpectedPrice(DEFAULTS.expectedPrice);
    setExecutionPrice(DEFAULTS.executionPrice);
    setQuantity(DEFAULTS.quantity);
    setFeePct(DEFAULTS.feePct);
    setIsEstimate(DEFAULTS.isEstimate);
  };

  const inputsValid = outcome !== null;

  return (
    <CalcLayout
      inputsTitle="Slippage Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={handleReset}
      inputs={
        <>
          {/* Preset Chips */}
          <div>
            <span className="cx-label">Pre-configured Scenarios</span>
            <div className="cx-chips" role="group" aria-label="Slippage Presets">
              {SLIPPAGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="cx-chip"
                  data-active={activePreset === p.id}
                  onClick={() => applyPreset(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Trade Direction */}
          <div>
            <span className="cx-label">Order Side</span>
            <DirectionToggle
              side={side === "buy" ? "long" : "short"}
              onChange={(s) => {
                setActivePreset(null);
                setSide(s === "long" ? "buy" : "sell");
              }}
            />
          </div>

          {/* Estimation status toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(148,163,184,0.05)] border border-[rgba(148,163,184,0.12)]">
            <div className="text-xs">
              <span className="font-semibold block text-[var(--text-primary)]">
                {isEstimate ? "Estimated Pre-Trade Analysis" : "Actual Post-Trade Execution"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {isEstimate
                  ? "Orderbook depth ke basis par anumanit execution"
                  : "Exchange trade history se actual fill price"}
              </span>
            </div>
            <button
              type="button"
              className="cx-chip"
              data-active={isEstimate}
              onClick={() => setIsEstimate((prev) => !prev)}
            >
              {isEstimate ? "Estimate Mode" : "Actual Mode"}
            </button>
          </div>

          {/* Prices & Quantity */}
          <div className="cx-row-2">
            <Field
              label="Expected Price"
              prefix="$"
              value={expectedPrice}
              placeholder="65000"
              hint="Order screen / quote price"
              onChange={(v) => {
                setActivePreset(null);
                setExpectedPrice(v);
              }}
            />
            <Field
              label={isEstimate ? "Est. Execution Price" : "Actual Execution Price"}
              prefix="$"
              value={executionPrice}
              placeholder="65120"
              hint={isEstimate ? "Estimated fill price" : "Exact executed avg price"}
              onChange={(v) => {
                setActivePreset(null);
                setExecutionPrice(v);
              }}
            />
          </div>

          <div className="cx-row-2">
            <Field
              label="Order Quantity"
              suffix="Coins"
              value={quantity}
              placeholder="0.5"
              hint="Total units / tokens traded"
              onChange={(v) => {
                setActivePreset(null);
                setQuantity(v);
              }}
            />
            <Field
              label="Trading Fee %"
              suffix="%"
              value={feePct}
              placeholder="0.1"
              hint="Taker / exchange fee %"
              onChange={(v) => {
                setActivePreset(null);
                setFeePct(v);
              }}
            />
          </div>
        </>
      }
      resultTitle="Slippage & Cost Analysis"
      resultIcon={Percent}
      badge={
        inputsValid ? (
          <span
            className="cx-badge"
            data-side={outcome.isFavorable ? "long" : "short"}
          >
            {outcome.isFavorable ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {outcome.isFavorable
              ? "Positive Slippage (Favorable)"
              : outcome.favorableOrUnfavorable === "zero"
              ? "Zero Slippage"
              : "Unfavorable Slippage"}
          </span>
        ) : undefined
      }
      result={
        inputsValid ? (
          <div className="cx-body">
            {/* Hero result */}
            <Hero
              label={
                outcome.isFavorable
                  ? "Slippage Savings (Price Improvement)"
                  : "Absolute Slippage Cost"
              }
              value={fmtMoney(outcome.absoluteSlippageCost)}
              tone={outcome.isFavorable ? "up" : outcome.favorableOrUnfavorable === "zero" ? "flat" : "down"}
              sub={
                <>
                  <Pill tone={outcome.isFavorable ? "up" : "down"}>
                    Slippage: {fmtPct(outcome.slippagePct)}
                  </Pill>
                  <Pill>
                    {outcome.isEstimate ? "Estimated Fill" : "Actual Execution"}
                  </Pill>
                  <Pill>
                    Side: {outcome.side.toUpperCase()}
                  </Pill>
                </>
              }
            />

            {/* Key Stats */}
            <Stats
              items={[
                {
                  label: "Expected Order Value",
                  value: fmtMoney(outcome.expectedOrderValue),
                },
                {
                  label: outcome.isEstimate ? "Est. Execution Value" : "Actual Execution Value",
                  value: fmtMoney(outcome.executionOrderValue),
                  tone: outcome.isFavorable ? "up" : "down",
                },
                {
                  label: "Price Difference / Coin",
                  value: `${outcome.priceDiff > 0 ? "+" : ""}${fmtMoney(outcome.priceDiff)}`,
                  tone: outcome.isFavorable ? "up" : "down",
                },
                {
                  label: `Trading Fee (${outcome.feePct}%)`,
                  value: fmtMoney(outcome.feeAmount),
                },
                {
                  label: "Total Cost Impact",
                  value: fmtMoney(outcome.totalCostImpact),
                  tone: "warn",
                },
                {
                  label: outcome.side === "buy" ? "Total Spent (with fee)" : "Net Received (after fee)",
                  value: fmtMoney(outcome.totalEffectiveCost),
                  tone: outcome.side === "buy" ? "down" : "up",
                },
              ]}
            />

            {/* Value Flow Breakdown */}
            <div className="space-y-2">
              <SectionTitle>Value Settlement Breakdown</SectionTitle>
              <Flow
                rows={[
                  {
                    label: "Expected Value",
                    value: outcome.expectedOrderValue,
                    text: fmtMoney(outcome.expectedOrderValue),
                  },
                  {
                    label: outcome.isFavorable ? "Slippage Gain" : "Slippage Loss",
                    value: outcome.isFavorable ? outcome.absoluteSlippageCost : -outcome.absoluteSlippageCost,
                    text: `${outcome.isFavorable ? "+" : "-"}${fmtMoney(outcome.absoluteSlippageCost)}`,
                  },
                  {
                    label: "Exchange Fee",
                    value: -outcome.feeAmount,
                    text: `-${fmtMoney(outcome.feeAmount)}`,
                  },
                  {
                    label: outcome.side === "buy" ? "Net Total Outflow" : "Net Total Inflow",
                    value: outcome.totalEffectiveCost,
                    text: fmtMoney(outcome.totalEffectiveCost),
                    total: true,
                  },
                ]}
              />
            </div>

            {/* Severity notice */}
            {outcome.severity === "high" && (
              <Notice kind="error">
                High Slippage Warning: Order par <b>{Math.abs(outcome.slippagePct).toFixed(2)}%</b> slippage lag rahi hai ({fmtMoney(outcome.absoluteSlippageCost)} extra loss). Market order ke bajaye Limit Order use karein ya order size ko chhota karein.
              </Notice>
            )}
            {outcome.severity === "moderate" && (
              <Notice kind="warn">
                Moderate Slippage: Slippage <b>{Math.abs(outcome.slippagePct).toFixed(2)}%</b> hai. Low liquidity pairs par DEX slippage tolerance limit (0.5% - 1.0%) set karke trade karein.
              </Notice>
            )}
            {outcome.isFavorable && (
              <Notice kind="info">
                Price Improvement: Order expected se behtar price par fill hua hai. Aapne total <b>{fmtMoney(outcome.absoluteSlippageCost)}</b> save kiye hain.
              </Notice>
            )}

            {/* Step-by-step Walkthrough */}
            <Walkthrough
              steps={[
                {
                  title: "Slippage Percentage Formula",
                  math: `Slippage % = ((Execution Price (${fmtMoney(outcome.executionPrice)}) - Expected Price (${fmtMoney(outcome.expectedPrice)})) ÷ Expected Price) × 100 = ${outcome.slippagePct.toFixed(3)}%.`,
                },
                {
                  title: "Absolute Slippage Cost",
                  math: `Slippage Cost = |${fmtMoney(outcome.executionPrice)} - ${fmtMoney(outcome.expectedPrice)}| × ${fmtQty(outcome.quantity)} coins = ${fmtMoney(outcome.absoluteSlippageCost)}.`,
                },
                {
                  title: "Direction Interpretation",
                  math:
                    outcome.side === "buy"
                      ? outcome.executionPrice > outcome.expectedPrice
                        ? `Buy order mein execution price zyada hona unfavorable hota hai kyunki aapko $${outcome.absoluteSlippageCost.toFixed(2)} extra spend karna pada.`
                        : `Buy order mein execution price kam hona favorable hota hai kyunki aapko saste me coins mile.`
                      : outcome.executionPrice < outcome.expectedPrice
                      ? `Sell order mein execution price kam hona unfavorable hota hai kyunki aapko $${outcome.absoluteSlippageCost.toFixed(2)} kam revenue mili.`
                      : `Sell order mein execution price zyada hona favorable hota hai kyunki aapko zyada USDT mili.`,
                },
                {
                  title: "Total Effective Cost with Fees",
                  math: `Execution Value (${fmtMoney(outcome.executionOrderValue)}) + ${outcome.feePct}% Trading Fee (${fmtMoney(outcome.feeAmount)}) = Total Effective Outflow/Settlement ${fmtMoney(outcome.totalEffectiveCost)}.`,
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Percent}>
            Expected price, execution price aur order quantity bharein. System turant slippage % aur cost calculate karega.
          </EmptyState>
        )
      }
      dock={
        inputsValid
          ? {
              label: outcome.isFavorable ? "Price Improvement" : "Slippage Cost",
              value: fmtMoney(outcome.absoluteSlippageCost),
              sub: `${fmtPct(outcome.slippagePct)} slippage`,
              tone: outcome.isFavorable ? "up" : "down",
            }
          : null
      }
      note="Note: Market orders low-liquidity orderbooks ya thin AMM pools mein expected price se kaafi alag fill ho sakte hain. Slippage tolerance ka istemaal karein."
    />
  );
}
