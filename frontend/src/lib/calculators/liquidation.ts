/**
 * Liquidation Price Calculator — Exchange-Specific Futures Engine.
 *
 * Supports Binance, Bybit, OKX, and Delta Exchange.
 * Handles both Isolated and Cross margin modes, maintenance margin rates (MMR),
 * position tiers, and bankruptcy price calculations.
 *
 * Formulas:
 *   Isolated Margin (Long):
 *     Liquidation Price ≈ Entry × (1 − 1/Leverage + MMR)
 *     or: Entry − (Margin / Quantity) + (Entry × MMR)
 *
 *   Isolated Margin (Short):
 *     Liquidation Price ≈ Entry × (1 + 1/Leverage − MMR)
 *     or: Entry + (Margin / Quantity) − (Entry × MMR)
 *
 *   Cross Margin (Long):
 *     Liquidation Price ≈ Entry − (Available Margin / Quantity) + (Entry × MMR)
 *
 *   Cross Margin (Short):
 *     Liquidation Price ≈ Entry + (Available Margin / Quantity) − (Entry × MMR)
 *
 *   Bankruptcy Price:
 *     Long : Entry × (1 − 1/Leverage)
 *     Short: Entry × (1 + 1/Leverage)
 */

export type Side = "long" | "short";
export type MarginMode = "isolated" | "cross";
export type ExchangeId = "binance" | "bybit" | "okx" | "delta";

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  defaultMmr: number; // in percent, e.g. 0.5
  defaultFeePct: number; // maker/taker fee
  maxLeverage: number;
  pairMmr: Record<string, number>; // pair -> default MMR%
  tierInfo: string;
}

export const EXCHANGES: Record<ExchangeId, ExchangeConfig> = {
  binance: {
    id: "binance",
    name: "Binance Futures",
    defaultMmr: 0.5,
    defaultFeePct: 0.05,
    maxLeverage: 125,
    pairMmr: {
      "BTC/USDT": 0.4,
      "ETH/USDT": 0.5,
      "SOL/USDT": 1.0,
      "BNB/USDT": 0.65,
    },
    tierInfo: "Tier 1: < $50,000 notional (Base MMR 0.4% - 0.5%)",
  },
  bybit: {
    id: "bybit",
    name: "Bybit",
    defaultMmr: 0.5,
    defaultFeePct: 0.055,
    maxLeverage: 100,
    pairMmr: {
      "BTC/USDT": 0.5,
      "ETH/USDT": 0.5,
      "SOL/USDT": 1.0,
      "XRP/USDT": 1.0,
    },
    tierInfo: "Tier 1: < $50,000 notional (Base MMR 0.5%)",
  },
  okx: {
    id: "okx",
    name: "OKX",
    defaultMmr: 0.4,
    defaultFeePct: 0.05,
    maxLeverage: 100,
    pairMmr: {
      "BTC/USDT": 0.4,
      "ETH/USDT": 0.5,
      "SOL/USDT": 1.0,
    },
    tierInfo: "Tier 1: < $100,000 notional (Base MMR 0.4%)",
  },
  delta: {
    id: "delta",
    name: "Delta Exchange",
    defaultMmr: 0.5,
    defaultFeePct: 0.05,
    maxLeverage: 100,
    pairMmr: {
      "BTC/USDT": 0.5,
      "ETH/USDT": 0.5,
      "SOL/USDT": 1.0,
    },
    tierInfo: "Tier 1: < $50,000 notional (Base MMR 0.5%)",
  },
};

export const COMMON_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "Custom"];

export interface LiquidationInput {
  exchange: ExchangeId;
  pair?: string;
  side: Side;
  marginMode: MarginMode;
  entry: number;
  leverage: number;
  /** Position size in USD (position value) or coins. */
  positionValue?: number;
  quantity?: number;
  /** Margin allocated (Isolated: position margin; Cross: wallet balance). */
  margin?: number;
  /** Maintenance margin rate in percent, e.g. 0.5 */
  mmrPct?: number;
}

export interface LiquidationResult {
  exchange: ExchangeId;
  exchangeName: string;
  pair: string;
  side: Side;
  marginMode: MarginMode;
  entry: number;
  leverage: number;
  positionValue: number;
  quantity: number;
  margin: number;
  mmrPct: number;
  mmrAmount: number;
  estLiquidationPrice: number;
  distance: number;
  distancePct: number;
  bankruptcyPrice: number;
  isSafe: boolean; // true if liquidation is not possible or very far
}

export type LiquidationOutcome = { ok: true; result: LiquidationResult } | { ok: false; error: string };

export function computeLiquidation(i: LiquidationInput): LiquidationOutcome | null {
  const {
    exchange,
    pair = "BTC/USDT",
    side,
    marginMode,
    entry,
    leverage,
    positionValue: rawPosValue,
    quantity: rawQty,
    margin: rawMargin,
    mmrPct: rawMmrPct,
  } = i;

  if (!Number.isFinite(entry) || !Number.isFinite(leverage)) return null;
  if (entry <= 0) return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  if (leverage < 1) return { ok: false, error: "Leverage kam se kam 1× hona chahiye." };

  const exConfig = EXCHANGES[exchange] ?? EXCHANGES.binance;
  if (leverage > exConfig.maxLeverage) {
    return { ok: false, error: `${exConfig.name} par adhiktam leverage ${exConfig.maxLeverage}× hai.` };
  }

  // Determine MMR %
  const mmrPct = Number.isFinite(rawMmrPct) && (rawMmrPct as number) >= 0
    ? (rawMmrPct as number)
    : (exConfig.pairMmr[pair] ?? exConfig.defaultMmr);
  const mmr = mmrPct / 100;

  // Resolve Position Value, Quantity, and Margin
  let positionValue: number;
  let quantity: number;

  if (Number.isFinite(rawPosValue) && (rawPosValue as number) > 0) {
    positionValue = rawPosValue as number;
    quantity = positionValue / entry;
  } else if (Number.isFinite(rawQty) && (rawQty as number) > 0) {
    quantity = rawQty as number;
    positionValue = quantity * entry;
  } else if (Number.isFinite(rawMargin) && (rawMargin as number) > 0) {
    // If only margin is provided
    positionValue = (rawMargin as number) * leverage;
    quantity = positionValue / entry;
  } else {
    // Default fallback position value if none provided
    positionValue = 1000 * leverage;
    quantity = positionValue / entry;
  }

  // Margin determination
  const requiredInitialMargin = positionValue / leverage;
  let margin: number;

  if (marginMode === "isolated") {
    margin = Number.isFinite(rawMargin) && (rawMargin as number) > 0
      ? (rawMargin as number)
      : requiredInitialMargin;
  } else {
    // Cross margin: requires wallet balance
    margin = Number.isFinite(rawMargin) && (rawMargin as number) > 0
      ? (rawMargin as number)
      : requiredInitialMargin;
  }

  const mmrAmount = positionValue * mmr;

  // Bankruptcy price (where equity is strictly 0)
  const bankruptcyPrice = side === "long"
    ? Math.max(0, entry - margin / quantity)
    : entry + margin / quantity;

  // Liquidation Price calculation:
  // Long : Entry − (Margin / Qty) + (Entry × MMR)
  // Short: Entry + (Margin / Qty) − (Entry × MMR)
  let estLiquidationPrice: number;
  if (side === "long") {
    estLiquidationPrice = entry - margin / quantity + entry * mmr;
  } else {
    estLiquidationPrice = entry + margin / quantity - entry * mmr;
  }

  // Edge cases
  let isSafe = false;
  if (side === "long" && estLiquidationPrice <= 0) {
    estLiquidationPrice = 0;
    isSafe = true;
  }

  const distance = Math.abs(entry - estLiquidationPrice);
  const distancePct = (distance / entry) * 100;

  return {
    ok: true,
    result: {
      exchange,
      exchangeName: exConfig.name,
      pair,
      side,
      marginMode,
      entry,
      leverage,
      positionValue,
      quantity,
      margin,
      mmrPct,
      mmrAmount,
      estLiquidationPrice,
      distance,
      distancePct,
      bankruptcyPrice,
      isSafe,
    },
  };
}
