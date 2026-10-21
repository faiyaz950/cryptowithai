"use client";

import { useMemo, useState } from "react";
import { Building2, Flame, Layers, SlidersHorizontal } from "lucide-react";
import {
  computeLiquidation,
  EXCHANGES,
  COMMON_PAIRS,
  type ExchangeId,
  type MarginMode,
  type Side,
} from "@/lib/calculators/liquidation";
import { fmtMoney, fmtNum, fmtQty, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  DirectionToggle,
  EmptyState,
  Field,
  Hero,
  Meter,
  Notice,
  Pill,
  PriceRuler,
  SectionTitle,
  SideBadge,
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  exchange: "binance" as ExchangeId,
  pair: "BTC/USDT",
  side: "long" as Side,
  marginMode: "isolated" as MarginMode,
  entry: "100",
  leverage: "10",
  positionValue: "10000",
  margin: "1000",
  mmrPct: "0.5",
};

const LEVERAGE_PRESETS = ["2", "5", "10", "20", "50", "100"];
const EXCHANGE_LIST: { id: ExchangeId; label: string }[] = [
  { id: "binance", label: "Binance" },
  { id: "bybit", label: "Bybit" },
  { id: "okx", label: "OKX" },
  { id: "delta", label: "Delta" },
];

export default function LiquidationCalculator() {
  const [exchange, setExchange] = useState<ExchangeId>(DEFAULTS.exchange);
  const [pair, setPair] = useState(DEFAULTS.pair);
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [marginMode, setMarginMode] = useState<MarginMode>(DEFAULTS.marginMode);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);
  const [positionValue, setPositionValue] = useState(DEFAULTS.positionValue);
  const [margin, setMargin] = useState(DEFAULTS.margin);
  const [mmrPct, setMmrPct] = useState(DEFAULTS.mmrPct);

  const n = {
    entry: toNum(entry),
    leverage: toNum(leverage),
    positionValue: toNum(positionValue, NaN),
    margin: toNum(margin, NaN),
    mmrPct: toNum(mmrPct, NaN),
  };

  const outcome = useMemo(
    () =>
      computeLiquidation({
        exchange,
        pair,
        side,
        marginMode,
        entry: n.entry,
        leverage: n.leverage,
        positionValue: n.positionValue,
        margin: n.margin,
        mmrPct: n.mmrPct,
      }),
    [exchange, pair, side, marginMode, n.entry, n.leverage, n.positionValue, n.margin, n.mmrPct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const currentExConfig = EXCHANGES[exchange];

  // Auto-sync MMR when exchange or pair changes
  const handleExchangeChange = (ex: ExchangeId) => {
    setExchange(ex);
    const cfg = EXCHANGES[ex];
    const defaultForPair = cfg.pairMmr[pair] ?? cfg.defaultMmr;
    setMmrPct(String(defaultForPair));
    if (Number(leverage) > cfg.maxLeverage) {
      setLeverage(String(cfg.maxLeverage));
    }
  };

  const handlePairChange = (p: string) => {
    setPair(p);
    if (p !== "Custom") {
      const defaultForPair = currentExConfig.pairMmr[p] ?? currentExConfig.defaultMmr;
      setMmrPct(String(defaultForPair));
    }
  };

  const reset = () => {
    setExchange(DEFAULTS.exchange);
    setPair(DEFAULTS.pair);
    setSide(DEFAULTS.side);
    setMarginMode(DEFAULTS.marginMode);
    setEntry(DEFAULTS.entry);
    setLeverage(DEFAULTS.leverage);
    setPositionValue(DEFAULTS.positionValue);
    setMargin(DEFAULTS.margin);
    setMmrPct(DEFAULTS.mmrPct);
  };

  const bad = {
    entry: entry !== "" && !(n.entry > 0),
    leverage: leverage !== "" && !(n.leverage >= 1 && n.leverage <= currentExConfig.maxLeverage),
    positionValue: positionValue !== "" && !(n.positionValue > 0),
    margin: margin !== "" && !(n.margin > 0),
    mmrPct: mmrPct !== "" && !(n.mmrPct >= 0 && n.mmrPct < 100),
  };

  const inputs = (
    <>
      {/* Exchange Selection */}
      <div>
        <span className="cx-label">
          <Building2 className="w-3.5 h-3.5 inline mr-1" />
          Exchange
        </span>
        <div className="cx-chips" role="group" aria-label="Exchange">
          {EXCHANGE_LIST.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="cx-chip"
              data-active={exchange === ex.id}
              onClick={() => handleExchangeChange(ex.id)}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Futures Pair */}
      <div>
        <span className="cx-label">Futures Pair</span>
        <Chips
          options={COMMON_PAIRS}
          value={pair}
          onPick={handlePairChange}
          suffix=""
          label="Common pairs"
        />
      </div>

      {/* Margin Mode & Direction */}
      <div className="cx-row-2">
        <div>
          <span className="cx-label">
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            Margin Mode
          </span>
          <div className="cx-seg" role="group" aria-label="Margin Mode">
            <button
              type="button"
              data-active={marginMode === "isolated"}
              onClick={() => setMarginMode("isolated")}
            >
              Isolated
            </button>
            <button
              type="button"
              data-active={marginMode === "cross"}
              onClick={() => setMarginMode("cross")}
            >
              Cross
            </button>
          </div>
        </div>
        <DirectionToggle side={side} onChange={setSide} />
      </div>

      <div className="cx-row-2">
        <Field
          label="Entry price"
          value={entry}
          onChange={setEntry}
          prefix="$"
          min={0}
          invalid={bad.entry}
        />
        <Field
          label="Leverage"
          hint={`Max: ${currentExConfig.maxLeverage}×`}
          value={leverage}
          onChange={setLeverage}
          suffix="×"
          min={1}
          invalid={bad.leverage}
        />
      </div>

      <div>
        <Slider
          value={n.leverage}
          onChange={setLeverage}
          min={1}
          max={currentExConfig.maxLeverage}
          step={1}
          scale={["1×", `${currentExConfig.maxLeverage}×`]}
        />
        <Chips
          options={LEVERAGE_PRESETS.filter((p) => Number(p) <= currentExConfig.maxLeverage)}
          value={leverage}
          onPick={setLeverage}
          suffix="×"
          label="Leverage presets"
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Position size"
          hint="Notional ($) = Entry × Coins"
          value={positionValue}
          onChange={setPositionValue}
          prefix="$"
          min={0}
          invalid={bad.positionValue}
        />
        <Field
          label={marginMode === "isolated" ? "Position margin" : "Wallet balance"}
          hint={marginMode === "isolated" ? "Collateral in trade" : "Available in wallet"}
          value={margin}
          onChange={setMargin}
          prefix="$"
          min={0}
          invalid={bad.margin}
        />
      </div>

      <Field
        label="Maintenance Margin (MMR)"
        hint={`${currentExConfig.name} base: ${currentExConfig.pairMmr[pair] ?? currentExConfig.defaultMmr}%. Tier 1 (<$50k).`}
        value={mmrPct}
        onChange={setMmrPct}
        suffix="%"
        min={0}
        invalid={bad.mmrPct}
      />
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Flame}>
      Entry, leverage aur margin parameters daalein — liquidation price yahan live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Estimated Liquidation Price"
        value={res.isSafe ? "No Liquidation" : fmtMoney(res.estLiquidationPrice)}
        sub={
          <>
            <Pill tone={res.distancePct < 5 ? "down" : "flat"}>
              {res.distancePct.toFixed(2)}% distance
            </Pill>
            <span>
              {fmtMoney(res.distance)} {side === "long" ? "drop" : "rise"} entry se
            </span>
          </>
        }
      />

      {/* Explicit disclaimer required by prompt */}
      <Notice kind="warn">
        <strong>Estimated value. Actual liquidation price may vary based on exchange rules, fees, maintenance margin and position tier.</strong>
        <p style={{ marginTop: 4, fontSize: "12px", opacity: 0.9 }}>
          Alag-alag exchanges ({res.exchangeName}, Bybit, OKX, Delta) ke maintenance margin tiers, liquidation clearance fees aur funding rates ke kaaran real liquidation price mein thoda farq ho sakta hai.
        </p>
      </Notice>

      <SectionTitle>Price levels &amp; liquidation ladder</SectionTitle>
      <PriceRuler stop={res.estLiquidationPrice} entry={n.entry} fmt={fmtMoney} />

      <Meter
        label="Distance to liquidation"
        valueText={`${res.distancePct.toFixed(2)}%`}
        pct={Math.min(100, res.distancePct * 2)}
        high={res.distancePct < 5}
      />

      <Stats
        items={[
          { label: "Est. liquidation", value: fmtMoney(res.estLiquidationPrice), tone: "down" },
          { label: "Distance to liquidation", value: `${fmtMoney(res.distance)} (${res.distancePct.toFixed(2)}%)`, tone: "down" },
          { label: "Bankruptcy price", value: fmtMoney(res.bankruptcyPrice) },
          { label: "Maintenance margin (MMR)", value: `${fmtNum(res.mmrPct)}% (${fmtMoney(res.mmrAmount)})` },
          { label: "Initial margin", value: fmtMoney(res.margin) },
          { label: "Position value", value: fmtMoney(res.positionValue) },
          { label: "Quantity", value: `${fmtQty(res.quantity)} coins` },
          { label: "Exchange & Mode", value: `${res.exchangeName} · ${res.marginMode.toUpperCase()}` },
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Maintenance Margin Rate (MMR)",
            math: `${fmtNum(res.mmrPct)}% = ${(res.mmrPct / 100).toFixed(4)}`,
          },
          {
            title: "Initial Margin Rate (1 ÷ Leverage)",
            math: `1 ÷ ${res.leverage}× = ${(1 / res.leverage).toFixed(4)}`,
          },
          {
            title:
              side === "long"
                ? "Simplified Long: Entry × (1 − 1/Leverage + MMR)"
                : "Simplified Short: Entry × (1 + 1/Leverage − MMR)",
            math:
              side === "long"
                ? `${fmtMoney(res.entry)} × (1 − ${(1 / res.leverage).toFixed(4)} + ${(res.mmrPct / 100).toFixed(4)}) = ${fmtMoney(res.estLiquidationPrice)}`
                : `${fmtMoney(res.entry)} × (1 + ${(1 / res.leverage).toFixed(4)} − ${(res.mmrPct / 100).toFixed(4)}) = ${fmtMoney(res.estLiquidationPrice)}`,
          },
          {
            title: "Distance to Liquidation = |Entry − Liquidation Price|",
            math: `|${fmtMoney(res.entry)} − ${fmtMoney(res.estLiquidationPrice)}| = ${fmtMoney(res.distance)} (${res.distancePct.toFixed(2)}%)`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Exchange & futures trade"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Liquidation risk"
      resultIcon={Flame}
      badge={<SideBadge side={side} />}
      result={body}
      dock={
        res
          ? {
              label: "Est. Liq Price",
              value: fmtMoney(res.estLiquidationPrice),
              sub: `${res.distancePct.toFixed(1)}% away · ${res.marginMode}`,
            }
          : null
      }
      note="Estimated value. Actual liquidation price may vary based on exchange rules, fees, maintenance margin and position tier. Trading advice nahi."
    />
  );
}
