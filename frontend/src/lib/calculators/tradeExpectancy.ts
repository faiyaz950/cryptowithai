/**
 * Crypto Trade Expectancy Calculator — pure math.
 *
 * Purpose: User ke win rate aur average win/loss ke basis par strategy ka
 * mathematical expected return per trade aur total projected outcome calculate karna.
 *
 * Logic:
 *   Win Rate (W) = Win % / 100
 *   Loss Rate (L) = 1 - W
 *   Gross Expectancy = (W × Avg Win) - (L × Avg Loss)
 *   Net Expectancy = Gross Expectancy - Avg Fee per Trade
 *   Expected Total Outcome = Net Expectancy × Total Trades
 *   Break-even Win Rate % = ((Avg Loss + Fee) / (Avg Win + Avg Loss)) × 100
 *   Win / Loss Ratio (R:R Payoff) = Avg Win / Avg Loss
 */

export interface TradeExpectancyPreset {
  id: string;
  name: string;
  winRatePct: number;
  avgWinAmount: number;
  avgLossAmount: number;
  tradesCount: number;
  feePerTrade: number;
  note: string;
}

export const TRADE_EXPECTANCY_PRESETS: TradeExpectancyPreset[] = [
  {
    id: "user-example",
    name: "Standard Swing System (55% Win, 2:1 R:R)",
    winRatePct: 55,
    avgWinAmount: 2000,
    avgLossAmount: 1000,
    tradesCount: 30,
    feePerTrade: 100,
    note: "Expectancy = (0.55 × 2000) - (0.45 × 1000) - 100 = 550 per trade",
  },
  {
    id: "high-win-scalper",
    name: "High Win-Rate Scalper (70% Win, 0.7:1 R:R)",
    winRatePct: 70,
    avgWinAmount: 120,
    avgLossAmount: 180,
    tradesCount: 150,
    feePerTrade: 15,
    note: "Scalping strategy with tight take profits and fee vulnerability",
  },
  {
    id: "trend-follower",
    name: "Crypto Trend Follower (38% Win, 3.5:1 R:R)",
    winRatePct: 38,
    avgWinAmount: 3500,
    avgLossAmount: 1000,
    tradesCount: 25,
    feePerTrade: 50,
    note: "Low win rate compensated by large winners on major breakouts",
  },
  {
    id: "breakeven-edge",
    name: "Fee-Drag Danger Zone (52% Win, 1:1 R:R)",
    winRatePct: 52,
    avgWinAmount: 500,
    avgLossAmount: 500,
    tradesCount: 60,
    feePerTrade: 30,
    note: "Slight edge is wiped out by exchange trading fees and slippage",
  },
];

export interface TradeExpectancyInput {
  winRatePct: number;
  avgWinAmount: number;
  avgLossAmount: number;
  tradesCount?: number;
  feePerTrade?: number;
}

export type EdgeRating = "strong_edge" | "moderate_edge" | "fragile_edge" | "negative_edge";

export interface TradeExpectancyOutcome {
  winRatePct: number;
  lossRatePct: number;
  avgWinAmount: number;
  avgLossAmount: number;
  tradesCount: number;
  feePerTrade: number;
  grossExpectancyPerTrade: number;
  netExpectancyPerTrade: number;
  expectedTotalOutcome: number;
  winLossRatio: number;
  breakEvenWinRatePct: number;
  totalFeesImpact: number;
  feeDragPct: number;
  profitFactor: number;
  halfKellyFractionPct: number;
  edgeRating: EdgeRating;
  isProfitable: boolean;
  headlineSummary: string;
}

export function computeTradeExpectancy(
  input: TradeExpectancyInput
): TradeExpectancyOutcome | null {
  const {
    winRatePct,
    avgWinAmount,
    avgLossAmount,
    tradesCount = 30,
    feePerTrade = 0,
  } = input;

  if (
    !Number.isFinite(winRatePct) ||
    winRatePct < 0 ||
    winRatePct > 100 ||
    !Number.isFinite(avgWinAmount) ||
    avgWinAmount <= 0 ||
    !Number.isFinite(avgLossAmount) ||
    avgLossAmount <= 0
  ) {
    return null;
  }

  const validTradesCount = Math.max(1, Number.isFinite(tradesCount) ? tradesCount : 30);
  const validFee = Math.max(0, Number.isFinite(feePerTrade) ? feePerTrade : 0);

  const winRate = winRatePct / 100;
  const lossRate = 1 - winRate;
  const lossRatePct = lossRate * 100;

  // Gross Expectancy = (WinRate × AvgWin) - (LossRate × AvgLoss)
  const grossExpectancyPerTrade = winRate * avgWinAmount - lossRate * avgLossAmount;

  // Net Expectancy after fee deduction
  const netExpectancyPerTrade = grossExpectancyPerTrade - validFee;

  // Total projected outcome over selected trades count
  const expectedTotalOutcome = netExpectancyPerTrade * validTradesCount;

  // Win / Loss ratio (Payoff Ratio)
  const winLossRatio = avgLossAmount > 0 ? avgWinAmount / avgLossAmount : 0;

  // Break-even win rate solving: W * AvgWin - (1 - W) * AvgLoss - Fee = 0
  // W * (AvgWin + AvgLoss) = AvgLoss + Fee
  const breakEvenWinRatePct =
    avgWinAmount + avgLossAmount > 0
      ? ((avgLossAmount + validFee) / (avgWinAmount + avgLossAmount)) * 100
      : 50;

  // Total fees paid across all trades
  const totalFeesImpact = validFee * validTradesCount;

  // Fee drag percentage on gross edge
  const feeDragPct =
    grossExpectancyPerTrade > 0
      ? Math.min(100, (validFee / grossExpectancyPerTrade) * 100)
      : 100;

  // Profit Factor = Total Expected Wins / Total Expected Losses
  const totalExpectedWins = winRate * avgWinAmount;
  const totalExpectedLosses = lossRate * avgLossAmount + validFee;
  const profitFactor =
    totalExpectedLosses > 0 ? totalExpectedWins / totalExpectedLosses : 999;

  // Half-Kelly Criterion for position sizing safety
  // Kelly % = (W * b - L) / b, where b = winLossRatio
  let halfKellyFractionPct = 0;
  if (winLossRatio > 0 && netExpectancyPerTrade > 0) {
    const fullKelly = (winRate * winLossRatio - lossRate) / winLossRatio;
    halfKellyFractionPct = Math.max(0, Math.min(25, (fullKelly / 2) * 100));
  }

  // Edge Rating
  let edgeRating: EdgeRating = "moderate_edge";
  if (netExpectancyPerTrade <= 0) {
    edgeRating = "negative_edge";
  } else if (netExpectancyPerTrade < 0.15 * avgLossAmount || feeDragPct > 40) {
    edgeRating = "fragile_edge";
  } else if (netExpectancyPerTrade > 0.45 * avgLossAmount) {
    edgeRating = "strong_edge";
  } else {
    edgeRating = "moderate_edge";
  }

  const isProfitable = netExpectancyPerTrade > 0;

  let headlineSummary = "";
  if (!isProfitable) {
    headlineSummary = `Negative expectancy of ${netExpectancyPerTrade.toFixed(2)} per trade. Your strategy loses money over time.`;
  } else {
    headlineSummary = `Positive edge: +${netExpectancyPerTrade.toFixed(2)} per trade (+${expectedTotalOutcome.toFixed(2)} projected over ${validTradesCount} trades).`;
  }

  return {
    winRatePct,
    lossRatePct,
    avgWinAmount,
    avgLossAmount,
    tradesCount: validTradesCount,
    feePerTrade: validFee,
    grossExpectancyPerTrade,
    netExpectancyPerTrade,
    expectedTotalOutcome,
    winLossRatio,
    breakEvenWinRatePct,
    totalFeesImpact,
    feeDragPct,
    profitFactor,
    halfKellyFractionPct,
    edgeRating,
    isProfitable,
    headlineSummary,
  };
}
