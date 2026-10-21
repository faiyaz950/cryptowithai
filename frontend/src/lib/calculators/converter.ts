/**
 * Crypto Converter — pure math and live rates engine.
 *
 * Converted Amount = Input Amount × Conversion Rate
 * Estimated Fee    = Converted Amount × (Fee % / 100)
 * Amount After Fee = Converted Amount - Estimated Fee
 */

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  isFiat?: boolean;
  defaultPriceUsd: number;
}

export const SUPPORTED_CURRENCIES: CurrencyItem[] = [
  // Major Cryptos
  { code: "BTC", name: "Bitcoin", symbol: "₿", defaultPriceUsd: 66500 },
  { code: "ETH", name: "Ethereum", symbol: "Ξ", defaultPriceUsd: 3450 },
  { code: "SOL", name: "Solana", symbol: "SOL", defaultPriceUsd: 155 },
  { code: "USDT", name: "Tether USD", symbol: "$", defaultPriceUsd: 1.0 },
  { code: "USDC", name: "USD Coin", symbol: "$", defaultPriceUsd: 1.0 },
  { code: "BNB", name: "BNB", symbol: "BNB", defaultPriceUsd: 585 },
  { code: "XRP", name: "Ripple", symbol: "XRP", defaultPriceUsd: 0.55 },
  { code: "DOGE", name: "Dogecoin", symbol: "Ð", defaultPriceUsd: 0.12 },
  { code: "ADA", name: "Cardano", symbol: "ADA", defaultPriceUsd: 0.35 },
  { code: "AVAX", name: "Avalanche", symbol: "AVAX", defaultPriceUsd: 28.5 },
  { code: "LINK", name: "Chainlink", symbol: "LINK", defaultPriceUsd: 12.0 },
  { code: "SUI", name: "Sui", symbol: "SUI", defaultPriceUsd: 2.1 },
  // Fiats
  { code: "USD", name: "US Dollar", symbol: "$", isFiat: true, defaultPriceUsd: 1.0 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", isFiat: true, defaultPriceUsd: 1 / 87.0 },
  { code: "EUR", name: "Euro", symbol: "€", isFiat: true, defaultPriceUsd: 1.08 },
  { code: "GBP", name: "British Pound", symbol: "£", isFiat: true, defaultPriceUsd: 1.29 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", isFiat: true, defaultPriceUsd: 1 / 3.6725 },
];

export interface PriceSource {
  id: string;
  name: string;
  description: string;
}

export const PRICE_SOURCES: PriceSource[] = [
  { id: "binance", name: "Binance", description: "Global spot orderbook price" },
  { id: "coindcx", name: "CoinDCX", description: "Indian INR & USDT liquidity" },
  { id: "delta", name: "Delta India", description: "Delta perpetual contracts mark index" },
  { id: "coingecko", name: "CoinGecko", description: "Global aggregated volume-weighted price" },
];

export interface ConverterInput {
  from: string;
  to: string;
  amount: number;
  rates?: Record<string, number>; // USD prices for each currency code
  feePct?: number; // e.g. 0.1%
  source?: string;
}

export interface ConverterResult {
  from: CurrencyItem;
  to: CurrencyItem;
  amount: number;
  fromPriceUsd: number;
  toPriceUsd: number;
  conversionRate: number; // 1 From = X To
  inverseRate: number;    // 1 To = Y From
  convertedAmount: number;
  feePct: number;
  estimatedFee: number;
  amountAfterFee: number;
  source: string;
}

export type ConverterOutcome =
  | { ok: true; result: ConverterResult }
  | { ok: false; error: string };

export function computeConversion(input: ConverterInput): ConverterOutcome | null {
  const { from, to, amount, rates = {}, feePct = 0, source = "binance" } = input;

  if (!from || !to) return null;
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) {
    return { ok: false, error: "Conversion amount 0 se bada hona chahiye." };
  }

  const fromItem = SUPPORTED_CURRENCIES.find((c) => c.code === from) ?? {
    code: from,
    name: from,
    symbol: from,
    defaultPriceUsd: 1,
  };

  const toItem = SUPPORTED_CURRENCIES.find((c) => c.code === to) ?? {
    code: to,
    name: to,
    symbol: to,
    defaultPriceUsd: 1,
  };

  const fromPriceUsd = rates[from] ?? fromItem.defaultPriceUsd;
  const toPriceUsd = rates[to] ?? toItem.defaultPriceUsd;

  if (fromPriceUsd <= 0 || toPriceUsd <= 0) {
    return { ok: false, error: "Price data available nahi hai." };
  }

  // Rate: How many 'To' units for 1 'From' unit
  // e.g. from=BTC ($66,000), to=USDT ($1.0) -> rate = 66,000 / 1.0 = 66,000
  // e.g. from=BTC ($66,000), to=ETH ($3,300) -> rate = 66,000 / 3,300 = 20.0 ETH
  // e.g. from=USDT ($1.0), to=INR ($0.011494) -> rate = 1 / 0.011494 = 87.0 INR
  const conversionRate = fromPriceUsd / toPriceUsd;
  const inverseRate = toPriceUsd / fromPriceUsd;

  const convertedAmount = amount * conversionRate;

  const f = Math.max(0, feePct) / 100;
  const estimatedFee = convertedAmount * f;
  const amountAfterFee = convertedAmount - estimatedFee;

  return {
    ok: true,
    result: {
      from: fromItem,
      to: toItem,
      amount,
      fromPriceUsd,
      toPriceUsd,
      conversionRate,
      inverseRate,
      convertedAmount,
      feePct,
      estimatedFee,
      amountAfterFee,
      source,
    },
  };
}
