"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { LiveStatus } from "@/lib/deltaLive";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  Briefcase,
  Crown,
  FlaskConical,
  FolderKanban,
  Layers,
  LineChart,
  Moon,
  Plug,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sigma,
  Sparkles,
  Star,
  ListOrdered,
  TrendingDown,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import TradePanel, { type LiveTradeState, type PositionsState } from "@/components/trade/TradePanel";
import { useAuth } from "@/context/AuthContext";
import {
  AccountApiError,
  fetchExchangeBalances,
  fetchMyPositions,
  listExchangeAccounts,
  placeByokOrder,
} from "@/lib/accountApi";
import AccountMenu from "@/components/trade/AccountMenu";
import MarketList from "@/components/trade/MarketList";
import ChartDeskTools, { type DrawTool } from "@/components/trade/ChartDeskTools";
import {
  ChartTypeMenu,
  IndicatorsButton,
  IndicatorsDialog,
  TimeframeMenu,
  type IndicatorDialogState,
} from "@/components/trade/ChartToolbar";
import { CHART_TIMEFRAMES, DEFAULT_TF_FAVORITES, isChartType, tfShort, type ChartType } from "@/lib/chartTypes";
import { DEFAULT_INDICATORS, INDICATOR_BY_ID, type ActiveIndicator } from "@/lib/chartIndicators";
import {
  MAX_CHART_CANDLES,
  intervalMinutes,
  candlesSpanDays,
  checkCryptoHealth,
  fetchCandles,
  isLocalBackend,
  fetchDemoOrders,
  fetchMarketInfo,
  fetchMarketSources,
  fetchPaperAccount,
  placeDemoOrder,
  runBacktest,
  symbolLabel,
  venueShort,
  DEFAULT_MARKET_SOURCES,
  type BacktestParams,
  type BacktestResult,
  type Candle,
  type DemoOrder,
  type PaperAccount,
  type MarketInfo,
  type MarketSourceInfo,
  syncStamp,
  deskClock,
  DESK_TZ_LABEL,
  DESK_CONTRACT,
} from "@/lib/cryptoApi";
import {
  fmtQuoteCompact,
  fmtQuotePrice,
  isSpotKey,
  isSpotVenue,
  orderKey,
  pairLabel,
  parseWatchKey,
  splitPair,
} from "@/lib/marketQuote";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

const AiAssistant = dynamic(() => import("@/components/ai/AiAssistant"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer rounded-xl" />,
});

const PortfolioDesk = dynamic(() => import("@/components/portfolio/PortfolioDesk"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer rounded-xl" />,
});

// Markets ke alawa har tab apna chunk tab hi laaye jab khula jaaye — warna
// pehle load mein recharts samet saare tabs ka JS aa jaata hai.
const tabLoading = () => <div className="w-full min-h-[320px] shimmer rounded-xl" />;
const ExchangesDesk = dynamic(() => import("@/components/trade/ExchangesDesk"), { loading: tabLoading });
const BacktestPanel = dynamic(() => import("@/components/trade/BacktestPanel"), { loading: tabLoading });
const StrategyCards = dynamic(() => import("@/components/trade/StrategyCards"), { loading: tabLoading });
const Screener = dynamic(() => import("@/components/trade/Screener"), { loading: tabLoading });
const OptionsAnalytics = dynamic(() => import("@/components/trade/OptionsAnalytics"), { ssr: false, loading: tabLoading });
const MyStrategiesPanel = dynamic(() => import("@/components/trade/MyStrategiesPanel"), { loading: tabLoading });
const StrategyBuilder = dynamic(() => import("@/components/trade/StrategyBuilder"), { loading: tabLoading });
const WatchlistDesk = dynamic(() => import("@/components/trade/WatchlistDesk"), { loading: tabLoading });
const TradesDesk = dynamic(() => import("@/components/trade/TradesDesk"), { loading: tabLoading });

type Tab =
  | "ai"
  | "markets"
  | "screener"
  | "watchlist"
  | "trades"
  | "backtest"
  | "strategies"
  | "mine"
  | "builder"
  | "options"
  | "portfolio"
  | "exchanges";

const SHOW_OPTIONS_TAB = true;

const TABS: { id: Tab; label: string; icon: typeof LineChart }[] = [
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "screener", label: "Screeners", icon: Radar },
  { id: "watchlist", label: "Watchlist", icon: Star },
  { id: "trades", label: "Trades", icon: ListOrdered },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
  { id: "exchanges", label: "Exchanges", icon: Plug },
  { id: "backtest", label: "Backtest", icon: FlaskConical },
  { id: "strategies", label: "Catalogue", icon: Layers },
  { id: "mine", label: "My Strategies", icon: FolderKanban },
  { id: "builder", label: "Builder", icon: Wand2 },
  ...(SHOW_OPTIONS_TAB ? [{ id: "options" as const, label: "Options", icon: Sigma }] : []),
];

const NAV: {
  id: Tab | "risk";
  label: string;
  icon: typeof LineChart;
  /** Apna route rakhne wale sections — tab state ke bajaye navigate hote hain. */
  href?: string;
}[] = [
  { id: "ai", label: "AI Assistant", icon: Sparkles },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "screener", label: "Screeners", icon: Radar },
  { id: "watchlist", label: "Watchlist", icon: Star },
  { id: "trades", label: "Trades", icon: ListOrdered },
  { id: "risk", label: "Risk Desk", icon: ShieldCheck, href: "/trade/risk" },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
  { id: "exchanges", label: "Exchanges", icon: Plug },
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

/**
 * Live refresh. Pehle 30s tha aur har baar poori history (1m par 4000 candles)
 * dobara aati thi — bhaari bhi, aur 1m chart par aakhri candle aadha minute
 * purani dikhti thi. Ab har poll sirf aakhri LIVE_TAIL_FETCH candles laata hai,
 * isliye 10s par chalana sasta hai.
 */
/** Delta par WS live hai to poll sirf backup; baaki exchanges par poll hi live hai. */
const MARKET_POLL_MS = 10_000;
const MARKET_POLL_FAST_MS = 2_000;

/**
 * Poll par itni candles aati hain. EMA backend isi window par calculate karta
 * hai, isliye window itni lambi chahiye ki EMA50 settle ho jaye: naap kar
 * dekha, band candles par 300 vs 4000 bar ka EMA9/21/RSI bilkul same aur EMA50
 * mein $0.0004 ka farak.
 */
const LIVE_TAIL_FETCH = 300;

/** In aakhri candles ko hi purane data mein jodte hain — inke EMA settle ho chuke hote hain. */
const LIVE_TAIL_KEEP = 20;

/** Scroll-back kitni candles ek page mein maangta hai. */
const HISTORY_PAGE = 1000;
/** Itne se zyada bars memory mein nahi rakhte. */
const HISTORY_CAP = 40_000;

/**
 * Poll ki taaza candles purane data ke aakhir mein jodo. Aakhri candle abhi ban
 * rahi hoti hai, isliye pichhle kuch bars bhi badal dete hain. Peeche load ho
 * chuki history yahan se nahi kat-ti.
 */
/**
 * Usi chart ka poora refresh (tab wapas aaya): taaza candles lo, par scroll-back
 * se aayi purani history mat giraao — warna peeche dekh raha user achanak
 * kinare par pahunch jaata. Beech mein gap ho to jodna galat hoga, tab sirf taaza.
 */
/** Apni state ke saath — har second sirf ghadi badle, poora trade page nahi. */
function DeskClock() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setTime(deskClock(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="desk-clock">{`${time} ${DESK_TZ_LABEL}`}</span>;
}

function keepOlderHistory(prev: Candle[], fresh: Candle[]): Candle[] {
  if (!prev.length || !fresh.length) return fresh;
  const first = fresh[0].time;
  if (prev[0].time >= first || prev[prev.length - 1].time < first) return fresh;
  const older = prev.filter((c) => c.time < first);
  const merged = older.concat(fresh);
  return merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged;
}

function mergeLiveTail(prev: Candle[], fresh: Candle[]): Candle[] {
  const tail = fresh.slice(-LIVE_TAIL_KEEP);
  if (!tail.length) return prev;
  const cut = tail[0].time;
  const merged = prev.filter((c) => c.time < cut).concat(tail);
  return merged.length > HISTORY_CAP ? merged.slice(-HISTORY_CAP) : merged;
}

const CHART_PREFS_KEY = "cm.chart.prefs.v1";

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
  /**
   * Chart ka source. `null` = auto (connected exchange, warna delta).
   * Manual override select se set hota hai.
   */
  const [chartSourceOverride, setChartSourceOverride] = useState<string | null>(null);
  const [marketSources, setMarketSources] = useState<MarketSourceInfo[]>(DEFAULT_MARKET_SOURCES);
  const [showVolume, setShowVolume] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [indicators, setIndicators] = useState<ActiveIndicator[]>(DEFAULT_INDICATORS);
  const [tfFavorites, setTfFavorites] = useState<string[]>(DEFAULT_TF_FAVORITES);
  const [indDialog, setIndDialog] = useState<IndicatorDialogState>(null);
  /** localStorage se prefs aa gaye — tabhi wapas likhna, warna defaults saved prefs ko mita dete. */
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [compareCandles, setCompareCandles] = useState<Candle[]>([]);
  const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0);
  const chartPanelRef = useRef<HTMLElement | null>(null);

  // Positions aur paper orders user ke apne account se aate hain.
  const { token, handleExpiredSession } = useAuth();

  const [online, setOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  /** Ye candles kis symbol|interval|history ki hain — chart isi se zoom bachata hai. */
  const [candlesKey, setCandlesKey] = useState("");
  /** Delta live feed ka sabse taaza close, kis symbol ka hai uske saath. */
  const liveTickRef = useRef<{ symbol: string; close: number } | null>(null);
  const [liveTick, setLiveTick] = useState<{ symbol: string; close: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const candlesKeyRef = useRef("");
  /** Abhi screen par kaunsa symbol|interval|history chuna hua hai. */
  const activeKeyRef = useRef("");
  /** Peeche aur candles nahi bachi, ya page abhi aa rahi hai. */
  const historyDoneRef = useRef(false);
  const historyLockRef = useRef(false);
  const historyRetryAtRef = useRef(0);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  // Positions user ke apne exchange account se aati hain, isliye teen alag
  // haal hain: login nahi, exchange nahi juda, ya juda hua (data/error).
  const [positions, setPositions] = useState<PositionsState>({ kind: "signed-out", positions: [] });
  const [liveState, setLiveState] = useState<LiveTradeState>({
    kind: "signed-out",
    availableUsdt: 0,
  });
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Effective chart source: manual override, warna connected exchange,
   * warna Delta (public desk default).
   */
  const chartSource = useMemo(() => {
    if (chartSourceOverride) return chartSourceOverride;
    const connected = liveState.exchange;
    if (connected && marketSources.some((s) => s.id === connected)) return connected;
    return "delta";
  }, [chartSourceOverride, liveState.exchange, marketSources]);

  /**
   * Coin chuno. Spot pair chart ko CoinDCX Spot par le jaata hai; perp chunne
   * par spot override hat-ta hai, par user ka chuna Bybit/CoinDCX futures bana rehta hai.
   */
  const pickSymbol = useCallback((picked: string, venue?: string) => {
    const parsed = venue ? { symbol: picked, venue } : parseWatchKey(picked);
    setSymbol(parsed.symbol);
    setChartSourceOverride((o) =>
      isSpotVenue(parsed.venue) ? parsed.venue : isSpotVenue(o) ? null : o,
    );
  }, []);

  const isSpot = isSpotVenue(chartSource);
  const pair = splitPair(symbol, chartSource);
  const pairName = pairLabel(symbol, chartSource);
  const fmtPx = (n: number) => (isSpot ? fmtQuotePrice(n, pair.quote) : fmtUsd(n));

  const chartIntervals = useMemo(() => {
    const src = marketSources.find((s) => s.id === chartSource);
    const allowed = new Set(src?.intervals ?? DEFAULT_MARKET_SOURCES[0].intervals);
    return CHART_TIMEFRAMES.filter((iv) => allowed.has(iv.value));
  }, [chartSource, marketSources]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHART_PREFS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === "object") {
        if (isChartType(saved.chartType)) setChartType(saved.chartType);
        if (Array.isArray(saved.indicators)) {
          setIndicators(
            saved.indicators.filter(
              (i: ActiveIndicator) => i && typeof i.uid === "string" && INDICATOR_BY_ID.has(i.id) && typeof i.params === "object",
            ),
          );
        }
        if (Array.isArray(saved.tfFavorites)) setTfFavorites(saved.tfFavorites.filter((t: unknown) => typeof t === "string"));
        if (typeof saved.showVolume === "boolean") setShowVolume(saved.showVolume);
        if (typeof saved.interval === "string" && CHART_TIMEFRAMES.some((t) => t.value === saved.interval)) setInterval(saved.interval);
      }
    } catch {
      /* kharab JSON — defaults hi theek */
    }
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(CHART_PREFS_KEY, JSON.stringify({ chartType, indicators, tfFavorites, showVolume, interval }));
    } catch {
      /* storage band / full */
    }
  }, [prefsLoaded, chartType, indicators, tfFavorites, showVolume, interval]);

  // TradingView jaisa: "/" se indicators khulte hain.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "markets" || e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      setIndDialog({ mode: "list" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  const pollMs = chartSource === "delta" ? MARKET_POLL_MS : MARKET_POLL_FAST_MS;

  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestDefaults, setBacktestDefaults] = useState<Partial<BacktestParams>>({});

  useEffect(() => {
    // Header ka price har tick par nahi — second mein ek baar, aur sirf badla ho tab.
    const id = window.setInterval(() => {
      const latest = liveTickRef.current;
      if (latest) setLiveTick((prev) => (prev?.close === latest.close && prev.symbol === latest.symbol ? prev : latest));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * `mode`:
   *   "full" — poori history (pehli baar, symbol/timeframe badla, tab wapas aaya).
   *   "poll" — sirf aakhri candles, purane chart mein jodi jaati hain.
   *
   * Poll fail ho to chart waisa hi rehta hai. Pehle har failure par
   * setCandles([]) hota tha — ek network hichki aur poora chart gayab.
   */
  const loadMarket = useCallback(async (mode: "full" | "poll" = "full") => {
    const key = `${symbol}|${interval}|${chartSource}`;
    const wanted = MAX_CHART_CANDLES;
    const poll = mode === "poll";
    if (!poll) setLoading(true);
    try {
      const prev = candlesRef.current;
      const tailOnly = poll && wanted > LIVE_TAIL_FETCH && prev.length > 0 && candlesKeyRef.current === key;
      const [candleRes, info] = await Promise.all([
        fetchCandles({ symbol, interval, limit: tailOnly ? LIVE_TAIL_FETCH : wanted, exchange: chartSource }),
        fetchMarketInfo(symbol, chartSource).catch(() => null),
      ]);
      if (!candleRes.success) throw new Error(candleRes.error || "Candle data nahi mili");

      // Is beech user ne symbol/timeframe badal diya — ye jawab ab kisi kaam ka nahi.
      if (activeKeyRef.current !== key) return;

      // Request ke dauraan scroll-back ne purani history jod di ho sakti hai —
      // `prev` (request se pehle ki copy) par merge karte to wo history mit jaati
      // aur chart ka zoom/jagah uchhal jaata.
      const base = candlesKeyRef.current === key ? candlesRef.current : [];
      let next = candleRes.candles ?? [];
      if (tailOnly) {
        const lastPrev = base[base.length - 1]?.time ?? 0;
        const gapMs = LIVE_TAIL_KEEP * intervalMinutes(interval) * 60_000;
        // Tab bahut der so raha tha (laptop sleep) — beech ki candles gayab
        // hongi, to jodne ke bajaye poori history dobara lo.
        if (!next.length || next[next.length - 1].time - lastPrev > gapMs) {
          const full = await fetchCandles({ symbol, interval, limit: wanted, exchange: chartSource });
          if (activeKeyRef.current !== key) return;
          next = full.success ? full.candles ?? [] : base;
        } else {
          next = mergeLiveTail(base, next);
        }
      } else {
        next = keepOlderHistory(base, next);
      }

      candlesRef.current = next;
      candlesKeyRef.current = key;
      setCandles(next);
      setCandlesKey(key);
      setMarket(info?.success ? info : null);
      setUpdatedAt(syncStamp());
      setOnline(true);
      setError(null);
    } catch (err) {
      if (activeKeyRef.current !== key) return;
      setError(err instanceof Error ? err.message : "Crypto backend connect nahi ho raha (port 2000)");
      if (!poll) {
        candlesRef.current = [];
        setCandles([]);
      }
    } finally {
      if (!poll) setLoading(false);
    }
  }, [symbol, interval, chartSource]);

  const loadBook = useCallback(async () => {
    if (!token) {
      setOrders([]);
      setPaperAccount(null);
      setPositions({ kind: "signed-out", positions: [] });
      setLiveState({ kind: "signed-out", availableUsdt: 0 });
      return;
    }

    const loadLive = async (): Promise<LiveTradeState> => {
      try {
        const accounts = await listExchangeAccounts(token);
        const primary =
          accounts.find((a) => a.is_active && a.can_trade && !a.can_withdraw) ??
          accounts.find((a) => a.is_active) ??
          null;
        if (!primary) {
          return { kind: "not-connected", availableUsdt: 0 };
        }

        const balanceCache = new Map<number, Promise<Awaited<ReturnType<typeof fetchExchangeBalances>>>>();
        const balancesOf = (id: number) => {
          if (!balanceCache.has(id)) balanceCache.set(id, fetchExchangeBalances(token, id).catch(() => []));
          return balanceCache.get(id)!;
        };

        const dcx = accounts.find(
          (a) => a.exchange === "coindcx" && a.is_active && a.can_trade && !a.can_withdraw,
        );
        let spot: LiveTradeState["spot"];
        if (dcx) {
          const rows = await balancesOf(dcx.id);
          spot = {
            accountId: dcx.id,
            label: dcx.label || "CoinDCX",
            balances: Object.fromEntries(rows.map((b) => [b.asset.toUpperCase(), b.available ?? b.balance ?? 0])),
          };
        }

        if (!primary.can_trade || primary.can_withdraw) {
          return {
            kind: "no-trade",
            accountId: primary.id,
            exchange: primary.exchange,
            label: primary.label || primary.exchange,
            availableUsdt: 0,
            message: primary.can_withdraw
              ? "Withdrawal-enabled keys allowed nahi hain — trade-only key jodiye."
              : "Is key par trading permission nahi hai. Verify / nayi key try karein.",
            spot,
          };
        }
        const balances = await balancesOf(primary.id);
        const usd = balances.find(
          (b) => /^(USDT|USD|USDC)$/i.test(b.asset) || /USDT/i.test(b.asset),
        );
        return {
          kind: "ready",
          accountId: primary.id,
          exchange: primary.exchange,
          label: primary.label || primary.exchange,
          availableUsdt: usd?.available ?? usd?.balance ?? 0,
          spot,
        };
      } catch (err) {
        if (err instanceof AccountApiError && err.status === 401) handleExpiredSession();
        return {
          kind: "not-connected",
          availableUsdt: 0,
          message: err instanceof Error ? err.message : "Exchange load nahi hua",
        };
      }
    };

    const [nextOrders, nextPaper, nextPositions, nextLive] = await Promise.all([
      fetchDemoOrders(token).catch(() => [] as DemoOrder[]),
      fetchPaperAccount(token).catch(() => null),
      fetchMyPositions(token)
        .then<PositionsState>((r) =>
          r.connected
            ? { kind: r.error ? "error" : "ready", positions: r.positions, message: r.error }
            : { kind: "not-connected", positions: [] },
        )
        .catch((err): PositionsState => {
          if (err instanceof AccountApiError && err.status === 401) handleExpiredSession();
          return {
            kind: "error",
            positions: [],
            message: err instanceof Error ? err.message : "Positions load nahi hui",
          };
        }),
      loadLive(),
    ]);
    setOrders(nextOrders);
    setPaperAccount(nextPaper);
    setPositions(nextPositions);
    setLiveState(nextLive);
  }, [token, handleExpiredSession]);

  useEffect(() => {
    checkCryptoHealth().then(setOnline);
    void fetchMarketSources().then(setMarketSources);
  }, []);

  // Connected exchange / source badle to unsupported timeframe hata do
  // (jaise CoinDCX par 3m).
  useEffect(() => {
    if (chartIntervals.some((i) => i.value === interval)) return;
    const fallback = chartIntervals.find((i) => i.value === "1h") ?? chartIntervals[0];
    if (fallback) setInterval(fallback.value);
  }, [chartSource, chartIntervals, interval]);

  // Non-Delta par WS nahi — purana "live" status / tick chipakna nahi chahiye.
  useEffect(() => {
    if (chartSource !== "delta") {
      setLiveStatus(null);
      liveTickRef.current = null;
      setLiveTick(null);
    }
  }, [chartSource]);

  useEffect(() => {
    historyDoneRef.current = false;
    historyRetryAtRef.current = 0;
    activeKeyRef.current = `${symbol}|${interval}|${chartSource}`;
    void loadMarket("full");
  }, [loadMarket, symbol, interval, chartSource]);

  /**
   * User chart ke baayein kinare pahuncha — usse pehle ka page jodo.
   * View chart khud sambhalta hai; yahan sirf data aata hai.
   */
  const loadOlder = useCallback(async () => {
    if (historyLockRef.current || historyDoneRef.current || Date.now() < historyRetryAtRef.current) return;
    const prev = candlesRef.current;
    const oldest = prev[0]?.time;
    if (!oldest || prev.length < 10 || prev.length >= HISTORY_CAP) {
      if (prev.length >= HISTORY_CAP) historyDoneRef.current = true;
      return;
    }
    const key = `${symbol}|${interval}|${chartSource}`;
    historyLockRef.current = true;
    try {
      const res = await fetchCandles({
        symbol,
        interval,
        limit: HISTORY_PAGE,
        exchange: chartSource,
        end: oldest - 1,
      });
      if (activeKeyRef.current !== key) return;
      const older = (res.candles ?? []).filter((c) => c.time < oldest);
      if (older.length < 10) {
        historyDoneRef.current = true;
        return;
      }
      const byTime = new Map<number, Candle>();
      for (const candle of older) byTime.set(candle.time, candle);
      for (const candle of candlesRef.current) byTime.set(candle.time, candle);
      const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
      const capped = merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged;
      candlesRef.current = capped;
      candlesKeyRef.current = key;
      setCandles(capped);
      setCandlesKey(key);
    } catch {
      // Har scroll event par request na barse — thodi der baad agla scroll try karega.
      historyRetryAtRef.current = Date.now() + 8000;
    } finally {
      historyLockRef.current = false;
    }
  }, [symbol, interval, chartSource]);

  useEffect(() => {
    if (!compareSymbol) {
      setCompareCandles([]);
      return;
    }
    let cancelled = false;
    void fetchCandles({
      symbol: compareSymbol,
      interval,
      limit: MAX_CHART_CANDLES,
      exchange: chartSource,
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
  }, [compareSymbol, interval, chartSource]);

  useEffect(() => {
    let timer: number | undefined;

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void loadMarket("poll"), pollMs);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        return;
      }
      // Tab wapas aaya — itni der mein kitni candles chhooti pata nahi, poori lo.
      void loadMarket("full");
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadMarket, pollMs]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  const handlePlace = async (payload: {
    mode: "paper" | "live";
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
  }) => {
    if (!token) {
      setNotice("Order ke liye sign in karein");
      return;
    }
    setPlacing(true);
    try {
      if (payload.mode === "live") {
        const accountId = isSpotKey(payload.symbol)
          ? liveState.spot?.accountId
          : liveState.kind === "ready" ? liveState.accountId : undefined;
        if (accountId == null) {
          throw new Error(
            isSpotKey(payload.symbol)
              ? "Spot ka asli order CoinDCX account se lagta hai — Exchanges page par CoinDCX key jodein."
              : liveState.message || "Live trade ke liye exchange jodiye",
          );
        }
        const res = await placeByokOrder(token, {
          exchange_account_id: accountId,
          symbol: payload.symbol,
          side: payload.side,
          order_type: payload.order_type,
          quantity: payload.quantity,
          price: payload.price,
        });
        if (!res.success) throw new Error("Live order fail");
        // Server hi batata hai ki order exchange tak gaya ya paper mein ruka —
        // yahan apna jumla likhne par UI aisi baat keh sakta hai jo hui hi nahi.
        setNotice(res.message || `${payload.side.toUpperCase()} order bhej diya`);
      } else {
        const res = await placeDemoOrder(token, {
          symbol: payload.symbol,
          side: payload.side,
          order_type: payload.order_type,
          quantity: payload.quantity,
          price: payload.price,
        });
        if (!res.success) throw new Error(res.error || "Paper order nahi laga");
        setNotice(res.message || `${payload.side.toUpperCase()} paper order lag gaya`);
      }
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
      `${pairName} ${interval} chart analyze karo.`,
      price != null ? `Current price: ${fmtPx(price)}.` : "",
      change != null ? `24h change: ${change.toFixed(2)}%.` : "",
      last?.ema_9 != null ? `EMA9 ${last.ema_9.toFixed(2)}, EMA21 ${last.ema_21?.toFixed(2)}, EMA50 ${last.ema_50?.toFixed(2)}.` : "",
      "Buy/sell signal, support/resistance aur risk batao.",
    ].filter(Boolean).join(" ");
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    goTab("ai");
  };

  const changePositive = (market?.change_24h ?? 0) >= 0;
  const changeColor = changePositive ? "var(--green)" : "var(--red)";
  const ChangeIcon = changePositive ? TrendingUp : TrendingDown;

  const paneCount = useMemo(
    () => indicators.filter((i) => INDICATOR_BY_ID.get(i.id)?.pane).length,
    [indicators],
  );

  /**
   * Screen par dikhne wala price. Delta live feed chal rahi ho aur usi symbol
   * ki ho to uska close — warna market-info wala (poll). Symbol check zaroori
   * hai: ETH par switch karte hi BTC ka aakhri tick na dikhe.
   */
  const lastPrice =
    chartSource === "delta" && liveTick && liveTick.symbol === symbol
      ? liveTick.close
      : market?.current_price;

  /**
   * Live feed usi symbol/timeframe ki jiski candles abhi chart par hain —
   * `candlesKey` se, current selection se nahi. Selection badalte hi feed
   * badal jaati to naye coin ke ticks purane coin ke chart par lag jaate.
   *
   * WebSocket abhi sirf Delta par hai — baaki exchanges poll se live rehte hain.
   */
  const liveFeed = useMemo(() => {
    if (chartSource !== "delta") return undefined;
    const [feedSymbol, feedInterval] = candlesKey.split("|");
    return feedSymbol && feedInterval ? { symbol: feedSymbol, interval: feedInterval } : undefined;
  }, [candlesKey, chartSource]);

  const rangePct = useMemo(() => {
    if (!market || lastPrice == null) return 50;
    const span = market.high_24h - market.low_24h;
    if (span <= 0) return 50;
    return Math.min(100, Math.max(0, ((lastPrice - market.low_24h) / span) * 100));
  }, [market, lastPrice]);

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

  const activeNav = tab;

  const topNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = topNavRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeNav]);

  const renderNavItem = (item: (typeof NAV)[number]) => {
    const Icon = item.icon;

    if (item.href) {
      return (
        <Link
          key={item.id}
          href={item.href.includes("?") ? item.href : `${item.href}?symbol=${symbol}`}
          className="desk-nav-item"
          data-active={false}
        >
          <Icon className="w-[15px] h-[15px]" />
          {item.label}
        </Link>
      );
    }

    const isActive = item.id === activeNav;

    const onClick = () => {
      goTab(item.id as Tab);
    };

    return (
      <button
        key={item.id}
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
        <div className="desk-main">
          {/* ── Top header: brand · nav · status ───────── */}
          <header className="desk-header">
            <Link href="/" className="desk-brand" aria-label="Cryptomantra home">
              <img className="desk-brand-mark" src="/mukul/icon.png" alt="" width={32} height={32} />
              <div className="desk-brand-text">
                <div className="desk-brand-name">Cryptomantra</div>
                <div className="desk-brand-sub">Trading Desk</div>
              </div>
            </Link>

            <nav ref={topNavRef} className="desk-topnav" aria-label="Desk navigation">
              {NAV.map((item) => renderNavItem(item))}
            </nav>

            <div className="desk-header-right">
              <Link href="/club" className="desk-club-btn" title="Market Radar, Mukul Algo, alerts, paper trading aur live room">
                <Crown className="w-3.5 h-3.5" />
                <span>Club</span>
              </Link>
              <span className="desk-live" data-offline={online === false}>
                <span className="trade-dot" aria-hidden />
                {online === false ? "Offline" : "Live"}
              </span>
              <DeskClock />
              <button type="button" className="trade-iconbtn desk-hide-md" aria-label="Notifications" onClick={askAi}>
                <Bell className="w-4 h-4" />
              </button>
              <button type="button" className="trade-iconbtn desk-hide-md" aria-label="Theme" disabled title="Dark desk">
                <Moon className="w-4 h-4" />
              </button>
              <button type="button" className="trade-iconbtn" aria-label="Ask AI" onClick={askAi}>
                <Sparkles className="w-4 h-4" />
              </button>
              <AccountMenu onOpenExchanges={() => goTab("exchanges")} />
            </div>
          </header>

          <div className={`desk-body${tab === "ai" || tab === "portfolio" ? " desk-body-fill" : ""}`}>
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

            {tab === "ai" && (
              <div className="desk-embed trade-panel overflow-hidden">
                <AiAssistant embedded />
              </div>
            )}

            {tab === "portfolio" && (
              <div className="desk-embed">
                <PortfolioDesk embedded />
              </div>
            )}

            {tab === "exchanges" && <ExchangesDesk />}

            {tab === "watchlist" && (
              <WatchlistDesk
                onPickSymbol={(picked) => {
                  pickSymbol(picked);
                  goTab("markets");
                }}
              />
            )}

            {tab === "trades" && (
              <TradesDesk onPickSymbol={(picked) => {
                pickSymbol(picked);
                goTab("markets");
              }} />
            )}

            {tab === "markets" && (
              <>
                <div className="desk-pair" aria-label="Live quote">
                  <div className="desk-pair-left">
                    <div className="desk-pair-icon" style={{ background: pairIconColor(symbol) }}>
                      {pair.base.slice(0, 1)}
                    </div>
                    <div>
                      <div className="desk-pair-name">{pairName}</div>
                      <div className="desk-pair-tag">{isSpot ? "Spot · CoinDCX" : `${DESK_CONTRACT} · ${venueShort(chartSource)}`}</div>
                    </div>
                  </div>

                  <div>
                    <div className="desk-pair-price">
                      {lastPrice != null ? fmtPx(lastPrice) : "—"}
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
                      <div className="desk-pair-stat-value">{market ? fmtPx(market.high_24h) : "—"}</div>
                    </div>
                    <div className="desk-pair-stat">
                      <div className="desk-pair-stat-label">24h Low</div>
                      <div className="desk-pair-stat-value">{market ? fmtPx(market.low_24h) : "—"}</div>
                    </div>
                    <div className="desk-pair-stat hidden sm:block">
                      <div className="desk-pair-stat-label">24h Volume</div>
                      <div className="desk-pair-stat-value">{market ? fmtCompact(market.volume_24h) : "—"}</div>
                      {market?.turnover_24h ? (
                        <div className="desk-pair-stat-sub">{isSpot ? fmtQuoteCompact(market.turnover_24h, pair.quote) : `$${fmtCompact(market.turnover_24h)}`} traded</div>
                      ) : null}
                    </div>
                    <div className="desk-pair-stat hidden md:block">
                      <div className="desk-pair-stat-label">Chart History</div>
                      <div className="desk-pair-stat-value">
                        {candles.length ? `${candlesSpanDays(candles).toFixed(1)}d` : "—"}
                      </div>
                      {candles.length ? <div className="desk-pair-stat-sub">{candles.length} bars</div> : null}
                    </div>
                  </div>

                  <div className="desk-pair-actions">
                    {!isSpot && (
                      <Link
                        href={`/trade/risk?symbol=${symbol}`}
                        className="trade-iconbtn"
                        aria-label={`${pairName} ka position size nikalo`}
                        title="Risk Desk — position size aur liquidation"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </Link>
                    )}
                    <button type="button" className="trade-iconbtn" aria-label="Watchlist">
                      <Star className="w-4 h-4" />
                    </button>
                    <button type="button" className="trade-iconbtn" aria-label="Alerts" onClick={askAi}>
                      <Bell className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="desk-markets">
                  <MarketList
                    symbol={symbol}
                    venue={chartSource}
                    onSelect={pickSymbol}
                    livePrice={lastPrice}
                    liveChange={market?.change_24h ?? null}
                  />
                  <div className="desk-chart-col">
                  <section
                    ref={(el) => {
                      chartPanelRef.current = el;
                    }}
                    className="trade-panel desk-chart-panel overflow-hidden min-w-0"
                  >
                    <ChartDeskTools
                      symbol={symbol}
                      onSymbol={(s) => pickSymbol(s)}
                      emaToggles={[]}
                      onOpenIndicators={() => setIndDialog({ mode: "list" })}
                      showVolume={showVolume}
                      onShowVolume={setShowVolume}
                      compareSymbol={compareSymbol}
                      onCompareSymbol={setCompareSymbol}
                      drawTool={drawTool}
                      onDrawTool={setDrawTool}
                      onClearDrawings={() => setClearDrawingsKey((k) => k + 1)}
                      fullscreenTargetRef={chartPanelRef}
                    >
                      <select
                        value={chartSourceOverride ?? "auto"}
                        onChange={(e) =>
                          setChartSourceOverride(e.target.value === "auto" ? null : e.target.value)
                        }
                        aria-label="Chart exchange"
                        className="trade-select desk-tools-venue"
                        title="Chart kis exchange ka dikhe"
                      >
                        <option value="auto">
                          Auto · {venueShort(liveState.exchange || "delta")}
                        </option>
                        {marketSources.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>

                      <div className="cm-toolbar" role="toolbar" aria-label="Chart controls">
                        <TimeframeMenu
                          value={interval}
                          available={chartIntervals.map((iv) => iv.value)}
                          favorites={tfFavorites}
                          onChange={setInterval}
                          onFavorites={setTfFavorites}
                        />
                        <span className="cm-tb-sep" />
                        <ChartTypeMenu value={chartType} onChange={setChartType} />
                        <span className="cm-tb-sep" />
                        <IndicatorsButton
                          count={indicators.length + (showVolume ? 1 : 0)}
                          onClick={() => setIndDialog({ mode: "list" })}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => void loadMarket("full")}
                        disabled={loading}
                        className="desk-tools-refresh"
                        aria-label="Chart refresh"
                        title="Refresh"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
                      </button>
                    </ChartDeskTools>

                    {error && (
                      <p className="px-4 py-2.5 text-[13px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
                        {error}
                      </p>
                    )}

                    <div className="trade-chart-wrap" style={{ "--panes": Math.min(paneCount, 4) } as CSSProperties}>
                      {loading && candles.length === 0 ? (
                        <div className="w-full h-full shimmer" />
                      ) : (
                        <CandleChart
                          candles={candles}
                          symbol={pairName}
                          interval={tfShort(interval)}
                          venue={venueShort(chartSource)}
                          chartType={chartType}
                          indicators={indicators}
                          onIndicatorToggle={(uid) =>
                            setIndicators((list) => list.map((i) => (i.uid === uid ? { ...i, hidden: !i.hidden } : i)))
                          }
                          onIndicatorSettings={(uid) => setIndDialog({ mode: "edit", uid })}
                          onIndicatorRemove={(uid) => setIndicators((list) => list.filter((i) => i.uid !== uid))}
                          showVolume={showVolume}
                          compareCandles={compareCandles}
                          compareLabel={compareSymbol ? symbolLabel(compareSymbol) : undefined}
                          drawTool={drawTool}
                          onDrawToolChange={setDrawTool}
                          drawingsKey={pairName}
                          clearDrawingsKey={clearDrawingsKey}
                          viewKey={candlesKey}
                          live={liveFeed}
                          onLiveBar={(bar) => {
                            // Feed ka apna symbol — selection abhi naya ho sakta hai jabki
                            // ye tick purane chart ki feed se aaya ho.
                            if (liveFeed) liveTickRef.current = { symbol: liveFeed.symbol, close: bar.close };
                          }}
                          onLiveStatus={setLiveStatus}
                          onReachHistory={() => void loadOlder()}
                        />
                      )}
                    </div>
                    <IndicatorsDialog
                      state={indDialog}
                      onState={setIndDialog}
                      indicators={indicators}
                      onIndicators={setIndicators}
                      showVolume={showVolume}
                      onShowVolume={setShowVolume}
                    />
                    {updatedAt && (
                      <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--tr-line-soft)" }}>
                        {liveStatus === "live" ? (
                          <span style={{ color: "var(--green)", fontWeight: 600 }}>
                            ● Live · {venueShort(chartSource)} stream
                          </span>
                        ) : liveStatus === "connecting" ? (
                          <span style={{ color: "var(--amber)" }}>● Live feed jud raha hai…</span>
                        ) : chartSource !== "delta" ? (
                          <span style={{ color: "var(--green)", fontWeight: 600 }}>
                            ● Live · {venueShort(chartSource)} poll
                          </span>
                        ) : null}
                        {(liveStatus === "live" || liveStatus === "connecting" || chartSource !== "delta") ? " · " : ""}
                        Synced {updatedAt} {DESK_TZ_LABEL} · poll {pollMs / 1000}s
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
                      <span>{market ? fmtPx(market.low_24h) : "—"}</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {lastPrice != null ? fmtPx(lastPrice) : "—"}
                      </span>
                      <span>{market ? fmtPx(market.high_24h) : "—"}</span>
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
                      spot={
                        isSpot
                          ? { key: orderKey(symbol, chartSource), base: pair.base, quote: pair.quote, rules: market?.spot ?? null }
                          : null
                      }
                      lastPrice={lastPrice}
                      orders={orders}
                      paperAccount={paperAccount}
                      positions={positions.positions}
                      positionsState={positions}
                      signedIn={Boolean(token)}
                      placing={placing}
                      liveState={liveState}
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
                  pickSymbol(picked);
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
