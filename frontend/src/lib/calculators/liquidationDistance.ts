/**
 * Liquidation Distance Calculator — pure math.
 *
 * Purpose: User ki position estimated liquidation price se kitni door hai, ye dikhana.
 *
 * Formulas:
 *   Long Distance %  = (Mark Price - Liquidation Price) / Mark Price × 100
 *   Short Distance % = (Liquidation Price - Mark Price) / Mark Price × 100
 *   Distance in Price = |Mark Price - Liquidation Price|
 */

export type Side = "long" | "short";

export type RiskLevel = "liquidated" | "critical" | "high" | "moderate" | "safe";

export interface LiquidationDistanceInput {
  side: Side;
  entry: number;
  markPrice: number;
  liqPrice: number;
  stopLoss?: number;
}

export interface LiquidationDistanceResult {
  side: Side;
  entry: number;
  markPrice: number;
  liqPrice: number;
  distancePrice: number;
  distancePct: number;
  distanceFromEntryPrice: number;
  distanceFromEntryPct: number;
  currentUnrealizedMovePct: number;
  isLiquidated: boolean;
  riskLevel: RiskLevel;
  riskTitle: string;
  riskMessage: string;
  riskTone: "up" | "down" | "flat" | "warn";
  slSafetyStatus?: "safe" | "danger";
  slDistanceToLiqPct?: number;
}

export type LiquidationDistanceOutcome =
  | { ok: true; result: LiquidationDistanceResult }
  | { ok: false; error: string };

export function computeLiquidationDistance(
  input: LiquidationDistanceInput,
): LiquidationDistanceOutcome | null {
  const { side, entry, markPrice, liqPrice, stopLoss } = input;

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(markPrice) ||
    !Number.isFinite(liqPrice)
  ) {
    return null;
  }

  if (entry <= 0) return { ok: false, error: "Entry price must be greater than 0." };
  if (markPrice <= 0) return { ok: false, error: "Mark price must be greater than 0." };
  if (liqPrice <= 0) return { ok: false, error: "Liquidation price must be greater than 0." };

  let isLiquidated = false;
  let distancePrice = 0;
  let distancePct = 0;
  let distanceFromEntryPrice = 0;
  let distanceFromEntryPct = 0;
  let currentUnrealizedMovePct = 0;

  if (side === "long") {
    currentUnrealizedMovePct = ((markPrice - entry) / entry) * 100;
    distanceFromEntryPrice = Math.max(0, entry - liqPrice);
    distanceFromEntryPct = (distanceFromEntryPrice / entry) * 100;

    if (markPrice <= liqPrice) {
      isLiquidated = true;
      distancePrice = 0;
      distancePct = 0;
    } else {
      distancePrice = markPrice - liqPrice;
      distancePct = (distancePrice / markPrice) * 100;
    }
  } else {
    // Short
    currentUnrealizedMovePct = ((entry - markPrice) / entry) * 100;
    distanceFromEntryPrice = Math.max(0, liqPrice - entry);
    distanceFromEntryPct = (distanceFromEntryPrice / entry) * 100;

    if (markPrice >= liqPrice) {
      isLiquidated = true;
      distancePrice = 0;
      distancePct = 0;
    } else {
      distancePrice = liqPrice - markPrice;
      distancePct = (distancePrice / markPrice) * 100;
    }
  }

  let riskLevel: RiskLevel = "safe";
  let riskTitle = "Healthy Buffer (> 15%)";
  let riskMessage =
    "Position is a safe distance from liquidation and maintains a healthy cushion.";
  let riskTone: "up" | "down" | "flat" | "warn" = "up";

  if (isLiquidated) {
    riskLevel = "liquidated";
    riskTitle = "Position Liquidated 🚨";
    riskMessage =
      "Mark price has crossed liquidation. The position is liquidated.";
    riskTone = "down";
  } else if (distancePct < 2.0) {
    riskLevel = "critical";
    riskTitle = "Critical Liquidation Danger (🚨 < 2%)";
    riskMessage =
      "Mark price is less than 2% from liquidation! A small move can liquidate the position. Add margin or reduce size immediately.";
    riskTone = "down";
  } else if (distancePct < 5.0) {
    riskLevel = "high";
    riskTitle = "High Liquidation Risk (⚠️ 2% – 5%)";
    riskMessage =
      "A volatility wick or sudden spike can liquidate your position. Monitor your stop loss.";
    riskTone = "warn";
  } else if (distancePct < 15.0) {
    riskLevel = "moderate";
    riskTitle = "Moderate Risk Cushion (⚡ 5% – 15%)";
    riskMessage =
      "Position has a typical futures buffer. Watch for reversals.";
    riskTone = "flat";
  } else {
    riskLevel = "safe";
    riskTitle = "Safe Liquidation Cushion (🛡️ > 15%)";
    riskMessage =
      "Position is well away from liquidation with a strong margin buffer.";
    riskTone = "up";
  }

  let slSafetyStatus: "safe" | "danger" | undefined;
  let slDistanceToLiqPct: number | undefined;

  if (stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0) {
    if (side === "long") {
      if (stopLoss > liqPrice) {
        slSafetyStatus = "safe";
        slDistanceToLiqPct = ((stopLoss - liqPrice) / stopLoss) * 100;
      } else {
        slSafetyStatus = "danger";
        slDistanceToLiqPct = ((liqPrice - stopLoss) / stopLoss) * 100;
      }
    } else {
      if (stopLoss < liqPrice) {
        slSafetyStatus = "safe";
        slDistanceToLiqPct = ((liqPrice - stopLoss) / stopLoss) * 100;
      } else {
        slSafetyStatus = "danger";
        slDistanceToLiqPct = ((stopLoss - liqPrice) / stopLoss) * 100;
      }
    }
  }

  return {
    ok: true,
    result: {
      side,
      entry,
      markPrice,
      liqPrice,
      distancePrice,
      distancePct,
      distanceFromEntryPrice,
      distanceFromEntryPct,
      currentUnrealizedMovePct,
      isLiquidated,
      riskLevel,
      riskTitle,
      riskMessage,
      riskTone,
      slSafetyStatus,
      slDistanceToLiqPct,
    },
  };
}
