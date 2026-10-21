"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Compass,
  SlidersHorizontal,
  Target,
  TrendingDown,
} from "lucide-react";
import {
  computeBreakoutDistance,
  BREAKOUT_DISTANCE_PRESETS,
  type BreakoutDistancePreset,
} from "@/lib/calculators/breakoutDistance";
import { fmtMoney, fmtPct, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  EmptyState,
  Field,
  Hero,
  Notice,
  Pill,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  presetId: "btc-4h-channel",
  currentPrice: "64200",
  supportLevel: "62000",
  resistanceLevel: "66000",
  atr: "950",
  alertThresholdPct: "1.5",
  symbol: "BTC/USDT",
};

export default function BreakoutDistanceCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [currentPrice, setCurrentPrice] = useState(DEFAULTS.currentPrice);
  const [supportLevel, setSupportLevel] = useState(DEFAULTS.supportLevel);
  const [resistanceLevel, setResistanceLevel] = useState(DEFAULTS.resistanceLevel);
  const [atr, setAtr] = useState(DEFAULTS.atr);
  const [alertThresholdPct, setAlertThresholdPct] = useState(DEFAULTS.alertThresholdPct);
  const [symbol, setSymbol] = useState(DEFAULTS.symbol);

  const n = {
    currentPrice: toNum(currentPrice),
    supportLevel: toNum(supportLevel),
    resistanceLevel: toNum(resistanceLevel),
    atr: atr !== "" ? toNum(atr) : undefined,
    alertThresholdPct: alertThresholdPct !== "" ? toNum(alertThresholdPct) : undefined,
  };

  const outcome = useMemo(
    () =>
      computeBreakoutDistance({
        currentPrice: n.currentPrice,
        supportLevel: n.supportLevel,
        resistanceLevel: n.resistanceLevel,
        atr: n.atr,
        alertThresholdPct: n.alertThresholdPct,
        symbol,
      }),
    [n.currentPrice, n.supportLevel, n.resistanceLevel, n.atr, n.alertThresholdPct, symbol]
  );

  const applyPreset = (preset: BreakoutDistancePreset) => {
    setActivePreset(preset.id);
    setCurrentPrice(String(preset.currentPrice));
    setSupportLevel(String(preset.supportLevel));
    setResistanceLevel(String(preset.resistanceLevel));
    setAtr(String(preset.atr));
    setAlertThresholdPct(String(preset.alertThresholdPct));
    setSymbol(preset.symbol);
  };

  const handleReset = () => {
    setActivePreset(null);
    setCurrentPrice(DEFAULTS.currentPrice);
    setSupportLevel(DEFAULTS.supportLevel);
    setResistanceLevel(DEFAULTS.resistanceLevel);
    setAtr(DEFAULTS.atr);
    setAlertThresholdPct(DEFAULTS.alertThresholdPct);
    setSymbol(DEFAULTS.symbol);
  };

  const inputsValid = outcome !== null;

  return (
    <CalcLayout
      inputsTitle="Price & Support/Resistance Levels"
      inputsIcon={SlidersHorizontal}
      onReset={handleReset}
      inputs={
        <>
          {/* Preset Chips */}
          <div>
            <span className="cx-label">Technical Scenarios</span>
            <div className="cx-chips" role="group" aria-label="Breakout Presets">
              {BREAKOUT_DISTANCE_PRESETS.map((p) => (
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

          {/* Symbol & Current Price */}
          <div className="cx-row-2">
            <label className="cx-field">
              <span className="cx-label">Trading Pair / Symbol</span>
              <span className="cx-input">
                <input
                  type="text"
                  value={symbol}
                  placeholder="BTC/USDT"
                  onChange={(e) => {
                    setActivePreset(null);
                    setSymbol(e.target.value.toUpperCase());
                  }}
                />
              </span>
            </label>
            <Field
              label="Current Market Price"
              prefix="$"
              value={currentPrice}
              placeholder="64200"
              hint="Current live candlestick price"
              onChange={(v) => {
                setActivePreset(null);
                setCurrentPrice(v);
              }}
            />
          </div>

          {/* Support & Resistance */}
          <div className="cx-row-2">
            <Field
              label="Support Level (Floor)"
              prefix="$"
              value={supportLevel}
              placeholder="62000"
              hint="Key horizontal support or swing low"
              onChange={(v) => {
                setActivePreset(null);
                setSupportLevel(v);
              }}
            />
            <Field
              label="Resistance Level (Ceiling)"
              prefix="$"
              value={resistanceLevel}
              placeholder="66000"
              hint="Key horizontal resistance or swing high"
              onChange={(v) => {
                setActivePreset(null);
                setResistanceLevel(v);
              }}
            />
          </div>

          {/* Optional ATR & Alert Threshold */}
          <div className="cx-row-2">
            <Field
              label="ATR (Average True Range)"
              prefix="$"
              value={atr}
              placeholder="950"
              hint="Daily or 4H ATR for normalized move distance"
              optional
              onChange={(v) => {
                setActivePreset(null);
                setAtr(v);
              }}
            />
            <Field
              label="Alert Proximity Threshold"
              suffix="%"
              value={alertThresholdPct}
              placeholder="1.5"
              hint="Trigger alert when price is within % of level"
              optional
              onChange={(v) => {
                setActivePreset(null);
                setAlertThresholdPct(v);
              }}
            />
          </div>
        </>
      }
      resultTitle="Breakout & Channel Metrics"
      resultIcon={Compass}
      badge={
        inputsValid ? (
          <span
            className="cx-badge"
            data-side={outcome.isBreakout ? "long" : outcome.isBreakdown ? "short" : undefined}
          >
            {outcome.isBreakout ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : outcome.isBreakdown ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <Target className="w-3 h-3" />
            )}
            {outcome.statusLabel}
          </span>
        ) : undefined
      }
      result={
        inputsValid ? (
          <div className="cx-body">
            {/* Hero Distance to Key Level */}
            <Hero
              label={
                outcome.isBreakout
                  ? "Breakout Distance Above Resistance"
                  : outcome.isBreakdown
                  ? "Breakdown Distance Below Support"
                  : "Distance to Resistance"
              }
              value={
                outcome.isBreakout
                  ? `+${fmtMoney(Math.abs(outcome.distToResistanceAbs))}`
                  : outcome.isBreakdown
                  ? `-${fmtMoney(Math.abs(outcome.distToSupportAbs))}`
                  : fmtMoney(outcome.distToResistanceAbs)
              }
              tone={outcome.isBreakout ? "up" : outcome.isBreakdown ? "down" : "flat"}
              sub={
                <>
                  <Pill tone={outcome.isBreakout ? "up" : outcome.isBreakdown ? "down" : "flat"}>
                    {outcome.isBreakout
                      ? `+${fmtPct(Math.abs(outcome.distToResistancePct))}`
                      : outcome.isBreakdown
                      ? `-${fmtPct(Math.abs(outcome.distToSupportPct))}`
                      : `+${fmtPct(outcome.distToResistancePct)}`}
                  </Pill>
                  {outcome.distToResistanceAtr !== null && (
                    <Pill>
                      {outcome.distToResistanceAtr.toFixed(2)} ATR
                    </Pill>
                  )}
                  <Pill>
                    Range: {fmtMoney(outcome.rangeSpanAbs)}
                  </Pill>
                </>
              }
            />

            {/* Visual Channel Progress Bar */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-[rgba(148,163,184,0.04)] border border-[rgba(148,163,184,0.12)]">
              <div className="flex justify-between text-xs text-[var(--text-muted)] font-mono">
                <span>Support: {fmtMoney(outcome.supportLevel)}</span>
                <span className="font-bold text-[var(--text-primary)]">
                  Current: {fmtMoney(outcome.currentPrice)} ({outcome.positionInRangePct.toFixed(1)}%)
                </span>
                <span>Resistance: {fmtMoney(outcome.resistanceLevel)}</span>
              </div>
              <div className="relative h-3 rounded-full bg-[rgba(148,163,184,0.12)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, outcome.positionInRangePct))}%`,
                    background:
                      outcome.isBreakout
                        ? "linear-gradient(90deg, #10b981, #00e676)"
                        : outcome.isBreakdown
                        ? "linear-gradient(90deg, #ef4444, #ff5252)"
                        : "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                  }}
                />
              </div>
            </div>

            {/* Key Distance Stats */}
            <Stats
              items={[
                {
                  label: "Distance to Resistance",
                  value: `${outcome.distToResistanceAbs >= 0 ? "+" : ""}${fmtMoney(outcome.distToResistanceAbs)} (${fmtPct(outcome.distToResistancePct)})`,
                  tone: outcome.distToResistanceAbs <= 0 ? "up" : "flat",
                },
                {
                  label: "Distance to Support",
                  value: `${outcome.distToSupportAbs >= 0 ? "-" : "+"}${fmtMoney(Math.abs(outcome.distToSupportAbs))} (${fmtPct(-outcome.distToSupportPct)})`,
                  tone: outcome.distToSupportAbs <= 0 ? "down" : "flat",
                },
                {
                  label: "Resistance in ATR",
                  value: outcome.distToResistanceAtr !== null ? `${outcome.distToResistanceAtr.toFixed(2)} ATR` : "—",
                },
                {
                  label: "Support in ATR",
                  value: outcome.distToSupportAtr !== null ? `${outcome.distToSupportAtr.toFixed(2)} ATR` : "—",
                },
                {
                  label: "Total Range Width",
                  value: `${fmtMoney(outcome.rangeSpanAbs)} (${fmtPct(outcome.rangeSpanPct)})`,
                },
                {
                  label: "Position in Range",
                  value: `${outcome.positionInRangePct.toFixed(1)}%`,
                  tone: outcome.positionInRangePct >= 85 ? "up" : outcome.positionInRangePct <= 15 ? "down" : "flat",
                },
              ]}
            />

            {/* Status alerts */}
            {outcome.isBreakout && (
              <Notice kind="info">
                Breakout Confirmed: Price <b>{fmtMoney(outcome.resistanceLevel)}</b> resistance se <b>{Math.abs(outcome.distToResistancePct).toFixed(2)}%</b> upar nikal chuka hai. Volume aur candle close confirmation zaroor check karein.
              </Notice>
            )}
            {outcome.isBreakdown && (
              <Notice kind="error">
                Breakdown Warning: Price <b>{fmtMoney(outcome.supportLevel)}</b> support floor se <b>{Math.abs(outcome.distToSupportPct).toFixed(2)}%</b> neeche breach ho gaya hai.
              </Notice>
            )}
            {!outcome.isBreakout && !outcome.isBreakdown && outcome.isAlertTriggered && (
              <Notice kind="warn">
                Proximity Alert: Current price key level ke kaafi kareeb hai (within <b>{outcome.alertThresholdPct}%</b> threshold). Orderbook liquidity aur breakout volume par nazar rakhein.
              </Notice>
            )}

            {/* Step-by-step Walkthrough */}
            <Walkthrough
              steps={[
                {
                  title: "1. Distance to Resistance Math",
                  math: `Distance to Resistance = Resistance (${fmtMoney(outcome.resistanceLevel)}) - Current Price (${fmtMoney(outcome.currentPrice)}) = ${fmtMoney(outcome.distToResistanceAbs)} (${outcome.distToResistancePct.toFixed(2)}%).`,
                },
                {
                  title: "2. Distance to Support Math",
                  math: `Distance to Support = Current Price (${fmtMoney(outcome.currentPrice)}) - Support (${fmtMoney(outcome.supportLevel)}) = ${fmtMoney(outcome.distToSupportAbs)} (${outcome.distToSupportPct.toFixed(2)}%).`,
                },
                {
                  title: "3. Range Position Percentage",
                  math: `Range Width = ${fmtMoney(outcome.resistanceLevel)} - ${fmtMoney(outcome.supportLevel)} = ${fmtMoney(outcome.rangeSpanAbs)}. Position = (${fmtMoney(outcome.currentPrice)} - ${fmtMoney(outcome.supportLevel)}) ÷ ${fmtMoney(outcome.rangeSpanAbs)} × 100 = ${outcome.positionInRangePct.toFixed(1)}%.`,
                },
                ...(outcome.atr > 0
                  ? [
                      {
                        title: "4. ATR Normalization",
                        math: `ATR = ${fmtMoney(outcome.atr)}. Resistance tak pahunchne ke liye ${outcome.distToResistanceAtr?.toFixed(2)} ATR moves chahiye; Support test ke liye ${outcome.distToSupportAtr?.toFixed(2)} ATR move chahiye.`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Compass}>
            Current price ke sath key support aur resistance levels bharein. System turant distance %, range position aur ATR normalization calculate karega.
          </EmptyState>
        )
      }
      dock={
        inputsValid
          ? {
              label: outcome.isBreakout ? "Breakout +" : "To Resistance",
              value: `${outcome.distToResistancePct.toFixed(2)}%`,
              sub: `${fmtMoney(outcome.distToResistanceAbs)} gap`,
              tone: outcome.isBreakout ? "up" : outcome.isBreakdown ? "down" : "flat",
            }
          : null
      }
      note="Technical Disclaimer: Breakout distance levels ka mathematical measure hai; ye breakout ki probability predict nahi karta. Volume aur multi-timeframe confirmation zaroor lein."
    />
  );
}
