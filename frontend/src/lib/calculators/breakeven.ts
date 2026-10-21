/**
 * Break-even Price Calculator — Pure Math Engine.
 *
 *   Long : Break-even Exit = (Entry × (1 + Entry Fee) + Other Costs / Quantity) ÷ (1 − Exit Fee)
 *   Short: Break-even Exit = (Entry × (1 − Entry Fee) - Other Costs / Quantity) ÷ (1 + Exit Fee)
 *
 * Example from spec:
 *   Entry = $100, Entry Fee = 0.1%, Exit Fee = 0.1%
 *   Break-even = 100 × (1 + 0.001) / (1 - 0.001) = $100.20
 *
 * Supports exchange fee structures (Binance, Bybit, OKX, Delta Exchange) and other costs (funding/slippage).
 */

export type Side = "long" | "short";
export type ExchangePreset =
  | "custom"
  | "spot_standard"
  | "binance_futures"
  | "bybit_futures"
  | "okx_futures"
  | "delta_futures";

export interface ExchangeFeeProfile {
  id: ExchangePreset;
  name: string;
  makerFeePct: number;
  takerFeePct: number;
}

export const FEE_PRESETS: Record<ExchangePreset, ExchangeFeeProfile> = {
  custom: {
    id: "custom",
    name: "Custom",
    makerFeePct: 0.1,
    takerFeePct: 0.1,
  },
  spot_standard: {
    id: "spot_standard",
    name: "Spot Standard (0.10%)",
    makerFeePct: 0.1,
    takerFeePct: 0.1,
  },
  binance_futures: {
    id: "binance_futures",
    name: "Binance Futures (VIP 0)",
    makerFeePct: 0.02,
    takerFeePct: 0.05,
  },
  bybit_futures: {
    id: "bybit_futures",
    name: "Bybit Futures (VIP 0)",
    makerFeePct: 0.02,
    takerFeePct: 0.055,
  },
  okx_futures: {
    id: "okx_futures",
    name: "OKX Futures (VIP 0)",
    makerFeePct: 0.02,
    takerFeePct: 0.05,
  },
  delta_futures: {
    id: "delta_futures",
    name: "Delta Exchange",
    makerFeePct: 0.02,
    takerFeePct: 0.05,
  },
};

export interface BreakEvenInput {
  side: Side;
  entry: number;
  entryFeePct: number;
  exitFeePct: number;
  quantity?: number;
  otherCosts?: number;
}

export interface BreakEvenResult {
  side: Side;
  entry: number;
  quantity: number;
  entryFeePct: number;
  exitFeePct: number;
  totalFeePct: number;
  otherCosts: number;
  breakevenPrice: number;
  breakevenReturnPct: number;
  priceDiff: number;
  priceDiffPct: number;
  entryCost: number;
  entryFee: number;
  exitFee: number;
  totalFees: number;
  grossPnlAtBreakeven: number;
  netPnlAtBreakeven: number;
}

export type BreakEvenOutcome = { ok: true; result: BreakEvenResult } | { ok: false; error: string };

export function computeBreakEven(i: BreakEvenInput): BreakEvenOutcome | null {
  const { side, entry, entryFeePct, exitFeePct, quantity: rawQty = 1, otherCosts: rawOther = 0 } = i;

  if (!Number.isFinite(entry) || !Number.isFinite(entryFeePct) || !Number.isFinite(exitFeePct)) return null;
  if (entry <= 0) return { ok: false, error: "Entry price 0 se bada hona chahiye." };
  if (entryFeePct < 0 || exitFeePct < 0) return { ok: false, error: "Fee negative nahi ho sakti." };
  if (entryFeePct >= 50 || exitFeePct >= 50) return { ok: false, error: "Fee 50% se zyada nahi ho sakti." };

  const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
  const otherCosts = Number.isFinite(rawOther) && rawOther >= 0 ? rawOther : 0;
  const fEntry = entryFeePct / 100;
  const fExit = exitFeePct / 100;

  // Long: (Exit*(1 - fExit) - Entry*(1 + fEntry))*qty - otherCosts = 0
  //   => Exit = (Entry*(1 + fEntry) + otherCosts/qty) / (1 - fExit)
  // Short: (Entry*(1 - fEntry) - Exit*(1 + fExit))*qty - otherCosts = 0
  //   => Exit = (Entry*(1 - fEntry) - otherCosts/qty) / (1 + fExit)
  let breakevenPrice: number;
  if (side === "long") {
    breakevenPrice = (entry * (1 + fEntry) + otherCosts / qty) / (1 - fExit);
  } else {
    breakevenPrice = (entry * (1 - fEntry) - otherCosts / qty) / (1 + fExit);
  }

  const priceDiff = breakevenPrice - entry;
  const priceDiffPct = ((breakevenPrice - entry) / entry) * 100;
  const breakevenReturnPct = Math.abs(priceDiffPct);
  const totalFeePct = entryFeePct + exitFeePct;

  const entryCost = entry * qty;
  const entryFee = entryCost * fEntry;
  const exitValue = breakevenPrice * qty;
  const exitFee = exitValue * fExit;
  const totalFees = entryFee + exitFee;

  const grossPnl = side === "long" ? exitValue - entryCost : entryCost - exitValue;
  const netPnl = grossPnl - totalFees - otherCosts;

  return {
    ok: true,
    result: {
      side,
      entry,
      quantity: qty,
      entryFeePct,
      exitFeePct,
      totalFeePct,
      otherCosts,
      breakevenPrice,
      breakevenReturnPct,
      priceDiff,
      priceDiffPct,
      entryCost,
      entryFee,
      exitFee,
      totalFees,
      grossPnlAtBreakeven: grossPnl,
      netPnlAtBreakeven: netPnl,
    },
  };
}
