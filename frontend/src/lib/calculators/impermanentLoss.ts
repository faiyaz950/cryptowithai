/**
 * Crypto Impermanent Loss Calculator — pure math.
 *
 * Purpose: Liquidity pool (50/50 constant-product AMM) mein tokens deposit karne
 * aur unhe simply hold (HODL) karne ke potential value difference ko calculate karna.
 *
 * Logic — 50/50 Constant-Product Pool:
 *   Relative price ratio r = (1 + PriceChangeA%) / (1 + PriceChangeB%)
 *   Impermanent Loss % = (2 × √r / (1 + r) - 1) × 100
 *   Hold Portfolio Value = (V0 / 2) × (1 + ΔA) + (V0 / 2) × (1 + ΔB)
 *   LP Position Value (no fees) = V0 × √((1 + ΔA) × (1 + ΔB))
 *   Value Difference = LP Position Value - Hold Portfolio Value
 *   Net LP Result = LP Position Value + Fees Earned - Hold Portfolio Value
 */

export interface ImpermanentLossPreset {
  id: string;
  name: string;
  depositValueUSD: number;
  tokenAPriceChangePct: number;
  tokenBPriceChangePct: number;
  feeApyPct: number;
  daysHeld: number;
  tokenAName: string;
  tokenBName: string;
  note: string;
}

export const IMPERMANENT_LOSS_PRESETS: ImpermanentLossPreset[] = [
  {
    id: "eth-usdc-bull",
    name: "ETH / USDC (ETH 2x Rally)",
    depositValueUSD: 2000,
    tokenAPriceChangePct: 100,
    tokenBPriceChangePct: 0,
    feeApyPct: 24,
    daysHeld: 90,
    tokenAName: "ETH",
    tokenBName: "USDC",
    note: "Classic 2x token divergence resulting in -5.72% IL offset by swap fees",
  },
  {
    id: "sol-eth-divergence",
    name: "SOL / ETH (Crypto vs Crypto)",
    depositValueUSD: 5000,
    tokenAPriceChangePct: 150,
    tokenBPriceChangePct: 50,
    feeApyPct: 18,
    daysHeld: 60,
    tokenAName: "SOL",
    tokenBName: "ETH",
    note: "Both assets rise, but relative ratio r = 2.5 / 1.5 = 1.667 (-2.02% IL)",
  },
  {
    id: "stable-depeg-test",
    name: "USDT / USDC (Minor Depeg Test)",
    depositValueUSD: 10000,
    tokenAPriceChangePct: -2,
    tokenBPriceChangePct: 0,
    feeApyPct: 8,
    daysHeld: 30,
    tokenAName: "USDT",
    tokenBName: "USDC",
    note: "Tiny 2% price divergence produces negligible -0.005% impermanent loss",
  },
  {
    id: "meme-5x-pump",
    name: "Meme Coin 5x Divergence",
    depositValueUSD: 1000,
    tokenAPriceChangePct: 400,
    tokenBPriceChangePct: 0,
    feeApyPct: 45,
    daysHeld: 45,
    tokenAName: "PEPE",
    tokenBName: "USDT",
    note: "5x relative price pump leads to significant -25.46% impermanent loss",
  },
];

export interface ImpermanentLossInput {
  depositValueUSD: number;
  tokenAPriceChangePct: number;
  tokenBPriceChangePct: number;
  feeApyPct?: number;
  daysHeld?: number;
  manualFeesUSD?: number;
  tokenAName?: string;
  tokenBName?: string;
}

export interface ImpermanentLossOutcome {
  depositValueUSD: number;
  tokenAPriceChangePct: number;
  tokenBPriceChangePct: number;
  tokenAName: string;
  tokenBName: string;
  priceRatioA: number;
  priceRatioB: number;
  relativeRatioR: number;
  impermanentLossPct: number;
  holdPortfolioValueUSD: number;
  lpPositionValueUSD: number;
  valueDifferenceUSD: number;
  feesEarnedUSD: number;
  netLpResultUSD: number;
  netLpOutcomePct: number;
  holdReturnPct: number;
  lpReturnPctWithFees: number;
  breakevenFeeApyPct: number;
  isProfitableVsHold: boolean;
  headlineSummary: string;
}

export function computeImpermanentLoss(
  input: ImpermanentLossInput
): ImpermanentLossOutcome | null {
  const {
    depositValueUSD,
    tokenAPriceChangePct,
    tokenBPriceChangePct,
    feeApyPct = 0,
    daysHeld = 30,
    manualFeesUSD,
    tokenAName = "Token A",
    tokenBName = "Token B",
  } = input;

  if (
    !Number.isFinite(depositValueUSD) ||
    depositValueUSD <= 0 ||
    !Number.isFinite(tokenAPriceChangePct) ||
    !Number.isFinite(tokenBPriceChangePct)
  ) {
    return null;
  }

  // Price ratios (must be strictly > 0 to avoid total wipeout)
  const priceRatioA = 1 + tokenAPriceChangePct / 100;
  const priceRatioB = 1 + tokenBPriceChangePct / 100;

  if (priceRatioA <= 0 || priceRatioB <= 0) {
    return null;
  }

  // Relative price ratio r = (P_A_final / P_A_init) / (P_B_final / P_B_init)
  const relativeRatioR = priceRatioA / priceRatioB;

  // IL = 2 * sqrt(r) / (1 + r) - 1
  const sqrtR = Math.sqrt(relativeRatioR);
  const ilFraction = (2 * sqrtR) / (1 + relativeRatioR) - 1;
  const impermanentLossPct = ilFraction * 100;

  // 50/50 initial deposit allocation
  const halfDeposit = depositValueUSD / 2;

  // If simply holding the tokens in spot wallet:
  const holdPortfolioValueUSD =
    halfDeposit * priceRatioA + halfDeposit * priceRatioB;

  // LP position value without fees = V0 * sqrt(priceRatioA * priceRatioB)
  const lpPositionValueUSD =
    depositValueUSD * Math.sqrt(priceRatioA * priceRatioB);

  // Exact dollar loss due to impermanent loss
  const valueDifferenceUSD = lpPositionValueUSD - holdPortfolioValueUSD;

  // Swap fees earned
  let feesEarnedUSD = 0;
  if (Number.isFinite(manualFeesUSD) && (manualFeesUSD ?? 0) > 0) {
    feesEarnedUSD = manualFeesUSD!;
  } else if (Number.isFinite(feeApyPct) && feeApyPct > 0 && daysHeld > 0) {
    // Fee calculated on initial deposit over holding days
    feesEarnedUSD = depositValueUSD * (feeApyPct / 100) * (daysHeld / 365);
  }

  // Net LP Result vs Hold
  const netLpResultUSD = lpPositionValueUSD + feesEarnedUSD - holdPortfolioValueUSD;
  const netLpOutcomePct =
    holdPortfolioValueUSD > 0
      ? (netLpResultUSD / holdPortfolioValueUSD) * 100
      : 0;

  const holdReturnPct =
    ((holdPortfolioValueUSD - depositValueUSD) / depositValueUSD) * 100;

  const lpReturnPctWithFees =
    ((lpPositionValueUSD + feesEarnedUSD - depositValueUSD) / depositValueUSD) *
    100;

  // Breakeven fee APY needed to offset IL:
  // FeeNeeded = -valueDifferenceUSD
  // FeeNeeded = depositValueUSD * (APY / 100) * (daysHeld / 365)
  // APY = (-valueDifferenceUSD / depositValueUSD) * (365 / daysHeld) * 100
  const validDays = Math.max(1, daysHeld);
  const breakevenFeeApyPct =
    Math.abs(valueDifferenceUSD) > 0.001
      ? (Math.abs(valueDifferenceUSD) / depositValueUSD) *
        (365 / validDays) *
        100
      : 0;

  const isProfitableVsHold = netLpResultUSD >= 0;

  let headlineSummary = "";
  if (Math.abs(impermanentLossPct) < 0.01) {
    headlineSummary = "Negligible Impermanent Loss: Prices moved in tandem.";
  } else if (isProfitableVsHold) {
    headlineSummary = `LP Outperformed HODL: Fees ($${feesEarnedUSD.toFixed(2)}) completely offset the $${Math.abs(valueDifferenceUSD).toFixed(2)} IL.`;
  } else {
    headlineSummary = `Impermanent Loss of ${impermanentLossPct.toFixed(2)}% ($${Math.abs(valueDifferenceUSD).toFixed(2)}) vs holding spot tokens.`;
  }

  return {
    depositValueUSD,
    tokenAPriceChangePct,
    tokenBPriceChangePct,
    tokenAName,
    tokenBName,
    priceRatioA,
    priceRatioB,
    relativeRatioR,
    impermanentLossPct,
    holdPortfolioValueUSD,
    lpPositionValueUSD,
    valueDifferenceUSD,
    feesEarnedUSD,
    netLpResultUSD,
    netLpOutcomePct,
    holdReturnPct,
    lpReturnPctWithFees,
    breakevenFeeApyPct,
    isProfitableVsHold,
    headlineSummary,
  };
}
