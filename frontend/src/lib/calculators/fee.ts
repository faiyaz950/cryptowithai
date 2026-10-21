/**
 * Crypto Fee Calculator — Pure Math Engine.
 *
 *   Buy Value  = Buy Price × Quantity
 *   Sell Value = Sell Price × Quantity
 *   Buy Fee    = Buy Value × Buy Fee %
 *   Sell Fee   = Sell Value × Sell Fee %
 *   Total Fees = Buy Fee + Sell Fee
 *   Gross P&L  = Sell Value − Buy Value
 *   Net P&L    = Gross P&L − Total Fees
 */

export type OrderRole = "maker" | "taker";

export interface ExchangeFeeTier {
  id: string;
  name: string;
  makerPct: number;
  takerPct: number;
}

export const COMMON_FEE_PRESETS: ExchangeFeeTier[] = [
  { id: "binance_futures", name: "Binance Futures (0.02% / 0.05%)", makerPct: 0.02, takerPct: 0.05 },
  { id: "bybit_futures", name: "Bybit Futures (0.02% / 0.055%)", makerPct: 0.02, takerPct: 0.055 },
  { id: "okx_futures", name: "OKX Futures (0.02% / 0.05%)", makerPct: 0.02, takerPct: 0.05 },
  { id: "delta_futures", name: "Delta Exchange (0.02% / 0.05%)", makerPct: 0.02, takerPct: 0.05 },
  { id: "binance_spot", name: "Binance Spot (0.10% / 0.10%)", makerPct: 0.10, takerPct: 0.10 },
  { id: "coinbase", name: "Coinbase Adv (0.40% / 0.60%)", makerPct: 0.40, takerPct: 0.60 },
];

export interface FeeInput {
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  makerFeePct: number;
  takerFeePct: number;
  buyRole: OrderRole;
  sellRole: OrderRole;
}

export interface FeeResult {
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  buyValue: number;
  sellValue: number;
  buyFeePct: number;
  sellFeePct: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  effectiveFeePct: number;
  grossPnl: number;
  netPnl: number;
  roiPct: number;
  feeShareOfGrossPct: number | null;
  breakevenSellPrice: number;
}

export type FeeOutcome = { ok: true; result: FeeResult } | { ok: false; error: string };

export function computeCryptoFee(i: FeeInput): FeeOutcome | null {
  const { buyPrice, sellPrice, quantity, makerFeePct, takerFeePct, buyRole, sellRole } = i;

  if (![buyPrice, sellPrice, quantity, makerFeePct, takerFeePct].every(Number.isFinite)) return null;

  if (buyPrice <= 0) return { ok: false, error: "Buy price 0 se bada hona chahiye." };
  if (sellPrice <= 0) return { ok: false, error: "Sell price 0 se bada hona chahiye." };
  if (quantity <= 0) return { ok: false, error: "Quantity 0 se badi honi chahiye." };
  if (makerFeePct < 0 || takerFeePct < 0) return { ok: false, error: "Fees negative nahi ho sakti." };
  if (makerFeePct >= 50 || takerFeePct >= 50) return { ok: false, error: "Fees 50% se zyada nahi ho sakti." };

  const buyFeePct = buyRole === "maker" ? makerFeePct : takerFeePct;
  const sellFeePct = sellRole === "maker" ? makerFeePct : takerFeePct;

  const buyValue = buyPrice * quantity;
  const sellValue = sellPrice * quantity;

  const buyFee = buyValue * (buyFeePct / 100);
  const sellFee = sellValue * (sellFeePct / 100);
  const totalFees = buyFee + sellFee;

  const grossPnl = sellValue - buyValue;
  const netPnl = grossPnl - totalFees;
  const roiPct = buyValue > 0 ? (netPnl / buyValue) * 100 : 0;
  const effectiveFeePct = buyValue > 0 ? (totalFees / buyValue) * 100 : 0;

  const feeShareOfGrossPct = grossPnl > 0 ? (totalFees / grossPnl) * 100 : null;

  const breakevenSellPrice = buyPrice * ((1 + buyFeePct / 100) / (1 - sellFeePct / 100));

  return {
    ok: true,
    result: {
      buyPrice,
      sellPrice,
      quantity,
      buyValue,
      sellValue,
      buyFeePct,
      sellFeePct,
      buyFee,
      sellFee,
      totalFees,
      effectiveFeePct,
      grossPnl,
      netPnl,
      roiPct,
      feeShareOfGrossPct,
      breakevenSellPrice,
    },
  };
}
