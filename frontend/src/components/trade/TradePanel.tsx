"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Inbox, LogIn, Plug, Wallet, Zap } from "lucide-react";
import type { DemoOrder } from "@/lib/cryptoApi";
import { CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";
import type { ExchangePosition } from "@/lib/accountApi";

/**
 * Khaali positions ka matlab teen alag baatein ho sakti hain, aur user ko
 * teenon ka jawab alag chahiye: login nahi hai, exchange nahi juda, ya key
 * par koi dikkat hai. Isliye state hi ye farak rakhti hai.
 */
export type PositionsState = {
  kind: "signed-out" | "not-connected" | "ready" | "error";
  positions: ExchangePosition[];
  message?: string;
};

export type OrderMode = "paper" | "live";

export type LiveTradeState = {
  kind: "signed-out" | "not-connected" | "no-trade" | "ready";
  accountId?: number;
  /** Connected exchange id — chart isi se auto-switch hota hai. */
  exchange?: string;
  label?: string;
  /** Available USDT (or USD) for % sizing. */
  availableUsdt: number;
  message?: string;
};

interface Props {
  symbol: string;
  lastPrice?: number;
  orders: DemoOrder[];
  positions: ExchangePosition[];
  positionsState: PositionsState;
  /** Paper order ke liye login zaroori hai — ticket isi se batata hai. */
  signedIn: boolean;
  placing: boolean;
  liveState: LiveTradeState;
  onPlace: (payload: {
    mode: OrderMode;
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
  }) => Promise<void>;
}

const OPEN_STATUSES = ["pending", "open", "submitted", "new", "partially_filled"];
const DONE_STATUSES = ["filled", "closed", "cancelled", "rejected", "canceled"];
const DEMO_BALANCE_USDT = 10_000;
const QTY_PCTS = [25, 50, 75, 100] as const;

/** "BTCUSDT" → "BTC" — the base asset, used as the quantity unit. */
function baseAsset(symbol: string): string {
  return symbol.replace(/USDT$|USD$/i, "") || symbol;
}

export default function TradePanel({
  symbol,
  lastPrice,
  orders,
  positions,
  positionsState,
  signedIn,
  placing,
  liveState,
  onPlace,
}: Props) {
  const [panel, setPanel] = useState<"ticket" | "trades">("ticket");
  const [mode, setMode] = useState<OrderMode>("paper");
  const [tradeSymbol, setTradeSymbol] = useState(symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("0.001");
  const [price, setPrice] = useState("");
  const [qtyPct, setQtyPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [book, setBook] = useState<"open" | "history">("open");

  useEffect(() => {
    setTradeSymbol(symbol);
  }, [symbol]);

  const liveReady = liveState.kind === "ready";
  const effectiveMode: OrderMode = mode === "live" && liveReady ? "live" : mode === "live" ? "live" : "paper";

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_STATUSES.includes(String(o.status || "").toLowerCase())),
    [orders],
  );
  const history = useMemo(
    () => orders.filter((o) => DONE_STATUSES.includes(String(o.status || "").toLowerCase())).slice(0, 8),
    [orders],
  );

  const balanceForPct =
    effectiveMode === "live" && liveReady ? Math.max(0, liveState.availableUsdt) : DEMO_BALANCE_USDT;

  const effectivePrice = orderType === "limit" ? Number(price || lastPrice || 0) : Number(lastPrice || 0);
  const orderValue = Number(quantity || 0) * effectivePrice;

  const applyPct = (pct: number) => {
    setQtyPct(pct);
    const px = orderType === "limit" ? Number(price || lastPrice || 0) : Number(lastPrice || 0);
    if (!px || px <= 0) return;
    const qty = (balanceForPct * (pct / 100)) / px;
    setQuantity(qty >= 1 ? qty.toFixed(3) : qty.toFixed(6));
  };

  const submit = async () => {
    setError("");
    if (effectiveMode === "live" && !liveReady) {
      setError(liveState.message || "Live trade ke liye exchange jodiye");
      return;
    }
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
      await onPlace({
        mode: effectiveMode,
        symbol: tradeSymbol,
        side,
        order_type: orderType,
        quantity: qty,
        price: limitPrice,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order fail ho gaya");
    }
  };

  const shownOrders = book === "open" ? openOrders : history;
  const recentTrades = history.length ? history : openOrders;

  const liveBlockedReason =
    mode === "live" && !liveReady
      ? liveState.kind === "signed-out"
        ? "signed-out"
        : liveState.kind === "not-connected"
          ? "not-connected"
          : liveState.kind === "no-trade"
            ? "no-trade"
            : "blocked"
      : null;

  return (
    <div className="space-y-4">
      <div className="trade-panel">
        <div className="desk-ticket-tabs">
          <button type="button" data-active={panel === "ticket"} onClick={() => setPanel("ticket")} className="desk-ticket-tab">
            Order Ticket
          </button>
          <button type="button" data-active={panel === "trades"} onClick={() => setPanel("trades")} className="desk-ticket-tab">
            Recent Trades
          </button>
        </div>

        {panel === "ticket" ? (
          <div className="trade-panel-body space-y-3.5">
            <div>
              <span className="trade-label">Mode</span>
              <div className="trade-seg trade-seg-full">
                <button
                  type="button"
                  data-active={mode === "paper"}
                  onClick={() => setMode("paper")}
                  className="trade-seg-btn"
                >
                  Paper
                </button>
                <button
                  type="button"
                  data-active={mode === "live"}
                  onClick={() => setMode("live")}
                  className="trade-seg-btn"
                >
                  Live
                </button>
              </div>
            </div>

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
                {mode === "live" && liveReady && (
                  <span className="normal-case font-medium" style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · avail ${liveState.availableUsdt.toFixed(2)}
                  </span>
                )}
              </label>
              <input
                id="ticket-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setQtyPct(null);
                }}
                className="trade-input"
              />
              <div className="desk-qty-pct">
                {QTY_PCTS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    data-active={qtyPct === pct}
                    onClick={() => applyPct(pct)}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="trade-label" htmlFor="ticket-price">
                  {orderType === "limit" ? "Limit price · USDT" : "Price · USDT"}
                </label>
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
                value={orderType === "market" ? (lastPrice != null ? String(lastPrice) : "") : price}
                placeholder={lastPrice ? String(lastPrice) : "Price"}
                onChange={(e) => setPrice(e.target.value)}
                className="trade-input"
                disabled={orderType === "market"}
              />
            </div>

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

            {liveBlockedReason === "signed-out" && (
              <Link href="/login?next=%2Ftrade" className="trade-btn trade-btn-lg trade-btn-primary w-full">
                <LogIn className="w-4 h-4" />
                Live trade ke liye sign in
              </Link>
            )}
            {liveBlockedReason === "not-connected" && (
              <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-lg trade-btn-primary w-full">
                <Plug className="w-4 h-4" />
                Exchange jodein
              </Link>
            )}
            {liveBlockedReason === "no-trade" && (
              <div className="trade-pos-notice">
                <span className="trade-pos-notice-icon"><AlertCircle className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <b>Trading permission nahi hai</b>
                  <p>{liveState.message || "Is API key se trade nahi ho sakta."}</p>
                  <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-primary trade-size-sm mt-2">
                    Exchanges
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {!liveBlockedReason && mode === "paper" && !signedIn && (
              <Link href="/login?next=%2Ftrade" className="trade-btn trade-btn-lg trade-btn-primary w-full">
                <LogIn className="w-4 h-4" />
                Paper trade ke liye sign in karein
              </Link>
            )}

            {!liveBlockedReason && (mode === "live" ? liveReady : signedIn) && (
              <button
                type="button"
                disabled={placing}
                onClick={submit}
                className={`trade-btn trade-btn-lg w-full ${side === "buy" ? "trade-btn-buy" : "trade-btn-sell"}`}
              >
                <Zap className="w-4 h-4" />
                {placing
                  ? "Placing…"
                  : `${mode === "live" ? "Live " : ""}${side === "buy" ? "Buy" : "Sell"} ${baseAsset(tradeSymbol)}`}
              </button>
            )}

            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {mode === "live" ? (
                <>
                  Ye <b>live order</b> hai — aapke jude hue exchange ({liveState.label || "Delta"}) par
                  asli funds se place hoga. Confirm karke hi bhejein.
                </>
              ) : (
                <>
                  Ye <b>paper order</b> hai — exchange par nahi jaata, sirf aapke account mein record hota hai.
                  Neeche positions aapke jude hue exchange se aati hain.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="p-3">
            {recentTrades.length === 0 ? (
              <div className="trade-empty">
                <span className="trade-empty-icon"><Inbox className="w-4 h-4" /></span>
                Abhi koi recent trade nahi
              </div>
            ) : (
              <div className="space-y-2">
                {recentTrades.slice(0, 10).map((o) => (
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
        )}
      </div>

      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Open positions</span>
          <span className="trade-badge trade-badge-neutral tnum">{positions.length}</span>
        </div>
        <div className="p-3">
          {positions.length === 0 && positionsState.kind !== "ready" ? (
            <PositionsNotice state={positionsState} />
          ) : positions.length === 0 ? (
            <div className="trade-empty">
              <span className="trade-empty-icon"><Wallet className="w-4 h-4" /></span>
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
                      <span className="flex items-center gap-2 text-[13px] font-bold">
                        {p.symbol || "—"}
                        <span
                          className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}
                        >
                          {p.side === "long" ? "Long" : "Short"}
                        </span>
                      </span>
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
                      {p.liquidation_price ? (
                        <span>Liq <b style={{ color: "var(--amber)" }}>{p.liquidation_price}</b></span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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

function PositionsNotice({ state }: { state: PositionsState }) {
  if (state.kind === "signed-out") {
    return (
      <div className="trade-pos-notice">
        <span className="trade-pos-notice-icon"><LogIn className="w-4 h-4" /></span>
        <div className="min-w-0">
          <b>Apni positions dekhne ke liye sign in karein</b>
          <p>Charts aur analysis bina login bhi chalte hain.</p>
          <Link href="/login?next=%2Ftrade" className="trade-btn trade-btn-primary trade-size-sm mt-2">
            Sign in
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "not-connected") {
    return (
      <div className="trade-pos-notice">
        <span className="trade-pos-notice-icon"><Plug className="w-4 h-4" /></span>
        <div className="min-w-0">
          <b>Koi exchange nahi juda</b>
          <p>Delta Exchange India ki API key jodiye — phir aapki asli positions yahan dikhengi.</p>
          <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-primary trade-size-sm mt-2">
            Exchange jodein
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-pos-notice" role="alert">
      <span className="trade-pos-notice-icon" style={{ color: "var(--amber)" }}>
        <AlertCircle className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <b>Positions nahi aa payi</b>
        <p>{state.message || "Exchange se jawab nahi mila."}</p>
      </div>
    </div>
  );
}
