"use client";

import { useEffect, useState } from "react";
import type { Candle } from "./cryptoApi";
import { rsi } from "./indicators";
import type { JournalTrade } from "./tradeJournal";
import type { TradingMode } from "./tradingMode";

export type BotKind = "dca" | "grid" | "combo";
export type StartWhen = "asap" | "manual" | "time" | "indicator" | "webhook";
export type BotStatus = "draft" | "running" | "paused";

export interface DeskBot {
  id: string;
  name: string;
  kind: BotKind;
  symbol: string;
  mode: TradingMode;
  status: BotStatus;
  capital: number;
  tpPct: number;
  slPct: number;
  startWhen: StartWhen;
  everyBars: number;
  rsiBelow: number;
  safetyOrders: number;
  stepPct: number;
  volumeScale: number;
  lower: number;
  upper: number;
  grids: number;
  feePct: number;
  stats: {
    realized: number;
    unrealized: number;
    trades: number;
    wins: number;
    openDeals: number;
  } | null;
  updatedAt: string;
}

export interface SimTrade {
  time: number;
  pnl: number;
  roi: number;
}

export interface SimResult {
  trades: SimTrade[];
  realized: number;
  unrealized: number;
  openDeals: number;
  wins: number;
  note: string;
}

export const EMPTY_BOT = (): DeskBot => ({
  id: "",
  name: "BTC DCA",
  kind: "dca",
  symbol: "BTCUSDT",
  mode: "paper",
  status: "draft",
  capital: 1000,
  tpPct: 1.2,
  slPct: 6,
  startWhen: "asap",
  everyBars: 24,
  rsiBelow: 30,
  safetyOrders: 4,
  stepPct: 1.5,
  volumeScale: 1.4,
  lower: 0,
  upper: 0,
  grids: 8,
  feePct: 0.06,
  stats: null,
  updatedAt: new Date().toISOString(),
});

const KEY = "cryptomantra_desk_bots";
const EVENT = "cryptomantra:desk-bots";

function read(): DeskBot[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]") as DeskBot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows: DeskBot[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(EVENT));
}

export function listBots(): DeskBot[] {
  return read().slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveBot(bot: DeskBot): DeskBot {
  const next = { ...bot, id: bot.id || `bot-${Date.now()}`, updatedAt: new Date().toISOString() };
  const rows = read().filter((row) => row.id !== next.id);
  write([next, ...rows]);
  return next;
}

export function setBotStatus(id: string, status: BotStatus, mode: TradingMode) {
  write(read().map((bot) => (bot.id === id ? { ...bot, status, mode, updatedAt: new Date().toISOString() } : bot)));
}

export function useBots(): DeskBot[] {
  const [rows, setRows] = useState<DeskBot[]>([]);
  useEffect(() => {
    const sync = () => setRows(listBots());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return rows;
}

function fee(notional: number, pct: number) {
  return Math.abs(notional) * (pct / 100);
}

function shouldEnter(bot: DeskBot, index: number, rsiValue: number | null, flat: boolean): boolean {
  if (!flat) return false;
  if (bot.startWhen === "manual" || bot.startWhen === "webhook") return false;
  if (bot.startWhen === "time") return index % Math.max(1, bot.everyBars) === 0;
  if (bot.startWhen === "indicator") return rsiValue != null && rsiValue <= bot.rsiBelow;
  return true;
}

function simulateDca(bot: DeskBot, candles: Candle[], rsiValues: (number | null)[], gridScalp: boolean): SimResult {
  let qty = 0;
  let cost = 0;
  let lastFill = 0;
  let safeties = 0;
  let base = 0;
  const trades: SimTrade[] = [];
  let scalp = 0;

  const buy = (price: number, notional: number) => {
    const q = notional / price;
    qty += q;
    cost += notional + fee(notional, bot.feePct);
    lastFill = price;
    base = base || notional;
  };

  const close = (price: number, time: number) => {
    const proceeds = qty * price - fee(qty * price, bot.feePct);
    const pnl = proceeds - cost + scalp;
    const roi = cost > 0 ? (pnl / cost) * 100 : 0;
    trades.push({ time, pnl, roi });
    qty = 0;
    cost = 0;
    lastFill = 0;
    safeties = 0;
    scalp = 0;
  };

  for (let i = 20; i < candles.length; i++) {
    const bar = candles[i];
    const flat = qty <= 0;
    if (shouldEnter(bot, i, rsiValues[i], flat)) {
      buy(bar.close, bot.capital * 0.12);
      continue;
    }
    if (flat) continue;
    const avg = cost / qty;
    const nextSafety = lastFill * (1 - bot.stepPct / 100);
    if (safeties < bot.safetyOrders && bar.low <= nextSafety) {
      const notional = base * bot.volumeScale ** (safeties + 1);
      buy(nextSafety, notional);
      safeties += 1;
    }
    if (gridScalp && bar.high >= avg * (1 + bot.stepPct / 200) && bar.low <= avg) {
      scalp += (cost * (bot.stepPct / 200)) / 100 * 100 - fee(cost * 0.3, bot.feePct);
    }
    const avgNow = cost / qty;
    if (bot.tpPct > 0 && bar.high >= avgNow * (1 + bot.tpPct / 100)) close(avgNow * (1 + bot.tpPct / 100), bar.time);
    else if (bot.slPct > 0 && bar.low <= avgNow * (1 - bot.slPct / 100)) close(avgNow * (1 - bot.slPct / 100), bar.time);
  }

  const last = candles[candles.length - 1]?.close ?? 0;
  const unrealized = qty > 0 ? qty * last - fee(qty * last, bot.feePct) - cost + scalp : 0;
  return finish(bot, trades, unrealized, qty > 0 ? 1 : 0);
}

function simulateGrid(bot: DeskBot, candles: Candle[]): SimResult {
  const low = bot.lower > 0 ? bot.lower : Math.min(...candles.map((c) => c.low));
  const high = bot.upper > low ? bot.upper : Math.max(...candles.map((c) => c.high));
  const n = Math.max(2, Math.min(40, bot.grids));
  const levels = Array.from({ length: n }, (_, i) => low + ((high - low) * i) / (n - 1));
  const lot = bot.capital / (n - 1);
  const open = new Map<number, number>();
  const trades: SimTrade[] = [];

  for (const bar of candles.slice(20)) {
    for (let i = 0; i < n - 1; i++) {
      if (bar.low <= levels[i] && !open.has(i)) open.set(i, levels[i]);
      const entry = open.get(i);
      if (entry != null && bar.high >= levels[i + 1]) {
        const qty = lot / entry;
        const pnl = qty * (levels[i + 1] - entry) - fee(lot, bot.feePct) - fee(qty * levels[i + 1], bot.feePct);
        trades.push({ time: bar.time, pnl, roi: (pnl / lot) * 100 });
        open.delete(i);
      }
    }
  }

  const last = candles[candles.length - 1]?.close ?? 0;
  let unrealized = 0;
  for (const entry of open.values()) {
    const qty = lot / entry;
    unrealized += qty * (last - entry) - fee(lot, bot.feePct);
  }
  return finish(bot, trades, unrealized, open.size);
}

function finish(bot: DeskBot, trades: SimTrade[], unrealized: number, openDeals: number): SimResult {
  const realized = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const manual = bot.startWhen === "manual" || bot.startWhen === "webhook";
  const note = manual
    ? "Manual aur webhook historical candles par trade nahi kholte. Alert aane par deal start hogi."
    : bot.kind === "combo"
      ? "DCA deal ke andar chhota grid scalp tab book hota hai jab price step ke aadhe se upar jaaye."
      : "Backtest isi page par historical candles se chala.";
  return { trades, realized, unrealized, openDeals, wins, note };
}

export function simulateBot(bot: DeskBot, candles: Candle[]): SimResult {
  if (candles.length < 30) {
    return { trades: [], realized: 0, unrealized: 0, openDeals: 0, wins: 0, note: "Backtest ke liye kam se kam 30 candles chahiye." };
  }
  if (bot.kind === "grid") return simulateGrid(bot, candles);
  const rsiValues = rsi(candles.map((candle) => candle.close), 14);
  return simulateDca(bot, candles, rsiValues, bot.kind === "combo");
}

export function journalFromSim(bot: DeskBot, result: SimResult): JournalTrade[] {
  return result.trades.map((trade, index) => ({
    id: `${bot.id || bot.name}-${trade.time}-${index}`,
    at: trade.time,
    symbol: bot.symbol,
    side: "long" as const,
    pnl: trade.pnl,
    roi: trade.roi,
    strategy: bot.name,
    tags: [bot.kind, bot.startWhen],
    mode: bot.mode,
  }));
}

export function applySim(bot: DeskBot, result: SimResult): DeskBot {
  return {
    ...bot,
    stats: {
      realized: result.realized,
      unrealized: result.unrealized,
      trades: result.trades.length,
      wins: result.wins,
      openDeals: result.openDeals,
    },
  };
}
