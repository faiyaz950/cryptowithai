"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, Inbox, LogIn, Plug, SlidersHorizontal, Sparkles, Wallet, Zap } from "lucide-react";
import type { Candle, DemoOrder, PaperAccount, SpotRules } from "@/lib/cryptoApi";
import { LiveTag, ModeStrip, PaperTag } from "./ModeTag";
import { CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";
import { fmtQuotePrice } from "@/lib/marketQuote";
import type { ExchangePosition } from "@/lib/accountApi";
import {
  CUSTOM_STRATEGIES_CHANGED,
  STRATEGY_TEMPLATES,
  deployStrategyToPaper,
  evaluateStrategyLive,
  getTemplate,
  listCustomStrategies,
  type CustomStrategy,
  type LiveEval,
} from "@/lib/strategyBuilder";

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

function signedMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const flat = Math.abs(n) < 0.005;
  return `${flat ? "" : n > 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function moneyTone(n: number | null | undefined): "up" | "down" | "flat" {
  return n == null || Math.abs(n) < 0.005 ? "flat" : n > 0 ? "up" : "down";
}

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
  /**
   * Spot ka asli order CoinDCX account se hi jaata hai — primary account
   * Delta ho tab bhi. Na juda ho to undefined.
   */
  spot?: {
    accountId: number;
    label: string;
    /** Asset → available (INR, BTC, THETA…). */
    balances: Record<string, number>;
  };
};

/** Spot pair chuna ho to ticket isi se chalta hai. */
export type SpotTicket = {
  /** "THETAINR@coindcx-spot" */
  key: string;
  base: string;
  quote: string;
  rules: SpotRules | null;
};

interface Props {
  symbol: string;
  /** CoinDCX spot pair chuna ho to; perps par null. */
  spot?: SpotTicket | null;
  lastPrice?: number;
  orders: DemoOrder[];
  paperAccount: PaperAccount | null;
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
    stop_loss?: number | null;
    take_profit?: number | null;
  }) => Promise<void>;
  candles?: Candle[];
  interval?: string;
  onDeployStrategySuccess?: () => void;
  activePanel?: "ticket" | "strategy" | "trades";
  onActivePanelChange?: (panel: "ticket" | "strategy" | "trades") => void;
}

const OPEN_STATUSES = ["pending", "open", "submitted", "new", "partially_filled"];
const DONE_STATUSES = ["filled", "closed", "cancelled", "rejected", "canceled"];
const DEMO_BALANCE_USDT = 10_000;
const QTY_PCTS = [25, 50, 75, 100] as const;

/** "BTCUSDT" → "BTC" — the base asset, used as the quantity unit. */
function baseAsset(symbol: string): string {
  return symbol.replace(/USDT$|USD$/i, "") || symbol;
}

/** Step ke neeche round — upar round karne par balance se zyada ka order ban jaata. */
function floorToStep(qty: number, step: number | null | undefined): string {
  if (!step || step <= 0) return qty >= 1 ? qty.toFixed(3) : qty.toFixed(6);
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  const floored = Math.floor(qty / step + 1e-9) * step;
  return floored.toFixed(decimals);
}

export default function TradePanel({
  symbol,
  spot = null,
  lastPrice,
  orders,
  paperAccount,
  positions: exchangePositions,
  positionsState,
  signedIn,
  placing,
  liveState,
  onPlace,
  candles = [],
  interval = "15m",
  onDeployStrategySuccess,
  activePanel,
  onActivePanelChange,
}: Props) {
  const [internalPanel, setInternalPanel] = useState<"ticket" | "strategy" | "trades">("ticket");
  const panel = activePanel ?? internalPanel;
  const setPanel = (p: "ticket" | "strategy" | "trades") => {
    setInternalPanel(p);
    onActivePanelChange?.(p);
  };

  const [mode, setMode] = useState<OrderMode>("paper");
  const [tradeSymbol, setTradeSymbol] = useState(symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderTypePick, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("0.001");
  const [price, setPrice] = useState("");
  const [qtyPct, setQtyPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [bracketOn, setBracketOn] = useState(false);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  // Strategy Bot State
  const [selectedStratId, setSelectedStratId] = useState<string>("rsi-oversold-long");
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [stratCapital, setStratCapital] = useState<string>("250");
  const [stratNotice, setStratNotice] = useState<string>("");

  useEffect(() => {
    const loadStrats = () => setCustomStrategies(listCustomStrategies());
    loadStrats();
    window.addEventListener(CUSTOM_STRATEGIES_CHANGED, loadStrats);
    return () => window.removeEventListener(CUSTOM_STRATEGIES_CHANGED, loadStrats);
  }, []);

  const currentStrat = useMemo<CustomStrategy>(() => {
    const custom = customStrategies.find((s) => s.id === selectedStratId);
    if (custom) return custom;
    const tmpl = getTemplate(selectedStratId) ?? STRATEGY_TEMPLATES[0];
    return tmpl.apply(tradeSymbol);
  }, [customStrategies, selectedStratId, tradeSymbol]);

  const liveEval = useMemo<LiveEval>(() => {
    if (!candles || candles.length < 5) {
      return {
        tone: "neutral",
        headline: "Waiting for chart data",
        detail: "Candles load hone ke baad live signal update hoga.",
        readouts: [],
      };
    }
    return evaluateStrategyLive(currentStrat, candles);
  }, [currentStrat, candles]);

  const stratTpPct = currentStrat.risk?.takeProfit?.enabled ? currentStrat.risk.takeProfit.value : 2.5;
  const stratSlPct = currentStrat.risk?.stopLoss?.enabled ? currentStrat.risk.stopLoss.value : 1.2;
  const stratIsLong = currentStrat.market?.direction !== "short";
  const stratSide: "buy" | "sell" = stratIsLong ? "buy" : "sell";
  const stratTpPrice = lastPrice ? (stratIsLong ? lastPrice * (1 + stratTpPct / 100) : lastPrice * (1 - stratTpPct / 100)) : undefined;
  const stratSlPrice = lastPrice ? (stratIsLong ? lastPrice * (1 - stratSlPct / 100) : lastPrice * (1 + stratSlPct / 100)) : undefined;
  const stratRr = stratSlPct > 0 ? (stratTpPct / stratSlPct).toFixed(2) : "2.00";

  const spotKey = spot?.key ?? null;
  useEffect(() => {
    setTradeSymbol(spotKey ?? symbol);
  }, [symbol, spotKey]);

  const allowedTypes: ("market" | "limit")[] = spot?.rules?.order_types?.length
    ? spot.rules.order_types
    : ["market", "limit"];
  const orderType = allowedTypes.includes(orderTypePick) ? orderTypePick : allowedTypes[0];
  const unit = spot ? spot.base : baseAsset(tradeSymbol);

  const liveReady = spot ? Boolean(liveState.spot) : liveState.kind === "ready";
  const effectiveMode: OrderMode = mode === "live" ? "live" : "paper";

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_STATUSES.includes(String(o.status || "").toLowerCase())),
    [orders],
  );
  const history = useMemo(
    () => orders.filter((o) => DONE_STATUSES.includes(String(o.status || "").toLowerCase())).slice(0, 8),
    [orders],
  );

  const balanceForPct =
    effectiveMode === "live" && liveReady
      ? Math.max(0, liveState.availableUsdt)
      : paperAccount?.available ?? DEMO_BALANCE_USDT;
  const showPaperBook = mode === "paper" && signedIn;
  const paperPnl = paperAccount ? paperAccount.equity - paperAccount.start_balance : 0;
  const positions = showPaperBook ? paperAccount?.positions ?? [] : exchangePositions;

  const effectivePrice = orderType === "limit" ? Number(price || lastPrice || 0) : Number(lastPrice || 0);
  const orderValue = Number(quantity || 0) * effectivePrice;
  /** Spot sell position band karta hai — uspar Target/SL ka matlab nahi. */
  const canBracket = effectiveMode === "paper" && !(spot && side === "sell");
  const bracketActive = canBracket && bracketOn;

  const bracketHint = (value: string, kind: "tp" | "sl") => {
    const v = Number(value);
    if (!value || !(v > 0) || !(effectivePrice > 0)) return null;
    const pct = ((v - effectivePrice) / effectivePrice) * 100;
    const good = kind === "tp" ? (side === "buy" ? pct > 0 : pct < 0) : side === "buy" ? pct < 0 : pct > 0;
    return (
      <span className="po-hint" data-tone={good ? (kind === "tp" ? "up" : "down") : "warn"}>
        {good ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : kind === "tp" ? `${side === "buy" ? "Upar" : "Neeche"} rakhein` : `${side === "buy" ? "Neeche" : "Upar"} rakhein`}
      </span>
    );
  };

  /** Spot: kharidne ke liye quote (INR) mein paisa, bechne ke liye paas ke coins. */
  const spotHeld = spot
    ? effectiveMode === "live"
      ? liveState.spot?.balances[spot.base] ?? 0
      : paperAccount?.positions.find((p) => p.symbol === spot.key)?.size ?? 0
    : 0;
  const spotBudgetQuote = spot
    ? effectiveMode === "live"
      ? liveState.spot?.balances[spot.quote] ?? 0
      : spot.rules?.quote_usd
        ? (paperAccount?.available ?? DEMO_BALANCE_USDT) / spot.rules.quote_usd
        : 0
    : 0;

  const applyPct = (pct: number) => {
    setQtyPct(pct);
    const px = orderType === "limit" ? Number(price || lastPrice || 0) : Number(lastPrice || 0);
    if (spot) {
      const qty = side === "sell" ? spotHeld * (pct / 100) : px > 0 ? (spotBudgetQuote * (pct / 100)) / px : 0;
      setQuantity(floorToStep(qty, spot.rules?.qty_step));
      return;
    }
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
    const tp = bracketActive && Number(takeProfit) > 0 ? Number(takeProfit) : null;
    const sl = bracketActive && Number(stopLoss) > 0 ? Number(stopLoss) : null;
    try {
      await onPlace({
        mode: effectiveMode,
        symbol: tradeSymbol,
        side,
        order_type: orderType,
        quantity: qty,
        price: limitPrice,
        ...(bracketActive ? { stop_loss: sl, take_profit: tp } : {}),
      });
      if (bracketActive) {
        setTakeProfit("");
        setStopLoss("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order fail ho gaya");
    }
  };

  const applyStrategyToTicket = (stratId: string) => {
    const custom = customStrategies.find((s) => s.id === stratId);
    const strat = custom ?? (getTemplate(stratId) ?? STRATEGY_TEMPLATES[0]).apply(tradeSymbol);
    const isL = strat.market.direction !== "short";
    setSide(isL ? "buy" : "sell");
    setBracketOn(true);
    if (lastPrice) {
      const tpVal = strat.risk.takeProfit.enabled ? strat.risk.takeProfit.value : 2.5;
      const slVal = strat.risk.stopLoss.enabled ? strat.risk.stopLoss.value : 1.2;
      const tp = isL ? lastPrice * (1 + tpVal / 100) : lastPrice * (1 - tpVal / 100);
      const sl = isL ? lastPrice * (1 - slVal / 100) : lastPrice * (1 + slVal / 100);
      setTakeProfit(tp.toFixed(2));
      setStopLoss(sl.toFixed(2));
      const posSize = strat.risk.positionSizeUsd || 250;
      const q = posSize / lastPrice;
      setQuantity(floorToStep(q, spot?.rules?.qty_step));
    }
    setPanel("ticket");
  };

  const executeStrategyPaperTrade = async () => {
    setError("");
    setStratNotice("");
    if (!lastPrice || lastPrice <= 0) {
      setError("Price data available nahi hai");
      return;
    }
    const cap = Number(stratCapital) || 250;
    const qty = cap / lastPrice;
    const finalQty = Math.max(0.001, Number(floorToStep(qty, spot?.rules?.qty_step)));
    try {
      await onPlace({
        mode: "paper",
        symbol: tradeSymbol,
        side: stratSide,
        order_type: "market",
        quantity: finalQty,
        take_profit: stratTpPrice ? Number(stratTpPrice.toFixed(2)) : null,
        stop_loss: stratSlPrice ? Number(stratSlPrice.toFixed(2)) : null,
      });
      setStratNotice(`Paper trade lag gaya: ${currentStrat.name} (${stratSide.toUpperCase()} ${finalQty} ${unit})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper trade execute nahi ho paya");
    }
  };

  const deployCurrentToPaper = () => {
    setStratNotice("");
    const deployed = deployStrategyToPaper(
      currentStrat.id,
      {
        capitalUsd: Number(stratCapital) || 250,
        leverage: currentStrat.market.leverage || 10,
        autoExecute: true,
        deployedAt: new Date().toISOString(),
        symbol: tradeSymbol,
        timeframe: interval || "15m",
        confirmedTpPct: stratTpPct,
        confirmedSlPct: stratSlPct,
      },
      {
        name: currentStrat.name,
        description: currentStrat.description,
        category: currentStrat.market.strategyType,
      }
    );
    if (deployed) {
      setStratNotice(`Bot deployed to Paper Trading! Monitoring ${tradeSymbol} 24/7.`);
      onDeployStrategySuccess?.();
    }
  };

  const recentTrades = history.length ? history : openOrders;

  const liveBlockedReason =
    mode === "live" && !liveReady
      ? liveState.kind === "signed-out"
        ? "signed-out"
        : spot
          ? "spot-needs-coindcx"
          : liveState.kind === "not-connected"
            ? "not-connected"
            : liveState.kind === "no-trade"
              ? "no-trade"
              : "blocked"
      : null;

  const fmtQuote = (n: number) => (spot ? fmtQuotePrice(n, spot.quote) : `$${n.toFixed(2)}`);

  return (
    <div className="space-y-4">
      <div className="trade-panel">
        <div className="desk-ticket-tabs">
          <button type="button" data-active={panel === "ticket"} onClick={() => setPanel("ticket")} className="desk-ticket-tab">
            Order Ticket
          </button>
          <button
            type="button"
            data-active={panel === "strategy"}
            onClick={() => setPanel("strategy")}
            className="desk-ticket-tab flex items-center justify-center gap-1"
          >
            <Bot className="w-3.5 h-3.5 text-amber-400" />
            Strategy Bot
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
              <div className="mt-2"><ModeStrip mode={effectiveMode} /></div>
            </div>

            <div className="trade-seg trade-seg-full">
              <button type="button" data-active={side === "buy"} data-tone="buy" onClick={() => setSide("buy")} className="trade-seg-btn">
                {spot ? "Buy" : "Buy / Long"}
              </button>
              <button type="button" data-active={side === "sell"} data-tone="sell" onClick={() => setSide("sell")} className="trade-seg-btn">
                {spot ? "Sell" : "Sell / Short"}
              </button>
            </div>

            {/* Quick Strategy Auto-fill */}
            <div className="p-2 rounded-lg bg-[var(--tr-field)] border border-[var(--tr-line-soft)] flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-secondary)]">
                <Zap className="w-3.5 h-3.5 text-amber-400 flex-none" />
                <span>Strategy Rule:</span>
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) applyStrategyToTicket(e.target.value);
                }}
                className="text-[11px] font-semibold bg-transparent text-[var(--accent)] border-0 cursor-pointer focus:outline-none max-w-[170px] truncate"
              >
                <option value="" disabled>⚡ Fill with Strategy…</option>
                <optgroup label="Ready-Made Strategies">
                  <option value="rsi-oversold-long">RSI Oversold Long</option>
                  <option value="ema-crossover">EMA Crossover</option>
                  <option value="macd">MACD Momentum</option>
                  <option value="rsi-ema">RSI + EMA</option>
                  <option value="rsi-combo">RSI Combo</option>
                </optgroup>
                {customStrategies.length > 0 && (
                  <optgroup label="Custom Strategies">
                    {customStrategies.map((cs) => (
                      <option key={cs.id} value={cs.id}>{cs.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label className="trade-label" htmlFor="ticket-symbol">Symbol</label>
              {spot ? (
                <div id="ticket-symbol" className="trade-input font-semibold flex items-center justify-between">
                  <span>{spot.base}/{spot.quote}</span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Spot · CoinDCX
                  </span>
                </div>
              ) : (
                <select
                  id="ticket-symbol"
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value)}
                  className="trade-select font-semibold"
                >
                  {!CRYPTO_SYMBOLS.some((s) => s.value === tradeSymbol) && (
                    <option value={tradeSymbol}>{symbolLabel(tradeSymbol)}</option>
                  )}
                  {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
            </div>

            <div>
              <span className="trade-label">Order type</span>
              <div className="trade-seg trade-seg-full">
                <button
                  type="button"
                  data-active={orderType === "market"}
                  onClick={() => setOrderType("market")}
                  className="trade-seg-btn"
                  disabled={!allowedTypes.includes("market")}
                  title={allowedTypes.includes("market") ? undefined : "CoinDCX is pair par market order nahi leta"}
                >
                  Market
                </button>
                <button type="button" data-active={orderType === "limit"} onClick={() => setOrderType("limit")} className="trade-seg-btn">
                  Limit
                </button>
              </div>
            </div>

            <div>
              <label className="trade-label" htmlFor="ticket-qty">
                Quantity · {unit}
                {spot ? (
                  <span className="normal-case font-medium" style={{ color: "var(--text-muted)" }}>
                    {" "}
                    ·{" "}
                    {side === "sell"
                      ? `${effectiveMode === "live" ? "" : "paper "}hold ${spotHeld} ${spot.base}`
                      : effectiveMode === "live"
                        ? liveReady ? `avail ${fmtQuote(spotBudgetQuote)}` : ""
                        : paperAccount ? `paper avail $${paperAccount.available.toFixed(2)}` : ""}
                  </span>
                ) : (
                  <>
                    {mode === "live" && liveReady && (
                      <span className="normal-case font-medium" style={{ color: "var(--text-muted)" }}>
                        {" "}
                        · avail ${liveState.availableUsdt.toFixed(2)}
                      </span>
                    )}
                    {showPaperBook && paperAccount && (
                      <span className="normal-case font-medium" style={{ color: "var(--text-muted)" }}>
                        {" "}
                        · paper avail ${paperAccount.available.toFixed(2)}
                      </span>
                    )}
                  </>
                )}
              </label>
              <input
                id="ticket-qty"
                type="number"
                min={spot?.rules?.min_qty ?? 0.001}
                step={spot?.rules?.qty_step ?? 0.001}
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
              {spot?.rules && (spot.rules.min_qty || spot.rules.min_notional) ? (
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {spot.rules.min_qty ? `Min ${spot.rules.min_qty} ${spot.base}` : ""}
                  {spot.rules.min_qty && spot.rules.min_notional ? " · " : ""}
                  {spot.rules.min_notional ? `kam se kam ${fmtQuote(spot.rules.min_notional)} ka order` : ""}
                </p>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="trade-label" htmlFor="ticket-price">
                  {orderType === "limit" ? "Limit price" : "Price"} · {spot ? spot.quote : "USDT"}
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
                min="0"
                step={spot ? "any" : "0.01"}
                value={orderType === "market" ? (lastPrice != null ? String(lastPrice) : "") : price}
                placeholder={lastPrice ? String(lastPrice) : "Price"}
                onChange={(e) => setPrice(e.target.value)}
                className="trade-input"
                disabled={orderType === "market"}
              />
            </div>

            {canBracket && (
              <div className="tp-bracket" data-on={bracketOn}>
                <button type="button" className="tp-bracket-toggle" aria-expanded={bracketOn} onClick={() => setBracketOn((v) => !v)}>
                  <span className="tp-check" aria-hidden />
                  Target / Stop loss
                  <span className="tp-bracket-opt">optional</span>
                </button>
                {bracketOn && (
                  <div className="po-grid">
                    <label>
                      <span className="trade-label">Target</span>
                      <input
                        className="trade-input"
                        type="number"
                        min="0"
                        step="any"
                        value={takeProfit}
                        placeholder={side === "buy" ? "Upar ka bhaav" : "Neeche ka bhaav"}
                        onChange={(e) => setTakeProfit(e.target.value)}
                      />
                      {bracketHint(takeProfit, "tp")}
                    </label>
                    <label>
                      <span className="trade-label">Stop loss</span>
                      <input
                        className="trade-input"
                        type="number"
                        min="0"
                        step="any"
                        value={stopLoss}
                        placeholder={side === "buy" ? "Neeche ka bhaav" : "Upar ka bhaav"}
                        onChange={(e) => setStopLoss(e.target.value)}
                      />
                      {bracketHint(stopLoss, "sl")}
                    </label>
                  </div>
                )}
              </div>
            )}

            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-[10px]"
              style={{ background: "var(--tr-field)", border: "1px solid var(--tr-line-soft)" }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Order value
              </span>
              <span className="text-[14px] font-bold tnum text-right">
                {orderValue <= 0
                  ? "—"
                  : spot
                    ? fmtQuotePrice(orderValue, spot.quote)
                    : orderValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
                {spot && orderValue > 0 && spot.rules?.quote_usd && !/^USD/.test(spot.quote) ? (
                  <span className="block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                    ≈ ${(orderValue * spot.rules.quote_usd).toFixed(2)}
                  </span>
                ) : null}
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
            {liveBlockedReason === "spot-needs-coindcx" && (
              <div className="trade-pos-notice">
                <span className="trade-pos-notice-icon"><Plug className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <b>CoinDCX account chahiye</b>
                  <p>Spot pair ka asli order aapke CoinDCX account se lagta hai. Trade-only API key jodiye.</p>
                  <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-primary trade-size-sm mt-2">
                    CoinDCX jodein
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
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
                  : `${mode === "live" ? "Live " : ""}${side === "buy" ? "Buy" : "Sell"} ${unit}`}
              </button>
            )}

            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {spot ? (
                mode === "live" ? (
                  <>
                    Ye <b>live spot order</b> hai
                    {` — aapke CoinDCX account (${liveState.spot?.label || "CoinDCX"}) par asli ${spot.quote} se lagega. Spot par short nahi hota; bechne ke liye coin paas hona chahiye.`}
                  </>
                ) : (
                  <>
                    Ye <b>paper order</b> hai
                    {` — CoinDCX ke abhi ke bhaav par fill hota hai. ${spot.quote} pair ka P&L abhi ke rate se USD paper balance mein judta hai. Spot par short nahi hota.`}
                  </>
                )
              ) : mode === "live" ? (
                <>
                  Ye <b>live order</b> hai — aapke jude hue exchange ({liveState.label || "Delta"}) par
                  asli funds se place hoga. Confirm karke hi bhejein.
                </>
              ) : (
                <>
                  Ye <b>paper order</b> hai — exchange par nahi jaata. Market order abhi ke Delta bhaav par
                  fill hota hai, limit order bhaav cross hone par. ${DEMO_BALANCE_USDT.toLocaleString("en-US")}{" "}virtual
                  balance se shuru, neeche paper positions aur P&amp;L dikhte hain.
                </>
              )}
            </p>
          </div>
        ) : panel === "strategy" ? (
          <div className="trade-panel-body space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="trade-label !mb-0" htmlFor="strategy-select">Select Strategy / Bot</label>
                <Link href="/trade?tab=builder" className="text-[11px] font-semibold text-[var(--accent)] hover:underline flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3" /> Custom Builder
                </Link>
              </div>
              <select
                id="strategy-select"
                value={selectedStratId}
                onChange={(e) => setSelectedStratId(e.target.value)}
                className="trade-select font-semibold"
              >
                <optgroup label="Ready-Made Indicator Strategies">
                  <option value="rsi-oversold-long">RSI Oversold Long (Dip Reversal)</option>
                  <option value="ema-crossover">EMA Crossover (9/21 Trend)</option>
                  <option value="macd">MACD Momentum Breakout</option>
                  <option value="rsi-ema">RSI + EMA Confluence</option>
                  <option value="rsi-combo">RSI Combo (Dual RSI)</option>
                </optgroup>
                <optgroup label="Futures & Options Strategies">
                  <option value="futures-trend-rider">Futures Trend Rider 20x</option>
                  <option value="futures-breakout-scalp">Futures Volatility Scalper</option>
                  <option value="options-iron-condor">Delta Neutral Iron Condor</option>
                  <option value="hedging-spot-perp">Spot + Short Perp Hedge</option>
                </optgroup>
                {customStrategies.length > 0 && (
                  <optgroup label="My Custom Strategies">
                    {customStrategies.map((cs) => (
                      <option key={cs.id} value={cs.id}>{cs.name} ({cs.market.strategyType})</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {currentStrat.description || getTemplate(selectedStratId)?.blurb || ""}
              </p>
            </div>

            {/* Live Signal on Current Symbol */}
            <div
              className="p-3 rounded-xl border flex flex-col gap-2"
              style={{
                background: liveEval.tone === "buy" ? "rgba(16, 185, 129, 0.08)" : liveEval.tone === "sell" ? "rgba(239, 68, 68, 0.08)" : "var(--tr-field)",
                borderColor: liveEval.tone === "buy" ? "rgba(16, 185, 129, 0.3)" : liveEval.tone === "sell" ? "rgba(239, 68, 68, 0.3)" : "var(--tr-line-soft)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Live Market Signal · {symbolLabel(tradeSymbol)}
                </span>
                <span
                  className={`trade-badge ${
                    liveEval.tone === "buy" ? "trade-badge-green" : liveEval.tone === "sell" ? "trade-badge-red" : "trade-badge-neutral"
                  }`}
                >
                  {liveEval.tone === "buy" ? "● BUY SIGNAL" : liveEval.tone === "sell" ? "● SELL SIGNAL" : "○ MONITORING"}
                </span>
              </div>

              <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                {liveEval.headline}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {liveEval.detail}
              </div>

              {liveEval.readouts && liveEval.readouts.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[var(--tr-line-soft)] text-center">
                  {liveEval.readouts.map((r) => (
                    <div key={r.label} className="p-1.5 rounded bg-[var(--bg-card)]">
                      <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)]">{r.label}</div>
                      <div className="text-[11.5px] font-bold tnum" style={{ color: r.color || "var(--text-primary)" }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Strategy Targets & Risk/Reward */}
            <div className="p-3 rounded-xl bg-[var(--tr-field)] border border-[var(--tr-line-soft)] space-y-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-[var(--text-secondary)]">Target (TP)</span>
                <span className="font-bold text-[var(--green)] tnum">
                  +{stratTpPct}% {stratTpPrice ? `(${fmtQuote(stratTpPrice)})` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-[var(--text-secondary)]">Stop Loss (SL)</span>
                <span className="font-bold text-[var(--red)] tnum">
                  -{stratSlPct}% {stratSlPrice ? `(${fmtQuote(stratSlPrice)})` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11.5px] pt-1.5 border-t border-[var(--tr-line-soft)]">
                <span className="font-semibold text-[var(--text-secondary)]">Risk : Reward</span>
                <span className="font-bold text-[var(--accent)] tnum">{stratRr} : 1</span>
              </div>
            </div>

            {/* Paper Trading Capital */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="trade-label !mb-0" htmlFor="strat-capital">Paper Capital (USD)</label>
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Avail: ${paperAccount?.available ? paperAccount.available.toFixed(2) : "10,000.00"}
                </span>
              </div>
              <input
                id="strat-capital"
                type="number"
                min="10"
                value={stratCapital}
                onChange={(e) => setStratCapital(e.target.value)}
                className="trade-input font-semibold"
              />
              <div className="desk-qty-pct mt-1.5">
                {[50, 100, 250, 500, 1000].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    data-active={Number(stratCapital) === cap}
                    onClick={() => setStratCapital(String(cap))}
                  >
                    ${cap}
                  </button>
                ))}
              </div>
            </div>

            {stratNotice && (
              <div className="p-2.5 rounded-lg bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)] text-[12px] text-[var(--green)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-none" />
                <span>{stratNotice}</span>
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 text-[12px]" style={{ color: "var(--red)" }}>
                <AlertCircle className="w-3.5 h-3.5 mt-px flex-none" />
                {error}
              </p>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={placing}
                onClick={executeStrategyPaperTrade}
                className="trade-btn trade-btn-lg w-full flex items-center justify-center gap-2"
                style={{
                  background: stratSide === "sell" ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "linear-gradient(135deg, #10b981, #059669)",
                  color: "#ffffff",
                  boxShadow: stratSide === "sell" ? "0 4px 14px rgba(239, 68, 68, 0.35)" : "0 4px 14px rgba(16, 185, 129, 0.35)",
                }}
              >
                <Zap className="w-4 h-4 fill-white" />
                {placing ? "Executing…" : `⚡ 1-Click Paper Execute (${stratSide.toUpperCase()})`}
              </button>

              <button
                type="button"
                onClick={deployCurrentToPaper}
                className="trade-btn trade-btn-lg w-full flex items-center justify-center gap-2"
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                }}
              >
                <Bot className="w-4 h-4" />
                🤖 Deploy Strategy Bot on Paper
              </button>

              <button
                type="button"
                onClick={() => applyStrategyToTicket(currentStrat.id)}
                className="trade-btn w-full text-[12px] flex items-center justify-center gap-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Fill Manual Ticket with Rules <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
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

      {showPaperBook ? (
        <div className="trade-panel">
          <div className="trade-panel-head">
            <span className="trade-panel-title flex items-center gap-2">Paper account <PaperTag /></span>
            <span className="trade-badge trade-badge-neutral tnum">
              {paperAccount?.positions.length ?? 0} pos · {openOrders.length} open
            </span>
          </div>
          <div className="p-3">
            {paperAccount && (
              <>
                <div className="pp-mini mb-1.5">
                  <div>
                    <span className="pp-label">Paper equity</span>
                    <b className="tnum">${paperAccount.equity.toFixed(2)}</b>
                  </div>
                  <div>
                    <span className="pp-label">Paper P&amp;L</span>
                    <b className="tnum" data-tone={moneyTone(paperPnl)}>{signedMoney(paperPnl)}</b>
                  </div>
                  <div>
                    <span className="pp-label">Available</span>
                    <b className="tnum">${paperAccount.available.toFixed(2)}</b>
                  </div>
                </div>
                <div className="pp-mini mb-3">
                  <div>
                    <span className="pp-label">Unrealized</span>
                    <b className="tnum" data-tone={moneyTone(paperAccount.unrealized_pnl)}>{signedMoney(paperAccount.unrealized_pnl)}</b>
                  </div>
                  <div>
                    <span className="pp-label">Realized</span>
                    <b className="tnum" data-tone={moneyTone(paperAccount.realized_pnl)}>{signedMoney(paperAccount.realized_pnl)}</b>
                  </div>
                  <div>
                    <span className="pp-label">Return</span>
                    <b className="tnum" data-tone={moneyTone(paperAccount.return_pct)}>
                      {`${paperAccount.return_pct > 0.005 ? "+" : ""}${paperAccount.return_pct.toFixed(2)}%`}
                    </b>
                  </div>
                </div>
              </>
            )}
            <button
              type="button"
              className="pp-mini-link w-full"
              onClick={() => document.getElementById("paper-dock")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              Positions, orders aur Modify — chart ke neeche
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title flex items-center gap-2">Open positions <LiveTag /></span>
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
                        {p.symbol ? symbolLabel(p.symbol) : "—"}
                        <span
                          className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}
                        >
                          {"venue" in p && p.venue === "coindcx-spot" ? "Spot" : p.side === "long" ? "Long" : "Short"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {value === null ? (
                          <span className="trade-badge trade-badge-neutral">—</span>
                        ) : (
                          <span className={`trade-badge ${up ? "trade-badge-green" : "trade-badge-red"} tnum`}>
                            {hasPnl ? signedMoney(value) : `${up ? "+" : ""}${value.toFixed(2)}%`}
                          </span>
                        )}
                      </span>
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
      )}
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
          <p>Delta, Bybit ya CoinDCX ki API key jodiye — phir aapki asli positions yahan dikhengi.</p>
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
