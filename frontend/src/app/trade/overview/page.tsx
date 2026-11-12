"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/trade/AccountMenu";
import DeskFlowNav from "@/components/trade/DeskFlowNav";

const MarketOverview = dynamic(() => import("@/components/trade/overview/MarketOverview"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 520,
        borderRadius: 16,
        background: "linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.015))",
        border: "1px solid rgb(255 255 255 / 0.06)",
      }}
    />
  ),
});

/**
 * Overview apna route hai, par desk ke baaki tabs ki tarah side rail ke
 * andar dikhta hai — back button ki zarurat nahi, rail se kahin bhi jao.
 */
export default function MarketOverviewPage() {
  const router = useRouter();
  return (
    <div className="trade-root">
      <div className="desk-shell">
        <DeskFlowNav
          variant="side"
          activeId="overview"
          footer={<AccountMenu onOpenExchanges={() => router.push("/trade?tab=exchanges")} />}
        />
        <div className="desk-main">
          <div className="desk-body">
            <div className="trade-page-head">
              <div className="trade-page-copy">
                <h1 className="trade-page-title">Market overview</h1>
                <p className="trade-page-line">Market pulse, sentiment, movers aur heatmap — ek nazar mein.</p>
              </div>
              <Link href="/trade?tab=markets" className="prem-link">
                Open terminal
              </Link>
            </div>
            <MarketOverview />
          </div>
        </div>
      </div>
    </div>
  );
}
