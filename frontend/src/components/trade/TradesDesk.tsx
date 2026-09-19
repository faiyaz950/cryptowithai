"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Inbox,
  ListOrdered,
  Loader2,
  LogIn,
  Plug,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  AccountApiError,
  cancelByokOrder,
  fetchByokOrders,
  fetchExchangeOverview,
  fetchMyPositions,
  listExchangeAccounts,
  type ByokOrder,
  type ExchangeOrder,
  type ExchangePosition,
} from "@/lib/accountApi";
import { symbolLabel } from "@/lib/cryptoApi";

type DeskTab = "open" | "history" | "positions";

const OPEN_STATES = new Set([
  "pending",
  "open",
  "submitted",
  "new",
  "partially_filled",
  "untriggered",
  "active",
]);

interface Props {
  onPickSymbol?: (symbol: string) => void;
}

export default function TradesDesk({ onPickSymbol }: Props) {
  const { token, handleExpiredSession } = useAuth();
  const [tab, setTab] = useState<DeskTab>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<ByokOrder[]>([]);
  const [openOrders, setOpenOrders] = useState<ExchangeOrder[]>([]);
  const [positions, setPositions] = useState<ExchangePosition[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const load = useCallback(async () => {
    if (!token) {
      setConnected(false);
      setAccountId(null);
      setHistory([]);
      setOpenOrders([]);
      setPositions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const accounts = await listExchangeAccounts(token);
      const primary =
        accounts.find((a) => a.is_active && a.can_trade) ??
        accounts.find((a) => a.is_active) ??
        null;

      if (!primary) {
        setConnected(false);
        setAccountId(null);
        setAccountLabel("");
        setHistory([]);
        setOpenOrders([]);
        setPositions([]);
        return;
      }

      setConnected(true);
      setAccountId(primary.id);
      setAccountLabel(primary.label || primary.exchange);

      const [byokRows, overview, myPos] = await Promise.all([
        fetchByokOrders(token, { exchange_account_id: primary.id, limit: 100 }).catch(() => [] as ByokOrder[]),
        fetchExchangeOverview(token, primary.id).catch(() => null),
        fetchMyPositions(token).catch(() => null),
      ]);

      setHistory(byokRows);

      const liveOpen = (overview?.orders.items ?? []).filter((o) =>
        OPEN_STATES.has(String(o.state || "").toLowerCase()),
      );
      if (liveOpen.length > 0) {
        setOpenOrders(liveOpen);
      } else {
        // Fallback: local BYOK log mein submitted/open dikhao
        setOpenOrders(
          byokRows
            .filter((o) => OPEN_STATES.has(String(o.status || "").toLowerCase()))
            .map((o) => ({
              id: o.order_id,
              symbol: o.symbol,
              side: o.side,
              order_type: o.order_type,
              size: o.quantity,
              unfilled_size: o.quantity,
              price: o.price,
              state: o.status,
              created_at: o.timestamp || "",
            })),
        );
      }

      setPositions(myPos?.connected ? myPos.positions : overview?.positions.items ?? []);
      if (overview?.orders.error) setError(overview.orders.error);
    } catch (err) {
      if (err instanceof AccountApiError && err.status === 401) {
        handleExpiredSession();
        return;
      }
      setError(err instanceof Error ? err.message : "Trades load nahi hui");
    } finally {
      setLoading(false);
    }
  }, [token, handleExpiredSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = openOrders.length;
  const historySorted = useMemo(
    () =>
      [...history].sort((a, b) =>
        String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
      ),
    [history],
  );

  const onCancel = async (orderId: string | number | null) => {
    if (!token || accountId == null || orderId == null) return;
    const id = String(orderId);
    setCancellingId(id);
    try {
      await cancelByokOrder(token, { exchange_account_id: accountId, order_id: id });
      flash(`Order ${id} cancel request bhej diya`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel fail");
    } finally {
      setCancellingId(null);
    }
  };

  const onCancelAll = async () => {
    if (!token || accountId == null || openOrders.length === 0) return;
    if (!window.confirm(`${openOrders.length} open order(s) cancel karein?`)) return;
    setCancellingAll(true);
    let ok = 0;
    let fail = 0;
    for (const o of openOrders) {
      if (o.id == null) {
        fail += 1;
        continue;
      }
      try {
        await cancelByokOrder(token, {
          exchange_account_id: accountId,
          order_id: String(o.id),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    flash(`Cancel all: ${ok} ok${fail ? `, ${fail} fail` : ""}`);
    setCancellingAll(false);
    await load();
  };

  if (!token) {
    return (
      <div className="trade-panel">
        <div className="p-6">
          <div className="trade-pos-notice">
            <span className="trade-pos-notice-icon">
              <LogIn className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <b>Trades dekhne ke liye sign in karein</b>
              <p>Live orders aur positions aapke account se aati hain.</p>
              <Link href="/login?next=%2Ftrade%3Ftab%3Dtrades" className="trade-btn trade-btn-primary trade-size-sm mt-2">
                Sign in
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!connected && !loading) {
    return (
      <div className="trade-panel">
        <div className="p-6">
          <div className="trade-pos-notice">
            <span className="trade-pos-notice-icon">
              <Plug className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <b>Koi exchange nahi juda</b>
              <p>Delta API key jodiye — phir open orders, history aur positions yahan dikhengi.</p>
              <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-primary trade-size-sm mt-2">
                Exchange jodein
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title flex items-center gap-2">
            <ListOrdered className="w-4 h-4" style={{ color: "var(--accent)" }} />
            Trades
            {accountLabel && (
              <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                · {accountLabel}
              </span>
            )}
          </span>
          <button
            type="button"
            className="trade-btn trade-size-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>

        <div className="px-3 pt-3">
          <div className="trade-seg trade-seg-full">
            <button type="button" data-active={tab === "open"} onClick={() => setTab("open")} className="trade-seg-btn">
              Open orders {openCount > 0 && <span className="tnum">({openCount})</span>}
            </button>
            <button type="button" data-active={tab === "history"} onClick={() => setTab("history")} className="trade-seg-btn">
              History
            </button>
            <button type="button" data-active={tab === "positions"} onClick={() => setTab("positions")} className="trade-seg-btn">
              Positions {positions.length > 0 && <span className="tnum">({positions.length})</span>}
            </button>
          </div>
        </div>

        {(error || notice) && (
          <div className="px-3 pt-3 space-y-1">
            {notice && (
              <p className="text-[12px]" style={{ color: "var(--accent)" }}>
                {notice}
              </p>
            )}
            {error && (
              <p className="flex items-start gap-2 text-[12px]" style={{ color: "var(--amber)" }}>
                <AlertCircle className="w-3.5 h-3.5 mt-px flex-none" />
                {error}
              </p>
            )}
          </div>
        )}

        <div className="p-3">
          {tab === "open" && (
            <>
              {openOrders.length > 0 && (
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    className="trade-btn trade-size-sm"
                    disabled={cancellingAll}
                    onClick={() => void onCancelAll()}
                  >
                    {cancellingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Cancel all open
                  </button>
                </div>
              )}
              {openOrders.length === 0 ? (
                <div className="trade-empty">
                  <span className="trade-empty-icon">
                    <Inbox className="w-4 h-4" />
                  </span>
                  Abhi koi open order nahi
                </div>
              ) : (
                <div className="space-y-2">
                  {openOrders.map((o) => (
                    <div key={String(o.id)} className="trade-row">
                      <span className={`trade-badge ${String(o.side).toLowerCase().includes("sell") || String(o.side).toLowerCase() === "sell" ? "trade-badge-red" : "trade-badge-green"}`}>
                        {o.side}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-[12.5px] font-semibold truncate text-left trade-linkish"
                          onClick={() => onPickSymbol?.(o.symbol)}
                        >
                          {symbolLabel(o.symbol)}
                        </button>
                        <div className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                          {o.order_type} · {o.size} @ {o.price ?? "Market"} · {o.state}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="trade-btn trade-size-sm flex-none"
                        disabled={cancellingId === String(o.id) || o.id == null}
                        onClick={() => void onCancel(o.id)}
                      >
                        {cancellingId === String(o.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "history" && (
            historySorted.length === 0 ? (
              <div className="trade-empty">
                <span className="trade-empty-icon">
                  <Inbox className="w-4 h-4" />
                </span>
                Abhi koi BYOK order history nahi
              </div>
            ) : (
              <div className="space-y-2">
                {historySorted.map((o) => (
                  <div key={`${o.order_id}-${o.timestamp}`} className="trade-row">
                    <span className={`trade-badge ${o.side === "buy" ? "trade-badge-green" : "trade-badge-red"}`}>
                      {o.side}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="text-[12.5px] font-semibold truncate text-left trade-linkish"
                        onClick={() => onPickSymbol?.(o.symbol)}
                      >
                        {symbolLabel(o.symbol)}
                      </button>
                      <div className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                        {o.order_type} · {o.quantity} @ {o.price ?? "Market"}
                        {o.timestamp ? ` · ${new Date(o.timestamp).toLocaleString()}` : ""}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider flex-none" style={{ color: "var(--text-muted)" }}>
                      {o.status}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "positions" && (
            positions.length === 0 ? (
              <div className="trade-empty">
                <span className="trade-empty-icon">
                  <Wallet className="w-4 h-4" />
                </span>
                Koi open position nahi hai
              </div>
            ) : (
              <div className="space-y-2">
                {positions.map((p, i) => {
                  const hasPnl = p.unrealized_pnl !== null;
                  const value = hasPnl ? (p.unrealized_pnl as number) : p.move_pct;
                  const up = (value ?? 0) >= 0;
                  return (
                    <div key={`${p.symbol}-${p.side}-${i}`} className="trade-row trade-row-stack gap-1.5">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-[13px] font-bold trade-linkish"
                          onClick={() => onPickSymbol?.(p.symbol)}
                        >
                          {p.symbol || "—"}
                          <span className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}>
                            {p.side === "long" ? "Long" : "Short"}
                          </span>
                        </button>
                        {value === null ? (
                          <span className="trade-badge trade-badge-neutral">—</span>
                        ) : (
                          <span className={`trade-badge ${up ? "trade-badge-green" : "trade-badge-red"} tnum`}>
                            {up ? "+" : ""}
                            {hasPnl ? value.toFixed(2) : `${value.toFixed(2)}%`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                        <span>Size <b style={{ color: "var(--text-secondary)" }}>{p.size}</b></span>
                        <span>Entry <b style={{ color: "var(--text-secondary)" }}>{p.entry_price || "—"}</b></span>
                        <span>Mark <b style={{ color: "var(--text-secondary)" }}>{p.mark_price ?? "—"}</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
