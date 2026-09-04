export type AssetType = "stock" | "crypto" | "mf";

export interface Holding {
  id: string;
  type: AssetType;
  symbol: string;      // "TCS", "BTC", "Parag Parikh Flexi Cap"
  name: string;        // display name
  quantity: number;    // shares / units / coins
  buyPrice: number;    // ₹ for stock/MF, $ for crypto
  currency: "INR" | "USD";
  addedAt: string;     // ISO date string
  sourceFileId?: string; // file jisse yeh holding aayi — file remove hone par saath hatti hai
}

export interface PortfolioFile {
  id: string;
  fileName: string;
  format: string;        // "csv" | "excel" | "pdf" | "unknown"
  uploadedAt: string;    // ISO date string
  sizeBytes: number;
  holdingsCount: number;
  /** Truncated document text — AI context ke liye (PDF / partial parse) */
  rawText?: string;
}

export interface PricedHolding extends Holding {
  currentPrice: number;
  currentValue: number;   // quantity × currentPrice (in native currency)
  currentValueINR: number;
  investedINR: number;    // quantity × buyPrice (converted to INR)
  pnlINR: number;
  pnlPct: number;
  change24h: number;
  priceLoading: boolean;
  priceError: boolean;
}

export interface PortfolioSummary {
  totalInvestedINR: number;
  totalCurrentINR: number;
  totalPnlINR: number;
  totalPnlPct: number;
  stocksValueINR: number;
  cryptoValueINR: number;
  mfValueINR: number;
}

// ── CoinGecko symbol map ──────────────────────────────────────────────────

export const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  UNI: "uniswap",
  ATOM: "cosmos",
};

// ── localStorage ──────────────────────────────────────────────────────────

const PORTFOLIO_KEY = "finowingsai_portfolio";
const FILES_KEY = "finowingsai_portfolio_files";
const PORTFOLIO_AI_CONTEXT_KEY = "finowingsai_portfolio_ai_context";
const LEGACY_SOURCE_KEY = "finowingsai_portfolio_source";
const LEGACY_BROKER_KEY = "finowingsai_connected_broker";

// Backend 8000+ chars ka portfolio_context reject karta hai — margin ke saath cap
const AI_CONTEXT_LIMIT = 7500;

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHoldings(holdings: Holding[]): void {
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(holdings));
  } catch {
    // ignore
  }
}

function savePortfolioFiles(files: PortfolioFile[]): void {
  try {
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
  } catch {
    // quota full — rawText ke bina retry
    try {
      localStorage.setItem(
        FILES_KEY,
        JSON.stringify(files.map((f) => ({ ...f, rawText: undefined })))
      );
    } catch {
      // ignore
    }
  }
}

export function loadPortfolioFiles(): PortfolioFile[] {
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (raw) return JSON.parse(raw);
    return migrateLegacyPortfolio();
  } catch {
    return [];
  }
}

/** Purane single-source data (broker-connect era) ko ek file entry mein convert karo */
function migrateLegacyPortfolio(): PortfolioFile[] {
  const holdings = loadHoldings();
  let legacyMeta: { fileName?: string; format?: string; importedAt?: string } | null = null;
  let legacyCtx: string | null = null;
  try {
    const rawMeta = localStorage.getItem(LEGACY_SOURCE_KEY);
    legacyMeta = rawMeta ? JSON.parse(rawMeta) : null;
    legacyCtx = localStorage.getItem(PORTFOLIO_AI_CONTEXT_KEY);
    localStorage.removeItem(LEGACY_SOURCE_KEY);
    localStorage.removeItem(LEGACY_BROKER_KEY);
  } catch {
    // ignore
  }

  if (!holdings.length && !legacyCtx) {
    savePortfolioFiles([]);
    return [];
  }

  const file: PortfolioFile = {
    id: genId(),
    fileName: legacyMeta?.fileName ?? "Imported portfolio",
    format: legacyMeta?.format ?? "csv",
    uploadedAt: legacyMeta?.importedAt ?? new Date().toISOString(),
    sizeBytes: 0,
    holdingsCount: holdings.length,
    rawText: holdings.length ? undefined : legacyCtx ?? undefined,
  };

  if (holdings.length) {
    saveHoldings(holdings.map((h) => ({ ...h, sourceFileId: h.sourceFileId ?? file.id })));
  }
  savePortfolioFiles([file]);
  return [file];
}

// ── File import / remove ──────────────────────────────────────────────────

/** parsePortfolioFile() ka result — structural type taaki circular import na ho */
export interface ParsedFileData {
  fileName: string;
  format: string;
  rawText?: string;
  holdingsReady: Omit<Holding, "id" | "addedAt">[];
}

export interface ImportedFileSummary {
  file: PortfolioFile;
  holdingsAdded: number;
  replacedExisting: boolean;
}

/** Parsed file ko portfolio mein add karo. Same fileName dobara aaye to purani entry replace hoti hai. */
export function importPortfolioFile(data: ParsedFileData, sizeBytes: number): ImportedFileSummary {
  const files = loadPortfolioFiles();
  const holdings = loadHoldings();

  const existing = files.find((f) => f.fileName === data.fileName);
  const keptFiles = existing ? files.filter((f) => f.id !== existing.id) : files;
  const keptHoldings = existing
    ? holdings.filter((h) => h.sourceFileId !== existing.id)
    : holdings;

  const file: PortfolioFile = {
    id: genId(),
    fileName: data.fileName,
    format: data.format,
    uploadedAt: new Date().toISOString(),
    sizeBytes,
    holdingsCount: data.holdingsReady.length,
    rawText: data.rawText?.trim() ? data.rawText : undefined,
  };

  const newHoldings: Holding[] = data.holdingsReady.map((h) => ({
    ...h,
    id: genId(),
    addedAt: file.uploadedAt,
    sourceFileId: file.id,
  }));

  savePortfolioFiles([file, ...keptFiles]);
  saveHoldings([...newHoldings, ...keptHoldings]);
  rebuildPortfolioAIContext();

  return { file, holdingsAdded: newHoldings.length, replacedExisting: !!existing };
}

/** File aur uski saari holdings hatao, AI context refresh karo */
export function removePortfolioFile(fileId: string): void {
  const files = loadPortfolioFiles().filter((f) => f.id !== fileId);
  const holdings = loadHoldings().filter((h) => h.sourceFileId !== fileId);
  savePortfolioFiles(files);
  saveHoldings(holdings);
  if (!files.length && !holdings.length) {
    clearPortfolioAIContext();
  } else {
    rebuildPortfolioAIContext();
  }
}

export function clearPortfolio(): void {
  saveHoldings([]);
  savePortfolioFiles([]);
  clearPortfolioAIContext();
}

// ── AI context ────────────────────────────────────────────────────────────

export function getPortfolioAIContext(): string | null {
  try {
    return localStorage.getItem(PORTFOLIO_AI_CONTEXT_KEY);
  } catch {
    return null;
  }
}

function savePortfolioAIContext(summary: string): void {
  try {
    localStorage.setItem(PORTFOLIO_AI_CONTEXT_KEY, summary);
  } catch {
    // ignore
  }
}

export function clearPortfolioAIContext(): void {
  try {
    localStorage.removeItem(PORTFOLIO_AI_CONTEXT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Saari connected files se AI context rebuild karo:
 * structured holdings (live prices ke saath, agar available) + har file ka document extract.
 * Total hamesha AI_CONTEXT_LIMIT ke andar rehta hai.
 */
export function rebuildPortfolioAIContext(priced?: PricedHolding[], usdInr?: number): void {
  const files = loadPortfolioFiles();
  const holdings = loadHoldings();
  if (!files.length && !holdings.length) {
    clearPortfolioAIContext();
    return;
  }

  const lines: string[] = [];
  const fileNames = files.map((f) => f.fileName).join(", ");
  lines.push(
    files.length
      ? `User ne apna portfolio ${files.length} file(s) se connect kiya hai (${fileNames}). Portfolio-related sawaalon ka jawab isi data par based do.`
      : "User ka portfolio data neeche hai. Portfolio-related sawaalon ka jawab isi par based do."
  );

  const pricedMap = new Map((priced ?? []).map((p) => [p.id, p]));
  if (holdings.length) {
    lines.push("\nHOLDINGS:");
    for (const h of holdings) {
      const cur = h.currency === "USD" ? "$" : "₹";
      const p = pricedMap.get(h.id);
      if (p && !p.priceLoading && !p.priceError) {
        lines.push(
          `  - ${h.name} (${h.symbol}, ${h.type}): ${h.quantity} @ ${cur}${h.buyPrice} | Live: ${cur}${p.currentPrice.toFixed(2)} | P&L: ${fmtINR(p.pnlINR)} (${fmtPct(p.pnlPct)})`
        );
      } else {
        lines.push(`  - ${h.name} (${h.symbol}, ${h.type}): ${h.quantity} @ ${cur}${h.buyPrice}`);
      }
    }

    const done = (priced ?? []).filter((p) => !p.priceLoading && !p.priceError);
    if (done.length) {
      const s = calcSummary(priced!);
      lines.push(
        `\nTOTAL: Invested ${fmtINR(s.totalInvestedINR)} | Current ${fmtINR(s.totalCurrentINR)} | P&L ${fmtINR(s.totalPnlINR)} (${fmtPct(s.totalPnlPct)})`
      );
      if (usdInr) lines.push(`USD/INR rate: ₹${usdInr}`);
    }
  }

  lines.push(
    "\nUser portfolio se related kuch bhi pooch sakta hai — allocation, risk, P&L, diversification, tax, rebalancing, etc."
  );

  let ctx = lines.join("\n");

  // Bacha hua budget document extracts mein equally baanto
  const withText = files.filter((f) => f.rawText?.trim());
  if (withText.length) {
    const remaining = AI_CONTEXT_LIMIT - ctx.length - withText.length * 60;
    const perFile = Math.floor(remaining / withText.length);
    if (perFile > 200) {
      for (const f of withText) {
        ctx += `\n\n--- File: ${f.fileName} (extract) ---\n${f.rawText!.slice(0, perFile)}`;
      }
    }
  }

  savePortfolioAIContext(ctx.slice(0, AI_CONTEXT_LIMIT));
}

// ── Summary calculation ───────────────────────────────────────────────────

export function calcSummary(holdings: PricedHolding[]): PortfolioSummary {
  const done = holdings.filter((h) => !h.priceLoading && !h.priceError);
  return {
    totalInvestedINR: done.reduce((s, h) => s + h.investedINR, 0),
    totalCurrentINR: done.reduce((s, h) => s + h.currentValueINR, 0),
    totalPnlINR: done.reduce((s, h) => s + h.pnlINR, 0),
    totalPnlPct:
      done.reduce((s, h) => s + h.investedINR, 0) > 0
        ? (done.reduce((s, h) => s + h.pnlINR, 0) /
            done.reduce((s, h) => s + h.investedINR, 0)) *
          100
        : 0,
    stocksValueINR: done.filter((h) => h.type === "stock").reduce((s, h) => s + h.currentValueINR, 0),
    cryptoValueINR: done.filter((h) => h.type === "crypto").reduce((s, h) => s + h.currentValueINR, 0),
    mfValueINR: done.filter((h) => h.type === "mf").reduce((s, h) => s + h.currentValueINR, 0),
  };
}

// ── Format helpers ────────────────────────────────────────────────────────

export function fmtINR(n: number): string {
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(2) + "Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(2) + "L";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export function fmtBytes(n: number): string {
  if (n <= 0) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return Math.round(n / 1e3) + " KB";
  return n + " B";
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

// ── Build AI analysis prompt ──────────────────────────────────────────────

export function buildPortfolioPrompt(holdings: PricedHolding[], usdInr: number): string {
  const lines = ["Mera portfolio analyze karo aur detailed insights do:\n"];

  const stocks = holdings.filter((h) => h.type === "stock" && !h.priceError);
  const cryptos = holdings.filter((h) => h.type === "crypto" && !h.priceError);
  const mfs = holdings.filter((h) => h.type === "mf");

  if (stocks.length) {
    lines.push("📈 STOCKS:");
    stocks.forEach((h) => {
      lines.push(
        `  - ${h.name} (${h.symbol}): ${h.quantity} shares | Buy: ₹${h.buyPrice} | Current: ₹${h.currentPrice.toFixed(0)} | P&L: ${fmtINR(h.pnlINR)} (${fmtPct(h.pnlPct)})`
      );
    });
  }

  if (cryptos.length) {
    lines.push("\n💰 CRYPTO:");
    cryptos.forEach((h) => {
      lines.push(
        `  - ${h.name} (${h.symbol}): ${h.quantity} coins | Buy: $${h.buyPrice} | Current: $${h.currentPrice.toFixed(2)} | P&L: ${fmtINR(h.pnlINR)} (${fmtPct(h.pnlPct)})`
      );
    });
  }

  if (mfs.length) {
    lines.push("\n🏦 MUTUAL FUNDS:");
    mfs.forEach((h) => {
      lines.push(
        `  - ${h.name}: ${h.quantity} units | Buy NAV: ₹${h.buyPrice} | Current NAV: ₹${h.currentPrice} | P&L: ${fmtINR(h.pnlINR)} (${fmtPct(h.pnlPct)})`
      );
    });
  }

  const summary = calcSummary(holdings);
  lines.push(`\nTotal Invested: ${fmtINR(summary.totalInvestedINR)}`);
  lines.push(`Total Current Value: ${fmtINR(summary.totalCurrentINR)}`);
  lines.push(`Overall P&L: ${fmtINR(summary.totalPnlINR)} (${fmtPct(summary.totalPnlPct)})`);
  lines.push(`\nUSD/INR rate used: ₹${usdInr}`);
  lines.push("\nKripya batao: diversification kaisi hai, koi concentrated risk hai, kya changes karne chahiye?");

  return lines.join("\n");
}
