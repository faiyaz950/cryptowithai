"use client";

import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  computeTradeExpectancy,
  TRADE_EXPECTANCY_PRESETS,
  type TradeExpectancyPreset,
} from "@/lib/calculators/tradeExpectancy";
import { fmtPct, fmtRatio, toNum } from "@/lib/calculators/format";
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
  presetId: "user-example",
  winRatePct: "55",
  avgWinAmount: "2000",
  avgLossAmount: "1000",
  tradesCount: "30",
  feePerTrade: "100",
  currency: "₹",
};

export default function TradeExpectancyCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [winRatePct, setWinRatePct] = useState(DEFAULTS.winRatePct);
  const [avgWinAmount, setAvgWinAmount] = useState(DEFAULTS.avgWinAmount);
  const [avgLossAmount, setAvgLossAmount] = useState(DEFAULTS.avgLossAmount);
  const [tradesCount, setTradesCount] = useState(DEFAULTS.tradesCount);
  const [feePerTrade, setFeePerTrade] = useState(DEFAULTS.feePerTrade);
  const [currency, setCurrency] = useState(DEFAULTS.currency);

  const n = {
    winRatePct: toNum(winRatePct),
    avgWinAmount: toNum(avgWinAmount),
    avgLossAmount: toNum(avgLossAmount),
    tradesCount: tradesCount !== "" ? toNum(tradesCount) : undefined,
    feePerTrade: feePerTrade !== "" ? toNum(feePerTrade) : undefined,
  };

  const outcome = useMemo(
    () =>
      computeTradeExpectancy({
        winRatePct: n.winRatePct,
        avgWinAmount: n.avgWinAmount,
        avgLossAmount: n.avgLossAmount,
        tradesCount: n.tradesCount,
        feePerTrade: n.feePerTrade,
      }),
    [n.winRatePct, n.avgWinAmount, n.avgLossAmount, n.tradesCount, n.feePerTrade]
  );

  const applyPreset = (preset: TradeExpectancyPreset) => {
    setActivePreset(preset.id);
    setWinRatePct(String(preset.winRatePct));
    setAvgWinAmount(String(preset.avgWinAmount));
    setAvgLossAmount(String(preset.avgLossAmount));
    setTradesCount(String(preset.tradesCount));
    setFeePerTrade(String(preset.feePerTrade));
  };

  const handleReset = () => {
    setActivePreset(null);
    setWinRatePct(DEFAULTS.winRatePct);
    setAvgWinAmount(DEFAULTS.avgWinAmount);
    setAvgLossAmount(DEFAULTS.avgLossAmount);
    setTradesCount(DEFAULTS.tradesCount);
    setFeePerTrade(DEFAULTS.feePerTrade);
    setCurrency(DEFAULTS.currency);
  };

  const fmtCurr = (val: number) => {
    if (!Number.isFinite(val)) return "—";
    const sign = val < 0 ? "-" : "";
    return `${sign}${currency}${Math.abs(val).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const inputsValid = outcome !== null;

  return (
    <CalcLayout
      inputsTitle="Strategy Performance Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={handleReset}
      inputs={
        <>
          {/* Preset Chips */}
          <div>
            <span className="cx-label">Preset Strategies</span>
            <div className="cx-chips" role="group" aria-label="Expectancy Presets">
              {TRADE_EXPECTANCY_PRESETS.map((p) => (
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

          {/* Currency selection */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[rgba(148,163,184,0.05)] border border-[rgba(148,163,184,0.12)]">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              Display Currency
            </span>
            <div className="flex gap-1.5">
              {["₹", "$", "€"].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cx-chip"
                  data-active={currency === c}
                  onClick={() => setCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Win Rate */}
          <Field
            label="Win Rate %"
            suffix="%"
            value={winRatePct}
            placeholder="55"
            hint="Winning trades ka percentage (e.g. 55%)"
            onChange={(v) => {
              setActivePreset(null);
              setWinRatePct(v);
            }}
          />

          {/* Average Win & Loss */}
          <div className="cx-row-2">
            <Field
              label="Average Winning Trade"
              prefix={currency}
              value={avgWinAmount}
              placeholder="2000"
              hint="Jeetne par average profit"
              onChange={(v) => {
                setActivePreset(null);
                setAvgWinAmount(v);
              }}
            />
            <Field
              label="Average Losing Trade"
              prefix={currency}
              value={avgLossAmount}
              placeholder="1000"
              hint="Haarne par average loss"
              onChange={(v) => {
                setActivePreset(null);
                setAvgLossAmount(v);
              }}
            />
          </div>

          {/* Trades Sample & Fees */}
          <div className="cx-row-2">
            <Field
              label="Trades Sample / Month"
              suffix="Trades"
              value={tradesCount}
              placeholder="30"
              hint="Projected number of executions"
              onChange={(v) => {
                setActivePreset(null);
                setTradesCount(v);
              }}
            />
            <Field
              label="Avg Fee / Cost per Trade"
              prefix={currency}
              value={feePerTrade}
              placeholder="100"
              hint="Brokerage, taker fee aur slippage drag"
              optional
              onChange={(v) => {
                setActivePreset(null);
                setFeePerTrade(v);
              }}
            />
          </div>
        </>
      }
      resultTitle="Mathematical Expectancy & Edge"
      resultIcon={Target}
      badge={
        inputsValid ? (
          <span
            className="cx-badge"
            data-side={outcome.isProfitable ? "long" : "short"}
          >
            {outcome.isProfitable ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {outcome.edgeRating === "strong_edge"
              ? "Strong Edge"
              : outcome.edgeRating === "moderate_edge"
              ? "Positive Edge"
              : outcome.edgeRating === "fragile_edge"
              ? "Fragile Edge (Fee Drag)"
              : "Negative Edge (Losing System)"}
          </span>
        ) : undefined
      }
      result={
        inputsValid ? (
          <div className="cx-body">
            {/* Hero Expectancy per Trade */}
            <Hero
              label="Net Expectancy per Trade"
              value={fmtCurr(outcome.netExpectancyPerTrade)}
              tone={outcome.netExpectancyPerTrade > 0 ? "up" : outcome.netExpectancyPerTrade < 0 ? "down" : "flat"}
              sub={
                <>
                  <Pill tone={outcome.expectedTotalOutcome >= 0 ? "up" : "down"}>
                    {outcome.tradesCount} Trades: {outcome.expectedTotalOutcome >= 0 ? "+" : ""}{fmtCurr(outcome.expectedTotalOutcome)}
                  </Pill>
                  <Pill>
                    Payoff: {fmtRatio(outcome.winLossRatio)}
                  </Pill>
                  <Pill>
                    Breakeven: {fmtPct(outcome.breakEvenWinRatePct)}
                  </Pill>
                </>
              }
            />

            {/* Key Edge Stats */}
            <Stats
              items={[
                {
                  label: `Total Projected (${outcome.tradesCount} Trades)`,
                  value: `${outcome.expectedTotalOutcome >= 0 ? "+" : ""}${fmtCurr(outcome.expectedTotalOutcome)}`,
                  tone: outcome.expectedTotalOutcome >= 0 ? "up" : "down",
                },
                {
                  label: "Break-even Win Rate %",
                  value: fmtPct(outcome.breakEvenWinRatePct),
                  tone: outcome.winRatePct >= outcome.breakEvenWinRatePct ? "up" : "down",
                },
                {
                  label: "Win / Loss Payoff Ratio",
                  value: `${outcome.winLossRatio.toFixed(2)} : 1`,
                  tone: outcome.winLossRatio >= 1.5 ? "up" : "flat",
                },
                {
                  label: "Gross Expectancy (Pre-Fee)",
                  value: fmtCurr(outcome.grossExpectancyPerTrade),
                  tone: "flat",
                },
                {
                  label: "Total Fees Paid",
                  value: `-${fmtCurr(outcome.totalFeesImpact)}`,
                  tone: outcome.feeDragPct > 25 ? "warn" : "flat",
                },
                {
                  label: "Profit Factor",
                  value: outcome.profitFactor >= 999 ? "∞" : outcome.profitFactor.toFixed(2),
                  tone: outcome.profitFactor >= 1.5 ? "up" : outcome.profitFactor >= 1.0 ? "flat" : "down",
                },
              ]}
            />

            {/* Probability Breakdown Flow */}
            <div className="space-y-2">
              <SectionTitle>Probability Outcome Flow (Per Trade)</SectionTitle>
              <Flow
                rows={[
                  {
                    label: `Win (${outcome.winRatePct}% × ${fmtCurr(outcome.avgWinAmount)})`,
                    value: (outcome.winRatePct / 100) * outcome.avgWinAmount,
                    text: `+${fmtCurr((outcome.winRatePct / 100) * outcome.avgWinAmount)}`,
                  },
                  {
                    label: `Loss (${outcome.lossRatePct.toFixed(1)}% × ${fmtCurr(outcome.avgLossAmount)})`,
                    value: -((100 - outcome.winRatePct) / 100) * outcome.avgLossAmount,
                    text: `-${fmtCurr(((100 - outcome.winRatePct) / 100) * outcome.avgLossAmount)}`,
                  },
                  {
                    label: "Average Fee Drag",
                    value: -outcome.feePerTrade,
                    text: `-${fmtCurr(outcome.feePerTrade)}`,
                  },
                  {
                    label: "Net Statistical Edge",
                    value: outcome.netExpectancyPerTrade,
                    text: fmtCurr(outcome.netExpectancyPerTrade),
                    total: true,
                  },
                ]}
              />
            </div>

            {/* Edge Alert */}
            {!outcome.isProfitable && (
              <Notice kind="error">
                Negative Edge: Aapki strategy har trade par average <b>{fmtCurr(Math.abs(outcome.netExpectancyPerTrade))}</b> lose kar rahi hai. Strategy ko profitable banane ke liye win rate ko <b>{outcome.breakEvenWinRatePct.toFixed(1)}%</b> se upar le jana hoga ya R:R improve karna hoga.
              </Notice>
            )}
            {outcome.isProfitable && outcome.edgeRating === "fragile_edge" && (
              <Notice kind="warn">
                Fragile Edge Warning: Strategy profitable hai lekin fee drag <b>{outcome.feeDragPct.toFixed(1)}%</b> hai! High frequency trading ya aggressive taker orders aapka saara profit exchange fees me khatam kar sakte hain.
              </Notice>
            )}
            {outcome.isProfitable && outcome.edgeRating === "strong_edge" && (
              <Notice kind="info">
                Solid Trader Edge: Har trade par <b>{fmtCurr(outcome.netExpectancyPerTrade)}</b> ki statistical edge hai. Kelly criterion ke mutabiq aap per-trade maximum <b>{outcome.halfKellyFractionPct.toFixed(1)}%</b> capital risk par rakh sakte hain.
              </Notice>
            )}

            {/* Step-by-step Walkthrough */}
            <Walkthrough
              steps={[
                {
                  title: "1. Loss Rate Calculation",
                  math: `Loss Rate = 100% - Win Rate (${outcome.winRatePct}%) = ${outcome.lossRatePct.toFixed(1)}% (Decimal: ${(outcome.lossRatePct / 100).toFixed(2)}).`,
                },
                {
                  title: "2. Gross Expectancy Formula",
                  math: `Gross Expectancy = (Win Rate × Avg Win) - (Loss Rate × Avg Loss) = (${(outcome.winRatePct / 100).toFixed(2)} × ${fmtCurr(outcome.avgWinAmount)}) - (${(outcome.lossRatePct / 100).toFixed(2)} × ${fmtCurr(outcome.avgLossAmount)}) = ${fmtCurr((outcome.winRatePct / 100) * outcome.avgWinAmount)} - ${fmtCurr(((100 - outcome.winRatePct) / 100) * outcome.avgLossAmount)} = ${fmtCurr(outcome.grossExpectancyPerTrade)}.`,
                },
                {
                  title: "3. Net Expectancy with Trading Costs",
                  math: `Net Expectancy = Gross Expectancy (${fmtCurr(outcome.grossExpectancyPerTrade)}) - Trading Cost (${fmtCurr(outcome.feePerTrade)}) = ${fmtCurr(outcome.netExpectancyPerTrade)} per trade.`,
                },
                {
                  title: "4. Projected Outcome over Sample",
                  math: `${outcome.tradesCount} trades execution ke baad projected return = ${outcome.tradesCount} × ${fmtCurr(outcome.netExpectancyPerTrade)} = ${fmtCurr(outcome.expectedTotalOutcome)}. (Total fees paid: ${fmtCurr(outcome.totalFeesImpact)}).`,
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Target}>
            Apna historical win rate %, average winning trade aur average losing trade bharein. System statistical expectancy aur break-even metrics calculate karega.
          </EmptyState>
        )
      }
      dock={
        inputsValid
          ? {
              label: "Trade Expectancy",
              value: fmtCurr(outcome.netExpectancyPerTrade),
              sub: `Total: ${fmtCurr(outcome.expectedTotalOutcome)}`,
              tone: outcome.isProfitable ? "up" : "down",
            }
          : null
      }
      note="Statistical Disclaimer: Expectancy historical sample par based probability model hai. Market conditions badalne par actual returns different ho sakte hain."
    />
  );
}
