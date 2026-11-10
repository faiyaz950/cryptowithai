"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Lock,
  Plus,
  Server,
  Settings,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import CandleChart, { type ChartLevel, type ChartMarker } from "@/components/trade/CandleChart";
import StrateoPanel, { Switch, type PanelTab, type StrateoSignal } from "./StrateoPanel";
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
  closeExecution,
  dayKey,
  executeSignal,
  executionPnl,
  fmtPct,
  fmtPrice,
  fmtUsd,
  lastSeenEntry,
  markSeen,
  peekStats,
  removeApplied,
  requestStats,
  runsOnServer,
  saveApplied,
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
import "./strateo.css";

const CHART_BARS = 600;
const TF_CHOICES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
const SIGNALS_SEEN_KEY = "strateo.signalsSeen";
const EMPTY_CANDLES: Candle[] = [];

const ENTRY_COLOR = "#3b82f6";
const UP = "#22c55e";
const DOWN = "#ef4444";

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
  /** Login + kam se kam ek chalu exchange key — tabhi apply, order aur 1-Click. */
  const gate = tradeGate({
    signedIn: uid != null,
    accounts: acctLoaded ? acctLoaded.rows ?? [] : null,
    failed: Boolean(acctLoaded && acctLoaded.rows == null),
  });
  const canTrade = gate.ok;
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
    const id = window.setInterval(() => void loadBots(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [loadBots]);

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
        if (Date.now() - open.entryTime <= 2 * barMs + 5 * 60_000) {
          const text = `${def.name}: ${open.side === "long" ? "BUY" : "SELL"} ${symbolLabel(s.symbol)} @ ${fmtPrice(open.entry)}`;
          alertOut("Strateo signal", text);
          if (row?.runner === "browser") {
            if (ctx.settings.oneClick && ctx.canTrade && ctx.token && ctx.uid != null) {
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
                toast(`Order placed (${exec.mode}) — ${text}`, "good");
              } catch (err) {
                toast(`Order failed — ${errText(err)}`, "bad");
              }
            } else {
              toast(`New signal — ${text}`, "info", { label: "Place order", run: () => openTab("signals") });
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
          trade = {
            side: exec.side,
            entryTime: exec.entryTime,
            exitTime: Date.now(),
            entry: exec.entry,
            exit,
            stop: exec.stop,
            target: exec.target,
            pct: (exec.side === "long" ? 1 : -1) * ((exit - exec.entry) / exec.entry) * 100,
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

  const applyBrowser = async (def: StrategyDef) => {
    if (uid == null || !canTrade) throw new Error("Log in and connect an exchange to apply.");
    // Jo trade abhi khula hai wo "pichhla" hai — order sirf agli entry par.
    const s = stats[def.id] ?? (await requestStats(def, symbol, { priority: true }));
    if (s?.open) markSeen(def.id, symbol, s.open.entryTime);
    saveApplied({ ...appliedRow(def, uid), runner: "browser", botId: null });
    writePrefs({ focus: def.id });
    toast(
      `${def.name} applied on ${symbolLabel(symbol)} · ${exchangeName} — ${settings.oneClick ? "orders go out on the next entry" : "you'll get the next entry to confirm"}.`,
      "good",
    );
  };

  const applyServer = async (def: StrategyDef) => {
    if (!token || uid == null || !canTrade) throw new Error("Log in and connect an exchange to deploy a bot.");
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
      ...(settings.mode === "live" ? { confirm_live: true, exchange_account_id: settings.accountId ?? undefined } : {}),
    });
    const s = stats[def.id];
    if (s?.open) markSeen(def.id, symbol, s.open.entryTime);
    saveApplied({ ...appliedRow(def, uid), runner: "server", botId: res.data.id });
    writePrefs({ focus: def.id });
    void loadBots();
    toast(`${def.name}: ${settings.mode === "live" ? "LIVE" : "paper"} bot #${res.data.id} running on ${symbolLabel(symbol)} — 24×7.`, "good");
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
    if (runsOnServer(def) || settings.mode === "live") {
      setModalError(null);
      setLiveAck(false);
      setModal({ kind: "apply", def });
      return;
    }
    setBusyId(def.id);
    void applyBrowser(def)
      .catch((err) => toast(errText(err), "bad"))
      .finally(() => setBusyId(null));
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
        if (runsOnServer(modal.def)) await applyServer(modal.def);
        else await applyBrowser(modal.def);
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
    if (settings.mode === "live" && !window.confirm(`Send a LIVE ${sig.trade.side === "long" ? "BUY" : "SELL"} order for ${symbolLabel(sig.symbol)}?`)) return;
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
      toast(`Order placed (${exec.mode}) — ${sig.def.name} ${sig.trade.side === "long" ? "BUY" : "SELL"} ${symbolLabel(sig.symbol)}`, "good");
    } catch (err) {
      toast(`Order failed — ${errText(err)}`, "bad");
    } finally {
      setBusyId(null);
    }
  };

  /* ── Chart overlays ────────────────────────────────── */

  const markers = useMemo<ChartMarker[]>(() => {
    if (!focusStats || focusStats.error) return [];
    const out: ChartMarker[] = [];
    for (const t of focusStats.trades) {
      out.push({
        time: t.entryTime,
        position: t.side === "long" ? "belowBar" : "aboveBar",
        shape: "circle",
        color: ENTRY_COLOR,
      });
      if (t.open) continue;
      const label =
        t.outcome === "stop" ? "SL Hit" : t.outcome === "target" ? "Target" : t.outcome === "trail" ? "Trail" : "Exit";
      out.push({
        time: t.exitTime,
        position: t.side === "long" ? "aboveBar" : "belowBar",
        shape: "square",
        color: t.pct >= 0 ? UP : DOWN,
        text: `${label} ${fmtPct(t.pct, 1)}`,
      });
    }
    return out;
  }, [focusStats]);

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
    const barMs = intervalMinutes(focusRow.timeframe) * 60_000;
    return focusOpen.entryTime + barMs > focusRow.appliedAt ? "signal" : "scan";
  })();

  const levels = useMemo<ChartLevel[]>(() => {
    if (!focusOpen || focusState === "scan") return [];
    const out: ChartLevel[] = [{ price: focusOpen.entry, title: "Entry", color: ENTRY_COLOR, dashed: focusState !== "taken" }];
    if (focusOpen.stop) out.push({ price: focusOpen.stop, title: "SL", color: DOWN, dashed: true });
    if (focusOpen.target) out.push({ price: focusOpen.target, title: "Target", color: UP, dashed: true });
    return out;
  }, [focusOpen, focusState]);

  const bubble = useMemo(() => {
    if (!focusDef) return null;
    const open = focusOpen;
    const move = open && lastPrice ? (open.side === "long" ? 1 : -1) * ((lastPrice - open.entry) / open.entry) * 100 : open?.pct;
    const side = open?.side === "short" ? "Short" : "Long";
    let title: string;
    let sub: string;
    if (focusStats?.error) {
      title = focusDef.name;
      sub = "Not available on this coin";
    } else if (focusState === "taken" && open) {
      title = `${side} open · ${fmtPct(move ?? 0)}`;
      sub = `Entry ${fmtPrice(open.entry)}${open.stop ? ` · SL ${fmtPrice(open.stop)}` : ""}`;
    } else if (focusState === "signal" && open) {
      title = `${side} signal · ${fmtPrice(open.entry)}`;
      sub = oneClickOn ? "Placing order…" : "Place it from Signals";
    } else if (focusState === "scan") {
      title = "Analyzing";
      sub = "Next Entry";
    } else {
      title = `Preview · ${focusDef.name}`;
      sub = open ? `${side} now ${fmtPct(move ?? 0)} · Apply to trade` : "Apply to trade it";
    }
    return (
      <div className="st-bubble" data-state={focusState}>
        <span className="st-bubble-icon">
          <Zap className="w-4 h-4" aria-hidden />
        </span>
        <span className="st-bubble-text">
          <span>{title}</span>
          <small>{sub}</small>
        </span>
      </div>
    );
  }, [focusDef, focusOpen, focusStats, focusState, lastPrice, oneClickOn]);

  /* ── Render ────────────────────────────────────────── */

  const panelOpen = prefs.panelOpen;
  const modalDef = modal?.def ?? null;
  const modalServer = modalDef ? runsOnServer(modalDef) : false;
  const liveBlock =
    modal?.kind === "apply" && settings.mode === "live"
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

  return (
    <div className="strateo" data-panel={panelOpen}>
      <div className="st-stage">
        <header className="st-topbar">
          <span className="st-brand">
            <span className="st-logo">
              <Zap className="w-4 h-4" aria-hidden />
            </span>
            <span className="st-brand-name">Strateo</span>
          </span>

          <div className="st-exchanges" aria-label="Exchanges">
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
                className="st-exch st-exch-add"
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

          <span className="st-divider" aria-hidden />

          <div className="st-applied" aria-label="Applied strategies">
            {applied.map((a) => {
              const def = getStrategy(a.id);
              if (!def) return null;
              const Icon = def.icon;
              const bot = a.botId ? bots.find((b) => b.id === a.botId) : undefined;
              return (
                <span key={a.id} className="st-atab" data-active={focusId === a.id} data-stopped={bot?.status === "stopped"}>
                  <button type="button" onClick={() => writePrefs({ focus: a.id })} title={`${def.name} · ${symbolLabel(a.symbol)} · ${a.mode}`}>
                    <span className="st-atab-icon">
                      <Icon className="w-3 h-3" aria-hidden />
                    </span>
                    <span className="st-atab-name">{def.name}</span>
                    {a.runner === "server" && <Server className="w-3 h-3 st-muted" aria-label="Server bot" />}
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
              Add a strategy <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="st-topbar-end">
            <button type="button" className="st-icon-btn" aria-label="Strateo settings" onClick={() => openTab("settings")}>
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              className="st-pnl"
              onClick={() => openTab("signals")}
              title="Open trades plus trades closed today, placed by Strateo"
            >
              <span className="st-pnl-icon">
                <Zap className="w-3.5 h-3.5" aria-hidden />
                {unread > 0 && <span className="st-badge">{unread > 99 ? "99+" : unread}</span>}
              </span>
              P&amp;L <b className={pnl > 0 ? "st-up" : pnl < 0 ? "st-down" : ""}>{fmtUsd(pnl)}</b>
            </button>
            <button
              type="button"
              className="st-icon-btn st-collapse"
              aria-label={panelOpen ? "Hide strategy panel" : "Show strategy panel"}
              onClick={() => writePrefs({ panelOpen: !panelOpen })}
            >
              {panelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div className="st-chartbar">
          <label className="st-symbol">
            <span className="sr-only">Coin</span>
            <select value={symbol} onChange={(e) => writePrefs({ symbol: e.target.value })}>
              {CRYPTO_SYMBOLS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label.replace("/", "")}
                </option>
              ))}
            </select>
          </label>
          <div className="st-tfs" role="group" aria-label="Timeframe">
            {intervals.map((tf) => (
              <button key={tf} type="button" data-active={tf === interval} onClick={() => writePrefs({ interval: tf })}>
                {tf.replace("d", "D")}
              </button>
            ))}
          </div>
          <span className="st-chartbar-venue">{source?.name ?? venueName(exchange)}</span>
          <div className="st-oneclick">
            <span>1-Click Trade</span>
            <span
              className="st-info"
              title="When on, an applied in-browser strategy places its order the moment it signals — no confirm step. Mode and size are in Settings."
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <Switch
              on={oneClickOn}
              onChange={(v) => (canTrade ? writeSettings({ oneClick: v }) : openGate())}
              label="1-Click Trade"
            />
          </div>
        </div>

        <div className="st-chart">
          {chartError ? (
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
              rightGap={34}
              drawingsKey={`strateo:${exchange}:${symbol}`}
            />
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

        <footer className="st-statusbar">
          <span className="st-conn" data-state={exchange === "delta" ? liveStatus ?? "connecting" : "poll"}>
            <span aria-hidden />
            {exchange === "delta"
              ? liveStatus === "live"
                ? "Connected"
                : liveStatus === "unsupported"
                  ? "Polling"
                  : "Connecting"
              : "Polling every 10s"}
          </span>
          <span className="st-statusbar-info">
            {applied.length} applied · {settings.mode === "live" ? "Live" : "Paper"} · 1-Click {oneClickOn ? "on" : "off"}
          </span>
          {lastPrice != null && <span className="st-statusbar-px">{fmtPrice(lastPrice)}</span>}
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
                    <dd className={settings.mode === "live" ? "st-down" : ""}>{settings.mode === "live" ? "LIVE" : "Paper"}</dd>
                  </div>
                  {modalServer ? (
                    <>
                      <div>
                        <dt>Capital</dt>
                        <dd>${settings.botCapital.toLocaleString("en-US")}</dd>
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
                        <dt>1-Click</dt>
                        <dd>{settings.oneClick ? "On" : "Off — confirm each"}</dd>
                      </div>
                    </>
                  )}
                  {settings.mode === "live" && (
                    <div className="st-modal-wide">
                      <dt>Account</dt>
                      <dd>{liveAccount ? `${liveAccount.label || liveAccount.exchange} · ${liveAccount.key_hint}` : "None selected"}</dd>
                    </div>
                  )}
                </dl>
                <p className="st-note">
                  {modalServer
                    ? "Runs as a bot on the server, 24×7, even with this page closed. No order now — the bot enters on the next signal and keeps a stop order on the exchange."
                    : "Runs while Strateo is open: every candle close the strategy re-checks. No order now — the next entry " +
                      (settings.oneClick ? "is sent to the exchange automatically." : "shows in Signals for you to place.") +
                      " Exits (SL / target / strategy exit) are sent the same way."}
                </p>
                {settings.mode === "live" && (
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
                data-tone={modal.kind === "apply" && settings.mode === "live" ? "live" : undefined}
                disabled={
                  modalBusy ||
                  (modal.kind === "apply" && settings.mode === "live" && (Boolean(liveBlock) || !liveAck)) ||
                  (modal.kind === "apply" && modalServer && !token)
                }
                onClick={() => void confirmModal()}
              >
                {modalBusy ? <Loader2 className="w-4 h-4 st-spin" /> : modal.kind === "apply" ? (modalServer ? "Deploy bot" : "Apply") : "Stop & remove"}
              </button>
            </footer>
            {modal.kind === "apply" && modalServer && !token && <p className="st-warn">Log in to deploy a server bot.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
