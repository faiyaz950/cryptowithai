"use client";

import { useMemo, useState } from "react";
import { Coins, Percent, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  computeStaking,
  STAKING_PRESETS,
  type StakingCompounding,
  type StakingPreset,
} from "@/lib/calculators/staking";
import { fmtMoney, toNum } from "@/lib/calculators/format";
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

const COMPOUND_OPTIONS: { id: StakingCompounding; label: string }[] = [
  { id: "none", label: "None (APR)" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "annually", label: "Annually" },
];

const DURATION_PRESETS = [
  { label: "1 Month", months: "1" },
  { label: "3 Months", months: "3" },
  { label: "6 Months", months: "6" },
  { label: "1 Year", months: "12" },
  { label: "2 Years", months: "24" },
  { label: "5 Years", months: "60" },
];

const DEFAULTS = {
  stakedAmount: "100",
  apyPct: "7.2",
  durationMonths: "12",
  compounding: "daily" as StakingCompounding,
  validatorFeePct: "5",
  coinPrice: "150",
  symbol: "SOL",
};

export default function StakingCalculator() {
  const [stakedAmount, setStakedAmount] = useState(DEFAULTS.stakedAmount);
  const [apyPct, setApyPct] = useState(DEFAULTS.apyPct);
  const [durationMonths, setDurationMonths] = useState(DEFAULTS.durationMonths);
  const [compounding, setCompounding] = useState<StakingCompounding>(DEFAULTS.compounding);
  const [validatorFeePct, setValidatorFeePct] = useState(DEFAULTS.validatorFeePct);
  const [coinPrice, setCoinPrice] = useState(DEFAULTS.coinPrice);
  const [symbol, setSymbol] = useState(DEFAULTS.symbol);
  const [activePreset, setActivePreset] = useState<string | null>("sol");

  const n = {
    stakedAmount: toNum(stakedAmount),
    apyPct: toNum(apyPct),
    durationMonths: toNum(durationMonths),
    validatorFeePct: toNum(validatorFeePct, 0),
    coinPrice: toNum(coinPrice, 1),
  };

  const outcome = useMemo(
    () =>
      computeStaking({
        stakedAmount: n.stakedAmount,
        apyPct: n.apyPct,
        durationMonths: n.durationMonths,
        compounding,
        validatorFeePct: n.validatorFeePct,
        coinPrice: n.coinPrice,
      }),
    [n.stakedAmount, n.apyPct, n.durationMonths, compounding, n.validatorFeePct, n.coinPrice],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const selectPreset = (p: StakingPreset) => {
    setActivePreset(p.id);
    setSymbol(p.asset);
    setApyPct(String(p.defaultApy));
    setValidatorFeePct(String(p.validatorFee));
  };

  const reset = () => {
    setStakedAmount(DEFAULTS.stakedAmount);
    setApyPct(DEFAULTS.apyPct);
    setDurationMonths(DEFAULTS.durationMonths);
    setCompounding(DEFAULTS.compounding);
    setValidatorFeePct(DEFAULTS.validatorFeePct);
    setCoinPrice(DEFAULTS.coinPrice);
    setSymbol(DEFAULTS.symbol);
    setActivePreset("sol");
  };

  const bad = {
    stakedAmount: stakedAmount !== "" && !(n.stakedAmount > 0),
    apyPct: apyPct !== "" && !(n.apyPct >= 0),
    durationMonths: durationMonths !== "" && !(n.durationMonths > 0),
  };

  const inputs = (
    <>
      {/* Preset Chips */}
      <div className="cx-field">
        <label className="cx-label">Popular Staking Networks</label>
        <div className="flex flex-wrap gap-1.5">
          {STAKING_PRESETS.map((p) => {
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
                {p.asset} <span className="opacity-75 font-normal">({p.defaultApy}%)</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Staked Amount"
          hint={`Total ${symbol} tokens to lock`}
          value={stakedAmount}
          onChange={(v) => {
            setStakedAmount(v);
          }}
          suffix={symbol}
          min={0}
          invalid={bad.stakedAmount}
        />
        <Field
          label="Coin Symbol / Name"
          value={symbol}
          onChange={(v) => {
            setSymbol(v.toUpperCase());
            setActivePreset(null);
          }}
          placeholder="SOL, ETH, DOT..."
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Estimated APY %"
          hint="Annual percentage yield"
          value={apyPct}
          onChange={(v) => {
            setApyPct(v);
            setActivePreset(null);
          }}
          suffix="%"
          min={0}
          invalid={bad.apyPct}
        />
        <Field
          label="Validator Fee %"
          hint="Platform commission"
          value={validatorFeePct}
          onChange={setValidatorFeePct}
          suffix="%"
          min={0}
        />
      </div>

      <div className="cx-field">
        <label className="cx-label">Staking Duration</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DURATION_PRESETS.map((d) => (
            <button
              key={d.months}
              type="button"
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                durationMonths === d.months
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setDurationMonths(d.months)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Field
          label=""
          value={durationMonths}
          onChange={setDurationMonths}
          suffix="Months"
          min={0.1}
          invalid={bad.durationMonths}
        />
      </div>

      <div className="cx-field">
        <label className="cx-label">Compounding Frequency</label>
        <div className="cx-chips" role="group" aria-label="Compounding Frequency">
          {COMPOUND_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className="cx-chip"
              data-active={compounding === o.id}
              onClick={() => setCompounding(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Optional>
        <Field
          label={`Current ${symbol} Price (USD)`}
          hint="Rewards ko fiat value mein dekhne ke liye"
          value={coinPrice}
          onChange={setCoinPrice}
          prefix="$"
          min={0}
        />
      </Optional>
    </>
  );

  const matchedPreset = STAKING_PRESETS.find((p) => p.id === activePreset);

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Coins}>
      Staked amount, APY aur duration enter karein — projected staking rewards aur daily/monthly yields calculate honge.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero */}
      <Hero
        label="Estimated Net Rewards"
        value={`${res.netRewards.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`}
        tone="up"
        sub={
          <>
            <Pill tone="up">+{res.effectiveReturnPct.toFixed(2)}% Return</Pill>
            {n.coinPrice > 0 && <span>≈ {fmtMoney(res.netRewardsFiat)}</span>}
          </>
        }
      />

      {/* Preset Notice / Unbonding period */}
      {matchedPreset && (
        <Notice kind="info">
          <span>
            <strong>{matchedPreset.name}:</strong> Unbonding period lagbhag{" "}
            <strong>{matchedPreset.unbondingDays === 0 ? "Instant (No lock)" : `${matchedPreset.unbondingDays} din`}</strong>{" "}
            ka hota hai. Unstaking ke waqt rewards pause ho sakte hain.
          </span>
        </Notice>
      )}

      {/* Breakdown Flow */}
      <SectionTitle>Capital & Staking Yield Waterfall</SectionTitle>
      <Flow
        rows={[
          {
            label: "Initial Staked Capital",
            value: res.stakedAmount,
            text: `${res.stakedAmount.toLocaleString()} ${symbol}`,
          },
          {
            label: `Gross Rewards (${res.apyPct}% APY, ${res.compounding})`,
            value: res.grossRewards,
            text: `+${res.grossRewards.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`,
          },
          ...(res.platformFee > 0
            ? [
                {
                  label: `Validator Commission (${res.validatorFeePct}%)`,
                  value: -res.platformFee,
                  text: `-${res.platformFee.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`,
                },
              ]
            : []),
          {
            label: "Final Total Balance",
            value: res.finalBalance,
            text: `${res.finalBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`,
            total: true,
          },
        ]}
      />

      {/* Stats */}
      <Stats
        items={[
          {
            label: "Daily Reward",
            value: `${res.dailyReward.toFixed(4)} ${symbol}`,
            tone: "up",
          },
          {
            label: "Monthly Reward",
            value: `${res.monthlyReward.toFixed(4)} ${symbol}`,
            tone: "up",
          },
          {
            label: "Annualized Yield",
            value: `${res.yearlyReward.toFixed(4)} ${symbol}`,
            tone: "up",
          },
          {
            label: "Effective ROI %",
            value: `+${res.effectiveReturnPct.toFixed(2)}%`,
            tone: "up",
          },
          {
            label: "Validator Fee",
            value: `${res.platformFee.toFixed(4)} ${symbol}`,
            tone: "down",
          },
          {
            label: "Final Value (USD)",
            value: fmtMoney(res.finalBalanceFiat),
            tone: "up",
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Compound / APR Formula",
            math:
              res.compounding === "none"
                ? `Simple APR: Gross = Principal × APY × Time = ${res.stakedAmount} × ${res.apyPct}% × ${(res.durationMonths / 12).toFixed(2)} yrs = ${res.grossRewards.toFixed(4)} ${symbol}`
                : `Compound (${res.compounding}): FV = P × (1 + r/n)^(n×t) = ${res.stakedAmount} × (1 + ${res.apyPct}%/n)^(n×${(res.durationMonths / 12).toFixed(2)}) = ${res.finalBalance.toFixed(4)} ${symbol}`,
          },
          {
            title: "2. Validator Fee Deduction",
            math: `Net Rewards = Gross Rewards (${res.grossRewards.toFixed(4)}) − Platform Fee (${res.validatorFeePct}% = ${res.platformFee.toFixed(4)}) = ${res.netRewards.toFixed(4)} ${symbol}`,
          },
          {
            title: "3. Projected Total Balance",
            math: `Total Balance = ${res.stakedAmount} ${symbol} (Principal) + ${res.netRewards.toFixed(4)} ${symbol} (Net Rewards) = ${res.finalBalance.toFixed(4)} ${symbol}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Staking Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Reward Projection"
      resultIcon={Coins}
      badge={<Pill tone="up">{res ? `+${res.effectiveReturnPct.toFixed(2)}%` : "Staking"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Net Rewards",
              value: `${res.netRewards.toFixed(4)} ${symbol}`,
              sub: `Total: ${res.finalBalance.toFixed(4)} ${symbol} · Return: +${res.effectiveReturnPct.toFixed(2)}%`,
              tone: "up",
            }
          : null
      }
      note="Staking yields network inflation, validation rewards aur slashing risk par depend karte hain. APY fixed nahi hoti, fluctuating hoti hai."
    />
  );
}
