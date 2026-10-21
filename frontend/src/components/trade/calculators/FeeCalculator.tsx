"use client";

import { useMemo, useState } from "react";
import { Building2, Receipt, SlidersHorizontal } from "lucide-react";
import {
  computeCryptoFee,
  COMMON_FEE_PRESETS,
  type OrderRole,
} from "@/lib/calculators/fee";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum, tone } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Pill,
  PriceRuler,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const DEFAULTS = {
  buyPrice: "100",
  sellPrice: "110",
  quantity: "10",
  makerFeePct: "0.02",
  takerFeePct: "0.05",
  buyRole: "taker" as OrderRole,
  sellRole: "taker" as OrderRole,
  presetId: "binance_futures",
};

export default function FeeCalculator() {
  const [buyPrice, setBuyPrice] = useState(DEFAULTS.buyPrice);
  const [sellPrice, setSellPrice] = useState(DEFAULTS.sellPrice);
  const [quantity, setQuantity] = useState(DEFAULTS.quantity);
  const [makerFeePct, setMakerFeePct] = useState(DEFAULTS.makerFeePct);
  const [takerFeePct, setTakerFeePct] = useState(DEFAULTS.takerFeePct);
  const [buyRole, setBuyRole] = useState<OrderRole>(DEFAULTS.buyRole);
  const [sellRole, setSellRole] = useState<OrderRole>(DEFAULTS.sellRole);
  const [presetId, setPresetId] = useState(DEFAULTS.presetId);

  const n = {
    buyPrice: toNum(buyPrice),
    sellPrice: toNum(sellPrice),
    quantity: toNum(quantity),
    makerFeePct: toNum(makerFeePct),
    takerFeePct: toNum(takerFeePct),
  };

  const outcome = useMemo(
    () =>
      computeCryptoFee({
        buyPrice: n.buyPrice,
        sellPrice: n.sellPrice,
        quantity: n.quantity,
        makerFeePct: n.makerFeePct,
        takerFeePct: n.takerFeePct,
        buyRole,
        sellRole,
      }),
    [n.buyPrice, n.sellPrice, n.quantity, n.makerFeePct, n.takerFeePct, buyRole, sellRole],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const handleSelectPreset = (id: string) => {
    setPresetId(id);
    const p = COMMON_FEE_PRESETS.find((item) => item.id === id);
    if (p) {
      setMakerFeePct(String(p.makerPct));
      setTakerFeePct(String(p.takerPct));
    }
  };

  const reset = () => {
    setBuyPrice(DEFAULTS.buyPrice);
    setSellPrice(DEFAULTS.sellPrice);
    setQuantity(DEFAULTS.quantity);
    setMakerFeePct(DEFAULTS.makerFeePct);
    setTakerFeePct(DEFAULTS.takerFeePct);
    setBuyRole(DEFAULTS.buyRole);
    setSellRole(DEFAULTS.sellRole);
    setPresetId(DEFAULTS.presetId);
  };

  const bad = {
    buyPrice: buyPrice !== "" && !(n.buyPrice > 0),
    sellPrice: sellPrice !== "" && !(n.sellPrice > 0),
    quantity: quantity !== "" && !(n.quantity > 0),
    makerFeePct: makerFeePct !== "" && !(n.makerFeePct >= 0 && n.makerFeePct < 50),
    takerFeePct: takerFeePct !== "" && !(n.takerFeePct >= 0 && n.takerFeePct < 50),
  };

  const inputs = (
    <>
      {/* Exchange Preset */}
      <div>
        <span className="cx-label">
          <Building2 className="w-3.5 h-3.5 inline mr-1" />
          Exchange Preset
        </span>
        <div className="cx-chips" role="group" aria-label="Fee Presets">
          {COMMON_FEE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cx-chip"
              data-active={presetId === p.id}
              onClick={() => handleSelectPreset(p.id)}
            >
              {p.name.split(" (")[0]}
            </button>
          ))}
          <button
            type="button"
            className="cx-chip"
            data-active={presetId === "custom"}
            onClick={() => setPresetId("custom")}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Buy Price"
          value={buyPrice}
          onChange={setBuyPrice}
          prefix="$"
          min={0}
          invalid={bad.buyPrice}
        />
        <Field
          label="Sell Price"
          value={sellPrice}
          onChange={setSellPrice}
          prefix="$"
          min={0}
          invalid={bad.sellPrice}
        />
      </div>

      <Field
        label="Quantity"
        hint="Coins / contracts ki sankhya"
        value={quantity}
        onChange={setQuantity}
        min={0}
        invalid={bad.quantity}
      />

      {/* Buy & Sell Order Type Selection */}
      <div className="cx-row-2">
        <div>
          <span className="cx-label">Buy Order Role</span>
          <div className="cx-seg" role="group" aria-label="Buy Role">
            <button
              type="button"
              data-active={buyRole === "maker"}
              onClick={() => setBuyRole("maker")}
            >
              Maker (Limit)
            </button>
            <button
              type="button"
              data-active={buyRole === "taker"}
              onClick={() => setBuyRole("taker")}
            >
              Taker (Market)
            </button>
          </div>
        </div>

        <div>
          <span className="cx-label">Sell Order Role</span>
          <div className="cx-seg" role="group" aria-label="Sell Role">
            <button
              type="button"
              data-active={sellRole === "maker"}
              onClick={() => setSellRole("maker")}
            >
              Maker (Limit)
            </button>
            <button
              type="button"
              data-active={sellRole === "taker"}
              onClick={() => setSellRole("taker")}
            >
              Taker (Market)
            </button>
          </div>
        </div>
      </div>

      <div className="cx-row-2">
        <Field
          label="Maker Fee %"
          value={makerFeePct}
          onChange={(v) => {
            setMakerFeePct(v);
            setPresetId("custom");
          }}
          suffix="%"
          min={0}
          invalid={bad.makerFeePct}
        />
        <Field
          label="Taker Fee %"
          value={takerFeePct}
          onChange={(v) => {
            setTakerFeePct(v);
            setPresetId("custom");
          }}
          suffix="%"
          min={0}
          invalid={bad.takerFeePct}
        />
      </div>
    </>
  );

  const t = res ? tone(res.netPnl) : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Receipt}>
      Buy price, sell price aur fees daalein — calculation live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Total Trading Fees"
        value={fmtMoney(res.totalFees)}
        sub={
          <>
            <Pill tone={t}>
              Net P&amp;L: {fmtSigned(res.netPnl)} ({fmtPct(res.roiPct)})
            </Pill>
            <span>Effective Fee: {fmtPct(res.effectiveFeePct)} of position</span>
          </>
        }
      />

      {res.feeShareOfGrossPct != null && res.feeShareOfGrossPct > 25 && (
        <Notice kind="warn">
          Fees aapke gross profit ka <b>{res.feeShareOfGrossPct.toFixed(1)}%</b> hissa le rahi hain.
          Maker (limit) orders use karke aap fees bacha sakte hain.
        </Notice>
      )}

      <SectionTitle>Price Levels &amp; Break-even</SectionTitle>
      <PriceRuler
        stop={res.buyPrice}
        entry={res.breakevenSellPrice}
        target={res.sellPrice}
        fmt={fmtMoney}
      />

      <Stats
        items={[
          { label: "Buy Value (Entry)", value: fmtMoney(res.buyValue) },
          { label: "Sell Value (Exit)", value: fmtMoney(res.sellValue) },
          {
            label: "Entry Fee (Buy)",
            value: `${fmtMoney(res.buyFee)} (${res.buyFeePct}% ${buyRole.toUpperCase()})`,
          },
          {
            label: "Exit Fee (Sell)",
            value: `${fmtMoney(res.sellFee)} (${res.sellFeePct}% ${sellRole.toUpperCase()})`,
          },
          { label: "Total Fee", value: fmtMoney(res.totalFees), tone: "down" },
          { label: "Gross P&L", value: fmtSigned(res.grossPnl), tone: tone(res.grossPnl) },
          { label: "Net P&L", value: fmtSigned(res.netPnl), tone: t },
          { label: "Break-even Sell Price", value: fmtMoney(res.breakevenSellPrice) },
        ]}
      />

      {/* P&L to Fee Flow */}
      <SectionTitle>Gross se Net tak ka hisaab</SectionTitle>
      <Flow
        rows={[
          { label: "Gross P&L", value: res.grossPnl, text: fmtSigned(res.grossPnl) },
          { label: `Buy Fee (${buyRole})`, value: -res.buyFee, text: `−${fmtMoney(res.buyFee)}` },
          { label: `Sell Fee (${sellRole})`, value: -res.sellFee, text: `−${fmtMoney(res.sellFee)}` },
          { label: "Net P&L", value: res.netPnl, text: fmtSigned(res.netPnl), total: true },
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Buy Value = Buy Price × Quantity",
            math: `${fmtMoney(res.buyPrice)} × ${fmtQty(res.quantity)} = ${fmtMoney(res.buyValue)}`,
          },
          {
            title: `Buy Fee = Buy Value × Buy Fee % (${buyRole.toUpperCase()})`,
            math: `${fmtMoney(res.buyValue)} × ${fmtNum(res.buyFeePct)}% = ${fmtMoney(res.buyFee)}`,
          },
          {
            title: "Sell Value = Sell Price × Quantity",
            math: `${fmtMoney(res.sellPrice)} × ${fmtQty(res.quantity)} = ${fmtMoney(res.sellValue)}`,
          },
          {
            title: `Sell Fee = Sell Value × Sell Fee % (${sellRole.toUpperCase()})`,
            math: `${fmtMoney(res.sellValue)} × ${fmtNum(res.sellFeePct)}% = ${fmtMoney(res.sellFee)}`,
          },
          {
            title: "Total Fees = Buy Fee + Sell Fee",
            math: `${fmtMoney(res.buyFee)} + ${fmtMoney(res.sellFee)} = ${fmtMoney(res.totalFees)}`,
          },
          {
            title: "Net P&L = (Sell Value − Buy Value) − Total Fees",
            math: `(${fmtMoney(res.sellValue)} − ${fmtMoney(res.buyValue)}) − ${fmtMoney(res.totalFees)} = ${fmtSigned(res.netPnl)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Trade & fee parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Fee & P&L breakdown"
      resultIcon={Receipt}
      badge={<Pill tone="flat">{presetId.split("_")[0].toUpperCase()}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Total Fee",
              value: fmtMoney(res.totalFees),
              sub: `Net ${fmtSigned(res.netPnl)}`,
              tone: t,
            }
          : null
      }
      note="Exchanges spot aur futures ke liye alag fees charge karte hain. Limit orders maker fee trigger karte hain jabki market orders taker fee trigger karte hain."
    />
  );
}
