"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Calculator,
  Search,
  X,
  ChevronDown,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import {
  CALCULATORS,
  CALCULATOR_CATEGORIES,
  DEFAULT_CALCULATOR,
  type CalculatorCategoryId,
} from "@/components/trade/calculators/registry";
import "@/components/trade/calculators/calculators.css";

/**
 * Calculators master-detail page — Left-aligned vertical sidebar navigation
 * with active workspace on the right for clean, professional UX.
 */
export default function CalculatorsPage() {
  return (
    <Suspense fallback={<div className="trade-root h-full" />}>
      <CalculatorsView />
    </Suspense>
  );
}

const CATEGORY_NAMES: Record<string, string> = {
  risk: "Risk & Sizing",
  futures: "Futures & Margin",
  spot: "Spot & Execution",
  performance: "Performance & P&L",
};

function CalculatorsView() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("c") ?? DEFAULT_CALCULATOR;

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<CalculatorCategoryId>("all");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const activeIndex = CALCULATORS.findIndex((c) => c.id === requested);
  const active = activeIndex !== -1 ? CALCULATORS[activeIndex] : (CALCULATORS.find((c) => c.id === DEFAULT_CALCULATOR) ?? CALCULATORS[0]);
  const activeNo = activeIndex !== -1 ? activeIndex + 1 : 1;
  const Active = active.Component;
  const ActiveIcon = active.icon;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: CALCULATORS.length };
    for (const c of CALCULATORS) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filtered = useMemo(() => {
    return CALCULATORS.filter((c) => {
      const matchCat = selectedCat === "all" || c.category === selectedCat;
      if (!matchCat) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        c.blurb.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [selectedCat, search]);

  const selectCalculator = (id: string) => {
    router.replace(`/trade/calculators?c=${id}`, { scroll: false });
    setIsDrawerOpen(false);
  };

  return (
    <div className="trade-root trade-scroll h-full">
      {/* Topbar */}
      <header className="trade-topbar">
        <div className="trade-topbar-inner">
          <div className="trade-topbar-row" style={{ paddingBottom: 12 }}>
            <div className="trade-brand min-w-0">
              <Link href="/trade" className="trade-iconbtn" aria-label="Desk par wapas">
                <ArrowLeft className="w-[17px] h-[17px]" />
              </Link>
              <span className="trade-strategy-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Calculator className="w-4 h-4" />
              </span>
              <div className="trade-brand-text min-w-0">
                <div className="trade-brand-kicker">Cryptomantra</div>
                <div className="trade-brand-line">
                  <h1 className="trade-brand-title truncate">Calculators</h1>
                </div>
                <p className="trade-brand-meta truncate">Trade se pehle aur baad ka hisaab</p>
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

      <main className="max-w-[1520px] mx-auto px-3 sm:px-5 lg:px-8 pt-4 pb-24 lg:pb-12">
        <div className="cx-page space-y-4">
          {/* Intro Banner */}
          <div className="cx-intro">
            <span className="cx-kicker">Trader&apos;s toolkit • {CALCULATORS.length} precision calculators</span>
            <h2 className="cx-title">
              Trade lene se pehle, <span>hisaab pakka.</span>
            </h2>
            <p className="cx-sub">
              Position size, crypto fees, leverage, liquidation price, break-even, DCA, average entry, risk / reward, staking, tax aur P&amp;L — sab live, bina sign-in ke. Number badlo, result turant badalta hai.
            </p>
          </div>

          {/* Mobile Selector Header & Swipeable Chips */}
          <div className="cx-mobile-nav">
            <button
              type="button"
              className="cx-mobile-trigger"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Calculator badlein"
            >
              <div className="cx-mobile-trigger-left">
                <div className="cx-mobile-trigger-icon">
                  <ActiveIcon className="w-4 h-4" />
                </div>
                <div className="cx-mobile-trigger-text">
                  <small>{CATEGORY_NAMES[active.category] || "Toolkit"}</small>
                  <b>{active.label}</b>
                </div>
              </div>
              <div className="cx-mobile-trigger-right">
                <span>{String(activeNo).padStart(2, "0")} / {CALCULATORS.length}</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            {/* Quick Horizontal Chip Switcher */}
            <div className="cx-mobile-chips">
              {CALCULATORS.map((c, i) => {
                const on = c.id === active.id;
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="cx-mobile-chip"
                    data-active={on}
                    onClick={() => selectCalculator(c.id)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{c.label}</span>
                    <span className="opacity-60 text-[10px] font-mono">#{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Master-Detail Layout: Left-Aligned Vertical Sidebar + Right Active Stage */}
          <div className="cx-workbench">
            {/* ═══ LEFT VERTICAL SIDEBAR ═══ */}
            <aside className="cx-sidebar" aria-label="Calculators navigation">
              <div className="cx-sidebar-header">
                <div className="cx-sidebar-title-row">
                  <span className="cx-sidebar-title">
                    <Calculator className="w-4 h-4" />
                    Calculators
                  </span>
                  <span className="cx-sidebar-badge">{CALCULATORS.length} Tools</span>
                </div>

                {/* Instant Search Bar */}
                <div className="cx-sidebar-search">
                  <Search className="cx-sidebar-search-icon" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${CALCULATORS.length} calculators...`}
                    aria-label="Search calculators"
                  />
                  {search && (
                    <button
                      type="button"
                      className="cx-sidebar-search-clear"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="cx-sidebar-cats" role="tablist">
                  {CALCULATOR_CATEGORIES.map((cat) => {
                    const count = categoryCounts[cat.id] ?? 0;
                    const on = selectedCat === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        className="cx-cat-btn"
                        data-active={on}
                        onClick={() => setSelectedCat(cat.id)}
                      >
                        {cat.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vertically Stacked Calculator Boxes */}
              <nav className="cx-vlist" role="tablist" aria-label="Calculators list">
                {filtered.map((c) => {
                  const Icon = c.icon;
                  const on = c.id === active.id;
                  const originalIndex = CALCULATORS.findIndex((item) => item.id === c.id) + 1;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="cx-vitem"
                      data-active={on}
                      onClick={() => selectCalculator(c.id)}
                    >
                      <span className="cx-vitem-icon">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="cx-vitem-text">
                        <b>{c.label}</b>
                        <small>{c.short}</small>
                      </span>
                      <span className="cx-vitem-no">
                        {String(originalIndex).padStart(2, "0")}
                      </span>
                    </button>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="p-5 text-center text-xs text-[var(--text-muted)] space-y-2">
                    <p>Koi calculator nahi mila (&ldquo;{search}&rdquo;)</p>
                    <button
                      type="button"
                      className="cx-cat-btn inline-flex items-center gap-1 mx-auto"
                      onClick={() => {
                        setSearch("");
                        setSelectedCat("all");
                      }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Filter
                    </button>
                  </div>
                )}
              </nav>

              <div className="cx-sidebar-footer">
                <span>
                  <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                  100% Client-Side Live Math
                </span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">v2.4</span>
              </div>
            </aside>

            {/* ═══ RIGHT ACTIVE WORKSPACE ═══ */}
            <div className="cx-stage">
              {/* Active Calculator Header Banner */}
              <div className="cx-stage-header-card">
                <div className="cx-stage-badge-row">
                  <span className="cx-stage-cat-pill">
                    {CATEGORY_NAMES[active.category] || "Trader Toolkit"}
                  </span>
                  <span className="cx-stage-num-pill">
                    Tool #{String(activeNo).padStart(2, "0")} of {CALCULATORS.length}
                  </span>
                </div>

                <div className="cx-stage-title-wrap">
                  <div className="cx-stage-title-icon">
                    <ActiveIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="cx-stage-title">{active.label}</h3>
                    <p className="cx-stage-blurb">{active.blurb}</p>
                  </div>
                </div>
              </div>

              {/* Calculator Inputs & Real-time Live Output */}
              <div key={active.id}>
                <Active />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Drawer Overlay */}
      {isDrawerOpen && (
        <div
          className="cx-drawer-backdrop"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="cx-drawer-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cx-drawer-head">
              <div className="cx-drawer-title">
                <Calculator className="w-4 h-4 text-[var(--accent)]" />
                Select Calculator ({CALCULATORS.length})
              </div>
              <button
                type="button"
                className="cx-drawer-close"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Band karein"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-[rgba(148,163,184,0.1)] space-y-2">
              <div className="cx-sidebar-search">
                <Search className="cx-sidebar-search-icon" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search calculators..."
                />
                {search && (
                  <button
                    type="button"
                    className="cx-sidebar-search-clear"
                    onClick={() => setSearch("")}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="cx-sidebar-cats">
                {CALCULATOR_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="cx-cat-btn"
                    data-active={selectedCat === cat.id}
                    onClick={() => setSelectedCat(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cx-vlist p-3 max-h-[55vh]">
              {filtered.map((c) => {
                const Icon = c.icon;
                const on = c.id === active.id;
                const originalIndex = CALCULATORS.findIndex((item) => item.id === c.id) + 1;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="cx-vitem"
                    data-active={on}
                    onClick={() => selectCalculator(c.id)}
                  >
                    <span className="cx-vitem-icon">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="cx-vitem-text">
                      <b>{c.label}</b>
                      <small>{c.short}</small>
                    </span>
                    <span className="cx-vitem-no">
                      {String(originalIndex).padStart(2, "0")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
