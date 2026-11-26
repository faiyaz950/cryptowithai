/**
 * Crypto Liquidity Pool Price Impact Calculator — pure math.
 *
 * Purpose: Constant-Product AMM (Uniswap v2 / PancakeSwap / Raydium) DEX pool mein
 * swap size ke basis par estimated output, execution price, price impact % aur
 * minimum received after slippage tolerance calculate karna.
 *
 * Logic — Constant-Product AMM (x × y = k):
 *   Effective Input = Swap Amount × (1 - Pool Fee Rate)
 *   Output Amount = (Reserve Y × Effective Input) / (Reserve X + Effective Input)
 *   Spot Price = Reserve Y / Reserve X (Output per Input)
 *   Average Execution Price = Output Amount / Swap Amount
 *   Price Impact % = (1 - Execution Price / Spot Price) × 100
 *                  = (Effective Input / (Reserve X + Effective Input)) × 100
 *   Pool Fee Amount = Swap Amount × Pool Fee Rate
 *   Minimum Received = Output Amount × (1 - Slippage Tolerance Rate)
 */

export type SwapDirection = "a_to_b" | "b_to_a";

export interface PriceImpactPreset {
  id: string;
  name: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAReserve: number;
  tokenBReserve: number;
  swapAmount: number;
  direction: SwapDirection;
  poolFeePct: number;
  slippageTolerancePct: number;
  note: string;
}

export const PRICE_IMPACT_PRESETS: PriceImpactPreset[] = [
  {
    id: "eth-usdt-large-pool",
    name: "ETH / USDT Deep Liquidity ($50M Pool)",
    tokenASymbol: "USDT",
    tokenBSymbol: "ETH",
    tokenAReserve: 25000000,
    tokenBReserve: 7142.85,
    swapAmount: 50000,
    direction: "a_to_b",
    poolFeePct: 0.3,
    slippageTolerancePct: 0.5,
    note: "$50,000 swap on $25M reserve results in just 0.20% price impact",
  },
  {
    id: "altcoin-mid-pool",
    name: "Mid-Cap DEX Pool ($1M Pool)",
    tokenASymbol: "USDC",
    tokenBSymbol: "TOKEN",
    tokenAReserve: 500000,
    tokenBReserve: 250000,
    swapAmount: 15000,
    direction: "a_to_b",
    poolFeePct: 0.3,
    slippageTolerancePct: 1.0,
    note: "$15,000 swap on $500k reserve incurs 2.91% price impact",
  },
  {
    id: "meme-thin-pool",
    name: "Thin Liquidity Meme Pool ($80k Pool)",
    tokenASymbol: "SOL",
    tokenBSymbol: "MEME",
    tokenAReserve: 250,
    tokenBReserve: 100000000,
    swapAmount: 25,
    direction: "a_to_b",
    poolFeePct: 1.0,
    slippageTolerancePct: 2.5,
    note: "10% of total pool swap causes extreme 9.09% price impact!",
  },
  {
    id: "eth-sell-dump",
    name: "ETH Sell to Stablecoin (B to A)",
    tokenASymbol: "USDC",
    tokenBSymbol: "ETH",
    tokenAReserve: 10000000,
    tokenBReserve: 2857.14,
    swapAmount: 50,
    direction: "b_to_a",
    poolFeePct: 0.3,
    slippageTolerancePct: 0.5,
    note: "Selling 50 ETH into pool for USDC with 1.72% price impact",
  },
];

export interface PriceImpactInput {
  tokenAReserve: number;
  tokenBReserve: number;
  swapAmount: number;
  direction?: SwapDirection;
  poolFeePct?: number;
  slippageTolerancePct?: number;
  tokenASymbol?: string;
  tokenBSymbol?: string;
}

export type ImpactSeverity = "minimal" | "low" | "moderate" | "high" | "extreme";

export interface PriceImpactOutcome {
  tokenAReserve: number;
  tokenBReserve: number;
  swapAmount: number;
  direction: SwapDirection;
  poolFeePct: number;
  slippageTolerancePct: number;
  inputTokenSymbol: string;
  outputTokenSymbol: string;
  inputReserveX: number;
  outputReserveY: number;
  effectiveInput: number;
  outputAmount: number;
  spotPriceOutputPerInput: number;
  spotPriceInputPerOutput: number;
  avgExecutionPrice: number;
  effectiveCostPerUnit: number;
  priceImpactPct: number;
  poolFeeAmount: number;
  minReceivedAfterSlippage: number;
  newInputReserve: number;
  newOutputReserve: number;
  newSpotPriceOutputPerInput: number;
  newSpotPriceInputPerOutput: number;
  severity: ImpactSeverity;
  headlineSummary: string;
}

export function computePriceImpact(
  input: PriceImpactInput
): PriceImpactOutcome | null {
  const {
    tokenAReserve,
    tokenBReserve,
    swapAmount,
    direction = "a_to_b",
    poolFeePct = 0.3,
    slippageTolerancePct = 0.5,
    tokenASymbol = "Token A",
    tokenBSymbol = "Token B",
  } = input;

  if (
    !Number.isFinite(tokenAReserve) ||
    tokenAReserve <= 0 ||
    !Number.isFinite(tokenBReserve) ||
    tokenBReserve <= 0 ||
    !Number.isFinite(swapAmount) ||
    swapAmount <= 0
  ) {
    return null;
  }

  const validFeePct = Math.max(0, Math.min(10, Number.isFinite(poolFeePct) ? poolFeePct : 0.3));
  const validSlippagePct = Math.max(
    0,
    Math.min(50, Number.isFinite(slippageTolerancePct) ? slippageTolerancePct : 0.5)
  );

  // Determine which is input reserve (X) and which is output reserve (Y)
  const isAtoB = direction === "a_to_b";
  const inputReserveX = isAtoB ? tokenAReserve : tokenBReserve;
  const outputReserveY = isAtoB ? tokenBReserve : tokenAReserve;
  const inputTokenSymbol = isAtoB ? tokenASymbol : tokenBSymbol;
  const outputTokenSymbol = isAtoB ? tokenBSymbol : tokenASymbol;

  // Fee deduction
  const feeRate = validFeePct / 100;
  const effectiveInput = swapAmount * (1 - feeRate);

  // Constant product formula: dy = (Y * dx_eff) / (X + dx_eff)
  const outputAmount = (outputReserveY * effectiveInput) / (inputReserveX + effectiveInput);

  if (!Number.isFinite(outputAmount) || outputAmount <= 0) {
    return null;
  }

  // Pre-swap spot price
  const spotPriceOutputPerInput = outputReserveY / inputReserveX;
  const spotPriceInputPerOutput = inputReserveX / outputReserveY;

  // Average execution price = Output / Input
  const avgExecutionPrice = outputAmount / swapAmount;
  const effectiveCostPerUnit = swapAmount / outputAmount;

  // Price impact % = (1 - (avgExecutionPrice / spotPriceOutputPerInput)) * 100
  // Equivalent in AMM: effectiveInput / (inputReserveX + effectiveInput) * 100
  const priceImpactPct =
    (1 - avgExecutionPrice / spotPriceOutputPerInput) * 100;

  // Pool fee paid in input token
  const poolFeeAmount = swapAmount * feeRate;

  // Minimum received after slippage tolerance
  const minReceivedAfterSlippage =
    outputAmount * (1 - validSlippagePct / 100);

  // Post-swap pool state
  const newInputReserve = inputReserveX + swapAmount;
  const newOutputReserve = outputReserveY - outputAmount;
  const newSpotPriceOutputPerInput =
    newOutputReserve > 0 ? newOutputReserve / newInputReserve : 0;
  const newSpotPriceInputPerOutput =
    newOutputReserve > 0 ? newInputReserve / newOutputReserve : 0;

  // Severity rating
  let severity: ImpactSeverity = "low";
  if (priceImpactPct < 0.5) severity = "minimal";
  else if (priceImpactPct < 1.5) severity = "low";
  else if (priceImpactPct < 3.0) severity = "moderate";
  else if (priceImpactPct < 5.0) severity = "high";
  else severity = "extreme";

  let headlineSummary = "";
  if (severity === "extreme") {
    headlineSummary = `DANGER: Extreme price impact of ${priceImpactPct.toFixed(2)}%! Swap size is too large for current pool depth.`;
  } else if (severity === "high") {
    headlineSummary = `High price impact: ${priceImpactPct.toFixed(2)}%. Consider routing or splitting into smaller swaps.`;
  } else {
    headlineSummary = `Estimated Output: ${outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outputTokenSymbol} (${priceImpactPct.toFixed(2)}% price impact).`;
  }

  return {
    tokenAReserve,
    tokenBReserve,
    swapAmount,
    direction,
    poolFeePct: validFeePct,
    slippageTolerancePct: validSlippagePct,
    inputTokenSymbol,
    outputTokenSymbol,
    inputReserveX,
    outputReserveY,
    effectiveInput,
    outputAmount,
    spotPriceOutputPerInput,
    spotPriceInputPerOutput,
    avgExecutionPrice,
    effectiveCostPerUnit,
    priceImpactPct,
    poolFeeAmount,
    minReceivedAfterSlippage,
    newInputReserve,
    newOutputReserve,
    newSpotPriceOutputPerInput,
    newSpotPriceInputPerOutput,
    severity,
    headlineSummary,
  };
}
