"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Inbox, Wallet } from "lucide-react";
import type { DemoOrder, DeltaPosition } from "@/lib/cryptoApi";
import { CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";

interface Props {
  symbol: string;
  lastPrice?: number;
  orders: DemoOrder[];
  positions: DeltaPosition[];
  /** Delta keys set/usable na hon to reason — tab empty list ko "no positions" mat dikhao. */
  positionsUnavailable?: string | null;
  placing: boolean;
  onPlace: (payload: {
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
  }) => Promise<void>;
}

const OPEN_STATUSES = ["pending", "open", "submitted", "new", "partially_filled"];
const DONE_STATUSES = ["filled", "closed", "cancelled", "rejected", "canceled"];

/** "BTCUSDT" → "BTC" — the base asset, used as the quantity unit. */
function baseAsset(symbol: string): string {
  return symbol.replace(/USDT$|USD$/i, "") || symbol;
}

export default function TradePanel({
  symbol,
  lastPrice,
  orders,
  positions,
  positionsUnavailable,
  placing,
  onPlace,
}: Props) {
  const [tradeSymbol, setTradeSymbol] = useState(symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("limit");
  const [quantity, setQuantity] = useState("0.001");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [book, setBook] = useState<"open" | "history">("open");

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_STATUSES.includes(String(o.status || "").toLowerCase())),
    [orders],
  );
  const history = useMemo(
    () => orders.filter((o) => DONE_STATUSES.includes(String(o.status || "").toLowerCase())).slice(0, 8),
    [orders],
  );

  const effectivePrice = orderType === "limit" ? Number(price || lastPrice || 0) : Number(lastPrice || 0);
  const orderValue = Number(quantity || 0) * effectivePrice;

  const submit = async () => {
    setError("");
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Valid quantity daaliye");
      return;
    }
    const limitPrice = orderType === "limit" ? Number(price || lastPrice) : null;
    if (orderType === "limit" && (!limitPrice || limitPrice <= 0)) {
      setError("Limit order ke liye price chahiye");
      return;
    }
    try {
      await onPlace({ symbol: tradeSymbol, side, order_type: orderType, quantity: qty, price: limitPrice });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order fail ho gaya");
    }
  };

  const shownOrders = book === "open" ? openOrders : history;

  return (
    <div className="space-y-4">
      {/* ── Order ticket ──────────────────────────────────── */}
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Order ticket</span>
          <span className="trade-badge trade-badge-neutral">Demo</span>
        </div>

        <div className="trade-panel-body space-y-3.5">
          <div className="trade-seg trade-seg-full">
            <button type="button" data-active={side === "buy"} data-tone="buy" onClick={() => setSide("buy")} className="trade-seg-btn">
              Buy / Long
            </button>
            <button type="button" data-active={side === "sell"} data-tone="sell" onClick={() => setSide("sell")} className="trade-seg-btn">
              Sell / Short
            </button>
          </div>

          <div>
            <label className="trade-label" htmlFor="ticket-symbol">Symbol</label>
            <select
              id="ticket-symbol"
              value={tradeSymbol}
              onChange={(e) => setTradeSymbol(e.target.value)}
              className="trade-select font-semibold"
            >
              {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <span className="trade-label">Order type</span>
            <div className="trade-seg trade-seg-full">
              <button type="button" data-active={orderType === "market"} onClick={() => setOrderType("market")} className="trade-seg-btn">
                Market
              </button>
              <button type="button" data-active={orderType === "limit"} onClick={() => setOrderType("limit")} className="trade-seg-btn">
                Limit
              </button>
            </div>
          </div>

          <div>
            <label className="trade-label" htmlFor="ticket-qty">
              Quantity · {baseAsset(tradeSymbol)}
            </label>
            <input
              id="ticket-qty"
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="trade-input"
            />
          </div>

          {orderType === "limit" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="trade-label" htmlFor="ticket-price">Limit price · USDT</label>
                {lastPrice != null && (
                  <button
                    type="button"
                    onClick={() => setPrice(String(lastPrice))}
                    className="trade-label"
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                  >
                    Use last
                  </button>
                )}
              </div>
              <input
                id="ticket-price"
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                placeholder={lastPrice ? String(lastPrice) : "Price"}
                onChange={(e) => setPrice(e.target.value)}
                className="trade-input"
              />
            </div>
          )}

          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-[10px]"
            style={{ background: "var(--tr-field)", border: "1px solid var(--tr-line-soft)" }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Order value
            </span>
            <span className="text-[14px] font-bold tnum">
              {orderValue > 0
                ? orderValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
                : "—"}
            </span>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-[12px]" style={{ color: "var(--red)" }}>
              <AlertCircle className="w-3.5 h-3.5 mt-px flex-none" />
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={placing}
            onClick={submit}
            className={`trade-btn trade-btn-lg w-full ${side === "buy" ? "trade-btn-buy" : "trade-btn-sell"}`}
          >
            {placing ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} ${baseAsset(tradeSymbol)}`}
          </button>

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Demo orders yahan save hote hain. Live positions Delta API se aati hain.
          </p>
        </div>
      </div>

      {/* ── Positions ─────────────────────────────────────── */}
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Open positions</span>
          <span className="trade-badge trade-badge-neutral tnum">{positions.length}</span>
        </div>
        <div className="p-3">
          {positions.length === 0 && positionsUnavailable ? (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-[10px] text-[12px] leading-relaxed"
              style={{
                background: "var(--tr-field)",
                border: "1px solid var(--tr-line-soft)",
                color: "var(--text-secondary)",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-none" style={{ color: "var(--red)" }} />
              <span>
                <b className="block mb-0.5">Live positions available nahi hain</b>
                {positionsUnavailable}
              </span>
            </div>
          ) : positions.length === 0 ? (
            <div className="trade-empty">
              <span className="trade-empty-icon"><Wallet className="w-4 h-4" /></span>
              Koi open position nahi hai
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((p, i) => {
                const pnl = Number(p.unrealized_pnl || 0);
                const up = pnl >= 0;
                return (
                  <div key={`${p.symbol}-${i}`} className="trade-row trade-row-stack gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">{p.symbol || "—"}</span>
                      <span className={`trade-badge ${up ? "trade-badge-green" : "trade-badge-red"} tnum`}>
                        {up ? "+" : ""}{pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                      <span>Size <b style={{ color: "var(--text-secondary)" }}>{p.size ?? 0}</b></span>
                      <span>Entry <b style={{ color: "var(--text-secondary)" }}>{p.entry_price ?? "—"}</b></span>
                      <span>Mark <b style={{ color: "var(--text-secondary)" }}>{p.mark_price ?? "—"}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Order book ────────────────────────────────────── */}
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Orders</span>
          <div className="trade-seg">
            <button type="button" data-active={book === "open"} onClick={() => setBook("open")} className="trade-seg-btn">
              Open {openOrders.length > 0 && <span className="tnum">({openOrders.length})</span>}
            </button>
            <button type="button" data-active={book === "history"} onClick={() => setBook("history")} className="trade-seg-btn">
              History
            </button>
          </div>
        </div>
        <div className="p-3">
          {shownOrders.length === 0 ? (
            <div className="trade-empty">
              <span className="trade-empty-icon"><Inbox className="w-4 h-4" /></span>
              {book === "open" ? "Abhi koi open order nahi" : "Koi past order nahi"}
            </div>
          ) : (
            <div className="space-y-2">
              {shownOrders.map((o) => (
                <div key={o.order_id} className="trade-row">
                  <span className={`trade-badge ${o.side === "buy" ? "trade-badge-green" : "trade-badge-red"}`}>
                    {o.side}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold truncate">{symbolLabel(o.symbol)}</div>
                    <div className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                      {o.order_type} · {o.quantity ?? o.size ?? 0} @ {o.price ?? o.limit_price ?? "Market"}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider flex-none" style={{ color: "var(--text-muted)" }}>
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
