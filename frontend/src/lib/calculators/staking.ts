/**
 * Crypto Staking Rewards Calculator — pure math.
 *
 * Inputs:
 * - Staked Amount
 * - Estimated APY %
 * - Duration
 * - Compounding Frequency (None, Daily, Weekly, Monthly, Annually)
 * - Validator/Platform Fee %
 *
 * Logic:
 *   Simple: Rewards = Principal × APY × TimeInYears
 *   Compound: Final = Principal × (1 + APY / n)^(n × t)
 *   Rewards = Final - Principal
 *   Net Rewards = Rewards - Platform Fee
 */

export type StakingCompounding = "none" | "daily" | "weekly" | "monthly" | "annually";

export interface StakingPreset {
  id: string;
  asset: string;
  name: string;
  defaultApy: number;
  unbondingDays: number;
  validatorFee: number;
}

export const STAKING_PRESETS: StakingPreset[] = [
  { id: "eth", asset: "ETH", name: "Ethereum (Lido/Native)", defaultApy: 3.8, unbondingDays: 9, validatorFee: 10 },
  { id: "sol", asset: "SOL", name: "Solana (Native/Jito)", defaultApy: 7.2, unbondingDays: 3, validatorFee: 5 },
  { id: "dot", asset: "DOT", name: "Polkadot", defaultApy: 14.5, unbondingDays: 28, validatorFee: 3 },
  { id: "atom", asset: "ATOM", name: "Cosmos", defaultApy: 13.8, unbondingDays: 21, validatorFee: 5 },
  { id: "ada", asset: "ADA", name: "Cardano", defaultApy: 3.2, unbondingDays: 0, validatorFee: 2 },
  { id: "sui", asset: "SUI", name: "Sui Network", defaultApy: 6.5, unbondingDays: 1, validatorFee: 5 },
];

export interface StakingInput {
  stakedAmount: number;
  apyPct: number;
  durationMonths: number;
  compounding?: StakingCompounding;
  validatorFeePct?: number; // commission on rewards %
  coinPrice?: number;
}

export interface StakingResult {
  stakedAmount: number;
  apyPct: number;
  durationMonths: number;
  durationYears: number;
  compounding: StakingCompounding;
  grossRewards: number;
  validatorFeePct: number;
  platformFee: number;
  netRewards: number;
  finalBalance: number;
  effectiveReturnPct: number;
  dailyReward: number;
  monthlyReward: number;
  yearlyReward: number;
  coinPrice: number;
  netRewardsFiat: number;
  finalBalanceFiat: number;
}

export type StakingOutcome = { ok: true; result: StakingResult } | { ok: false; error: string };

export function computeStaking(input: StakingInput): StakingOutcome | null {
  const {
    stakedAmount,
    apyPct,
    durationMonths,
    compounding = "daily",
    validatorFeePct = 5,
    coinPrice = 1,
  } = input;

  if (
    !Number.isFinite(stakedAmount) ||
    !Number.isFinite(apyPct) ||
    !Number.isFinite(durationMonths)
  ) {
    return null;
  }

  if (stakedAmount <= 0) return { ok: false, error: "Staked amount 0 se bada hona chahiye." };
  if (apyPct < 0) return { ok: false, error: "APY negative nahi ho sakti." };
  if (durationMonths <= 0) return { ok: false, error: "Duration 0 se zyada honi chahiye." };

  const t = durationMonths / 12; // time in years
  const r = apyPct / 100;
  let finalAmount = stakedAmount;

  if (compounding === "none" || r === 0) {
    // Simple APR
    const gross = stakedAmount * r * t;
    finalAmount = stakedAmount + gross;
  } else {
    let n = 365;
    if (compounding === "weekly") n = 52;
    if (compounding === "monthly") n = 12;
    if (compounding === "annually") n = 1;

    finalAmount = stakedAmount * Math.pow(1 + r / n, n * t);
  }

  const grossRewards = Math.max(0, finalAmount - stakedAmount);
  const feeRate = Math.max(0, validatorFeePct) / 100;
  const platformFee = grossRewards * feeRate;
  const netRewards = grossRewards - platformFee;
  const finalBalance = stakedAmount + netRewards;

  const effectiveReturnPct = stakedAmount > 0 ? (netRewards / stakedAmount) * 100 : 0;

  const dailyReward = t > 0 ? netRewards / (durationMonths * 30.5) : 0;
  const monthlyReward = durationMonths > 0 ? netRewards / durationMonths : 0;
  const yearlyReward = t > 0 ? netRewards / t : 0;

  const price = Number.isFinite(coinPrice) && coinPrice > 0 ? coinPrice : 1;
  const netRewardsFiat = netRewards * price;
  const finalBalanceFiat = finalBalance * price;

  return {
    ok: true,
    result: {
      stakedAmount,
      apyPct,
      durationMonths,
      durationYears: t,
      compounding,
      grossRewards,
      validatorFeePct,
      platformFee,
      netRewards,
      finalBalance,
      effectiveReturnPct,
      dailyReward,
      monthlyReward,
      yearlyReward,
      coinPrice: price,
      netRewardsFiat,
      finalBalanceFiat,
    },
  };
}
