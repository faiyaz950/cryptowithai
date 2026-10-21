"use client";

import { useMemo, useState } from "react";
import { Award, Briefcase, Plus, RotateCcw, SlidersHorizontal, Trash2, TrendingUp } from "lucide-react";
import { computePortfolioProfit, type PortfolioCoinItem } from "@/lib/calculators/portfolioProfit";
import { fmtMoney, fmtNum, fmtPct, fmtQty, fmtSigned, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
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

const DEFAULT_COINS: PortfolioCoinItem[] = [
  { id: "1", symbol: "BTC", quantity: 0.5, buyPrice: 52000, currentPrice: 66500 },
  { id: "2", symbol: "ETH", quantity: 5.0, buyPrice: 2800, currentPrice: 3450 },
  { id: "3", symbol: "SOL", quantity: 25.0, buyPrice: 85, currentPrice: 155 },
  { id: "4", symbol: "DOGE", quantity: 10000, buyPrice: 0.14, currentPrice: 0.12 },
];

export default function PortfolioProfitCalculator() {
  const [coins, setCoins] = useState<PortfolioCoinItem[]>(DEFAULT_COINS);

  const outcome = useMemo(() => computePortfolioProfit(coins), [coins]);
  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const updateCoin = (id: string, field: keyof PortfolioCoinItem, val: string) => {
    setCoins((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (field === "symbol") return { ...c, symbol: val };
        const num = toNum(val, 0);
        return { ...c, [field]: num };
      }),
    );
  };

  const addCoin = () => {
    const newId = String(Date.now());
    setCoins((prev) => [
      ...prev,
      { id: newId, symbol: "NEW", quantity: 1, buyPrice: 100, currentPrice: 120 },
    ]);
  };

  const removeCoin = (id: string) => {
    setCoins((prev) => prev.filter((c) => c.id !== id));
  };

  const reset = () => {
    setCoins(DEFAULT_COINS);
  };

  const inputs = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="cx-label">Coins in Portfolio ({coins.length})</label>
        <button
          type="button"
          onClick={addCoin}
          className="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Coin
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {coins.map((c, idx) => (
          <div
            key={c.id}
            className="p-2.5 rounded-lg bg-white/[0.02] border border-white/10 space-y-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <input
                type="text"
                className="w-20 bg-black/50 border border-white/15 px-2 py-1 rounded text-white font-bold uppercase text-xs focus:border-cyan-500 focus:outline-none"
                value={c.symbol}
                placeholder="BTC"
                onChange={(e) => updateCoin(c.id, "symbol", e.target.value)}
              />
              {coins.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCoin(c.id)}
                  className="text-slate-500 hover:text-rose-400 p-1"
                  title="Remove Coin"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Quantity</label>
                <input
                  type="number"
                  step="any"
                  className="w-full bg-black/50 border border-white/10 px-2 py-1 rounded text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                  value={c.quantity || ""}
                  placeholder="1.0"
                  onChange={(e) => updateCoin(c.id, "quantity", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Avg Buy ($)</label>
                <input
                  type="number"
                  step="any"
                  className="w-full bg-black/50 border border-white/10 px-2 py-1 rounded text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                  value={c.buyPrice || ""}
                  placeholder="100"
                  onChange={(e) => updateCoin(c.id, "buyPrice", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Current ($)</label>
                <input
                  type="number"
                  step="any"
                  className="w-full bg-black/50 border border-white/10 px-2 py-1 rounded text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                  value={c.currentPrice || ""}
                  placeholder="120"
                  onChange={(e) => updateCoin(c.id, "currentPrice", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const heroTone: "up" | "down" | "flat" = res
    ? res.totalPnl > 0
      ? "up"
      : res.totalPnl < 0
      ? "down"
      : "flat"
    : "flat";

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Briefcase}>
      Apne portfolio ke coins, quantity aur purchase prices enter karein — total profit/loss aur asset breakdown live dikhega.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label="Total Unrealized P&L"
        value={fmtSigned(res.totalPnl)}
        tone={heroTone}
        sub={
          <>
            <Pill tone={heroTone}>
              ROI: {res.portfolioRoiPct >= 0 ? "+" : ""}
              {res.portfolioRoiPct.toFixed(2)}%
            </Pill>
            <span>Current Value: {fmtMoney(res.currentValue)}</span>
          </>
        }
      />

      {/* Top Performers Notice */}
      <Notice kind={res.totalPnl >= 0 ? "info" : "warn"}>
        <span>
          <strong>Performance Summary:</strong> Portfolio me <strong>{res.coinCount} assets</strong> hain.
          {res.bestPerformer && (
            <span>
              {" "}Best Performer: <strong className="text-emerald-400">{res.bestPerformer.symbol} (+{res.bestPerformer.roiPct.toFixed(1)}%)</strong>.
            </span>
          )}
          {res.worstPerformer && res.worstPerformer.id !== res.bestPerformer?.id && (
            <span>
              {" "}Worst Performer: <strong className="text-rose-400">{res.worstPerformer.symbol} ({res.worstPerformer.roiPct.toFixed(1)}%)</strong>.
            </span>
          )}
        </span>
      </Notice>

      {/* Breakdown Flow */}
      <SectionTitle>Portfolio Valuation Flow</SectionTitle>
      <Flow
        rows={[
          { label: "Total Capital Invested", value: res.totalInvested, text: fmtMoney(res.totalInvested) },
          { label: "Current Portfolio Value", value: res.currentValue, text: fmtMoney(res.currentValue) },
          { label: "Net Unrealized Profit / Loss", value: res.totalPnl, text: fmtSigned(res.totalPnl), total: true },
        ]}
      />

      {/* Coin-wise Breakdown Table */}
      <SectionTitle>Coin-Wise Profit & Loss Breakdown</SectionTitle>
      <div className="overflow-x-auto my-3 border border-white/10 rounded-lg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 bg-white/[0.02]">
              <th className="py-2 px-3">Asset</th>
              <th className="py-2 px-3">Holding</th>
              <th className="py-2 px-3">Cost Basis</th>
              <th className="py-2 px-3">Current Value</th>
              <th className="py-2 px-3">P&L ($)</th>
              <th className="py-2 px-3">ROI (%)</th>
              <th className="py-2 px-3">Weight</th>
            </tr>
          </thead>
          <tbody>
            {res.items.map((it) => (
              <tr key={it.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 px-3 font-bold text-white">{it.symbol}</td>
                <td className="py-2 px-3 font-mono text-slate-300">{fmtQty(it.quantity)}</td>
                <td className="py-2 px-3 text-slate-400">{fmtMoney(it.investedValue)}</td>
                <td className="py-2 px-3 font-semibold text-white">{fmtMoney(it.currentValue)}</td>
                <td
                  className={`py-2 px-3 font-mono font-medium ${
                    it.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtSigned(it.pnl)}
                </td>
                <td
                  className={`py-2 px-3 font-mono font-medium ${
                    it.roiPct >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {it.roiPct >= 0 ? "+" : ""}
                  {it.roiPct.toFixed(1)}%
                </td>
                <td className="py-2 px-3 text-slate-400 font-mono">{it.allocationPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Current Portfolio Value", value: fmtMoney(res.currentValue), tone: "up" as const },
          { label: "Total Capital Invested", value: fmtMoney(res.totalInvested) },
          {
            label: "Total Unrealized P&L",
            value: fmtSigned(res.totalPnl),
            tone: res.totalPnl >= 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Portfolio Return %",
            value: `${res.portfolioRoiPct >= 0 ? "+" : ""}${res.portfolioRoiPct.toFixed(2)}%`,
            tone: res.portfolioRoiPct >= 0 ? ("up" as const) : ("down" as const),
          },
          {
            label: "Best Asset",
            value: res.bestPerformer ? `${res.bestPerformer.symbol} (+${res.bestPerformer.roiPct.toFixed(1)}%)` : "—",
            tone: "up" as const,
          },
          {
            label: "Worst Asset",
            value: res.worstPerformer ? `${res.worstPerformer.symbol} (${res.worstPerformer.roiPct.toFixed(1)}%)` : "—",
            tone: res.worstPerformer && res.worstPerformer.roiPct < 0 ? ("down" as const) : undefined,
          },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Asset P&L Formula",
            math: `Unrealized P&L = (Quantity × Current Price) − (Quantity × Buy Price)`,
          },
          {
            title: "2. Total Portfolio Return",
            math: `Portfolio Return = (Total P&L ÷ Total Invested) × 100 = (${fmtSigned(res.totalPnl)} ÷ ${fmtMoney(res.totalInvested)}) × 100 = ${res.portfolioRoiPct.toFixed(2)}%`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Portfolio Holdings"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Portfolio Performance"
      resultIcon={Briefcase}
      badge={<Pill tone={heroTone}>{res ? fmtSigned(res.totalPnl) : "Portfolio"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: "Portfolio P&L",
              value: fmtSigned(res.totalPnl),
              sub: `Value: ${fmtMoney(res.currentValue)} · ROI: ${res.portfolioRoiPct.toFixed(1)}%`,
              tone: heroTone,
            }
          : null
      }
      note="Portfolio profit calculation unrealized market pricing par based hai. Actual realized profits exchange withdrawal aur spot trading fees ke baad adjust honge. Trading advice nahi."
    />
  );
}
