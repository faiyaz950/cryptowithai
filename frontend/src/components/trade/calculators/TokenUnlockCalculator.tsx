"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calendar, Coins, DollarSign, Lock, SlidersHorizontal, Unlock } from "lucide-react";
import {
  computeTokenUnlock,
  TOKEN_UNLOCK_PRESETS,
  type TokenUnlockPreset,
  type UnlockCategory,
} from "@/lib/calculators/tokenUnlock";
import { fmtMoney, fmtNum, toNum } from "@/lib/calculators/format";
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

const CATEGORY_OPTIONS: { id: UnlockCategory; label: string }[] = [
  { id: "investors", label: "Investors / VCs" },
  { id: "team", label: "Team & Founders" },
  { id: "ecosystem", label: "Ecosystem & Grants" },
  { id: "community", label: "Community & Airdrop" },
  { id: "advisors", label: "Advisors" },
];

const DEFAULTS = {
  presetId: "tia",
  price: String(TOKEN_UNLOCK_PRESETS[0].price),
  circulatingSupply: String(TOKEN_UNLOCK_PRESETS[0].circulatingSupply),
  unlockAmount: String(TOKEN_UNLOCK_PRESETS[0].unlockAmount),
  totalSupply: String(TOKEN_UNLOCK_PRESETS[0].totalSupply),
  category: TOKEN_UNLOCK_PRESETS[0].category,
  symbol: TOKEN_UNLOCK_PRESETS[0].symbol,
  scenarioPrice: "",
};

export default function TokenUnlockCalculator() {
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULTS.presetId);
  const [symbol, setSymbol] = useState(DEFAULTS.symbol);
  const [price, setPrice] = useState(DEFAULTS.price);
  const [circulatingSupply, setCirculatingSupply] = useState(DEFAULTS.circulatingSupply);
  const [unlockAmount, setUnlockAmount] = useState(DEFAULTS.unlockAmount);
  const [totalSupply, setTotalSupply] = useState(DEFAULTS.totalSupply);
  const [category, setCategory] = useState<UnlockCategory>(DEFAULTS.category);
  const [scenarioPrice, setScenarioPrice] = useState(DEFAULTS.scenarioPrice);

  const n = {
    price: toNum(price),
    circulatingSupply: toNum(circulatingSupply),
    unlockAmount: toNum(unlockAmount),
    totalSupply: toNum(totalSupply),
    scenarioPrice: scenarioPrice !== "" ? toNum(scenarioPrice) : undefined,
  };

  const outcome = useMemo(
    () =>
      computeTokenUnlock({
        price: n.price,
        circulatingSupply: n.circulatingSupply,
        unlockAmount: n.unlockAmount,
        totalSupply: n.totalSupply,
        category,
        scenarioPrice: n.scenarioPrice,
      }),
    [n.price, n.circulatingSupply, n.unlockAmount, n.totalSupply, category, n.scenarioPrice],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const selectPreset = (p: TokenUnlockPreset) => {
    setActivePreset(p.id);
    setSymbol(p.symbol);
    setPrice(String(p.price));
    setCirculatingSupply(String(p.circulatingSupply));
    setUnlockAmount(String(p.unlockAmount));
    setTotalSupply(String(p.totalSupply));
    setCategory(p.category);
  };

  const reset = () => {
    setActivePreset(DEFAULTS.presetId);
    setSymbol(DEFAULTS.symbol);
    setPrice(DEFAULTS.price);
    setCirculatingSupply(DEFAULTS.circulatingSupply);
    setUnlockAmount(DEFAULTS.unlockAmount);
    setTotalSupply(DEFAULTS.totalSupply);
    setCategory(DEFAULTS.category);
    setScenarioPrice(DEFAULTS.scenarioPrice);
  };

  const bad = {
    price: price !== "" && !(n.price > 0),
    circulatingSupply: circulatingSupply !== "" && !(n.circulatingSupply > 0),
    unlockAmount: unlockAmount !== "" && !(n.unlockAmount > 0),
    totalSupply: totalSupply !== "" && !(n.totalSupply >= n.circulatingSupply),
  };

  const inputs = (
    <>
      {/* Preset Coins */}
      <div className="cx-field">
        <label className="cx-label">Preset Token Unlocks</label>
        <div className="flex flex-wrap gap-1.5">
          {TOKEN_UNLOCK_PRESETS.map((p) => {
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
                {p.symbol} · {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Current Token Price"
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
          label="Token Symbol"
          value={symbol}
          onChange={(v) => {
            setSymbol(v.toUpperCase());
            setActivePreset(null);
          }}
          placeholder="TIA, ARB, SUI..."
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Current Circulating Supply"
          hint="Abhi market mein trade hone wale tokens"
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
          label="Upcoming Unlock Amount"
          hint="Naye unlock hone wale tokens"
          value={unlockAmount}
          onChange={(v) => {
            setUnlockAmount(v);
            setActivePreset(null);
          }}
          suffix={symbol}
          min={1}
          invalid={bad.unlockAmount}
        />
      </div>

      <Field
        label="Total / Maximum Supply"
        hint="Token ki total hard cap ya current max supply"
        value={totalSupply}
        onChange={(v) => {
          setTotalSupply(v);
          setActivePreset(null);
        }}
        suffix={symbol}
        min={1}
        invalid={bad.totalSupply}
      />

      {/* Unlock Category */}
      <div className="cx-field">
        <label className="cx-label">Recipient Category</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`py-1.5 px-2 text-xs rounded-lg border text-center transition-colors ${
                category === cat.id
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <Optional>
        <Field
          label="Post-Unlock Scenario Price ($)"
          hint="Test hypothetical price drop or recovery"
          value={scenarioPrice}
          onChange={setScenarioPrice}
          prefix="$"
          min={0}
        />
      </Optional>
    </>
  );

  const heroTone: "up" | "flat" | "down" = res
    ? res.riskLevel === "severe" || res.riskLevel === "high"
      ? "down"
      : res.riskLevel === "moderate"
        ? "flat"
        : "up"
    : "flat";

  const matchedPreset = TOKEN_UNLOCK_PRESETS.find((p) => p.id === activePreset);

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Unlock}>
      Current price, circulating supply aur upcoming unlock amount enter karein — dilution factor aur equilibrium price calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label="Upcoming Unlock Value"
        value={fmtMoney(res.unlockValueDollar)}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              +{res.unlockPctOfCirculating.toFixed(1)}% of Float
            </Pill>
            <span>Equilibrium Price: {fmtMoney(res.equilibriumPrice)}</span>
          </>
        }
      />

      {/* Dilution Alert Notice */}
      <Notice kind={res.riskLevel === "severe" || res.riskLevel === "high" ? "warn" : "info"}>
        <span>
          <strong>{res.riskLevelLabel}:</strong> {matchedPreset ? `(${matchedPreset.unlockDateNote}) ` : ""}
          Market mein <strong>+{fmtNum(res.unlockAmount)} {symbol}</strong> naye tokens introduce honge, jisse circulating supply{" "}
          <strong>{res.currentCirculatingRatioPct.toFixed(1)}% se badhkar {res.newCirculatingRatioPct.toFixed(1)}%</strong> ho jayegi.{" "}
          Agar valuation / market cap constant rehti hai, toh token price{" "}
          <strong>{fmtMoney(res.equilibriumPrice)} ({res.equilibriumPriceDropPct.toFixed(1)}%)</strong> adjust ho sakti hai.
        </span>
      </Notice>

      {/* Supply Expansion Flow */}
      <SectionTitle>Circulating Supply Expansion</SectionTitle>
      <Flow
        rows={[
          {
            label: "Current Circulating Supply",
            value: res.circulatingSupply,
            text: `${fmtNum(res.circulatingSupply)} ${symbol}`,
          },
          {
            label: `Upcoming Unlock Inflow (+${res.unlockPctOfCirculating.toFixed(1)}%)`,
            value: res.unlockAmount,
            text: `+${fmtNum(res.unlockAmount)} ${symbol}`,
          },
          {
            label: "Projected New Circulating Supply",
            value: res.newCirculatingSupply,
            text: `${fmtNum(res.newCirculatingSupply)} ${symbol}`,
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Unlock USD Value",
            value: fmtMoney(res.unlockValueDollar),
            tone: heroTone,
          },
          {
            label: "% of Circulating Float",
            value: `+${res.unlockPctOfCirculating.toFixed(2)}%`,
            tone: heroTone,
          },
          {
            label: "Equilibrium Price",
            value: fmtMoney(res.equilibriumPrice),
            tone: "flat",
          },
          {
            label: "Flat MC Price Drop",
            value: `${res.equilibriumPriceDropPct.toFixed(1)}%`,
            tone: "down",
          },
          {
            label: "Dilution Factor",
            value: `${res.dilutionFactor.toFixed(2)}x`,
          },
          {
            label: "New Supply Ratio",
            value: `${res.newCirculatingRatioPct.toFixed(1)}% of Max`,
          },
          {
            label: "Current Market Cap",
            value: fmtMoney(res.currentMarketCap),
          },
          {
            label: "Fully Diluted Val (FDV)",
            value: fmtMoney(res.currentFdv),
          },
          ...(res.scenarioMarketCap != null
            ? [
                {
                  label: `Scenario MC (@${fmtMoney(res.scenarioPrice || 0)})`,
                  value: fmtMoney(res.scenarioMarketCap),
                },
              ]
            : []),
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Supply Expansion & Dilution Factor",
            math: `Dilution Factor = New Supply (${fmtNum(res.newCirculatingSupply)}) ÷ Old Supply (${fmtNum(res.circulatingSupply)}) = ${res.dilutionFactor.toFixed(3)}x (+${res.unlockPctOfCirculating.toFixed(1)}% expansion)`,
          },
          {
            title: "2. Constant Market Cap Equilibrium Price",
            math: `Equilibrium Price = Current MC (${fmtMoney(res.currentMarketCap)}) ÷ New Supply (${fmtNum(res.newCirculatingSupply)}) = ${fmtMoney(res.equilibriumPrice)} (${res.equilibriumPriceDropPct.toFixed(1)}% drop)`,
          },
          {
            title: "3. Total Supply Float Ratio",
            math: `Float Ratio = ${fmtNum(res.newCirculatingSupply)} ÷ ${fmtNum(res.totalSupply)} (Max) = ${res.newCirculatingRatioPct.toFixed(1)}% of total cap unlocked`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Token Unlock Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Dilution & Supply Impact"
      resultIcon={Unlock}
      badge={<Pill tone={heroTone}>{res ? `+${res.unlockPctOfCirculating.toFixed(0)}% Unlock` : "Token Unlock"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Unlock Inflow Value",
              value: fmtMoney(res.unlockValueDollar),
              sub: `+${res.unlockPctOfCirculating.toFixed(1)}% Float · Equilibrium: ${fmtMoney(res.equilibriumPrice)}`,
              tone: heroTone,
            }
          : null
      }
      note="Token unlock se circulating supply badhti hai, lekin price automatically dump nahi hoti. Actual impact OTC deals, vesting staking aur market liquidity par depend karta hai."
    />
  );
}
