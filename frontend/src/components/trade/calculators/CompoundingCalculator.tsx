"use client";

import { useMemo, useState } from "react";
import { Calendar, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import {
  computeCompounding,
  type CompoundFrequency,
} from "@/lib/calculators/compounding";
import { fmtMoney, fmtNum, fmtPct, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Pill,
  SectionTitle,
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  initialCapital: "10000",
  periodicContribution: "500",
  expectedReturnPct: "12",
  frequency: "monthly" as CompoundFrequency,
  durationYears: "5",
};

const FREQ_OPTIONS: { id: CompoundFrequency; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annually", label: "Annually" },
  { id: "daily", label: "Daily" },
];

const RETURN_PRESETS = ["8", "12", "15", "20", "25"];
const YEAR_PRESETS = ["1", "3", "5", "10", "20"];

export default function CompoundingCalculator() {
  const [initialCapital, setInitialCapital] = useState(DEFAULTS.initialCapital);
  const [periodicContribution, setPeriodicContribution] = useState(DEFAULTS.periodicContribution);
  const [expectedReturnPct, setExpectedReturnPct] = useState(DEFAULTS.expectedReturnPct);
  const [frequency, setFrequency] = useState<CompoundFrequency>(DEFAULTS.frequency);
  const [durationYears, setDurationYears] = useState(DEFAULTS.durationYears);

  const n = {
    initialCapital: toNum(initialCapital),
    periodicContribution: toNum(periodicContribution, 0),
    expectedReturnPct: toNum(expectedReturnPct),
    durationYears: toNum(durationYears),
  };

  const outcome = useMemo(
    () =>
      computeCompounding({
        initialCapital: n.initialCapital,
        periodicContribution: n.periodicContribution,
        expectedReturnPct: n.expectedReturnPct,
        frequency,
        durationYears: n.durationYears,
      }),
    [n.initialCapital, n.periodicContribution, n.expectedReturnPct, frequency, n.durationYears],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setInitialCapital(DEFAULTS.initialCapital);
    setPeriodicContribution(DEFAULTS.periodicContribution);
    setExpectedReturnPct(DEFAULTS.expectedReturnPct);
    setFrequency(DEFAULTS.frequency);
    setDurationYears(DEFAULTS.durationYears);
  };

  const bad = {
    initialCapital: initialCapital !== "" && !(n.initialCapital >= 0),
    periodicContribution: periodicContribution !== "" && !(n.periodicContribution >= 0),
    expectedReturnPct: expectedReturnPct !== "" && !(n.expectedReturnPct >= -90 && n.expectedReturnPct <= 500),
    durationYears: durationYears !== "" && !(n.durationYears > 0 && n.durationYears <= 50),
  };

  const inputs = (
    <>
      <div className="cx-row-2">
        <Field
          label="Initial Capital"
          hint="Shuruati rashi (P)"
          value={initialCapital}
          onChange={setInitialCapital}
          prefix="$"
          min={0}
          invalid={bad.initialCapital}
        />
        <Field
          label="Periodic Contribution"
          hint="Har interval par deposit (C)"
          value={periodicContribution}
          onChange={setPeriodicContribution}
          prefix="$"
          min={0}
          invalid={bad.periodicContribution}
        />
      </div>

      <div>
        <span className="cx-label">
          <Calendar className="w-3.5 h-3.5 inline mr-1" />
          Deposit &amp; Compounding Frequency
        </span>
        <div className="cx-chips" role="group" aria-label="Frequency">
          {FREQ_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="cx-chip"
              data-active={frequency === f.id}
              onClick={() => setFrequency(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Field
          label="Expected Annual Return"
          hint="Varshik apekshit return % (r)"
          value={expectedReturnPct}
          onChange={setExpectedReturnPct}
          suffix="%"
          min={-90}
          invalid={bad.expectedReturnPct}
        />
        <Slider
          value={n.expectedReturnPct}
          onChange={setExpectedReturnPct}
          min={1}
          max={50}
          step={0.5}
          scale={["1%", "50%"]}
        />
        <Chips
          options={RETURN_PRESETS}
          value={expectedReturnPct}
          onPick={setExpectedReturnPct}
          suffix="%"
          label="Return presets"
        />
      </div>

      <div>
        <Field
          label="Duration (Years)"
          hint="Kitne saal tak invest karenge (n)"
          value={durationYears}
          onChange={setDurationYears}
          suffix="yrs"
          min={1}
          invalid={bad.durationYears}
        />
        <Chips
          options={YEAR_PRESETS}
          value={durationYears}
          onPick={setDurationYears}
          suffix=" yrs"
          label="Duration presets"
        />
      </div>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Sparkles}>
      Capital, return aur duration daalein — compound growth projection live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Projected Future Value (FV)"
        value={fmtMoney(res.futureValue)}
        sub={
          <>
            <Pill tone="up">
              Compound Interest: {fmtSigned(res.totalInterest)}
            </Pill>
            <span>Total Invested: {fmtMoney(res.totalDeposited)}</span>
          </>
        }
      />

      {/* Crucial Required UI Notice */}
      <Notice kind="info">
        <strong>Illustrative projection based on the selected assumptions.</strong>
        <p style={{ marginTop: 4, fontSize: "12px", opacity: 0.9 }}>
          Ye calculator educational purpose ke liye hai aur kisi bhi prakar ke guaranteed future profit ya returns ka claim nahi karta. Asli market returns volatile aur anishchit ho sakte hain.
        </p>
      </Notice>

      <SectionTitle>Capital vs Compound Growth Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: "Principal Capital", value: res.initialCapital, text: fmtMoney(res.initialCapital) },
          {
            label: `Periodic Contributions (${res.totalPeriods}×)`,
            value: res.totalDeposited - res.initialCapital,
            text: fmtMoney(res.totalDeposited - res.initialCapital),
          },
          { label: "Compound Growth (Interest)", value: res.totalInterest, text: `+${fmtMoney(res.totalInterest)}` },
          { label: "Total Projected Value", value: res.futureValue, text: fmtMoney(res.futureValue), total: true },
        ]}
      />

      <Stats
        items={[
          { label: "Projected Value (FV)", value: fmtMoney(res.futureValue), tone: "up" },
          { label: "Total Deposited", value: fmtMoney(res.totalDeposited) },
          { label: "Total Interest Earned", value: fmtMoney(res.totalInterest), tone: "up" },
          { label: "Wealth Gain %", value: fmtPct(res.interestToDepositedRatio), tone: "up" },
          { label: "Expected Annual Return", value: `${fmtNum(res.expectedReturnPct)}%` },
          { label: "Duration", value: `${res.durationYears} Years (${res.totalPeriods} periods)` },
        ]}
      />

      {/* Yearly Milestones Table */}
      {res.milestones.length > 0 && (
        <>
          <SectionTitle>Year-by-Year Growth Projection</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold">
                  <th className="pb-2 pr-3">Year</th>
                  <th className="pb-2 pr-3">Deposited</th>
                  <th className="pb-2 pr-3">Interest Growth</th>
                  <th className="pb-2">Total Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {res.milestones.map((m) => (
                  <tr key={m.year} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 text-slate-300 font-sans font-medium">Year {m.year}</td>
                    <td className="py-2.5 pr-3 text-slate-400">{fmtMoney(m.deposits)}</td>
                    <td className="py-2.5 pr-3 text-emerald-400">+{fmtMoney(m.interest)}</td>
                    <td className="py-2.5 font-bold text-sky-400">{fmtMoney(m.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Walkthrough
        steps={[
          {
            title: "Periodic Rate (r) & Number of Periods (n)",
            math: `r = ${fmtNum(res.expectedReturnPct)}% ÷ ${res.frequency === "monthly" ? "12" : res.frequency === "daily" ? "365" : "1"} = ${(res.periodicRate * 100).toFixed(4)}%, n = ${res.totalPeriods} periods`,
          },
          {
            title: "Initial Capital Growth = P(1 + r)^n",
            math: `${fmtMoney(res.initialCapital)} × (1 + ${(res.periodicRate).toFixed(5)})^${res.totalPeriods} = ${fmtMoney(res.initialCapital * Math.pow(1 + res.periodicRate, res.totalPeriods))}`,
          },
          {
            title: "Recurring Contributions Growth = C × [((1+r)^n − 1) ÷ r]",
            math: `${fmtMoney(res.periodicContribution)} × [((1 + ${(res.periodicRate).toFixed(5)})^${res.totalPeriods} − 1) ÷ ${(res.periodicRate).toFixed(5)}] = ${fmtMoney(
              res.futureValue - res.initialCapital * Math.pow(1 + res.periodicRate, res.totalPeriods),
            )}`,
          },
          {
            title: "Total Future Value (FV)",
            math: `Initial Growth + Contributions Growth = ${fmtMoney(res.futureValue)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Compounding parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Compound growth projection"
      resultIcon={Sparkles}
      badge={<Pill tone="up">{res ? `${res.durationYears} Years` : "Compounding"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Future Value",
              value: fmtMoney(res.futureValue),
              sub: `+${fmtMoney(res.totalInterest)} interest · ${res.durationYears} yrs`,
            }
          : null
      }
      note="Illustrative projection based on the selected assumptions. Past performance and mathematical models do not guarantee future returns. Trading & investment advice nahi."
    />
  );
}
