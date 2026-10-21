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

  if (entry <= 0) return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  if (markPrice <= 0) return { ok: false, error: "Mark price 0 se bada hona chahiye." };
  if (liqPrice <= 0) return { ok: false, error: "Liquidation price 0 se bada hona chahiye." };

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
    "Position liquidation price se safe doori par hai aur ek healthy cushion maintain kar rahi hai.";
  let riskTone: "up" | "down" | "flat" | "warn" = "up";

  if (isLiquidated) {
    riskLevel = "liquidated";
    riskTitle = "Position Liquidated 🚨";
    riskMessage =
      "Current Mark Price liquidation price ko cross kar chuki hai. Position liquidate ho chuki hai.";
    riskTone = "down";
  } else if (distancePct < 2.0) {
    riskLevel = "critical";
    riskTitle = "Critical Liquidation Danger (🚨 < 2%)";
    riskMessage =
      "Mark Price liquidation price se sirf 2% se bhi kam door hai! Thodi si market volatility par position liquidate ho sakti hai. Turant margin add karein ya position reduce karein.";
    riskTone = "down";
  } else if (distancePct < 5.0) {
    riskLevel = "high";
    riskTitle = "High Liquidation Risk (⚠️ 2% – 5%)";
    riskMessage =
      "High volatility wick ya sudden spike aapki position ko liquidate kar sakti hai. Stop loss monitor karein.";
    riskTone = "warn";
  } else if (distancePct < 15.0) {
    riskLevel = "moderate";
    riskTitle = "Moderate Risk Cushion (⚡ 5% – 15%)";
    riskMessage =
      "Position ke paas ek standard futures buffer hai. Market reversal par dhyan rakhein.";
    riskTone = "flat";
  } else {
    riskLevel = "safe";
    riskTitle = "Safe Liquidation Cushion (🛡️ > 15%)";
    riskMessage =
      "Position liquidation price se kaafi door hai aur ek strong margin buffer maintain kar rahi hai.";
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
