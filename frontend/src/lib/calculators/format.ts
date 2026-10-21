/** Calculators ke liye number helpers — sab jagah ek jaisa dikhne ke liye. */

/** Khaali / galat text -> fallback (default NaN, jisse calculator "invalid" maanta hai). */
export function toNum(text: string, fallback = NaN): number {
  const t = text.trim();
  if (t === "") return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function digitsFor(n: number): number {
  const a = Math.abs(n);
  return a === 0 || a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
}

/** "1,234.50" — chhote numbers par zyada decimals. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.max(digitsFor(n), 2) });
}

/** "$1,234.50" — rounding ke baad zero ho to "-" sign nahi. */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const d = digitsFor(n);
  const flat = Number(Math.abs(n).toFixed(d)) === 0;
  return `${n < 0 && !flat ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d })}`;
}

export function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const m = fmtMoney(n);
  return n > 0 && !m.startsWith("-") && m !== "$0.00" ? `+${m}` : m;
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.005) return "0.00%";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function tone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || !Number.isFinite(n) || Math.abs(n) < 0.005) return "flat";
  return n > 0 ? "up" : "down";
}

/** Coin quantity — bade par kam decimals, chhote par zyada (0.00123 BTC). */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const max = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

/** Ratio ko "1:3" ki tarah — Reward ÷ Risk se. */
export function fmtRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const r = ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
  return `1:${r.replace(/\.?0+$/, "")}`;
}
