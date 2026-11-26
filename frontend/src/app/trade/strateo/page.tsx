"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/trade/AccountMenu";
import DeskFlowNav from "@/components/trade/DeskFlowNav";

const StrateoDesk = dynamic(() => import("@/components/trade/strateo/StrateoDesk"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

/** Strateo — exchange ka chart baayein, strategy marketplace daayein. */
export default function StrateoPage() {
  const router = useRouter();
  return (
    <div className="trade-root">
      <div className="desk-shell">
        <DeskFlowNav
          variant="side"
          activeId="strateo"
          footer={<AccountMenu onOpenExchanges={() => router.push("/trade?tab=exchanges")} />}
        />
        <div className="desk-main">
          <StrateoDesk />
        </div>
      </div>
    </div>
  );
}
