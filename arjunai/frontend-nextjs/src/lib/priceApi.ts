import { CRYPTO_ID_MAP } from "./portfolio";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const COINGECKO = "https://api.coingecko.com/api/v3";

export interface PriceResult {
  symbol: string;
  price: number;       // in native currency
  priceINR: number;    // always in INR
  change24h: number;   // %
  name: string;
}

// ── USD→INR rate ──────────────────────────────────────────────────────────

let cachedUsdInr = 84;
let usdInrFetchedAt = 0;

export async function getUsdInrRate(): Promise<number> {
  if (Date.now() - usdInrFetchedAt < 5 * 60 * 1000) return cachedUsdInr;
  try {
    const res = await fetch(
      `${COINGECKO}/simple/price?ids=tether&vs_currencies=inr`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    cachedUsdInr = data?.tether?.inr ?? 84;
    usdInrFetchedAt = Date.now();
  } catch {
    // use cached value
  }
  return cachedUsdInr;
}

// ── Crypto prices (CoinGecko) ─────────────────────────────────────────────

export async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, PriceResult>> {
  const ids = symbols
    .map((s) => CRYPTO_ID_MAP[s.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) return {};

  const res = await fetch(
    `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h&per_page=50`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);

  const coins: {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    price_change_percentage_24h: number;
  }[] = await res.json();

  const usdInr = await getUsdInrRate();
  const result: Record<string, PriceResult> = {};

  for (const coin of coins) {
    const sym = coin.symbol.toUpperCase();
    result[sym] = {
      symbol: sym,
      price: coin.current_price,
      priceINR: coin.current_price * usdInr,
      change24h: coin.price_change_percentage_24h ?? 0,
      name: coin.name,
    };
  }
  return result;
}

// ── Stock prices (via our FastAPI backend → Yahoo Finance) ────────────────

export async function fetchStockPrices(symbols: string[]): Promise<Record<string, PriceResult>> {
  if (!symbols.length) return {};

  const res = await fetch(
    `${API_BASE}/api/prices/stocks?symbols=${symbols.join(",")}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Stock price error ${res.status}`);

  const data: Record<string, { price: number; change24h: number; name: string }> = await res.json();
  const result: Record<string, PriceResult> = {};

  for (const [sym, info] of Object.entries(data)) {
    result[sym] = {
      symbol: sym,
      price: info.price,
      priceINR: info.price,   // already INR
      change24h: info.change24h,
      name: info.name,
    };
  }
  return result;
}
