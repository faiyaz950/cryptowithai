"use client";

import { useMemo, useState } from "react";
import { Activity, Flame, Gauge, SlidersHorizontal, TrendingUp } from "lucide-react";
import {
  computeVolatility,
  VOLATILITY_PRESETS,
  type VolatilityPreset,
  type VolatilityTimeframe,
} from "@/lib/calculators/volatility";
import { fmtNum, toNum } from "@/lib/calculators/format";
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
  Stats,
  Walkthrough,
} from "./ui";

const TIMEFRAME_OPTIONS: { id: VolatilityTimeframe; label: string; periods: string }[] = [
  { id: "1d", label: "1D (Daily)", periods: "365 p/yr" },
  { id: "4h", label: "4H (4-Hour)", periods: "2,190 p/yr" },
  { id: "1h", label: "1H (Hourly)", periods: "8,760 p/yr" },
];

const LOOKBACK_PRESETS = [7, 14, 30, 60];

const DEFAULTS = {
  presetId: "btc",
  timeframe: "1d" as VolatilityTimeframe,
  lookback: 14,
  priceText: VOLATILITY_PRESETS[0].samplePrices.join(", "),
};

export default function VolatilityCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [timeframe, setTimeframe] = useState<VolatilityTimeframe>(DEFAULTS.timeframe);
  const [lookback, setLookback] = useState(DEFAULTS.lookback);
  const [priceText, setPriceText] = useState(DEFAULTS.priceText);

  // Parse comma or newline or space separated numbers
  const parsedPrices = useMemo(() => {
    return priceText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [priceText]);

  const outcome = useMemo(
    () =>
      computeVolatility({
        timeframe,
        lookbackPeriods: lookback,
        prices: parsedPrices,
      }),
    [timeframe, lookback, parsedPrices],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const selectPreset = (p: VolatilityPreset) => {
    setActivePreset(p.id);
    setPriceText(p.samplePrices.join(", "));
  };

  const reset = () => {
    setActivePreset(DEFAULTS.presetId);
    setTimeframe(DEFAULTS.timeframe);
    setLookback(DEFAULTS.lookback);
    setPriceText(DEFAULTS.priceText);
  };

  const inputs = (
    <>
      {/* Preset Coins */}
      <div className="cx-field">
        <label className="cx-label">Preset Assets</label>
        <div className="flex flex-wrap gap-1.5">
          {VOLATILITY_PRESETS.map((p) => {
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  active
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
                }`}
                onClick={() => selectPreset(p)}
              >
                {p.symbol} <span className="opacity-75 font-normal">(~{p.typicalAnnualizedVol}%)</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeframe selector */}
      <div className="cx-field">
        <label className="cx-label">Candle Timeframe</label>
        <div className="grid grid-cols-3 gap-2">
          {TIMEFRAME_OPTIONS.map((tf) => (
            <button
              key={tf.id}
              type="button"
              className={`py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition-colors ${
                timeframe === tf.id
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setTimeframe(tf.id)}
            >
              <div>{tf.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{tf.periods}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Lookback intervals */}
      <div className="cx-field">
        <label className="cx-label">Lookback Period (Intervals)</label>
        <div className="flex gap-2">
          {LOOKBACK_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                lookback === p
                  ? "bg-white/15 border-white/40 text-white font-semibold"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setLookback(p)}
            >
              {p} Periods
            </button>
          ))}
        </div>
      </div>

      {/* Raw Historical Prices Input */}
      <div className="cx-field">
        <label className="cx-label">
          Historical Closing Prices ({parsedPrices.length} points)
        </label>
        <textarea
          rows={3}
          className="w-full text-xs font-mono bg-white/[0.03] border border-white/10 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 transition-colors"
          value={priceText}
          onChange={(e) => {
            setPriceText(e.target.value);
            setActivePreset(null);
          }}
          placeholder="Comma ya space separated prices (e.g. 64200, 65100, 64800, 66300...)"
        />
        <div className="text-[11px] text-slate-400 mt-1">
          Historical closing prices enter karein. System consecutive returns calculate karke standard deviation aur annualized volatility measure karega.
        </div>
      </div>
    </>
  );

  const heroTone: "up" | "flat" | "down" = res
    ? res.volatilityLevel === "extreme" || res.volatilityLevel === "high"
      ? "down"
      : res.volatilityLevel === "moderate"
        ? "flat"
        : "up"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Gauge}>
      Closing prices aur timeframe select karein — current period volatility aur 365-day annualized volatility calculate hogi.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label="Annualized Volatility"
        value={`${res.annualizedVolatilityPct.toFixed(1)}%`}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              {res.volatilityLevel.toUpperCase()} LEVEL
            </Pill>
            <span>Period Volatility: {res.periodVolatilityPct.toFixed(2)}%</span>
          </>
        }
      />

      {/* Volatility Assessment Notice */}
      <Notice kind={res.volatilityLevel === "extreme" ? "warn" : "info"}>
        <span>
          <strong>{res.volatilityLevelLabel}:</strong> Crypto market 24/7 trade hota hai, isliye annualization factor{" "}
          <strong>√{res.periodsPerYear} ({res.timeframe.toUpperCase()})</strong> use hota hai.{" "}
          {res.volatilityLevel === "extreme"
            ? "Meme coin ya high-beta token mein sharp liquidation aur slippage risk zyada hota hai — stop loss tight rakhein."
            : "High volatility mein options implied pricing aur wide grid spacing beneficial hoti hai."}
        </span>
      </Notice>

      {/* Price Move Flow */}
      <SectionTitle>Return Dispersion & Extremes</SectionTitle>
      <Flow
        rows={[
          {
            label: "Average Absolute Move per Period",
            value: res.avgAbsoluteMovePct,
            text: `±${res.avgAbsoluteMovePct.toFixed(2)}%`,
          },
          {
            label: "Highest Period Return",
            value: res.highestMovePct,
            text: `${res.highestMovePct >= 0 ? "+" : ""}${res.highestMovePct.toFixed(2)}%`,
          },
          {
            label: "Lowest Period Return",
            value: res.lowestMovePct,
            text: `${res.lowestMovePct.toFixed(2)}%`,
          },
          {
            label: "Standard Deviation (Period Volatility)",
            value: res.periodVolatilityPct,
            text: `${res.periodVolatilityPct.toFixed(2)}%`,
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Period Volatility",
            value: `${res.periodVolatilityPct.toFixed(2)}%`,
            tone: "flat",
          },
          {
            label: "Annualized Volatility",
            value: `${res.annualizedVolatilityPct.toFixed(1)}%`,
            tone: heroTone,
          },
          {
            label: "Avg Period Move",
            value: `±${res.avgAbsoluteMovePct.toFixed(2)}%`,
          },
          {
            label: "Max Up Move",
            value: `+${res.highestMovePct.toFixed(2)}%`,
            tone: "up",
          },
          {
            label: "Max Down Move",
            value: `${res.lowestMovePct.toFixed(2)}%`,
            tone: "down",
          },
          {
            label: "Mean Return",
            value: `${res.meanReturnPct >= 0 ? "+" : ""}${res.meanReturnPct.toFixed(2)}%`,
          },
          {
            label: "Annualizing Periods",
            value: `${res.periodsPerYear.toLocaleString()}`,
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Period Percentage Returns",
            math: `R_i = ((Close_i − Close_{i-1}) ÷ Close_{i-1}) × 100 — Across ${res.dataPointsCount} prices (${res.returns.length} return intervals)`,
          },
          {
            title: "2. Sample Standard Deviation",
            math: `σ = √[Σ(R_i − Mean)² ÷ (N − 1)] = ${res.periodVolatilityPct.toFixed(4)}% per ${res.timeframe}`,
          },
          {
            title: "3. Annualized Volatility (24/7/365 Schedule)",
            math: `Annualized Vol = σ (${res.periodVolatilityPct.toFixed(2)}%) × √${res.periodsPerYear} = ${res.annualizedVolatilityPct.toFixed(1)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Volatility Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Volatility Analysis"
      resultIcon={Activity}
      badge={<Pill tone={heroTone}>{res ? `${res.annualizedVolatilityPct.toFixed(0)}% Vol` : "Volatility"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Annualized Volatility",
              value: `${res.annualizedVolatilityPct.toFixed(1)}%`,
              sub: `Period Vol: ${res.periodVolatilityPct.toFixed(2)}% · ${res.volatilityLevelLabel}`,
              tone: heroTone,
            }
          : null
      }
      note="Historical volatility past price swings ka standard deviation measure karti hai. Ye implied volatility ya guaranteed future movement nahi darshati."
    />
  );
}
