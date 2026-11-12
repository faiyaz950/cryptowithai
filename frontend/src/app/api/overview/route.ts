import { NextResponse } from "next/server";

/**
 * Market Overview ke liye public feeds — CoinGecko global + alternative.me Fear & Greed.
 * Browser se seedha call CORS / rate-limit pe toot sakta hai, isliye yahan proxy.
 */

export const revalidate = 60;

type FearPoint = { value: number; classification: string; timestamp: number };

export async function GET() {
  const [globalRes, fearRes, chartRes] = await Promise.allSettled([
    fetch("https://api.coingecko.com/api/v3/global", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    }),
    fetch("https://api.alternative.me/fng/?limit=2", {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    }),
    // Free tier pe global market_cap_chart PRO-only hai.
    // BTC 7d price = risk/mood proxy only — UI pe "BTC trend proxy" label hota hai.
    fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7",
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) },
    ),
  ]);

  let marketCapUsd: number | null = null;
  let marketCapChange24h: number | null = null;
  let btcDominance: number | null = null;
  let activeCryptos: number | null = null;

  if (globalRes.status === "fulfilled" && globalRes.value.ok) {
    try {
      const json = await globalRes.value.json();
      const data = json?.data;
      marketCapUsd = num(data?.total_market_cap?.usd);
      marketCapChange24h = num(data?.market_cap_change_percentage_24h_usd);
      btcDominance = num(data?.market_cap_percentage?.btc);
      activeCryptos = num(data?.active_cryptocurrencies);
    } catch {
      /* ignore parse errors */
    }
  }

  let fearGreed: FearPoint | null = null;
  let fearGreedPrev: FearPoint | null = null;
  if (fearRes.status === "fulfilled" && fearRes.value.ok) {
    try {
      const json = await fearRes.value.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      fearGreed = parseFear(rows[0]);
      fearGreedPrev = parseFear(rows[1]);
    } catch {
      /* ignore */
    }
  }

  let marketCapSpark: number[] = [];
  if (chartRes.status === "fulfilled" && chartRes.value.ok) {
    try {
      const json = await chartRes.value.json();
      const series = json?.prices ?? json?.market_caps ?? [];
      if (Array.isArray(series)) {
        marketCapSpark = series
          .map((row: unknown) => {
            if (Array.isArray(row) && typeof row[1] === "number") return row[1];
            return null;
          })
          .filter((n: number | null): n is number => n != null)
          .slice(-48);
      }
    } catch {
      /* ignore — sparkline optional */
    }
  }

  return NextResponse.json({
    success: true,
    updatedAt: Date.now(),
    marketCapUsd,
    marketCapChange24h,
    btcDominance,
    activeCryptos,
    marketCapSpark,
    fearGreed,
    fearGreedPrev,
  });
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseFear(row: unknown): FearPoint | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { value?: string; value_classification?: string; timestamp?: string };
  const value = Number(r.value);
  const timestamp = Number(r.timestamp) * 1000;
  if (!Number.isFinite(value)) return null;
  return {
    value,
    classification: r.value_classification || "Neutral",
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}
