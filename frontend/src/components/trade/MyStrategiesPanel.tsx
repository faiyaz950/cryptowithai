"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { symbolLabel } from "@/lib/cryptoApi";
import {
  CUSTOM_STRATEGIES_CHANGED,
  customStrategyHref,
  deleteCustomStrategy,
  listCustomStrategies,
  setCustomStrategyStatus,
  summarizeStrategy,
  type CustomStrategy,
  type StrategyStatus,
} from "@/lib/strategyBuilder";

type Filter = "all" | "live" | "paused" | "draft" | "archived";

interface Props {
  onCreate: () => void;
  onEdit: (id: string) => void;
}

function fmtMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function statusBadge(status: StrategyStatus): string {
  if (status === "live") return "trade-badge-green";
  if (status === "paused") return "trade-badge-amber";
  if (status === "archived") return "trade-badge-neutral";
  return "trade-badge-blue";
}

export default function MyStrategiesPanel({ onCreate, onEdit }: Props) {
  const [items, setItems] = useState<CustomStrategy[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "name" | "pnl">("updated");
  const [selected, setSelected] = useState<string | null>(null);

  const sync = useCallback(() => {
    setItems(listCustomStrategies());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(CUSTOM_STRATEGIES_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CUSTOM_STRATEGIES_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  const counts = useMemo(() => {
    const c = { all: items.length, live: 0, paused: 0, draft: 0, archived: 0 };
    for (const s of items) c[s.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items.filter((s) => (filter === "all" ? true : s.status === filter));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.market.symbols.some((sym) => symbolLabel(sym).toLowerCase().includes(q)),
      );
    }
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "pnl") return (b.stats?.closedPnl30d ?? 0) - (a.stats?.closedPnl30d ?? 0);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [items, filter, query, sort]);

  const selectedStrategy = filtered.find((s) => s.id === selected) ?? filtered[0] ?? null;

  useEffect(() => {
    if (selectedStrategy && selected !== selectedStrategy.id) {
      setSelected(selectedStrategy.id);
    }
  }, [selectedStrategy, selected]);

  const kpis = useMemo(() => {
    const closed = items.reduce((a, s) => a + (s.stats?.closedPnl30d ?? 0), 0);
    const trades = items.reduce((a, s) => a + (s.stats?.closedTrades ?? 0), 0);
    const live = items.filter((s) => s.status === "live").length;
    const drafts = items.filter((s) => s.status === "draft").length;
    return [
      { label: "Closed PnL 30D", value: fmtMoney(closed), color: closed >= 0 ? "var(--green)" : "var(--red)" },
      { label: "Open PnL", value: "—", color: undefined },
      { label: "Closed trades", value: String(trades), color: undefined },
      { label: "Live", value: String(live), color: "var(--accent)" },
      { label: "Drafts", value: String(drafts), color: undefined },
      { label: "AI strategies", value: "0", color: "var(--accent)" },
    ];
  }, [items]);

  const monthLine = useMemo(() => {
    const closed = items.reduce((a, s) => a + (s.stats?.closedPnl30d ?? 0), 0);
    const trades = items.reduce((a, s) => a + (s.stats?.closedTrades ?? 0), 0);
    return `Closed ${fmtMoney(closed)} this month · ${trades} trades`;
  }, [items]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "live", label: "Live" },
    { id: "paused", label: "Paused" },
    { id: "draft", label: "Draft" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="ms-root space-y-4">
      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="trade-stat-label tracking-[0.12em]">My strategies</div>
          <h2 className="text-[26px] font-extrabold tracking-tight mt-1 leading-tight">
            {items.length === 0 ? "No strategies yet" : `${items.length} strateg${items.length === 1 ? "y" : "ies"}`}
          </h2>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
            {monthLine}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="trade-btn trade-btn-primary" onClick={onCreate}>
            <Plus className="w-4 h-4" />
            New strategy
          </button>
        </div>
      </div>

      {/* KPI rail */}
      <div className="trade-panel overflow-hidden">
        <div className="ms-kpi-rail">
          {kpis.map((k) => (
            <div key={k.label} className="ms-kpi">
              <div className="trade-stat-label">{k.label}</div>
              <div className="ms-kpi-value tnum" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="ms-filters">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              data-active={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="ms-filter"
            >
              {f.label}
              <span className="ms-filter-count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="ms-search">
          <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strategies…"
            aria-label="Search strategies"
          />
        </div>
        <select
          className="trade-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort by"
        >
          <option value="updated">Sort · Updated</option>
          <option value="name">Sort · Name</option>
          <option value="pnl">Sort · PnL 30D</option>
        </select>
      </div>

      {/* List + detail */}
      <div className="ms-split">
        <div className="trade-panel overflow-hidden min-w-0">
          {filtered.length === 0 ? (
            <div className="ms-empty">
              <Wand2 className="w-8 h-8 mb-3" style={{ color: "var(--accent)" }} />
              <div className="text-[15px] font-bold">
                {items.length === 0 ? "Apni pehli strategy banao" : "No strategies match this filter"}
              </div>
              <p className="text-[13px] mt-1.5 max-w-sm" style={{ color: "var(--text-muted)" }}>
                {items.length === 0
                  ? "Market, indicator conditions, aur risk rules drag-free cockpit mein set karo — phir Deploy."
                  : "Filter ya search change karke dekho."}
              </p>
              {items.length === 0 && (
                <button type="button" className="trade-btn trade-btn-primary mt-4" onClick={onCreate}>
                  <Plus className="w-4 h-4" />
                  Open strategy builder
                </button>
              )}
            </div>
          ) : (
            <ul className="ms-list">
              {filtered.map((s) => {
                const active = selectedStrategy?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="ms-row"
                      data-active={active}
                      onClick={() => setSelected(s.id)}
                    >
                      <div className="ms-row-top">
                        <span className="ms-row-name">{s.name || "Untitled"}</span>
                        <span className="flex items-center gap-1.5">
                          <span className={`trade-badge ${statusBadge(s.status)}`}>{s.status}</span>
                          <Link
                            href={customStrategyHref(s.id)}
                            className="trade-iconbtn trade-iconbtn-sm"
                            aria-label={`Open ${s.name || "strategy"}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Open & run"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </Link>
                        </span>
                      </div>
                      <div className="ms-row-meta">
                        {s.market.direction} · {s.market.symbols.map(symbolLabel).join(", ") || "—"} · {s.market.interval}
                      </div>
                      <div className="ms-row-pnl tnum" style={{ color: (s.stats?.closedPnl30d ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                        {fmtMoney(s.stats?.closedPnl30d ?? 0)}
                        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> · 30D</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="trade-panel ms-detail">
          {!selectedStrategy ? (
            <div className="ms-empty" style={{ minHeight: 280 }}>
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Select a strategy to see its detail.
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`trade-badge ${statusBadge(selectedStrategy.status)} mb-2`}>
                    {selectedStrategy.status}
                  </div>
                  <h3 className="text-[18px] font-extrabold tracking-tight">
                    {selectedStrategy.name || "Untitled"}
                  </h3>
                  {selectedStrategy.description && (
                    <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                      {selectedStrategy.description}
                    </p>
                  )}
                </div>
              </div>

              <p className="ms-detail-summary">{summarizeStrategy(selectedStrategy)}</p>

              <div className="ms-detail-grid">
                <div>
                  <div className="trade-stat-label">Leverage</div>
                  <div className="text-[14px] font-bold tnum mt-1">{selectedStrategy.market.leverage}x</div>
                </div>
                <div>
                  <div className="trade-stat-label">Size</div>
                  <div className="text-[14px] font-bold tnum mt-1">${selectedStrategy.risk.positionSizeUsd}</div>
                </div>
                <div>
                  <div className="trade-stat-label">TP / SL</div>
                  <div className="text-[14px] font-bold tnum mt-1">
                    {selectedStrategy.risk.takeProfit.enabled
                      ? `+${selectedStrategy.risk.takeProfit.value}${selectedStrategy.risk.takeProfit.unit}`
                      : "—"}
                    {" / "}
                    {selectedStrategy.risk.stopLoss.enabled
                      ? `−${selectedStrategy.risk.stopLoss.value}${selectedStrategy.risk.stopLoss.unit}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="trade-stat-label">Updated</div>
                  <div className="text-[14px] font-bold mt-1">
                    {new Date(selectedStrategy.updatedAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={customStrategyHref(selectedStrategy.id)} className="trade-btn trade-btn-primary">
                  <Play className="w-4 h-4" />
                  Open & run
                </Link>
                <button type="button" className="trade-btn trade-btn-ghost" onClick={() => onEdit(selectedStrategy.id)}>
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                {selectedStrategy.status === "live" ? (
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost"
                    onClick={() => {
                      setCustomStrategyStatus(selectedStrategy.id, "paused");
                      sync();
                    }}
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : selectedStrategy.status !== "archived" ? (
                  <Link
                    href={customStrategyHref(selectedStrategy.id)}
                    className="trade-btn trade-btn-ghost"
                    onClick={() => setCustomStrategyStatus(selectedStrategy.id, "live")}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Go live
                  </Link>
                ) : null}
                {selectedStrategy.status !== "archived" && (
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost"
                    onClick={() => {
                      setCustomStrategyStatus(selectedStrategy.id, "archived");
                      sync();
                    }}
                  >
                    <Archive className="w-4 h-4" />
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  className="trade-btn trade-btn-ghost"
                  style={{ color: "var(--red)" }}
                  onClick={() => {
                    if (window.confirm(`Delete “${selectedStrategy.name || "Untitled"}”?`)) {
                      deleteCustomStrategy(selectedStrategy.id);
                      setSelected(null);
                      sync();
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
