"use client";

import { useMemo, useState } from "react";
import { PieChart, Plus, SlidersHorizontal, Trash2, Wand2 } from "lucide-react";
import {
  computePortfolioAllocation,
} from "@/lib/calculators/portfolioAllocation";
import { fmtMoney, fmtNum, fmtPct, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

interface AssetRow {
  id: string;
  name: string;
  pct: string;
}

const DEFAULT_ASSETS: AssetRow[] = [
  { id: "1", name: "BTC", pct: "50" },
  { id: "2", name: "ETH", pct: "30" },
  { id: "3", name: "SOL", pct: "20" },
];

const PRESETS = [
  {
    label: "50/30/20 (BTC/ETH/SOL)",
    assets: [
      { id: "1", name: "BTC", pct: "50" },
      { id: "2", name: "ETH", pct: "30" },
      { id: "3", name: "SOL", pct: "20" },
    ],
  },
  {
    label: "Balanced 40/30/15/15",
    assets: [
      { id: "1", name: "BTC", pct: "40" },
      { id: "2", name: "ETH", pct: "30" },
      { id: "3", name: "SOL", pct: "15" },
      { id: "4", name: "USDT", pct: "15" },
    ],
  },
  {
    label: "80/20 Maxi",
    assets: [
      { id: "1", name: "BTC", pct: "80" },
      { id: "2", name: "ETH", pct: "20" },
    ],
  },
];

export default function PortfolioAllocationCalculator() {
  const [totalCapital, setTotalCapital] = useState("100000");
  const [assets, setAssets] = useState<AssetRow[]>(DEFAULT_ASSETS);

  const parsedCapital = toNum(totalCapital);

  const parsedAssets = useMemo(
    () =>
      assets.map((a) => ({
        id: a.id,
        name: a.name,
        pct: toNum(a.pct, 0),
      })),
    [assets],
  );

  const outcome = useMemo(
    () =>
      computePortfolioAllocation({
        totalCapital: parsedCapital,
        assets: parsedAssets,
      }),
    [parsedCapital, parsedAssets],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const handleUpdate = (id: string, field: "name" | "pct", val: string) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: val } : a)));
  };

  const handleAddAsset = () => {
    const nextId = String(Date.now());
    setAssets((prev) => [...prev, { id: nextId, name: "", pct: "0" }]);
  };

  const handleRemoveAsset = (id: string) => {
    if (assets.length <= 1) return;
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleNormalize = () => {
    const sum = parsedAssets.reduce((acc, curr) => acc + curr.pct, 0);
    if (sum <= 0) return;
    setAssets((prev) =>
      prev.map((a) => {
        const p = toNum(a.pct, 0);
        const norm = Math.round((p / sum) * 100 * 10) / 10;
        return { ...a, pct: String(norm) };
      }),
    );
  };

  const reset = () => {
    setTotalCapital("100000");
    setAssets(DEFAULT_ASSETS);
  };

  const badCapital = totalCapital !== "" && !(parsedCapital > 0);

  const inputs = (
    <>
      <Field
        label="Total Capital"
        hint="Kul nivesh rashi jo allocate karni hai"
        value={totalCapital}
        onChange={setTotalCapital}
        prefix="$"
        min={0}
        invalid={badCapital}
      />

      {/* Preset Strategy Chips */}
      <div>
        <span className="cx-label">Preset Portfolios</span>
        <div className="cx-chips" role="group" aria-label="Presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="cx-chip"
              onClick={() => setAssets(p.assets)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Allocations Table */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="cx-label" style={{ marginBottom: 0 }}>
            Assets &amp; Allocation % ({assets.length})
          </span>
          <div className="flex items-center gap-2">
            {res && !res.isValid && (
              <button
                type="button"
                onClick={handleNormalize}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer"
                title="Scale to 100%"
              >
                <Wand2 className="w-3 h-3" />
                Fix to 100%
              </button>
            )}
            <button
              type="button"
              onClick={handleAddAsset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Asset
            </button>
          </div>
        </div>

        {assets.map((a, idx) => {
          const rowPct = toNum(a.pct, 0);
          const computedAmt = parsedCapital > 0 ? (parsedCapital * rowPct) / 100 : 0;

          return (
            <div
              key={a.id}
              className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 transition-all hover:border-white/20"
            >
              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500 w-5">#{idx + 1}</span>
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => handleUpdate(a.id, "name", e.target.value)}
                  placeholder="e.g. BTC"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wider text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="flex items-center gap-2 sm:w-64">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    value={a.pct}
                    onChange={(e) => handleUpdate(a.id, "pct", e.target.value)}
                    placeholder="0"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-400 text-right pr-7"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-mono text-slate-500">%</span>
                </div>

                <div className="w-24 text-right font-mono text-xs text-emerald-400 font-semibold truncate">
                  {fmtMoney(computedAmt)}
                </div>

                {assets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAsset(a.id)}
                    className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg transition-colors cursor-pointer"
                    aria-label={`Remove asset ${a.name || idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={PieChart}>
      Total capital aur asset allocation % daalein — calculation live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Total Capital Allocated"
        value={fmtMoney(res.totalCapital)}
        sub={
          <>
            <Pill tone={res.isValid ? "up" : "down"}>
              {res.totalAllocatedPct}% Allocated
            </Pill>
            <span>{res.items.length} Assets in Portfolio</span>
          </>
        }
      />

      {/* Validation requirement from prompt */}
      {!res.isValid && (
        <Notice kind="warn">
          <strong>Allocation must equal 100%.</strong>
          <div style={{ marginTop: 4, fontSize: "12px", opacity: 0.9 }}>
            {res.validationError}
          </div>
        </Notice>
      )}

      {res.isValid && (
        <Notice kind="info">
          <strong>Perfect Allocation!</strong> Total portfolio exactly 100% balanced hai.
        </Notice>
      )}

      {/* Visual Allocation Distribution */}
      <SectionTitle>Asset Allocation Breakdown</SectionTitle>
      <Flow
        rows={res.items.map((it) => ({
          label: `${it.name} (${it.pct}%)`,
          value: it.amount,
          text: fmtMoney(it.amount),
        }))}
      />

      <Stats
        items={[
          { label: "Total Capital", value: fmtMoney(res.totalCapital) },
          {
            label: "Total Allocated %",
            value: `${fmtNum(res.totalAllocatedPct)}%`,
            tone: res.isValid ? "up" : "down",
          },
          { label: "Total Allocated Amount", value: fmtMoney(res.totalAllocatedAmount) },
          {
            label: "Unallocated Balance",
            value: fmtMoney(res.unallocatedAmount),
            tone: res.unallocatedAmount === 0 ? "flat" : "warn",
          },
          ...res.items.map((it) => ({
            label: `${it.name} Allocation (${it.pct}%)`,
            value: fmtMoney(it.amount),
            tone: "up" as const,
          })),
        ]}
      />

      <Walkthrough
        steps={[
          {
            title: "Formula: Asset Amount = Total Capital × Allocation %",
            math: `Har asset ke liye: Capital × (Pct ÷ 100)`,
          },
          ...res.items.map((it) => ({
            title: `${it.name} Amount = ${fmtMoney(res.totalCapital)} × ${it.pct}%`,
            math: `${fmtMoney(res.totalCapital)} × ${it.pct / 100} = ${fmtMoney(it.amount)}`,
          })),
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Portfolio parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Capital distribution"
      resultIcon={PieChart}
      badge={<Pill tone={res?.isValid ? "up" : "down"}>{res ? `${res.totalAllocatedPct}%` : "100%"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Allocation",
              value: `${res.totalAllocatedPct}%`,
              sub: `${res.items.length} assets · ${fmtMoney(res.totalCapital)}`,
            }
          : null
      }
      note="Portfolio diversification risk management ka ek tareeqa hai. Allocation decisions apne risk tolerance aur financial goals ke anusaar lein."
    />
  );
}
