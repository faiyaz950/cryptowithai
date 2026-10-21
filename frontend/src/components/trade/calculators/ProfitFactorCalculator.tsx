"use client";

import { useMemo, useState } from "react";
import { Award, SlidersHorizontal } from "lucide-react";
import { computeProfitFactor } from "@/lib/calculators/profitFactor";
import { fmtMoney, fmtSigned, toNum } from "@/lib/calculators/format";
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
  grossProfit: "50000",
  grossLoss: "25000",
  winningTrades: "",
  losingTrades: "",
};

const SAMPLE_PRESETS = [
  { label: "2.0x (₹50k / ₹25k)", profit: "50000", loss: "25000" },
  { label: "1.5x (₹30k / ₹20k)", profit: "30000", loss: "20000" },
  { label: "3.0x (₹60k / ₹20k)", profit: "60000", loss: "20000" },
  { label: "0.8x Losing (₹20k / ₹25k)", profit: "20000", loss: "25000" },
];

export default function ProfitFactorCalculator() {
  const [grossProfit, setGrossProfit] = useState(DEFAULTS.grossProfit);
  const [grossLoss, setGrossLoss] = useState(DEFAULTS.grossLoss);
  const [winningTrades, setWinningTrades] = useState(DEFAULTS.winningTrades);
  const [losingTrades, setLosingTrades] = useState(DEFAULTS.losingTrades);

  const n = {
    grossProfit: toNum(grossProfit),
    grossLoss: toNum(grossLoss),
    winningTrades: toNum(winningTrades, NaN),
    losingTrades: toNum(losingTrades, NaN),
  };

  const outcome = useMemo(
    () =>
      computeProfitFactor({
        grossProfit: n.grossProfit,
        grossLoss: n.grossLoss,
        winningTrades: n.winningTrades,
        losingTrades: n.losingTrades,
      }),
    [n.grossProfit, n.grossLoss, n.winningTrades, n.losingTrades],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setGrossProfit(DEFAULTS.grossProfit);
    setGrossLoss(DEFAULTS.grossLoss);
    setWinningTrades(DEFAULTS.winningTrades);
    setLosingTrades(DEFAULTS.losingTrades);
  };

  const bad = {
    grossProfit: grossProfit !== "" && !(n.grossProfit >= 0),
    grossLoss: grossLoss !== "" && !(n.grossLoss >= 0),
    winningTrades: winningTrades !== "" && !(n.winningTrades >= 1),
    losingTrades: losingTrades !== "" && !(n.losingTrades >= 1),
  };

  const inputs = (
    <>
      <Field
        label="Gross Profit"
        hint="Winning trades ka total profit ($ / ₹)"
        value={grossProfit}
        onChange={setGrossProfit}
        prefix="$"
        min={0}
        invalid={bad.grossProfit}
      />

      <Field
        label="Gross Loss"
        hint="Losing trades ka total loss ($ / ₹)"
        value={grossLoss}
        onChange={setGrossLoss}
        prefix="$"
        min={0}
        invalid={bad.grossLoss}
      />

      <Chips
        options={SAMPLE_PRESETS.map((p) => p.label)}
        value={
          SAMPLE_PRESETS.find((p) => p.profit === grossProfit && p.loss === grossLoss)?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SAMPLE_PRESETS.find((p) => p.label === lbl);
          if (match) {
            setGrossProfit(match.profit);
            setGrossLoss(match.loss);
          }
        }}
        label="Scenarios"
      />

      <Optional>
        <Field
          label="Winning Trades Count"
          hint="Kul jeetne wale trades ki sankhya"
          value={winningTrades}
          onChange={setWinningTrades}
          min={1}
          optional
          invalid={bad.winningTrades}
        />
        <Field
          label="Losing Trades Count"
          hint="Kul haarne wale trades ki sankhya"
          value={losingTrades}
          onChange={setLosingTrades}
          min={1}
          optional
          invalid={bad.losingTrades}
        />
      </Optional>
    </>
  );

  const pfDisplay = res ? (res.isInfinite ? "∞ Undefeated" : `${res.profitFactor.toFixed(2)}x`) : "—";
  const heroTone: "up" | "down" | "flat" = res
    ? res.profitFactor >= 1.5
      ? "up"
      : res.profitFactor >= 1.0
      ? "flat"
      : "down"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Award}>
      Apne backtest ya trading journal ka Gross Profit aur Gross Loss enter karein — strategy quality aur profitability live dikhegi.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Profit Factor"
        value={pfDisplay}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>{res.tierLabel}</Pill>
            <span>Net P&L: {fmtSigned(res.netProfit)}</span>
          </>
        }
      />

      <Notice kind={res.profitFactor >= 1.5 ? "info" : res.profitFactor >= 1.0 ? "warn" : "error"}>
        {res.profitFactor >= 2.0 ? (
          <span>
            <strong>Excellent Performance!</strong> Aapka system har $1 ke loss par $
            {res.profitFactor.toFixed(2)} ka profit generate kar raha hai. Ye ek high-edge trading strategy ka sign hai.
          </span>
        ) : res.profitFactor >= 1.5 ? (
          <span>
            <strong>Solid Strategy!</strong> 1.5 - 2.0 ka Profit Factor live market trading ke liye healthy aur sustainable maana jata hai.
          </span>
        ) : res.profitFactor >= 1.0 ? (
          <span>
            <strong>Marginal Edge:</strong> 1.0 - 1.5 ka factor tight hai. Exchange fees, slippage aur funding costs aapke profits ko khatam kar sakti hain.
          </span>
        ) : (
          <span>
            <strong>Losing System:</strong> Profit Factor 1.0 se kam hone ka matlab hai strategy net loss mein hai.
          </span>
        )}
      </Notice>

      <SectionTitle>Gross Profit vs Gross Loss Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: "Gross Profit", value: res.grossProfit, text: fmtMoney(res.grossProfit) },
          { label: "Gross Loss", value: -res.grossLoss, text: `-${fmtMoney(res.grossLoss)}` },
          { label: "Net Strategy Profit", value: res.netProfit, text: fmtSigned(res.netProfit), total: true },
        ]}
      />

      <Stats
        items={[
          {
            label: "Profit Factor",
            value: pfDisplay,
            tone: res.profitFactor >= 1.5 ? ("up" as const) : res.profitFactor >= 1.0 ? ("warn" as const) : ("down" as const),
          },
          {
            label: "Net Profit / Loss",
            value: fmtSigned(res.netProfit),
            tone: res.netProfit > 0 ? ("up" as const) : res.netProfit < 0 ? ("down" as const) : ("flat" as const),
          },
          { label: "Gross Profit", value: fmtMoney(res.grossProfit), tone: "up" as const },
          { label: "Gross Loss", value: fmtMoney(res.grossLoss), tone: "down" as const },
          {
            label: "Return on Loss Ratio",
            value: res.isInfinite ? "∞" : `${(res.returnOnLossRatio * 100).toFixed(1)}%`,
          },
          ...(res.winningTrades != null && res.losingTrades != null && res.avgWin != null && res.avgLoss != null
            ? [
                { label: "Trades Tracked", value: `${res.winningTrades} Wins / ${res.losingTrades} Losses` },
                { label: "Average Win", value: fmtMoney(res.avgWin), tone: "up" as const },
                { label: "Average Loss", value: fmtMoney(res.avgLoss), tone: "down" as const },
                {
                  label: "Payoff Ratio (Avg W/L)",
                  value: res.payoffRatio ? `1:${res.payoffRatio.toFixed(2)}` : "—",
                },
                {
                  label: "Breakeven Win Rate Required",
                  value: res.impliedWinRateNeeded ? `${res.impliedWinRateNeeded.toFixed(1)}%` : "—",
                },
              ]
            : []),
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Profit Factor Formula",
            math: `Profit Factor = Gross Profit ÷ Gross Loss`,
          },
          {
            title: "Calculation",
            math: `${fmtMoney(res.grossProfit)} ÷ ${fmtMoney(res.grossLoss)} = ${pfDisplay}`,
          },
          {
            title: "Net Trading Profit",
            math: `${fmtMoney(res.grossProfit)} − ${fmtMoney(res.grossLoss)} = ${fmtSigned(res.netProfit)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Gross profit & loss"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Profit factor result"
      resultIcon={Award}
      badge={<Pill tone={heroTone}>{res ? pfDisplay : "Backtester"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Profit Factor",
              value: pfDisplay,
              sub: `Net Profit: ${fmtSigned(res.netProfit)}`,
              tone: heroTone,
            }
          : null
      }
      note="Profit Factor backtesting aur trading journal evaluation ka key metric hai. 1.5 se zyada hone par strategy robust maani jaati hai. Trading advice nahi."
    />
  );
}
