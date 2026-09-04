import * as XLSX from "xlsx";
import {
  parseBrokerFile,
  parsedToHoldings,
  type ImportResult,
  type ParsedHolding,
} from "./brokerImport";
import type { Holding } from "./portfolio";

export type PortfolioFileFormat = "csv" | "excel" | "pdf" | "unknown";

export interface PortfolioFileImportResult extends ImportResult {
  format: PortfolioFileFormat;
  fileName: string;
  /** Raw extracted text — useful for PDF / AI context when structured parse is partial */
  rawText?: string;
  holdingsReady: Omit<Holding, "id" | "addedAt">[];
}

const MAX_RAW_CONTEXT = 12_000;

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Try regex line parsing when CSV headers are missing (common in PDF exports). */
function parseHoldingsFromLooseText(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const holdings: ParsedHolding[] = [];
  let skipped = 0;
  const errors: string[] = [];

  const rowPatterns = [
    /^([A-Z][A-Z0-9&.-]{1,20})\s+[\|,\t]?\s*(\d+(?:\.\d+)?)\s+[\|,\t]?\s*([\d,]+(?:\.\d+)?)/,
    /^(\d+)\s+([A-Z][A-Z0-9&.-]{1,20})\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/,
    /([A-Z][A-Z0-9&.-]{2,15})\s+Qty[:\s]+(\d+(?:\.\d+)?)\s+.*?Avg[:\s]+([\d,]+(?:\.\d+)?)/i,
  ];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (
      upper.includes("SYMBOL") &&
      (upper.includes("QTY") || upper.includes("QUANTITY"))
    ) {
      continue;
    }
    if (upper.startsWith("TOTAL") || upper.startsWith("GRAND") || upper.startsWith("PAGE ")) {
      skipped++;
      continue;
    }

    let matched = false;
    for (let pi = 0; pi < rowPatterns.length; pi++) {
      const m = line.match(rowPatterns[pi]);
      if (!m) continue;

      let symbol: string;
      let quantity: number;
      let buyPrice: number;

      if (pi === 1) {
        quantity = parseFloat(m[1]);
        symbol = m[2].replace(/\.NS$|\.BSE$|-EQ$/i, "").trim();
        buyPrice = parseFloat(m[3].replace(/,/g, ""));
      } else if (pi === 2) {
        symbol = m[1].replace(/\.NS$|\.BSE$|-EQ$/i, "").trim();
        quantity = parseFloat(m[2]);
        buyPrice = parseFloat(m[3].replace(/,/g, ""));
      } else {
        symbol = m[1].replace(/\.NS$|\.BSE$|-EQ$/i, "").trim();
        quantity = parseFloat(m[2]);
        buyPrice = parseFloat(m[3].replace(/,/g, ""));
      }

      if (symbol && quantity > 0) {
        holdings.push({
          symbol,
          name: symbol,
          quantity,
          buyPrice: buyPrice > 0 ? buyPrice : 0,
        });
        matched = true;
        break;
      }
    }

    if (!matched) skipped++;
  }

  if (!holdings.length) {
    errors.push("Structured holdings nahi mili — raw document AI ko bheja jayega.");
  }

  return { holdings, skipped, errors };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }

  return parts.join("\n");
}

async function readExcelAsCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) return "";

  let bestCsv = "";
  let bestCount = 0;

  for (const sheetName of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    const parsed = parseBrokerFile(csv);
    if (parsed.holdings.length > bestCount) {
      bestCount = parsed.holdings.length;
      bestCsv = csv;
    }
  }

  if (bestCsv) return bestCsv;
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
}

function mergeParseAttempts(text: string, fileName?: string): ImportResult {
  // Groww order history Excel files
  if (fileName && /order.?history|tradebook|trade.?book/i.test(fileName)) {
    const orderTry = parseBrokerFile(text);
    if (orderTry.holdings.length) return orderTry;
  }

  const brokerTry = parseBrokerFile(text);
  if (brokerTry.holdings.length) return brokerTry;

  const looseTry = parseHoldingsFromLooseText(text);
  if (looseTry.holdings.length) return looseTry;

  return brokerTry.errors.length ? brokerTry : looseTry;
}

export function truncateForAIContext(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_RAW_CONTEXT) return t;
  return t.slice(0, MAX_RAW_CONTEXT) + "\n… [truncated]";
}

/**
 * Parse portfolio file: CSV, Excel (.xlsx/.xls), or PDF.
 */
export async function parsePortfolioFile(
  file: File
): Promise<PortfolioFileImportResult> {
  const ext = extOf(file.name);
  let format: PortfolioFileFormat = "unknown";
  let text = "";

  try {
    if (ext === "csv" || ext === "txt") {
      format = "csv";
      text = await file.text();
    } else if (ext === "xlsx" || ext === "xls") {
      format = "excel";
      text = await readExcelAsCsvText(file);
    } else if (ext === "pdf") {
      format = "pdf";
      text = await extractPdfText(file);
    } else {
      text = await file.text();
      format = "csv";
    }
  } catch (e) {
    return {
      holdings: [],
      skipped: 0,
      errors: [
        e instanceof Error ? e.message : "File read nahi ho payi",
      ],
      format,
      fileName: file.name,
      holdingsReady: [],
    };
  }

  if (!text.trim()) {
    return {
      holdings: [],
      skipped: 0,
      errors: ["File khali hai ya text extract nahi hua"],
      format,
      fileName: file.name,
      rawText: "",
      holdingsReady: [],
    };
  }

  const parsed = mergeParseAttempts(text, file.name);
  const holdingsReady = parsedToHoldings(parsed.holdings);

  return {
    ...parsed,
    format,
    fileName: file.name,
    rawText: truncateForAIContext(text),
    holdingsReady,
  };
}
