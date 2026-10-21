"use client";

import { useMemo, useState } from "react";
import { ShieldAlert, SlidersHorizontal } from "lucide-react";
import { computeStopLoss, type Side } from "@/lib/calculators/stopLoss";
import { fmtMoney, fmtNum, fmtPct, toNum } from "@/lib/calculators/format";
import { CalcLayout, Chips, DirectionToggle, EmptyState, Field, Hero, Meter, Notice, Pill, PriceRuler, SectionTitle, SideBadge, Slider, Stats, Walkthrough } from "./ui";

const DEFAULTS = { side: "long" as Side, balance: "10000", riskPct: "1", entry: "100", quantity: "20" };
const RISK_PRESETS = ["0.5", "1", "2", "3"];

export default function StopLossCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [balance, setBalance] = useState(DEFAULTS.balance);
  const [riskPct, setRiskPct] = useState(DEFAULTS.riskPct);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);

  const n = { balance: toNum(balance), riskPct: toNum(riskPct), entry: toNum(entry), quantity: toNum(quantity) };
  const outcome = useMemo(
    () => computeStopLoss({ side, balance: n.balance, riskPct: n.riskPct, entry: n.entry, quantity: n.quantity }),
    [side, n.balance, n.riskPct, n.entry, n.quantity],
  );
  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setBalance(DEFAULTS.balance);
    setRiskPct(DEFAULTS.riskPct);
    setEntry(DEFAULTS.entry);
    setQuantity(DEFAULTS.quantity);
  };

  const bad = {
    balance: balance !== "" && !(n.balance > 0),
    riskPct: riskPct !== "" && !(n.riskPct > 0 && n.riskPct <= 100),
    entry: entry !== "" && !(n.entry > 0),
    quantity: quantity !== "" && !(n.quantity > 0),
  };
  const noSign = (s: string) => s.replace("+", "");
  const riskPctLabel = Number.isFinite(n.riskPct) ? `${fmtNum(n.riskPct)}%` : "—";

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />
      <Field label="Account balance" value={balance} onChange={setBalance} prefix="$" min={0} invalid={bad.balance} />

      <div>
        <Field label="Risk per trade" hint="Stop loss hit hone par account ka kitna % jayega." value={riskPct} onChange={setRiskPct} suffix="%" min={0} invalid={bad.riskPct} />
        <Slider value={n.riskPct} onChange={setRiskPct} min={0.1} max={5} step={0.1} scale={["0.1%", "5%"]} />
        <Chips options={RISK_PRESETS} value={riskPct} onPick={setRiskPct} label="Risk presets" />
      </div>

      <div className="cx-row-2">
        <Field label="Entry price" value={entry} onChange={setEntry} prefix="$" min={0} invalid={bad.entry} />
        <Field label="Quantity" hint="Coins / contracts" value={quantity} onChange={setQuantity} min={0} invalid={bad.quantity} />
      </div>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={ShieldAlert}>Balance, risk %, entry aur quantity daalein — stop loss yahan live dikhega.</EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Stop loss price"
        value={fmtMoney(res.stopLoss)}
        sub={
          <>
            <Pill tone="down">Loss {fmtMoney(res.riskAmount)}</Pill>
            <span>
              {noSign(fmtPct(res.stopDistancePct))} {side === "long" ? "neeche" : "upar"} entry se
            </span>
          </>
        }
      />

      <SectionTitle>Risk ladder</SectionTitle>
      <PriceRuler stop={res.stopLoss} entry={n.entry} fmt={fmtMoney} />
      <Meter label="Position value vs account" valueText={noSign(fmtPct(res.positionPct))} pct={res.positionPct} high={res.positionPct > 100} />

      <Stats
        items={[
          { label: "Risk amount", value: fmtMoney(res.riskAmount), tone: "down" },
          { label: "Risk / trade", value: riskPctLabel },
          { label: "Risk per coin", value: fmtMoney(res.riskPerUnit) },
          { label: "Stop distance", value: noSign(fmtPct(res.stopDistancePct)) },
          { label: "Position value", value: fmtMoney(res.positionValue) },
          { label: "Leverage needed", value: res.minLeverage <= 1 ? "Not needed" : `${res.minLeverage.toFixed(2)}x`, tone: res.minLeverage > 1 ? "warn" : undefined },
        ]}
      />

      {res.minLeverage > 1 && (
        <Notice kind="warn">
          Position value account balance se bada hai — khulne ke liye kam se kam <b>{res.minLeverage.toFixed(2)}x</b> leverage chahiye. Stop hit hone par loss phir bhi {fmtMoney(res.riskAmount)} hi rahega.
        </Notice>
      )}

      <Walkthrough
        steps={[
          { title: "Risk amount = Balance × Risk %", math: `${fmtMoney(n.balance)} × ${fmtNum(n.riskPct)}% = ${fmtMoney(res.riskAmount)}` },
          { title: "Risk per coin = Risk amount ÷ Quantity", math: `${fmtMoney(res.riskAmount)} ÷ ${fmtNum(n.quantity)} = ${fmtMoney(res.riskPerUnit)}` },
          {
            title: side === "long" ? "Long SL = Entry − Risk per coin" : "Short SL = Entry + Risk per coin",
            math: `${fmtMoney(n.entry)} ${side === "long" ? "−" : "+"} ${fmtMoney(res.riskPerUnit)} = ${fmtMoney(res.stopLoss)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Account & position"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Stop loss"
      resultIcon={ShieldAlert}
      badge={<SideBadge side={side} />}
      result={body}
      dock={res ? { label: "Stop loss", value: fmtMoney(res.stopLoss), sub: `Loss ${fmtMoney(res.riskAmount)} · ${noSign(fmtPct(res.stopDistancePct))}` } : null}
      note="Fees aur slippage isme shamil nahi hain — unke saath exact quantity chahiye to Position Size calculator use karein. Stop-market order fast market mein slip ho sakta hai. Trading advice nahi."
    />
  );
}
