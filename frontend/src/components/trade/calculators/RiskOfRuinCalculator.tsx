"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, Flame, Percent, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { computeRiskOfRuin } from "@/lib/calculators/riskOfRuin";
import { fmtMoney, toNum } from "@/lib/calculators/format";
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
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  winRatePct: "50",
  avgWin: "200",
  avgLoss: "100",
  riskPctPerTrade: "2",
  tradesCount: "100",
  startingCapital: "10000",
  ruinThresholdPct: "50",
};

export default function RiskOfRuinCalculator() {
  const [winRatePct, setWinRatePct] = useState(DEFAULTS.winRatePct);
  const [avgWin, setAvgWin] = useState(DEFAULTS.avgWin);
  const [avgLoss, setAvgLoss] = useState(DEFAULTS.avgLoss);
  const [riskPctPerTrade, setRiskPctPerTrade] = useState(DEFAULTS.riskPctPerTrade);
  const [tradesCount, setTradesCount] = useState(DEFAULTS.tradesCount);
  const [startingCapital, setStartingCapital] = useState(DEFAULTS.startingCapital);
  const [ruinThresholdPct, setRuinThresholdPct] = useState(DEFAULTS.ruinThresholdPct);

  // Quick seed regenerator for Monte Carlo re-run
  const [seed, setSeed] = useState(0);

  const n = {
    winRatePct: toNum(winRatePct),
    avgWin: toNum(avgWin),
    avgLoss: toNum(avgLoss),
    riskPctPerTrade: toNum(riskPctPerTrade),
    tradesCount: toNum(tradesCount),
    startingCapital: toNum(startingCapital),
    ruinThresholdPct: toNum(ruinThresholdPct, 50),
  };

  const outcome = useMemo(
    () =>
      computeRiskOfRuin({
        winRatePct: n.winRatePct,
        avgWin: n.avgWin,
        avgLoss: n.avgLoss,
        riskPctPerTrade: n.riskPctPerTrade,
        tradesCount: n.tradesCount,
        startingCapital: n.startingCapital,
        ruinThresholdPct: n.ruinThresholdPct,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      n.winRatePct,
      n.avgWin,
      n.avgLoss,
      n.riskPctPerTrade,
      n.tradesCount,
      n.startingCapital,
      n.ruinThresholdPct,
      seed,
    ],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setWinRatePct(DEFAULTS.winRatePct);
    setAvgWin(DEFAULTS.avgWin);
    setAvgLoss(DEFAULTS.avgLoss);
    setRiskPctPerTrade(DEFAULTS.riskPctPerTrade);
    setTradesCount(DEFAULTS.tradesCount);
    setStartingCapital(DEFAULTS.startingCapital);
    setRuinThresholdPct(DEFAULTS.ruinThresholdPct);
  };

  const bad = {
    winRatePct: winRatePct !== "" && !(n.winRatePct > 0 && n.winRatePct < 100),
    avgWin: avgWin !== "" && !(n.avgWin > 0),
    avgLoss: avgLoss !== "" && !(n.avgLoss > 0),
    riskPctPerTrade: riskPctPerTrade !== "" && !(n.riskPctPerTrade > 0 && n.riskPctPerTrade <= 50),
    startingCapital: startingCapital !== "" && !(n.startingCapital > 0),
  };

  const inputs = (
    <>
      <div className="cx-row-2">
        <Field
          label="Starting Capital"
          hint="Trading account balance ($)"
          value={startingCapital}
          onChange={setStartingCapital}
          prefix="$"
          min={100}
          invalid={bad.startingCapital}
        />
        <Field
          label="Risk per Trade %"
          hint="Per-trade risk (1-2% recommended)"
          value={riskPctPerTrade}
          onChange={setRiskPctPerTrade}
          suffix="%"
          min={0.1}
          invalid={bad.riskPctPerTrade}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Historical Win Rate %"
          hint="Backtest / Journal win rate"
          value={winRatePct}
          onChange={setWinRatePct}
          suffix="%"
          min={1}
          invalid={bad.winRatePct}
        />
        <Field
          label="Trade Horizon (Trades)"
          hint="Simulate next N trades"
          value={tradesCount}
          onChange={setTradesCount}
          min={10}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Average Win ($)"
          hint="Average winning trade profit"
          value={avgWin}
          onChange={setAvgWin}
          prefix="$"
          min={1}
          invalid={bad.avgWin}
        />
        <Field
          label="Average Loss ($)"
          hint="Average losing trade loss"
          value={avgLoss}
          onChange={setAvgLoss}
          prefix="$"
          min={1}
          invalid={bad.avgLoss}
        />
      </div>

      <Field
        label="Ruin Threshold (% Drawdown)"
        hint="Max acceptable equity loss (default 50%)"
        value={ruinThresholdPct}
        onChange={setRuinThresholdPct}
        suffix="%"
        min={10}
      />

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10 transition-colors flex items-center justify-center gap-2"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          Re-run 2,000 Monte Carlo Paths
        </button>
      </div>
    </>
  );

  const heroTone: "up" | "flat" | "down" = res
    ? res.riskOfRuinPct < 2
      ? "up"
      : res.riskOfRuinPct < 15
        ? "flat"
        : "down"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={ShieldAlert}>
      Win rate, average win/loss aur risk per trade enter karein — Monte Carlo engine probability of ruin calculate karega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label="Probability of Account Ruin"
        value={`${res.riskOfRuinPct.toFixed(1)}%`}
        tone={heroTone}
        sub={
          <>
            <Pill tone={res.riskOfRuinPct < 5 ? "up" : "down"}>
              {res.riskOfRuinPct < 1 ? "Very Low Risk" : res.riskOfRuinPct < 10 ? "Moderate Risk" : "High Danger"}
            </Pill>
            <span>Max Consecutive Losses: ~{res.expectedMaxLosingStreak} Trades</span>
          </>
        }
      />

      {/* Warning Notice */}
      {res.riskPctPerTrade > res.kellyCriterionPct && (
        <Notice kind="warn">
          <span>
            <strong>Over-betting Alert:</strong> Aapka per-trade risk (
            <strong>{res.riskPctPerTrade}%</strong>) full Kelly Criterion limit (
            <strong>{res.kellyCriterionPct.toFixed(1)}%</strong>) se zyada hai. Long-term run mein over-betting capital wipe-out kar sakti hai. Professional traders generally Half-Kelly (≤{Math.max(0.5, res.kellyCriterionPct / 2).toFixed(1)}%) trade karte hain.
          </span>
        </Notice>
      )}

      {/* Drawdown Probability Waterfall */}
      <SectionTitle>Drawdown Likelihood (Monte Carlo 2,000 Runs)</SectionTitle>
      <Flow
        rows={[
          {
            label: "Chance of ≥ 20% Peak-to-Trough Drawdown",
            value: res.prob20PctDrawdown,
            text: `${res.prob20PctDrawdown.toFixed(1)}%`,
          },
          {
            label: "Chance of ≥ 30% Peak-to-Trough Drawdown",
            value: res.prob30PctDrawdown,
            text: `${res.prob30PctDrawdown.toFixed(1)}%`,
          },
          {
            label: "Chance of ≥ 50% Severe Drawdown",
            value: res.prob50PctDrawdown,
            text: `${res.prob50PctDrawdown.toFixed(1)}%`,
          },
          {
            label: `Risk of Ruin (Wiping ${res.ruinThresholdPct}% Equity)`,
            value: res.riskOfRuinPct,
            text: `${res.riskOfRuinPct.toFixed(1)}%`,
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Risk of Ruin",
            value: `${res.riskOfRuinPct.toFixed(1)}%`,
            tone: res.riskOfRuinPct < 5 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Kelly Optimal Bet %",
            value: `${res.kellyCriterionPct.toFixed(1)}%`,
            tone: "flat",
          },
          {
            label: "Payoff Ratio (Win/Loss)",
            value: `${res.payoffRatio.toFixed(2)}x`,
            tone: res.payoffRatio >= 1.5 ? ("up" as const) : ("flat" as const),
          },
          {
            label: "Expected Edge / Trade",
            value: `${(res.expectedEdgePerTrade * 100).toFixed(1)}%`,
            tone: res.expectedEdgePerTrade > 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Median Final Capital",
            value: fmtMoney(res.medianFinalEquity),
            tone: res.medianFinalEquity > res.startingCapital ? ("up" as const) : ("down" as const),
          },
          {
            label: "Worst 5% Outcome",
            value: fmtMoney(res.worstCase5thPercentile),
            tone: "down",
          },
          {
            label: "Best 95% Outcome",
            value: fmtMoney(res.bestCase95thPercentile),
            tone: "up",
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Payoff Ratio & Edge",
            math: `Payoff Ratio = Avg Win (${fmtMoney(n.avgWin)}) / Avg Loss (${fmtMoney(n.avgLoss)}) = ${res.payoffRatio.toFixed(2)} | Edge = (${res.winRatePct}% × ${res.payoffRatio.toFixed(2)}) − ${100 - res.winRatePct}% = ${(res.expectedEdgePerTrade * 100).toFixed(1)}%`,
          },
          {
            title: "2. Kelly Criterion Sizing",
            math: `Kelly % = WinRate − (1 − WinRate) / Payoff = ${res.winRatePct}% − ${(100 - res.winRatePct).toFixed(1)}% / ${res.payoffRatio.toFixed(2)} = ${res.kellyCriterionPct.toFixed(1)}%`,
          },
          {
            title: "3. Losing Streak Expectancy",
            math: `Expected Max Consecutive Losses in ${res.tradesCount} trades = ceil(ln(${res.tradesCount}) / ln(1 / ${(1 - res.winRatePct / 100).toFixed(2)})) ≈ ${res.expectedMaxLosingStreak} losses in a row`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Risk & Strategy Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Monte Carlo Ruin Probability"
      resultIcon={AlertOctagon}
      badge={<Pill tone={res && res.riskOfRuinPct < 5 ? "up" : "down"}>{res ? `Ruin: ${res.riskOfRuinPct.toFixed(1)}%` : "Risk of Ruin"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Risk of Ruin",
              value: `${res.riskOfRuinPct.toFixed(1)}%`,
              sub: `Kelly: ${res.kellyCriterionPct.toFixed(1)}% · Max Streak: ~${res.expectedMaxLosingStreak} losses`,
              tone: res.riskOfRuinPct < 5 ? "up" : "down",
            }
          : null
      }
      note="Path dependency trading mein critical factor hoti hai. Positive expected value hone par bhi high leverage / oversized risk se capital wipe out ho sakta hai."
    />
  );
}
