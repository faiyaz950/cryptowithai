"use client";

import { useMemo, useState } from "react";
import { Bot, DollarSign, Layers, Percent, SlidersHorizontal, TrendingUp } from "lucide-react";
import { computeGridBot, type GridType } from "@/lib/calculators/gridBot";
import { fmtMoney, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
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

const GRID_LEVEL_PRESETS = [5, 10, 20, 30, 50];

const DEFAULTS = {
  lowerPrice: "60000",
  upperPrice: "72000",
  gridLevels: "20",
  investmentAmount: "5000",
  feePct: "0.075",
  gridType: "arithmetic" as GridType,
  cyclesPerDay: 8,
};

export default function GridBotCalculator() {
  const [lowerPrice, setLowerPrice] = useState(DEFAULTS.lowerPrice);
  const [upperPrice, setUpperPrice] = useState(DEFAULTS.upperPrice);
  const [gridLevels, setGridLevels] = useState(DEFAULTS.gridLevels);
  const [investmentAmount, setInvestmentAmount] = useState(DEFAULTS.investmentAmount);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [gridType, setGridType] = useState<GridType>(DEFAULTS.gridType);
  const [cyclesPerDay, setCyclesPerDay] = useState(DEFAULTS.cyclesPerDay);

  const n = {
    lowerPrice: toNum(lowerPrice),
    upperPrice: toNum(upperPrice),
    gridLevels: toNum(gridLevels),
    investmentAmount: toNum(investmentAmount),
    feePct: toNum(feePct, 0.075),
  };

  const outcome = useMemo(
    () =>
      computeGridBot({
        lowerPrice: n.lowerPrice,
        upperPrice: n.upperPrice,
        gridLevels: n.gridLevels,
        investmentAmount: n.investmentAmount,
        feePct: n.feePct,
        gridType,
        cyclesPerDay,
      }),
    [n.lowerPrice, n.upperPrice, n.gridLevels, n.investmentAmount, n.feePct, gridType, cyclesPerDay],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setLowerPrice(DEFAULTS.lowerPrice);
    setUpperPrice(DEFAULTS.upperPrice);
    setGridLevels(DEFAULTS.gridLevels);
    setInvestmentAmount(DEFAULTS.investmentAmount);
    setFeePct(DEFAULTS.feePct);
    setGridType(DEFAULTS.gridType);
    setCyclesPerDay(DEFAULTS.cyclesPerDay);
  };

  const bad = {
    lowerPrice: lowerPrice !== "" && !(n.lowerPrice > 0),
    upperPrice: upperPrice !== "" && !(n.upperPrice > n.lowerPrice),
    gridLevels: gridLevels !== "" && !(n.gridLevels >= 2 && n.gridLevels <= 200),
    investmentAmount: investmentAmount !== "" && !(n.investmentAmount > 0),
  };

  const inputs = (
    <>
      {/* Grid Mode Selector */}
      <div className="cx-field">
        <label className="cx-label">Grid Spacing Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
              gridType === "arithmetic"
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm"
                : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
            }`}
            onClick={() => setGridType("arithmetic")}
          >
            Arithmetic (Equal $ Spacing)
          </button>
          <button
            type="button"
            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
              gridType === "geometric"
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm"
                : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
            }`}
            onClick={() => setGridType("geometric")}
          >
            Geometric (Equal % Spacing)
          </button>
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Lower Price Boundary"
          hint="Grid range ka minimum price ($)"
          value={lowerPrice}
          onChange={setLowerPrice}
          prefix="$"
          min={0}
          invalid={bad.lowerPrice}
        />
        <Field
          label="Upper Price Boundary"
          hint="Grid range ka maximum price ($)"
          value={upperPrice}
          onChange={setUpperPrice}
          prefix="$"
          min={0}
          invalid={bad.upperPrice}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Total Investment ($)"
          hint="Bot capital allocation"
          value={investmentAmount}
          onChange={setInvestmentAmount}
          prefix="$"
          min={10}
          invalid={bad.investmentAmount}
        />
        <Field
          label="Trading Fee %"
          hint="Maker / Taker fee per order"
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
        />
      </div>

      {/* Grid Levels quick presets */}
      <div className="cx-field">
        <label className="cx-label">Number of Grid Levels ({gridLevels} Grids)</label>
        <div className="flex gap-1.5 mb-2">
          {GRID_LEVEL_PRESETS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                gridLevels === String(lvl)
                  ? "bg-white/15 border-white/40 text-white font-semibold"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setGridLevels(String(lvl))}
            >
              {lvl}
            </button>
          ))}
        </div>
        <Field
          label=""
          value={gridLevels}
          onChange={setGridLevels}
          suffix="Levels"
          min={2}
          invalid={bad.gridLevels}
        />
      </div>

      {/* Daily Executions slider */}
      <div className="cx-field">
        <label className="cx-label">
          Estimated Executions per Day: <strong>{cyclesPerDay} cycles</strong>
        </label>
        <Slider
          value={cyclesPerDay}
          onChange={(v) => setCyclesPerDay(Number(v))}
          min={1}
          max={50}
          step={1}
          scale={["1 cycle/day", "50 cycles/day"]}
        />
      </div>
    </>
  );

  const heroTone: "up" | "flat" | "down" = res
    ? res.isProfitablePerCycle
      ? "up"
      : "down"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Bot}>
      Lower & upper price, investment amount aur grid levels enter karein — per-cycle net profit aur projected annual APR calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label="Net Profit per Grid Cycle"
        value={fmtMoney(res.netProfitPerCycle)}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              +{res.netProfitPctPerCycle.toFixed(2)}% per Cycle
            </Pill>
            <span>Projected APR: +{res.projectedAprPct.toFixed(1)}%</span>
          </>
        }
      />

      {/* Grid Tightness Warning */}
      {!res.isProfitablePerCycle ? (
        <Notice kind="error">
          <span>
            <strong>Loss Making Grid:</strong> Grid spacing itni tight hai ki roundtrip exchange fees (
            <strong>{fmtMoney(res.tradingFeesPerCycle)}</strong>) gross profit (
            <strong>{fmtMoney(res.grossProfitPerCycle)}</strong>) se zyada ho gayi hain. Grid levels kam karein ya price range badhayein!
          </span>
        </Notice>
      ) : res.gridSpacingPct < 0.3 ? (
        <Notice kind="warn">
          <span>
            <strong>Narrow Grid Warning:</strong> Grid spacing sirf{" "}
            <strong>{res.gridSpacingPct.toFixed(2)}%</strong> hai. Exchange fees ke baad net margin kafi kam bachega. Standard recommended spacing 0.5% se 2.5% hoti hai.
          </span>
        </Notice>
      ) : (
        <Notice kind="info">
          <span>
            <strong>{res.gridType === "geometric" ? "Geometric Grid" : "Arithmetic Grid"}:</strong> Total{" "}
            <strong>{res.gridIntervals} intervals</strong> mein se har level par lagbhag{" "}
            <strong>{fmtMoney(res.allocationPerGrid)}</strong> allocate hoga. Spacing:{" "}
            <strong>±{fmtMoney(res.gridSpacingDollar)} ({res.gridSpacingPct.toFixed(2)}%)</strong>.
          </span>
        </Notice>
      )}

      {/* Cashflow Breakdown Flow */}
      <SectionTitle>Single Grid Cycle Cashflow</SectionTitle>
      <Flow
        rows={[
          {
            label: "Order Allocation per Grid Level",
            value: res.allocationPerGrid,
            text: fmtMoney(res.allocationPerGrid),
          },
          {
            label: `Gross Profit (${res.grossProfitPctPerCycle.toFixed(2)}% spacing)`,
            value: res.grossProfitPerCycle,
            text: `+${fmtMoney(res.grossProfitPerCycle)}`,
          },
          ...(res.tradingFeesPerCycle > 0
            ? [
                {
                  label: `Roundtrip Trading Fees (${(res.feePct * 2).toFixed(3)}%)`,
                  value: -res.tradingFeesPerCycle,
                  text: `-${fmtMoney(res.tradingFeesPerCycle)}`,
                },
              ]
            : []),
          {
            label: "Net Profit per Executed Cycle",
            value: res.netProfitPerCycle,
            text: fmtMoney(res.netProfitPerCycle),
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Net Profit / Cycle",
            value: fmtMoney(res.netProfitPerCycle),
            tone: heroTone,
          },
          {
            label: "Net Profit %",
            value: `+${res.netProfitPctPerCycle.toFixed(2)}%`,
            tone: heroTone,
          },
          {
            label: "Grid Spacing",
            value: `${fmtMoney(res.gridSpacingDollar)} (${res.gridSpacingPct.toFixed(2)}%)`,
            tone: "flat",
          },
          {
            label: "Est. Daily Profit",
            value: fmtMoney(res.dailyProjectedProfit),
            tone: "up",
          },
          {
            label: "Est. Monthly Profit",
            value: fmtMoney(res.monthlyProjectedProfit),
            tone: "up",
          },
          {
            label: "Projected APR %",
            value: `+${res.projectedAprPct.toFixed(1)}%`,
            tone: "up",
          },
          {
            label: "Break-even Cycles",
            value: `${res.breakevenCyclesForFullCapital} Cycles`,
          },
          {
            label: "Allocation / Grid",
            value: fmtMoney(res.allocationPerGrid),
          },
        ]}
      />

      {/* Sample Price Levels Preview */}
      <div className="cx-field">
        <label className="cx-label">Price Levels Preview ({res.priceLevels.length} lines)</label>
        <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-white/[0.02] border border-white/10 font-mono text-xs">
          {res.priceLevels.slice(0, 4).map((lvl, idx) => (
            <span key={idx} className="px-2 py-1 rounded bg-white/[0.04] text-slate-300">
              L{idx + 1}: {fmtMoney(lvl)}
            </span>
          ))}
          {res.priceLevels.length > 8 && (
            <span className="px-2 py-1 text-slate-500">... ({res.priceLevels.length - 8} more levels) ...</span>
          )}
          {res.priceLevels.slice(-4).map((lvl, idx) => (
            <span key={idx} className="px-2 py-1 rounded bg-white/[0.04] text-slate-300">
              L{res.priceLevels.length - 4 + idx + 1}: {fmtMoney(lvl)}
            </span>
          ))}
        </div>
      </div>

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Grid Spacing Formula",
            math:
              res.gridType === "geometric"
                ? `Geometric Ratio = (Upper / Lower)^(1 / Intervals) = (${fmtMoney(res.upperPrice)} / ${fmtMoney(res.lowerPrice)})^(1 / ${res.gridIntervals}) → Spacing = ${res.gridSpacingPct.toFixed(2)}%`
                : `Arithmetic Spacing = (Upper − Lower) ÷ (Levels − 1) = (${fmtMoney(res.upperPrice)} − ${fmtMoney(res.lowerPrice)}) ÷ ${res.gridIntervals} = ${fmtMoney(res.gridSpacingDollar)}`,
          },
          {
            title: "2. Order Allocation",
            math: `Allocation per Grid = Total Investment (${fmtMoney(res.investmentAmount)}) ÷ ${res.gridIntervals} intervals = ${fmtMoney(res.allocationPerGrid)}`,
          },
          {
            title: "3. Net Cycle Profit & APR Projection",
            math: `Net Profit = Gross Profit (${fmtMoney(res.grossProfitPerCycle)}) − Fees (${fmtMoney(res.tradingFeesPerCycle)}) = ${fmtMoney(res.netProfitPerCycle)} | Daily (${res.cyclesPerDay} cycles) = ${fmtMoney(res.dailyProjectedProfit)} → APR = +${res.projectedAprPct.toFixed(1)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Grid Bot Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Profit & Fee Projection"
      resultIcon={Bot}
      badge={<Pill tone={heroTone}>{res ? `+${res.netProfitPctPerCycle.toFixed(2)}%/cyc` : "Grid Bot"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Net Profit / Cycle",
              value: fmtMoney(res.netProfitPerCycle),
              sub: `APR: +${res.projectedAprPct.toFixed(1)}% · ${res.gridIntervals} intervals @ ${fmtMoney(res.gridSpacingDollar)}`,
              tone: heroTone,
            }
          : null
      }
      note="Grid trading sideways ranges mein best perform karta hai. Range se bahar breakdown hone par inventory loss aur breakout hone par opportunity loss ho sakta hai."
    />
  );
}
