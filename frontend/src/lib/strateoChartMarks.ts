/**
 * Strategy trades ke chart marks — entry par gola, exit par square.
 *
 * Bade timeframe par (5m strategy, 4h chart) ek candle mein kai trades aa jaate hain. Pehle
 * har trade ka label ek line mein chipakta tha ("SL hit −41.50% · SL hit −41.50% · … +1") aur
 * bagal ki candle ke label par chadh jaata tha. Ab:
 *  - jeet aur haar alag square (hara / laal) — ek candle mein dono hon to "mixed" amber nahi,
 *    jo entry ke gole jaisa dikhta tha;
 *  - ek jaisa result gin kar ek baar: "4× SL hit −41.50% prem";
 *  - options par % premium ka hai, coin ka nahi — label mein "prem", jaise bagal ki list mein;
 *  - apply se pehle ke trades halke, aur apply wali candle par "You applied".
 */
import type { ChartMarker } from "@/components/trade/CandleChart";
import { fmtPct } from "./strateo";

// strateo.css ke --st-up / --st-down / entry amber se match.
export const ENTRY_COLOR = "#f5a524";
export const UP = "#1ed68c";
export const DOWN = "#ff5a5f";
/** "You applied" — --st-text-3 jaisa grey, dono theme par padha jaata hai. */
const APPLIED_COLOR = "#8c8781";
/** Apply se pehle ke trades — wahi rang, halka. */
const BEFORE_ALPHA = 0.45;
/** Ek square mein itne alag result; baaki "+N" (N = trades). */
const MAX_GROUPS = 3;

export interface ChartMarkRow {
  entryTime: number;
  exitTime: number | null;
  side: "long" | "short";
  open: boolean;
  /** Wahi lafz jo Trade history ki Result line mein — "SL hit", "TP1, then SL". */
  label: string;
  pct: number;
  /** Options: % premium ka hai, coin ka nahi. */
  premium?: boolean;
  /** Strategy apply hone se pehle ka trade. */
  before?: boolean;
}

export function candleMs(t: number): number {
  return t > 1e12 ? t : t * 1000;
}

/** Trade jis candle ke andar aaya. Pehli candle se purana time waise ka waisa — chart use chhod deta hai. */
export function barAt(candles: { time: number }[], t: number): number {
  if (!candles.length || t < candleMs(candles[0].time)) return t;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candleMs(candles[mid].time) <= t) lo = mid;
    else hi = mid - 1;
  }
  return candleMs(candles[lo].time);
}

function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface ExitItem {
  label: string;
  pct: number;
  premium: boolean;
  at: number;
}

/** "SL hit −41.50% prem", "4× SL hit −41.50% prem", "3× Trail stop +0.82% avg". */
function exitText(items: ExitItem[]): string {
  const groups = new Map<string, ExitItem[]>();
  for (const i of [...items].sort((a, b) => a.at - b.at)) {
    const list = groups.get(i.label) ?? [];
    list.push(i);
    groups.set(i.label, list);
  }
  const parts = [...groups.values()].map((list) => {
    const first = list[0];
    const same = list.every((i) => i.pct.toFixed(2) === first.pct.toFixed(2));
    const pct = same ? first.pct : list.reduce((s, i) => s + i.pct, 0) / list.length;
    const count = list.length > 1 ? `${list.length}× ` : "";
    const prem = first.premium ? " prem" : "";
    return { text: `${count}${first.label} ${fmtPct(pct)}${prem}${same ? "" : " avg"}`, n: list.length };
  });
  const shown = parts.slice(0, MAX_GROUPS).map((p) => p.text);
  const hidden = parts.slice(MAX_GROUPS).reduce((s, p) => s + p.n, 0);
  return shown.join(" · ") + (hidden ? ` +${hidden}` : "");
}

/**
 * Trade history ki har row ka chart mark. Result + % usi lafz mein jo bagal ki list mein hai —
 * sirf "SL Hit" nahi, jab list Target hit dikha rahi ho.
 */
export function buildChartMarkers(
  rows: ChartMarkRow[],
  candles: { time: number }[],
  appliedAt?: number | null,
): ChartMarker[] {
  const entries = new Map<string, { time: number; side: "long" | "short"; running: boolean; before: boolean }>();
  const exits = new Map<
    string,
    { time: number; side: "long" | "short"; win: boolean; before: boolean; items: ExitItem[] }
  >();
  for (const r of rows) {
    const before = Boolean(r.before);
    const eb = barAt(candles, r.entryTime);
    const ek = `${eb}|${r.side}|${before}`;
    const prev = entries.get(ek);
    entries.set(ek, { time: eb, side: r.side, running: Boolean(prev?.running) || r.open, before });
    if (r.open || r.exitTime == null) continue;
    const xb = barAt(candles, r.exitTime);
    const win = r.pct >= 0;
    const xk = `${xb}|${r.side}|${win}|${before}`;
    const row = exits.get(xk) ?? { time: xb, side: r.side, win, before, items: [] };
    row.items.push({ label: r.label, pct: r.pct, premium: Boolean(r.premium), at: r.exitTime });
    exits.set(xk, row);
  }

  const out: ChartMarker[] = [];
  for (const e of entries.values()) {
    out.push({
      time: e.time,
      position: e.side === "long" ? "belowBar" : "aboveBar",
      shape: "circle",
      color: e.before ? fade(ENTRY_COLOR, BEFORE_ALPHA) : ENTRY_COLOR,
      ...(e.running ? { text: "Running" } : {}),
    });
  }
  // Ek candle par jeet pehle, phir haar — har baar ek hi kram, taaki square apni jagah na badlein.
  const ordered = [...exits.values()].sort((a, b) => a.time - b.time || Number(b.win) - Number(a.win));
  for (const x of ordered) {
    const color = x.win ? UP : DOWN;
    out.push({
      time: x.time,
      position: x.side === "long" ? "aboveBar" : "belowBar",
      shape: "square",
      color: x.before ? fade(color, BEFORE_ALPHA) : color,
      text: exitText(x.items),
    });
  }
  if (appliedAt != null && Number.isFinite(appliedAt)) {
    out.push({
      time: barAt(candles, appliedAt),
      position: "aboveBar",
      shape: "arrowDown",
      color: APPLIED_COLOR,
      text: "You applied",
    });
  }
  return out;
}
