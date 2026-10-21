"use client";

import { useMemo, useState } from "react";
import {
  Percent,
  Repeat,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  computeImpermanentLoss,
  IMPERMANENT_LOSS_PRESETS,
  type ImpermanentLossPreset,
} from "@/lib/calculators/impermanentLoss";
import { fmtMoney, fmtPct, toNum } from "@/lib/calculators/format";
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
  presetId: "eth-usdc-bull",
  depositValueUSD: "2000",
  tokenAPriceChangePct: "100",
  tokenBPriceChangePct: "0",
  feeApyPct: "24",
  daysHeld: "90",
  manualFeesUSD: "",
  tokenAName: "ETH",
  tokenBName: "USDC",
};

export default function ImpermanentLossCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [depositValueUSD, setDepositValueUSD] = useState(DEFAULTS.depositValueUSD);
  const [tokenAPriceChangePct, setTokenAPriceChangePct] = useState(
    DEFAULTS.tokenAPriceChangePct
  );
  const [tokenBPriceChangePct, setTokenBPriceChangePct] = useState(
    DEFAULTS.tokenBPriceChangePct
  );
  const [feeApyPct, setFeeApyPct] = useState(DEFAULTS.feeApyPct);
  const [daysHeld, setDaysHeld] = useState(DEFAULTS.daysHeld);
  const [manualFeesUSD, setManualFeesUSD] = useState(DEFAULTS.manualFeesUSD);
  const [tokenAName, setTokenAName] = useState(DEFAULTS.tokenAName);
  const [tokenBName, setTokenBName] = useState(DEFAULTS.tokenBName);

  const n = {
    depositValueUSD: toNum(depositValueUSD),
    tokenAPriceChangePct: toNum(tokenAPriceChangePct),
    tokenBPriceChangePct: toNum(tokenBPriceChangePct),
    feeApyPct: feeApyPct !== "" ? toNum(feeApyPct) : undefined,
    daysHeld: daysHeld !== "" ? toNum(daysHeld) : undefined,
    manualFeesUSD: manualFeesUSD !== "" ? toNum(manualFeesUSD) : undefined,
  };

  const outcome = useMemo(
    () =>
      computeImpermanentLoss({
        depositValueUSD: n.depositValueUSD,
        tokenAPriceChangePct: n.tokenAPriceChangePct,
        tokenBPriceChangePct: n.tokenBPriceChangePct,
        feeApyPct: n.feeApyPct,
        daysHeld: n.daysHeld,
        manualFeesUSD: n.manualFeesUSD,
        tokenAName,
        tokenBName,
      }),
    [
      n.depositValueUSD,
      n.tokenAPriceChangePct,
      n.tokenBPriceChangePct,
      n.feeApyPct,
      n.daysHeld,
      n.manualFeesUSD,
      tokenAName,
      tokenBName,
    ]
  );

  const applyPreset = (preset: ImpermanentLossPreset) => {
    setActivePreset(preset.id);
    setDepositValueUSD(String(preset.depositValueUSD));
    setTokenAPriceChangePct(String(preset.tokenAPriceChangePct));
    setTokenBPriceChangePct(String(preset.tokenBPriceChangePct));
    setFeeApyPct(String(preset.feeApyPct));
    setDaysHeld(String(preset.daysHeld));
    setTokenAName(preset.tokenAName);
    setTokenBName(preset.tokenBName);
    setManualFeesUSD("");
  };

  const handleReset = () => {
    setActivePreset(null);
    setDepositValueUSD(DEFAULTS.depositValueUSD);
    setTokenAPriceChangePct(DEFAULTS.tokenAPriceChangePct);
    setTokenBPriceChangePct(DEFAULTS.tokenBPriceChangePct);
    setFeeApyPct(DEFAULTS.feeApyPct);
    setDaysHeld(DEFAULTS.daysHeld);
    setManualFeesUSD(DEFAULTS.manualFeesUSD);
    setTokenAName(DEFAULTS.tokenAName);
    setTokenBName(DEFAULTS.tokenBName);
  };

  const inputsValid = outcome !== null;

  return (
    <CalcLayout
      inputsTitle="Liquidity Pool & Price Changes"
      inputsIcon={SlidersHorizontal}
      onReset={handleReset}
      inputs={
        <>
          {/* Preset Chips */}
          <div>
            <span className="cx-label">Standard Scenarios</span>
            <div className="cx-chips" role="group" aria-label="IL Presets">
              {IMPERMANENT_LOSS_PRESETS.map((p) => (
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

          {/* Initial Deposit Value */}
          <Field
            label="Total Initial Deposit (USD)"
            prefix="$"
            value={depositValueUSD}
            placeholder="2000"
            hint="50% Token A ($1,000) + 50% Token B ($1,000) initial pool split"
            onChange={(v) => {
              setActivePreset(null);
              setDepositValueUSD(v);
            }}
          />

          {/* Token A Inputs */}
          <div className="cx-row-2">
            <label className="cx-field">
              <span className="cx-label">Token A Symbol</span>
              <span className="cx-input">
                <input
                  type="text"
                  value={tokenAName}
                  placeholder="ETH"
                  onChange={(e) => {
                    setActivePreset(null);
                    setTokenAName(e.target.value.toUpperCase());
                  }}
                />
              </span>
            </label>
            <Field
              label={`${tokenAName} Price Change %`}
              suffix="%"
              value={tokenAPriceChangePct}
              placeholder="100"
              hint="+100% means token doubled (2x)"
              onChange={(v) => {
                setActivePreset(null);
                setTokenAPriceChangePct(v);
              }}
            />
          </div>

          {/* Token B Inputs */}
          <div className="cx-row-2">
            <label className="cx-field">
              <span className="cx-label">Token B Symbol</span>
              <span className="cx-input">
                <input
                  type="text"
                  value={tokenBName}
                  placeholder="USDC"
                  onChange={(e) => {
                    setActivePreset(null);
                    setTokenBName(e.target.value.toUpperCase());
                  }}
                />
              </span>
            </label>
            <Field
              label={`${tokenBName} Price Change %`}
              suffix="%"
              value={tokenBPriceChangePct}
              placeholder="0"
              hint="0% for stablecoins like USDC/USDT"
              onChange={(v) => {
                setActivePreset(null);
                setTokenBPriceChangePct(v);
              }}
            />
          </div>

          {/* Optional Fee Income Inputs */}
          <div className="p-3.5 rounded-2xl bg-[rgba(148,163,184,0.04)] border border-[rgba(148,163,184,0.12)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Swap Fees / Yield (Optional)
              </span>
              <span className="text-[11px] text-[var(--accent)] font-semibold">
                Offsets IL
              </span>
            </div>

            <div className="cx-row-2">
              <Field
                label="Pool Swap Fee APY %"
                suffix="%"
                value={feeApyPct}
                placeholder="24"
                hint="Annualized fee APY %"
                onChange={(v) => {
                  setActivePreset(null);
                  setFeeApyPct(v);
                }}
              />
              <Field
                label="Days Position Held"
                suffix="Days"
                value={daysHeld}
                placeholder="90"
                hint="Duration tokens were in pool"
                onChange={(v) => {
                  setActivePreset(null);
                  setDaysHeld(v);
                }}
              />
            </div>

            <Field
              label="Manual Total Fees Earned (USD)"
              prefix="$"
              value={manualFeesUSD}
              placeholder="Leave blank to use APY"
              hint="Agar aapke paas actual earned fees ka exact dollar amount hai"
              optional
              onChange={(v) => {
                setActivePreset(null);
                setManualFeesUSD(v);
              }}
            />
          </div>
        </>
      }
      resultTitle="Impermanent Loss & HODL Comparison"
      resultIcon={Repeat}
      badge={
        inputsValid ? (
          <span
            className="cx-badge"
            data-side={outcome.isProfitableVsHold ? "long" : "short"}
          >
            {outcome.isProfitableVsHold ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {outcome.isProfitableVsHold ? "LP Outperformed HODL" : "HODL Outperformed LP"}
          </span>
        ) : undefined
      }
      result={
        inputsValid ? (
          <div className="cx-body">
            {/* Hero Impermanent Loss % */}
            <Hero
              label="Impermanent Loss %"
              value={fmtPct(outcome.impermanentLossPct)}
              tone={outcome.impermanentLossPct === 0 ? "flat" : "down"}
              sub={
                <>
                  <Pill tone="down">
                    Diff: -{fmtMoney(Math.abs(outcome.valueDifferenceUSD))}
                  </Pill>
                  <Pill>
                    Ratio (r): {outcome.relativeRatioR.toFixed(3)}x
                  </Pill>
                  <Pill>
                    50/50 Pool
                  </Pill>
                </>
              }
            />

            {/* Key Comparison Stats */}
            <Stats
              items={[
                {
                  label: "Hold Portfolio Value (HODL)",
                  value: fmtMoney(outcome.holdPortfolioValueUSD),
                  tone: "flat",
                },
                {
                  label: "LP Position Value (No Fees)",
                  value: fmtMoney(outcome.lpPositionValueUSD),
                  tone: outcome.lpPositionValueUSD >= outcome.depositValueUSD ? "up" : "down",
                },
                {
                  label: "Dollar Loss due to IL",
                  value: `-${fmtMoney(Math.abs(outcome.valueDifferenceUSD))}`,
                  tone: "down",
                },
                {
                  label: "Total Fees Earned",
                  value: `+${fmtMoney(outcome.feesEarnedUSD)}`,
                  tone: outcome.feesEarnedUSD > 0 ? "up" : "flat",
                },
                {
                  label: "Net LP Value (with Fees)",
                  value: fmtMoney(outcome.lpPositionValueUSD + outcome.feesEarnedUSD),
                  tone: "up",
                },
                {
                  label: "Net Gain/Loss vs HODL",
                  value: `${outcome.netLpResultUSD >= 0 ? "+" : ""}${fmtMoney(outcome.netLpResultUSD)}`,
                  tone: outcome.netLpResultUSD >= 0 ? "up" : "down",
                },
              ]}
            />

            {/* Value Flow Chart */}
            <div className="space-y-2">
              <SectionTitle>HODL vs LP Position Comparison</SectionTitle>
              <Flow
                rows={[
                  {
                    label: "Initial Deposit",
                    value: outcome.depositValueUSD,
                    text: fmtMoney(outcome.depositValueUSD),
                  },
                  {
                    label: "HODL Value (Spot Hold)",
                    value: outcome.holdPortfolioValueUSD,
                    text: fmtMoney(outcome.holdPortfolioValueUSD),
                  },
                  {
                    label: "Impermanent Loss Drag",
                    value: -Math.abs(outcome.valueDifferenceUSD),
                    text: `-${fmtMoney(Math.abs(outcome.valueDifferenceUSD))}`,
                  },
                  {
                    label: "Swap Fees Earned",
                    value: outcome.feesEarnedUSD,
                    text: `+${fmtMoney(outcome.feesEarnedUSD)}`,
                  },
                  {
                    label: "Net LP Settlement",
                    value: outcome.lpPositionValueUSD + outcome.feesEarnedUSD,
                    text: fmtMoney(outcome.lpPositionValueUSD + outcome.feesEarnedUSD),
                    total: true,
                  },
                ]}
              />
            </div>

            {/* Breakeven APY Notice */}
            {outcome.breakevenFeeApyPct > 0 && (
              <Notice kind={outcome.isProfitableVsHold ? "info" : "warn"}>
                Breakeven Fee APY: Is <b>{outcome.impermanentLossPct.toFixed(2)}%</b> IL ko cover karne ke liye pool ko kam se kam <b>{outcome.breakevenFeeApyPct.toFixed(1)}%</b> annual fee APY generate karni hogi. Aapki current yield se net result: <b>{outcome.netLpResultUSD >= 0 ? `+${fmtMoney(outcome.netLpResultUSD)} profit vs hold` : `${fmtMoney(outcome.netLpResultUSD)} loss vs hold`}</b>.
              </Notice>
            )}

            {/* Step-by-step Walkthrough */}
            <Walkthrough
              steps={[
                {
                  title: "1. Relative Price Ratio (r)",
                  math: `Token A change: ${fmtPct(outcome.tokenAPriceChangePct)} (${outcome.priceRatioA.toFixed(2)}x) | Token B change: ${fmtPct(outcome.tokenBPriceChangePct)} (${outcome.priceRatioB.toFixed(2)}x). Relative ratio r = ${outcome.priceRatioA.toFixed(3)} ÷ ${outcome.priceRatioB.toFixed(3)} = ${outcome.relativeRatioR.toFixed(3)}.`,
                },
                {
                  title: "2. Impermanent Loss Formula",
                  math: `IL % = (2 × √r ÷ (1 + r) - 1) × 100 = (2 × √${outcome.relativeRatioR.toFixed(3)} ÷ (1 + ${outcome.relativeRatioR.toFixed(3)}) - 1) × 100 = ${outcome.impermanentLossPct.toFixed(2)}%.`,
                },
                {
                  title: "3. HODL vs LP Position Math",
                  math: `Agar aapne tokens ko sirf wallet me rakha hota, to portfolio value ${fmtMoney(outcome.holdPortfolioValueUSD)} hoti. Pool me automated arbitrage rebalancing ki wajah se LP value ${fmtMoney(outcome.lpPositionValueUSD)} reh gayi (Difference: -${fmtMoney(Math.abs(outcome.valueDifferenceUSD))}).`,
                },
                {
                  title: "4. Net Liquidity Provider Outcome",
                  math: `LP Position Value (${fmtMoney(outcome.lpPositionValueUSD)}) + Swap Fees (${fmtMoney(outcome.feesEarnedUSD)}) = ${fmtMoney(outcome.lpPositionValueUSD + outcome.feesEarnedUSD)}. Net result vs HODL: ${outcome.netLpResultUSD >= 0 ? "+" : ""}${fmtMoney(outcome.netLpResultUSD)} (${fmtPct(outcome.netLpOutcomePct)}).`,
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Repeat}>
            Initial deposit amount aur dono tokens ke price change % daalein. System turant standard 50/50 constant-product formula se Impermanent Loss aur HODL comparison dikhayega.
          </EmptyState>
        )
      }
      dock={
        inputsValid
          ? {
              label: "Impermanent Loss",
              value: fmtPct(outcome.impermanentLossPct),
              sub: `Diff: -${fmtMoney(Math.abs(outcome.valueDifferenceUSD))}`,
              tone: outcome.isProfitableVsHold ? "up" : "down",
            }
          : null
      }
      note="Note: Impermanent loss tab 'permanent' banta hai jab aap pool se liquidity withdraw kar lete hain. Agar price ratio wapas initial level par aa jaye to IL 0% ho jata hai."
    />
  );
}
