"use client";

import { useMemo, useState } from "react";
import { Layers, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { computeAverageEntry } from "@/lib/calculators/averageEntry";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum, tone } from "@/lib/calculators/format";
import {
  CalcLayout,
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

interface Row {
  id: string;
  price: string;
  quantity: string;
}

const DEFAULT_ROWS: Row[] = [
  { id: "1", price: "100", quantity: "1" },
  { id: "2", price: "90", quantity: "2" },
  { id: "3", price: "80", quantity: "3" },
];

export default function AverageEntryCalculator() {
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS);
  const [currentPrice, setCurrentPrice] = useState("");

  const parsedPurchases = useMemo(
    () =>
      rows.map((r) => ({
        price: toNum(r.price, NaN),
        quantity: toNum(r.quantity, NaN),
      })),
    [rows],
  );

  const parsedCurrentPrice = toNum(currentPrice, NaN);

  const outcome = useMemo(
    () =>
      computeAverageEntry({
        purchases: parsedPurchases,
        currentPrice: parsedCurrentPrice,
      }),
    [parsedPurchases, parsedCurrentPrice],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const handleUpdate = (id: string, field: "price" | "quantity", val: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleAddRow = () => {
    const nextId = String(Date.now());
    const lastPrice = rows.length > 0 ? rows[rows.length - 1].price : "100";
    setRows((prev) => [...prev, { id: nextId, price: lastPrice, quantity: "1" }]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const reset = () => {
    setRows(DEFAULT_ROWS);
    setCurrentPrice("");
  };

  const inputs = (
    <>
      <div className="flex items-center justify-between">
        <span className="cx-label" style={{ marginBottom: 0 }}>
          Purchases / Orders ({rows.length})
        </span>
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Buy
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => {
          const rowPrice = toNum(r.price, NaN);
          const rowQty = toNum(r.quantity, NaN);
          const rowCost = Number.isFinite(rowPrice) && Number.isFinite(rowQty) ? rowPrice * rowQty : NaN;
          const badPrice = r.price !== "" && !(rowPrice > 0);
          const badQty = r.quantity !== "" && !(rowQty > 0);

          return (
            <div
              key={r.id}
              className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 transition-all hover:border-white/20"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Buy #{idx + 1}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-emerald-400">
                    {Number.isFinite(rowCost) ? fmtMoney(rowCost) : "—"}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(r.id)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded-md transition-colors cursor-pointer"
                      aria-label={`Remove Buy #${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="cx-row-2">
                <Field
                  label="Buy Price"
                  value={r.price}
                  onChange={(v) => handleUpdate(r.id, "price", v)}
                  prefix="$"
                  min={0}
                  invalid={badPrice}
                  placeholder="100"
                />
                <Field
                  label="Quantity"
                  value={r.quantity}
                  onChange={(v) => handleUpdate(r.id, "quantity", v)}
                  min={0}
                  invalid={badQty}
                  placeholder="1"
                />
              </div>
            </div>
          );
        })}
      </div>

      <Field
        label="Current Market Price"
        optional
        hint="Live portfolio value aur unrealized P&L janne ke liye"
        value={currentPrice}
        onChange={setCurrentPrice}
        prefix="$"
        min={0}
        placeholder="e.g. 86.67"
      />
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Layers}>
      Apne buy orders aur quantity daalein — average entry price yahan live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Average Entry Price"
        value={fmtMoney(res.averagePrice)}
        sub={
          <>
            <Pill tone="up">{fmtQty(res.totalQuantity)} total coins</Pill>
            <span>Total Spent: {fmtMoney(res.totalCost)}</span>
          </>
        }
      />

      <SectionTitle>Price Spread &amp; Range</SectionTitle>
      <PriceRuler
        stop={res.lowestPrice}
        entry={res.averagePrice}
        target={res.highestPrice}
        fmt={fmtMoney}
      />

      <Stats
        items={[
          { label: "Average Entry", value: fmtMoney(res.averagePrice), tone: "up" },
          { label: "Total Cost", value: fmtMoney(res.totalCost) },
          { label: "Total Quantity", value: `${fmtQty(res.totalQuantity)} coins` },
          { label: "Lowest Buy", value: fmtMoney(res.lowestPrice) },
          { label: "Highest Buy", value: fmtMoney(res.highestPrice) },
          {
            label: "Price Range",
            value: `${fmtMoney(res.highestPrice - res.lowestPrice)} (${fmtPct(
              ((res.highestPrice - res.lowestPrice) / res.lowestPrice) * 100,
            )})`,
          },
          ...(res.currentPrice != null && res.currentValue != null && res.netPnl != null && res.roiPct != null
            ? [
                { label: "Current Price", value: fmtMoney(res.currentPrice) },
                { label: "Portfolio Value", value: fmtMoney(res.currentValue), tone: tone(res.netPnl) },
                { label: "Unrealized P&L", value: fmtSigned(res.netPnl), tone: tone(res.netPnl) },
                { label: "ROI", value: fmtPct(res.roiPct), tone: tone(res.netPnl) },
              ]
            : []),
        ]}
      />

      {/* Position weighting breakdown */}
      <SectionTitle>Purchases Distribution</SectionTitle>
      <Flow
        rows={res.items.map((it, idx) => ({
          label: `Buy #${idx + 1} (${fmtMoney(it.price)} × ${fmtQty(it.quantity)})`,
          value: it.cost,
          text: `${fmtMoney(it.cost)} (${it.weightPct.toFixed(1)}%)`,
        }))}
      />

      <Walkthrough
        steps={[
          {
            title: "Total Cost = Σ(Price × Quantity)",
            math: `${res.items.map((it) => `(${fmtMoney(it.price)} × ${fmtQty(it.quantity)})`).join(" + ")} = ${res.items.map((it) => fmtMoney(it.cost)).join(" + ")} = ${fmtMoney(res.totalCost)}`,
          },
          {
            title: "Total Quantity = Σ(Quantity)",
            math: `${res.items.map((it) => fmtQty(it.quantity)).join(" + ")} = ${fmtQty(res.totalQuantity)} coins`,
          },
          {
            title: "Average Entry = Total Cost ÷ Total Quantity",
            math: `${fmtMoney(res.totalCost)} ÷ ${fmtQty(res.totalQuantity)} = ${fmtMoney(res.averagePrice)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Purchases breakdown"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Average entry"
      resultIcon={Layers}
      badge={<Pill tone="up">{res ? `${res.items.length} Buys` : "Averaging"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Average Entry",
              value: fmtMoney(res.averagePrice),
              sub: `${fmtQty(res.totalQuantity)} coins · ${fmtMoney(res.totalCost)} total`,
            }
          : null
      }
      note="Average entry price calculation weighted average (Σ Price × Qty ÷ Σ Qty) par aadharit hai. Exchange trading fees aur slippage isme shamil nahi hain."
    />
  );
}
