/**
 * Risk of Ruin & Drawdown Probability Calculator — Monte Carlo Engine.
 *
 * Inputs:
 * - Win Rate %
 * - Average Win ($)
 * - Average Loss ($)
 * - Risk per Trade %
 * - Number of Trades
 * - Starting Capital ($)
 * - Ruin Threshold % (default 50% drawdown)
 *
 * Outputs:
 * - Estimated Risk of Ruin %
 * - Probability of 20%, 30%, 50% Drawdown
 * - Expected Max Losing Streak
 * - Expected Equity Range (5th percentile, Median, 95th percentile)
 * - Kelly Criterion Optimal Bet Fraction
 */

export interface RiskOfRuinInput {
  winRatePct: number; // e.g. 50%
  avgWin: number;     // e.g. 200
  avgLoss: number;    // e.g. 100
  riskPctPerTrade: number; // e.g. 2%
  tradesCount: number;     // e.g. 100
  startingCapital: number; // e.g. 10000
  ruinThresholdPct?: number; // e.g. 50%
}

export interface RiskOfRuinResult {
  winRatePct: number;
  payoffRatio: number;
  riskPctPerTrade: number;
  tradesCount: number;
  startingCapital: number;
  ruinThresholdPct: number;
  riskOfRuinPct: number;
  prob20PctDrawdown: number;
  prob30PctDrawdown: number;
  prob50PctDrawdown: number;
  expectedMaxLosingStreak: number;
  medianFinalEquity: number;
  worstCase5thPercentile: number;
  bestCase95thPercentile: number;
  kellyCriterionPct: number;
  expectedEdgePerTrade: number;
  runsSimulated: number;
}

export type RiskOfRuinOutcome =
  | { ok: true; result: RiskOfRuinResult }
  | { ok: false; error: string };

export function computeRiskOfRuin(input: RiskOfRuinInput): RiskOfRuinOutcome | null {
  const {
    winRatePct,
    avgWin,
    avgLoss,
    riskPctPerTrade,
    tradesCount,
    startingCapital,
    ruinThresholdPct = 50,
  } = input;

  if (
    !Number.isFinite(winRatePct) ||
    !Number.isFinite(avgWin) ||
    !Number.isFinite(avgLoss) ||
    !Number.isFinite(riskPctPerTrade) ||
    !Number.isFinite(tradesCount) ||
    !Number.isFinite(startingCapital)
  ) {
    return null;
  }

  if (winRatePct <= 0 || winRatePct >= 100) {
    return { ok: false, error: "Win rate 0% se 100% ke beech honi chahiye." };
  }
  if (avgWin <= 0) return { ok: false, error: "Average win 0 se bada hona chahiye." };
  if (avgLoss <= 0) return { ok: false, error: "Average loss 0 se bada hona chahiye." };
  if (riskPctPerTrade <= 0 || riskPctPerTrade > 50) {
    return { ok: false, error: "Risk per trade 0% se 50% ke beech hona chahiye." };
  }
  if (tradesCount < 5 || tradesCount > 1000) {
    return { ok: false, error: "Number of trades 5 se 1000 ke beech hone chahiye." };
  }
  if (startingCapital <= 0) return { ok: false, error: "Starting capital 0 se bada hona chahiye." };

  const w = winRatePct / 100;
  const l = 1 - w;
  const payoff = avgWin / avgLoss;

  // Expected edge per trade: (W * avgWin - L * avgLoss) / avgLoss
  const expectedEdgePerTrade = w * payoff - l;

  // Kelly Criterion: W - (1 - W) / Payoff
  const rawKelly = payoff > 0 ? (w - l / payoff) * 100 : 0;
  const kellyCriterionPct = Math.max(0, Math.min(50, rawKelly));

  // Expected max losing streak: log(N) / log(1 / L)
  const expectedMaxLosingStreak = l > 0 ? Math.ceil(Math.log(tradesCount) / Math.log(1 / l)) : 0;

  // Monte Carlo Simulation
  const RUNS = 2000;
  let ruinedCount = 0;
  let dd20Count = 0;
  let dd30Count = 0;
  let dd50Count = 0;

  const finalEquities: number[] = [];

  const riskFraction = riskPctPerTrade / 100;
  const ruinFraction = Math.max(1, Math.min(100, ruinThresholdPct)) / 100;

  for (let r = 0; r < RUNS; r++) {
    let equity = startingCapital;
    let peak = startingCapital;
    let hitRuin = false;
    let hit20 = false;
    let hit30 = false;
    let hit50 = false;

    for (let t = 0; t < tradesCount; t++) {
      if (equity <= 0) {
        hitRuin = true;
        hit20 = true;
        hit30 = true;
        hit50 = true;
        break;
      }

      const betAmount = equity * riskFraction;
      const isWin = Math.random() < w;

      if (isWin) {
        equity += betAmount * payoff;
      } else {
        equity -= betAmount;
      }

      if (equity > peak) {
        peak = equity;
      }

      const dd = peak > 0 ? (peak - equity) / peak : 0;
      if (dd >= 0.2) hit20 = true;
      if (dd >= 0.3) hit30 = true;
      if (dd >= 0.5) hit50 = true;
      if (dd >= ruinFraction) hitRuin = true;
    }

    if (hitRuin) ruinedCount++;
    if (hit20) dd20Count++;
    if (hit30) dd30Count++;
    if (hit50) dd50Count++;

    finalEquities.push(Math.max(0, equity));
  }

  finalEquities.sort((a, b) => a - b);

  const riskOfRuinPct = (ruinedCount / RUNS) * 100;
  const prob20PctDrawdown = (dd20Count / RUNS) * 100;
  const prob30PctDrawdown = (dd30Count / RUNS) * 100;
  const prob50PctDrawdown = (dd50Count / RUNS) * 100;

  const worstCase5thPercentile = finalEquities[Math.floor(RUNS * 0.05)];
  const medianFinalEquity = finalEquities[Math.floor(RUNS * 0.5)];
  const bestCase95thPercentile = finalEquities[Math.floor(RUNS * 0.95)];

  return {
    ok: true,
    result: {
      winRatePct,
      payoffRatio: payoff,
      riskPctPerTrade,
      tradesCount,
      startingCapital,
      ruinThresholdPct,
      riskOfRuinPct,
      prob20PctDrawdown,
      prob30PctDrawdown,
      prob50PctDrawdown,
      expectedMaxLosingStreak,
      medianFinalEquity,
      worstCase5thPercentile,
      bestCase95thPercentile,
      kellyCriterionPct,
      expectedEdgePerTrade,
      runsSimulated: RUNS,
    },
  };
}
