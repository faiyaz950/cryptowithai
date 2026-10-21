"use client";

import { useMemo, useState } from "react";
import { Scale, SlidersHorizontal } from "lucide-react";
import { computePositionSize } from "@/lib/calculators/positionSize";
import { fmtMoney, fmtNum, fmtPct, fmtQty, toNum } from "@/lib/calculators/format";
import { CalcLayout, Chips, EmptyState, Field, Hero, Meter, Notice, Optional, Pill, PriceRuler, SectionTitle, SideBadge, Slider, Stats, Walkthrough } from "./ui";

const DEFAULTS = { balance: "10000", riskPct: "1", entry: "100", stopLoss: "95", feePct: "", slippagePct: "", leverage: "" };
const RISK_PRESETS = ["0.5", "1", "2", "3"];

export default function PositionSizeCalculator() {
  const [balance, setBalance] = useState(DEFAULTS.balance);
  const [riskPct, setRiskPct] = useState(DEFAULTS.riskPct);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [stopLoss, setStopLoss] = useState(DEFAULTS.stopLoss);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [slippagePct, setSlippagePct] = useState(DEFAULTS.slippagePct);
  const [leverage, setLeverage] = useState(DEFAULTS.leverage);

  const n = {
    balance: toNum(balance),
    riskPct: toNum(riskPct),
    entry: toNum(entry),
    stopLoss: toNum(stopLoss),
    // Optional fields: khaali = 0 / nahi diya.
    feePct: toNum(feePct, 0),
    slippagePct: toNum(slippagePct, 0),
    leverage: toNum(leverage, NaN),
  };

  const outcome = useMemo(
    () => computePositionSize({ balance: n.balance, riskPct: n.riskPct, entry: n.entry, stopLoss: n.stopLoss, feePct: n.feePct, slippagePct: n.slippagePct, leverage: n.leverage }),
    [n.balance, n.riskPct, n.entry, n.stopLoss, n.feePct, n.slippagePct, n.leverage],
  );
  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setBalance(DEFAULTS.balance);
    setRiskPct(DEFAULTS.riskPct);
    setEntry(DEFAULTS.entry);
    setStopLoss(DEFAULTS.stopLoss);
    setFeePct(DEFAULTS.feePct);
    setSlippagePct(DEFAULTS.slippagePct);
    setLeverage(DEFAULTS.leverage);
  };

  const bad = {
    balance: balance !== "" && !(n.balance > 0),
    riskPct: riskPct !== "" && !(n.riskPct > 0 && n.riskPct <= 100),
    entry: entry !== "" && !(n.entry > 0),
    stopLoss: stopLoss !== "" && (!(n.stopLoss > 0) || n.stopLoss === n.entry),
    feePct: feePct !== "" && !(n.feePct >= 0),
    slippagePct: slippagePct !== "" && !(n.slippagePct >= 0),
    leverage: leverage !== "" && !(n.leverage >= 1),
  };
  const hasCosts = n.feePct > 0 || n.slippagePct > 0;
  const riskPctLabel = Number.isFinite(n.riskPct) ? `${fmtNum(n.riskPct)}%` : "—";
  const noSign = (s: string) => s.replace("+", "");

  const inputs = (
    <>
      <Field label="Account balance" value={balance} onChange={setBalance} prefix="$" min={0} invalid={bad.balance} />

      <div>
        <Field label="Risk per trade" hint="Is trade mein account ka kitna % khona manzoor hai." value={riskPct} onChange={setRiskPct} suffix="%" min={0} invalid={bad.riskPct} />
        <Slider value={n.riskPct} onChange={setRiskPct} min={0.1} max={5} step={0.1} scale={["0.1%", "5%"]} />
        <Chips options={RISK_PRESETS} value={riskPct} onPick={setRiskPct} label="Risk presets" />
      </div>

      <div className="cx-row-2">
        <Field label="Entry price" value={entry} onChange={setEntry} prefix="$" min={0} invalid={bad.entry} />
        <Field label="Stop loss" value={stopLoss} onChange={setStopLoss} prefix="$" min={0} invalid={bad.stopLoss} />
      </div>
      <p className="cx-hint" style={{ marginTop: -10 }}>
        Stop loss entry se neeche ho to Long, upar ho to Short — direction apne aap pata chalta hai.
      </p>

      <Optional>
        <div className="cx-row-2">
          <Field label="Fee (per side)" value={feePct} onChange={setFeePct} suffix="%" min={0} invalid={bad.feePct} placeholder="0" />
          <Field label="Slippage (per fill)" value={slippagePct} onChange={setSlippagePct} suffix="%" min={0} invalid={bad.slippagePct} placeholder="0" />
        </div>
        <Field
          label="Leverage"
          hint="Sirf margin dikhane ke liye. Leverage se position size ya loss nahi badalta."
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          min={1}
          invalid={bad.leverage}
          placeholder="—"
        />
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Scale}>Balance, risk %, entry aur stop loss daalein — position size yahan live dikhega.</EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Position size"
        value={fmtQty(res.quantity)}
        unit="coins"
        sub={
          <>
            <Pill>{fmtMoney(res.positionValue)} value</Pill>
            <span>{noSign(fmtPct(res.positionPct))} of account</span>
          </>
        }
      />

      <SectionTitle>Risk ladder</SectionTitle>
      <PriceRuler stop={n.stopLoss} entry={n.entry} fmt={fmtMoney} />
      <Meter
        label="Position value vs account"
        valueText={`${noSign(fmtPct(res.positionPct))}`}
        pct={res.positionPct}
        high={res.positionPct > 100}
      />

      <Stats
        items={[
          { label: "Maximum risk", value: fmtMoney(res.riskAmount), tone: "down" },
          { label: "Risk / trade", value: riskPctLabel },
          { label: "Risk per coin", value: fmtMoney(res.riskPerUnit) },
          { label: "Stop distance", value: noSign(fmtPct(res.stopDistancePct)) },
          ...(res.margin != null
            ? [
                { label: `Margin (${fmtNum(n.leverage)}x)`, value: fmtMoney(res.margin), tone: res.marginExceedsBalance ? ("down" as const) : undefined },
                { label: "Margin / account", value: noSign(fmtPct(res.marginPctOfBalance ?? 0)), tone: res.marginExceedsBalance ? ("down" as const) : undefined },
              ]
            : [{ label: "Leverage needed", value: res.minLeverage <= 1 ? "Not needed" : `${res.minLeverage.toFixed(2)}x`, tone: res.minLeverage > 1 ? ("warn" as const) : undefined }, { label: "Direction", value: res.side === "long" ? "Long ↗" : "Short ↘" }]),
        ]}
      />

      {res.marginExceedsBalance && (
        <Notice kind="error">
          Itne leverage par bhi margin (<b>{fmtMoney(res.margin ?? 0)}</b>) account balance se zyada hai. Leverage badhao ya stop loss entry se thoda door rakho.
        </Notice>
      )}
      {!res.marginExceedsBalance && res.margin == null && res.minLeverage > 1 && (
        <Notice kind="warn">
          Ye position account balance se bada hai — khulne ke liye kam se kam <b>{res.minLeverage.toFixed(2)}x</b> leverage chahiye. Risk phir bhi {fmtMoney(res.riskAmount)} hi rahega.
        </Notice>
      )}
      {hasCosts && (
        <Notice kind="info">
          Fees <b>{fmtMoney(res.feesAtStop)}</b> + slippage <b>{fmtMoney(res.slippageAtStop)}</b> stop loss ke loss mein jodi gayi hain — risk per coin {fmtMoney(res.riskPerUnit)} se
          badhkar <b>{fmtMoney(res.effectiveRiskPerUnit)}</b> hua, isliye quantity thodi kam aayi. Stop hit hone par kul loss {fmtMoney(res.riskAmount)} hi rahega.
        </Notice>
      )}

      <Walkthrough
        steps={[
          { title: "Step 1 — Risk amount = Balance × Risk %", math: `${fmtMoney(n.balance)} × ${fmtNum(n.riskPct)}% = ${fmtMoney(res.riskAmount)}` },
          { title: "Step 2 — Risk per unit = |Entry − Stop loss|", math: `|${fmtNum(n.entry)} − ${fmtNum(n.stopLoss)}| = ${fmtMoney(res.riskPerUnit)}` },
          ...(hasCosts ? [{ title: "Fee + slippage ke baad risk per unit", math: fmtMoney(res.effectiveRiskPerUnit) }] : []),
          { title: "Step 3 — Quantity = Risk amount ÷ Risk per unit", math: `${fmtMoney(res.riskAmount)} ÷ ${fmtMoney(res.effectiveRiskPerUnit)} = ${fmtQty(res.quantity)} coins` },
          { title: "Position value = Quantity × Entry", math: `${fmtQty(res.quantity)} × ${fmtNum(n.entry)} = ${fmtMoney(res.positionValue)}` },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Account & trade"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Position size"
      resultIcon={Scale}
      badge={res ? <SideBadge side={res.side} /> : undefined}
      result={body}
      dock={res ? { label: "Position size", value: `${fmtQty(res.quantity)} coins`, sub: `${fmtMoney(res.positionValue)} · risk ${fmtMoney(res.riskAmount)}` } : null}
      note="Leverage risk % ka vikalp nahi hai — loss stop loss se tay hota hai, leverage sirf margin badalta hai. Exchange ki lot size / minimum quantity ke hisaab se quantity round karni pad sakti hai. Trading advice nahi."
    />
  );
}
