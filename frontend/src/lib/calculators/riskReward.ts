/**
 * Risk / Reward calculator — pure math, per unit (coin) ke hisaab se.
 *
 *   Long : Risk = Entry − Stop   Reward = Target − Entry
 *   Short: Risk = Stop − Entry   Reward = Entry − Target
 *   R:R  = Reward ÷ Risk
 */

export type Side = "long" | "short";

export interface RiskRewardInput {
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

export interface RiskRewardResult {
  risk: number;
  reward: number;
  /** Reward ÷ Risk */
  ratio: number;
  riskPct: number;
  rewardPct: number;
  /** Itne % trades jeetne par fee ke bina break-even: Risk ÷ (Risk + Reward). */
  breakevenWinRate: number;
}

export type RiskRewardOutcome = { ok: true; result: RiskRewardResult } | { ok: false; error: string };

export function computeRiskReward(i: RiskRewardInput): RiskRewardOutcome | null {
  const { side, entry, stopLoss, takeProfit } = i;
  if (![entry, stopLoss, takeProfit].every(Number.isFinite)) return null;
  if (entry <= 0 || stopLoss <= 0 || takeProfit <= 0) return { ok: false, error: "Teeno price must be greater than 0." };

  const risk = side === "long" ? entry - stopLoss : stopLoss - entry;
  const reward = side === "long" ? takeProfit - entry : entry - takeProfit;

  if (risk <= 0) {
    return {
      ok: false,
      error:
        side === "long"
          ? "For a long, stop loss must be below entry."
          : "For a short, stop loss must be above entry.",
    };
  }
  if (reward <= 0) {
    return {
      ok: false,
      error:
        side === "long"
          ? "For a long, take profit must be above entry."
          : "For a short, take profit must be below entry.",
    };
  }

  return {
    ok: true,
    result: {
      risk,
      reward,
      ratio: reward / risk,
      riskPct: (risk / entry) * 100,
      rewardPct: (reward / entry) * 100,
      breakevenWinRate: (risk / (risk + reward)) * 100,
    },
  };
}
