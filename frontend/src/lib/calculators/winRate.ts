/**
 * Win Rate / Strategy Calculator — Pure Math Engine.
 *
 *   Total Decisive Trades = Wins + Losses
 *   Total Trades          = Wins + Losses + Breakeven
 *   Basic Win Rate        = Wins ÷ (Wins + Losses) × 100
 *
 * Example from spec:
 *   Wins = 60
 *   Losses = 40
 *   Win Rate = 60 / (60 + 40) × 100 = 60%
 */

export interface WinRateInput {
  wins: number;
  losses: number;
  breakeven: number;
  avgWin?: number;
  avgLoss?: number;
}

export interface WinRateResult {
  wins: number;
  losses: number;
  breakeven: number;
  totalDecisive: number;
  totalTrades: number;
  basicWinRate: number; // Wins / (Wins + Losses) * 100
  totalWinRate: number; // Wins / Total * 100
  lossRate: number;     // Losses / (Wins + Losses) * 100
  breakevenRate: number;// Breakeven / Total * 100
  // Optional expectancy metrics if avgWin & avgLoss provided
  avgWin?: number;
  avgLoss?: number;
  payoffRatio?: number;
  profitFactor?: number;
  expectancyPerTrade?: number;
  totalProfit?: number;
  breakevenWinRateNeeded?: number;
}

export type WinRateOutcome = { ok: true; result: WinRateResult } | { ok: false; error: string };

export function computeWinRate(i: WinRateInput): WinRateOutcome | null {
  const { wins, losses, breakeven, avgWin, avgLoss } = i;

  if (!Number.isFinite(wins) || !Number.isFinite(losses) || !Number.isFinite(breakeven)) {
    return null;
  }

  if (wins < 0 || losses < 0 || breakeven < 0) {
    return { ok: false, error: "Trades count negative nahi ho sakta." };
  }

  const totalDecisive = wins + losses;
  const totalTrades = wins + losses + breakeven;

  if (totalTrades <= 0) {
    return { ok: false, error: "Kam se kam 1 trade hona zaroori hai." };
  }

  // Basic win rate strictly excluding breakeven as requested: Wins / (Wins + Losses) * 100
  const basicWinRate = totalDecisive > 0 ? (wins / totalDecisive) * 100 : 0;
  const lossRate = totalDecisive > 0 ? (losses / totalDecisive) * 100 : 0;
  const totalWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const breakevenRate = totalTrades > 0 ? (breakeven / totalTrades) * 100 : 0;

  let payoffRatio: number | undefined;
  let profitFactor: number | undefined;
  let expectancyPerTrade: number | undefined;
  let totalProfit: number | undefined;
  let breakevenWinRateNeeded: number | undefined;

  const hasAvgWin = Number.isFinite(avgWin) && (avgWin as number) > 0;
  const hasAvgLoss = Number.isFinite(avgLoss) && (avgLoss as number) > 0;

  if (hasAvgWin && hasAvgLoss) {
    const aw = avgWin as number;
    const al = avgLoss as number;
    payoffRatio = al > 0 ? aw / al : 0;

    const grossWins = wins * aw;
    const grossLosses = losses * al;
    profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 1;
    totalProfit = grossWins - grossLosses;

    // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
    const wRateDec = basicWinRate / 100;
    const lRateDec = lossRate / 100;
    expectancyPerTrade = wRateDec * aw - lRateDec * al;

    // Breakeven Win Rate Needed = 1 / (1 + Payoff Ratio)
    breakevenWinRateNeeded = payoffRatio > 0 ? (1 / (1 + payoffRatio)) * 100 : 50;
  }

  return {
    ok: true,
    result: {
      wins,
      losses,
      breakeven,
      totalDecisive,
      totalTrades,
      basicWinRate,
      totalWinRate,
      lossRate,
      breakevenRate,
      avgWin: hasAvgWin ? (avgWin as number) : undefined,
      avgLoss: hasAvgLoss ? (avgLoss as number) : undefined,
      payoffRatio,
      profitFactor,
      expectancyPerTrade,
      totalProfit,
      breakevenWinRateNeeded,
    },
  };
}
