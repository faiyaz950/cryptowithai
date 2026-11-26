"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/trade/AccountMenu";
import DeskFlowNav from "@/components/trade/DeskFlowNav";

const AdvancedLab = dynamic(() => import("@/components/trade/advanced/AdvancedLab"), {
  ssr: false,
  loading: () => <div style={{ height: 480 }} />,
});

export default function BacktesterPage() {
  const router = useRouter();
  return (
    <div className="trade-root">
      <div className="desk-shell">
        <DeskFlowNav
          variant="side"
          activeId="backtester"
          footer={<AccountMenu onOpenExchanges={() => router.push("/trade?tab=exchanges")} />}
        />
        <div className="desk-main">
          <div className="desk-body lab-page">
            <div className="trade-page-head">
              <div className="trade-page-copy">
                <h1 className="trade-page-title">Backtester</h1>
                <p className="trade-page-line">
                  Build the rules, then run them. A candle that touches the stop and the target counts as the stop. The final-test date is scored apart and is not used to tune.
                </p>
              </div>
            </div>
            <AdvancedLab />
          </div>
        </div>
      </div>
    </div>
  );
}
