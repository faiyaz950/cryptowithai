"use client";

import { useMemo, useState } from "react";
import { Crown, SlidersHorizontal, Sparkles } from "lucide-react";
import { computeMukulRisk } from "@/lib/calculators/mukulRisk";
import { fmtMoney, fmtNum, fmtQty, fmtRatio, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  DirectionToggle,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Optional,
  Pill,
  PriceRuler,
  SectionTitle,
  SideBadge,
  Slider,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as const,
  balance: "10000",
  riskPct: "1",
  entryPrice: "100",
  stopLossPrice: "95",
  takeProfitPrice: "115",
  leverage: "",
  feePct: "",
};

const RISK_PRESETS = ["0.5", "1", "2", "3", "5"];

const SCENARIOS = [
  {
    label: "Mukul Example ($10k / 1% / 1:3 R:R)",
    side: "long" as const,
    balance: "10000",
    riskPct: "1",
    entry: "100",
    sl: "95",
    tp: "115",
    lev: "",
  },
  {
    label: "BTC Swing Long ($50k / 1% / 1:2.5)",
    side: "long" as const,
    balance: "50000",
    riskPct: "1",
    entry: "65000",
    sl: "63000",
    tp: "70000",
    lev: "5",
  },
  {
    label: "ETH Short ($20k / 1.5% / 1:2.0)",
    side: "short" as const,
    balance: "20000",
    riskPct: "1.5",
    entry: "3500",
    sl: "3650",
    tp: "3200",
    lev: "10",
  },
];

export default function MukulRiskCalculator() {
  const [side, setSide] = useState<"long" | "short">(DEFAULTS.side);
  const [balance, setBalance] = useState(DEFAULTS.balance);
  const [riskPct, setRiskPct] = useState(DEFAULTS.riskPct);
  const [entryPrice, setEntryPrice] = useState(DEFAULTS.entryPrice);
  const [stopLossPrice, setStopLossPrice] = useState(DEFAULTS.stopLossPrice);
  const [takeProfitPrice, setTakeProfitPrice] = useState(DEFAULTS.takeProfitPrice);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);

  const n = {
    balance: toNum(balance),
    riskPct: toNum(riskPct),
    entryPrice: toNum(entryPrice),
    stopLossPrice: toNum(stopLossPrice),
    takeProfitPrice: toNum(takeProfitPrice),
    leverage: toNum(leverage, NaN),
    feePct: toNum(feePct, 0),
  };

  const outcome = useMemo(
    () =>
      computeMukulRisk({
        side,
        balance: n.balance,
        riskPct: n.riskPct,
        entryPrice: n.entryPrice,
        stopLossPrice: n.stopLossPrice,
        takeProfitPrice: n.takeProfitPrice,
        leverage: n.leverage,
        feePct: n.feePct,
      }),
    [side, n.balance, n.riskPct, n.entryPrice, n.stopLossPrice, n.takeProfitPrice, n.leverage, n.feePct],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setBalance(DEFAULTS.balance);
    setRiskPct(DEFAULTS.riskPct);
    setEntryPrice(DEFAULTS.entryPrice);
    setStopLossPrice(DEFAULTS.stopLossPrice);
    setTakeProfitPrice(DEFAULTS.takeProfitPrice);
    setLeverage(DEFAULTS.leverage);
    setFeePct(DEFAULTS.feePct);
  };

  const bad = {
    balance: balance !== "" && !(n.balance > 0),
    riskPct: riskPct !== "" && !(n.riskPct > 0 && n.riskPct <= 100),
    entryPrice: entryPrice !== "" && !(n.entryPrice > 0),
    stopLossPrice:
      stopLossPrice !== "" &&
      (!(n.stopLossPrice > 0) ||
        (side === "long" ? n.stopLossPrice >= n.entryPrice : n.stopLossPrice <= n.entryPrice)),
    takeProfitPrice:
      takeProfitPrice !== "" &&
      (!(n.takeProfitPrice > 0) ||
        (side === "long" ? n.takeProfitPrice <= n.entryPrice : n.takeProfitPrice >= n.entryPrice)),
    leverage: leverage !== "" && !(n.leverage >= 1),
    feePct: feePct !== "" && !(n.feePct >= 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />

      <Field
        label="Account Balance"
        hint="Aapke trading account ka kul balance"
        value={balance}
        onChange={setBalance}
        prefix="$"
        min={0}
        invalid={bad.balance}
      />

      <div>
        <Field
          label="Risk per Trade"
          hint="Ek trade par kitna % capital risk karna hai"
          value={riskPct}
          onChange={setRiskPct}
          suffix="%"
          min={0.1}
          invalid={bad.riskPct}
        />
        <Slider
          value={n.riskPct}
          onChange={setRiskPct}
          min={0.25}
          max={5}
          step={0.25}
          scale={["0.25%", "5%"]}
        />
        <Chips
          options={RISK_PRESETS}
          value={riskPct}
          onPick={setRiskPct}
          suffix="%"
          label="Risk presets"
        />
      </div>

      <Field
        label="Entry Price"
        hint="Jis price par buy ya short karenge"
        value={entryPrice}
        onChange={setEntryPrice}
        prefix="$"
        min={0}
        invalid={bad.entryPrice}
      />

      <Field
        label="Stop Loss Price"
        hint={side === "long" ? "Entry se neeche ka exit point" : "Entry se upar ka exit point"}
        value={stopLossPrice}
        onChange={setStopLossPrice}
        prefix="$"
        min={0}
        invalid={bad.stopLossPrice}
      />

      <Field
        label="Take Profit Price"
        hint={side === "long" ? "Entry se upar ka profit target" : "Entry se neeche ka profit target"}
        value={takeProfitPrice}
        onChange={setTakeProfitPrice}
        prefix="$"
        min={0}
        invalid={bad.takeProfitPrice}
      />

      <Chips
        options={SCENARIOS.map((s) => s.label)}
        value={
          SCENARIOS.find(
            (s) =>
              s.side === side &&
              s.balance === balance &&
              s.entry === entryPrice &&
              s.sl === stopLossPrice &&
              s.tp === takeProfitPrice,
          )?.label ?? ""
        }
        onPick={(lbl) => {
          const match = SCENARIOS.find((s) => s.label === lbl);
          if (match) {
            setSide(match.side);
            setBalance(match.balance);
            setRiskPct(match.riskPct);
            setEntryPrice(match.entry);
            setStopLossPrice(match.sl);
            setTakeProfitPrice(match.tp);
            setLeverage(match.lev);
          }
        }}
        label="Presets"
      />

      <Optional>
        <Field
          label="Leverage (Futures)"
          hint="Default 1× (Spot). 2×, 5×, 10× etc."
          value={leverage}
          onChange={setLeverage}
          suffix="×"
          min={1}
          optional
          placeholder="1"
          invalid={bad.leverage}
        />
        <Field
          label="Fee Rate (Maker/Taker)"
          hint="Exchange fee % per side (e.g. 0.05%)"
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
          optional
          placeholder="0.05"
          invalid={bad.feePct}
        />
      </Optional>
    </>
  );

  const rrRatioLabel = res ? fmtRatio(res.riskRewardRatio) : "1:—";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Crown}>
      Account balance, risk %, entry, stop loss aur take profit daal kar complete position plan ek hi screen par dekhein.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Flagship Hero Card */}
      <Hero
        label={`Recommended Position Size (${side.toUpperCase()})`}
        value={`${fmtQty(res.positionSize)} coins`}
        tone="up"
        sub={
          <>
            <SideBadge side={res.side} />
            <Pill tone={res.riskRewardRatio >= 2 ? "up" : res.riskRewardRatio >= 1.5 ? "flat" : "down"}>
              Risk/Reward: {rrRatioLabel}
            </Pill>
            <span>Value: {fmtMoney(res.positionValue)}</span>
          </>
        }
      />

      {/* Visual Price Ruler */}
      <SectionTitle>Trade Price Levels</SectionTitle>
      <PriceRuler
        stop={res.stopLossPrice}
        entry={res.entryPrice}
        target={res.takeProfitPrice}
        fmt={fmtMoney}
      />

      {/* Risk vs Reward Metric Notice */}
      <Notice kind={res.riskRewardRatio >= 2 ? "info" : res.riskRewardRatio >= 1.5 ? "info" : "warn"}>
        <span>
          <strong>Trade Setup Edge:</strong> Aap <strong>{fmtMoney(res.riskAmount)}</strong> ({fmtNum(res.riskPct)}% account) risk kar rahe hain{" "}
          <strong className="text-emerald-400">+{fmtMoney(res.potentialProfit)}</strong> (+{res.roiOnAccountProfit.toFixed(1)}% gain) kamane ke liye.
          Is <strong>{rrRatioLabel}</strong> R:R setup mein break-even rehne ke liye aapko sirf{" "}
          <strong>{res.breakevenWinRate.toFixed(1)}% win rate</strong> chahiye.
        </span>
      </Notice>

      {/* Liquidation safety warning if leverage used */}
      {res.leverage > 1 && res.estimatedLiqPrice != null && (
        <Notice kind={res.isSafeFromLiquidation ? "info" : "error"}>
          <span>
            <strong>Futures Safety Check ({res.leverage}×):</strong> Estimated Liq Price ≈{" "}
            <strong>{fmtMoney(res.estimatedLiqPrice)}</strong> ({res.liqDistancePct?.toFixed(1)}% away).
            {res.isSafeFromLiquidation ? (
              <span className="text-emerald-400">
                {" "}✓ Safe: Aapka Stop Loss ({fmtMoney(res.stopLossPrice)}) liquidation se pehle trigger hoga.
              </span>
            ) : (
              <span className="text-rose-400">
                {" "}⚠ Danger: Stop Loss liquidation price ke baad pad raha hai! Pehle liquidate ho jayenge.
              </span>
            )}
          </span>
        </Notice>
      )}

      {/* Visual Flow / Breakdown */}
      <SectionTitle>Capital & P&L Projection Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: "Account Balance", value: res.balance, text: fmtMoney(res.balance) },
          { label: "Max Risk Budget", value: -res.riskAmount, text: `-${fmtMoney(res.riskAmount)} (${fmtNum(res.riskPct)}%)` },
          { label: "Position Notional Value", value: res.positionValue, text: fmtMoney(res.positionValue) },
          ...(res.leverage > 1
            ? [{ label: `Margin Required (${res.leverage}×)`, value: res.marginRequired, text: fmtMoney(res.marginRequired) }]
            : []),
          { label: "Potential Profit (TP)", value: res.potentialProfit, text: `+${fmtMoney(res.potentialProfit)} (+${res.roiOnAccountProfit.toFixed(1)}%)`, total: true },
        ]}
      />

      {/* Flagship All-In-One Stats Grid */}
      <Stats
        items={[
          { label: "Position Size", value: `${fmtQty(res.positionSize)} coins`, tone: "up" as const },
          { label: "Position Value", value: fmtMoney(res.positionValue) },
          { label: "Maximum Risk (SL)", value: `-${fmtMoney(res.riskAmount)} (-${fmtNum(res.riskPct)}%)`, tone: "down" as const },
          {
            label: "Potential Profit (TP)",
            value: `+${fmtMoney(res.potentialProfit)} (+${res.roiOnAccountProfit.toFixed(1)}%)`,
            tone: "up" as const,
          },
          {
            label: "Risk / Reward Ratio",
            value: rrRatioLabel,
            tone: res.riskRewardRatio >= 2 ? ("up" as const) : res.riskRewardRatio >= 1.5 ? undefined : ("warn" as const),
          },
          { label: "Risk per Coin", value: fmtMoney(res.riskPerUnit), tone: "down" as const },
          { label: "Reward per Coin", value: fmtMoney(res.rewardPerUnit), tone: "up" as const },
          { label: "Stop Loss Distance", value: `-${res.slDistancePct.toFixed(2)}%`, tone: "down" as const },
          { label: "Take Profit Target", value: `+${res.tpDistancePct.toFixed(2)}%`, tone: "up" as const },
          { label: "Balance if Stopped Out", value: fmtMoney(res.accountAtLoss), tone: "down" as const },
          { label: "Balance if TP Hit", value: fmtMoney(res.accountAtProfit), tone: "up" as const },
          { label: "Min Breakeven Win Rate", value: `${res.breakevenWinRate.toFixed(1)}%` },
          ...(res.leverage > 1
            ? [
                { label: "Leverage", value: `${res.leverage}×` },
                { label: "Margin Required", value: fmtMoney(res.marginRequired) },
                {
                  label: "Estimated Liq Price",
                  value: res.estimatedLiqPrice ? fmtMoney(res.estimatedLiqPrice) : "—",
                  tone: res.isSafeFromLiquidation ? undefined : ("down" as const),
                },
              ]
            : []),
          ...(res.hasFees && res.totalFeeProfit != null && res.netProfitWithFees != null
            ? [
                { label: "Estimated Total Fees", value: fmtMoney(res.totalFeeProfit) },
                { label: "Net Profit (After Fees)", value: fmtSigned(res.netProfitWithFees), tone: "up" as const },
              ]
            : []),
        ]}
      />

      {/* Step by Step Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Maximum Risk Amount",
            math: `Risk Amount = Balance × (Risk % ÷ 100) = ${fmtMoney(res.balance)} × ${fmtNum(res.riskPct)}% = ${fmtMoney(res.riskAmount)}`,
          },
          {
            title: "2. Position Size (Coins)",
            math: `Position Size = Risk Amount ÷ |Entry − SL| = ${fmtMoney(res.riskAmount)} ÷ ${fmtMoney(res.riskPerUnit)} = ${fmtQty(res.positionSize)} coins`,
          },
          {
            title: "3. Position Value & Potential Profit",
            math: `Value = ${fmtQty(res.positionSize)} × ${fmtMoney(res.entryPrice)} = ${fmtMoney(res.positionValue)} | Profit = ${fmtQty(res.positionSize)} × ${fmtMoney(res.rewardPerUnit)} = +${fmtMoney(res.potentialProfit)}`,
          },
          {
            title: "4. Risk to Reward Edge",
            math: `R:R = Reward ÷ Risk = ${rrRatioLabel} (Min Breakeven Win Rate: ${res.breakevenWinRate.toFixed(1)}%)`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="All-in-one trade levels"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Mukul Risk Engine"
      resultIcon={Crown}
      badge={<Pill tone={res && res.riskRewardRatio >= 2 ? "up" : "flat"}>{res ? `R:R ${rrRatioLabel}` : "👑 Flagship"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Position Size",
              value: `${fmtQty(res.positionSize)} coins`,
              sub: `Risk: ${fmtMoney(res.riskAmount)} · R:R ${rrRatioLabel}`,
              tone: "up",
            }
          : null
      }
      note="Mukul Crypto Club flagship risk formula: Position sizing accounts for account risk first — market chahe kitna bhi volatile ho, predetermined stop-loss se zyada loss nahi ho sakta. Trading advice nahi."
    />
  );
}
