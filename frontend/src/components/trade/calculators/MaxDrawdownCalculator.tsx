"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, LineChart } from "lucide-react";
import { computeMaxDrawdown, parseEquitySeries } from "@/lib/calculators/maxDrawdown";
import { fmtMoney, fmtSigned } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Hero,
  Notice,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const PRESETS = [
  {
    label: "User's Example (100k → 90k → 130k)",
    data: "100000, 120000, 110000, 90000, 130000",
  },
  {
    label: "Crypto Cycle (10k → 24k → 7.5k → 22k)",
    data: "10000, 18000, 24000, 19000, 12000, 7500, 14000, 22000",
  },
  {
    label: "Moderate Dip (50k → 62k → 56k → 70k)",
    data: "50000, 55000, 62000, 58000, 56000, 64000, 70000",
  },
  {
    label: "Severe 50% Drawdown (100k → 150k → 75k)",
    data: "100000, 125000, 150000, 110000, 75000, 85000",
  },
];

export default function MaxDrawdownCalculator() {
  const [rawText, setRawText] = useState(PRESETS[0].data);

  const series = useMemo(() => parseEquitySeries(rawText), [rawText]);
  const outcome = useMemo(() => computeMaxDrawdown(series), [series]);

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setRawText(PRESETS[0].data);
  };

  const inputs = (
    <>
      <div className="cx-field">
        <label className="cx-label" htmlFor="equity-series-input">
          Equity Curve Points
          <em>comma, space ya line break se alag karein</em>
        </label>
        <textarea
          id="equity-series-input"
          rows={5}
          className="w-full rounded-lg bg-black/40 border border-white/10 p-3 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-y"
          placeholder="100000, 120000, 110000, 90000, 130000"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <span className="cx-hint">
          Portfolio ki chronological equity history enter karein (kam se kam 2 points).
        </span>
      </div>

      <Chips
        options={PRESETS.map((p) => p.label)}
        value={PRESETS.find((p) => p.data.trim() === rawText.trim())?.label ?? ""}
        onPick={(lbl) => {
          const match = PRESETS.find((p) => p.label === lbl);
          if (match) setRawText(match.data);
        }}
        label="Example Equity Curves"
      />
    </>
  );

  const ddDisplay = res ? `-${res.maxDrawdownPct.toFixed(2)}%` : "—";
  const heroTone: "up" | "down" | "flat" = res
    ? res.maxDrawdownPct > 25
      ? "down"
      : res.maxDrawdownPct > 10
      ? "flat"
      : "up"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={AlertOctagon}>
      Apni account equity ya backtest trade curve ke sequential points enter karein (e.g. 100000, 120000, 90000, 130000).
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Maximum Drawdown (Peak to Trough)"
        value={ddDisplay}
        tone={heroTone}
        sub={
          <>
            <Pill tone={res.isRecovered ? "up" : "down"}>
              {res.isRecovered ? "Recovered to New ATH" : `Current Drawdown: -${res.currentDrawdownPct.toFixed(1)}%`}
            </Pill>
            <span>
              Peak: {fmtMoney(res.peakBeforeMaxDD)} → Trough: {fmtMoney(res.troughEquity)} (-{fmtMoney(res.maxDrawdownAmount)})
            </span>
          </>
        }
      />

      <Notice kind={res.maxDrawdownPct > 30 ? "error" : res.maxDrawdownPct > 15 ? "warn" : "info"}>
        <span>
          <strong>Recovery Math:</strong> -{res.maxDrawdownPct.toFixed(1)}% drawdown se recover hokar wapas peak par aane ke liye{" "}
          <strong className="text-cyan-400">+{res.gainNeededToRecoverFromMaxDD.toFixed(1)}% gain</strong> ki zaroorat hoti hai.
          {res.isRecovered
            ? " Equity curve ne successfully is drawdown ko overcome karke naya All-Time High banaya."
            : " Equity abhi bhi historical peak se neeche hai."}
        </span>
      </Notice>

      <SectionTitle>Drawdown Progression Table</SectionTitle>
      <div className="overflow-x-auto my-3 border border-white/10 rounded-lg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 bg-white/[0.02]">
              <th className="py-2 px-3">Point</th>
              <th className="py-2 px-3">Equity</th>
              <th className="py-2 px-3">Running Peak</th>
              <th className="py-2 px-3">Drawdown %</th>
              <th className="py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {res.points.map((p) => (
              <tr
                key={p.step}
                className={`border-b border-white/5 transition-colors ${
                  p.isMaxDrawdownTrough
                    ? "bg-rose-500/10 font-bold"
                    : p.isPeak
                    ? "bg-emerald-500/5"
                    : ""
                }`}
              >
                <td className="py-2 px-3 font-mono text-slate-400">#{p.step}</td>
                <td className="py-2 px-3 font-semibold text-white">{fmtMoney(p.equity)}</td>
                <td className="py-2 px-3 text-slate-300">{fmtMoney(p.peak)}</td>
                <td
                  className={`py-2 px-3 font-mono ${
                    p.drawdownPct === 0
                      ? "text-slate-500"
                      : p.isMaxDrawdownTrough
                      ? "text-rose-400 font-bold"
                      : "text-amber-400"
                  }`}
                >
                  {p.drawdownPct === 0 ? "0.0%" : `-${p.drawdownPct.toFixed(1)}%`}
                </td>
                <td className="py-2 px-3">
                  {p.isMaxDrawdownTrough ? (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Max Trough
                    </span>
                  ) : p.isPeak ? (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      New Peak
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">Pullback</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Stats
        items={[
          { label: "Max Drawdown %", value: `-${res.maxDrawdownPct.toFixed(2)}%`, tone: "down" as const },
          { label: "Max Drop from Peak", value: `-${fmtMoney(res.maxDrawdownAmount)}`, tone: "down" as const },
          { label: "Peak Before Drop", value: fmtMoney(res.peakBeforeMaxDD), tone: "up" as const },
          { label: "Trough (Lowest Point)", value: fmtMoney(res.troughEquity), tone: "down" as const },
          {
            label: "Gain Needed to Recover",
            value: `+${res.gainNeededToRecoverFromMaxDD.toFixed(1)}%`,
            tone: res.gainNeededToRecoverFromMaxDD > 50 ? ("warn" as const) : undefined,
          },
          { label: "All-Time High (ATH)", value: fmtMoney(res.allTimeHigh), tone: "up" as const },
          {
            label: "Current Drawdown from ATH",
            value: res.currentDrawdownPct === 0 ? "0.0% (At ATH)" : `-${res.currentDrawdownPct.toFixed(1)}%`,
            tone: res.currentDrawdownPct === 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Total Net Curve Return",
            value: fmtSigned(res.netReturnAmount),
            tone: res.netReturnAmount >= 0 ? ("up" as const) : ("down" as const),
          },
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Drawdown % Formula",
            math: `Drawdown % = (Peak − Current Equity) ÷ Peak × 100`,
          },
          {
            title: "Max Drawdown in Series",
            math: `Peak (${fmtMoney(res.peakBeforeMaxDD)}) − Trough (${fmtMoney(res.troughEquity)}) = ${fmtMoney(res.maxDrawdownAmount)} (${res.maxDrawdownPct.toFixed(2)}%)`,
          },
          {
            title: "Recovery Gain Needed",
            math: `Gain Needed = (Peak − Trough) ÷ Trough = +${res.gainNeededToRecoverFromMaxDD.toFixed(1)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Equity curve points"
      inputsIcon={LineChart}
      onReset={reset}
      inputs={inputs}
      resultTitle="Drawdown & recovery analytics"
      resultIcon={AlertOctagon}
      badge={<Pill tone={res?.isRecovered ? "up" : "down"}>{res ? ddDisplay : "Risk Metric"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Max Drawdown",
              value: ddDisplay,
              sub: `Trough: ${fmtMoney(res.troughEquity)} (-${fmtMoney(res.maxDrawdownAmount)})`,
              tone: "down",
            }
          : null
      }
      note="Max Drawdown portfolio risk ka standard benchmark hai. Drawdown jitna gehra hota hai, recover karne ke liye utna hi exponentially zyada profit gain chahiye hota hai. Trading advice nahi."
    />
  );
}
