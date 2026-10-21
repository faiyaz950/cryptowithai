/**
 * Average Entry Price Calculator — Pure Math Engine.
 *
 *   Average Entry = Σ(Price × Quantity) ÷ Σ(Quantity)
 *
 * Example from spec:
 *   Price  | Quantity
 *   100    | 1
 *   90     | 2
 *   80     | 3
 *
 *   Total Cost = (100×1 + 90×2 + 80×3) = 100 + 180 + 240 = 520
 *   Total Quantity = 1 + 2 + 3 = 6
 *   Average Entry = 520 / 6 = $86.67
 */

export interface PurchaseItem {
  id: string;
  price: number;
  quantity: number;
  cost: number;
  weightPct: number;
}

export interface AverageEntryInput {
  purchases: Array<{ price: number; quantity: number }>;
  currentPrice?: number;
}

export interface AverageEntryResult {
  totalCost: number;
  totalQuantity: number;
  averagePrice: number;
  highestPrice: number;
  lowestPrice: number;
  items: PurchaseItem[];
  currentPrice?: number;
  currentValue?: number;
  netPnl?: number;
  roiPct?: number;
  breakEvenPrice: number;
}

export type AverageEntryOutcome = { ok: true; result: AverageEntryResult } | { ok: false; error: string };

export function computeAverageEntry(i: AverageEntryInput): AverageEntryOutcome | null {
  const { purchases, currentPrice: rawCurrentPrice } = i;

  const validPurchases = purchases.filter(
    (p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.quantity) && p.quantity > 0,
  );

  if (validPurchases.length === 0) return null;

  let totalCost = 0;
  let totalQuantity = 0;
  let highestPrice = -Infinity;
  let lowestPrice = Infinity;

  for (const p of validPurchases) {
    totalCost += p.price * p.quantity;
    totalQuantity += p.quantity;
    if (p.price > highestPrice) highestPrice = p.price;
    if (p.price < lowestPrice) lowestPrice = p.price;
  }

  if (totalQuantity <= 0) return { ok: false, error: "Total quantity 0 se badi honi chahiye." };

  const averagePrice = totalCost / totalQuantity;

  const items: PurchaseItem[] = validPurchases.map((p, idx) => ({
    id: `p-${idx + 1}`,
    price: p.price,
    quantity: p.quantity,
    cost: p.price * p.quantity,
    weightPct: totalQuantity > 0 ? (p.quantity / totalQuantity) * 100 : 0,
  }));

  const hasCurrentPrice = Number.isFinite(rawCurrentPrice) && (rawCurrentPrice as number) > 0;
  const currentPrice = hasCurrentPrice ? (rawCurrentPrice as number) : undefined;
  const currentValue = currentPrice != null ? totalQuantity * currentPrice : undefined;
  const netPnl = currentValue != null ? currentValue - totalCost : undefined;
  const roiPct = netPnl != null && totalCost > 0 ? (netPnl / totalCost) * 100 : undefined;

  return {
    ok: true,
    result: {
      totalCost,
      totalQuantity,
      averagePrice,
      highestPrice,
      lowestPrice,
      items,
      currentPrice,
      currentValue,
      netPnl,
      roiPct,
      breakEvenPrice: averagePrice,
    },
  };
}
