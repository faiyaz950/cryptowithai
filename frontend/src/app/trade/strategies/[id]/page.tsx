"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileCode2, Pencil, Sparkles } from "lucide-react";
import StrategyRunner from "@/components/trade/StrategyRunner";
import { symbolLabel } from "@/lib/cryptoApi";
import { getStrategy, str, valuesFromQuery, type StrategyDef } from "@/lib/strategies";
import {
  CUSTOM_STRATEGIES_CHANGED,
  getCustomStrategy,
  toStrategyDef,
  type CustomStrategy,
} from "@/lib/strategyBuilder";

/**
 * Strategy run page — catalogue from `strategies.ts`, custom from localStorage.
 */
export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const builtIn = getStrategy(id);

  if (builtIn) {
    return (
      <Suspense fallback={<Shell def={builtIn} backHref="/trade?tab=strategies"><div className="shimmer rounded-xl h-[420px]" /></Shell>}>
        <StrategyView def={builtIn} backHref="/trade?tab=strategies" />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="h-full shimmer" style={{ background: "var(--bg-primary)" }} />}>
      <CustomStrategyGate id={id} />
    </Suspense>
  );
}

function CustomStrategyGate({ id }: { id: string }) {
  const [custom, setCustom] = useState<CustomStrategy | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCustom(getCustomStrategy(id));
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
  if (!custom) return <UnknownStrategy id={id} />;

  const def = toStrategyDef(custom);
  return (
    <StrategyView
      def={def}
      backHref="/trade?tab=mine"
      editHref={`/trade?tab=builder&edit=${custom.id}`}
    />
  );
}

function StrategyView({
  def,
  backHref,
  editHref,
}: {
  def: StrategyDef;
  backHref: string;
  editHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialValues = useMemo(() => valuesFromQuery(def, searchParams), [def, searchParams]);

  const askAi = () => {
    const symbol = str(initialValues, "symbol", "BTCUSDT");
    const timeframe = str(initialValues, "timeframe", "1h");
    const prompt = `Explain the ${def.name} strategy on ${symbolLabel(symbol)} ${timeframe}. ${def.logic} Cover entry, exit, risk, and weaknesses.`;
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    router.push("/trade?tab=ai");
  };

  return (
    <Shell
      def={def}
      onAskAi={askAi}
      scriptHref={`/trade/strategies/${def.id}/script`}
      backHref={backHref}
      editHref={editHref}
    >
      <StrategyRunner
        def={def}
        initialValues={initialValues}
        autoBacktest={searchParams.get("backtest") === "1"}
      />
    </Shell>
  );
}

/* ── Page shell ────────────────────────────────────────── */

function Shell({
  def,
  onAskAi,
  scriptHref,
  children,
  backHref = "/trade?tab=strategies",
  editHref,
}: {
  def: StrategyDef;
  onAskAi?: () => void;
  scriptHref?: string;
  children: React.ReactNode;
  backHref?: string;
  editHref?: string;
}) {
  const Icon = def.icon;

  return (
    <div className="trade-root trade-scroll sr-page h-full">
      <header className="trade-topbar">
        <div className="trade-topbar-inner">
          <div className="trade-topbar-row" style={{ paddingBottom: 12, paddingTop: 4 }}>
            <div className="trade-brand min-w-0 gap-2.5">
              <Link href={backHref} className="trade-iconbtn" aria-label="Back to strategies">
                <ArrowLeft className="w-[17px] h-[17px]" />
              </Link>
              <span
                className="trade-strategy-icon flex-none"
                style={{ background: `${def.accent}22`, color: def.accent }}
              >
                <Icon className="w-4 h-4" />
              </span>
              <div className="trade-brand-text min-w-0">
                <div className="trade-brand-line">
                  <h1 className="trade-brand-title truncate">{def.name}</h1>
                </div>
              </div>
            </div>

            <div className="trade-topbar-actions">
              {scriptHref && (
                <Link href={scriptHref} className="trade-btn trade-btn-ghost trade-size-sm" title="Script">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Script</span>
                </Link>
              )}
              {editHref && (
                <Link href={editHref} className="trade-btn trade-btn-ghost trade-size-sm" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </Link>
              )}
              {onAskAi && (
                <button type="button" onClick={onAskAi} className="trade-btn trade-btn-ghost trade-size-sm" title="Ask AI">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="sr-shell">
        {children}
      </main>
    </div>
  );
}

function UnknownStrategy({ id }: { id: string }) {
  return (
    <div className="trade-root trade-scroll h-full flex items-center justify-center px-4" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="trade-panel trade-panel-body max-w-[460px] w-full text-center space-y-3">
        <h1 className="text-[16px] font-bold">Strategy not found</h1>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>{id}</code>{" "}
          is not in the catalogue or your saved list.
        </p>
        <Link href="/trade?tab=strategies" className="trade-btn trade-btn-primary w-full">
          Browse catalogue
        </Link>
      </div>
    </div>
  );
}
