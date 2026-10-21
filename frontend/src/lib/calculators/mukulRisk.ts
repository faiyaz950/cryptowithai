/**
 * Mukul Risk Calculator — ALL IN ONE ⭐⭐⭐
 * Flagship calculator for Mukul Crypto Club.
 *
 * Integrates:
 * - Position Sizing (Fixed risk % model)
 * - Risk / Reward (R:R) & Expectancy
 * - Profit & Loss target projections
 * - Leverage & Margin requirements
 * - Liquidation distance safety check
 * - Trading fee deductions
 */

export interface MukulRiskInput {
  side: "long" | "short";
  balance: number;
  riskPct: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  leverage?: number;
  feePct?: number;
}

export interface MukulRiskResult {
  side: "long" | "short";
  balance: number;
  riskPct: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  leverage: number;
  riskAmount: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  positionSize: number;
  positionValue: number;
  marginRequired: number;
  marginRatioPct: number;
  potentialLoss: number;
  potentialProfit: number;
  riskRewardRatio: number;
  roiOnAccountLoss: number;
  roiOnAccountProfit: number;
  roiOnPosition: number;
  slDistancePct: number;
  tpDistancePct: number;
  accountAtLoss: number;
  accountAtProfit: number;
  breakevenWinRate: number;
  hasFees: boolean;
  entryFee?: number;
  exitFeeLoss?: number;
  exitFeeProfit?: number;
  totalFeeLoss?: number;
  totalFeeProfit?: number;
  netLossWithFees?: number;
  netProfitWithFees?: number;
  estimatedLiqPrice?: number;
  isSafeFromLiquidation?: boolean;
  liqDistancePct?: number;
}

export type MukulRiskOutcome =
  | { ok: true; result: MukulRiskResult }
  | { ok: false; error: string };

export function computeMukulRisk(input: MukulRiskInput): MukulRiskOutcome | null {
  const { side, balance, riskPct, entryPrice, stopLossPrice, takeProfitPrice, leverage, feePct } = input;

  if (
    !Number.isFinite(balance) ||
    !Number.isFinite(riskPct) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLossPrice) ||
    !Number.isFinite(takeProfitPrice)
  ) {
    return null;
  }

  if (balance <= 0) {
    return { ok: false, error: "Account balance 0 se bada hona chahiye." };
  }
  if (riskPct <= 0 || riskPct > 100) {
    return { ok: false, error: "Risk percentage 0% se 100% ke beech hona chahiye." };
  }
  if (entryPrice <= 0) {
    return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  }
  if (stopLossPrice <= 0) {
    return { ok: false, error: "Stop loss price 0 se bada hona chahiye." };
  }
  if (takeProfitPrice <= 0) {
    return { ok: false, error: "Take profit price 0 se bada hona chahiye." };
  }

  if (entryPrice === stopLossPrice) {
    return { ok: false, error: "Entry price aur Stop Loss barabar nahi ho sakte." };
  }
  if (entryPrice === takeProfitPrice) {
    return { ok: false, error: "Entry price aur Take Profit barabar nahi ho sakte." };
  }

  if (side === "long") {
    if (stopLossPrice >= entryPrice) {
      return { ok: false, error: "Long trade ke liye Stop Loss entry price se neeche hona chahiye." };
    }
    if (takeProfitPrice <= entryPrice) {
      return { ok: false, error: "Long trade ke liye Take Profit entry price se upar hona chahiye." };
    }
  } else {
    if (stopLossPrice <= entryPrice) {
      return { ok: false, error: "Short trade ke liye Stop Loss entry price se upar hona chahiye." };
    }
    if (takeProfitPrice >= entryPrice) {
      return { ok: false, error: "Short trade ke liye Take Profit entry price se neeche hona chahiye." };
    }
  }

  const lev = leverage != null && Number.isFinite(leverage) && leverage >= 1 ? leverage : 1;
  const fees = feePct != null && Number.isFinite(feePct) && feePct >= 0 ? feePct : 0;

  const riskAmount = balance * (riskPct / 100);
  const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
  const rewardPerUnit = Math.abs(takeProfitPrice - entryPrice);

  const positionSize = riskAmount / riskPerUnit;
  const positionValue = positionSize * entryPrice;
  const marginRequired = positionValue / lev;
  const marginRatioPct = (marginRequired / balance) * 100;

  const potentialLoss = -riskAmount;
  const potentialProfit = positionSize * rewardPerUnit;
  const riskRewardRatio = rewardPerUnit / riskPerUnit;

  const roiOnAccountLoss = -riskPct;
  const roiOnAccountProfit = (potentialProfit / balance) * 100;
  const roiOnPosition = (rewardPerUnit / entryPrice) * 100 * lev;

  const slDistancePct = (riskPerUnit / entryPrice) * 100;
  const tpDistancePct = (rewardPerUnit / entryPrice) * 100;

  const accountAtLoss = balance - riskAmount;
  const accountAtProfit = balance + potentialProfit;

  const breakevenWinRate = (1 / (1 + riskRewardRatio)) * 100;

  let hasFees = false;
  let entryFee: number | undefined;
  let exitFeeLoss: number | undefined;
  let exitFeeProfit: number | undefined;
  let totalFeeLoss: number | undefined;
  let totalFeeProfit: number | undefined;
  let netLossWithFees: number | undefined;
  let netProfitWithFees: number | undefined;

  if (fees > 0) {
    hasFees = true;
    const feeRate = fees / 100;
    entryFee = positionValue * feeRate;
    exitFeeLoss = positionSize * stopLossPrice * feeRate;
    exitFeeProfit = positionSize * takeProfitPrice * feeRate;
    totalFeeLoss = entryFee + exitFeeLoss;
    totalFeeProfit = entryFee + exitFeeProfit;
    netLossWithFees = potentialLoss - totalFeeLoss;
    netProfitWithFees = potentialProfit - totalFeeProfit;
  }

  let estimatedLiqPrice: number | undefined;
  let isSafeFromLiquidation: boolean | undefined;
  let liqDistancePct: number | undefined;

  if (lev > 1) {
    const mmr = 0.005; // 0.5% default maintenance margin
    if (side === "long") {
      estimatedLiqPrice = entryPrice * Math.max(0, 1 - 1 / lev + mmr);
      isSafeFromLiquidation = stopLossPrice > estimatedLiqPrice;
      liqDistancePct = ((entryPrice - estimatedLiqPrice) / entryPrice) * 100;
    } else {
      estimatedLiqPrice = entryPrice * (1 + 1 / lev - mmr);
      isSafeFromLiquidation = stopLossPrice < estimatedLiqPrice;
      liqDistancePct = ((estimatedLiqPrice - entryPrice) / entryPrice) * 100;
    }
  }

  return {
    ok: true,
    result: {
      side,
      balance,
      riskPct,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      leverage: lev,
      riskAmount,
      riskPerUnit,
      rewardPerUnit,
      positionSize,
      positionValue,
      marginRequired,
      marginRatioPct,
      potentialLoss,
      potentialProfit,
      riskRewardRatio,
      roiOnAccountLoss,
      roiOnAccountProfit,
      roiOnPosition,
      slDistancePct,
      tpDistancePct,
      accountAtLoss,
      accountAtProfit,
      breakevenWinRate,
      hasFees,
      entryFee,
      exitFeeLoss,
      exitFeeProfit,
      totalFeeLoss,
      totalFeeProfit,
      netLossWithFees,
      netProfitWithFees,
      estimatedLiqPrice,
      isSafeFromLiquidation,
      liqDistancePct,
    },
  };
}
