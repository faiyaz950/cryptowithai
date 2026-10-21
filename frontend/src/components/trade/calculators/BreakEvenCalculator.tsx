"use client";

import { useMemo, useState } from "react";
import { Building2, Equal, SlidersHorizontal } from "lucide-react";
import {
  computeBreakEven,
  FEE_PRESETS,
  type ExchangePreset,
  type Side,
} from "@/lib/calculators/breakeven";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum } from "@/lib/calculators/format";
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
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  side: "long" as Side,
  entry: "100",
  entryFeePct: "0.10",
  exitFeePct: "0.10",
  quantity: "1",
  otherCosts: "",
  preset: "custom" as ExchangePreset,
};

const PRESET_OPTIONS: { id: ExchangePreset; label: string }[] = [
  { id: "custom", label: "Custom (0.10%)" },
  { id: "spot_standard", label: "Spot (0.10%)" },
  { id: "binance_futures", label: "Binance (0.05%)" },
  { id: "bybit_futures", label: "Bybit (0.055%)" },
  { id: "delta_futures", label: "Delta (0.05%)" },
];

export default function BreakEvenCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [entryFeePct, setEntryFeePct] = useState(DEFAULTS.entryFeePct);
  const [exitFeePct, setExitFeePct] = useState(DEFAULTS.exitFeePct);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [otherCosts, setOtherCosts] = useState(DEFAULTS.otherCosts);
  const [preset, setPreset] = useState<ExchangePreset>(DEFAULTS.preset);

  const n = {
    entry: toNum(entry),
    entryFeePct: toNum(entryFeePct),
    exitFeePct: toNum(exitFeePct),
    quantity: toNum(quantity, 1),
    otherCosts: toNum(otherCosts, 0),
  };

  const outcome = useMemo(
    () =>
      computeBreakEven({
        side,
        entry: n.entry,
        entryFeePct: n.entryFeePct,
        exitFeePct: n.exitFeePct,
        quantity: n.quantity,
        otherCosts: n.otherCosts,
      }),
    [side, n.entry, n.entryFeePct, n.exitFeePct, n.quantity, n.otherCosts],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const handlePresetSelect = (p: ExchangePreset) => {
    setPreset(p);
    const profile = FEE_PRESETS[p];
    if (profile) {
      setEntryFeePct(String(profile.takerFeePct));
      setExitFeePct(String(profile.takerFeePct));
    }
  };

  const handleOrderTypePreset = (type: "taker-taker" | "maker-taker" | "maker-maker") => {
    const profile = FEE_PRESETS[preset] ?? FEE_PRESETS.binance_futures;
    if (type === "taker-taker") {
      setEntryFeePct(String(profile.takerFeePct));
      setExitFeePct(String(profile.takerFeePct));
    } else if (type === "maker-taker") {
      setEntryFeePct(String(profile.makerFeePct));
      setExitFeePct(String(profile.takerFeePct));
    } else {
      setEntryFeePct(String(profile.makerFeePct));
      setExitFeePct(String(profile.makerFeePct));
    }
  };

  const reset = () => {
    setSide(DEFAULTS.side);
    setEntry(DEFAULTS.entry);
    setEntryFeePct(DEFAULTS.entryFeePct);
    setExitFeePct(DEFAULTS.exitFeePct);
    setQuantity(DEFAULTS.quantity);
    setOtherCosts(DEFAULTS.otherCosts);
    setPreset(DEFAULTS.preset);
  };

  const bad = {
    entry: entry !== "" && !(n.entry > 0),
    entryFeePct: entryFeePct !== "" && !(n.entryFeePct >= 0 && n.entryFeePct < 50),
    exitFeePct: exitFeePct !== "" && !(n.exitFeePct >= 0 && n.exitFeePct < 50),
    quantity: quantity !== "" && !(n.quantity > 0),
    otherCosts: otherCosts !== "" && !(n.otherCosts >= 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />

      {/* Exchange Preset Selector */}
      <div className="cx-field">
        <label className="cx-label">Exchange Fee Preset</label>
        <div className="cx-chips" role="group" aria-label="Fee Presets">
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cx-chip"
              data-active={preset === p.id || undefined}
              onClick={() => handlePresetSelect(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Style */}
      <div>
        <span className="cx-label">Order Type Preset</span>
        <div className="cx-chips" role="group" aria-label="Order Types">
          <button
            type="button"
            className="cx-chip"
            onClick={() => handleOrderTypePreset("taker-taker")}
          >
            Taker / Taker (Market)
          </button>
          <button
            type="button"
            className="cx-chip"
            onClick={() => handleOrderTypePreset("maker-taker")}
          >
            Maker / Taker (Limit Entry)
          </button>
          <button
            type="button"
            className="cx-chip"
            onClick={() => handleOrderTypePreset("maker-maker")}
          >
            Maker / Maker (Limit)
          </button>
        </div>
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
          label="Quantity"
          hint="Coins / contracts"
          value={quantity}
          onChange={setQuantity}
          min={0.000001}
          invalid={bad.quantity}
        />
      </div>

      <div className="cx-row-2">
        <Field
          label="Entry Fee"
          hint="Entry order fee %"
          value={entryFeePct}
          onChange={setEntryFeePct}
          suffix="%"
          min={0}
          invalid={bad.entryFeePct}
        />
        <Field
          label="Exit Fee"
          hint="Exit order fee %"
          value={exitFeePct}
          onChange={setExitFeePct}
          suffix="%"
          min={0}
          invalid={bad.exitFeePct}
        />
      </div>

      <Optional>
        <Field
          label="Other Costs ($)"
          hint="Funding fees, borrow rates ya slippage ($)"
          value={otherCosts}
          onChange={setOtherCosts}
          prefix="$"
          min={0}
          optional
          placeholder="0"
          invalid={bad.otherCosts}
        />
      </Optional>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Equal}>
      Entry price aur fees daalein — break-even price yahan live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Break-even Exit Price"
        value={fmtMoney(res.breakevenPrice)}
        sub={
          <>
            <Pill tone="flat">
              {res.priceDiffPct >= 0 ? "+" : ""}
              {res.priceDiffPct.toFixed(2)}% move required
            </Pill>
            <span>
              Total Fees: {fmtMoney(res.totalFees)} {res.otherCosts > 0 ? `+ Other: ${fmtMoney(res.otherCosts)}` : ""}
            </span>
          </>
        }
      />

      <SectionTitle>Price Levels</SectionTitle>
      <PriceRuler
        stop={Math.min(res.entry, res.breakevenPrice)}
        entry={res.entry}
        target={Math.max(res.entry, res.breakevenPrice)}
        fmt={fmtMoney}
      />

      <Stats
        items={[
          { label: "Break-even Price", value: fmtMoney(res.breakevenPrice), tone: "up" as const },
          { label: "Entry Cost Basis", value: fmtMoney(res.entryCost) },
          {
            label: "Break-even Return %",
            value: `${res.breakevenReturnPct.toFixed(2)}%`,
          },
          { label: "Total Estimated Fees", value: fmtMoney(res.totalFees) },
          { label: "Entry Fee", value: fmtMoney(res.entryFee) },
          { label: "Exit Fee", value: fmtMoney(res.exitFee) },
          ...(res.otherCosts > 0 ? [{ label: "Other Costs", value: fmtMoney(res.otherCosts) }] : []),
          { label: "Net P&L at BE", value: fmtMoney(res.netPnlAtBreakeven) },
        ]}
      />

      {/* Gross vs Fees Breakdown */}
      <SectionTitle>Break-even Cost Offset</SectionTitle>
      <Flow
        rows={[
          { label: "Gross Profit Needed", value: res.grossPnlAtBreakeven, text: fmtSigned(res.grossPnlAtBreakeven) },
          { label: "Entry Fee", value: -res.entryFee, text: `−${fmtMoney(res.entryFee)}` },
          { label: "Exit Fee", value: -res.exitFee, text: `−${fmtMoney(res.exitFee)}` },
          ...(res.otherCosts > 0
            ? [{ label: "Other Costs", value: -res.otherCosts, text: `−${fmtMoney(res.otherCosts)}` }]
            : []),
          { label: "Net P&L", value: res.netPnlAtBreakeven, text: fmtMoney(0), total: true },
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Total Fee Load ≈ Entry Fee + Exit Fee",
            math: `${fmtNum(res.entryFeePct)}% + ${fmtNum(res.exitFeePct)}% = ${fmtNum(res.totalFeePct)}%`,
          },
          {
            title:
              side === "long"
                ? "Long BE = (Entry × (1 + Entry Fee) + Other Costs / Qty) ÷ (1 − Exit Fee)"
                : "Short BE = (Entry × (1 − Entry Fee) − Other Costs / Qty) ÷ (1 + Exit Fee)",
            math:
              side === "long"
                ? `(${fmtMoney(res.entry)} × (1 + ${(res.entryFeePct / 100).toFixed(4)}) + ${fmtMoney(res.otherCosts)} / ${res.quantity}) ÷ (1 − ${(res.exitFeePct / 100).toFixed(4)}) = ${fmtMoney(res.breakevenPrice)}`
                : `(${fmtMoney(res.entry)} × (1 − ${(res.entryFeePct / 100).toFixed(4)}) − ${fmtMoney(res.otherCosts)} / ${res.quantity}) ÷ (1 + ${(res.exitFeePct / 100).toFixed(4)}) = ${fmtMoney(res.breakevenPrice)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Break-even parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Break-even analysis"
      resultIcon={Equal}
      badge={<SideBadge side={side} />}
      result={body}
      dock={
        res
          ? {
              label: "Break-even Price",
              value: fmtMoney(res.breakevenPrice),
              sub: `${res.priceDiffPct >= 0 ? "+" : ""}${res.priceDiffPct.toFixed(2)}% move · ${side}`,
            }
          : null
      }
      note="Actual break-even price exchange fee tiers, VIP levels aur funding/slippage costs ke hisaab se minor vary kar sakta hai. Trading advice nahi."
    />
  );
}
