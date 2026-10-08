import { SPOT_QUOTES, symbolLabel } from "@/lib/cryptoApi";

/** CoinDCX spot — INR / BTC / USDT / USDC / ETH / TRX quote wale pairs. */
export const SPOT_VENUE = "coindcx-spot";

/** Order/watchlist key: Delta perp par sirf symbol, spot par "BTCINR@coindcx-spot". */
export function orderKey(symbol: string, venue: string | null | undefined): string {
  return isSpotVenue(venue) ? `${symbol}@${SPOT_VENUE}` : symbol;
}

export function isSpotKey(key: string): boolean {
  return key.toLowerCase().endsWith(`@${SPOT_VENUE}`);
}

export function isSpotVenue(venue: string | null | undefined): boolean {
  return venue === SPOT_VENUE;
}

export function splitPair(symbol: string, venue: string | null | undefined): { base: string; quote: string } {
  const sym = symbol.toUpperCase();
  if (isSpotVenue(venue)) {
    const q = SPOT_QUOTES.find((x) => sym.endsWith(x) && sym.length > x.length);
    if (q) return { base: sym.slice(0, -q.length), quote: q };
  }
  return { base: sym.replace(/USDT$|USD$/, "") || sym, quote: "USD" };
}

export function pairLabel(symbol: string, venue: string | null | undefined): string {
  if (!isSpotVenue(venue)) return symbolLabel(symbol);
  const { base, quote } = splitPair(symbol, venue);
  return `${base}/${quote}`;
}

/** Watchlist key: Delta par sirf "BTCUSDT", baaki venue par "BTCINR@coindcx-spot". */
export function parseWatchKey(key: string): { symbol: string; venue: string } {
  const at = key.indexOf("@");
  return at < 0
    ? { symbol: key, venue: "delta" }
    : { symbol: key.slice(0, at).toUpperCase(), venue: key.slice(at + 1).toLowerCase() };
}

export function watchKeyLabel(key: string): string {
  const { symbol, venue } = parseWatchKey(key);
  return pairLabel(symbol, venue);
}

// Formatter banana mehenga hai (toLocaleString bhi har call par naya banata hai) —
// market list har refresh par hazaron numbers format karti hai, isliye ek baar banao.
const NUM_US = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const NUM_IN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const COMPACT_US = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const COMPACT_IN = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });

function plain(n: number): string {
  if (n >= 1000) return NUM_US.format(n);
  if (n >= 1) return n.toFixed(n >= 100 ? 2 : 4);
  // toPrecision chhote numbers par "3.05e-7" deta hai — decimals khud gino.
  const decimals = Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return n.toFixed(decimals);
}

/** Bina currency sign ke — list ke liye. */
export function fmtQuoteNum(n: number | null | undefined, quote: string): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (quote === "INR") {
    return n >= 1 ? NUM_IN.format(n) : plain(n);
  }
  return plain(n);
}

/** Currency ke saath — header/strip ke liye. */
export function fmtQuotePrice(n: number | null | undefined, quote: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (quote === "INR") return `₹${fmtQuoteNum(n, quote)}`;
  if (quote === "USD" || quote === "USDT" || quote === "USDC") return `$${fmtQuoteNum(n, quote)}`;
  return `${fmtQuoteNum(n, quote)} ${quote}`;
}

/** Turnover quote currency mein — compact. */
export function fmtQuoteCompact(n: number | null | undefined, quote: string): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (quote === "INR") {
    return `₹${COMPACT_IN.format(n)}`;
  }
  const s = COMPACT_US.format(n);
  if (quote === "USD" || quote === "USDT" || quote === "USDC") return `$${s}`;
  return `${s} ${quote}`;
}
