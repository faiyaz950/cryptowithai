import type { MarketTicker } from "@/lib/cryptoApi";

export interface OverviewCoin {
  symbol: string;
  base: string;
  name: string;
  price: number | null;
  change24h: number | null;
  volumeUsd: number;
  sector: string;
}

export interface OverviewSector {
  name: string;
  count: number;
  avgChange: number;
  volumeUsd: number;
  up: number;
  down: number;
}

export interface OverviewMeta {
  success: boolean;
  updatedAt: number;
  marketCapUsd: number | null;
  marketCapChange24h: number | null;
  btcDominance: number | null;
  activeCryptos: number | null;
  marketCapSpark: number[];
  fearGreed: { value: number; classification: string; timestamp: number } | null;
  fearGreedPrev: { value: number; classification: string; timestamp: number } | null;
}

/** Known bases → sector. Baaki "Other". */
const SECTOR_BY_BASE: Record<string, string> = {
  BTC: "Layer 1",
  ETH: "Layer 1",
  SOL: "Layer 1",
  AVAX: "Layer 1",
  ADA: "Layer 1",
  DOT: "Layer 1",
  ATOM: "Layer 1",
  NEAR: "Layer 1",
  SUI: "Layer 1",
  APT: "Layer 1",
  TON: "Layer 1",
  TRX: "Layer 1",
  XRP: "Layer 1",
  BNB: "Layer 1",
  LTC: "Layer 1",
  BCH: "Layer 1",
  XLM: "Layer 1",
  ALGO: "Layer 1",
  ICP: "Layer 1",
  HBAR: "Layer 1",
  SEI: "Layer 1",
  INJ: "Layer 1",
  TIA: "Layer 1",
  OP: "L2 / Rollups",
  ARB: "L2 / Rollups",
  MATIC: "L2 / Rollups",
  POL: "L2 / Rollups",
  STRK: "L2 / Rollups",
  ZK: "L2 / Rollups",
  MANTA: "L2 / Rollups",
  BLAST: "L2 / Rollups",
  LINK: "DeFi",
  UNI: "DeFi",
  AAVE: "DeFi",
  MKR: "DeFi",
  CRV: "DeFi",
  COMP: "DeFi",
  SNX: "DeFi",
  SUSHI: "DeFi",
  DYDX: "DeFi",
  LDO: "DeFi",
  PENDLE: "DeFi",
  JUP: "DeFi",
  RAY: "DeFi",
  GMX: "DeFi",
  DOGE: "Meme",
  SHIB: "Meme",
  PEPE: "Meme",
  WIF: "Meme",
  BONK: "Meme",
  FLOKI: "Meme",
  MEME: "Meme",
  FET: "AI",
  RENDER: "AI",
  RNDR: "AI",
  TAO: "AI",
  WLD: "AI",
  AI: "AI",
  FIL: "Infrastructure",
  AR: "Infrastructure",
  GRT: "Infrastructure",
  PYTH: "Infrastructure",
  ORDI: "Infrastructure",
  STX: "Infrastructure",
};

export function sectorFor(base: string): string {
  return SECTOR_BY_BASE[base.toUpperCase()] || "Other";
}

export function tickersToCoins(tickers: MarketTicker[]): OverviewCoin[] {
  return tickers
    .filter((t) => t.price != null && Number.isFinite(t.price))
    .map((t) => ({
      symbol: t.symbol,
      base: t.base,
      name: t.name || t.base,
      price: t.price,
      change24h: t.change_24h,
      volumeUsd: t.turnover_usd || 0,
      sector: sectorFor(t.base),
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);
}

export function summarizeCoins(coins: OverviewCoin[]) {
  const withChange = coins.filter((c) => c.change24h != null && Number.isFinite(c.change24h));
  const up = withChange.filter((c) => (c.change24h as number) > 0).length;
  const down = withChange.filter((c) => (c.change24h as number) < 0).length;
  const flat = withChange.length - up - down;
  const volumeUsd = coins.reduce((s, c) => s + c.volumeUsd, 0);
  const avgChange =
    withChange.length === 0
      ? null
      : withChange.reduce((s, c) => s + (c.change24h as number), 0) / withChange.length;

  const gainers = [...withChange]
    .filter((c) => (c.change24h as number) > 0)
    .sort((a, b) => (b.change24h as number) - (a.change24h as number))
    .slice(0, 5);

  const losers = [...withChange]
    .filter((c) => (c.change24h as number) < 0)
    .sort((a, b) => (a.change24h as number) - (b.change24h as number))
    .slice(0, 5);

  return { up, down, flat, volumeUsd, avgChange, gainers, losers, tracked: coins.length };
}

/** Top-N alts mein kitne BTC se better — 0–100 altcoin-season style index (24h). */
export function altcoinSeasonIndex(coins: OverviewCoin[], topN = 50): number | null {
  const btc = coins.find((c) => c.base === "BTC");
  if (!btc || btc.change24h == null) return null;
  const alts = coins.filter((c) => c.base !== "BTC" && c.change24h != null).slice(0, topN);
  if (alts.length < 10) return null;
  const beat = alts.filter((c) => (c.change24h as number) > (btc.change24h as number)).length;
  return (beat / alts.length) * 100;
}

export function buildSectors(coins: OverviewCoin[]): OverviewSector[] {
  const map = new Map<string, OverviewCoin[]>();
  for (const c of coins) {
    const list = map.get(c.sector) ?? [];
    list.push(c);
    map.set(c.sector, list);
  }
  const rows: OverviewSector[] = [];
  for (const [name, list] of map) {
    const withChange = list.filter((c) => c.change24h != null);
    if (!withChange.length) continue;
    const avgChange = withChange.reduce((s, c) => s + (c.change24h as number), 0) / withChange.length;
    rows.push({
      name,
      count: list.length,
      avgChange,
      volumeUsd: list.reduce((s, c) => s + c.volumeUsd, 0),
      up: withChange.filter((c) => (c.change24h as number) > 0).length,
      down: withChange.filter((c) => (c.change24h as number) < 0).length,
    });
  }
  return rows.sort((a, b) => b.avgChange - a.avgChange);
}

export function rsiZone(value: number): "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" {
  if (value >= 70) return "OVERBOUGHT";
  if (value <= 30) return "OVERSOLD";
  return "NEUTRAL";
}

export function altZone(value: number): "ALTCOIN SEASON" | "BITCOIN SEASON" | "NEUTRAL" {
  if (value >= 75) return "ALTCOIN SEASON";
  if (value <= 25) return "BITCOIN SEASON";
  return "NEUTRAL";
}

export function fearLabel(value: number): string {
  if (value <= 24) return "Extreme Fear";
  if (value <= 44) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 75) return "Greed";
  return "Extreme Greed";
}

/** Heatmap / bubble scale ka full-intensity point — ±8% par poora rang. */
export const HEAT_SPAN_PCT = 8;

const HEAT_NEUTRAL: [number, number, number] = [52, 50, 48];
const HEAT_UP: [number, number, number] = [22, 158, 78];
const HEAT_DOWN: [number, number, number] = [212, 54, 60];

/**
 * Diverging scale: 0% = neutral warm-gray, +move → green, −move → red.
 * Midpoint par koi hue nahi — chhota move "kuch nahi" jaisa dikhe.
 */
export function heatRgb(change: number | null): [number, number, number] {
  if (change == null || !Number.isFinite(change)) return HEAT_NEUTRAL;
  const t = Math.pow(Math.min(1, Math.abs(change) / HEAT_SPAN_PCT), 0.75);
  const pole = change >= 0 ? HEAT_UP : HEAT_DOWN;
  return HEAT_NEUTRAL.map((n, i) => Math.round(n + (pole[i] - n) * t)) as [number, number, number];
}

export function rgbCss([r, g, b]: [number, number, number], alpha = 1): string {
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** Heat colour ko white/black ki taraf shift — gloss highlight aur shadow ke liye. */
export function shadeRgb(rgb: [number, number, number], amount: number): [number, number, number] {
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  return rgb.map((c) => Math.round(c + (target - c) * k)) as [number, number, number];
}

/** Hero numbers — $2.55T / $84.21B (2 decimals). */
export function fmtUsdLarge(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return fmtUsdCompact(n);
}

export interface TreeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls et al.) — d3 ke bina. Bade tiles pehle,
 * har row ka aspect ratio jitna ho sake square ke paas.
 */
export function squarify(items: { id: string; value: number }[], width: number, height: number): TreeRect[] {
  const valid = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
  const total = valid.reduce((s, it) => s + it.value, 0);
  if (!total || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const nodes = valid
    .map((it) => ({ id: it.id, area: it.value * scale }))
    .sort((a, b) => b.area - a.area);

  const out: TreeRect[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;

  const worst = (row: { area: number }[], side: number) => {
    let sum = 0;
    let max = -Infinity;
    let min = Infinity;
    for (const n of row) {
      sum += n.area;
      if (n.area > max) max = n.area;
      if (n.area < min) min = n.area;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const place = (row: { id: string; area: number }[]) => {
    const sum = row.reduce((s, n) => s + n.area, 0);
    if (w >= h) {
      const colW = sum / h;
      let cy = y;
      for (const n of row) {
        const nh = n.area / colW;
        out.push({ id: n.id, x, y: cy, w: colW, h: nh });
        cy += nh;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let cx = x;
      for (const n of row) {
        const nw = n.area / rowH;
        out.push({ id: n.id, x: cx, y, w: nw, h: rowH });
        cx += nw;
      }
      y += rowH;
      h -= rowH;
    }
  };

  let row: { id: string; area: number }[] = [];
  let i = 0;
  while (i < nodes.length) {
    const side = Math.max(1e-6, Math.min(w, h));
    const next = nodes[i];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      i++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

export function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(n >= 100 ? 2 : 4)}`;
  const decimals = Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return `$${n.toFixed(decimals)}`;
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export async function fetchOverviewMeta(): Promise<OverviewMeta> {
  const res = await fetch("/api/overview", { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`overview ${res.status}`);
  return res.json();
}
