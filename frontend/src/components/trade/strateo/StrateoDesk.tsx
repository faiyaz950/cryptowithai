"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Eye,
  HelpCircle,
  History,
  Loader2,
  Lock,
  MousePointerClick,
  Plus,
  Radar,
  Server,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import CandleChart, { type ChartLevel, type ChartMarker } from "@/components/trade/CandleChart";
import {
  DOWN,
  ENTRY_COLOR,
  UP,
  buildChartMarkers,
  candleMs,
  type ChartMarkRow,
} from "@/lib/strateoChartMarks";
import StrateoPanel, { Switch, type PanelTab, type StrateoSignal } from "./StrateoPanel";
import StrateoMark from "./StrateoMark";
import StrateoGuard from "./StrateoGuard";
import { useAuth } from "@/context/AuthContext";
import { listExchangeAccounts, type ExchangeAccount } from "@/lib/accountApi";
import {
  CRYPTO_SYMBOLS,
  DEFAULT_MARKET_SOURCES,
  deployStrategyBot,
  fetchCandles,
  fetchMarketSources,
  fetchStrategyBots,
  intervalMinutes,
  stopStrategyBot,
  symbolLabel,
  venueName,
  venueShort,
  type Candle,
  type MarketSourceInfo,
  type StrategyBot,
} from "@/lib/cryptoApi";
import { supportsLiveCandles, type LiveBar, type LiveStatus } from "@/lib/deltaLive";
import { STRATEGIES, bool, getStrategy, num, type StrategyDef } from "@/lib/strategies";
import {
  EXCHANGES_HREF,
  LOGIN_HREF,
  RESEARCH_ONLY_NOTE,
  ROUND_TRIP_COST_PCT,
  autoOrders,
  exitRule,
  levelMove,
  closeExecution,
  dayKey,
  executeSignal,
  executionPnl,
  fmtPct,
  botDemoBalance,
  fmtDemoWallet,
  fmtPrice,
  fmtUsd,
  fmtClock,
  fmtWhen,
  isOptionsStrategy,
  isResearchOnly,
  lastSeenEntry,
  markSeen,
  netOfCosts,
  outcomeLabel,
  peekStats,
  removeApplied,
  requestStats,
  runsOnServer,
  saveApplied,
  sideTag,
  sideWord,
  signalKey,
  strategyTimeframe,
  toggleIn,
  tradeGate,
  useApplied,
  useExecutions,
  usePrefs,
  useSettings,
  useStrateoStats,
  writePrefs,
  writeSettings,
  type AppliedStrategy,
  type StrateoStats,
  type StrateoTrade,
} from "@/lib/strateo";
import { buildPosition, historyResultLabel, positionHistory, sideShort, type StrateoPosition } from "@/lib/strateoPositions";
import "./strateo.css";

const CHART_BARS = 600;
const TF_CHOICES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];

/** Chart lock ke peeche dhundhla nakli chart — sirf sajawat, koi asli price nahi. */
const GHOST_CANDLES = Array.from({ length: 42 }, (_, i) => {
  const mid = 100 + Math.sin(i / 4.2) * 34 + Math.sin(i / 1.7) * 9 - i * 0.9;
  const body = 6 + Math.abs(Math.sin(i * 2.3)) * 14;
  return {
    x: i * 10 + 5,
    mid,
    body,
    wick: body + 6 + Math.abs(Math.cos(i * 1.3)) * 10,
    up: Math.sin(i * 1.9 + 0.6) > -0.15,
  };
});
const SIGNALS_SEEN_KEY = "strateo.signalsSeen";
const EMPTY_CANDLES: Candle[] = [];

interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
  action?: { label: string; run: () => void };
}

type Modal =
  | { kind: "apply"; def: StrategyDef }
  | { kind: "remove"; def: StrategyDef; row: AppliedStrategy };

/** Agle candle close ke 20s baad — tab tak backend ke paas band candle aa chuki hoti hai. */
function nextCheck(barMs: number): number {
  const wait = barMs - (Date.now() % barMs) + 20_000;
  return Math.min(15 * 60_000, Math.max(30_000, wait));
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    for (const [freq, at] of [
      [880, 0],
      [1320, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.25);
    }
    window.setTimeout(() => void ctx.close(), 900);
  } catch {
    /* audio blocked — koi baat nahi */
  }
}

/** Dock tab par chhota chip — "BUY +0.42%", "SELL signal" (order nahi laga), "FLAT". */
function dockChip(p: StrateoPosition): { text: string; title: string; side: string } {
  const side = p.structure ? "options" : p.side ?? "none";
  const name = sideShort(p.side, p.structure);
  switch (p.state) {
    case "open":
      return {
        text: p.pct != null ? `${name} ${fmtPct(p.pct, 1)}` : name,
        title: `${p.side === "short" ? "Sell" : "Buy"} position open`,
        side,
      };
    case "entering":
      return { text: `${name}…`, title: "Placing order", side };
    case "signal":
      return { text: `${name} signal`, title: `${p.side === "short" ? "Sell" : "Buy"} signal — no order placed`, side };
    case "loading":
      return { text: "…", title: "Checking", side: "none" };
    case "error":
      return { text: "N/A", title: "Not available on this coin", side: "none" };
    default:
      return { text: "FLAT", title: "No open position", side: "none" };
  }
}

/** Paper order virtual hai — toast mein saaf ki exchange par nahi gaya. */
function placedText(mode: "paper" | "live", venue: string): string {
  return mode === "live" ? `Live order placed on ${venue}` : `Paper order placed (virtual, not sent to ${venue})`;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export default function StrateoDesk() {
  const { token, user } = useAuth();
  const uid = token && user ? user.id : null;
  const prefs = usePrefs();
  const settings = useSettings();
  const appliedAll = useApplied();
  const executionsAll = useExecutions();
  // Sirf is user ke — logout ya doosre account par pichhli strategies / orders nahi dikhte.
  const applied = useMemo(() => (uid == null ? [] : appliedAll.filter((a) => a.userId === uid)), [appliedAll, uid]);
  const executions = useMemo(
    () => (uid == null ? [] : executionsAll.filter((e) => e.userId === uid)),
    [executionsAll, uid],
  );
  const { symbol, exchange, interval } = prefs;

  const { stats, pending, refresh } = useStrateoStats(symbol);

  const [sources, setSources] = useState<MarketSourceInfo[]>(DEFAULT_MARKET_SOURCES);
  /** Kis token ke liye load hua — null rows = load fail. */
  const [acct, setAcct] = useState<{ token: string; rows: ExchangeAccount[] | null } | null>(null);
  const [acctNonce, setAcctNonce] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [bots, setBots] = useState<StrategyBot[]>([]);
  const [liveOrdersEnabled, setLiveOrdersEnabled] = useState<boolean | null>(null);
  const [workerRunning, setWorkerRunning] = useState<boolean | null>(null);
  const chartKey = `${exchange}|${symbol}|${interval}`;
  /** Chart ka data apni key ke saath — coin/timeframe badalte hi purana data apne aap chhupta hai. */
  const [chart, setChart] = useState<{ key: string; candles: Candle[]; error: string | null }>({
    key: "",
    candles: [],
    error: null,
  });
  const [live, setLive] = useState<{ key: string; price: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [tab, setTab] = useState<PanelTab>("strategies");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [liveAck, setLiveAck] = useState(false);
  /** Apply modal: true = Auto-trade (signal par order khud), false = sirf signal. */
  const [applyAuto, setApplyAuto] = useState(true);
  /** Same coin par chalu bot ho to use band karke yeh naya deploy karein. */
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [flatten, setFlatten] = useState(true);
  const [exchMenu, setExchMenu] = useState(false);
  const [scrollToken, setScrollToken] = useState(0);
  const [signalsSeen, setSignalsSeen] = useState(() => {
    try {
      return Number(window.localStorage.getItem(SIGNALS_SEEN_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [now, setNow] = useState(() => Date.now());
  const toastId = useRef(0);
  const liveThrottle = useRef(0);

  /* ── Data loads ─────────────────────────────────────── */

  useEffect(() => {
    void fetchMarketSources().then((rows) => setSources(rows.filter((s) => !/spot/i.test(s.id))));
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () =>
      listExchangeAccounts(token)
        .then((rows) => {
          if (alive) setAcct({ token, rows });
        })
        .catch(() => {
          if (alive) setAcct({ token, rows: null });
        });
    void load();
    // Exchanges par key jodkar wapas aaye (doosre tab se bhi) — gate turant khul jaaye.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [token, acctNonce]);
  const acctLoaded = token && acct?.token === token ? acct : null;
  const accounts = useMemo(() => acctLoaded?.rows ?? [], [acctLoaded]);
  /** Login + kam se kam ek chalu exchange key — tabhi apply, order aur Auto-trade. */
  const gate = tradeGate({
    signedIn: uid != null,
    accounts: acctLoaded ? acctLoaded.rows ?? [] : null,
    failed: Boolean(acctLoaded && acctLoaded.rows == null),
  });
  const canTrade = gate.ok;
  /** Chart bhi usi gate ke peeche — login aur kam se kam ek chalu exchange key ke baad hi dikhe. */
  const chartLocked = !gate.ok;
  const oneClickOn = settings.oneClick && canTrade;
  const openGate = useCallback(() => setGateOpen(true), []);

  const loadBots = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchStrategyBots(token);
      setBots(res.data ?? []);
      setLiveOrdersEnabled(res.live_orders_enabled);
      setWorkerRunning(res.worker_running);
    } catch {
      /* bots list na mile to bhi desk chale */
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void loadBots(), 0);
    // Faster refresh while server bots are applied so demo wallets move with fills.
    const ms = applied.some((a) => a.runner === "server" && a.botId) ? 10_000 : 30_000;
    const id = window.setInterval(() => void loadBots(), ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [loadBots, applied]);

  // Exchange ka chart. Delta par WebSocket aakhri candle chalata hai; baaki par poll hi live hai.
  useEffect(() => {
    let cancelled = false;
    const key = `${exchange}|${symbol}|${interval}`;
    const load = async (first: boolean) => {
      try {
        const res = await fetchCandles({ symbol, interval, limit: CHART_BARS, exchange });
        if (cancelled) return;
        if (!res.success || !res.candles?.length) throw new Error(res.error || "No candles from this exchange");
        setChart({ key, candles: res.candles, error: null });
      } catch (err) {
        if (!cancelled && first) setChart({ key, candles: [], error: errText(err) });
      }
    };
    void load(true);
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void load(false);
      },
      exchange === "delta" ? 60_000 : 10_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, interval, exchange]);

  const onLiveBar = useCallback(
    (bar: LiveBar) => {
      const at = Date.now();
      if (at - liveThrottle.current < 1000) return;
      liveThrottle.current = at;
      setLive({ key: chartKey, price: bar.close });
    },
    [chartKey],
  );

  const candles = chart.key === chartKey ? chart.candles : EMPTY_CANDLES;
  const chartError = chart.key === chartKey ? chart.error : null;
  const chartLoading = chart.key !== chartKey;
  const livePrice = live?.key === chartKey ? live.price : null;
  const lastPrice = livePrice ?? candles[candles.length - 1]?.close ?? null;

  /**
   * Instrument bar ke liye 24h change / high / low — chart ki candles se hi.
   * 1m jaise chhote timeframe par 600 candles 24h se kam hoti hain, tab label
   * utne ghante ka (jaise "10h") taaki number jhooth na bole.
   */
  const dayStats = useMemo(() => {
    if (!candles.length) return null;
    const last = candles[candles.length - 1];
    const from = last.time - 24 * 3600_000;
    let i = candles.length - 1;
    while (i > 0 && candles[i - 1].time > from) i -= 1;
    const bars = candles.slice(i);
    const barMs = intervalMinutes(interval) * 60_000;
    const hours = (last.time + barMs - bars[0].time) / 3600_000;
    const price = lastPrice ?? last.close;
    let high = price;
    let low = price;
    for (const b of bars) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
    }
    const open = bars[0].open;
    return {
      label: hours >= 23.5 ? "24h" : `${Math.max(1, Math.round(hours))}h`,
      change: open ? ((price - open) / open) * 100 : 0,
      high,
      low,
    };
  }, [candles, interval, lastPrice]);

  /* ── Derived ───────────────────────────────────────── */

  const source = sources.find((s) => s.id === exchange) ?? DEFAULT_MARKET_SOURCES.find((s) => s.id === exchange);
  const exchangeName = venueShort(exchange);
  const exchangeAccounts = useMemo(
    () => accounts.filter((a) => a.exchange === exchange && a.is_active),
    [accounts, exchange],
  );
  const liveAccount = exchangeAccounts.find((a) => a.id === settings.accountId) ?? null;
  const intervals = (source?.intervals ?? TF_CHOICES).filter((tf) => TF_CHOICES.includes(tf));
  const addable = sources.filter((s) => !prefs.exchanges.includes(s.id));

  const appliedIds = useMemo(() => new Set(applied.map((a) => a.id)), [applied]);
  const focusId =
    prefs.focus && STRATEGIES.some((d) => d.id === prefs.focus) ? prefs.focus : applied[0]?.id ?? null;
  const focusDef = focusId ? getStrategy(focusId) ?? null : null;
  const focusStats = focusId ? stats[focusId] : undefined;
  const focusApplied = focusId ? appliedIds.has(focusId) : false;

  const toast = useCallback((text: string, tone: Toast["tone"] = "info", action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((rows) => [...rows.slice(-3), { id, text, tone, action }]);
    window.setTimeout(() => setToasts((rows) => rows.filter((t) => t.id !== id)), action ? 10_000 : 6_000);
  }, []);

  const openTab = useCallback(
    (t: PanelTab) => {
      setTab(t);
      if (!prefs.panelOpen) writePrefs({ panelOpen: true });
      if (t === "signals") {
        const now = Date.now();
        setSignalsSeen(now);
        try {
          window.localStorage.setItem(SIGNALS_SEEN_KEY, String(now));
        } catch {
          /* ignore */
        }
      }
    },
    [prefs.panelOpen],
  );

  const unread = useMemo(() => {
    const today = dayKey(now);
    let n = 0;
    for (const def of STRATEGIES) {
      if (isResearchOnly(def)) continue;
      for (const t of stats[def.id]?.trades ?? []) {
        if (dayKey(t.entryTime) === today && t.entryTime > signalsSeen) n += 1;
      }
    }
    return n;
  }, [stats, signalsSeen, now]);

  /** Strateo ke lagaye trades — khule wale + aaj band hue, plus applied server bots ke khule trade. */
  const pnl = useMemo(() => {
    const today = dayKey(now);
    let total = 0;
    for (const e of executions) {
      if (e.closed && dayKey(e.closed.at) !== today) continue;
      const mark = e.symbol === symbol ? lastPrice : (peekStats(e.strategyId, e.symbol)?.lastPrice ?? null);
      total += executionPnl(e, mark);
    }
    for (const a of applied) {
      if (a.runner !== "server" || !a.botId) continue;
      const bot = bots.find((b) => b.id === a.botId);
      if (!bot || bot.trade_state !== "open" || !bot.entry_price || !bot.quantity) continue;
      const mark = bot.symbol === symbol ? lastPrice : null;
      if (mark) total += (bot.side === "short" ? -1 : 1) * (mark - bot.entry_price) * bot.quantity;
    }
    return total;
  }, [executions, applied, bots, symbol, lastPrice, now]);

  /**
   * Har applied strategy ki asli haalat — order laga (browser / server bot) ya sirf signal.
   * Chart wale coin par live price; doosre coin par us strategy ke stats ka mark.
   * `stats` har backtest event par naya object hai, isliye doosre coin ka peekStats bhi taaza rehta hai.
   */
  const positions = useMemo<StrateoPosition[]>(() => {
    const out: StrateoPosition[] = [];
    for (const a of applied) {
      const def = getStrategy(a.id);
      if (!def) continue;
      const onChart = a.symbol === symbol;
      out.push(
        buildPosition({
          row: a,
          def,
          stats: onChart ? stats[a.id] : peekStats(a.id, a.symbol),
          executions,
          bots,
          livePrice: onChart ? lastPrice : null,
          autoMaster: oneClickOn,
        }),
      );
    }
    return out;
  }, [applied, stats, symbol, executions, bots, lastPrice, oneClickOn]);
  const positionById = useMemo(() => new Map(positions.map((p) => [p.row.id, p])), [positions]);

  /* ── Signal monitor ────────────────────────────────── */

  const ctxRef = useRef({ token, uid, canTrade, settings, applied, executions, accounts, bells: prefs.bells, symbol, livePrice });
  useEffect(() => {
    ctxRef.current = { token, uid, canTrade, settings, applied, executions, accounts, bells: prefs.bells, symbol, livePrice };
  });
  const handledExits = useRef(new Set<string>());

  const alertOut = useCallback(
    (title: string, body: string) => {
      const s = ctxRef.current.settings;
      if (s.sound) chime();
      if (s.desktopAlerts && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(title, { body, tag: body });
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const processStats = useCallback(
    async (def: StrategyDef, s: StrateoStats) => {
      const ctx = ctxRef.current;
      if (s.error) return;
      const row = ctx.applied.find((a) => a.id === def.id && a.symbol === s.symbol);
      const belled = ctx.bells.includes(def.id) && s.symbol === ctx.symbol;
      if (!row && !belled) return;
      const barMs = intervalMinutes(s.timeframe) * 60_000;
      const account = ctx.accounts.find((a) => a.id === ctx.settings.accountId) ?? null;

      const open = s.open;
      if (open && open.entryTime > lastSeenEntry(def.id, s.symbol)) {
        markSeen(def.id, s.symbol, open.entryTime);
        // Sirf taaza entry par action — page kai ghante baad khula to purane trade par order nahi.
        // Apply se pehle khula trade bhi nahi (stale cache se apply par markSeen chook sakta tha).
        const beforeApply = row ? open.entryTime + barMs <= row.appliedAt : false;
        if (!beforeApply && Date.now() - open.entryTime <= 2 * barMs + 5 * 60_000) {
          const options = isOptionsStrategy(def);
          const text = options
            ? `${def.name}: ${sideWord(open)} on ${symbolLabel(s.symbol)} · premium ${fmtPrice(open.entry)}`
            : `${def.name}: ${sideTag(open)} ${symbolLabel(s.symbol)} @ ${fmtPrice(open.entry)}`;
          alertOut("Strateo signal", text);
          if (row?.runner === "browser") {
            if (options) {
              // Options ka order Strateo nahi lagata — perp order galat instrument hota.
              toast(`Signal — ${text}. Trade the options legs on your exchange.`, "info", {
                label: "View",
                run: () => openTab("signals"),
              });
            } else if (isResearchOnly(def)) {
              toast(`Signal (research only, not traded) — ${text}`, "info");
            } else if (autoOrders(row, def, ctx.settings.oneClick) && ctx.canTrade && ctx.token && ctx.uid != null) {
              try {
                const price = s.symbol === ctx.symbol && ctx.livePrice ? ctx.livePrice : open.exit;
                const exec = await executeSignal({
                  token: ctx.token,
                  userId: ctx.uid,
                  strategyId: def.id,
                  symbol: s.symbol,
                  trade: open,
                  price,
                  settings: ctx.settings,
                  account,
                });
                toast(`${placedText(exec.mode, venueShort(exec.mode === "live" ? account?.exchange : row.exchange))} — ${text}`, "good");
              } catch (err) {
                toast(`Order failed — ${errText(err)}`, "bad");
              }
            } else {
              toast(
                `New signal — ${text}${row.auto === false ? " (signals only)" : " · Auto-trade is off"}`,
                "info",
                { label: "Place order", run: () => openTab("positions") },
              );
            }
          } else if (row?.runner === "server") {
            toast(`${text} — server bot is taking the trade`, "info");
          } else {
            toast(`Signal — ${text}`, "info", { label: "View", run: () => openTab("signals") });
          }
        }
      }

      if (!row || row.runner !== "browser" || !ctx.token) return;
      const firstEntry = s.trades[0]?.entryTime ?? Infinity;
      for (const exec of ctx.executions) {
        if (exec.closed || exec.strategyId !== def.id || exec.symbol !== s.symbol) continue;
        if (handledExits.current.has(exec.key)) continue;
        let trade: StrateoTrade | undefined = s.trades.find((t) => t.entryTime === exec.entryTime);
        if (!trade && exec.entryTime > firstEntry) {
          // Trade backtest se gayab — signal wapas ho gaya. Strategy ab position nahi chahti.
          const exit = s.lastPrice ?? exec.entry;
          const gross = (exec.side === "long" ? 1 : -1) * ((exit - exec.entry) / exec.entry) * 100;
          trade = {
            side: exec.side,
            entryTime: exec.entryTime,
            exitTime: Date.now(),
            entry: exec.entry,
            exit,
            stop: exec.stop,
            target: exec.target,
            pct: netOfCosts(gross),
            gross,
            outcome: "exit",
            open: false,
          };
        }
        if (!trade || trade.open) continue;
        handledExits.current.add(exec.key);
        try {
          await closeExecution({ token: ctx.token, exec, trade, account: ctx.accounts.find((a) => a.id === exec.accountId) ?? null });
          toast(`${def.name}: position closed — ${trade.outcome === "stop" ? "SL hit" : trade.outcome === "target" ? "target hit" : "strategy exit"} ${fmtPct(trade.pct)}`, trade.pct >= 0 ? "good" : "bad");
        } catch (err) {
          toast(`${def.name}: could not close position — ${errText(err)}`, "bad");
        }
      }
    },
    [alertOut, openTab, toast],
  );

  /** Applied (apne coin par) + bell wali (chart coin par) — har candle close par dobara. */
  const monitored = useMemo(() => {
    const out: { def: StrategyDef; symbol: string }[] = [];
    for (const a of applied) {
      const def = getStrategy(a.id);
      if (def) out.push({ def, symbol: a.symbol });
    }
    for (const id of prefs.bells) {
      if (appliedIds.has(id)) continue;
      const def = getStrategy(id);
      if (def) out.push({ def, symbol });
    }
    return out;
  }, [applied, appliedIds, prefs.bells, symbol]);
  const monitoredKey = monitored.map((m) => `${m.def.id}|${m.symbol}`).join(",");

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    for (const { def, symbol: sym } of monitored) {
      const barMs = intervalMinutes(strategyTimeframe(def)) * 60_000;
      const tick = async (force: boolean) => {
        if (!alive) return;
        const s = await requestStats(def, sym, { force, priority: true });
        if (!alive) return;
        await processStats(def, s);
        if (alive) timers.push(window.setTimeout(() => void tick(true), nextCheck(barMs)));
      };
      void tick(false);
    }
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
    // monitoredKey = monitored ka saar; processStats refs se taaza context padhta hai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoredKey, processStats]);

  /* ── Apply / remove ────────────────────────────────── */

  const appliedRow = (def: StrategyDef, userId: number): Omit<AppliedStrategy, "runner" | "botId"> => ({
    id: def.id,
    userId,
    symbol,
    timeframe: strategyTimeframe(def),
    appliedAt: Date.now(),
    mode: settings.mode,
    exchange,
    accountId: settings.mode === "live" ? settings.accountId : null,
  });

  const applyBrowser = async (def: StrategyDef, auto: boolean) => {
    if (uid == null || !canTrade) throw new Error("Log in and connect an exchange to apply.");
    if (isResearchOnly(def)) throw new Error(RESEARCH_ONLY_NOTE);
    // Jo trade abhi khula hai wo "pichhla" hai — order sirf agli entry par.
    const s = stats[def.id] ?? (await requestStats(def, symbol, { priority: true }));
    if (s?.open) markSeen(def.id, symbol, s.open.entryTime);
    const options = isOptionsStrategy(def);
    const wantsAuto = auto && !options;
    saveApplied({ ...appliedRow(def, uid), runner: "browser", botId: null, auto: wantsAuto });
    // Auto chuna to master switch bhi on — warna "Auto" likha hota aur order kabhi na jaata.
    if (wantsAuto && !settings.oneClick) writeSettings({ oneClick: true });
    writePrefs({ focus: def.id });
    // Apply ke turant baad dikhe ki abhi kya chal raha hai — position, order, history.
    openTab("positions");
    toast(
      options
        ? `${def.name} applied on ${symbolLabel(symbol)} — options strategy, so you get signals only. Trade the legs on ${exchangeName}.`
        : wantsAuto
          ? `${def.name}: Auto-trade on ${symbolLabel(symbol)} · ${settings.mode === "live" ? `LIVE on ${exchangeName}` : "paper"} — the next entry is placed automatically while Strateo is open.`
          : `${def.name}: signals only on ${symbolLabel(symbol)} — you place each order yourself.`,
      "good",
    );
  };

  const applyServer = async (def: StrategyDef, replace: boolean) => {
    if (!token || uid == null || !canTrade) throw new Error("Log in and connect an exchange to deploy a bot.");
    const prior = bots.find((b) => b.symbol === symbol && (b.status === "running" || b.status === "paused"));
    const d = def.defaults;
    const res = await deployStrategyBot(token, {
      strategy: def.id,
      symbol,
      timeframe: strategyTimeframe(def),
      capital: settings.botCapital,
      risk_pct: settings.botRiskPct,
      channel: num(d, "channel", 30),
      exit_channel: num(d, "exit_channel", 15),
      stop_atr: num(d, "stop_atr", 2),
      allow_shorts: bool(d, "allow_shorts"),
      ...def.botParams?.(d),
      mode: settings.mode,
      ...(replace ? { replace_existing: true } : {}),
      ...(settings.mode === "live" ? { confirm_live: true, exchange_account_id: settings.accountId ?? undefined } : {}),
    });
    if (replace && prior) removeApplied(prior.strategy, uid);
    const s = stats[def.id];
    if (s?.open) markSeen(def.id, symbol, s.open.entryTime);
    saveApplied({ ...appliedRow(def, uid), runner: "server", botId: res.data.id });
    writePrefs({ focus: def.id });
    openTab("positions");
    void loadBots();
    const priorName = prior ? getStrategy(prior.strategy)?.name ?? prior.strategy : "";
    toast(
      prior && replace
        ? `${def.name} is running on ${symbolLabel(symbol)}. ${priorName} was stopped.`
        : `${def.name}: ${settings.mode === "live" ? "LIVE" : "paper"} bot #${res.data.id} running on ${symbolLabel(symbol)} — 24×7.`,
      "good",
    );
  };

  const startApply = (def: StrategyDef) => {
    if (appliedIds.has(def.id)) {
      writePrefs({ focus: def.id });
      return;
    }
    if (!canTrade) {
      writePrefs({ focus: def.id });
      openGate();
      return;
    }
    if (isResearchOnly(def)) {
      writePrefs({ focus: def.id });
      toast(RESEARCH_ONLY_NOTE, "info");
      return;
    }
    // Options sirf signal dete hain — poochne ko kuch nahi.
    if (isOptionsStrategy(def)) {
      setBusyId(def.id);
      void applyBrowser(def, false)
        .catch((err) => toast(errText(err), "bad"))
        .finally(() => setBusyId(null));
      return;
    }
    // Baaki sab par saaf chunaav: Auto-trade ya sirf signal.
    setModalError(null);
    setLiveAck(false);
    setApplyAuto(true);
    setReplaceExisting(false);
    setModal({ kind: "apply", def });
  };

  const startRemove = (def: StrategyDef) => {
    const row = applied.find((a) => a.id === def.id);
    if (!row) return;
    if (row.runner === "server" && row.botId) {
      setModalError(null);
      setFlatten(true);
      setModal({ kind: "remove", def, row });
      return;
    }
    removeApplied(def.id, row.userId);
    const stillOpen = executions.some((e) => e.strategyId === def.id && !e.closed);
    toast(
      stillOpen
        ? `${def.name} removed. Its open position stays — manage it from Trades.`
        : `${def.name} removed.`,
      "info",
    );
  };

  const confirmModal = async () => {
    if (!modal) return;
    setModalBusy(true);
    setModalError(null);
    try {
      if (modal.kind === "apply") {
        // Server strategy + Auto = 24×7 bot. "Signals only" = browser monitor, koi order nahi.
        if (runsOnServer(modal.def) && applyAuto) {
          if (blockingBot && !replaceExisting) {
            setModalError(`${blockingName} is already running on ${symbolLabel(symbol)}. Tick “Stop ${blockingName} and run this” to replace it.`);
            return;
          }
          await applyServer(modal.def, replaceExisting);
        } else await applyBrowser(modal.def, applyAuto);
      } else {
        const { row, def } = modal;
        if (token && row.botId) await stopStrategyBot(token, row.botId, flatten);
        removeApplied(def.id, row.userId);
        void loadBots();
        toast(`${def.name}: bot stopped${flatten ? " and position closed" : ""}.`, "info");
      }
      setModal(null);
    } catch (err) {
      setModalError(errText(err));
    } finally {
      setModalBusy(false);
    }
  };

  const tradeSignal = async (sig: StrateoSignal) => {
    if (!canTrade || !token || uid == null) {
      openGate();
      return;
    }
    if (isOptionsStrategy(sig.def)) {
      toast("Options signals are not placed by Strateo — trade the legs on your exchange.", "info");
      return;
    }
    if (isResearchOnly(sig.def)) {
      toast(RESEARCH_ONLY_NOTE, "info");
      return;
    }
    if (settings.mode === "live" && !window.confirm(`Send a LIVE ${sideTag(sig.trade)} order for ${symbolLabel(sig.symbol)}?`)) return;
    const key = signalKey(sig.def.id, sig.symbol, sig.trade.entryTime);
    setBusyId(key);
    try {
      const price = sig.symbol === symbol && lastPrice ? lastPrice : sig.trade.exit;
      const exec = await executeSignal({
        token,
        userId: uid,
        strategyId: sig.def.id,
        symbol: sig.symbol,
        trade: sig.trade,
        price,
        settings,
        account: liveAccount,
      });
      toast(
        `${placedText(exec.mode, exec.mode === "live" ? venueShort(liveAccount?.exchange) : exchangeName)} — ${sig.def.name} ${sideTag(sig.trade)} ${symbolLabel(sig.symbol)}`,
        "good",
      );
    } catch (err) {
      toast(`Order failed — ${errText(err)}`, "bad");
    } finally {
      setBusyId(null);
    }
  };

  /* ── Chart overlays ────────────────────────────────── */

  // Applied strategy isi coin par ho to chart wahi rows dikhaye jo Trade history — order ka
  // fill time, close reason, aur woh trades bhi jo backtest window se nikal chuke.
  const focusPos = focusId ? positionById.get(focusId) : undefined;
  const focusOnChart = focusPos?.row.symbol === symbol;
  const focusHistory = useMemo(
    () => (focusOnChart && focusPos?.stats && !focusPos.stats.error ? positionHistory(focusPos, executions) : []),
    [focusOnChart, focusPos, executions],
  );
  // Open trade ka % har tick badalta hai. Mark sirf tab naya ho jab koi trade khule, bande, ya result badle.
  const markerKey = focusOnChart
    ? focusHistory
        .map((r) => `${r.key}|${r.entryTime}|${r.exitTime ?? ""}|${r.open}|${r.outcome}|${r.closedReason ?? ""}|${r.partial}|${r.side}|${r.open ? "" : r.pct}`)
        .join(";")
    : "";
  const historyRef = useRef(focusHistory);
  historyRef.current = focusHistory;

  const focusAppliedAt = focusOnChart ? focusPos?.row.appliedAt : undefined;
  const markers = useMemo<ChartMarker[]>(() => {
    if (focusOnChart) {
      const rows: ChartMarkRow[] = historyRef.current.map((r) => ({
        entryTime: r.entryTime,
        exitTime: r.open ? null : r.exitTime,
        side: r.side,
        open: r.open,
        label: historyResultLabel(r),
        pct: r.pct,
        premium: r.premium,
        before: r.status === "before",
      }));
      return buildChartMarkers(rows, candles, focusAppliedAt);
    }
    if (!focusStats || focusStats.error) return [];
    const rows: ChartMarkRow[] = focusStats.trades.map((t) => ({
      entryTime: t.entryTime,
      exitTime: t.open ? null : t.exitTime,
      side: t.side,
      open: Boolean(t.open),
      label: historyResultLabel({
        open: Boolean(t.open),
        closedReason: null,
        partial: Boolean(t.partial),
        outcome: t.outcome,
      }),
      pct: t.pct,
      premium: Boolean(t.premium),
    }));
    return buildChartMarkers(rows, candles);
    // markerKey history ka sach pakadta hai; live % se chart har second hilna nahi chahiye.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOnChart, markerKey, focusStats, candles, focusAppliedAt]);

  /**
   * Chart par focus strategy ki haalat — user ki nazar se:
   *  taken   = Strateo ne ye trade lagaya (ya server bot ki position khuli hai)
   *  signal  = apply ke baad naya entry signal aaya, order abhi nahi laga
   *  scan    = applied, agli entry ka intezaar ("Analyzing Next Entry")
   *  preview = applied nahi — sirf dekh rahe hain
   */
  const focusRow = focusId ? applied.find((a) => a.id === focusId && a.symbol === symbol) : undefined;
  const focusOpen = focusStats?.open ?? null;
  const focusState: "taken" | "signal" | "scan" | "preview" = (() => {
    if (!focusApplied) return "preview";
    if (!focusOpen || !focusRow) return "scan";
    const key = signalKey(focusRow.id, focusRow.symbol, focusOpen.entryTime);
    const bot = focusRow.botId ? bots.find((b) => b.id === focusRow.botId) : undefined;
    if (executions.some((e) => e.key === key && !e.closed) || bot?.trade_state === "open") return "taken";
    // Apply se pehle khula trade bhi signal hi hai — Positions use "signal" dikhata hai, chart bhi wahi kahe.
    return "signal";
  })();

  const levels = useMemo<ChartLevel[]>(() => {
    // Options ka entry premium hai, coin price nahi — chart par line ka matlab nahi.
    if (!focusOpen || focusState === "scan" || focusOpen.premium) return [];
    const out: ChartLevel[] = [{ price: focusOpen.entry, title: "Entry", color: ENTRY_COLOR, dashed: focusState !== "taken" }];
    if (focusOpen.stop) out.push({ price: focusOpen.stop, title: "SL", color: DOWN, dashed: true });
    if (focusOpen.target) out.push({ price: focusOpen.target, title: "Target", color: UP, dashed: true });
    return out;
  }, [focusOpen, focusState]);

  const bubble = useMemo(() => {
    if (!focusDef) return null;
    const open = focusOpen;
    const prem = open?.premium ? " prem." : "";
    // Grid basket ke kai legs hain — pehli buy se live price ka move basket ka P&L nahi; engine wala % lo.
    // Fees + slippage ke baad — card, Positions aur chart ek hi number bolein.
    const move =
      open && lastPrice && !open.premium && !open.basket
        ? netOfCosts((open.side === "long" ? 1 : -1) * ((lastPrice - open.entry) / open.entry) * 100)
        : open?.pct;
    // User "buy / sell" mein sochta hai — long / short nahi.
    const side = open ? (open.structure ?? (open.side === "short" ? "Sell" : "Buy")) : "Buy";
    const options = isOptionsStrategy(focusDef);
    let title: string;
    let sub: string;
    let last: string | null = null;
    // Aakhri band trade — chart par kuch na dikhe to bhi pata chale strategy kab chali thi.
    if (focusStats && !focusStats.error) {
      const done = [...focusStats.trades].reverse().find((t) => !t.open);
      last = done
        ? `Last trade ${fmtWhen(done.entryTime, now)} · ${outcomeLabel(done)} ${fmtPct(done.pct)}${done.premium ? " prem." : ""}`
        : `No trades in the last ${focusStats.days} days`;
    }
    if (focusStats?.error) {
      title = focusDef.name;
      sub = "Not available on this coin";
    } else if (focusState === "taken" && open) {
      // Asli fill (Strateo order / server bot) — strategy ke candle wala price nahi.
      const real = focusId ? positionById.get(focusId) : undefined;
      const entry = real?.state === "open" && real.entry ? real.entry : open.entry;
      const stop = real?.state === "open" && real.stop ? real.stop : open.stop;
      const pct = real?.state === "open" && real.pct != null ? real.pct : move ?? 0;
      title = `${side} open · ${fmtPct(pct)}${prem}`;
      sub = open.premium
        ? `Premium ${fmtPrice(open.entry)}`
        : `Entry ${fmtPrice(entry)}${stop ? ` · SL ${fmtPrice(stop)}` : ""}`;
      last = null;
    } else if (focusState === "signal" && open) {
      // Positions card jaisa hi: options par premium ka %, coin par entry price.
      title = open.premium ? `${side} signal · ${fmtPct(open.pct)}${prem}` : `${side} signal · ${fmtPrice(open.entry)}`;
      const beforeApply = focusRow
        ? open.entryTime + intervalMinutes(focusRow.timeframe) * 60_000 <= focusRow.appliedAt
        : false;
      sub = options
        ? "Signal only — trade the legs on your exchange"
        : isResearchOnly(focusDef)
          ? "Research only — not traded"
          : beforeApply
            ? "Opened before you applied · see Positions"
            : focusRow && autoOrders(focusRow, focusDef, oneClickOn)
              ? "Placing order…"
              : "Place it from Positions";
      last = null;
    } else if (focusState === "scan") {
      title = "Scanning";
      sub = "Waiting for next entry";
    } else {
      title = `Preview · ${focusDef.name}`;
      sub = open
        ? `In a ${side.toLowerCase()} ${fmtPct(move ?? 0)}${prem} · ${options ? "Apply for signals" : "Apply to trade"}`
        : options
          ? "Apply for its signals"
          : "Apply to trade it";
      if (open) last = null;
    }
    const StateIcon = focusStats?.error
      ? AlertTriangle
      : focusState === "taken"
        ? Activity
        : focusState === "signal"
          ? Crosshair
          : focusState === "scan"
            ? Radar
            : Eye;
    return (
      <div className="st-bubble" data-state={focusState}>
        <span className="st-bubble-icon">
          <StateIcon className="w-3.5 h-3.5" aria-hidden />
        </span>
        <span className="st-bubble-text">
          <span>{title}</span>
          <small>{sub}</small>
          {last && <small className="st-bubble-last">{last}</small>}
        </span>
      </div>
    );
  }, [focusDef, focusId, focusRow, focusOpen, focusStats, focusState, lastPrice, oneClickOn, now, positionById]);

  /**
   * Naya trade history mein aaye aur screen par na ho to chart us candle tak khisko.
   * Key mein close time hai — trade band hote hi wahi exit dikhe, purana SL Hit nahi.
   */
  const newest = focusHistory[0] ?? null;
  const focusLast = focusStats && !focusStats.error ? focusStats.trades[focusStats.trades.length - 1] ?? null : null;
  const pinTime = newest
    ? newest.open
      ? newest.entryTime
      : (newest.exitTime ?? newest.entryTime)
    : focusLast
      ? focusLast.open
        ? focusLast.entryTime
        : focusLast.exitTime
      : 0;
  const pinKey = newest
    ? `${newest.key}|${newest.open ? "open" : (newest.exitTime ?? "")}`
    : focusLast
      ? `${focusLast.entryTime}|${focusLast.open ? "open" : focusLast.exitTime}`
      : "";
  const reveal = useMemo(
    () => (focusId && pinTime && !chartLoading ? { time: pinTime, key: `${focusId}|${chartKey}|${pinKey}` } : null),
    [focusId, pinTime, pinKey, chartLoading, chartKey],
  );

  /**
   * Chart sirf CHART_BARS candles laata hai (5m par ~2 din). Jo trade pehli candle se purana hai
   * wo history mein rehta hai aur chart par nahi — batao, strategy ki timeframe par jaane ka button do.
   */
  const [offHidden, setOffHidden] = useState<string | null>(null);
  const offChart = useMemo(() => {
    if (!focusId || chartLoading || !candles.length) return null;
    const first = candleMs(candles[0].time);
    const times = focusOnChart
      ? focusHistory.map((r) => (r.open ? r.entryTime : (r.exitTime ?? r.entryTime)))
      : (focusStats && !focusStats.error ? focusStats.trades : []).map((t) => (t.open ? t.entryTime : t.exitTime));
    if (!times.length) return null;
    const lastMark = Math.max(...times);
    const hidden = times.filter((t) => t < first).length;
    if (!lastMark || (lastMark >= first && hidden === 0)) return null;
    const tf = focusStats?.timeframe;
    const clock = fmtClock(lastMark);
    const day = dayKey(lastMark) === dayKey(now) ? "today" : fmtWhen(lastMark, now).replace(` ${clock}`, "");
    const olderOnly = lastMark >= first && hidden > 0;
    return {
      key: `${focusId}|${chartKey}|${olderOnly ? `older-${hidden}` : "last"}`,
      when: lastMark,
      day,
      clock,
      hidden,
      olderOnly,
      tf: tf && tf !== interval && intervals.includes(tf) ? tf : null,
    };
  }, [focusId, focusOnChart, focusHistory, focusStats, chartLoading, candles, chartKey, interval, intervals, now]);

  /* ── Render ────────────────────────────────────────── */

  const panelOpen = prefs.panelOpen;
  const modalDef = modal?.def ?? null;
  const modalServer = modalDef ? runsOnServer(modalDef) : false;
  /** Auto chun rahe hain aur target fees ke barabar — pehle hi bata do. */
  const modalStats = modalDef ? stats[modalDef.id] : undefined;
  const modalFeeRisk =
    modal?.kind === "apply" && modalStats?.feeRisk && modalStats.avgWinGross != null
      ? `Small targets: the average win is ${fmtPct(modalStats.avgWinGross)} before costs, and fees + slippage take about ${fmtPct(ROUND_TRIP_COST_PCT, 2).replace("+", "")} per trade. ${modalStats.feeRisk === "below" ? "After costs, an average win is a loss." : "Costs take more than half of an average win."}`
      : null;
  /** Apply se pehle hi: is strategy ka target / SL aam taur par entry se kitna door hota hai. */
  const modalLevels = (() => {
    if (modal?.kind !== "apply" || !modalStats || modalStats.error) return null;
    const coin = modalStats.trades.filter((t) => !t.premium && !t.basket);
    if (!coin.length) return null;
    const avg = (pick: (t: (typeof coin)[number]) => number | null) => {
      const v = coin.map((t) => levelMove(t.side, t.entry, pick(t))).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + Math.abs(b), 0) / v.length : null;
    };
    const target = avg((t) => t.target);
    const stop = avg((t) => t.stop);
    if (target == null && stop == null) return null;
    return { target, stop, rule: exitRule(null, modalStats.trades) };
  })();
  // Live ki shartein sirf tab jab order lagenge (Auto). "Signals only" kuch nahi bhejta.
  const modalLive = modal?.kind === "apply" && settings.mode === "live" && applyAuto;
  const liveBlock =
    modalLive
      ? !token
        ? "Log in first."
        : !liveAccount
          ? `Pick a ${exchangeName} account in Settings.`
          : !liveAccount.live_trading_enabled
            ? "Live trading is off for this key — turn it on in Exchanges."
            : modalServer && liveAccount.exchange !== "delta"
              ? "Live server bots run on Delta Exchange accounts only."
              : null
      : null;
  const modalBot = modal?.kind === "remove" ? bots.find((b) => b.id === modal.row.botId) : undefined;
  const blockingBot =
    modal?.kind === "apply" && modalServer && applyAuto
      ? bots.find((b) => b.symbol === symbol && (b.status === "running" || b.status === "paused"))
      : undefined;
  const blockingName = blockingBot ? getStrategy(blockingBot.strategy)?.name ?? blockingBot.strategy : "";
  const blockingOpen = blockingBot?.trade_state === "open" || blockingBot?.trade_state === "entering";
  const coin = symbolLabel(symbol).split("/")[0];
  const feedState = exchange === "delta" ? liveStatus ?? "connecting" : "poll";
  const feedLabel =
    exchange === "delta"
      ? liveStatus === "live"
        ? "Live"
        : liveStatus === "unsupported"
          ? "Polling"
          : "Connecting"
      : "Every 10s";
  const dayTone = dayStats ? (dayStats.change > 0 ? "st-up" : dayStats.change < 0 ? "st-down" : "") : "";

  return (
    <div className="strateo" data-panel={panelOpen}>
      <div className="st-stage">
        <header className="st-topbar">
          <span className="st-brand">
            <StrateoMark size={28} />
            <span className="st-brand-text">
              <span className="st-brand-name">Strateo</span>
              <span className="st-brand-sub">Strategy terminal</span>
            </span>
          </span>

          <span className="st-divider" aria-hidden />

          <div className="st-exchanges" aria-label="Exchanges">
            <div className="st-exch-group">
              {prefs.exchanges.map((id) => {
                const connected = accounts.some((a) => a.exchange === id && a.is_active);
                return (
                  <span key={id} className="st-exch" data-active={id === exchange}>
                    <button type="button" onClick={() => writePrefs({ exchange: id })} title={venueName(id)}>
                      <span className="st-exch-dot" data-on={connected} title={connected ? "API key connected" : "Chart only — no API key"} />
                      {venueShort(id)}
                    </button>
                    {prefs.exchanges.length > 1 && (
                      <button
                        type="button"
                        className="st-exch-x"
                        aria-label={`Remove ${venueShort(id)}`}
                        onClick={() => {
                          const rest = prefs.exchanges.filter((x) => x !== id);
                          writePrefs({ exchanges: rest, exchange: id === exchange ? rest[0] : exchange });
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })}
              <span className="st-menu-wrap">
                <button
                  type="button"
                  className="st-exch-add"
                  aria-haspopup="menu"
                  aria-expanded={exchMenu}
                  onClick={() => setExchMenu((v) => !v)}
                  title="Add an exchange"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {exchMenu && (
                  <div className="st-menu" role="menu" onMouseLeave={() => setExchMenu(false)}>
                    <div className="st-menu-label">Add exchange chart</div>
                    {addable.length === 0 && <div className="st-menu-empty">All exchanges added</div>}
                    {addable.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          writePrefs({ exchanges: [...prefs.exchanges, s.id], exchange: s.id });
                          setExchMenu(false);
                        }}
                      >
                        {s.name}
                        {accounts.some((a) => a.exchange === s.id) && <span className="st-menu-tag">API</span>}
                      </button>
                    ))}
                    <Link href="/trade?tab=exchanges" className="st-menu-link" role="menuitem">
                      <Wallet className="w-3.5 h-3.5" /> Connect an API key
                    </Link>
                  </div>
                )}
              </span>
            </div>
          </div>

          <div className="st-topbar-end">
            <StrateoGuard token={token} />
            <div className="st-oneclick" data-on={oneClickOn}>
              <MousePointerClick className="w-3.5 h-3.5" aria-hidden />
              <span>Auto-trade</span>
              <span
                className="st-info"
                title="Master switch. On: strategies applied with Auto-trade place their own entries and exits while Strateo is open (server bots run 24×7 on their own). Off: every strategy only signals. Mode and size are in Settings."
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
              <Switch
                on={oneClickOn}
                onChange={(v) => (canTrade ? writeSettings({ oneClick: v }) : openGate())}
                label="Auto-trade"
              />
            </div>
            <button
              type="button"
              className="st-pnl"
              onClick={() => openTab("signals")}
              title="Open trades plus trades closed today, placed by Strateo"
            >
              <span className="st-pnl-icon">
                <Activity className="w-3.5 h-3.5" aria-hidden />
                {unread > 0 && <span className="st-badge">{unread > 99 ? "99+" : unread}</span>}
              </span>
              <span className="st-pnl-text">
                <small>P&amp;L</small>
                <b className={pnl > 0 ? "st-up" : pnl < 0 ? "st-down" : ""}>{fmtUsd(pnl)}</b>
              </span>
            </button>
            <button type="button" className="st-icon-btn" aria-label="Strateo settings" onClick={() => openTab("settings")}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="st-icon-btn st-collapse"
              aria-label={panelOpen ? "Hide strategy panel" : "Show strategy panel"}
              onClick={() => writePrefs({ panelOpen: !panelOpen })}
            >
              {panelOpen ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <section className="st-chartwrap" aria-label={`${symbolLabel(symbol)} chart`}>
          <div className="st-instr">
            <label className="st-symbol">
              <span className="st-coin" data-coin={coin} aria-hidden>
                {coin.slice(0, 1)}
              </span>
              <span className="sr-only">Coin</span>
              <select value={symbol} onChange={(e) => writePrefs({ symbol: e.target.value })}>
                {CRYPTO_SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label.replace("/", "")}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 st-symbol-caret" aria-hidden />
            </label>
            <div className="st-instr-px">
              <b className={dayTone}>{lastPrice != null ? fmtPrice(lastPrice) : "—"}</b>
              <small>{source?.name ?? venueName(exchange)} · Perpetual</small>
            </div>
            <dl className="st-instr-stats">
              <div>
                <dt>{dayStats?.label ?? "24h"} change</dt>
                <dd className={dayTone}>{dayStats ? fmtPct(dayStats.change) : "—"}</dd>
              </div>
              <div>
                <dt>{dayStats?.label ?? "24h"} high</dt>
                <dd>{dayStats ? fmtPrice(dayStats.high) : "—"}</dd>
              </div>
              <div>
                <dt>{dayStats?.label ?? "24h"} low</dt>
                <dd>{dayStats ? fmtPrice(dayStats.low) : "—"}</dd>
              </div>
              {/* Chart band hai to live feed bhi nahi chalta — "Connecting" jhooth bolta. */}
              {!chartLocked && (
                <div>
                  <dt>Feed</dt>
                  <dd>
                    <span className="st-conn" data-state={feedState}>
                      <span aria-hidden />
                      {feedLabel}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            <div className="st-tfs" role="group" aria-label="Timeframe" hidden={chartLocked}>
              {intervals.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  data-active={tf === interval}
                  aria-pressed={tf === interval}
                  onClick={() => writePrefs({ interval: tf })}
                >
                  {tf.replace("d", "D")}
                </button>
              ))}
            </div>
          </div>

          <div className="st-chart">
            {chartLocked ? (
              <div className="st-chartlock" data-reason={gate.reason}>
                <svg className="st-chartlock-art" viewBox="0 0 420 200" preserveAspectRatio="none" aria-hidden>
                  {GHOST_CANDLES.map((c) => (
                    <g key={c.x} className={c.up ? "up" : "down"}>
                      <line x1={c.x} x2={c.x} y1={c.mid - c.wick / 2} y2={c.mid + c.wick / 2} />
                      <rect x={c.x - 3} width={6} y={c.mid - c.body / 2} height={c.body} rx={1} />
                    </g>
                  ))}
                </svg>
                <div className="st-chartlock-card" role="status">
                  <span className="st-chartlock-icon">
                    {gate.reason === "checking" ? (
                      <Loader2 className="w-5 h-5 st-spin" aria-hidden />
                    ) : gate.reason === "error" ? (
                      <AlertTriangle className="w-5 h-5" aria-hidden />
                    ) : (
                      <Lock className="w-5 h-5" aria-hidden />
                    )}
                  </span>
                  <h3>
                    {gate.reason === "login"
                      ? "Log in to see the chart"
                      : gate.reason === "exchange"
                        ? "Connect an exchange to see the chart"
                        : gate.title}
                  </h3>
                  <p>
                    {gate.reason === "login"
                      ? "The live chart and every strategy's trades open once you log in and connect your exchange."
                      : gate.reason === "exchange"
                        ? "Add your exchange API key once on Exchanges — the live chart and strategy trades open right after."
                        : gate.body}
                  </p>
                  {(gate.reason === "login" || gate.reason === "exchange") && (
                    <ol className="st-gate-steps">
                      <li data-done={uid != null}>Log in to your account</li>
                      <li data-done={false}>Connect your exchange API key</li>
                      <li data-done={false}>The live chart unlocks here</li>
                    </ol>
                  )}
                  {gate.reason === "login" ? (
                    <Link href={LOGIN_HREF} className="st-btn st-btn-solid">
                      Log in
                    </Link>
                  ) : gate.reason === "exchange" ? (
                    <Link href={EXCHANGES_HREF} className="st-btn st-btn-solid">
                      Connect exchange
                    </Link>
                  ) : gate.reason === "error" ? (
                    <button type="button" className="st-btn st-btn-solid" onClick={() => setAcctNonce((n) => n + 1)}>
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            ) : chartError ? (
              <div className="st-chart-msg">
                <AlertTriangle className="w-5 h-5" />
                <b>{venueName(exchange)} chart unavailable for {symbolLabel(symbol)}</b>
                <span>{chartError}</span>
              </div>
            ) : chartLoading && !candles.length ? (
              <div className="st-chart-msg">
                <Loader2 className="w-5 h-5 st-spin" />
                <span>Loading {venueName(exchange)} chart…</span>
              </div>
            ) : (
              <CandleChart
                candles={candles}
                symbol={symbolLabel(symbol).replace("/", "")}
                interval={interval}
                venue={exchangeName}
                showEma9={false}
                showEma21={false}
                showEma50={false}
                viewKey={`${exchange}|${symbol}|${interval}`}
                live={exchange === "delta" && supportsLiveCandles(interval) ? { symbol, interval } : undefined}
                onLiveBar={onLiveBar}
                onLiveStatus={setLiveStatus}
                markers={markers}
                levels={levels}
                priceAnchor={bubble}
                reveal={reveal}
                rightGap={34}
                drawingsKey={`strateo:${exchange}:${symbol}`}
              />
            )}
            {!chartLocked && !chartError && offChart && offHidden !== offChart.key && (
              <div className="st-offchart" role="status">
                <History className="w-3.5 h-3.5" aria-hidden />
                <span
                  title={
                    offChart.olderOnly
                      ? `${offChart.hidden} older trades are in history but this ${interval.replace("d", "D")} chart does not go back that far`
                      : `Last trade ${fmtWhen(offChart.when, now)} — not on this ${interval.replace("d", "D")} chart`
                  }
                >
                  {offChart.olderOnly ? (
                    <>
                      {offChart.hidden} older {offChart.hidden === 1 ? "trade is" : "trades are"} in history
                      <span className="st-offchart-why"> — before this {interval.replace("d", "D")} chart</span>
                    </>
                  ) : (
                    <>
                      Last trade {offChart.day}
                      <span className="st-offchart-time"> {offChart.clock}</span>
                      <span className="st-offchart-why"> — not on this {interval.replace("d", "D")} chart</span>
                    </>
                  )}
                </span>
                {offChart.tf && (
                  <button
                    type="button"
                    className="st-btn st-btn-solid st-btn-sm"
                    onClick={() => writePrefs({ interval: offChart.tf ?? interval })}
                  >
                    Show on {offChart.tf.toUpperCase()}
                  </button>
                )}
                <button
                  type="button"
                  className="st-offchart-x"
                  aria-label="Hide this hint"
                  title="Hide"
                  onClick={() => setOffHidden(offChart.key)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {toasts.length > 0 && (
              <div className="st-toasts" role="status" aria-live="polite">
                {toasts.map((t) => (
                  <div key={t.id} className="st-toast" data-tone={t.tone}>
                    <span>{t.text}</span>
                    {t.action && (
                      <button
                        type="button"
                        onClick={() => {
                          t.action?.run();
                          setToasts((rows) => rows.filter((x) => x.id !== t.id));
                        }}
                      >
                        {t.action.label}
                      </button>
                    )}
                    <button
                      type="button"
                      className="st-toast-x"
                      aria-label="Dismiss"
                      onClick={() => setToasts((rows) => rows.filter((x) => x.id !== t.id))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="st-dock">
          <span className="st-dock-label" data-on={applied.length > 0}>
            <span className="st-dock-pulse" aria-hidden />
            Running <b>{applied.length}</b>
          </span>
          <Link
            href="/trade/strateo/wallets"
            className="st-dock-info"
            title="Demo amounts, running P&L, and allocation by strategy"
          >
            <Wallet className="w-3.5 h-3.5" aria-hidden />
            Demo wallets
          </Link>
          <div className="st-applied" aria-label="Applied strategies">
            {applied.map((a) => {
              const def = getStrategy(a.id);
              if (!def) return null;
              const Icon = def.icon;
              const bot = a.botId ? bots.find((b) => b.id === a.botId) : undefined;
              const pos = positionById.get(a.id);
              const chip = pos ? dockChip(pos) : null;
              const mark = a.symbol === symbol ? lastPrice : pos?.mark ?? null;
              const wallet = bot ? botDemoBalance(bot, mark) : null;
              return (
                <span key={a.id} className="st-atab" data-active={focusId === a.id} data-stopped={bot?.status === "stopped"}>
                  <button
                    type="button"
                    onClick={() => {
                      writePrefs({ focus: a.id });
                      openTab("positions");
                    }}
                    title={`${def.name} · ${symbolLabel(a.symbol)} · ${a.mode}${wallet ? ` — ${fmtDemoWallet(wallet)}` : ""}${chip ? ` — ${chip.title}` : ""}`}
                  >
                    <span className="st-atab-icon">
                      <Icon className="w-3 h-3" aria-hidden />
                    </span>
                    <span className="st-atab-name">{def.name}</span>
                    <span className="st-atab-tf">{a.timeframe.toUpperCase()}</span>
                    {a.runner === "server" && <Server className="w-3 h-3 st-muted" aria-label="Server bot" />}
                    {wallet && (
                      <span
                        className="st-atab-wallet"
                        data-pnl={wallet.pnl > 0 ? "up" : wallet.pnl < 0 ? "down" : "flat"}
                      >
                        {fmtUsd(wallet.now).replace(/\.00$/, "")}
                      </span>
                    )}
                    {chip && (
                      <span className="st-atab-pos" data-state={pos?.state} data-side={chip.side}>
                        {chip.text}
                      </span>
                    )}
                  </button>
                  <button type="button" className="st-atab-x" aria-label={`Remove ${def.name}`} onClick={() => startRemove(def)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              className="st-add-strategy"
              onClick={() => {
                openTab("strategies");
                setScrollToken((n) => n + 1);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> {applied.length ? "Add strategy" : "Add a strategy to start"}
            </button>
          </div>
          <span className="st-dock-status">
            <span className="st-mode" data-mode={settings.mode}>
              {settings.mode === "live" ? "Live" : "Paper"}
            </span>
            <span className="st-dock-info">Auto-trade {oneClickOn ? "on" : "off"}</span>
          </span>
        </footer>
      </div>

      {panelOpen && (
        <StrateoPanel
          defs={STRATEGIES}
          stats={stats}
          pending={pending}
          applied={applied}
          favorites={prefs.favorites}
          bells={prefs.bells}
          settings={settings}
          symbol={symbol}
          exchangeName={exchangeName}
          accounts={exchangeAccounts}
          executions={executions}
          positions={positions}
          tab={tab}
          onTab={openTab}
          focusId={focusId}
          busyId={busyId}
          gate={gate}
          onGate={openGate}
          liveOrdersEnabled={liveOrdersEnabled}
          workerRunning={workerRunning}
          onApply={startApply}
          onRemove={startRemove}
          onPlacePosition={(pos) => {
            if (pos.signal) void tradeSignal({ def: pos.def, symbol: pos.row.symbol, trade: pos.signal });
          }}
          onFocus={(def) => writePrefs({ focus: def.id })}
          onToggleFav={(id) => writePrefs({ favorites: toggleIn(prefs.favorites, id) })}
          onToggleBell={(id) => {
            const on = !prefs.bells.includes(id);
            writePrefs({ bells: toggleIn(prefs.bells, id) });
            if (on) {
              const s = stats[id];
              if (s?.open) markSeen(id, symbol, s.open.entryTime);
              toast(`Alerts on — you'll hear about ${getStrategy(id)?.name}'s next entry on ${symbolLabel(symbol)}.`);
            }
          }}
          onTradeSignal={(sig) => void tradeSignal(sig)}
          onRefresh={refresh}
          onClose={() => writePrefs({ panelOpen: false })}
          scrollToken={scrollToken}
        />
      )}

      {gateOpen && !gate.ok && (
        <div className="st-modal-back" role="presentation" onClick={() => setGateOpen(false)}>
          <div
            className="st-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="st-gate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span className="st-card-icon">
                <Lock className="w-4 h-4" aria-hidden />
              </span>
              <h2 id="st-gate-title">{gate.title}</h2>
              <button type="button" className="st-icon-btn" aria-label="Close" onClick={() => setGateOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </header>
            <p className="st-note">{gate.body}</p>
            <ol className="st-gate-steps">
              <li data-done={uid != null}>Log in to your account</li>
              <li data-done={false}>Connect your exchange API key on Exchanges</li>
              <li data-done={false}>Apply a strategy — it trades on your exchange</li>
            </ol>
            <footer>
              <button type="button" className="st-btn st-btn-outline" onClick={() => setGateOpen(false)}>
                Not now
              </button>
              {gate.reason === "login" ? (
                <Link href={LOGIN_HREF} className="st-btn st-btn-solid">
                  Log in
                </Link>
              ) : gate.reason === "exchange" ? (
                <Link href={EXCHANGES_HREF} className="st-btn st-btn-solid">
                  Connect exchange
                </Link>
              ) : gate.reason === "error" ? (
                <button type="button" className="st-btn st-btn-solid" onClick={() => setAcctNonce((n) => n + 1)}>
                  Retry
                </button>
              ) : (
                <button type="button" className="st-btn st-btn-solid" disabled>
                  <Loader2 className="w-4 h-4 st-spin" /> Checking
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {modal && modalDef && (
        <div className="st-modal-back" role="presentation" onClick={() => !modalBusy && setModal(null)}>
          <div
            className="st-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="st-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span className="st-card-icon">
                <modalDef.icon className="w-4 h-4" aria-hidden />
              </span>
              <h2 id="st-modal-title">
                {modal.kind === "apply" ? `Apply ${modalDef.name}` : `Remove ${modalDef.name}`}
              </h2>
              <button type="button" className="st-icon-btn" aria-label="Close" onClick={() => setModal(null)} disabled={modalBusy}>
                <X className="w-4 h-4" />
              </button>
            </header>

            {modal.kind === "apply" ? (
              <>
                <div className="st-choice" role="radiogroup" aria-label="How should this strategy trade?">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={applyAuto}
                    className="st-choice-opt"
                    data-on={applyAuto}
                    onClick={() => setApplyAuto(true)}
                  >
                    <b>Auto-trade</b>
                    <small>
                      {modalServer
                        ? "Server bot places entries, stop and exits — 24×7, even with this page closed."
                        : "Strateo places each entry and exit itself — while Strateo is open in a browser tab."}
                    </small>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!applyAuto}
                    className="st-choice-opt"
                    data-on={!applyAuto}
                    onClick={() => setApplyAuto(false)}
                  >
                    <b>Signals only</b>
                    <small>You get each entry with its target and stop-loss, and place the order yourself.</small>
                  </button>
                </div>
                <dl className="st-modal-grid">
                  <div>
                    <dt>Coin</dt>
                    <dd>{symbolLabel(symbol)}</dd>
                  </div>
                  <div>
                    <dt>Exchange</dt>
                    <dd>{venueName(exchange)}</dd>
                  </div>
                  <div>
                    <dt>Timeframe</dt>
                    <dd>{strategyTimeframe(modalDef).toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt>Mode</dt>
                    <dd className={settings.mode === "live" ? "st-down" : ""}>
                      {settings.mode === "live" ? "LIVE" : "Paper (virtual)"}
                    </dd>
                  </div>
                  {!applyAuto ? (
                    <div className="st-modal-wide">
                      <dt>Orders</dt>
                      <dd>None — signals only</dd>
                    </div>
                  ) : modalServer ? (
                    <>
                      <div className="st-modal-wide">
                        <dt>Demo amount</dt>
                        <dd>
                          <label className="st-money st-money-inline">
                            $
                            <input
                              className="st-input"
                              type="number"
                              min={10}
                              step={10}
                              value={settings.botCapital}
                              onChange={(e) =>
                                writeSettings({ botCapital: Math.max(10, Number(e.target.value) || 0) })
                              }
                              aria-label="Demo amount in USD"
                            />
                          </label>
                          <small className="st-modal-sub">
                            Virtual wallet for this bot. Starts here; moves with each fill.
                          </small>
                        </dd>
                      </div>
                      <div>
                        <dt>Risk / trade</dt>
                        <dd>{settings.botRiskPct}%</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>Per signal</dt>
                        <dd>${settings.orderUsd.toLocaleString("en-US")}</dd>
                      </div>
                      <div>
                        <dt>Runs</dt>
                        <dd>While Strateo is open</dd>
                      </div>
                    </>
                  )}
                  {modalLevels && (
                    <div className="st-modal-wide">
                      <dt>Typical exit (last {modalStats?.days ?? 0} days)</dt>
                      <dd>
                        {modalLevels.target != null ? (
                          <span className="st-up">Target {fmtPct(modalLevels.target)}</span>
                        ) : (
                          <span>{modalLevels.rule}</span>
                        )}
                        {modalLevels.stop != null && <span className="st-down"> · SL {fmtPct(-modalLevels.stop)}</span>}
                        <small className="st-modal-sub">
                          price move from entry · after ~{ROUND_TRIP_COST_PCT.toFixed(2)}% fees:{" "}
                          {modalLevels.target != null ? `${fmtPct(netOfCosts(modalLevels.target))} / ` : ""}
                          {modalLevels.stop != null ? fmtPct(netOfCosts(-modalLevels.stop)) : ""}
                        </small>
                      </dd>
                    </div>
                  )}
                  {modalLive && (
                    <div className="st-modal-wide">
                      <dt>Account</dt>
                      <dd>{liveAccount ? `${liveAccount.label || liveAccount.exchange} · ${liveAccount.key_hint}` : "None selected"}</dd>
                    </div>
                  )}
                </dl>
                <p className="st-note">
                  {!applyAuto
                    ? "No order now or later — every new entry shows in Positions and Signals with its target and stop-loss, and you decide."
                    : modalServer
                      ? "No order now — the bot enters on the next signal and keeps a stop order on the exchange."
                      : `No order now — the next entry is placed automatically, and its exit too. Closing every Strateo tab pauses it.${settings.oneClick ? "" : " This turns on the Auto-trade switch."}`}
                  {applyAuto && settings.mode !== "live" ? " Paper mode uses virtual money — nothing is sent to your exchange." : ""}
                </p>
                {applyAuto && modalFeeRisk && (
                  <p className="st-warn">
                    {modalFeeRisk}
                  </p>
                )}
                {blockingBot && (
                  <label className="st-replace">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => {
                        setReplaceExisting(e.target.checked);
                        setModalError(null);
                      }}
                    />
                    <span>
                      <b>Stop {blockingName} and run this</b>
                      {symbolLabel(symbol)} · {blockingBot.timeframe.toUpperCase()} · {blockingBot.mode === "live" ? "live" : "paper"}
                      {blockingBot.status === "paused" ? " · paused" : ""}.{" "}
                      {blockingOpen
                        ? `Its open ${blockingBot.side || "position"} will be closed first.`
                        : "It has no open trade."}
                    </span>
                  </label>
                )}
                {modalLive && (
                  <>
                    {liveOrdersEnabled === false && (
                      <p className="st-warn">Live orders are disabled on this server — orders will be recorded as paper.</p>
                    )}
                    {liveBlock ? (
                      <p className="st-warn">{liveBlock}</p>
                    ) : (
                      <label className="st-check">
                        <input type="checkbox" checked={liveAck} onChange={(e) => setLiveAck(e.target.checked)} />
                        I understand this strategy will place real orders with real money.
                      </label>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <p className="st-note">
                  Stops server bot #{modal.row.botId} on {symbolLabel(modal.row.symbol)}.
                  {modalBot?.trade_state === "open"
                    ? ` It has an open ${modalBot.side} from ${fmtPrice(modalBot.entry_price)}.`
                    : " It has no open trade."}
                </p>
                {modalBot?.trade_state === "open" && (
                  <label className="st-check">
                    <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
                    Close the open position now (market)
                  </label>
                )}
              </>
            )}

            {modalError && <p className="st-error">{modalError}</p>}

            <footer>
              <button type="button" className="st-btn st-btn-outline" onClick={() => setModal(null)} disabled={modalBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="st-btn st-btn-solid"
                data-tone={modalLive ? "live" : undefined}
                disabled={
                  modalBusy ||
                  (modalLive && (Boolean(liveBlock) || !liveAck)) ||
                  (modal.kind === "apply" && modalServer && applyAuto && !token)
                }
                onClick={() => void confirmModal()}
              >
                {modalBusy ? (
                  <Loader2 className="w-4 h-4 st-spin" />
                ) : modal.kind === "apply" ? (
                  !applyAuto ? "Apply · signals only" : modalServer ? (replaceExisting && blockingBot ? "Stop & deploy" : "Deploy bot") : "Apply · auto-trade"
                ) : (
                  "Stop & remove"
                )}
              </button>
            </footer>
            {modal.kind === "apply" && modalServer && applyAuto && !token && <p className="st-warn">Log in to deploy a server bot.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
