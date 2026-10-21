"use client";

import { useMemo, useState } from "react";
import { Cpu, DollarSign, HardDrive, SlidersHorizontal, Zap } from "lucide-react";
import { computeMining, MINING_PRESETS } from "@/lib/calculators/mining";
import { fmtMoney, fmtNum, fmtSigned, toNum } from "@/lib/calculators/format";
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
  hashrate: "200", // TH/s
  powerWatts: "3500",
  electricityRateKwh: "0.06",
  poolFeePct: "1.5",
  hardwareCost: "4800",
  coinPrice: "66500",
  dailyCoinsMined: "",
};

export default function MiningCalculator() {
  const [hashrate, setHashrate] = useState(DEFAULTS.hashrate);
  const [powerWatts, setPowerWatts] = useState(DEFAULTS.powerWatts);
  const [electricityRateKwh, setElectricityRateKwh] = useState(DEFAULTS.electricityRateKwh);
  const [poolFeePct, setPoolFeePct] = useState(DEFAULTS.poolFeePct);
  const [hardwareCost, setHardwareCost] = useState(DEFAULTS.hardwareCost);
  const [coinPrice, setCoinPrice] = useState(DEFAULTS.coinPrice);
  const [dailyCoinsMined, setDailyCoinsMined] = useState(DEFAULTS.dailyCoinsMined);

  const n = {
    hashrate: toNum(hashrate),
    powerWatts: toNum(powerWatts),
    electricityRateKwh: toNum(electricityRateKwh),
    poolFeePct: toNum(poolFeePct, 1.5),
    hardwareCost: toNum(hardwareCost, 0),
    coinPrice: toNum(coinPrice),
    dailyCoinsMined: toNum(dailyCoinsMined, NaN),
  };

  const outcome = useMemo(
    () =>
      computeMining({
        hashrate: n.hashrate,
        powerWatts: n.powerWatts,
        electricityRateKwh: n.electricityRateKwh,
        poolFeePct: n.poolFeePct,
        hardwareCost: n.hardwareCost,
        coinPrice: n.coinPrice,
        dailyCoinsMined: n.dailyCoinsMined,
      }),
    [n.hashrate, n.powerWatts, n.electricityRateKwh, n.poolFeePct, n.hardwareCost, n.coinPrice, n.dailyCoinsMined],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const handlePresetSelect = (id: string) => {
    const p = MINING_PRESETS.find((x) => x.id === id);
    if (p) {
      setHashrate(String(p.hashrateTh));
      setPowerWatts(String(p.powerWatts));
      setHardwareCost(String(p.hardwareCost));
      setCoinPrice(String(p.coinPrice));
      setDailyCoinsMined(String((p.hashrateTh * p.dailyCoinsPerTh).toFixed(8)));
    }
  };

  const reset = () => {
    setHashrate(DEFAULTS.hashrate);
    setPowerWatts(DEFAULTS.powerWatts);
    setElectricityRateKwh(DEFAULTS.electricityRateKwh);
    setPoolFeePct(DEFAULTS.poolFeePct);
    setHardwareCost(DEFAULTS.hardwareCost);
    setCoinPrice(DEFAULTS.coinPrice);
    setDailyCoinsMined(DEFAULTS.dailyCoinsMined);
  };

  const bad = {
    hashrate: hashrate !== "" && !(n.hashrate > 0),
    powerWatts: powerWatts !== "" && !(n.powerWatts >= 0),
    electricityRateKwh: electricityRateKwh !== "" && !(n.electricityRateKwh >= 0),
    poolFeePct: poolFeePct !== "" && !(n.poolFeePct >= 0),
    coinPrice: coinPrice !== "" && !(n.coinPrice > 0),
  };

  const inputs = (
    <>
      <div className="cx-field">
        <label className="cx-label">Hardware Rig Presets</label>
        <div className="grid grid-cols-1 gap-1.5">
          {MINING_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="text-left px-3 py-2 rounded-lg text-xs font-medium border bg-white/[0.02] border-white/10 text-slate-300 hover:border-cyan-500 hover:text-white transition-colors flex items-center justify-between"
              onClick={() => handlePresetSelect(p.id)}
            >
              <span>{p.name}</span>
              <span className="font-mono text-[11px] text-cyan-400">
                {p.hashrateTh} TH/s · {p.powerWatts}W
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Hashrate (TH/s)"
          hint="Mining computing power"
          value={hashrate}
          onChange={setHashrate}
          suffix="TH/s"
          min={0.1}
          invalid={bad.hashrate}
        />
        <Field
          label="Power Consumption"
          hint="Total rig wattage"
          value={powerWatts}
          onChange={setPowerWatts}
          suffix="W"
          min={0}
          invalid={bad.powerWatts}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Electricity Cost"
          hint="Per kilowatt-hour ($/kWh)"
          value={electricityRateKwh}
          onChange={setElectricityRateKwh}
          prefix="$"
          min={0}
          invalid={bad.electricityRateKwh}
        />
        <Field
          label="Pool Fee %"
          hint="Mining pool commission"
          value={poolFeePct}
          onChange={setPoolFeePct}
          suffix="%"
          min={0}
          invalid={bad.poolFeePct}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Coin Price ($)"
          hint="Mined coin market price"
          value={coinPrice}
          onChange={setCoinPrice}
          prefix="$"
          min={0.01}
          invalid={bad.coinPrice}
        />
        <Field
          label="Hardware Cost ($)"
          hint="Rig purchase price"
          value={hardwareCost}
          onChange={setHardwareCost}
          prefix="$"
          min={0}
        />
      </div>

      <Optional>
        <Field
          label="Daily Coins Mined Override"
          hint="Specific network reward if known"
          value={dailyCoinsMined}
          onChange={setDailyCoinsMined}
          optional
          placeholder="Auto estimated"
        />
      </Optional>
    </>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.dailyNetProfit > 0
      ? "up"
      : res.dailyNetProfit < 0
      ? "down"
      : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Cpu}>
      Mining hashrate, power consumption aur electricity rate enter karein — daily revenue aur payback live calculate hoga.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label="Estimated Daily Net Profit"
        value={fmtSigned(res.dailyNetProfit)}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              Monthly: {fmtSigned(res.monthlyNetProfit)}
            </Pill>
            <span>Electricity: -{fmtMoney(res.dailyElectricityCost)}/day</span>
          </>
        }
      />

      {/* Payback / Profit Notice */}
      <Notice kind={res.isProfitable ? "info" : "error"}>
        <span>
          {res.isProfitable ? (
            <span>
              <strong>Profitable Rig:</strong> Daily revenue <strong>{fmtMoney(res.dailyRevenue)}</strong> me se power cost <strong>-{fmtMoney(res.dailyElectricityCost)}</strong> nikalne ke baad{" "}
              <strong className="text-emerald-400">+{fmtMoney(res.dailyNetProfit)}/day ({fmtMoney(res.monthlyNetProfit)}/mo)</strong> profit banta hai.
              {res.paybackMonths != null && (
                <span> Estimated hardware payback period: <strong>~{res.paybackMonths} months ({res.paybackDays} days)</strong>.</span>
              )}
            </span>
          ) : (
            <span>
              <strong>Unprofitable Operation:</strong> Electricity cost ({fmtMoney(res.dailyElectricityCost)}/day) mined coins revenue ({fmtMoney(res.dailyRevenue)}/day) se zyada hai! Lower electricity tariff ($0.04 - $0.06/kWh) ki zarurat hai.
            </span>
          )}
        </span>
      </Notice>

      {/* Daily Cashflow Breakdown */}
      <SectionTitle>Daily Mining Cashflow Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: "Daily Mining Revenue", value: res.dailyRevenue, text: fmtMoney(res.dailyRevenue) },
          { label: "Daily Power Cost", value: -res.dailyElectricityCost, text: `-${fmtMoney(res.dailyElectricityCost)}` },
          ...(res.dailyPoolFee > 0
            ? [{ label: "Pool Fees", value: -res.dailyPoolFee, text: `-${fmtMoney(res.dailyPoolFee)}` }]
            : []),
          { label: "Daily Net Profit", value: res.dailyNetProfit, text: fmtSigned(res.dailyNetProfit), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Daily Mining Revenue", value: fmtMoney(res.dailyRevenue), tone: "up" as const },
          { label: "Daily Electricity Cost", value: `-${fmtMoney(res.dailyElectricityCost)}`, tone: "down" as const },
          { label: "Daily Power Consumption", value: `${res.dailyKwh.toFixed(1)} kWh` },
          { label: "Monthly Electricity Bill", value: fmtMoney(res.monthlyElectricityCost) },
          {
            label: "Daily Net Profit",
            value: fmtSigned(res.dailyNetProfit),
            tone: res.dailyNetProfit > 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Monthly Net Profit",
            value: fmtSigned(res.monthlyNetProfit),
            tone: res.monthlyNetProfit > 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Hardware Payback Period",
            value: res.paybackMonths ? `${res.paybackMonths} Months (${res.paybackDays} days)` : "N/A (Unprofitable)",
            tone: res.paybackMonths ? ("up" as const) : ("down" as const),
          },
          {
            label: "Annual Hardware ROI %",
            value: res.annualRoiPct ? `${res.annualRoiPct.toFixed(1)}%` : "—",
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Electricity Cost Formula",
            math: `Daily Power = (${res.powerWatts}W ÷ 1000) × 24h = ${res.dailyKwh.toFixed(1)} kWh | Cost = ${res.dailyKwh.toFixed(1)} kWh × ${fmtMoney(res.electricityRateKwh)} = ${fmtMoney(res.dailyElectricityCost)}`,
          },
          {
            title: "2. Daily Net Profit",
            math: `Net Profit = Revenue (${fmtMoney(res.dailyRevenue)}) − Power (${fmtMoney(res.dailyElectricityCost)}) − Pool (${fmtMoney(res.dailyPoolFee)}) = ${fmtSigned(res.dailyNetProfit)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Mining Hardware Specs"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Mining Profitability"
      resultIcon={Zap}
      badge={<Pill tone={heroTone}>{res?.isProfitable ? "Profitable" : "Check Rates"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Daily Mining Profit",
              value: fmtSigned(res.dailyNetProfit),
              sub: `Mo: ${fmtSigned(res.monthlyNetProfit)} · Power: ${fmtMoney(res.dailyElectricityCost)}`,
              tone: heroTone,
            }
          : null
      }
      note="Mining output global network difficulty, halving schedule aur pool luck ke saath dynamic rehta hai. Actual profitability continuous market updates par depend karti hai. Trading/Mining advice nahi."
    />
  );
}
