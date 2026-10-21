/**
 * Leverage calculator — pure math.
 *
 *   Position Value = Margin × Leverage
 *   Quantity       = Position Value ÷ Entry Price
 *
 *   Example:
 *     Margin = $1,000, Leverage = 10×
 *     Position Value = $10,000
 *     Entry = $100
 *     Quantity = 10,000 ÷ 100 = 100 coins
 *
 *   Liquidation estimate (isolated margin):
 *     Long : Est. Liquidation = Entry × (1 − 1 ÷ Leverage)
 *     Short: Est. Liquidation = Entry × (1 + 1 ÷ Leverage)
 *     Liquidation Distance % = (1 ÷ Leverage) × 100
 *
 *   Optional Position Size:
 *     Required Margin = Position Size ÷ Leverage
 */

export type Side = "long" | "short";

export interface LeverageInput {
  margin: number;
  leverage: number;
  entry: number;
  side?: Side;
  /** Optional target position size ($). */
  positionSize?: number;
}

export interface LeverageResult {
  side: Side;
  margin: number;
  leverage: number;
  entry: number;
  positionValue: number;
  quantity: number;
  /** Estimated liquidation price */
  estLiquidationPrice: number;
  /** Adverse move % to reach liquidation: (1 / leverage) * 100 */
  liquidationDistancePct: number;
  /** If optional position size is provided */
  targetPositionSize: number | null;
  targetQuantity: number | null;
  requiredMarginForTarget: number | null;
  marginDiff: number | null;
}

export type LeverageOutcome = { ok: true; result: LeverageResult } | { ok: false; error: string };

/** null = input abhi poora nahi; ok:false = galat input, wajah ke saath. */
export function computeLeverage(i: LeverageInput): LeverageOutcome | null {
  const { margin, leverage, entry, side = "long", positionSize } = i;

  const hasMargin = Number.isFinite(margin) && margin > 0;
  const hasPosSize = Number.isFinite(positionSize) && (positionSize as number) > 0;

  if (!Number.isFinite(leverage) || !Number.isFinite(entry)) return null;
  if (!hasMargin && !hasPosSize) return null;

  if (leverage < 1) return { ok: false, error: "Leverage kam se kam 1× hona chahiye." };
  if (leverage > 200) return { ok: false, error: "Leverage 200× se zyada support nahi hai." };
  if (entry <= 0) return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  if (Number.isFinite(margin) && margin < 0) return { ok: false, error: "Margin 0 ya usse bada hona chahiye." };

  let effectiveMargin = hasMargin ? margin : (positionSize as number) / leverage;
  let effectivePosValue = hasMargin ? margin * leverage : (positionSize as number);

  const quantity = effectivePosValue / entry;
  const liquidationDistancePct = (1 / leverage) * 100;

  // Est liquidation price: Long: entry * (1 - 1/leverage); Short: entry * (1 + 1/leverage)
  const liqDrop = entry / leverage;
  const estLiquidationPrice = side === "long" ? Math.max(0, entry - liqDrop) : entry + liqDrop;

  let targetPositionSize: number | null = null;
  let targetQuantity: number | null = null;
  let requiredMarginForTarget: number | null = null;
  let marginDiff: number | null = null;

  if (hasPosSize && hasMargin) {
    targetPositionSize = positionSize as number;
    targetQuantity = targetPositionSize / entry;
    requiredMarginForTarget = targetPositionSize / leverage;
    marginDiff = requiredMarginForTarget - margin;
  }

  return {
    ok: true,
    result: {
      side,
      margin: effectiveMargin,
      leverage,
      entry,
      positionValue: effectivePosValue,
      quantity,
      estLiquidationPrice,
      liquidationDistancePct,
      targetPositionSize,
      targetQuantity,
      requiredMarginForTarget,
      marginDiff,
    },
  };
}
