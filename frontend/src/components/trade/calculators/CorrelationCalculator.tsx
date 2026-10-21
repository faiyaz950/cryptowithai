"use client";

import { useMemo, useState } from "react";
import { GitCompare, Network, SlidersHorizontal, TrendingUp } from "lucide-react";
import {
  computeCorrelation,
  CORRELATION_PRESETS,
  type CorrelationPreset,
} from "@/lib/calculators/correlation";
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

const DEFAULTS = {
  presetId: "btc-eth",
  coinA: CORRELATION_PRESETS[0].coinA,
  coinB: CORRELATION_PRESETS[0].coinB,
  pricesAText: CORRELATION_PRESETS[0].pricesA.join(", "),
  pricesBText: CORRELATION_PRESETS[0].pricesB.join(", "),
};

export default function CorrelationCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [coinA, setCoinA] = useState(DEFAULTS.coinA);
  const [coinB, setCoinB] = useState(DEFAULTS.coinB);
  const [pricesAText, setPricesAText] = useState(DEFAULTS.pricesAText);
  const [pricesBText, setPricesBText] = useState(DEFAULTS.pricesBText);

  const parsedA = useMemo(() => {
    return pricesAText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [pricesAText]);

  const parsedB = useMemo(() => {
    return pricesBText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [pricesBText]);

  const outcome = useMemo(
    () =>
      computeCorrelation({
        coinA: coinA || "Coin A",
        coinB: coinB || "Coin B",
        pricesA: parsedA,
        pricesB: parsedB,
      }),
    [coinA, coinB, parsedA, parsedB],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const selectPreset = (p: CorrelationPreset) => {
    setActivePreset(p.id);
    setCoinA(p.coinA);
    setCoinB(p.coinB);
    setPricesAText(p.pricesA.join(", "));
    setPricesBText(p.pricesB.join(", "));
  };

  const reset = () => {
    setActivePreset(DEFAULTS.presetId);
    setCoinA(DEFAULTS.coinA);
    setCoinB(DEFAULTS.coinB);
    setPricesAText(DEFAULTS.pricesAText);
    setPricesBText(DEFAULTS.pricesBText);
  };

  const inputs = (
    <>
      {/* Preset Pairs */}
      <div className="cx-field">
        <label className="cx-label">Preset Coin Pairs</label>
        <div className="flex flex-wrap gap-1.5">
          {CORRELATION_PRESETS.map((p) => {
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  active
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
                }`}
                onClick={() => selectPreset(p)}
              >
                {p.coinA} / {p.coinB} <span className="opacity-75 font-normal">(r={p.typicalCorrelation})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Coin A Symbol"
          value={coinA}
          onChange={(v) => {
            setCoinA(v.toUpperCase());
            setActivePreset(null);
          }}
          placeholder="BTC, ETH..."
        />
        <Field
          label="Coin B Symbol"
          value={coinB}
          onChange={(v) => {
            setCoinB(v.toUpperCase());
            setActivePreset(null);
          }}
          placeholder="SOL, DOGE, USDT..."
        />
      </div>

      {/* Raw Prices for Coin A */}
      <div className="cx-field">
        <label className="cx-label">
          {coinA} Historical Prices ({parsedA.length} points)
        </label>
        <textarea
          rows={2}
          className="w-full text-xs font-mono bg-white/[0.03] border border-white/10 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 transition-colors"
          value={pricesAText}
          onChange={(e) => {
            setPricesAText(e.target.value);
            setActivePreset(null);
          }}
          placeholder="Comma separated prices for Coin A"
        />
      </div>

      {/* Raw Prices for Coin B */}
      <div className="cx-field">
        <label className="cx-label">
          {coinB} Historical Prices ({parsedB.length} points)
        </label>
        <textarea
          rows={2}
          className="w-full text-xs font-mono bg-white/[0.03] border border-white/10 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 transition-colors"
          value={pricesBText}
          onChange={(e) => {
            setPricesBText(e.target.value);
            setActivePreset(null);
          }}
          placeholder="Comma separated prices for Coin B"
        />
        <div className="text-[11px] text-slate-400 mt-1">
          Dono coins ki corresponding period prices enter karein. System Pearson correlation coefficient (-1.00 se +1.00) aur beta sensitivity measure karega.
        </div>
      </div>
    </>
  );

  const heroTone: "up" | "flat" | "down" = res
    ? res.correlation > 0.6
      ? "up"
      : res.correlation < -0.3
        ? "down"
        : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Network}>
      Dono coins ki closing prices enter karein — Pearson correlation score, relationship status aur portfolio diversification benefit live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label={`Pearson Correlation (r) — ${res.coinA} vs ${res.coinB}`}
        value={`${res.correlation >= 0 ? "+" : ""}${res.correlation.toFixed(2)}`}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              {res.relationshipLabel}
            </Pill>
            <span>R² Explained: {res.rSquaredPct.toFixed(1)}%</span>
          </>
        }
      />

      {/* Interpretation Notice */}
      <Notice kind={res.correlation > 0.8 ? "warn" : "info"}>
        <span>
          <strong>Interpretation:</strong>{" "}
          {res.correlation > 0.7 ? (
            <span>
              <strong>High Co-movement:</strong> {res.coinA} aur {res.coinB} ka price behavior kafi similar hai. Dono ko ek sath hold karne par diversification benefit kam milta hai kyunki market girne par dono ek sath dump ho sakte hain.
            </span>
          ) : res.correlation < -0.3 ? (
            <span>
              <strong>Inverse / Hedge:</strong> Dono coins opposite direction mein move karte hain. Ye hedging ke liye effective ho sakta hai.
            </span>
          ) : (
            <span>
              <strong>Uncorrelated / Independent:</strong> Dono coins ka movement aapas mein largely independent hai. Portfolio risk reduction aur diversification ke liye excellent candidate hai.
            </span>
          )}
        </span>
      </Notice>

      {/* Variance & Covariance Flow */}
      <SectionTitle>Statistical Co-movement Breakdown</SectionTitle>
      <Flow
        rows={[
          {
            label: `${res.coinA} Period Volatility (σA)`,
            value: res.stdDevA,
            text: `${res.stdDevA.toFixed(2)}%`,
          },
          {
            label: `${res.coinB} Period Volatility (σB)`,
            value: res.stdDevB,
            text: `${res.stdDevB.toFixed(2)}%`,
          },
          {
            label: `Beta Sensitivity (${res.coinA} vs ${res.coinB})`,
            value: res.betaAtoB,
            text: `${res.betaAtoB.toFixed(2)}x`,
          },
          {
            label: "Correlation Coefficient (r)",
            value: res.correlation,
            text: `${res.correlation >= 0 ? "+" : ""}${res.correlation.toFixed(3)}`,
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Correlation Score (r)",
            value: `${res.correlation >= 0 ? "+" : ""}${res.correlation.toFixed(2)}`,
            tone: heroTone,
          },
          {
            label: "R-Squared (r²)",
            value: `${res.rSquaredPct.toFixed(1)}%`,
            tone: "flat",
          },
          {
            label: "Diversification Benefit",
            value: res.diversificationBenefit.toUpperCase(),
            tone: res.diversificationBenefit === "high" ? ("up" as const) : ("flat" as const),
          },
          {
            label: "Beta to Benchmark",
            value: `${res.betaAtoB.toFixed(2)}`,
          },
          {
            label: `${res.coinA} Std Dev`,
            value: `${res.stdDevA.toFixed(2)}%`,
          },
          {
            label: `${res.coinB} Std Dev`,
            value: `${res.stdDevB.toFixed(2)}%`,
          },
          {
            label: "Compared Intervals",
            value: `${res.returnsA.length} Periods`,
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Percentage Returns Sync",
            math: `R_A = ((P_A - Prev_A) / Prev_A) × 100 | R_B = ((P_B - Prev_B) / Prev_B) × 100 — Synchronized across ${res.returnsA.length} periods`,
          },
          {
            title: "2. Covariance Calculation",
            math: `Cov(A, B) = [Σ(R_{A,i} − Mean_A)(R_{B,i} − Mean_B)] ÷ (N − 1)`,
          },
          {
            title: "3. Pearson Correlation Coefficient",
            math: `r = Cov(A, B) ÷ (σ_A × σ_B) = ${res.correlation.toFixed(4)} (Scale: -1.0 to +1.0)`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Correlation Inputs"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Correlation Analysis"
      resultIcon={GitCompare}
      badge={<Pill tone={heroTone}>{res ? `r = ${res.correlation.toFixed(2)}` : "Correlation"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: `${res.coinA} vs ${res.coinB} Correlation`,
              value: `${res.correlation >= 0 ? "+" : ""}${res.correlation.toFixed(2)}`,
              sub: `${res.relationshipLabel} · Diversification: ${res.diversificationBenefit}`,
              tone: heroTone,
            }
          : null
      }
      note="Correlation historical linear relationship measure karti hai. Ye future performance ki guarantee nahi deta aur na hi causation prove karta hai."
    />
  );
}
