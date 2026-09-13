"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  Briefcase,
  Crosshair,
  Crown,
  FlaskConical,
  FolderKanban,
  Home,
  Layers,
  LineChart,
  Moon,
  Radar,
  RefreshCw,
  Search,
  Sigma,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  User,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import TradePanel from "@/components/trade/TradePanel";
import ChartDeskTools, { type DrawTool } from "@/components/trade/ChartDeskTools";
import BacktestPanel from "@/components/trade/BacktestPanel";
import StrategyCards from "@/components/trade/StrategyCards";
import Screener from "@/components/trade/Screener";
import OptionsAnalytics from "@/components/trade/OptionsAnalytics";
import MyStrategiesPanel from "@/components/trade/MyStrategiesPanel";
import StrategyBuilder from "@/components/trade/StrategyBuilder";
import {
  CHART_RANGES,
  barsForDays,
  candlesSpanDays,
  checkCryptoHealth,
  fetchCandles,
  isLocalBackend,
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

type Tab = "markets" | "screener" | "backtest" | "strategies" | "mine" | "builder" | "options";

const SHOW_OPTIONS_TAB = true;

const TABS: { id: Tab; label: string; icon: typeof LineChart }[] = [
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "screener", label: "Screeners", icon: Radar },
  { id: "backtest", label: "Backtest", icon: FlaskConical },
  { id: "strategies", label: "Catalogue", icon: Layers },
  { id: "mine", label: "My Strategies", icon: FolderKanban },
  { id: "builder", label: "Builder", icon: Wand2 },
  ...(SHOW_OPTIONS_TAB ? [{ id: "options" as const, label: "Options", icon: Sigma }] : []),
];

const NAV: {
  id: Tab | "home" | "portfolio" | "watchlist";
  label: string;
  icon: typeof LineChart;
  href?: string;
}[] = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "screener", label: "Screeners", icon: Radar },
  { id: "watchlist", label: "Watchlist", icon: Star },
  { id: "portfolio", label: "Portfolio", icon: Briefcase, href: "/portfolio" },
  { id: "backtest", label: "Backtest", icon: FlaskConical },
  { id: "strategies", label: "Catalogue", icon: Layers },
  { id: "mine", label: "My Strategies", icon: FolderKanban },
  { id: "builder", label: "Builder", icon: Wand2 },
  ...(SHOW_OPTIONS_TAB ? [{ id: "options" as const, label: "Options", icon: Sigma }] : []),
];

function fmtUsd(n: number): string {
  return n >= 1000
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : `$${n.toFixed(4)}`;
}

function fmtCompact(n: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

const MARKET_POLL_MS = 30_000;

function shortInterval(value: string): string {
  return value.endsWith("m") ? value : value.toUpperCase();
}

function baseAsset(symbol: string): string {
  return symbol.replace(/USDT$|USD$/i, "") || symbol;
}

function pairIconColor(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC")) return "linear-gradient(145deg, #f7931a, #e67e00)";
  if (s.startsWith("ETH")) return "linear-gradient(145deg, #627eea, #4b64c7)";
  if (s.startsWith("SOL")) return "linear-gradient(145deg, #9945ff, #14f195)";
  return "linear-gradient(145deg, #00e676, #00c853)";
}

function changeFromCandles(candles: Candle[], lookback: number): number | null {
  if (candles.length < 2) return null;
  const end = candles.at(-1)?.close;
  const start = candles[Math.max(0, candles.length - 1 - lookback)]?.close;
  if (!end || !start) return null;
  return ((end - start) / start) * 100;
}

export default function TradePage() {
  return (
    <Suspense fallback={<div className="h-full" style={{ background: "#05080d" }} />}>
      <TradeTerminal />
    </Suspense>
  );
}

function TradeTerminal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((t) => t.id === requested) ? (requested as Tab) : "markets";
  });
  const [builderId, setBuilderId] = useState<string | null>(() => searchParams.get("edit"));
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [search, setSearch] = useState("");
  const [utcClock, setUtcClock] = useState("--:--:--");

  const goTab = useCallback((next: Tab, editId: string | null = null) => {
    setTab(next);
    setBuilderId(next === "builder" ? editId : null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    if (next === "builder" && editId) params.set("edit", editId);
    else params.delete("edit");
    router.replace(`/trade?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const [interval, setInterval] = useState("1h");
  const [historyDays, setHistoryDays] = useState(7);
  const [showEma9, setShowEma9] = useState(true);
  const [showEma21, setShowEma21] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [compareCandles, setCompareCandles] = useState<Candle[]>([]);
  const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0);
  const chartPanelRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcClock(
        now.toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

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
      setOnline(true);
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
    if (!compareSymbol) {
      setCompareCandles([]);
      return;
    }
    let cancelled = false;
    void fetchCandles({
      symbol: compareSymbol,
      interval,
      limit: barsForDays(historyDays, interval),
    })
      .then((res) => {
        if (cancelled) return;
        setCompareCandles(res.success ? res.candles ?? [] : []);
      })
      .catch(() => {
        if (!cancelled) setCompareCandles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [compareSymbol, interval, historyDays]);

  useEffect(() => {
    let timer: number | undefined;

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void loadMarket(), MARKET_POLL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        return;
      }
      void loadMarket();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = search.trim().toUpperCase().replace("/", "");
    if (!q) return;
    const hit = CRYPTO_SYMBOLS.find(
      (s) => s.value.includes(q) || s.label.replace("/", "").includes(q),
    );
    if (hit) {
      setSymbol(hit.value);
      goTab("markets");
      setSearch("");
    }
  };

  const changePositive = (market?.change_24h ?? 0) >= 0;
  const changeColor = changePositive ? "var(--green)" : "var(--red)";
  const ChangeIcon = changePositive ? TrendingUp : TrendingDown;

  const emaToggles = useMemo(
    () => [
      { id: "9", label: "EMA 9", on: showEma9, set: setShowEma9, color: "#60a5fa" },
      { id: "21", label: "EMA 21", on: showEma21, set: setShowEma21, color: "#fbbf24" },
      { id: "50", label: "EMA 50", on: showEma50, set: setShowEma50, color: "#c084fc" },
    ],
    [showEma9, showEma21, showEma50],
  );

  const rangePct = useMemo(() => {
    if (!market) return 50;
    const span = market.high_24h - market.low_24h;
    if (span <= 0) return 50;
    return Math.min(100, Math.max(0, ((market.current_price - market.low_24h) / span) * 100));
  }, [market]);

  const sentiment = useMemo(() => {
    const ch = market?.change_24h ?? 0;
    return Math.min(92, Math.max(8, Math.round(50 + ch * 4)));
  }, [market]);

  const perf = useMemo(() => {
    const barsPerDay =
      interval.endsWith("m") ? Math.max(1, Math.round((24 * 60) / Number(interval))) :
      interval.endsWith("h") ? Math.max(1, Math.round(24 / Number(interval))) : 1;
    return [
      { label: "1D", value: market?.change_24h ?? changeFromCandles(candles, barsPerDay) },
      { label: "1W", value: changeFromCandles(candles, barsPerDay * 7) },
      { label: "1M", value: changeFromCandles(candles, barsPerDay * 30) },
      { label: "1Y", value: changeFromCandles(candles, candles.length - 1) },
    ];
  }, [candles, interval, market]);

  const activeNav = tab === "markets" ? "markets" : tab;

  const renderNavItem = (item: (typeof NAV)[number], mobile = false) => {
    const Icon = item.icon;
    const isActive =
      item.id === "watchlist" ? false :
      item.href ? false :
      item.id === activeNav;

    const onClick = () => {
      if (item.href) {
        router.push(item.href);
        return;
      }
      if (item.id === "watchlist") {
        goTab("markets");
        setNotice("Watchlist soon — Markets pe switch kiya");
        return;
      }
      goTab(item.id as Tab);
    };

    return (
      <button
        key={`${mobile ? "m-" : ""}${item.id}`}
        type="button"
        data-active={isActive}
        onClick={onClick}
        className="desk-nav-item"
      >
        <Icon className="w-[15px] h-[15px]" />
        {item.label}
      </button>
    );
  };

  return (
    <div className="trade-root">
      <div className="desk-shell">
        {/* ── Left sidebar ─────────────────────────────── */}
        <aside className="desk-sidebar" aria-label="Desk navigation">
          <div className="desk-brand">
            <div className="desk-brand-mark" aria-hidden>F</div>
            <div>
              <div className="desk-brand-name">Finowings</div>
              <div className="desk-brand-sub">Desk</div>
            </div>
          </div>

          <nav className="desk-nav">
            {NAV.map((item) => renderNavItem(item))}
          </nav>

          <div className="desk-premium">
            <div className="desk-premium-icon" aria-hidden>
              <Crown className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <div className="desk-premium-title">Upgrade to Premium</div>
            <p className="desk-premium-copy">Advanced signals, deeper history & priority sync.</p>
            <button type="button" className="desk-premium-btn" onClick={askAi}>
              Go Premium
            </button>
          </div>
        </aside>

        <div className="desk-main">
          {/* ── Top header ─────────────────────────────── */}
          <header className="desk-header">
            <form className="desk-search" onSubmit={onSearchSubmit}>
              <Search className="w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Crypto, Pairs, Markets..."
                aria-label="Search crypto pairs"
              />
            </form>

            <div className="desk-header-right">
              <span className="desk-live" data-offline={online === false}>
                <span className="trade-dot" aria-hidden />
                {online === false ? "Offline" : "Live"}
              </span>
              <span className="desk-clock">{utcClock} UTC</span>
              <button type="button" className="trade-iconbtn" aria-label="Notifications" onClick={askAi}>
                <Bell className="w-4 h-4" />
              </button>
              <button type="button" className="trade-iconbtn" aria-label="Theme" disabled title="Dark desk">
                <Moon className="w-4 h-4" />
              </button>
              <button type="button" className="trade-iconbtn" aria-label="Ask AI" onClick={askAi}>
                <Sparkles className="w-4 h-4" />
              </button>
              <div className="desk-avatar" aria-hidden>
                <User className="w-4 h-4" />
              </div>
            </div>
          </header>

          <div className="desk-mobile-nav" aria-label="Mobile navigation">
            {NAV.map((item) => renderNavItem(item, true))}
          </div>

          <div className="desk-body">
            {online === false && (
              <div className="trade-panel flex items-start gap-3 px-4 py-3 text-[13px] mb-3" style={{ borderColor: "rgba(255, 179, 0, 0.35)", background: "rgba(255, 179, 0, 0.06)" }}>
                <Activity className="w-4 h-4 mt-0.5 flex-none" style={{ color: "var(--amber)" }} />
                <span style={{ color: "var(--text-secondary)" }}>
                  {isLocalBackend() ? (
                    <>
                      Backend band hai. Repo ke <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>backend</code>{" "}folder mein{" "}
                      <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--tr-field)", fontSize: 12 }}>uvicorn main:app --port 8000</code>{" "}chalao.
                    </>
                  ) : (
                    <>
                      Backend se jawab nahi mila. Free hosting par instance so jaata hai — <b>Refresh</b> dabakar dobara koshish karein.
                    </>
                  )}
                </span>
              </div>
            )}

            {notice && (
              <div className="trade-panel flex items-center gap-3 px-4 py-3 text-[13px] mb-3" style={{ borderColor: "rgba(0, 230, 118, 0.28)", background: "rgba(0, 230, 118, 0.06)" }}>
                <span className="flex-1" style={{ color: "var(--text-secondary)" }}>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="trade-iconbtn trade-iconbtn-sm">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {tab === "markets" && (
              <>
                <div className="desk-pair" aria-label="Live quote">
                  <div className="desk-pair-left">
                    <div className="desk-pair-icon" style={{ background: pairIconColor(symbol) }}>
                      {baseAsset(symbol).slice(0, 1)}
                    </div>
                    <div>
                      <div className="desk-pair-name">{symbolLabel(symbol)}</div>
                      <div className="desk-pair-tag">Spot · Delta exchange</div>
                    </div>
                  </div>

                  <div>
                    <div className="desk-pair-price">
                      {market ? fmtUsd(market.current_price) : "—"}
                    </div>
                    <div className="desk-pair-change mt-1.5" style={{ color: market ? changeColor : undefined }}>
                      {market && <ChangeIcon className="w-3.5 h-3.5" />}
                      {market ? `${changePositive ? "+" : ""}${market.change_24h.toFixed(2)}%` : "—"}
                      <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>24h</span>
                    </div>
                  </div>

                  <div className="desk-pair-stats">
                    <div className="desk-pair-stat">
                      <div className="desk-pair-stat-label">24h High</div>
                      <div className="desk-pair-stat-value">{market ? fmtUsd(market.high_24h) : "—"}</div>
                    </div>
                    <div className="desk-pair-stat">
                      <div className="desk-pair-stat-label">24h Low</div>
                      <div className="desk-pair-stat-value">{market ? fmtUsd(market.low_24h) : "—"}</div>
                    </div>
                    <div className="desk-pair-stat hidden sm:block">
                      <div className="desk-pair-stat-label">24h Volume</div>
                      <div className="desk-pair-stat-value">{market ? fmtCompact(market.volume_24h) : "—"}</div>
                    </div>
                  </div>

                  <div className="desk-pair-actions">
                    <button type="button" className="trade-iconbtn" aria-label="Watchlist">
                      <Star className="w-4 h-4" />
                    </button>
                    <button type="button" className="trade-iconbtn" aria-label="Alerts" onClick={askAi}>
                      <Bell className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="desk-markets">
                  <div className="desk-stats-col">
                    <div className="desk-stat-card">
                      <div className="desk-stat-card-top">
                        <span className="desk-stat-label">Last Price</span>
                        <span className="desk-stat-icon"><Zap className="w-3.5 h-3.5" /></span>
                      </div>
                      <div className="desk-stat-value">{market ? fmtUsd(market.current_price) : "—"}</div>
                    </div>
                    <div className="desk-stat-card">
                      <div className="desk-stat-card-top">
                        <span className="desk-stat-label">24h Change</span>
                        <span className="desk-stat-icon"><ChangeIcon className="w-3.5 h-3.5" /></span>
                      </div>
                      <div className="desk-stat-value" style={{ color: market ? changeColor : undefined }}>
                        {market ? `${changePositive ? "+" : ""}${market.change_24h.toFixed(2)}%` : "—"}
                      </div>
                    </div>
                    <div className="desk-stat-card">
                      <div className="desk-stat-card-top">
                        <span className="desk-stat-label">24h High / Low</span>
                        <span className="desk-stat-icon"><Crosshair className="w-3.5 h-3.5" /></span>
                      </div>
                      <div className="desk-stat-value" style={{ fontSize: 13 }}>
                        {market ? `${fmtUsd(market.high_24h)}` : "—"}
                      </div>
                      <div className="desk-stat-sub">{market ? `Low ${fmtUsd(market.low_24h)}` : ""}</div>
                    </div>
                    <div className="desk-stat-card">
                      <div className="desk-stat-card-top">
                        <span className="desk-stat-label">Volume</span>
                        <span className="desk-stat-icon"><Activity className="w-3.5 h-3.5" /></span>
                      </div>
                      <div className="desk-stat-value">{market ? fmtCompact(market.volume_24h) : "—"}</div>
                    </div>
                    <div className="desk-stat-card">
                      <div className="desk-stat-card-top">
                        <span className="desk-stat-label">Chart History</span>
                        <span className="desk-stat-icon"><LineChart className="w-3.5 h-3.5" /></span>
                      </div>
                      <div className="desk-stat-value" style={{ fontSize: 13 }}>
                        {candles.length ? `${candlesSpanDays(candles).toFixed(1)}d` : "—"}
                      </div>
                      <div className="desk-stat-sub">{candles.length ? `${candles.length} bars` : ""}</div>
                    </div>
                  </div>

                  <div className="desk-chart-col">
                  <section
                    ref={(el) => {
                      chartPanelRef.current = el;
                    }}
                    className="trade-panel desk-chart-panel overflow-hidden min-w-0"
                  >
                    <ChartDeskTools
                      symbol={symbol}
                      onSymbol={setSymbol}
                      emaToggles={emaToggles}
                      showVolume={showVolume}
                      onShowVolume={setShowVolume}
                      compareSymbol={compareSymbol}
                      onCompareSymbol={setCompareSymbol}
                      drawTool={drawTool}
                      onDrawTool={setDrawTool}
                      onClearDrawings={() => setClearDrawingsKey((k) => k + 1)}
                      fullscreenTargetRef={chartPanelRef}
                    />

                    <div className="trade-toolbar">
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

                      <div className="trade-ema-row">
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

                      <select
                        className="trade-select trade-size-sm trade-ema-select"
                        aria-label="EMA overlays"
                        value={`${showEma9 ? 1 : 0}${showEma21 ? 1 : 0}${showEma50 ? 1 : 0}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          setShowEma9(v[0] === "1");
                          setShowEma21(v[1] === "1");
                          setShowEma50(v[2] === "1");
                        }}
                      >
                        <option value="111">EMA 9 · 21 · 50</option>
                        <option value="110">EMA 9 · 21</option>
                        <option value="100">EMA 9 only</option>
                        <option value="010">EMA 21 only</option>
                        <option value="001">EMA 50 only</option>
                        <option value="000">EMAs off</option>
                      </select>

                      <div className="flex-1 min-w-[8px]" />

                      <select
                        value={historyDays}
                        onChange={(e) => setHistoryDays(Number(e.target.value))}
                        className="trade-select trade-w-history trade-size-sm"
                        title="Chart history"
                        aria-label="Chart history"
                      >
                        {CHART_RANGES.map((range) => (
                          <option key={range.days} value={range.days}>{range.days}d</option>
                        ))}
                      </select>

                      <button type="button" onClick={loadMarket} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
                      </button>
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
                          showVolume={showVolume}
                          compareCandles={compareCandles}
                          compareLabel={compareSymbol ? symbolLabel(compareSymbol) : undefined}
                          drawTool={drawTool}
                          clearDrawingsKey={clearDrawingsKey}
                        />
                      )}
                    </div>
                    {updatedAt && (
                      <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--tr-line-soft)" }}>
                        Synced {updatedAt} · poll {MARKET_POLL_MS / 1000}s
                        {compareSymbol ? ` · compare ${symbolLabel(compareSymbol)}` : ""}
                        {drawTool !== "cursor" ? ` · drawing ${drawTool}` : ""}
                      </div>
                    )}
                  </section>

                <div className="desk-bottom">
                  <div className="trade-panel desk-gauge-wrap">
                    <div className="desk-stat-label w-full text-left mb-1">Market Sentiment</div>
                    <div className="desk-gauge" style={{ ["--p" as string]: sentiment }}>
                      <div className="desk-gauge-inner">
                        <div className="desk-gauge-pct">{sentiment}%</div>
                        <div className="desk-gauge-label">{sentiment >= 50 ? "Bullish" : "Bearish"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="trade-panel trade-panel-body">
                    <div className="desk-stat-label mb-1">24h Range</div>
                    <div className="desk-range-bar">
                      <span className="desk-range-thumb" style={{ left: `${rangePct}%` }} />
                    </div>
                    <div className="desk-range-ends">
                      <span>{market ? fmtUsd(market.low_24h) : "—"}</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {market ? fmtUsd(market.current_price) : "—"}
                      </span>
                      <span>{market ? fmtUsd(market.high_24h) : "—"}</span>
                    </div>
                  </div>

                  <div className="trade-panel trade-panel-body">
                    <div className="desk-stat-label mb-2">Performance</div>
                    <div className="desk-perf-grid">
                      {perf.map((p) => {
                        const v = p.value;
                        const up = (v ?? 0) >= 0;
                        return (
                          <div key={p.label} className="desk-perf-cell">
                            <div className="desk-perf-label">{p.label}</div>
                            <div
                              className="desk-perf-value"
                              style={{ color: v == null ? "var(--text-muted)" : up ? "var(--green)" : "var(--red)" }}
                            >
                              {v == null ? "—" : `${up ? "+" : ""}${v.toFixed(2)}%`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                  </div>

                  <aside className="trade-sticky-rail">
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
              </>
            )}

            {tab === "screener" && (
              <Screener
                defaultInterval={interval}
                onPickSymbol={(picked) => {
                  setSymbol(picked);
                  goTab("markets");
                }}
              />
            )}

            {SHOW_OPTIONS_TAB && tab === "options" && <OptionsAnalytics />}

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

            {tab === "mine" && (
              <MyStrategiesPanel
                onCreate={() => goTab("builder", null)}
                onEdit={(id) => goTab("builder", id)}
              />
            )}

            {tab === "builder" && (
              <StrategyBuilder
                key={builderId ?? "new"}
                strategyId={builderId}
                defaultSymbol={symbol}
                onBack={() => goTab("mine")}
                onSaved={() => {
                  /* stay in builder */
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
