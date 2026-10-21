/**
 * Crypto Futures Calculator — pure math.
 *
 * Position Value = Margin × Leverage
 * Quantity = Position Value / Entry Price
 * Long Gross P&L = (Exit Price - Entry Price) × Quantity
 * Short Gross P&L = (Entry Price - Exit Price) × Quantity
 * Trading Fees = Entry Fee + Exit Fee
 * Maintenance Margin = Position Value × MMR%
 * Net P&L = Gross P&L - Trading Fees - Funding Fee
 * ROI on Margin % = (Net P&L / Margin) × 100
 */

export type Side = "long" | "short";

export interface FuturesInput {
  side: Side;
  entry: number;
  exit: number;
  margin: number;
  leverage: number;
  feePct?: number; // per side %, e.g. 0.05
  fundingRatePct?: number; // per interval %, e.g. 0.01
  fundingPeriods?: number; // count of 8h intervals, e.g. 1
  directFundingFee?: number; // direct $ funding fee if provided
  mmrPct?: number; // maintenance margin rate %, default 0.5%
}

export interface FuturesResult {
  side: Side;
  entry: number;
  exit: number;
  margin: number;
  leverage: number;
  positionValue: number;
  exitValue: number;
  quantity: number;
  grossPnl: number;
  grossRoiPct: number;
  entryFee: number;
  exitFee: number;
  totalTradingFees: number;
  fundingFee: number;
  maintenanceMargin: number;
  mmrPct: number;
  estLiquidationPrice: number;
  liqDistancePct: number;
  netPnl: number;
  netRoiPct: number;
  breakevenExitPrice: number | null;
  priceChangePct: number;
}

export type FuturesOutcome =
  | { ok: true; result: FuturesResult }
  | { ok: false; error: string };

export function computeFutures(input: FuturesInput): FuturesOutcome | null {
  const {
    side,
    entry,
    exit,
    margin,
    leverage,
    feePct = 0.05,
    fundingRatePct = 0,
    fundingPeriods = 1,
    directFundingFee,
    mmrPct = 0.5,
  } = input;

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(exit) ||
    !Number.isFinite(margin) ||
    !Number.isFinite(leverage)
  ) {
    return null;
  }

  if (entry <= 0) return { ok: false, error: "Entry price 0 se zyada hona chahiye." };
  if (exit <= 0) return { ok: false, error: "Exit price 0 se zyada hona chahiye." };
  if (margin <= 0) return { ok: false, error: "Margin amount 0 se zyada hona chahiye." };
  if (leverage < 1 || leverage > 125) {
    return { ok: false, error: "Leverage 1x se 125x ke beech hona chahiye." };
  }

  const lev = Math.max(1, Math.min(125, leverage));
  const positionValue = margin * lev;
  const quantity = positionValue / entry;
  const exitValue = quantity * exit;

  const dir = side === "long" ? 1 : -1;
  const grossPnl = (exit - entry) * quantity * dir;
  const grossRoiPct = (grossPnl / margin) * 100;

  const f = Math.max(0, feePct) / 100;
  const entryFee = positionValue * f;
  const exitFee = exitValue * f;
  const totalTradingFees = entryFee + exitFee;

  let fundingFee = 0;
  if (directFundingFee != null && Number.isFinite(directFundingFee)) {
    fundingFee = directFundingFee;
  } else if (Number.isFinite(fundingRatePct) && fundingRatePct !== 0) {
    const rate = fundingRatePct / 100;
    const periods = Number.isFinite(fundingPeriods) && fundingPeriods > 0 ? fundingPeriods : 1;
    fundingFee = positionValue * rate * periods;
  }

  const mmr = Math.max(0, Number.isFinite(mmrPct) ? mmrPct : 0.5) / 100;
  const maintenanceMargin = positionValue * mmr;

  // Estimated Liquidation Price approximation (Isolated Margin with MMR):
  // Long:  Entry * (1 - 1/Lev + MMR)
  // Short: Entry * (1 + 1/Lev - MMR)
  let estLiquidationPrice = 0;
  let liqDistancePct = 0;

  if (side === "long") {
    estLiquidationPrice = entry * Math.max(0, 1 - 1 / lev + mmr);
    liqDistancePct = ((entry - estLiquidationPrice) / entry) * 100;
  } else {
    estLiquidationPrice = entry * (1 + 1 / lev - mmr);
    liqDistancePct = ((estLiquidationPrice - entry) / entry) * 100;
  }

  const netPnl = grossPnl - totalTradingFees - fundingFee;
  const netRoiPct = (netPnl / margin) * 100;

  // Break-even Exit Price (Net P&L = 0):
  // Long : (X - E)*Q - E*Q*f - X*Q*f - F = 0 => X = (E*(1+f) + F/Q) / (1 - f)
  // Short: (E - X)*Q - E*Q*f - X*Q*f - F = 0 => X = (E*(1-f) - F/Q) / (1 + f)
  let breakevenExitPrice: number | null = null;
  if (side === "long") {
    if (f < 1) {
      breakevenExitPrice = (entry * (1 + f) + fundingFee / quantity) / (1 - f);
    }
  } else {
    breakevenExitPrice = (entry * (1 - f) - fundingFee / quantity) / (1 + f);
  }

  const priceChangePct = ((exit - entry) / entry) * 100;

  return {
    ok: true,
    result: {
      side,
      entry,
      exit,
      margin,
      leverage: lev,
      positionValue,
      exitValue,
      quantity,
      grossPnl,
      grossRoiPct,
      entryFee,
      exitFee,
      totalTradingFees,
      fundingFee,
      maintenanceMargin,
      mmrPct: mmr * 100,
      estLiquidationPrice,
      liqDistancePct,
      netPnl,
      netRoiPct,
      breakevenExitPrice: breakevenExitPrice != null && breakevenExitPrice > 0 ? breakevenExitPrice : null,
      priceChangePct,
    },
  };
}
