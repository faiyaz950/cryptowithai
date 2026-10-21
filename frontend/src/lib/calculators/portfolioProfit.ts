/**
 * Crypto Portfolio Profit Calculator — pure math.
 *
 * Purpose: Multiple coins ke portfolio ka total profit/loss calculate karna.
 *
 * Logic:
 *   Invested Value = Quantity × Average Buy Price
 *   Current Value  = Quantity × Current Price
 *   Unrealized P&L = Current Value - Invested Value
 *   Portfolio Return % = Total Unrealized P&L / Total Invested Value × 100
 */

export interface PortfolioCoinItem {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
}

export interface CoinProfitItem {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  roiPct: number;
  allocationPct: number;
}

export interface PortfolioProfitResult {
  items: CoinProfitItem[];
  totalInvested: number;
  currentValue: number;
  totalPnl: number;
  portfolioRoiPct: number;
  bestPerformer: CoinProfitItem | null;
  worstPerformer: CoinProfitItem | null;
  coinCount: number;
}

export type PortfolioProfitOutcome =
  | { ok: true; result: PortfolioProfitResult }
  | { ok: false; error: string };

export function computePortfolioProfit(coins: PortfolioCoinItem[]): PortfolioProfitOutcome | null {
  if (!Array.isArray(coins) || coins.length === 0) return null;

  const validItems = coins.filter(
    (c) =>
      c.symbol.trim() !== "" &&
      Number.isFinite(c.quantity) &&
      c.quantity > 0 &&
      Number.isFinite(c.buyPrice) &&
      c.buyPrice > 0 &&
      Number.isFinite(c.currentPrice) &&
      c.currentPrice > 0,
  );

  if (validItems.length === 0) {
    return { ok: false, error: "Kam se kam ek valid coin (quantity aur prices > 0) enter karein." };
  }

  let totalInvested = 0;
  let totalCurrentValue = 0;

  const intermediate = validItems.map((c) => {
    const invested = c.quantity * c.buyPrice;
    const current = c.quantity * c.currentPrice;
    const pnl = current - invested;
    const roi = invested > 0 ? (pnl / invested) * 100 : 0;
    totalInvested += invested;
    totalCurrentValue += current;
    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      quantity: c.quantity,
      buyPrice: c.buyPrice,
      currentPrice: c.currentPrice,
      investedValue: invested,
      currentValue: current,
      pnl,
      roiPct: roi,
      allocationPct: 0, // will compute below
    };
  });

  const items: CoinProfitItem[] = intermediate.map((it) => ({
    ...it,
    allocationPct: totalCurrentValue > 0 ? (it.currentValue / totalCurrentValue) * 100 : 0,
  }));

  const totalPnl = totalCurrentValue - totalInvested;
  const portfolioRoiPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Best and worst performer by ROI %
  let bestPerformer: CoinProfitItem | null = null;
  let worstPerformer: CoinProfitItem | null = null;

  if (items.length > 0) {
    bestPerformer = [...items].sort((a, b) => b.roiPct - a.roiPct)[0];
    worstPerformer = [...items].sort((a, b) => a.roiPct - b.roiPct)[0];
  }

  return {
    ok: true,
    result: {
      items,
      totalInvested,
      currentValue: totalCurrentValue,
      totalPnl,
      portfolioRoiPct,
      bestPerformer,
      worstPerformer,
      coinCount: items.length,
    },
  };
}
