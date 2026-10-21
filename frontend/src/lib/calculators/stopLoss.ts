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

  if (balance <= 0) return { ok: false, error: "Account balance 0 se bada hona chahiye." };
  if (riskPct <= 0 || riskPct > 100) return { ok: false, error: "Risk % 0 se bada aur 100 se kam ya barabar hona chahiye." };
  if (entry <= 0) return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  if (quantity <= 0) return { ok: false, error: "Quantity 0 se badi honi chahiye." };

  const riskAmount = (balance * riskPct) / 100;
  const riskPerUnit = riskAmount / quantity;
  const stopLoss = side === "long" ? entry - riskPerUnit : entry + riskPerUnit;

  if (stopLoss <= 0) {
    return {
      ok: false,
      error: `Is quantity par risk per coin (${riskPerUnit.toLocaleString("en-US", { maximumFractionDigits: 4 })}) entry se bada hai, isliye Long ka stop loss 0 ya negative aata hai. Quantity badhao ya risk % ghatao.`,
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
