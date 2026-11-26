import { NextResponse } from "next/server";

/**
 * Market Overview ke liye ticker proxy.
 * Local FastAPI band ho to production desk se padho — overview research page
 * bina local uvicorn ke bhi bhare.
 */
export const revalidate = 15;

const LOCAL = process.env.NEXT_PUBLIC_CRYPTO_API_URL || "http://127.0.0.1:8000/api";
const PROD = "https://cryptomantra.tech/api";

async function pull(base: string) {
  const res = await fetch(`${base}/market/tickers`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${base} ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const data = await pull(LOCAL);
    if (data?.success && Array.isArray(data.tickers) && data.tickers.length) {
      return NextResponse.json(data);
    }
  } catch {
    /* fall through */
  }

  try {
    const data = await pull(PROD);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "tickers unavailable", tickers: [] },
      { status: 502 },
    );
  }
}
