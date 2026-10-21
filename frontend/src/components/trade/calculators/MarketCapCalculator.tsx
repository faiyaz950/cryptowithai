"use client";

import { useMemo, useState } from "react";
import { BarChart3, Coins, Globe, Percent, SlidersHorizontal, TrendingUp } from "lucide-react";
import {
  computeMarketCap,
  MARKET_CAP_PRESETS,
  type MarketCapPreset,
} from "@/lib/calculators/marketCap";
import { fmtMoney, fmtNum, toNum } from "@/lib/calculators/format";
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
  price: "66500",
  circulatingSupply: "19770000",
  maxSupply: "21000000",
  targetMarketCap: "2000000000000", // $2T
  symbol: "BTC",
};

export default function MarketCapCalculator() {
  const [price, setPrice] = useState(DEFAULTS.price);
  const [circulatingSupply, setCirculatingSupply] = useState(DEFAULTS.circulatingSupply);
  const [maxSupply, setMaxSupply] = useState(DEFAULTS.maxSupply);
  const [targetMarketCap, setTargetMarketCap] = useState(DEFAULTS.targetMarketCap);
  const [symbol, setSymbol] = useState(DEFAULTS.symbol);
  const [activePreset, setActivePreset] = useState<string | null>("btc");

  const n = {
    price: toNum(price),
    circulatingSupply: toNum(circulatingSupply),
    maxSupply: maxSupply !== "" ? toNum(maxSupply, 0) : null,
    targetMarketCap: toNum(targetMarketCap, 0),
  };

  const outcome = useMemo(
    () =>
      computeMarketCap({
        price: n.price,
        circulatingSupply: n.circulatingSupply,
        maxSupply: n.maxSupply,
        targetMarketCap: n.targetMarketCap > 0 ? n.targetMarketCap : undefined,
      }),
    [n.price, n.circulatingSupply, n.maxSupply, n.targetMarketCap],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const selectPreset = (p: MarketCapPreset) => {
    setActivePreset(p.id);
    setSymbol(p.symbol);
    setPrice(String(p.price));
    setCirculatingSupply(String(p.circulatingSupply));
    setMaxSupply(p.maxSupply != null ? String(p.maxSupply) : "");
    setTargetMarketCap(String(p.targetMarketCap));
  };

  const reset = () => {
    setPrice(DEFAULTS.price);
    setCirculatingSupply(DEFAULTS.circulatingSupply);
    setMaxSupply(DEFAULTS.maxSupply);
    setTargetMarketCap(DEFAULTS.targetMarketCap);
    setSymbol(DEFAULTS.symbol);
    setActivePreset("btc");
  };

  const bad = {
    price: price !== "" && !(n.price > 0),
    circulatingSupply: circulatingSupply !== "" && !(n.circulatingSupply > 0),
  };

  const inputs = (
    <>
      {/* Preset Chips */}
      <div className="cx-field">
        <label className="cx-label">Preset Assets</label>
        <div className="flex flex-wrap gap-1.5">
          {MARKET_CAP_PRESETS.map((p) => {
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
                {p.symbol} · {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Current Token Price"
          hint="Live or entry price ($)"
          value={price}
          onChange={(v) => {
            setPrice(v);
            setActivePreset(null);
          }}
          prefix="$"
          min={0}
          invalid={bad.price}
        />
        <Field
          label="Asset Symbol"
          value={symbol}
          onChange={(v) => {
            setSymbol(v.toUpperCase());
            setActivePreset(null);
          }}
          placeholder="BTC, ETH, SOL..."
        />
      </div>

      <Field
        label="Circulating Supply"
        hint="Market mein freely trade hone wale coins"
        value={circulatingSupply}
        onChange={(v) => {
          setCirculatingSupply(v);
          setActivePreset(null);
        }}
        suffix={symbol}
        min={1}
        invalid={bad.circulatingSupply}
      />

      <Field
        label="Target Market Cap ($)"
        hint="Expected future market valuation (e.g. $1T = 1,000,000,000,000)"
        value={targetMarketCap}
        onChange={(v) => {
          setTargetMarketCap(v);
          setActivePreset(null);
        }}
        prefix="$"
        min={0}
      />

      <Optional>
        <Field
          label="Max / Total Supply"
          hint="Hard cap on token creation (leave blank if infinite/deflationary)"
          value={maxSupply}
          onChange={(v) => {
            setMaxSupply(v);
            setActivePreset(null);
          }}
          suffix={symbol}
          min={0}
        />
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Globe}>
      Price, circulating supply aur target market cap enter karein — implied token price aur valuation multiples dikhenge.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label={`Implied ${symbol} Price at Target Market Cap`}
        value={fmtMoney(res.impliedPriceAtTargetMc)}
        tone={res.growthMultiple >= 1 ? "up" : "down"}
        sub={
          <>
            <Pill tone={res.growthMultiple >= 1 ? "up" : "down"}>
              {res.growthMultiple.toFixed(2)}x Multiple ({res.growthPct >= 0 ? "+" : ""}
              {res.growthPct.toFixed(1)}%)
            </Pill>
            <span>Current MC: {fmtMoney(res.currentMarketCap)}</span>
          </>
        }
      />

      {/* Unlock / Overhang Warning */}
      {res.circulatingRatioPct != null && res.circulatingRatioPct < 60 && (
        <Notice kind="warn">
          <span>
            <strong>Low Float / High FDV Warning:</strong> Is token ki sirf{" "}
            <strong>{res.circulatingRatioPct.toFixed(1)}% supply</strong> market mein circulate ho rahi hai. Future token unlocks se market cap badhne ke bawajood per-token price dilute ho sakti hai.
          </span>
        </Notice>
      )}

      {/* Comparison Flow */}
      <SectionTitle>Market Cap vs Target Valuation</SectionTitle>
      <Flow
        rows={[
          {
            label: `Current Market Cap (${fmtNum(res.circulatingSupply)} ${symbol} @ ${fmtMoney(res.price)})`,
            value: res.currentMarketCap,
            text: fmtMoney(res.currentMarketCap),
          },
          ...(res.fdv !== res.currentMarketCap
            ? [
                {
                  label: `Fully Diluted Valuation (FDV at max supply)`,
                  value: res.fdv,
                  text: fmtMoney(res.fdv),
                },
              ]
            : []),
          {
            label: `Target Market Cap Goal`,
            value: res.targetMarketCap,
            text: fmtMoney(res.targetMarketCap),
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Current Market Cap",
            value: fmtMoney(res.currentMarketCap),
            tone: "flat",
          },
          {
            label: "Implied Coin Price",
            value: fmtMoney(res.impliedPriceAtTargetMc),
            tone: res.growthMultiple >= 1 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Growth Multiplier",
            value: `${res.growthMultiple.toFixed(2)}x`,
            tone: res.growthMultiple >= 1 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Target Market Cap",
            value: fmtMoney(res.targetMarketCap),
          },
          {
            label: "Fully Diluted Val (FDV)",
            value: fmtMoney(res.fdv),
          },
          {
            label: "Circulating vs Max Ratio",
            value: res.circulatingRatioPct != null ? `${res.circulatingRatioPct.toFixed(1)}%` : "Infinite / Deflationary",
          },
          ...(res.impliedFdvAtTargetMc != null
            ? [
                {
                  label: "Target Implied FDV",
                  value: fmtMoney(res.impliedFdvAtTargetMc),
                },
              ]
            : []),
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Current Market Cap Formula",
            math: `Market Cap = Price (${fmtMoney(res.price)}) × Circulating Supply (${fmtNum(res.circulatingSupply)}) = ${fmtMoney(res.currentMarketCap)}`,
          },
          {
            title: "2. Target Implied Price Formula",
            math: `Implied Price = Target MC (${fmtMoney(res.targetMarketCap)}) ÷ Circulating Supply (${fmtNum(res.circulatingSupply)}) = ${fmtMoney(res.impliedPriceAtTargetMc)}`,
          },
          {
            title: "3. Fully Diluted Valuation (FDV)",
            math:
              res.maxSupply != null
                ? `FDV = Price (${fmtMoney(res.price)}) × Max Supply (${fmtNum(res.maxSupply)}) = ${fmtMoney(res.fdv)}`
                : "Max supply unconstrained hai, isliye FDV circulating market cap ke barabar consider hoti hai.",
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Valuation & Supply"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Market Cap Projection"
      resultIcon={BarChart3}
      badge={<Pill tone="up">{res ? `${res.growthMultiple.toFixed(1)}x Goal` : "Valuation"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: `Implied ${symbol} Price`,
              value: fmtMoney(res.impliedPriceAtTargetMc),
              sub: `Target MC: ${fmtMoney(res.targetMarketCap)} · ${res.growthMultiple.toFixed(2)}x Growth`,
              tone: res.growthMultiple >= 1 ? "up" : "down",
            }
          : null
      }
      note="Market cap circulating supply aur price ka product hota hai. Large cap coins ko double hone ke liye massive liquidity inflows ki zarurat hoti hai."
    />
  );
}
