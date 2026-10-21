"use client";

import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import {
  computePriceImpact,
  PRICE_IMPACT_PRESETS,
  type PriceImpactPreset,
  type SwapDirection,
} from "@/lib/calculators/priceImpact";
import { fmtNum, fmtPct, fmtQty, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
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
  presetId: "eth-usdt-large-pool",
  tokenASymbol: "USDT",
  tokenBSymbol: "ETH",
  tokenAReserve: "25000000",
  tokenBReserve: "7142.85",
  swapAmount: "50000",
  direction: "a_to_b" as SwapDirection,
  poolFeePct: "0.3",
  slippageTolerancePct: "0.5",
};

export default function PriceImpactCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [tokenASymbol, setTokenASymbol] = useState(DEFAULTS.tokenASymbol);
  const [tokenBSymbol, setTokenBSymbol] = useState(DEFAULTS.tokenBSymbol);
  const [tokenAReserve, setTokenAReserve] = useState(DEFAULTS.tokenAReserve);
  const [tokenBReserve, setTokenBReserve] = useState(DEFAULTS.tokenBReserve);
  const [swapAmount, setSwapAmount] = useState(DEFAULTS.swapAmount);
  const [direction, setDirection] = useState<SwapDirection>(DEFAULTS.direction);
  const [poolFeePct, setPoolFeePct] = useState(DEFAULTS.poolFeePct);
  const [slippageTolerancePct, setSlippageTolerancePct] = useState(
    DEFAULTS.slippageTolerancePct
  );

  const n = {
    tokenAReserve: toNum(tokenAReserve),
    tokenBReserve: toNum(tokenBReserve),
    swapAmount: toNum(swapAmount),
    poolFeePct: toNum(poolFeePct),
    slippageTolerancePct: toNum(slippageTolerancePct),
  };

  const outcome = useMemo(
    () =>
      computePriceImpact({
        tokenAReserve: n.tokenAReserve,
        tokenBReserve: n.tokenBReserve,
        swapAmount: n.swapAmount,
        direction,
        poolFeePct: n.poolFeePct,
        slippageTolerancePct: n.slippageTolerancePct,
        tokenASymbol,
        tokenBSymbol,
      }),
    [
      n.tokenAReserve,
      n.tokenBReserve,
      n.swapAmount,
      direction,
      n.poolFeePct,
      n.slippageTolerancePct,
      tokenASymbol,
      tokenBSymbol,
    ]
  );

  const applyPreset = (preset: PriceImpactPreset) => {
    setActivePreset(preset.id);
    setTokenASymbol(preset.tokenASymbol);
    setTokenBSymbol(preset.tokenBSymbol);
    setTokenAReserve(String(preset.tokenAReserve));
    setTokenBReserve(String(preset.tokenBReserve));
    setSwapAmount(String(preset.swapAmount));
    setDirection(preset.direction);
    setPoolFeePct(String(preset.poolFeePct));
    setSlippageTolerancePct(String(preset.slippageTolerancePct));
  };

  const handleReset = () => {
    setActivePreset(null);
    setTokenASymbol(DEFAULTS.tokenASymbol);
    setTokenBSymbol(DEFAULTS.tokenBSymbol);
    setTokenAReserve(DEFAULTS.tokenAReserve);
    setTokenBReserve(DEFAULTS.tokenBReserve);
    setSwapAmount(DEFAULTS.swapAmount);
    setDirection(DEFAULTS.direction);
    setPoolFeePct(DEFAULTS.poolFeePct);
    setSlippageTolerancePct(DEFAULTS.slippageTolerancePct);
  };

  const inputsValid = outcome !== null;

  return (
    <CalcLayout
      inputsTitle="Liquidity Pool & Swap Size"
      inputsIcon={SlidersHorizontal}
      onReset={handleReset}
      inputs={
        <>
          {/* Preset Chips */}
          <div>
            <span className="cx-label">Pool Depth Scenarios</span>
            <div className="cx-chips" role="group" aria-label="Pool Presets">
              {PRICE_IMPACT_PRESETS.map((p) => (
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

          {/* Swap Direction Toggle */}
          <div>
            <span className="cx-label">Swap Direction</span>
            <div className="cx-dir">
              <button
                type="button"
                data-active={direction === "a_to_b"}
                data-side="long"
                onClick={() => {
                  setActivePreset(null);
                  setDirection("a_to_b");
                }}
              >
                {tokenASymbol} → {tokenBSymbol}
              </button>
              <button
                type="button"
                data-active={direction === "b_to_a"}
                data-side="short"
                onClick={() => {
                  setActivePreset(null);
                  setDirection("b_to_a");
                }}
              >
                {tokenBSymbol} → {tokenASymbol}
              </button>
            </div>
          </div>

          {/* Token Symbols & Reserves */}
          <div className="cx-row-2">
            <Field
              label={`${tokenASymbol} Reserve in Pool`}
              value={tokenAReserve}
              placeholder="25000000"
              hint={`Total ${tokenASymbol} deposited in AMM pool`}
              onChange={(v) => {
                setActivePreset(null);
                setTokenAReserve(v);
              }}
            />
            <Field
              label={`${tokenBSymbol} Reserve in Pool`}
              value={tokenBReserve}
              placeholder="7142.85"
              hint={`Total ${tokenBSymbol} deposited in AMM pool`}
              onChange={(v) => {
                setActivePreset(null);
                setTokenBReserve(v);
              }}
            />
          </div>

          {/* Swap Amount & Tokens */}
          <div className="cx-row-2">
            <Field
              label={`Swap Amount (${direction === "a_to_b" ? tokenASymbol : tokenBSymbol})`}
              value={swapAmount}
              placeholder="50000"
              hint={`Quantity of ${direction === "a_to_b" ? tokenASymbol : tokenBSymbol} to swap`}
              onChange={(v) => {
                setActivePreset(null);
                setSwapAmount(v);
              }}
            />
            <Field
              label="Pool Fee %"
              suffix="%"
              value={poolFeePct}
              placeholder="0.3"
              hint="0.3% Uniswap v2 / 0.25% PancakeSwap"
              onChange={(v) => {
                setActivePreset(null);
                setPoolFeePct(v);
              }}
            />
          </div>

          {/* Slippage Tolerance */}
          <Field
            label="Slippage Tolerance %"
            suffix="%"
            value={slippageTolerancePct}
            placeholder="0.5"
            hint="Transaction fails if execution price drops more than this %"
            optional
            onChange={(v) => {
              setActivePreset(null);
              setSlippageTolerancePct(v);
            }}
          />
        </>
      }
      resultTitle="Estimated Output & Price Impact"
      resultIcon={Waves}
      badge={
        inputsValid ? (
          <span
            className="cx-badge"
            data-side={outcome.priceImpactPct < 1.5 ? "long" : "short"}
          >
            {outcome.severity === "minimal"
              ? "Minimal Impact (<0.5%)"
              : outcome.severity === "low"
              ? "Low Impact (<1.5%)"
              : outcome.severity === "moderate"
              ? "Moderate Impact (1.5-3%)"
              : outcome.severity === "high"
              ? "High Impact (3-5%)"
              : "Extreme Impact (>5%)"}
          </span>
        ) : undefined
      }
      result={
        inputsValid ? (
          <div className="cx-body">
            {/* Hero Price Impact % */}
            <Hero
              label="Estimated Price Impact"
              value={fmtPct(outcome.priceImpactPct)}
              tone={outcome.priceImpactPct < 1.5 ? "up" : outcome.priceImpactPct < 3.0 ? "flat" : "down"}
              sub={
                <>
                  <Pill tone="up">
                    Out: {fmtQty(outcome.outputAmount)} {outcome.outputTokenSymbol}
                  </Pill>
                  <Pill>
                    Fee: {fmtQty(outcome.poolFeeAmount)} {outcome.inputTokenSymbol}
                  </Pill>
                  <Pill>
                    Tol: {outcome.slippageTolerancePct}%
                  </Pill>
                </>
              }
            />

            {/* Key Execution Stats */}
            <Stats
              items={[
                {
                  label: `Output Received (${outcome.outputTokenSymbol})`,
                  value: `${fmtQty(outcome.outputAmount)} ${outcome.outputTokenSymbol}`,
                  tone: "up",
                },
                {
                  label: "Min. Received (after slippage)",
                  value: `${fmtQty(outcome.minReceivedAfterSlippage)} ${outcome.outputTokenSymbol}`,
                  tone: "flat",
                },
                {
                  label: "Initial Spot Price",
                  value: `1 ${outcome.outputTokenSymbol} = ${fmtNum(outcome.spotPriceInputPerOutput)} ${outcome.inputTokenSymbol}`,
                },
                {
                  label: "Average Execution Price",
                  value: `1 ${outcome.outputTokenSymbol} = ${fmtNum(outcome.effectiveCostPerUnit)} ${outcome.inputTokenSymbol}`,
                  tone: outcome.priceImpactPct < 1.5 ? "flat" : "down",
                },
                {
                  label: `Liquidity Pool Fee (${outcome.poolFeePct}%)`,
                  value: `${fmtQty(outcome.poolFeeAmount)} ${outcome.inputTokenSymbol}`,
                },
                {
                  label: "New Pool Spot Price Post-Swap",
                  value: `1 ${outcome.outputTokenSymbol} = ${fmtNum(outcome.newSpotPriceInputPerOutput)} ${outcome.inputTokenSymbol}`,
                  tone: "warn",
                },
              ]}
            />

            {/* Swap Execution Flow */}
            <div className="space-y-2">
              <SectionTitle>Constant-Product AMM Swap Flow</SectionTitle>
              <Flow
                rows={[
                  {
                    label: `Input Swap Amount (${outcome.inputTokenSymbol})`,
                    value: outcome.swapAmount,
                    text: `${fmtQty(outcome.swapAmount)} ${outcome.inputTokenSymbol}`,
                  },
                  {
                    label: "Effective Input (after LP Fee)",
                    value: outcome.effectiveInput,
                    text: `${fmtQty(outcome.effectiveInput)} ${outcome.inputTokenSymbol}`,
                  },
                  {
                    label: "Estimated Output Received",
                    value: outcome.outputAmount,
                    text: `${fmtQty(outcome.outputAmount)} ${outcome.outputTokenSymbol}`,
                  },
                  {
                    label: "Min. Guaranteed Received",
                    value: outcome.minReceivedAfterSlippage,
                    text: `${fmtQty(outcome.minReceivedAfterSlippage)} ${outcome.outputTokenSymbol}`,
                    total: true,
                  },
                ]}
              />
            </div>

            {/* Impact Alerts */}
            {outcome.severity === "extreme" && (
              <Notice kind="error">
                Extreme Price Impact Alert: Is swap par <b>{outcome.priceImpactPct.toFixed(2)}%</b> price impact aa raha hai! Pool reserves ke mukable swap size bohot bada hai. Swap ko chhota karein ya multi-pool aggregator use karein.
              </Notice>
            )}
            {outcome.severity === "high" && (
              <Notice kind="warn">
                High Price Impact: Swap size pool depth ka significant portion consume kar raha hai (<b>{outcome.priceImpactPct.toFixed(2)}%</b> impact). Aggregator ke through split routing consider karein.
              </Notice>
            )}
            {outcome.severity === "minimal" && (
              <Notice kind="info">
                Optimal Liquidity: Price impact negligible (<b>{outcome.priceImpactPct.toFixed(2)}%</b>) hai. Pool depth aapke swap size ke mukable kaafi strong hai.
              </Notice>
            )}

            {/* Step-by-step Walkthrough */}
            <Walkthrough
              steps={[
                {
                  title: "1. Effective Input after Pool Fee",
                  math: `Input Amount = ${fmtQty(outcome.swapAmount)} ${outcome.inputTokenSymbol}. Effective Input = ${fmtQty(outcome.swapAmount)} × (1 - ${outcome.poolFeePct / 100}) = ${fmtQty(outcome.effectiveInput)} ${outcome.inputTokenSymbol} (Fee: ${fmtQty(outcome.poolFeeAmount)}).`,
                },
                {
                  title: "2. Constant-Product Output Math (x × y = k)",
                  math: `Output Amount = (Output Reserve ${fmtQty(outcome.outputReserveY)} × Effective Input ${fmtQty(outcome.effectiveInput)}) ÷ (Input Reserve ${fmtQty(outcome.inputReserveX)} + Effective Input) = ${fmtQty(outcome.outputAmount)} ${outcome.outputTokenSymbol}.`,
                },
                {
                  title: "3. Spot Price vs Execution Price",
                  math: `Initial Spot Price = 1 ${outcome.outputTokenSymbol} = ${fmtNum(outcome.spotPriceInputPerOutput)} ${outcome.inputTokenSymbol}. Average Execution Price = 1 ${outcome.outputTokenSymbol} = ${fmtNum(outcome.effectiveCostPerUnit)} ${outcome.inputTokenSymbol}.`,
                },
                {
                  title: "4. Price Impact Percentage",
                  math: `Price Impact % = (1 - Execution Price ÷ Spot Price) × 100 = (Effective Input ÷ (Input Reserve + Effective Input)) × 100 = ${outcome.priceImpactPct.toFixed(3)}%.`,
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Waves}>
            Dono tokens ke pool reserves aur swap amount bharein. System constant-product AMM formula se output, average execution price aur price impact calculate karega.
          </EmptyState>
        )
      }
      dock={
        inputsValid
          ? {
              label: "Price Impact",
              value: fmtPct(outcome.priceImpactPct),
              sub: `Out: ${fmtQty(outcome.outputAmount)} ${outcome.outputTokenSymbol}`,
              tone: outcome.priceImpactPct < 1.5 ? "up" : "down",
            }
          : null
      }
      note="Note: Ye formula standard x × y = k pools (jaise Uniswap v2) ke liye hai. Concentrated liquidity (Uniswap v3) ya curve pools mein dynamic ticks ke hisaab se calculation alag hoti hai."
    />
  );
}
