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
  if (entry <= 0 || stopLoss <= 0 || takeProfit <= 0) return { ok: false, error: "Teeno price 0 se bade hone chahiye." };

  const risk = side === "long" ? entry - stopLoss : stopLoss - entry;
  const reward = side === "long" ? takeProfit - entry : entry - takeProfit;

  if (risk <= 0) {
    return {
      ok: false,
      error:
        side === "long"
          ? "Long mein stop loss entry se neeche hona chahiye."
          : "Short mein stop loss entry se upar hona chahiye.",
    };
  }
  if (reward <= 0) {
    return {
      ok: false,
      error:
        side === "long"
          ? "Long mein take profit entry se upar hona chahiye."
          : "Short mein take profit entry se neeche hona chahiye.",
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
