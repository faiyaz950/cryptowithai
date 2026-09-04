import type { Holding } from "./portfolio";

export interface ParsedHolding {
  symbol: string;
  name: string;
  quantity: number;
  buyPrice: number;
}

export interface ImportResult {
  holdings: ParsedHolding[];
  skipped: number;
  errors: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(headers: string[], variants: string[]): number {
  const normed = headers.map(norm);
  for (const v of variants) {
    const i = normed.indexOf(norm(v));
    if (i >= 0) return i;
  }
  for (const v of variants) {
    const nv = norm(v);
    const i = normed.findIndex((h) => h.includes(nv) || nv.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function parseNum(raw: string): number {
  const n = parseFloat(String(raw).replace(/[,₹$%\s]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function cleanSymbol(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\.NS$|\.BSE$|\.NSE$|-EQ$|\s+EQ$/i, "")
    .replace(/\s+/g, "");
}

/** Parse one CSV/TSV row respecting quoted fields. */
export function splitCsvRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      result.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }

  result.push(cur.trim());
  return result.map((c) => c.replace(/^"|"$/g, ""));
}

function detectDelimiterFromLines(lines: string[]): string {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    const d = detectDelimiter(line);
    if (splitCsvRow(line, d).length >= 4) return d;
  }
  return detectDelimiter(lines[0] ?? "");
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const semis = (line.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

const SYM_VARIANTS = [
  "symbol", "instrument", "tradingsymbol", "trading symbol", "scrip", "stock",
  "company name", "security", "isin description", "stock symbol", "scrip code",
  "ticker", "nse symbol", "bse symbol", "isin", "security code",
];

const QTY_VARIANTS = [
  "quantity", "qty", "qty.", "holdings", "units", "net qty", "closing balance",
  "netqty", "net quantity", "balance qty", "shares", "no of shares", "no. of shares",
];

const PRICE_VARIANTS = [
  "average price", "avg price", "avg. cost", "average cost", "avg cost",
  "buy price", "purchase price", "cost price", "avg.", "average",
  "invested value", "investment value", "total cost", "avg buy price",
];

const NAME_VARIANTS = [
  "name", "company", "instrument name", "security name", "stock name",
  "company name", "description", "scrip name",
];

const TYPE_VARIANTS = [
  "type", "side", "buy/sell", "buysell", "transaction type", "order type",
  "trade type", "buy or sell", "txn type", "action", "order side",
];

const ORDER_PRICE_VARIANTS = [
  "price", "trade price", "execution price", "rate", "avg price",
  "average price", "price per share", "traded price", "fill price",
];

const STATUS_VARIANTS = ["status", "order status", "execution status"];

/** Common Groww / broker full names → NSE ticker */
const STOCK_NAME_ALIASES: Record<string, string> = {
  tataconsultancyservices: "TCS",
  tataconsultancyservicesltd: "TCS",
  relianceindustries: "RELIANCE",
  relianceindustriesltd: "RELIANCE",
  hdfcbank: "HDFCBANK",
  icicibank: "ICICIBANK",
  infosys: "INFY",
  infosysltd: "INFY",
  hindustanunilever: "HINDUNILVR",
  hindustanunileverltd: "HINDUNILVR",
  statbankofindia: "SBIN",
  statebankofindia: "SBIN",
  bhartiairtel: "BHARTIARTL",
  bhartiairtelltd: "BHARTIARTL",
  itc: "ITC",
  itcltd: "ITC",
  kotakmahindrabank: "KOTAKBANK",
  axisbank: "AXISBANK",
  bajajfinance: "BAJFINANCE",
  tatasteel: "TATASTEEL",
  tatasteelltd: "TATASTEEL",
  tatamotors: "TATAMOTORS",
  marutisuzuki: "MARUTI",
  marutisuzukiindia: "MARUTI",
  sunpharmaceutical: "SUNPHARMA",
  sunpharmaindustries: "SUNPHARMA",
  wipro: "WIPRO",
  wiproltd: "WIPRO",
  adanienterprises: "ADANIENT",
  adaniports: "ADANIPORTS",
  powergridcorporation: "POWERGRID",
  ntpc: "NTPC",
  ongc: "ONGC",
  coalindia: "COALINDIA",
  asianpaints: "ASIANPAINT",
  nestleindia: "NESTLEIND",
  titancompany: "TITAN",
  ultratechcement: "ULTRACEMCO",
  mahindramahindra: "M&M",
};

export function resolveSymbol(raw: string): { symbol: string; name: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { symbol: "", name: "" };

  const paren = trimmed.match(/\(([A-Z0-9&.-]{2,20})\)\s*$/);
  if (paren) {
    return { symbol: cleanSymbol(paren[1]), name: trimmed };
  }

  const cleaned = cleanSymbol(trimmed);
  if (cleaned.length <= 15 && /^[A-Z0-9&.-]+$/.test(cleaned) && !cleaned.includes("LTD")) {
    return { symbol: cleaned, name: trimmed };
  }

  const aliasKey = norm(trimmed).replace(/ltd$|limited$|inc$/, "");
  if (STOCK_NAME_ALIASES[aliasKey]) {
    return { symbol: STOCK_NAME_ALIASES[aliasKey], name: trimmed };
  }

  return { symbol: cleaned.slice(0, 20) || trimmed, name: trimmed };
}

function findOrderHistoryHeaderRow(lines: string[], delimiter: string): number {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const headers = splitCsvRow(lines[i], delimiter);
    if (headers.length < 4) continue;
    const typeIdx = findCol(headers, TYPE_VARIANTS);
    if (typeIdx < 0) continue;
    const symIdx = findCol(headers, [...SYM_VARIANTS, "stock name", "stockname"]);
    const qtyIdx = findCol(headers, QTY_VARIANTS);
    const priceIdx = findCol(headers, ORDER_PRICE_VARIANTS);
    if (symIdx >= 0 && qtyIdx >= 0 && priceIdx >= 0) return i;
  }
  return -1;
}

function parseSide(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("buy") || s === "b" || s.includes("purchase")) return "buy";
  if (s.includes("sell") || s === "s") return "sell";
  return null;
}

function isSkippedStatus(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return (
    s.includes("cancel") ||
    s.includes("reject") ||
    s.includes("fail") ||
    s.includes("pending") ||
    s.includes("open")
  );
}

/** Aggregate BUY/SELL rows from order history (Groww, Zerodha tradebook, etc.) */
export function parseOrderHistoryCsv(text: string): ImportResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { holdings: [], skipped: 0, errors: ["File khali hai ya sirf header hai"] };
  }

  const delimiter = detectDelimiterFromLines(lines);
  const headerIdx = findOrderHistoryHeaderRow(lines, delimiter);
  if (headerIdx < 0) {
    return { holdings: [], skipped: 0, errors: [] };
  }

  const headers = splitCsvRow(lines[headerIdx], delimiter).map((h) => h.trim());
  const symIdx = findCol(headers, [...SYM_VARIANTS, "stock name", "stockname"]);
  const typeIdx = findCol(headers, TYPE_VARIANTS);
  const qtyIdx = findCol(headers, QTY_VARIANTS);
  const priceIdx = findCol(headers, ORDER_PRICE_VARIANTS);
  const nameIdx = findCol(headers, NAME_VARIANTS);
  const statusIdx = findCol(headers, STATUS_VARIANTS);

  const positions = new Map<string, { name: string; qty: number; cost: number }>();
  let skipped = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i], delimiter);
    if (cols.length < 3) continue;

    if (statusIdx >= 0 && isSkippedStatus(cols[statusIdx] ?? "")) {
      skipped++;
      continue;
    }

    const side = parseSide(cols[typeIdx] ?? "");
    if (!side) {
      skipped++;
      continue;
    }

    const rawSym = cols[symIdx] ?? "";
    const { symbol, name } = resolveSymbol(rawSym);
    if (!symbol) {
      skipped++;
      continue;
    }

    const quantity = parseNum(cols[qtyIdx] ?? "0");
    const price = parseNum(cols[priceIdx] ?? "0");
    if (quantity <= 0) {
      skipped++;
      continue;
    }

    const displayName =
      nameIdx >= 0 && cols[nameIdx]?.trim() ? cols[nameIdx].trim() : name || symbol;
    const key = symbol;
    const pos = positions.get(key) ?? { name: displayName, qty: 0, cost: 0 };

    if (side === "buy") {
      pos.qty += quantity;
      pos.cost += quantity * (price > 0 ? price : 0);
    } else {
      if (pos.qty <= 0) {
        skipped++;
        continue;
      }
      const sellQty = Math.min(quantity, pos.qty);
      const avgCost = pos.qty > 0 ? pos.cost / pos.qty : 0;
      pos.qty -= sellQty;
      pos.cost -= avgCost * sellQty;
    }

    if (!pos.name && displayName) pos.name = displayName;
    positions.set(key, pos);
  }

  const holdings: ParsedHolding[] = [];
  for (const [symbol, pos] of positions) {
    if (pos.qty <= 0.0001) continue;
    holdings.push({
      symbol,
      name: pos.name || symbol,
      quantity: Math.round(pos.qty * 1000) / 1000,
      buyPrice: pos.qty > 0 ? pos.cost / pos.qty : 0,
    });
  }

  if (!holdings.length) {
    errors.push("Order history se koi open holding nahi mili (sab sell ho chuka ya data khali hai).");
  }

  return { holdings, skipped, errors };
}

/** Auto-detect holdings export vs order history */
export function parseBrokerFile(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { holdings: [], skipped: 0, errors: ["File khali hai ya sirf header hai"] };
  }

  const delimiter = detectDelimiterFromLines(lines);
  if (findOrderHistoryHeaderRow(lines, delimiter) >= 0) {
    const orderResult = parseOrderHistoryCsv(text);
    if (orderResult.holdings.length) return orderResult;
  }

  return parseHoldingsCsv(text);
}

function findHoldingsHeaderRow(lines: string[], delimiter: string): number {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const headers = splitCsvRow(lines[i], delimiter);
    const symIdx = findCol(headers, SYM_VARIANTS);
    const qtyIdx = findCol(headers, QTY_VARIANTS);
    const typeIdx = findCol(headers, TYPE_VARIANTS);
    // Skip order-history headers when looking for holdings
    if (typeIdx >= 0) continue;
    if (symIdx >= 0 && qtyIdx >= 0) return i;
  }
  return 0;
}

function dedupeHoldings(holdings: ParsedHolding[]): ParsedHolding[] {
  const map = new Map<string, ParsedHolding>();
  for (const h of holdings) {
    const key = h.symbol;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...h });
      continue;
    }
    const totalQty = prev.quantity + h.quantity;
    const avgPrice =
      totalQty > 0
        ? (prev.quantity * prev.buyPrice + h.quantity * h.buyPrice) / totalQty
        : h.buyPrice;
    map.set(key, {
      symbol: h.symbol,
      name: prev.name || h.name,
      quantity: totalQty,
      buyPrice: avgPrice,
    });
  }
  return Array.from(map.values());
}

function isSummaryRow(symbol: string, name: string): boolean {
  const s = `${symbol} ${name}`.toUpperCase();
  return (
    s.includes("TOTAL") ||
    s.includes("GRAND") ||
    s.includes("SUBTOTAL") ||
    s === "NA" ||
    s === "N/A"
  );
}

/** Parse CSV text from Zerodha, Groww, Upstox, Angel One, etc. */
export function parseHoldingsCsv(text: string): ImportResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { holdings: [], skipped: 0, errors: ["File khali hai ya sirf header hai"] };
  }

  const delimiter = detectDelimiterFromLines(lines);
  const headerIdx = findHoldingsHeaderRow(lines, delimiter);
  const headers = splitCsvRow(lines[headerIdx], delimiter).map((h) => h.trim());

  const symIdx = findCol(headers, SYM_VARIANTS);
  const qtyIdx = findCol(headers, QTY_VARIANTS);
  const priceIdx = findCol(headers, PRICE_VARIANTS);
  const nameIdx = findCol(headers, NAME_VARIANTS);

  if (symIdx < 0) {
    return {
      holdings: [],
      skipped: 0,
      errors: [`Symbol column nahi mila. Headers: ${headers.slice(0, 12).join(", ")}`],
    };
  }
  if (qtyIdx < 0) {
    return {
      holdings: [],
      skipped: 0,
      errors: [`Quantity column nahi mila. Headers: ${headers.slice(0, 12).join(", ")}`],
    };
  }

  const rawHoldings: ParsedHolding[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i], delimiter);
    if (cols.length < 2) continue;

    const rawSym = cols[symIdx] ?? "";
    const resolved = resolveSymbol(rawSym);
    const symbol = resolved.symbol || cleanSymbol(rawSym);
    const quantity = parseNum(cols[qtyIdx] ?? "0");
    const buyPrice = priceIdx >= 0 ? parseNum(cols[priceIdx] ?? "0") : 0;
    const name =
      nameIdx >= 0
        ? (cols[nameIdx] ?? resolved.name) || symbol
        : resolved.name || symbol;

    if (!symbol || isSummaryRow(symbol, name)) {
      skipped++;
      continue;
    }
    if (quantity <= 0) {
      skipped++;
      continue;
    }

    rawHoldings.push({
      symbol,
      name: name || symbol,
      quantity,
      buyPrice: buyPrice > 0 ? buyPrice : 0,
    });
  }

  const holdings = dedupeHoldings(rawHoldings);

  if (!holdings.length) {
    errors.push("Koi valid holding nahi mili. CSV format check karein.");
  }

  return { holdings, skipped, errors };
}

export function parsedToHoldings(parsed: ParsedHolding[]): Omit<Holding, "id" | "addedAt">[] {
  return parsed.map((p) => ({
    type: "stock" as const,
    symbol: p.symbol,
    name: p.name,
    quantity: p.quantity,
    buyPrice: p.buyPrice || 0,
    currency: "INR" as const,
  }));
}
