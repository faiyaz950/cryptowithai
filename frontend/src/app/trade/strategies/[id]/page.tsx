"use client";

import { Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import Logo from "@/components/Logo";
import StrategyRunner from "@/components/trade/StrategyRunner";
import { symbolLabel } from "@/lib/cryptoApi";
import { STRATEGIES, getStrategy, str, valuesFromQuery, type StrategyDef } from "@/lib/strategies";

const BACK_HREF = "/trade?tab=strategies";

/**
 * Har strategy ka apna run page — registry (`src/lib/strategies.ts`) se dynamically
 * banta hai, isliye nayi strategy add karne par ye route apne aap kaam karta hai.
 */
export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const def = getStrategy(id);

  if (!def) return <UnknownStrategy id={id} />;

  return (
    <Suspense fallback={<Shell def={def}><div className="shimmer rounded-xl h-[420px]" /></Shell>}>
      <StrategyView def={def} />
    </Suspense>
  );
}

function StrategyView({ def }: { def: StrategyDef }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // Card par tune kiye gaye params query se aate hain; baaki defaults.
  const initialValues = useMemo(() => valuesFromQuery(def, searchParams), [def, searchParams]);

  const askAi = () => {
    const symbol = str(initialValues, "symbol", "BTCUSDT");
    const timeframe = str(initialValues, "timeframe", "1h");
    const prompt = `${def.name} strategy ${symbolLabel(symbol)} ke ${timeframe} chart par samjhao. ${def.logic} Entry, exit, risk aur is setup ki khaamiyan batao.`;
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    router.push("/");
  };

  return (
    <Shell def={def} active={active} onAskAi={askAi}>
      <StrategyRunner def={def} initialValues={initialValues} onActiveChange={setActive} />
    </Shell>
  );
}

/* ── Page shell ────────────────────────────────────────── */

function Shell({
  def,
  active,
  onAskAi,
  children,
}: {
  def: StrategyDef;
  active?: boolean;
  onAskAi?: () => void;
  children: React.ReactNode;
}) {
  const Icon = def.icon;

  return (
    <div className="trade-root h-full overflow-y-auto" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <header className="trade-topbar">
        <div className="max-w-[1720px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-3 h-[60px]">
            <Link href={BACK_HREF} className="trade-iconbtn" aria-label="Back to strategies">
              <ArrowLeft className="w-[17px] h-[17px]" />
            </Link>
            <Logo size={26} />
            <span className="trade-strategy-icon" style={{ background: `${def.accent}1a`, color: def.accent }}>
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold leading-tight tracking-tight truncate">{def.name}</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
                {def.category}
              </p>
            </div>

            <div className="flex-1" />

            <span className={`trade-badge ${active ? "trade-badge-green" : "trade-badge-neutral"}`}>
              {active ? <><span className="trade-dot" />Live</> : "Inactive"}
            </span>
            {onAskAi && (
              <button type="button" onClick={onAskAi} className="trade-btn trade-btn-primary">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </button>
            )}
          </div>

          {/* Sibling strategies — ek click mein switch */}
          <nav className="trade-tabs overflow-x-auto scrollbar-hide" aria-label="Strategies">
            {STRATEGIES.map((s) => (
              <Link
                key={s.id}
                href={`/trade/strategies/${s.id}`}
                data-active={s.id === def.id}
                aria-current={s.id === def.id ? "page" : undefined}
                className="trade-tab whitespace-nowrap"
              >
                {s.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[1720px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <section className="trade-panel trade-panel-body">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Logic:</strong>{" "}{def.logic}
          </p>
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
          naam ki koi strategy registry mein nahi hai.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {STRATEGIES.map((s) => (
            <Link key={s.id} href={`/trade/strategies/${s.id}`} className="trade-btn trade-btn-ghost">
              {s.name}
            </Link>
          ))}
        </div>
        <Link href={BACK_HREF} className="trade-btn trade-btn-primary w-full">
          Saari strategies dekho
        </Link>
      </div>
    </div>
  );
}
