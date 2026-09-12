"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Sparkles } from "lucide-react";
import Logo from "@/components/Logo";
import StrategyRunner from "@/components/trade/StrategyRunner";
import { symbolLabel } from "@/lib/cryptoApi";
import { STRATEGIES, getStrategy, str, valuesFromQuery, type StrategyDef } from "@/lib/strategies";
import {
  CUSTOM_STRATEGIES_CHANGED,
  customStrategyHref,
  getCustomStrategy,
  listCustomStrategies,
  setCustomStrategyStatus,
  toStrategyDef,
  type CustomStrategy,
} from "@/lib/strategyBuilder";

/**
 * Har strategy ka apna run page — registry (`src/lib/strategies.ts`) se dynamically
 * banta hai. Custom (builder) strategies localStorage se resolve hoti hain.
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
  const [siblings, setSiblings] = useState<CustomStrategy[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCustom(getCustomStrategy(id));
      setSiblings(listCustomStrategies().filter((s) => s.status !== "archived"));
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
      isCustom
      customSiblings={siblings}
      editHref={`/trade?tab=builder&edit=${custom.id}`}
    />
  );
}

function StrategyView({
  def,
  backHref,
  isCustom,
  customSiblings,
  editHref,
}: {
  def: StrategyDef;
  backHref: string;
  isCustom?: boolean;
  customSiblings?: CustomStrategy[];
  editHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  const initialValues = useMemo(() => valuesFromQuery(def, searchParams), [def, searchParams]);

  const askAi = () => {
    const symbol = str(initialValues, "symbol", "BTCUSDT");
    const timeframe = str(initialValues, "timeframe", "1h");
    const prompt = `${def.name} strategy ${symbolLabel(symbol)} ke ${timeframe} chart par samjhao. ${def.logic} Entry, exit, risk aur is setup ki khaamiyan batao.`;
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    router.push("/");
  };

  return (
    <Shell
      def={def}
      active={active}
      onAskAi={askAi}
      backHref={backHref}
      isCustom={isCustom}
      customSiblings={customSiblings}
      editHref={editHref}
    >
      <StrategyRunner
        def={def}
        initialValues={initialValues}
        onActiveChange={(next) => {
          setActive(next);
          if (isCustom) setCustomStrategyStatus(def.id, next ? "live" : "paused");
        }}
      />
    </Shell>
  );
}

/* ── Page shell ────────────────────────────────────────── */

function Shell({
  def,
  active,
  onAskAi,
  children,
  backHref = "/trade?tab=strategies",
  isCustom,
  customSiblings,
  editHref,
}: {
  def: StrategyDef;
  active?: boolean;
  onAskAi?: () => void;
  children: React.ReactNode;
  backHref?: string;
  isCustom?: boolean;
  customSiblings?: CustomStrategy[];
  editHref?: string;
}) {
  const Icon = def.icon;
  const navItems = isCustom
    ? (customSiblings ?? []).map((s) => ({ id: s.id, name: s.name.trim() || "Untitled", href: customStrategyHref(s.id) }))
    : STRATEGIES.map((s) => ({ id: s.id, name: s.name, href: `/trade/strategies/${s.id}` }));

  return (
    <div className="trade-root h-full overflow-y-auto">
      <header className="trade-topbar">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-2 sm:gap-3 h-[52px] sm:h-[58px]">
            <Link href={backHref} className="trade-iconbtn" aria-label="Back">
              <ArrowLeft className="w-[17px] h-[17px]" />
            </Link>
            <Logo size={24} />
            <span className="trade-strategy-icon" style={{ background: `${def.accent}22`, color: def.accent }}>
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="trade-brand-kicker">{isCustom ? "Custom strategy" : "Catalogue"}</div>
              <h1 className="trade-brand-title truncate">{def.name}</h1>
              <p className="trade-brand-meta truncate">{def.category}</p>
            </div>

            <div className="flex-1" />

            <span className={`trade-badge ${active ? "trade-badge-green" : "trade-badge-neutral"}`}>
              {active ? <><span className="trade-dot" />Live</> : "Inactive"}
            </span>
            {editHref && (
              <Link href={editHref} className="trade-btn trade-btn-ghost">
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </Link>
            )}
            {onAskAi && (
              <button type="button" onClick={onAskAi} className="trade-btn trade-btn-primary">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </button>
            )}
          </div>

          <div className="trade-tabs-wrap">
            <nav className="trade-tabs overflow-x-auto scrollbar-hide" aria-label="Strategies">
              {navItems.map((s) => (
                <Link
                  key={s.id}
                  href={s.href}
                  data-active={s.id === def.id}
                  aria-current={s.id === def.id ? "page" : undefined}
                  className="trade-tab whitespace-nowrap"
                >
                  {s.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-[1720px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-5 space-y-3 sm:space-y-4">
        <section className="trade-panel trade-panel-body">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Logic:</strong>{" "}{def.logic}
          </p>
          {def.engineNote && (
            <p className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              {def.engineNote}
            </p>
          )}
        </section>
        {children}
      </main>
    </div>
  );
}

function UnknownStrategy({ id }: { id: string }) {
  return (
    <div className="trade-root h-full overflow-y-auto flex items-center justify-center px-4" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="trade-panel trade-panel-body max-w-[460px] w-full text-center space-y-3">
        <h1 className="text-[16px] font-bold">Ye strategy nahi mili</h1>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>{id}</code>{" "}
          naam ki koi strategy registry ya aapki saved list mein nahi hai.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link href="/trade?tab=mine" className="trade-btn trade-btn-ghost">
            My strategies
          </Link>
          <Link href="/trade?tab=builder" className="trade-btn trade-btn-ghost">
            Strategy builder
          </Link>
        </div>
        <Link href="/trade?tab=strategies" className="trade-btn trade-btn-primary w-full">
          Catalogue dekho
        </Link>
      </div>
    </div>
  );
}
