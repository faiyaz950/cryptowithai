import type { LabCandle } from "@/lib/advancedBacktest";

const PAGE = 5000;
const MAX_PAGES = 10;

export interface LoadedBook {
  symbol: string;
  candles: LabCandle[];
  ended: boolean;
}

/** Walk backward with `end` until the period is filled or the exchange runs out. */
export async function loadLabHistory(
  symbol: string,
  interval: string,
  load: number,
  onPage: (page: number, got: number) => void,
): Promise<LoadedBook> {
  const byTime = new Map<number, LabCandle>();
  let end: number | null = null;
  let ended = false;

  for (let page = 1; page <= MAX_PAGES && byTime.size < load; page++) {
    const limit = Math.min(PAGE, load - byTime.size);
    const q = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
      exchange: "delta",
      include_rsi: "false",
    });
    if (end != null) q.set("end", String(end));
    let res: Response;
    try {
      res = await fetch(`/api/lab/candles?${q}`, { signal: AbortSignal.timeout(50000) });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`Timed out loading ${symbol.replace(/USDT$/, "USD")} page ${page}`);
      }
      throw e;
    }
    const data = await res.json().catch(() => null) as { success?: boolean; error?: string; candles?: LabCandle[] } | null;
    if (!res.ok || !data?.success || !Array.isArray(data.candles)) {
      throw new Error(data?.error || `Could not load ${symbol.replace(/USDT$/, "USD")}`);
    }
    const rows = data.candles;
    onPage(page, rows.length);
    if (!rows.length) {
      ended = true;
      break;
    }
    let oldest = Infinity;
    for (const row of rows) {
      if (!Number.isFinite(row.time)) continue;
      byTime.set(row.time, {
        time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
      });
      if (row.time < oldest) oldest = row.time;
    }
    if (!Number.isFinite(oldest) || (end != null && oldest >= end)) break;
    if (rows.length < limit) {
      ended = true;
      break;
    }
    end = oldest - 1;
  }

  const candles = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-load);
  if (candles.length < load) ended = true;
  return { symbol, candles, ended };
}
