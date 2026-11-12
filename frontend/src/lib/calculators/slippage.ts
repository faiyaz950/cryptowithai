/**
 * Crypto Slippage Calculator — pure math.
 *
 * Purpose: Order place karte waqt expected price aur actual execution price ke beech
 * ka difference, slippage percentage, absolute cost aur fees-adjusted total calculate karna.
 *
 * Logic:
 *   Slippage % = ((Execution Price - Expected Price) / Expected Price) × 100
 *   Slippage Cost = |Execution Price - Expected Price| × Quantity
 *   Expected Value = Expected Price × Quantity
 *   Execution Value = Execution Price × Quantity
 *   Fee Amount = Execution Value × (Fee % / 100)
 */

export type TradeSide = "buy" | "sell";

export interface SlippagePreset {
  id: string;
  name: string;
  side: TradeSide;
  expectedPrice: number;
  executionPrice: number;
  quantity: number;
  feePct: number;
  isEstimate: boolean;
  note: string;
}

export const SLIPPAGE_PRESETS: SlippagePreset[] = [
  {
    id: "btc-spot-buy",
    name: "BTC Spot Market Buy",
    side: "buy",
    expectedPrice: 65000,
    executionPrice: 65120,
    quantity: 0.5,
    feePct: 0.1,
    isEstimate: false,
    note: "High liquidity orderbook execution (0.18% slippage)",
  },
  {
    id: "dex-meme-swap",
    name: "DEX Altcoin Swap (Low Liquidity)",
    side: "buy",
    expectedPrice: 0.0045,
    executionPrice: 0.00485,
    quantity: 500000,
    feePct: 0.3,
    isEstimate: true,
    note: "Thin liquidity pool swap with 7.78% price slippage",
  },
  {
    id: "eth-market-sell",
    name: "ETH Market Sell Dip",
    side: "sell",
    expectedPrice: 3500,
    executionPrice: 3465,
    quantity: 4,
    feePct: 0.075,
    isEstimate: false,
    note: "Fast dump sell execution (-1.00% unfavorable slippage)",
  },
  {
    id: "favorable-fill",
    name: "Limit Order Price Improvement",
    side: "buy",
    expectedPrice: 150,
    executionPrice: 148.8,
    quantity: 20,
    feePct: 0.05,
    isEstimate: false,
    note: "Positive price improvement (0.80% favorable fill)",
  },
];

export interface SlippageInput {
  expectedPrice: number;
  executionPrice: number;
  quantity: number;
  side: TradeSide;
  feePct?: number;
  isEstimate?: boolean;
}

export type SlippageSeverity = "minimal" | "normal" | "moderate" | "high";

export interface SlippageOutcome {
  expectedPrice: number;
  executionPrice: number;
  quantity: number;
  side: TradeSide;
  isEstimate: boolean;
  priceDiff: number;
  slippagePct: number;
  absoluteSlippageCost: number;
  isFavorable: boolean;
  favorableOrUnfavorable: "favorable" | "unfavorable" | "zero";
  expectedOrderValue: number;
  executionOrderValue: number;
  feePct: number;
  feeAmount: number;
  totalEffectiveCost: number;
  totalCostImpact: number;
  severity: SlippageSeverity;
  headlineSummary: string;
}

export function computeSlippage(input: SlippageInput): SlippageOutcome | null {
  const {
    expectedPrice,
    executionPrice,
    quantity,
    side,
    feePct = 0,
    isEstimate = false,
  } = input;

  if (
    !Number.isFinite(expectedPrice) ||
    expectedPrice <= 0 ||
    !Number.isFinite(executionPrice) ||
    executionPrice <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  const validFeePct = Math.max(0, Number.isFinite(feePct) ? feePct : 0);
  const priceDiff = executionPrice - expectedPrice;
  const slippagePct = (priceDiff / expectedPrice) * 100;
  const absoluteSlippageCost = Math.abs(priceDiff) * quantity;

  // Direction logic:
  // For BUY: execution > expected means paying MORE (unfavorable). execution < expected is price improvement (favorable).
  // For SELL: execution < expected means receiving LESS (unfavorable). execution > expected is receiving MORE (favorable).
  let isFavorable = false;
  let favorableOrUnfavorable: "favorable" | "unfavorable" | "zero" = "zero";

  if (Math.abs(priceDiff) < 1e-9) {
    isFavorable = false;
    favorableOrUnfavorable = "zero";
  } else if (side === "buy") {
    if (executionPrice < expectedPrice) {
      isFavorable = true;
      favorableOrUnfavorable = "favorable";
    } else {
      isFavorable = false;
      favorableOrUnfavorable = "unfavorable";
    }
  } else {
    // side === "sell"
    if (executionPrice > expectedPrice) {
      isFavorable = true;
      favorableOrUnfavorable = "favorable";
    } else {
      isFavorable = false;
      favorableOrUnfavorable = "unfavorable";
    }
  }

  const expectedOrderValue = expectedPrice * quantity;
  const executionOrderValue = executionPrice * quantity;
  const feeAmount = executionOrderValue * (validFeePct / 100);

  // Total effective cost:
  // For Buy: user spent executionOrderValue + feeAmount
  // For Sell: user received executionOrderValue - feeAmount
  const totalEffectiveCost =
    side === "buy"
      ? executionOrderValue + feeAmount
      : executionOrderValue - feeAmount;

  // Total cost impact vs expected (slippage loss + trading fee)
  const totalCostImpact = absoluteSlippageCost + feeAmount;

  const absSlippagePct = Math.abs(slippagePct);
  let severity: SlippageSeverity = "normal";
  if (absSlippagePct <= 0.05) severity = "minimal";
  else if (absSlippagePct <= 0.3) severity = "normal";
  else if (absSlippagePct <= 1.0) severity = "moderate";
  else severity = "high";

  let headlineSummary = "";
  if (favorableOrUnfavorable === "zero") {
    headlineSummary = "Zero slippage: Order filled at exact expected price.";
  } else if (favorableOrUnfavorable === "favorable") {
    headlineSummary = `Positive slippage! You saved ${absoluteSlippageCost.toFixed(2)} (${absSlippagePct.toFixed(2)}% price improvement).`;
  } else {
    headlineSummary = `Unfavorable slippage cost: ${absoluteSlippageCost.toFixed(2)} (${absSlippagePct.toFixed(2)}% worse execution).`;
  }

  return {
    expectedPrice,
    executionPrice,
    quantity,
    side,
    isEstimate,
    priceDiff,
    slippagePct,
    absoluteSlippageCost,
    isFavorable,
    favorableOrUnfavorable,
    expectedOrderValue,
    executionOrderValue,
    feePct: validFeePct,
    feeAmount,
    totalEffectiveCost,
    totalCostImpact,
    severity,
    headlineSummary,
  };
}
