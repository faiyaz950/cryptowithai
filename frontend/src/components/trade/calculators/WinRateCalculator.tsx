"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Trophy } from "lucide-react";
import { computeWinRate } from "@/lib/calculators/winRate";
import { fmtMoney, fmtNum, fmtPct, fmtSigned, toNum, tone } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Field,
  Flow,
  Hero,
  Meter,
  Notice,
  Optional,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  wins: "60",
  losses: "40",
  breakeven: "0",
  avgWin: "",
  avgLoss: "",
};

const SAMPLE_PRESETS = [
  { label: "60W / 40L (60%)", wins: "60", losses: "40", be: "0" },
  { label: "70W / 30L (70%)", wins: "70", losses: "30", be: "0" },
  { label: "50W / 50L (50%)", wins: "50", losses: "50", be: "0" },
  { label: "40W / 60L (40%)", wins: "40", losses: "60", be: "0" },
];

export default function WinRateCalculator() {
  const [wins, setWins] = useState(DEFAULTS.wins);
  const [losses, setLosses] = useState(DEFAULTS.losses);
  const [breakeven, setBreakeven] = useState(DEFAULTS.breakeven);
  const [avgWin, setAvgWin] = useState(DEFAULTS.avgWin);
  const [avgLoss, setAvgLoss] = useState(DEFAULTS.avgLoss);

  const n = {
    wins: toNum(wins),
    losses: toNum(losses),
    breakeven: toNum(breakeven, 0),
    avgWin: toNum(avgWin, NaN),
    avgLoss: toNum(avgLoss, NaN),
  };

  const outcome = useMemo(
    () =>
      computeWinRate({
        wins: n.wins,
        losses: n.losses,
        breakeven: n.breakeven,
        avgWin: n.avgWin,
        avgLoss: n.avgLoss,
      }),
    [n.wins, n.losses, n.breakeven, n.avgWin, n.avgLoss],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setWins(DEFAULTS.wins);
    setLosses(DEFAULTS.losses);
    setBreakeven(DEFAULTS.breakeven);
    setAvgWin(DEFAULTS.avgWin);
    setAvgLoss(DEFAULTS.avgLoss);
  };

  const bad = {
    wins: wins !== "" && !(n.wins >= 0),
    losses: losses !== "" && !(n.losses >= 0),
    breakeven: breakeven !== "" && !(n.breakeven >= 0),
    avgWin: avgWin !== "" && !(n.avgWin > 0),
    avgLoss: avgLoss !== "" && !(n.avgLoss > 0),
  };

  const inputs = (
    <>
      {/* Quick Preset Buttons */}
      <div>
        <span className="cx-label">Sample Presets</span>
        <div className="cx-chips" role="group" aria-label="Presets">
          {SAMPLE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="cx-chip"
              onClick={() => {
                setWins(p.wins);
                setLosses(p.losses);
                setBreakeven(p.be);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Winning Trades"
          hint="Munafa wale trades (W)"
          value={wins}
          onChange={setWins}
          min={0}
          invalid={bad.wins}
        />
        <Field
          label="Losing Trades"
          hint="Nuksaan wale trades (L)"
          value={losses}
          onChange={setLosses}
          min={0}
          invalid={bad.losses}
        />
      </div>

      <Field
        label="Breakeven Trades"
        hint="Zero P&L trades (Win Rate se alag rakha jata hai)"
        value={breakeven}
        onChange={setBreakeven}
        min={0}
        invalid={bad.breakeven}
      />

      <Optional>
        <span className="text-xs text-slate-400 block mb-2">
          Expectancy aur Profit Factor nikalne ke liye optional average amounts:
        </span>
        <div className="cx-row-2">
          <Field
            label="Average Win ($)"
            optional
            hint="Per winning trade munafa"
            value={avgWin}
            onChange={setAvgWin}
            prefix="$"
            min={0}
            invalid={bad.avgWin}
            placeholder="e.g. 250"
          />
          <Field
            label="Average Loss ($)"
            optional
            hint="Per losing trade nuksaan"
            value={avgLoss}
            onChange={setAvgLoss}
            prefix="$"
            min={0}
            invalid={bad.avgLoss}
            placeholder="e.g. 100"
          />
        </div>
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Trophy}>
      Winning aur losing trades ki sankhya daalein — strategy win rate live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Strategy Win Rate"
        value={`${res.basicWinRate.toFixed(1)}%`}
        sub={
          <>
            <Pill tone={res.basicWinRate >= 50 ? "up" : "down"}>
              {res.wins} Wins / {res.losses} Losses
            </Pill>
            <span>Total Trades: {res.totalTrades}</span>
          </>
        }
      />

      <Meter
        label="Win Rate Benchmark (50% Baseline)"
        valueText={`${res.basicWinRate.toFixed(1)}%`}
        pct={Math.min(100, res.basicWinRate)}
        high={res.basicWinRate >= 50}
      />

      <SectionTitle>Trade Outcome Distribution</SectionTitle>
      <Flow
        rows={[
          { label: `Wins (${res.wins})`, value: res.wins, text: `${res.basicWinRate.toFixed(1)}%` },
          { label: `Losses (${res.losses})`, value: res.losses, text: `${res.lossRate.toFixed(1)}%` },
          ...(res.breakeven > 0
            ? [{ label: `Breakeven (${res.breakeven})`, value: res.breakeven, text: `${res.breakevenRate.toFixed(1)}%` }]
            : []),
        ]}
      />

      <Stats
        items={[
          { label: "Basic Win Rate", value: `${fmtNum(res.basicWinRate)}%`, tone: res.basicWinRate >= 50 ? "up" : "down" },
          { label: "Loss Rate", value: `${fmtNum(res.lossRate)}%`, tone: "down" },
          { label: "Decisive Trades", value: `${res.totalDecisive} (Wins + Losses)` },
          { label: "Total Trades Tracked", value: `${res.totalTrades}` },
          { label: "Breakeven Trades", value: `${res.breakeven}` },
          ...(res.avgWin != null && res.avgLoss != null && res.profitFactor != null && res.expectancyPerTrade != null
            ? [
                {
                  label: "Profit Factor",
                  value: `${res.profitFactor.toFixed(2)}x`,
                  tone: (res.profitFactor >= 1.5 ? "up" : undefined) as "up" | undefined,
                },
                { label: "Payoff Ratio (R:R)", value: `1:${res.payoffRatio?.toFixed(2)}` },
                { label: "Expectancy / Trade", value: fmtSigned(res.expectancyPerTrade), tone: tone(res.expectancyPerTrade) },
                { label: "Net Strategy Profit", value: fmtSigned(res.totalProfit ?? 0), tone: tone(res.totalProfit) },
                { label: "Min Breakeven Win Rate", value: `${res.breakevenWinRateNeeded?.toFixed(1)}%` },
              ]
            : []),
        ]}
      />

      {res.avgWin != null && res.avgLoss != null && res.expectancyPerTrade != null && (
        <Notice kind={res.expectancyPerTrade > 0 ? "info" : "warn"}>
          {res.expectancyPerTrade > 0 ? (
            <span>
              <strong>Positive Edge!</strong> Aapki strategy ka har trade average <b>{fmtSigned(res.expectancyPerTrade)}</b> ka positive edge banata hai.
            </span>
          ) : (
            <span>
              <strong>Negative Edge!</strong> Har trade average <b>{fmtSigned(res.expectancyPerTrade)}</b> lose kar raha hai. Stop-loss tighten karein ya higher R:R trades lein.
            </span>
          )}
        </Notice>
      )}

      <Walkthrough
        steps={[
          {
            title: "Total Trades = Wins + Losses + Breakeven",
            math: `${res.wins} + ${res.losses} + ${res.breakeven} = ${res.totalTrades} total trades`,
          },
          {
            title: "Basic Win Rate = Wins ÷ (Wins + Losses) × 100",
            math: `${res.wins} ÷ (${res.wins} + ${res.losses}) × 100 = ${res.wins} ÷ ${res.totalDecisive} × 100 = ${res.basicWinRate.toFixed(2)}%`,
          },
          ...(res.breakeven > 0
            ? [
                {
                  title: "Total Win Rate (including breakeven trades)",
                  math: `${res.wins} ÷ ${res.totalTrades} × 100 = ${res.totalWinRate.toFixed(2)}%`,
                },
              ]
            : []),
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Strategy trade stats"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Strategy win rate analysis"
      resultIcon={Trophy}
      badge={<Pill tone={res && res.basicWinRate >= 50 ? "up" : "down"}>{res ? `${res.basicWinRate.toFixed(0)}% Win` : "Strategy"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Win Rate",
              value: `${res.basicWinRate.toFixed(1)}%`,
              sub: `${res.wins}W / ${res.losses}L (${res.totalTrades} total)`,
              tone: res.basicWinRate >= 50 ? "up" : "down",
            }
          : null
      }
      note="Trading mein sirf win rate kaafi nahi hota — risk-reward ratio (payoff) aur position sizing ke saath positive mathematical expectancy hona sabse zaroori hai."
    />
  );
}
