"use client";

import { useMemo, useState } from "react";
import { Calculator, Receipt } from "lucide-react";
import { computePnl, type Side } from "@/lib/calculators/pnl";
import { fmtMoney, fmtNum, fmtPct, fmtSigned, toNum, tone } from "@/lib/calculators/format";
import { CalcLayout, Chips, DirectionToggle, EmptyState, Field, Flow, Hero, Notice, Pill, SectionTitle, SideBadge, Stats, Walkthrough } from "./ui";

const DEFAULTS = { side: "long" as Side, entry: "100", exit: "120", quantity: "10", feePct: "0.05", funding: "0" };
const FEE_PRESETS = ["0", "0.02", "0.05", "0.1"];

export default function PnlCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [exit, setExit] = useState(DEFAULTS.exit);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [feePct, setFeePct] = useState(DEFAULTS.feePct);
  const [funding, setFunding] = useState(DEFAULTS.funding);

  const nums = { entry: toNum(entry), exit: toNum(exit), quantity: toNum(quantity), feePct: toNum(feePct, 0), funding: toNum(funding, 0) };

  const result = useMemo(
    () => computePnl({ side, entry: nums.entry, exit: nums.exit, quantity: nums.quantity, feePct: nums.feePct, funding: nums.funding }),
    [side, nums.entry, nums.exit, nums.quantity, nums.feePct, nums.funding],
  );

  const bad = {
    entry: entry !== "" && !(nums.entry > 0),
    exit: exit !== "" && !(nums.exit > 0),
    quantity: quantity !== "" && !(nums.quantity > 0),
    feePct: feePct !== "" && !(nums.feePct >= 0),
  };

  const reset = () => {
    setSide(DEFAULTS.side);
    setEntry(DEFAULTS.entry);
    setExit(DEFAULTS.exit);
    setQuantity(DEFAULTS.quantity);
    setFeePct(DEFAULTS.feePct);
    setFunding(DEFAULTS.funding);
  };

  const t = tone(result?.net);
  const dir = side === "long" ? 1 : -1;
  const grossFormula = side === "long" ? "(Exit − Entry) × Quantity" : "(Entry − Exit) × Quantity";
  const fundingText = !result || result.funding === 0 ? fmtMoney(0) : result.funding > 0 ? `−${fmtMoney(result.funding)}` : `+${fmtMoney(-result.funding)}`;

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />
      <div className="cx-row-2">
        <Field label="Entry price" value={entry} onChange={setEntry} prefix="$" min={0} invalid={bad.entry} />
        <Field label="Exit price" value={exit} onChange={setExit} prefix="$" min={0} invalid={bad.exit} />
      </div>
      <Field label="Quantity" hint="Coins / contracts ki sankhya" value={quantity} onChange={setQuantity} min={0} invalid={bad.quantity} />
      <div>
        <Field
          label="Trading fee (per side)"
          hint="Entry aur exit — dono par lagta hai. Apne exchange ka taker / maker fee daalein."
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
          invalid={bad.feePct}
        />
        <Chips options={FEE_PRESETS} value={feePct} onPick={setFeePct} label="Fee presets" />
      </div>
      <Field
        label="Funding fee"
        optional
        hint="Kul funding kharcha $ mein. Diya = plus, mila = minus (−)."
        value={funding}
        onChange={setFunding}
        prefix="$"
      />
    </>
  );

  const body = !result ? (
    <EmptyState icon={Calculator}>Entry, exit aur quantity daalein — result yahan live dikhega.</EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Net P&L"
        tone={t}
        value={fmtSigned(result.net)}
        sub={
          <>
            <Pill tone={t}>{fmtPct(result.roiPct)} ROI</Pill>
            <span>on {fmtMoney(result.positionValue)} position</span>
          </>
        }
      />

      <SectionTitle>Gross se net tak</SectionTitle>
      <Flow
        rows={[
          { label: "Gross P&L", value: result.gross, text: fmtSigned(result.gross) },
          { label: "Entry fee", value: -result.entryFee, text: `−${fmtMoney(result.entryFee)}` },
          { label: "Exit fee", value: -result.exitFee, text: `−${fmtMoney(result.exitFee)}` },
          { label: "Funding", value: -result.funding, text: fundingText },
          { label: "Net P&L", value: result.net, text: fmtSigned(result.net), total: true },
        ]}
      />

      <Stats
        items={[
          { label: "Position value", value: fmtMoney(result.positionValue) },
          { label: "Exit value", value: fmtMoney(result.exitValue) },
          { label: "Total costs", value: `−${fmtMoney(result.totalFees + Math.max(0, result.funding))}` },
          { label: "Break-even exit", value: result.breakeven == null ? "—" : fmtMoney(result.breakeven) },
          { label: "ROI", value: fmtPct(result.roiPct), tone: t },
          { label: "Price move", value: fmtPct(((nums.exit - nums.entry) / nums.entry) * 100 * dir), tone: tone(result.gross) },
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: `Gross P&L = ${grossFormula}`,
            math: `${side === "long" ? `(${fmtNum(nums.exit)} − ${fmtNum(nums.entry)})` : `(${fmtNum(nums.entry)} − ${fmtNum(nums.exit)})`} × ${fmtNum(nums.quantity)} = ${fmtSigned(result.gross)}`,
          },
          { title: "Entry fee = Entry × Qty × Fee%", math: `${fmtNum(nums.entry)} × ${fmtNum(nums.quantity)} × ${fmtNum(nums.feePct)}% = ${fmtMoney(result.entryFee)}` },
          { title: "Exit fee = Exit × Qty × Fee%", math: `${fmtNum(nums.exit)} × ${fmtNum(nums.quantity)} × ${fmtNum(nums.feePct)}% = ${fmtMoney(result.exitFee)}` },
          {
            title: "Net P&L = Gross − Entry fee − Exit fee − Funding",
            math: `${fmtSigned(result.gross)} − ${fmtMoney(result.entryFee)} − ${fmtMoney(result.exitFee)} − ${fmtMoney(result.funding)} = ${fmtSigned(result.net)}`,
          },
          { title: "ROI % = Net P&L ÷ Initial position value × 100", math: `${fmtSigned(result.net)} ÷ ${fmtMoney(result.positionValue)} × 100 = ${fmtPct(result.roiPct)}` },
        ]}
      />
      {Math.abs(result.net) < 0.005 && <Notice kind="info">Net P&L lagbhag zero hai — fees aur funding ne poora gross kha liya.</Notice>}
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Trade details"
      inputsIcon={Calculator}
      onReset={reset}
      inputs={inputs}
      resultTitle="Result"
      resultIcon={Receipt}
      badge={<SideBadge side={side} />}
      result={body}
      dock={result ? { label: "Net P&L", value: fmtSigned(result.net), sub: `${fmtPct(result.roiPct)} ROI`, tone: t } : null}
      note="Estimate hai — exchange ka asli fee, slippage aur funding timing alag ho sakte hain. Trading advice nahi."
    />
  );
}
