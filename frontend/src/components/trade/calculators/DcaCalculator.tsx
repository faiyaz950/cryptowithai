"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calendar, Coins, History, Repeat, SlidersHorizontal, TrendingUp } from "lucide-react";
import { computeDca, HISTORICAL_DATASETS, type DcaFrequency } from "@/lib/calculators/dca";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum, tone } from "@/lib/calculators/format";
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

const FREQ_OPTIONS: { id: DcaFrequency; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Bi-weekly" },
  { id: "monthly", label: "Monthly" },
];

export default function DcaCalculator() {
  const [activeDatasetId, setActiveDatasetId] = useState<string>("btc_bull_2023_2024");
  const [recurringInvestment, setRecurringInvestment] = useState<string>("500");
  const [frequency, setFrequency] = useState<DcaFrequency>("monthly");
  const [customPriceInput, setCustomPriceInput] = useState<string>("");
  const [currentPriceOverride, setCurrentPriceOverride] = useState<string>("");

  const selectedDataset = useMemo(
    () => HISTORICAL_DATASETS.find((d) => d.id === activeDatasetId) ?? HISTORICAL_DATASETS[0],
    [activeDatasetId],
  );

  const priceSeries = useMemo(() => {
    if (activeDatasetId === "custom") {
      return customPriceInput
        .split(/[\s,;]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    return selectedDataset.prices;
  }, [activeDatasetId, customPriceInput, selectedDataset]);

  const n = {
    recurringInvestment: toNum(recurringInvestment),
    currentPrice: toNum(currentPriceOverride, selectedDataset.currentPrice),
  };

  const outcome = useMemo(
    () =>
      computeDca({
        recurringInvestment: n.recurringInvestment,
        frequency,
        priceSeries,
        currentPrice: n.currentPrice,
      }),
    [n.recurringInvestment, frequency, priceSeries, n.currentPrice],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setActiveDatasetId("btc_bull_2023_2024");
    setRecurringInvestment("500");
    setFrequency("monthly");
    setCustomPriceInput("");
    setCurrentPriceOverride("");
  };

  const bad = {
    recurringInvestment: recurringInvestment !== "" && !(n.recurringInvestment > 0),
    currentPrice: currentPriceOverride !== "" && !(n.currentPrice > 0),
  };

  const inputs = (
    <>
      <div className="cx-field">
        <label className="cx-label">Historical / Simulated Scenario</label>
        <div className="grid grid-cols-1 gap-1.5">
          {HISTORICAL_DATASETS.map((ds) => (
            <button
              key={ds.id}
              type="button"
              className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-between ${
                activeDatasetId === ds.id
                  ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
              }`}
              onClick={() => {
                setActiveDatasetId(ds.id);
                setCurrentPriceOverride(String(ds.currentPrice));
              }}
            >
              <span>{ds.name}</span>
              <span className="font-mono text-[11px] opacity-75">{ds.asset}</span>
            </button>
          ))}
          <button
            type="button"
            className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              activeDatasetId === "custom"
                ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                : "bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
            }`}
            onClick={() => setActiveDatasetId("custom")}
          >
            Custom Price Ladder / Manual Input
          </button>
        </div>
      </div>

      <Field
        label="Investment per Purchase"
        hint="Har cycle par kitna amount invest karna hai"
        value={recurringInvestment}
        onChange={setRecurringInvestment}
        prefix="$"
        min={1}
        invalid={bad.recurringInvestment}
      />

      <div className="cx-field">
        <label className="cx-label">Purchase Frequency</label>
        <div className="grid grid-cols-4 gap-1">
          {FREQ_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                frequency === f.id
                  ? "bg-cyan-500 text-black border-cyan-400"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setFrequency(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {activeDatasetId === "custom" && (
        <div className="cx-field">
          <label className="cx-label">
            Custom Purchase Prices (Comma or space separated)
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg bg-black/40 border border-white/10 p-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            placeholder="100, 90, 80, 70, 85, 110"
            value={customPriceInput}
            onChange={(e) => setCustomPriceInput(e.target.value)}
          />
          <span className="cx-hint">
            Har purchase ka price daalein (e.g. 100, 80).
          </span>
        </div>
      )}

      <Field
        label="Current Market / Exit Price"
        hint="P&L aur portfolio value calculate karne ke liye current price"
        value={currentPriceOverride || String(selectedDataset.currentPrice)}
        onChange={setCurrentPriceOverride}
        prefix="$"
        min={0.01}
        invalid={bad.currentPrice}
      />

      <Chips
        options={["50", "100", "250", "500", "1000"]}
        value={recurringInvestment}
        onPick={setRecurringInvestment}
        suffix="$"
        label="Quick amount presets"
      />
    </>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.netPnl > 0
      ? "up"
      : res.netPnl < 0
      ? "down"
      : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Repeat}>
      Investment amount aur historical ya custom price data select karein — average entry aur returns live dikhenge.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Metric */}
      <Hero
        label="Average Entry Price"
        value={fmtMoney(res.averagePrice)}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              Unrealized Return: {res.roiPct >= 0 ? "+" : ""}
              {res.roiPct.toFixed(2)}%
            </Pill>
            <span>Current Value: {fmtMoney(res.currentValue)}</span>
          </>
        }
      />

      {/* Notice with DCA Advantage */}
      <Notice kind={res.netPnl >= 0 ? "info" : "warn"}>
        <span>
          <strong>DCA Edge:</strong> Aapne total <strong>{res.orders.length} orders</strong> ke zariye{" "}
          <strong>{fmtMoney(res.totalInvestment)}</strong> invest karke{" "}
          <strong className="text-cyan-400">{fmtQty(res.totalQuantity)} coins</strong> accumulate kiye.
          {res.dcaAdvantage > 0 ? (
            <span>
              {" "}Lump-sum (pehla price) ke mukable DCA ne aapko{" "}
              <strong className="text-emerald-400">+{fmtMoney(res.dcaAdvantage)}</strong> ka advantage diya.
            </span>
          ) : (
            <span>
              {" "}Regular buying ne volatility ko smooth karke consistent average entry banayi.
            </span>
          )}
        </span>
      </Notice>

      {/* Breakdown Flow */}
      <SectionTitle>Capital Invested vs Portfolio Value</SectionTitle>
      <Flow
        rows={[
          { label: "Total Invested Capital", value: res.totalInvestment, text: fmtMoney(res.totalInvestment) },
          { label: "Current Portfolio Value", value: res.currentValue, text: fmtMoney(res.currentValue) },
          { label: "Unrealized P&L", value: res.netPnl, text: fmtSigned(res.netPnl), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Total Invested", value: fmtMoney(res.totalInvestment) },
          { label: "Total Coins Accumulated", value: `${fmtQty(res.totalQuantity)} coins`, tone: "up" as const },
          { label: "Average Entry Price", value: fmtMoney(res.averagePrice), tone: "up" as const },
          { label: "Current Market Price", value: fmtMoney(res.currentPrice) },
          { label: "Current Portfolio Value", value: fmtMoney(res.currentValue), tone: "up" as const },
          {
            label: "Unrealized P&L ($)",
            value: fmtSigned(res.netPnl),
            tone: res.netPnl > 0 ? ("up" as const) : res.netPnl < 0 ? ("down" as const) : ("flat" as const),
          },
          {
            label: "Unrealized Return (%)",
            value: `${res.roiPct >= 0 ? "+" : ""}${res.roiPct.toFixed(2)}%`,
            tone: res.roiPct > 0 ? ("up" as const) : res.roiPct < 0 ? ("down" as const) : ("flat" as const),
          },
          {
            label: "DCA vs Lump-Sum Edge",
            value: fmtSigned(res.dcaAdvantage),
            tone: res.dcaAdvantage > 0 ? ("up" as const) : res.dcaAdvantage < 0 ? ("down" as const) : ("flat" as const),
          },
        ]}
      />

      {/* Periodic Purchases Table */}
      <SectionTitle>DCA Purchases History / Ladder</SectionTitle>
      <div className="overflow-x-auto my-3 border border-white/10 rounded-lg max-h-64 overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 border-b border-white/10 z-10">
            <tr className="text-slate-400">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Price</th>
              <th className="py-2 px-3">Invested</th>
              <th className="py-2 px-3">Coins Bought</th>
              <th className="py-2 px-3">Running Avg Entry</th>
            </tr>
          </thead>
          <tbody>
            {res.orders.map((o) => (
              <tr key={o.period} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 px-3 text-slate-400 font-mono">{o.label}</td>
                <td className="py-2 px-3 font-semibold text-white">{fmtMoney(o.price)}</td>
                <td className="py-2 px-3 text-slate-300">{fmtMoney(o.investment)}</td>
                <td className="py-2 px-3 text-cyan-400 font-mono">+{fmtQty(o.quantity)}</td>
                <td className="py-2 px-3 font-mono font-medium text-amber-300">{fmtMoney(o.averagePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Total Quantity Formula",
            math: `Total Coins = Σ (Investment ÷ Price) = ${fmtQty(res.totalQuantity)} coins`,
          },
          {
            title: "2. Average Entry Price",
            math: `Average Entry = Total Investment (${fmtMoney(res.totalInvestment)}) ÷ Total Coins (${fmtQty(res.totalQuantity)}) = ${fmtMoney(res.averagePrice)}`,
          },
          {
            title: "3. Current Value & Return",
            math: `Value = ${fmtQty(res.totalQuantity)} coins × ${fmtMoney(res.currentPrice)} = ${fmtMoney(res.currentValue)} (P&L: ${fmtSigned(res.netPnl)})`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="DCA Strategy Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="DCA Performance & Average Entry"
      resultIcon={Repeat}
      badge={<Pill tone={heroTone}>{res ? `Avg: ${fmtMoney(res.averagePrice)}` : "DCA"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "DCA Avg Entry",
              value: fmtMoney(res.averagePrice),
              sub: `Coins: ${fmtQty(res.totalQuantity)} · P&L: ${fmtSigned(res.netPnl)}`,
              tone: heroTone,
            }
          : null
      }
      note="Dollar Cost Averaging (DCA) market volatility aur FOMO emotional mistakes ko reduce karta hai. Historical simulation past performance par based hai aur future returns ki guarantee nahi deta. Trading advice nahi."
    />
  );
}
