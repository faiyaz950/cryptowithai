"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Bot, Clock, History, Inbox, Loader2, Pause, Pencil, Play, Target, Trash2, Wallet, X, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cancelPaperOrder, placeDemoOrder, symbolLabel, type Candle, type DemoOrder, type PaperAccount, type PaperPosition } from "@/lib/cryptoApi";
import PaperOrderEditor, { type PaperEditTarget } from "./PaperOrderEditor";
import { PaperTag } from "./ModeTag";
import {
  CUSTOM_STRATEGIES_CHANGED,
  STRATEGY_TEMPLATES,
  deployStrategyToPaper,
  evaluateStrategyLive,
  listPaperDeployedStrategies,
  setCustomStrategyStatus,
  type CustomStrategy,
} from "@/lib/strategyBuilder";

export type DockTab = "positions" | "open" | "history" | "strategies";

/** Order lagne ke baad dock isi se sahi tab + row dikhata hai. */
export type DockFocus = { tab: DockTab; orderId?: string; symbol?: string; nonce: number };

interface Props {
  orders: DemoOrder[];
  account: PaperAccount | null;
  tab: DockTab;
  onTab: (tab: DockTab) => void;
  focus: DockFocus | null;
  /** Chart wala symbol (order key) aur uska bhaav — pending order ke mark ke liye. */
  currentKey: string;
  lastPrice?: number;
  busy: boolean;
  onClosePosition: (p: PaperPosition) => Promise<void>;
  /** Modify / cancel / Target-SL ke baad — page message dikhaye aur book reload kare. */
  onChanged: (message: string, order?: DemoOrder) => Promise<void>;
  onPickSymbol?: (symbol: string) => void;
  candles?: Candle[];
}

function px(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function signed(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const flat = Number(Math.abs(n).toFixed(2)) === 0;
  return `${n > 0 && !flat ? "+" : n < 0 && !flat ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

function tone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || Math.abs(n) < 0.005) return "flat";
  return n > 0 ? "up" : "down";
}

function when(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const TYPE_LABEL: Record<string, string> = {
  market: "Market",
  limit: "Limit",
  stop_loss: "SL hit",
  take_profit: "Target hit",
};

export default function PaperOrdersDock({
  orders,
  account,
  tab,
  onTab,
  focus,
  currentKey,
  lastPrice,
  busy,
  onClosePosition,
  onChanged,
  onPickSymbol,
  candles = [],
}: Props) {
  const { token } = useAuth();
  const rootRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<PaperEditTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deployedBots, setDeployedBots] = useState<CustomStrategy[]>([]);
  const reloadBots = useCallback(() => {
    setDeployedBots(listPaperDeployedStrategies());
  }, []);

  useEffect(() => {
    reloadBots();
    window.addEventListener(CUSTOM_STRATEGIES_CHANGED, reloadBots);
    return () => window.removeEventListener(CUSTOM_STRATEGIES_CHANGED, reloadBots);
  }, [reloadBots]);

  const quickDeploy = (tmplId: string) => {
    const tmpl = STRATEGY_TEMPLATES.find((t) => t.id === tmplId);
    if (!tmpl) return;
    const base = tmpl.apply(currentKey);
    const tp = base.risk?.takeProfit?.enabled ? base.risk.takeProfit.value : 2.5;
    const sl = base.risk?.stopLoss?.enabled ? base.risk.stopLoss.value : 1.2;
    deployStrategyToPaper(
      tmplId,
      {
        capitalUsd: 250,
        leverage: base.market.leverage || 10,
        autoExecute: true,
        deployedAt: new Date().toISOString(),
        symbol: currentKey,
        timeframe: "15m",
        confirmedTpPct: tp,
        confirmedSlPct: sl,
      },
      {
        name: tmpl.name,
        description: tmpl.blurb,
        category: tmpl.strategyType,
      }
    );
    reloadBots();
    void onChanged(`${tmpl.name} paper trading mein deploy ho gaya!`);
  };

  const triggerBotTrade = async (strat: CustomStrategy) => {
    if (!token) return;
    setBusyId(strat.id);
    setError(null);
    try {
      const isShort = strat.market.direction === "short";
      const side: "buy" | "sell" = isShort ? "sell" : "buy";
      const px = lastPrice || marks.get(currentKey) || 65000;
      const cap = strat.paperSettings?.capitalUsd || 250;
      const lev = strat.paperSettings?.leverage || 10;
      const qty = (cap * lev) / px;
      const tpPct = strat.paperSettings?.confirmedTpPct ?? (strat.risk?.takeProfit?.enabled ? strat.risk.takeProfit.value : 2.5);
      const slPct = strat.paperSettings?.confirmedSlPct ?? (strat.risk?.stopLoss?.enabled ? strat.risk.stopLoss.value : 1.2);
      const tpPrice = isShort ? px * (1 - tpPct / 100) : px * (1 + tpPct / 100);
      const slPrice = isShort ? px * (1 + slPct / 100) : px * (1 - slPct / 100);

      const res = await placeDemoOrder(token, {
        symbol: currentKey,
        side,
        order_type: "market",
        quantity: Math.max(0.001, Number(qty.toFixed(4))),
        take_profit: Number(tpPrice.toFixed(2)),
        stop_loss: Number(slPrice.toFixed(2)),
      });
      if (!res.success) throw new Error(res.error || "Paper order fail");
      await onChanged(`Bot signal execute ho gaya: ${strat.name} (${side.toUpperCase()})`);
      onTab("positions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execute nahi hua");
    } finally {
      setBusyId(null);
    }
  };

  const toggleBotPause = (strat: CustomStrategy) => {
    const nextStatus = strat.status === "paused" ? "paper" : "paused";
    setCustomStrategyStatus(strat.id, nextStatus);
    reloadBots();
  };

  const removeBot = (strat: CustomStrategy) => {
    setCustomStrategyStatus(strat.id, "draft");
    reloadBots();
  };

  const positions = useMemo(() => account?.positions ?? [], [account]);
  const openOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const history = useMemo(() => orders.filter((o) => o.status !== "pending").slice(0, 25), [orders]);

  const marks = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) if (p.mark_price) m.set(p.symbol, p.mark_price);
    if (lastPrice) m.set(currentKey, lastPrice);
    return m;
  }, [positions, currentKey, lastPrice]);

  useEffect(() => {
    if (!focus) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight - 120) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus]);

  if (!token) return null;

  const cancel = async (o: DemoOrder) => {
    if (!token) return;
    setBusyId(o.order_id);
    setError(null);
    try {
      await cancelPaperOrder(token, o.order_id);
      await onChanged("Paper order cancel ho gaya");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel nahi hua");
    } finally {
      setBusyId(null);
    }
  };

  const close = async (p: PaperPosition) => {
    setBusyId(p.symbol);
    setError(null);
    try {
      await onClosePosition(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Position band nahi hui");
    } finally {
      setBusyId(null);
    }
  };

  const flashOrder = (id: string) => (focus?.orderId === id ? focus.nonce : undefined);
  const flashSymbol = (s: string) => (focus?.tab === "positions" && focus.symbol === s ? focus.nonce : undefined);

  return (
    <section ref={rootRef} id="paper-dock" className="trade-panel pd" aria-label="Paper orders aur positions">
      <div className="pd-head">
        <div className="pd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "positions"} data-active={tab === "positions"} onClick={() => onTab("positions")}>
            <Wallet className="w-3.5 h-3.5" /> Positions <span className="tnum">{positions.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "open"} data-active={tab === "open"} onClick={() => onTab("open")}>
            <Clock className="w-3.5 h-3.5" /> Open orders <span className="tnum">{openOrders.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "strategies"} data-active={tab === "strategies"} onClick={() => onTab("strategies")}>
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Strategy Bots <span className="tnum">{deployedBots.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "history"} data-active={tab === "history"} onClick={() => onTab("history")}>
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>
        <div className="pd-meta tnum">
          <PaperTag />
          {account && (
            <>
              <span>Paper equity <b>${account.equity.toFixed(2)}</b></span>
              <span title={`Unrealized ${signed(account.unrealized_pnl)} · Realized ${signed(account.realized_pnl)}`}>
                Paper P&amp;L{" "}
                <b data-tone={tone(account.equity - account.start_balance)}>{signed(account.equity - account.start_balance)}</b>
              </span>
              <span className="pd-split">
                Unrealized <b data-tone={tone(account.unrealized_pnl)}>{signed(account.unrealized_pnl)}</b>
                {" · "}Realized <b data-tone={tone(account.realized_pnl)}>{signed(account.realized_pnl)}</b>
              </span>
              <span>Avail <b>${account.available.toFixed(2)}</b></span>
            </>
          )}
          <Link href="/trade?tab=trades" className="pd-link">
            Poora account <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="pp-flash" data-kind="error" role="alert">
          <AlertCircle className="w-3.5 h-3.5 flex-none" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Band karein">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="pd-body">
        {tab === "positions" &&
          (positions.length === 0 ? (
            <DockEmpty icon={<Wallet className="w-4 h-4" />}>Koi open paper position nahi — ticket se Buy/Sell karein.</DockEmpty>
          ) : (
            <table className="pp-table pd-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th className="num">Size</th>
                  <th className="num">Entry</th>
                  <th className="num">Mark</th>
                  <th className="num">Paper P&amp;L</th>
                  <th className="num">Target</th>
                  <th className="num">Stop loss</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.symbol}-${flashSymbol(p.symbol) ?? ""}`} data-flash={flashSymbol(p.symbol) != null || undefined}>
                    <td>
                      <button type="button" className="pp-pair" onClick={() => onPickSymbol?.(p.symbol)}>
                        {symbolLabel(p.symbol)}
                      </button>{" "}
                      <span className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}>
                        {p.side === "long" ? "Long" : "Short"}
                      </span>
                    </td>
                    <td className="num">{p.size}</td>
                    <td className="num">{px(p.entry_price)}</td>
                    <td className="num">{px(p.mark_price)}</td>
                    <td className="num">
                      <b data-tone={tone(p.unrealized_pnl)}>{signed(p.unrealized_pnl)}</b>
                      {p.move_pct != null && <span className="pd-sub">{`${Number(p.move_pct.toFixed(2)) > 0 ? "+" : ""}${Math.abs(p.move_pct) < 0.005 ? "0.00" : p.move_pct.toFixed(2)}%`}</span>}
                    </td>
                    <td className="num" data-tone={p.take_profit ? "up" : undefined}>{p.take_profit ? px(p.take_profit) : "—"}</td>
                    <td className="num" data-tone={p.stop_loss ? "down" : undefined}>{p.stop_loss ? px(p.stop_loss) : "—"}</td>
                    <td className="num pd-actions">
                      <button type="button" className="trade-btn trade-size-sm" onClick={() => setEditing({ kind: "position", position: p })}>
                        <Target className="w-3.5 h-3.5" /> Target/SL
                      </button>
                      <button type="button" className="trade-btn trade-size-sm" disabled={busy || busyId === p.symbol} onClick={() => void close(p)}>
                        {busyId === p.symbol ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === "open" &&
          (openOrders.length === 0 ? (
            <DockEmpty icon={<Clock className="w-4 h-4" />}>Koi pending limit order nahi.</DockEmpty>
          ) : (
            <table className="pp-table pd-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th className="num">Qty</th>
                  <th className="num">Limit</th>
                  <th className="num">Abhi</th>
                  <th className="num">Target</th>
                  <th className="num">Stop loss</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.order_id} data-flash={flashOrder(o.order_id) != null || undefined}>
                    <td className="muted">{when(o.timestamp)}</td>
                    <td>
                      <button type="button" className="pp-pair" onClick={() => onPickSymbol?.(o.symbol)}>
                        {symbolLabel(o.symbol)}
                      </button>{" "}
                      <span className={`trade-badge ${o.side === "buy" ? "trade-badge-green" : "trade-badge-red"}`}>
                        {o.side === "buy" ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="num">{o.quantity}</td>
                    <td className="num">{px(o.price)}</td>
                    <td className="num muted">{px(marks.get(o.symbol))}</td>
                    <td className="num" data-tone={o.take_profit ? "up" : undefined}>{o.take_profit ? px(o.take_profit) : "—"}</td>
                    <td className="num" data-tone={o.stop_loss ? "down" : undefined}>{o.stop_loss ? px(o.stop_loss) : "—"}</td>
                    <td className="num pd-actions">
                      <button type="button" className="trade-btn trade-size-sm" onClick={() => setEditing({ kind: "order", order: o })}>
                        <Pencil className="w-3.5 h-3.5" /> Modify
                      </button>
                      <button type="button" className="trade-btn trade-size-sm" disabled={busyId === o.order_id} onClick={() => void cancel(o)}>
                        {busyId === o.order_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === "strategies" &&
          (deployedBots.length === 0 ? (
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Market Screen par Strategy Bots Deploy karein
                  </h4>
                  <p className="text-[11.5px] leading-relaxed mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Ready-made indicator strategies ko 1-click se {symbolLabel(currentKey)} par paper trading mein deploy karein. Strategy ke Entry/Exit rules real-time test honge.
                  </p>
                </div>
                <Link
                  href="/trade?tab=builder"
                  className="trade-btn trade-size-sm flex-none flex items-center gap-1.5"
                  style={{ color: "var(--accent)" }}
                >
                  <Bot className="w-3.5 h-3.5" /> Open Builder
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
                {[
                  { id: "rsi-oversold-long", name: "RSI Oversold Long", tag: "Dip Reversal", desc: "RSI < 32 buy signal · TP +2.5% · SL -1.2%" },
                  { id: "ema-crossover", name: "EMA Crossover", tag: "Trend Breakout", desc: "9 EMA crosses 21 EMA · TP +3% · SL -1.5%" },
                  { id: "macd", name: "MACD Momentum", tag: "Momentum", desc: "MACD Line crosses Signal · TP +4% · SL -2%" },
                  { id: "rsi-ema", name: "RSI + EMA", tag: "Confluence", desc: "Trend filter + RSI rebound · TP +3% · SL -1.5%" },
                  { id: "rsi-combo", name: "RSI Combo", tag: "Dual Filter", desc: "High probability dual RSI · TP +3.5% · SL -1.5%" },
                ].map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-[var(--tr-line-soft)] bg-[var(--tr-field)] flex flex-col justify-between gap-2.5 hover:border-[var(--accent)] transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">{s.tag}</span>
                      </div>
                      <div className="text-[12.5px] font-bold text-[var(--text-primary)]">{s.name}</div>
                      <div className="text-[11px] leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>{s.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => quickDeploy(s.id)}
                      className="trade-btn trade-size-sm w-full flex items-center justify-center gap-1.5 font-semibold"
                      style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.35)" }}
                    >
                      <Zap className="w-3 h-3 fill-amber-400" />
                      Deploy on {symbolLabel(currentKey)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-1">
              <table className="pp-table pd-table">
                <thead>
                  <tr>
                    <th>Strategy Bot</th>
                    <th>Target Symbol</th>
                    <th>Capital &amp; Lev</th>
                    <th>Target / SL</th>
                    <th>Live Signal</th>
                    <th>Status</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployedBots.map((strat) => {
                    const evalResult = candles && candles.length >= 5 ? evaluateStrategyLive(strat, candles) : null;
                    const isPaused = strat.status === "paused";
                    const targetSym = strat.paperSettings?.symbol || strat.market.symbols[0] || currentKey;
                    const tpVal = strat.paperSettings?.confirmedTpPct ?? (strat.risk?.takeProfit?.enabled ? strat.risk.takeProfit.value : 2.5);
                    const slVal = strat.paperSettings?.confirmedSlPct ?? (strat.risk?.stopLoss?.enabled ? strat.risk.stopLoss.value : 1.2);
                    return (
                      <tr key={strat.id}>
                        <td>
                          <div className="font-bold text-[12.5px] text-[var(--text-primary)]">{strat.name}</div>
                          <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                            {strat.market.strategyType} · {strat.market.direction.toUpperCase()}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="pp-pair font-semibold"
                            onClick={() => onPickSymbol?.(targetSym)}
                          >
                            {symbolLabel(targetSym)}
                          </button>
                          <span className="pd-sub">{strat.paperSettings?.timeframe || strat.market.interval}</span>
                        </td>
                        <td>
                          <div className="tnum font-semibold">${strat.paperSettings?.capitalUsd ?? strat.risk.positionSizeUsd}</div>
                          <span className="pd-sub">{strat.paperSettings?.leverage ?? strat.market.leverage}x Lev</span>
                        </td>
                        <td>
                          <span className="font-semibold text-[var(--green)] tnum">+{tpVal}%</span>
                          {" / "}
                          <span className="font-semibold text-[var(--red)] tnum">-{slVal}%</span>
                        </td>
                        <td>
                          {evalResult ? (
                            <span
                              className={`trade-badge ${
                                evalResult.tone === "buy" ? "trade-badge-green" : evalResult.tone === "sell" ? "trade-badge-red" : "trade-badge-neutral"
                              }`}
                            >
                              {evalResult.tone === "buy" ? "● BUY" : evalResult.tone === "sell" ? "● SELL" : "○ MONITORING"}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--text-muted)]">Calculating…</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`trade-badge ${
                              isPaused ? "trade-badge-neutral" : "trade-badge-green"
                            }`}
                          >
                            {isPaused ? "Paused" : "● Running"}
                          </span>
                        </td>
                        <td className="num pd-actions">
                          <button
                            type="button"
                            className="trade-btn trade-size-sm"
                            disabled={busy || busyId === strat.id}
                            onClick={() => void triggerBotTrade(strat)}
                            title="Execute paper trade now"
                            style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}
                          >
                            {busyId === strat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
                            Execute Signal
                          </button>
                          <button
                            type="button"
                            className="trade-btn trade-size-sm"
                            onClick={() => toggleBotPause(strat)}
                            title={isPaused ? "Resume Bot" : "Pause Bot"}
                          >
                            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            {isPaused ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            className="trade-btn trade-size-sm text-[var(--red)]"
                            onClick={() => removeBot(strat)}
                            title="Remove bot from paper deployment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 text-[11.5px] border-t border-[var(--tr-line-soft)]">
                <span style={{ color: "var(--text-muted)" }}>
                  Aur ready-made strategies deploy karne ke liye click karein:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "rsi-oversold-long", name: "RSI Oversold" },
                    { id: "ema-crossover", name: "EMA Crossover" },
                    { id: "macd", name: "MACD" },
                    { id: "rsi-ema", name: "RSI+EMA" },
                    { id: "rsi-combo", name: "RSI Combo" },
                  ].map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => quickDeploy(tmpl.id)}
                      className="trade-btn trade-size-sm text-[11px]"
                    >
                      + {tmpl.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

        {tab === "history" &&
          (history.length === 0 ? (
            <DockEmpty icon={<Inbox className="w-4 h-4" />}>Abhi koi paper order nahi.</DockEmpty>
          ) : (
            <table className="pp-table pd-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                  <th className="num">Fill price</th>
                  <th className="num">Paper realized</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((o) => {
                  const realized = account?.closes?.[o.order_id];
                  return (
                    <tr key={o.order_id} data-flash={flashOrder(o.order_id) != null || undefined}>
                      <td className="muted">{when(o.timestamp)}</td>
                      <td>
                        <button type="button" className="pp-pair" onClick={() => onPickSymbol?.(o.symbol)}>
                          {symbolLabel(o.symbol)}
                        </button>{" "}
                        <span className={`trade-badge ${o.side === "buy" ? "trade-badge-green" : "trade-badge-red"}`}>
                          {o.side === "buy" ? "Buy" : "Sell"}
                        </span>
                      </td>
                      <td className="muted">{TYPE_LABEL[o.order_type] ?? o.order_type}</td>
                      <td className="num">{o.quantity}</td>
                      <td className="num">{o.status === "filled" ? px(o.price) : "—"}</td>
                      <td className="num">
                        {realized == null ? <span className="muted">—</span> : <b data-tone={tone(realized)}>{signed(realized)}</b>}
                      </td>
                      <td>
                        <span
                          className={`trade-badge ${
                            o.status === "filled" ? "trade-badge-blue" : o.status === "rejected" ? "trade-badge-red" : "trade-badge-neutral"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
      </div>

      {editing && (
        <PaperOrderEditor
          target={editing}
          mark={
            editing.kind === "position"
              ? editing.position.mark_price ?? marks.get(editing.position.symbol)
              : marks.get(editing.order.symbol)
          }
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  );
}

function DockEmpty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="trade-empty pd-empty">
      <span className="trade-empty-icon">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
