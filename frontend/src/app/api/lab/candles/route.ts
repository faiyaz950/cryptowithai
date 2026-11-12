import { NextRequest, NextResponse } from "next/server";

/** Desk API on this machine first, then the public feed if that is down. */
function candleBases(): string[] {
  const out: string[] = [];
  const add = (value: string | undefined) => {
    const base = value?.replace(/\/$/, "");
    if (base && !out.includes(base)) out.push(base);
  };
  const internal = process.env.BACKEND_URL?.replace(/\/$/, "");
  if (internal) add(`${internal}/api`);
  add(process.env.NEXT_PUBLIC_CRYPTO_API_URL);
  add("http://127.0.0.1:8000/api");
  add("https://cryptomantra.tech/api");
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.toString();
  const bases = candleBases();
  let last = "No candles";
  let historyEnded = false;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/candles?${q}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.candles)) {
        if (data.candles.length) return NextResponse.json(data);
        historyEnded = true;
        continue;
      }
      last = typeof data?.error === "string" ? data.error : `Candle feed returned ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : last;
    }
  }
  if (historyEnded) return NextResponse.json({ success: true, candles: [] });
  return NextResponse.json({ success: false, error: last, candles: [] }, { status: 502 });
}
