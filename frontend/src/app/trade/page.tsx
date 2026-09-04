"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  FlaskConical,
  LineChart,
  Layers,
  RefreshCw,
  Radar,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import TradePanel from "@/components/trade/TradePanel";
import BacktestPanel from "@/components/trade/BacktestPanel";
import StrategyCards from "@/components/trade/StrategyCards";
import Screener from "@/components/trade/Screener";
import {
  CHART_RANGES,
  barsForDays,
  candlesSpanDays,
  checkCryptoHealth,
  fetchCandles,
  fetchDeltaPositions,
  fetchDemoOrders,
  fetchMarketInfo,
  placeDemoOrder,
  runBacktest,
  symbolLabel,
  CRYPTO_INTERVALS,
  CRYPTO_SYMBOLS,
  type BacktestParams,
  type BacktestResult,
  type Candle,
  type DemoOrder,
  type DeltaPositionsResult,
  type MarketInfo,
} from "@/lib/cryptoApi";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

type Tab = "markets" | "screener" | "backtest" | "strategies";

const TABS: { id: Tab; label: string; icon: typeof LineChart }[] = [
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "screener", label: "Screener", icon: Radar },
  { id: "backtest", label: "Backtest", icon: FlaskConical },
  { id: "strategies", label: "Strategies", icon: Layers },
];

function fmtUsd(n: number): string {
  return n >= 1000
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : `$${n.toFixed(4)}`;
}

function fmtCompact(n: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** "1m" stays "1m", "1h" becomes "1H" — short labels for the segmented control. */
function shortInterval(value: string): string {
  return value.endsWith("m") ? value : value.toUpperCase();
}

/** `useSearchParams` ko Suspense boundary chahiye — isliye asli page andar hai. */
export default function TradePage() {
  return (
    <Suspense fallback={<div className="h-full" style={{ background: "var(--bg-primary)" }} />}>
      <TradeTerminal />
    </Suspense>
  );
}

function TradeTerminal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Strategy page se wapas aane par wahi tab khule jahan se gaye the.
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((t) => t.id === requested) ? (requested as Tab) : "markets";
  });
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  // Chart kitne din pehle tak dikhaye — bars isi se derive hote hain.
  const [historyDays, setHistoryDays] = useState(7);
  const [showEma9, setShowEma9] = useState(true);
  const [showEma21, setShowEma21] = useState(true);
  const [showEma50, setShowEma50] = useState(true);

  const [online, setOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [positions, setPositions] = useState<DeltaPositionsResult>({
    positions: [],
    configured: true,
    reason: null,
    message: null,
  });
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestDefaults, setBacktestDefaults] = useState<Partial<BacktestParams>>({});

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candleRes, info] = await Promise.all([
        fetchCandles({ symbol, interval, limit: barsForDays(historyDays, interval) }),
        fetchMarketInfo(symbol).catch(() => null),
      ]);
      if (!candleRes.success) throw new Error(candleRes.error || "Candle data nahi mili");
      setCandles(candleRes.candles ?? []);
      setMarket(info?.success ? info : null);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crypto backend connect nahi ho raha (port 2000)");
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval, historyDays]);

  const loadBook = useCallback(async () => {
    const [nextOrders, nextPositions] = await Promise.all([
      fetchDemoOrders().catch(() => [] as DemoOrder[]),
      fetchDeltaPositions(symbol),
    ]);
    setOrders(nextOrders);
    setPositions(nextPositions);
  }, [symbol]);

  useEffect(() => {
    checkCryptoHealth().then(setOnline);
  }, []);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  const handlePlace = async (payload: {
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
  }) => {
    setPlacing(true);
    try {
      const res = await placeDemoOrder(payload);
      if (!res.success) throw new Error(res.error || "Order fail");
      setNotice(`${payload.side.toUpperCase()} order place ho gayi`);
      await loadBook();
    } finally {
      setPlacing(false);
    }
  };

  const handleBacktest = async (params: BacktestParams) => {
    setTab("backtest");
    setBacktestRunning(true);
    setBacktestError(null);
    setBacktestResult(null);
    try {
      const res = await runBacktest(params);
      if (!res.success) throw new Error(res.error || "Backtest fail");
      setBacktestResult(res);
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "Backtest fail ho gaya");
    } finally {
      setBacktestRunning(false);
    }
  };

  const askAi = () => {
    const price = market?.current_price;
    const change = market?.change_24h;
    const last = candles.at(-1);
    const prompt = [
      `${symbolLabel(symbol)} ${interval} chart analyze karo.`,
      price != null ? `Current price: ${fmtUsd(price)}.` : "",
      change != null ? `24h change: ${change.toFixed(2)}%.` : "",
      last?.ema_9 != null ? `EMA9 ${last.ema_9.toFixed(2)}, EMA21 ${last.ema_21?.toFixed(2)}, EMA50 ${last.ema_50?.toFixed(2)}.` : "",
      "Buy/sell signal, support/resistance aur risk batao.",
    ].filter(Boolean).join(" ");
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    router.push("/");
  };

  const changePositive = (market?.change_24h ?? 0) >= 0;
  const changeColor = changePositive ? "var(--green)" : "var(--red)";
  const ChangeIcon = changePositive ? TrendingUp : TrendingDown;

  const emaToggles = useMemo(
    () => [
      { id: "9", label: "EMA 9", on: showEma9, set: setShowEma9, color: "#2563eb" },
      { id: "21", label: "EMA 21", on: showEma21, set: setShowEma21, color: "#d97706" },
      { id: "50", label: "EMA 50", on: showEma50, set: setShowEma50, color: "#7c3aed" },
    ],
    [showEma9, showEma21, showEma50],
  );

  return (
    <div className="trade-root h-full overflow-y-auto" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* ── Terminal top bar ─────────────────────────────── */}
      <header className="trade-topbar">
        <div className="max-w-[1720px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-3 h-[60px]">
            <button type="button" onClick={() => router.push("/")} className="trade-iconbtn" aria-label="Back to chat">
              <ArrowLeft className="w-[17px] h-[17px]" />
            </button>
            <Logo size={26} />
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold leading-tight tracking-tight">Crypto Terminal</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="trade-dot"
                  style={{ color: online === false ? "var(--red)" : "var(--green)" }}
                  aria-hidden
                />
                <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {online === false ? "Backend offline" : "Delta Exchange · live"}
                </p>
              </div>
            </div>

            {/* Live ticker — desktop only */}
            <div className="trade-ticker ml-6 h-9">
              <div className="trade-ticker-item">
                <span className="trade-ticker-label">{symbolLabel(symbol)}</span>
                <span className="trade-ticker-value">{market ? fmtUsd(market.current_price) : "—"}</span>
              </div>
              <div className="trade-ticker-item">
                <span className="trade-ticker-label">24h</span>
                <span className="trade-ticker-value inline-flex items-center gap-1" style={{ color: market ? changeColor : undefined }}>
                  {market && <ChangeIcon className="w-3 h-3" />}
                  {market ? `${changePositive ? "+" : ""}${market.change_24h.toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="trade-ticker-item">
                <span className="trade-ticker-label">High</span>
                <span className="trade-ticker-value">{market ? fmtUsd(market.high_24h) : "—"}</span>
              </div>
              <div className="trade-ticker-item">
                <span className="trade-ticker-label">Low</span>
                <span className="trade-ticker-value">{market ? fmtUsd(market.low_24h) : "—"}</span>
              </div>
            </div>

            <div className="flex-1" />

            {updatedAt && (
              <span className="hidden xl:block text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                Updated {updatedAt}
              </span>
            )}
            <button type="button" onClick={askAi} className="trade-btn trade-btn-primary">
              <Sparkles className="w-4 h-4" />
              Ask AI
            </button>
          </div>

          {/* ── Tabs ──────────────────────────────────────── */}
          <nav className="trade-tabs" role="tablist" aria-label="Trade sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  data-active={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className="trade-tab inline-flex items-center gap-2"
                >
                  <Icon className="w-[15px] h-[15px]" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-[1720px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        {online === false && (
          <div className="trade-panel flex items-start gap-3 px-4 py-3 text-[13px]" style={{ borderColor: "rgba(217, 119, 6, 0.3)", background: "rgba(217, 119, 6, 0.05)" }}>
            <Activity className="w-4 h-4 mt-0.5 flex-none" style={{ color: "var(--amber)" }} />
            <span style={{ color: "var(--text-secondary)" }}>
              Backend band hai. Repo ke <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>backend</code>{" "}folder mein{" "}
              <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>uvicorn main:app --port 8000</code>{" "}chalao.
            </span>
          </div>
        )}

        {notice && (
          <div className="trade-panel flex items-center gap-3 px-4 py-3 text-[13px]" style={{ borderColor: "rgba(37, 99, 235, 0.28)", background: "rgba(37, 99, 235, 0.05)" }}>
            <span className="flex-1" style={{ color: "var(--text-secondary)" }}>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="trade-iconbtn trade-iconbtn-sm">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {tab === "markets" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_368px] items-start">
            <section className="trade-panel overflow-hidden min-w-0">
              {/* Chart toolbar */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3">
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  aria-label="Symbol"
                  className="trade-select trade-w-symbol trade-strong"
                >
                  {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <div className="trade-seg overflow-x-auto scrollbar-hide max-w-full">
                  {CRYPTO_INTERVALS.map((iv) => (
                    <button
                      key={iv.value}
                      type="button"
                      data-active={interval === iv.value}
                      onClick={() => setInterval(iv.value)}
                      className="trade-seg-btn"
                      title={iv.label}
                    >
                      {shortInterval(iv.value)}
                    </button>
                  ))}
                </div>

                <div className="trade-divider-v hidden lg:block my-1" />

                <div className="flex items-center gap-2">
                  {emaToggles.map((ema) => (
                    <button
                      key={ema.id}
                      type="button"
                      data-on={ema.on}
                      onClick={() => ema.set(!ema.on)}
                      className="trade-chip"
                      aria-pressed={ema.on}
                    >
                      <span className="trade-chip-dot" style={{ background: ema.color }} />
                      {ema.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    History
                    <select
                      value={historyDays}
                      onChange={(e) => setHistoryDays(Number(e.target.value))}
                      className="trade-select trade-w-history trade-size-sm"
                      title="Chart kitne din pehle tak dikhaye"
                    >
                      {CHART_RANGES.map((range) => (
                        <option key={range.days} value={range.days}>{range.days} din</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={loadMarket} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
                    <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
                  </button>
                </div>
              </div>

              {/* Market stat strip — hairline separated cells */}
              <div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                style={{ gap: 1, background: "var(--tr-line-soft)", borderTop: "1px solid var(--tr-line-soft)" }}
              >
                <StripCell label="Last price" value={market ? fmtUsd(market.current_price) : "—"} />
                <StripCell
                  label="24h change"
                  value={market ? `${changePositive ? "+" : ""}${market.change_24h.toFixed(2)}%` : "—"}
                  color={market ? changeColor : undefined}
                />
                <StripCell label="24h high" value={market ? fmtUsd(market.high_24h) : "—"} />
                <StripCell label="24h low" value={market ? fmtUsd(market.low_24h) : "—"} />
                <StripCell label="24h volume" value={market ? fmtCompact(market.volume_24h) : "—"} />
                <StripCell
                  label="Chart history"
                  value={candles.length ? `${candlesSpanDays(candles).toFixed(1)} din · ${candles.length} bars` : "—"}
                />
              </div>

              {error && (
                <p className="px-4 py-2.5 text-[13px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
                  {error}
                </p>
              )}

              <div className="trade-chart-wrap">
                {loading && candles.length === 0 ? (
                  <div className="w-full h-full shimmer" />
                ) : (
                  <CandleChart
                    candles={candles}
                    symbol={symbolLabel(symbol)}
                    interval={shortInterval(interval)}
                    showEma9={showEma9}
                    showEma21={showEma21}
                    showEma50={showEma50}
                  />
                )}
              </div>
            </section>

            <aside className="xl:sticky xl:top-[116px]">
              <TradePanel
                symbol={symbol}
                lastPrice={market?.current_price}
                orders={orders}
                positions={positions.positions}
                positionsUnavailable={positions.configured ? null : positions.message}
                placing={placing}
                onPlace={handlePlace}
              />
            </aside>
          </div>
        )}

        {tab === "screener" && (
          <Screener
            defaultInterval={interval}
            onPickSymbol={(picked) => {
              setSymbol(picked);
              setTab("markets");
            }}
          />
        )}

        {tab === "backtest" && (
          <BacktestPanel
            defaults={{ symbol, timeframe: interval, ...backtestDefaults }}
            running={backtestRunning}
            result={backtestResult}
            error={backtestError}
            onRun={handleBacktest}
          />
        )}

        {tab === "strategies" && (
          <StrategyCards
            defaultSymbol={symbol}
            running={backtestRunning}
            onTest={(params) => {
              setBacktestDefaults(params);
              void handleBacktest(params);
            }}
          />
        )}
      </main>
    </div>
  );
}

function StripCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-4 py-2.5" style={{ background: "var(--bg-card)" }}>
      <div className="trade-stat-label">{label}</div>
      <div className="text-[14px] font-bold mt-1 tnum tracking-tight" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
