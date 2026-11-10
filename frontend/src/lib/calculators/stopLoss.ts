/**
 * Stop loss calculator — risk-based, pure math.
 *
 *   Risk amount   = Balance × Risk%
 *   Risk per coin = Risk amount ÷ Quantity
 *   Long : SL = Entry − Risk per coin
 *   Short: SL = Entry + Risk per coin
 */

export type Side = "long" | "short";

export interface StopLossInput {
  side: Side;
  balance: number;
  riskPct: number;
  entry: number;
  quantity: number;
}

export interface StopLossResult {
  riskAmount: number;
  riskPerUnit: number;
  stopLoss: number;
  /** |Entry − SL| ÷ Entry × 100 */
  stopDistancePct: number;
  positionValue: number;
  positionPct: number;
  /** Position value ÷ balance — isse kam leverage par poori position nahi khulegi. */
  minLeverage: number;
}

export type StopLossOutcome = { ok: true; result: StopLossResult } | { ok: false; error: string };

/** null = input abhi poora nahi; ok:false = galat input, wajah ke saath. */
export function computeStopLoss(i: StopLossInput): StopLossOutcome | null {
  const { side, balance, riskPct, entry, quantity } = i;
  if (![balance, riskPct, entry, quantity].every(Number.isFinite)) return null;

  if (balance <= 0) return { ok: false, error: "Account balance must be greater than 0." };
  if (riskPct <= 0 || riskPct > 100) return { ok: false, error: "Risk % must be greater than 0 and at most 100." };
  if (entry <= 0) return { ok: false, error: "Entry price must be greater than 0." };
  if (quantity <= 0) return { ok: false, error: "Quantity must be greater than 0." };

  const riskAmount = (balance * riskPct) / 100;
  const riskPerUnit = riskAmount / quantity;
  const stopLoss = side === "long" ? entry - riskPerUnit : entry + riskPerUnit;

  if (stopLoss <= 0) {
    return {
      ok: false,
      error: `At this quantity, risk per coin (${riskPerUnit.toLocaleString("en-US", { maximumFractionDigits: 4 })}) exceeds entry, so the long stop loss would be zero or negative. Increase quantity or lower risk %.`,
    };
  }

  const positionValue = entry * quantity;
  return {
    ok: true,
    result: {
      riskAmount,
      riskPerUnit,
      stopLoss,
      stopDistancePct: (riskPerUnit / entry) * 100,
      positionValue,
      positionPct: (positionValue / balance) * 100,
      minLeverage: positionValue / balance,
    },
  };
}
