/**
 * P&L calculator — pure math, UI se alag.
 *
 *   Long  : Gross = (Exit − Entry) × Qty
 *   Short : Gross = (Entry − Exit) × Qty
 *   Entry fee = Entry × Qty × Fee%      Exit fee = Exit × Qty × Fee%
 *   Net   = Gross − Entry fee − Exit fee − Funding fee
 *   ROI % = Net / (Entry × Qty) × 100        (initial position value par)
 */

export type Side = "long" | "short";

export interface PnlInput {
  side: Side;
  entry: number;
  exit: number;
  quantity: number;
  /** Per side, % mein — 0.05 matlab 0.05%. */
  feePct: number;
  /** Funding ka kul kharcha, quote currency mein. Plus = diya, minus = mila. */
  funding: number;
}

export interface PnlResult {
  gross: number;
  entryFee: number;
  exitFee: number;
  totalFees: number;
  funding: number;
  net: number;
  /** Entry × Qty */
  positionValue: number;
  exitValue: number;
  roiPct: number;
  /** Is exit par net P&L = 0 — fees aur funding nikalne ke baad. */
  breakeven: number | null;
}

/** Galat input ho to null — UI tab results nahi dikhata. */
export function computePnl(i: PnlInput): PnlResult | null {
  const { side, entry, exit, quantity, feePct, funding } = i;
  if (![entry, exit, quantity, feePct, funding].every(Number.isFinite)) return null;
  if (entry <= 0 || exit <= 0 || quantity <= 0 || feePct < 0) return null;

  const dir = side === "long" ? 1 : -1;
  const f = feePct / 100;
  const gross = (exit - entry) * quantity * dir;
  const entryFee = entry * quantity * f;
  const exitFee = exit * quantity * f;
  const totalFees = entryFee + exitFee;
  const net = gross - totalFees - funding;
  const positionValue = entry * quantity;

  // Long : (X − E)·Q − E·Q·f − X·Q·f − F = 0  →  X = (E(1+f) + F/Q) / (1 − f)
  // Short: (E − X)·Q − E·Q·f − X·Q·f − F = 0  →  X = (E(1−f) − F/Q) / (1 + f)
  const breakeven =
    side === "long"
      ? f < 1 ? (entry * (1 + f) + funding / quantity) / (1 - f) : null
      : (entry * (1 - f) - funding / quantity) / (1 + f);

  return {
    gross,
    entryFee,
    exitFee,
    totalFees,
    funding,
    net,
    positionValue,
    exitValue: exit * quantity,
    roiPct: (net / positionValue) * 100,
    breakeven: breakeven != null && breakeven > 0 ? breakeven : null,
  };
}
