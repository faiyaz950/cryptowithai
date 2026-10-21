/**
 * DCA (Dollar Cost Averaging) Calculator — Pure Math Engine.
 *
 * Logic:
 *   Total Investment = Σ Investment Amount
 *   Total Quantity   = Σ (Investment Amount / Purchase Price)
 *   Average Entry    = Total Investment / Total Quantity
 *   Current Value    = Total Quantity × Current Price
 *   Unrealized P&L   = Current Value - Total Investment
 *   Return %         = (Unrealized P&L / Total Investment) × 100
 *
 * Example from spec:
 *   ₹10,000 @ ₹100 -> 100 coins
 *   Next ₹10,000 @ ₹80 -> 125 coins
 *   Total: Investment = ₹20,000, Quantity = 225
 *   Average Entry = 20,000 / 225 = ₹88.89
 */

export type DcaFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export interface DcaOrder {
  period: number;
  label: string;
  investment: number;
  price: number;
  quantity: number;
  cumulativeInvestment: number;
  cumulativeQuantity: number;
  averagePrice: number;
}

export interface HistoricalDataset {
  id: string;
  name: string;
  asset: string;
  periodLabel: string;
  prices: number[];
  currentPrice: number;
}

export const HISTORICAL_DATASETS: HistoricalDataset[] = [
  {
    id: "user_example",
    name: "Classic 2-Step (₹100 → ₹80)",
    asset: "COIN",
    periodLabel: "Order",
    prices: [100, 80],
    currentPrice: 95,
  },
  {
    id: "btc_bull_2023_2024",
    name: "Bitcoin 2023–2024 Bull Rally (15 Months)",
    asset: "BTC",
    periodLabel: "Month",
    prices: [
      16540, 23120, 28450, 29200, 27150, 30480, 29230, 25980, 26970, 34650, 37720,
      42260, 43100, 61300, 70800,
    ],
    currentPrice: 66500,
  },
  {
    id: "btc_bear_2022",
    name: "Bitcoin 2022 Bear Market Dip (12 Months)",
    asset: "BTC",
    periodLabel: "Month",
    prices: [
      47100, 43200, 45500, 37800, 29800, 19900, 23300, 20050, 19400, 20500, 16400,
      16540,
    ],
    currentPrice: 65000,
  },
  {
    id: "eth_accumulation",
    name: "Ethereum 2023–2024 Accumulation (14 Months)",
    asset: "ETH",
    periodLabel: "Month",
    prices: [
      1200, 1580, 1640, 1820, 1870, 1890, 1850, 1630, 1670, 1810, 2050, 2280, 2950,
      3520,
    ],
    currentPrice: 3450,
  },
  {
    id: "sol_recovery",
    name: "Solana 2023 Comeback (12 Months)",
    asset: "SOL",
    periodLabel: "Month",
    prices: [
      12, 16, 21, 23, 21, 18, 24, 21, 19, 32, 59, 102,
    ],
    currentPrice: 155,
  },
];

export interface DcaInput {
  initialInvestment?: number;
  initialPrice?: number;
  recurringInvestment: number;
  frequency?: DcaFrequency;
  periods?: number;
  currentPrice?: number;
  nextPrice?: number;
  priceSeries?: number[];
  customOrders?: Array<{ investment: number; price: number }>;
}

export interface DcaResult {
  totalInvestment: number;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  currentValue: number;
  netPnl: number;
  roiPct: number;
  breakEvenPrice: number;
  priceDiscountPct: number;
  frequency: DcaFrequency;
  periodsCount: number;
  orders: DcaOrder[];
  lumpSumQuantity: number;
  lumpSumValue: number;
  lumpSumRoiPct: number;
  dcaAdvantage: number;
}

export type DcaOutcome = { ok: true; result: DcaResult } | { ok: false; error: string };

export function computeDca(i: DcaInput): DcaOutcome | null {
  const {
    initialInvestment,
    initialPrice,
    recurringInvestment,
    frequency = "monthly",
    periods = 1,
    currentPrice: rawCurrentPrice,
    nextPrice,
    priceSeries,
    customOrders,
  } = i;

  const orders: DcaOrder[] = [];
  let cumInv = 0;
  let cumQty = 0;

  // Case 1: Custom price series (e.g. from historical dataset or user entered prices)
  if (Array.isArray(priceSeries) && priceSeries.length > 0) {
    if (!Number.isFinite(recurringInvestment) || recurringInvestment <= 0) {
      return { ok: false, error: "Investment per purchase 0 se bada hona chahiye." };
    }

    priceSeries.forEach((p, idx) => {
      if (Number.isFinite(p) && p > 0) {
        const q = recurringInvestment / p;
        cumInv += recurringInvestment;
        cumQty += q;
        orders.push({
          period: idx + 1,
          label: `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} #${idx + 1}`,
          investment: recurringInvestment,
          price: p,
          quantity: q,
          cumulativeInvestment: cumInv,
          cumulativeQuantity: cumQty,
          averagePrice: cumInv / cumQty,
        });
      }
    });
  }
  // Case 2: Custom multi-step ladder with separate investment & prices
  else if (Array.isArray(customOrders) && customOrders.length > 0) {
    customOrders.forEach((co, idx) => {
      if (Number.isFinite(co.investment) && co.investment > 0 && Number.isFinite(co.price) && co.price > 0) {
        const q = co.investment / co.price;
        cumInv += co.investment;
        cumQty += q;
        orders.push({
          period: idx + 1,
          label: `Buy #${idx + 1}`,
          investment: co.investment,
          price: co.price,
          quantity: q,
          cumulativeInvestment: cumInv,
          cumulativeQuantity: cumQty,
          averagePrice: cumInv / cumQty,
        });
      }
    });
  }
  // Case 3: Initial investment + recurring steps or linear price trajectory
  else {
    const initInv = Number.isFinite(initialInvestment) && (initialInvestment as number) > 0 ? (initialInvestment as number) : 0;
    const initPrice = Number.isFinite(initialPrice) && (initialPrice as number) > 0 ? (initialPrice as number) : 0;

    if (initInv > 0 && initPrice > 0) {
      const initialQty = initInv / initPrice;
      cumInv = initInv;
      cumQty = initialQty;
      orders.push({
        period: 0,
        label: "Initial Buy",
        investment: initInv,
        price: initPrice,
        quantity: initialQty,
        cumulativeInvestment: cumInv,
        cumulativeQuantity: cumQty,
        averagePrice: cumInv / cumQty,
      });
    }

    if (Number.isFinite(recurringInvestment) && recurringInvestment > 0 && periods > 0) {
      const pCount = Math.min(Math.max(1, Math.round(periods)), 60);
      const basePrice = initPrice > 0 ? initPrice : (Number.isFinite(nextPrice) ? (nextPrice as number) : 100);

      for (let p = 1; p <= pCount; p++) {
        let stepPrice = basePrice;
        if (Number.isFinite(nextPrice) && (nextPrice as number) > 0) {
          if (pCount === 1) {
            stepPrice = nextPrice as number;
          } else {
            stepPrice = basePrice + ((nextPrice as number) - basePrice) * (p / pCount);
          }
        }

        const q = recurringInvestment / stepPrice;
        cumInv += recurringInvestment;
        cumQty += q;

        orders.push({
          period: p,
          label: `Period ${p}`,
          investment: recurringInvestment,
          price: stepPrice,
          quantity: q,
          cumulativeInvestment: cumInv,
          cumulativeQuantity: cumQty,
          averagePrice: cumInv / cumQty,
        });
      }
    }
  }

  if (orders.length === 0 || cumInv <= 0 || cumQty <= 0) {
    return null;
  }

  const totalInvestment = cumInv;
  const totalQuantity = cumQty;
  const averagePrice = totalInvestment / totalQuantity;

  const latestPrice = orders[orders.length - 1].price;
  const currentPrice =
    Number.isFinite(rawCurrentPrice) && (rawCurrentPrice as number) > 0
      ? (rawCurrentPrice as number)
      : latestPrice;

  const currentValue = totalQuantity * currentPrice;
  const netPnl = currentValue - totalInvestment;
  const roiPct = totalInvestment > 0 ? (netPnl / totalInvestment) * 100 : 0;
  const breakEvenPrice = averagePrice;
  const initialBuyPrice = orders[0].price;
  const priceDiscountPct =
    initialBuyPrice > 0 ? ((initialBuyPrice - averagePrice) / initialBuyPrice) * 100 : 0;

  // Lump sum comparison: all capital at first order price
  const lumpSumQuantity = totalInvestment / initialBuyPrice;
  const lumpSumValue = lumpSumQuantity * currentPrice;
  const lumpSumNet = lumpSumValue - totalInvestment;
  const lumpSumRoiPct = totalInvestment > 0 ? (lumpSumNet / totalInvestment) * 100 : 0;
  const dcaAdvantage = currentValue - lumpSumValue;

  return {
    ok: true,
    result: {
      totalInvestment,
      totalQuantity,
      averagePrice,
      currentPrice,
      currentValue,
      netPnl,
      roiPct,
      breakEvenPrice,
      priceDiscountPct,
      frequency,
      periodsCount: orders.length,
      orders,
      lumpSumQuantity,
      lumpSumValue,
      lumpSumRoiPct,
      dcaAdvantage,
    },
  };
}
