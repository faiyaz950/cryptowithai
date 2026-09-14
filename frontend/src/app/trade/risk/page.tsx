"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CRYPTO_SYMBOLS } from "@/lib/cryptoApi";

/**
 * Saved plans aur sticky settings localStorage se pehle render par hi chahiye,
 * isliye ye desk client-only hai — warna server HTML defaults dikhata aur
 * hydration par sab kuch badal jaata.
 */
const RiskDesk = dynamic(() => import("@/components/trade/RiskDesk"), {
  ssr: false,
  loading: () => <div className="shimmer rounded-xl h-[520px]" />,
});

/**
 * Risk Desk ka apna page — desk ke baaki tabs analysis karte hain, ye sizing
 * karta hai. `?symbol=` se Markets/Screener se seedha yahan aaya ja sakta hai.
 */
export default function RiskPage() {
  return (
    <Suspense fallback={<div className="trade-root h-full" />}>
      <RiskView />
    </Suspense>
  );
}

function RiskView() {
  const params = useSearchParams();
  const requested = (params.get("symbol") || "").toUpperCase();
  const symbol = CRYPTO_SYMBOLS.some((s) => s.value === requested) ? requested : "BTCUSDT";

  return (
    <div className="trade-root trade-scroll h-full">
      <header className="trade-topbar">
        <div className="trade-topbar-inner">
          <div className="trade-topbar-row" style={{ paddingBottom: 12 }}>
            <div className="trade-brand min-w-0">
              <Link href="/trade" className="trade-iconbtn" aria-label="Desk par wapas">
                <ArrowLeft className="w-[17px] h-[17px]" />
              </Link>
              <span className="trade-strategy-icon" style={{ background: "rgba(0, 230, 118, 0.14)", color: "var(--accent)" }}>
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="trade-brand-text min-w-0">
                <div className="trade-brand-kicker">Finowings Desk</div>
                <div className="trade-brand-line">
                  <h1 className="trade-brand-title truncate">Risk Desk</h1>
                </div>
                <p className="trade-brand-meta truncate">Position sizing · liquidation · portfolio heat</p>
              </div>
            </div>

            <div className="trade-topbar-actions">
              <Link href="/trade?tab=markets" className="trade-btn trade-btn-ghost">
                <span className="hidden sm:inline">Markets</span>
                <span className="sm:hidden">Chart</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1720px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-5">
        <RiskDesk initialSymbol={symbol} />
      </main>
    </div>
  );
}
