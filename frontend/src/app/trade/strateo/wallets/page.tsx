"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/trade/AccountMenu";
import DeskFlowNav from "@/components/trade/DeskFlowNav";

const DemoWalletDesk = dynamic(() => import("@/components/trade/strateo/DemoWalletDesk"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

/** Strateo demo wallets — per-bot allocated amount, running P&L, active trades. */
export default function StrateoDemoWalletsPage() {
  const router = useRouter();
  return (
    <div className="trade-root">
      <div className="desk-shell">
        <DeskFlowNav
          variant="side"
          activeId="strateo-wallets"
          footer={<AccountMenu onOpenExchanges={() => router.push("/trade?tab=exchanges")} />}
        />
        <div className="desk-main">
          <DemoWalletDesk />
        </div>
      </div>
    </div>
  );
}
