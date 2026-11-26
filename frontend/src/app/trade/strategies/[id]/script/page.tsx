"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileCode2 } from "lucide-react";
import StrategyScriptPanel from "@/components/trade/StrategyScriptPanel";
import { getStrategy, type StrategyDef } from "@/lib/strategies";
import {
  CUSTOM_STRATEGIES_CHANGED,
  getCustomStrategy,
  toStrategyDef,
} from "@/lib/strategyBuilder";

/** Dedicated Script screen — not embedded on the strategy runner page. */
export default function StrategyScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const builtIn = getStrategy(id);

  if (builtIn) {
    return <ScriptScreen def={builtIn} backHref={`/trade/strategies/${builtIn.id}`} />;
  }

  return <CustomScriptGate id={id} />;
}

function CustomScriptGate({ id }: { id: string }) {
  const [def, setDef] = useState<StrategyDef | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const custom = getCustomStrategy(id);
      setDef(custom ? toStrategyDef(custom) : null);
      setReady(true);
    };
    sync();
    window.addEventListener(CUSTOM_STRATEGIES_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CUSTOM_STRATEGIES_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);

  if (!ready) {
    return <div className="h-full shimmer" style={{ background: "var(--bg-primary)" }} />;
  }
  if (!def) {
    return (
      <div
        className="trade-root trade-scroll h-full flex items-center justify-center px-4"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <div className="trade-panel trade-panel-body max-w-[460px] w-full text-center space-y-3">
          <h1 className="text-[16px] font-bold">Strategy not found</h1>
          <Link href="/trade?tab=strategies" className="trade-btn trade-btn-primary w-full">
            Browse catalogue
          </Link>
        </div>
      </div>
    );
  }

  return <ScriptScreen def={def} backHref={`/trade/strategies/${def.id}`} />;
}

function ScriptScreen({ def, backHref }: { def: StrategyDef; backHref: string }) {
  const Icon = def.icon;

  return (
    <div className="trade-root trade-scroll h-full script-screen">
      <header className="trade-topbar">
        <div className="trade-topbar-inner">
          <div className="trade-topbar-row" style={{ paddingBottom: 12, paddingTop: 4 }}>
            <div className="trade-brand min-w-0 gap-2.5">
              <Link href={backHref} className="trade-iconbtn" aria-label="Back to strategy">
                <ArrowLeft className="w-[17px] h-[17px]" />
              </Link>
              <span
                className="trade-strategy-icon flex-none"
                style={{ background: `${def.accent}22`, color: def.accent }}
              >
                <FileCode2 className="w-4 h-4" />
              </span>
              <div className="trade-brand-text min-w-0">
                <div className="trade-brand-line">
                  <h1 className="trade-brand-title truncate">Script</h1>
                </div>
                <p className="text-[12.5px] leading-snug mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {def.name}
                </p>
              </div>
            </div>

            <div className="trade-topbar-actions">
              <Link href={backHref} className="trade-btn trade-btn-ghost trade-size-sm">
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open strategy</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="script-screen-main">
        <StrategyScriptPanel def={def} />
      </main>
    </div>
  );
}
