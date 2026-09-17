"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, UserRound } from "lucide-react";

/**
 * Profile ka data sirf logged-in user ka hai (session token localStorage mein
 * hai), isliye server par render karne ka koi matlab nahi — client-only.
 */
const ProfileDesk = dynamic(() => import("@/components/profile/ProfileDesk"), {
  ssr: false,
  loading: () => <div className="shimmer rounded-xl h-[520px]" />,
});

export default function ProfilePage() {
  return (
    <div className="trade-root trade-scroll h-full">
      <header className="trade-topbar">
        <div className="trade-topbar-inner">
          <div className="trade-topbar-row" style={{ paddingBottom: 12 }}>
            <div className="trade-brand min-w-0">
              <Link href="/trade" className="trade-iconbtn" aria-label="Desk par wapas">
                <ArrowLeft className="w-[17px] h-[17px]" />
              </Link>
              <span
                className="trade-strategy-icon"
                style={{ background: "rgba(0, 230, 118, 0.14)", color: "var(--accent)" }}
              >
                <UserRound className="w-4 h-4" />
              </span>
              <div className="trade-brand-text min-w-0">
                <div className="trade-brand-kicker">Finowings Desk</div>
                <div className="trade-brand-line">
                  <h1 className="trade-brand-title truncate">Profile</h1>
                </div>
                <p className="trade-brand-meta truncate">Account · judi hui exchange ka live data</p>
              </div>
            </div>

            <div className="trade-topbar-actions">
              <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-ghost">
                Exchanges
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-5">
        <ProfileDesk />
      </main>
    </div>
  );
}
