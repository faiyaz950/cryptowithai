/**
 * Crypto Market Cap Calculator — pure math.
 *
 * Purpose: Coin ki market capitalization aur implied price calculate karna.
 *
 * Logic:
 *   Market Cap     = Price × Circulating Supply
 *   FDV            = Price × Max / Total Supply
 *   Implied Price  = Target Market Cap / Circulating Supply
 *   Implied FDV    = Implied Price × Max Supply
 *   Growth Multiple = Target Market Cap / Market Cap
 */

export interface MarketCapPreset {
  id: string;
  name: string;
  symbol: string;
  price: number;
  circulatingSupply: number;
  maxSupply: number | null;
  targetMarketCap: number;
}

export const MARKET_CAP_PRESETS: MarketCapPreset[] = [
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    price: 66500,
    circulatingSupply: 19_770_000,
    maxSupply: 21_000_000,
    targetMarketCap: 2_000_000_000_000, // $2T (Gold ~15T)
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    price: 3450,
    circulatingSupply: 120_400_000,
    maxSupply: null, // infinite / deflationary
    targetMarketCap: 1_000_000_000_000, // $1T
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    price: 155,
    circulatingSupply: 468_000_000,
    maxSupply: 585_000_000,
    targetMarketCap: 250_000_000_000, // $250B
  },
  {
    id: "doge",
    name: "Dogecoin",
    symbol: "DOGE",
    price: 0.125,
    circulatingSupply: 146_000_000_000,
    maxSupply: null,
    targetMarketCap: 50_000_000_000,
  },
];

export interface MarketCapInput {
  price: number;
  circulatingSupply: number;
  maxSupply?: number | null;
  targetMarketCap?: number;
  targetPrice?: number;
}

export interface MarketCapResult {
  price: number;
  circulatingSupply: number;
  maxSupply: number | null;
  currentMarketCap: number;
  fdv: number;
  circulatingRatioPct: number | null;
  targetMarketCap: number;
  impliedPriceAtTargetMc: number;
  impliedFdvAtTargetMc: number | null;
  growthMultiple: number;
  growthPct: number;
}

export type MarketCapOutcome = { ok: true; result: MarketCapResult } | { ok: false; error: string };

export function computeMarketCap(input: MarketCapInput): MarketCapOutcome | null {
  const {
    price,
    circulatingSupply,
    maxSupply,
    targetMarketCap: rawTargetMc,
    targetPrice: rawTargetPrice,
  } = input;

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(circulatingSupply)
  ) {
    return null;
  }

  if (price <= 0) return { ok: false, error: "Price 0 se bada hona chahiye." };
  if (circulatingSupply <= 0) return { ok: false, error: "Circulating supply 0 se badi honi chahiye." };

  const currentMarketCap = price * circulatingSupply;
  const effectiveMax = Number.isFinite(maxSupply) && (maxSupply as number) > 0 ? (maxSupply as number) : null;
  const fdv = effectiveMax != null ? price * effectiveMax : currentMarketCap;

  const circulatingRatioPct = effectiveMax != null ? (circulatingSupply / effectiveMax) * 100 : null;

  let targetMc = currentMarketCap * 2; // default 2x
  if (Number.isFinite(rawTargetMc) && (rawTargetMc as number) > 0) {
    targetMc = rawTargetMc as number;
  } else if (Number.isFinite(rawTargetPrice) && (rawTargetPrice as number) > 0) {
    targetMc = (rawTargetPrice as number) * circulatingSupply;
  }

  const impliedPriceAtTargetMc = targetMc / circulatingSupply;
  const impliedFdvAtTargetMc = effectiveMax != null ? impliedPriceAtTargetMc * effectiveMax : null;

  const growthMultiple = currentMarketCap > 0 ? targetMc / currentMarketCap : 1;
  const growthPct = (growthMultiple - 1) * 100;

  return {
    ok: true,
    result: {
      price,
      circulatingSupply,
      maxSupply: effectiveMax,
      currentMarketCap,
      fdv,
      circulatingRatioPct,
      targetMarketCap: targetMc,
      impliedPriceAtTargetMc,
      impliedFdvAtTargetMc,
      growthMultiple,
      growthPct,
    },
  };
}
