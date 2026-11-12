"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  FlaskConical,
  Pause,
  Play,
  RefreshCw,
  ChevronDown,
  RotateCcw,
  Server,
  Square,
  X,
  Zap,
} from "lucide-react";
import BacktestResults from "@/components/trade/BacktestResults";
import StrategyOverview from "@/components/trade/StrategyOverview";
import OptionChainPanel from "@/components/trade/OptionChainPanel";
import SpreadPanel from "@/components/trade/SpreadPanel";
import CondorPanel from "@/components/trade/CondorPanel";
import { useAuth } from "@/context/AuthContext";
import { listExchangeAccounts, type ExchangeAccount } from "@/lib/accountApi";
import {
  CHART_RANGES,
  CRYPTO_INTERVALS,
  MAX_CHART_CANDLES,
  CRYPTO_SYMBOLS,
  barsForDays,
  deployStrategyBot,
  fetchCandles,
  fetchPaperAccount,
  fetchStrategyBots,
  maxDaysForInterval,
  placeDemoOrder,
  runBacktest,
  setStrategyBotStatus,
  stopStrategyBot,
  symbolLabel,
  type BacktestResult,
  type Candle,
  type PaperAccount,
  type StrategyBot,
  syncStamp,
} from "@/lib/cryptoApi";
import {
  bool,
  getStrategy,
  matchPreset,
  num,
  str,
  strategyHref,
  visibleFields,
  type StrategyDef,
  type StrategyField,
  type StrategyPreset,
  type StrategyValues,
} from "@/lib/strategies";
import PresetPicker from "@/components/trade/PresetPicker";
import {
  CUSTOM_STRATEGIES_CHANGED,
  deployStrategyToPaper,
  listPaperDeployedStrategies,
  type PaperDeploymentSettings,
  type StrategyCategory,
} from "@/lib/strategyBuilder";
import { isBgrhStrategy, runBgrhBacktest } from "@/lib/buyGridRecovery";
import { optionsKind, runOptionsBacktest } from "@/lib/optionsBacktest";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

interface Props {
  def: StrategyDef;
  initialValues: StrategyValues;
  /** Card ke Backtest button se aaye to page khulte hi backtest chalao. */
  autoBacktest?: boolean;
}

/** Candles refresh while the strategy page is open. */
const POLL_MS = 60_000;
/** Server bot ki haalat kitni der mein dobara padho — bot khud server par chalta hai, ye sirf dikhana hai. */
const BOT_POLL_MS = 30_000;

const MARKET_KEYS = new Set(["symbol", "timeframe"]);
const RISK_KEYS = new Set(["capital", "risk_pct"]);
const ESSENTIAL_KEYS = new Set(["symbol", "timeframe", "capital", "risk_pct", "channel", "tp1_r", "h1"]);

/** Setup rail groups — Market / Risk / Params on top, rest under Advanced. */
function splitFields(def: StrategyDef, values: StrategyValues): {
  market: StrategyField[];
  risk: StrategyField[];
  params: StrategyField[];
  advanced: StrategyField[];
} {
  const fields = visibleFields(def, values);
  const essentials = fields.filter((f) => f.onCard || ESSENTIAL_KEYS.has(f.key));
  const essentialKeys = new Set(essentials.map((f) => f.key));
  const order = (keys: Set<string>) => essentials.filter((f) => keys.has(f.key));
  return {
    market: order(MARKET_KEYS),
    risk: order(RISK_KEYS),
    params: essentials.filter((f) => !MARKET_KEYS.has(f.key) && !RISK_KEYS.has(f.key)),
    advanced: fields.filter((f) => !essentialKeys.has(f.key)),
  };
}

function toneColor(tone: string): string {
  if (tone === "buy") return "var(--green)";
  if (tone === "sell") return "var(--red)";
  return "var(--text-primary)";
}

function shortInterval(value: string): string {
  return value.endsWith("m") ? value : value.toUpperCase();
}

function fmtDay(timeMs: number): string {
  return new Date(timeMs).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtPx(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

/** One-line label for the bot's current trade. */
function botTradeLabel(bot: StrategyBot): { text: string; color?: string } {
  const side = bot.side === "long" ? "LONG" : bot.side === "short" ? "SHORT" : "";
  const color = bot.side === "long" ? "var(--green)" : bot.side === "short" ? "var(--red)" : undefined;
  switch (bot.trade_state) {
    case "open":
      return { text: `${side} open`, color };
    case "entering":
      return { text: `${side} entering…`, color };
    case "closed":
      return { text: "Flat — last trade closed" };
    case "skipped":
      return { text: "Flat — last signal skipped" };
    default:
      return { text: "Flat — waiting for signal" };
  }
}

export default function StrategyRunner({ def, initialValues, autoBacktest }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<StrategyValues>(initialValues);
  /**
   * Bhaari kaam (indicators + 4000-bar chart redraw + option chain fetch) har
   * keystroke par chalta tha, jisse number fields mein type karna atakta tha.
   * Inputs `values` par turant chalte hain; analysis typing rukne ke baad.
   */
  const [settledValues, setSettledValues] = useState<StrategyValues>(initialValues);

  // Chart kitne din pehle tak dikhaye — default backtest window ke barabar.
  const [chartDays, setChartDays] = useState(() => num(initialValues, "days", 30));
  const [candles, setCandles] = useState<Candle[]>([]);
  /** Pro jaisi strategies alt coin ka signal BTC ke regime se pakka karti hain. */
  const [btcCandles, setBtcCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const [btProgress, setBtProgress] = useState<string | null>(null);

  const { token } = useAuth();
  const searchParams = useSearchParams();

  const [deployModalOpen, setDeployModalOpen] = useState(false);
  /** Preset strategies can one-click deploy bots on all portfolio coins. */
  const [deployScope, setDeployScope] = useState<"portfolio" | "single">("portfolio");
  const [deployMode, setDeployMode] = useState<"paper" | "live">("paper");
  const [liveConfirm, setLiveConfirm] = useState(false);
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([]);
  const [exchangeAccountId, setExchangeAccountId] = useState<number | null>(null);
  const [liveOrdersEnabled, setLiveOrdersEnabled] = useState(false);
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  /** Deploy safety — stored in bot.params; worker enforces (Master Spec Part J). */
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(3);
  const [maxLosingStreak, setMaxLosingStreak] = useState(5);
  const [maxPositions, setMaxPositions] = useState(1);

  const [testCapital, setTestCapital] = useState(1000);
  const [testLeverage, setTestLeverage] = useState(1);
  const [isPaperActive, setIsPaperActive] = useState(false);

  const checkPaper = useCallback(() => {
    const list = listPaperDeployedStrategies();
    setIsPaperActive(list.some((s) => s.id === def.id && s.status === "paper"));
  }, [def.id]);

  useEffect(() => {
    checkPaper();
    window.addEventListener(CUSTOM_STRATEGIES_CHANGED, checkPaper);
    window.addEventListener("storage", checkPaper);
    return () => {
      window.removeEventListener(CUSTOM_STRATEGIES_CHANGED, checkPaper);
      window.removeEventListener("storage", checkPaper);
    };
  }, [checkPaper]);

  useEffect(() => {
    if (searchParams.get("paper") === "1") {
      setDeployMode("paper");
      setDeployModalOpen(true);
    }
  }, [searchParams]);

  // Live deploy needs a Delta account with live trading on.
  useEffect(() => {
    if (!deployModalOpen || !def.autoTrade || !token) return;
    let cancelled = false;
    listExchangeAccounts(token)
      .then((list) => {
        if (cancelled) return;
        const delta = list.filter((a) => a.is_active && a.exchange === "delta");
        setExchangeAccounts(delta);
        setExchangeAccountId((prev) => {
          if (prev && delta.some((a) => a.id === prev)) return prev;
          const preferred = delta.find((a) => a.live_trading_enabled && a.can_trade && !a.can_withdraw);
          return preferred?.id ?? delta[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setExchangeAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deployModalOpen, def.autoTrade, token]);

  const symbol = str(values, "symbol", "BTCUSDT");
  const timeframe = str(values, "timeframe", "1h");

  // Parent har render par naya callback de sakta hai — ref se effect deps stable rehti hain.
  const log = useCallback((line: string) => {
    const stamp = syncStamp();
    setLogs((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 40));
  }, []);

  const setValue = (key: string, value: StrategyValues[string]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Server bot (sirf autoTrade strategies) ──────────── */

  const [serverBots, setServerBots] = useState<StrategyBot[]>([]);
  const [botWorkerRunning, setBotWorkerRunning] = useState(true);
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  /** Badhao to bot list turant dobara aati hai (deploy / pause / stop ke baad). */
  const [botsVersion, setBotsVersion] = useState(0);
  const refreshBots = () => setBotsVersion((v) => v + 1);

  useEffect(() => {
    if (!def.autoTrade || !token) return;
    let cancelled = false;
    const load = () => {
      fetchStrategyBots(token)
        .then((res) => {
          if (cancelled) return;
          setServerBots(res.data ?? []);
          setBotWorkerRunning(res.worker_running);
          setLiveOrdersEnabled(Boolean(res.live_orders_enabled));
          setBotError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setBotError(err instanceof Error ? err.message : "Could not load bots");
        });
      fetchPaperAccount(token)
        .then((acc) => {
          if (cancelled) return;
          setPaperAccount(acc);
          setPaperError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setPaperAccount(null);
            setPaperError(err instanceof Error ? err.message : "Could not load paper account");
          }
        });
    };
    load();
    const id = window.setInterval(load, BOT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [def.autoTrade, token, botsVersion]);

  // Ek symbol par ek hi chalu bot hota hai (paper book ek position rakhta hai).
  const serverBot = useMemo(
    () =>
      serverBots.find(
        (b) => b.strategy === def.id && b.symbol === symbol.toUpperCase() && b.status !== "stopped",
      ) ?? null,
    [serverBots, def.id, symbol],
  );
  const paperActive = def.autoTrade ? serverBot !== null : isPaperActive;
  // Portfolio deploy ke baad teeno coins ke bot — panel unhe ek saath dikhata hai.
  const strategyBots = useMemo(
    () => serverBots.filter((b) => b.strategy === def.id && b.status !== "stopped"),
    [serverBots, def.id],
  );
  const strategySymbols = useMemo(() => {
    const list = (def.portfolio?.length ? def.portfolio : [symbol]).map((s) => s.toUpperCase());
    return [...new Set(list)];
  }, [def.portfolio, symbol]);
  const paperScoped = useMemo(() => {
    if (!paperAccount) return null;
    const set = new Set(strategySymbols);
    const positions = paperAccount.positions.filter((p) => set.has(p.symbol.toUpperCase()));
    const unrealized = positions.reduce((a, p) => a + Number(p.unrealized_pnl ?? 0), 0);
    const notional = positions.reduce((a, p) => a + Number(p.notional ?? 0), 0);
    const margin = positions.reduce((a, p) => a + Number(p.margin ?? 0), 0);
    const openLong = positions.filter((p) => p.side === "long").length;
    const openShort = positions.filter((p) => p.side === "short").length;
    const botsOpen = strategyBots.filter((b) => b.trade_state === "open" || b.trade_state === "entering");
    return { positions, unrealized, notional, margin, openLong, openShort, botsOpen };
  }, [paperAccount, strategySymbols, strategyBots]);

  const botAction = async (run: () => Promise<unknown>, line: string) => {
    setBotBusy(true);
    setBotError(null);
    try {
      await run();
      log(line);
      refreshBots();
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "Bot action fail");
    } finally {
      setBotBusy(false);
    }
  };

  const stopBot = (flatten: boolean) => {
    if (!serverBot || !token) return;
    const open = serverBot.trade_state === "open" || serverBot.trade_state === "entering";
    if (flatten && open && !window.confirm("Stop the bot and close the open position at market?")) return;
    void botAction(
      () => stopStrategyBot(token, serverBot.id, flatten),
      flatten ? "Server bot stopped — position closed" : "Server bot stopped — position left open",
    );
  };

  /* ── Live data ───────────────────────────────────────── */

  const candleReq = useRef(0);

  const loadCandles = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    const req = ++candleReq.current;
    if (!soft) {
      // Drop stale OHLC so BTC overlays can't sit on a SOL chart while fetch runs.
      setCandles([]);
      setBtcCandles([]);
      setLoading(true);
    }
    try {
      const limit = Math.max(barsForDays(chartDays, timeframe), Math.min(def.minHistoryBars ?? 0, MAX_CHART_CANDLES));
      const wantBtc = Boolean(def.needsBtc) && !symbol.toUpperCase().startsWith("BTC");
      const [res, btcRes] = await Promise.all([
        fetchCandles({ symbol, interval: timeframe, limit }),
        wantBtc ? fetchCandles({ symbol: "BTCUSDT", interval: timeframe, limit }) : Promise.resolve(null),
      ]);
      if (req !== candleReq.current) return;
      if (!res.success) throw new Error(res.error || "Candle data unavailable");
      if (btcRes && !btcRes.success) throw new Error(btcRes.error || "BTC candle data unavailable");
      setCandles(res.candles ?? []);
      setBtcCandles(btcRes?.candles ?? []);
      setLiveError(null);
      setUpdatedAt(syncStamp());
    } catch (err) {
      if (req !== candleReq.current) return;
      const message = err instanceof Error ? err.message : "Cannot reach crypto backend";
      setLiveError(message);
      if (!soft) setCandles([]);
    } finally {
      if (req === candleReq.current && !soft) setLoading(false);
    }
  }, [symbol, timeframe, chartDays, def.minHistoryBars, def.needsBtc]);

  useEffect(() => {
    void loadCandles({ soft: false });
  }, [loadCandles]);

  // Soft refresh while the page is open — keep current candles (no flash).
  useEffect(() => {
    const id = window.setInterval(() => void loadCandles({ soft: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadCandles]);

  /* ── Analysis ────────────────────────────────────────── */

  useEffect(() => {
    const id = window.setTimeout(() => setSettledValues(values), 250);
    return () => window.clearTimeout(id);
  }, [values]);

  const analysis = useMemo(
    () => def.analyze(candles, settledValues, { btc: btcCandles }),
    [def, candles, settledValues, btcCandles],
  );
  const { signal, overlays } = analysis;

  // Signal badalne par hi log likho, har poll par nahi.
  const lastHeadline = useRef<string | null>(null);
  useEffect(() => {
    if (!candles.length) return;
    if (lastHeadline.current === signal.headline) return;
    lastHeadline.current = signal.headline;
    log(signal.headline);
  }, [candles.length, signal.headline, log]);

  /* ── Actions ─────────────────────────────────────────── */

  /** Tuned params URL mein rakho taaki refresh/share par wahi setup khule. */
  const syncUrl = useCallback(() => {
    router.replace(strategyHref(def, values), { scroll: false });
  }, [router, def, values]);

  const activePreset = useMemo(() => matchPreset(def, values), [def, values]);

  /** Preset sirf rules aur risk badalta hai — coin, capital aur history waise hi. */
  const applyPreset = (preset: StrategyPreset) => {
    const keep = { symbol: values.symbol, capital: values.capital, days: values.days };
    if (preset.strategyId === def.id) {
      setValues((prev) => ({ ...prev, ...preset.values, ...keep }));
      return;
    }
    const target = getStrategy(preset.strategyId);
    if (target) router.push(strategyHref(target, { ...target.defaults, ...preset.values, ...keep }));
  };

  /**
   * autoTrade strategy ka bot server par chalta hai — har band candle par backend worker
   * strategy ko paper account se milata hai, browser band ho tab bhi. Order deploy par nahi,
   * agle signal par lagta hai.
   */
  const portfolioDeploy = Boolean(def.autoTrade && def.portfolio?.length) && deployScope === "portfolio";

  const selectedExchange = useMemo(
    () => exchangeAccounts.find((a) => a.id === exchangeAccountId) ?? null,
    [exchangeAccounts, exchangeAccountId],
  );

  const liveAccountOk = Boolean(
    selectedExchange &&
      selectedExchange.live_trading_enabled &&
      selectedExchange.can_trade &&
      !selectedExchange.can_withdraw,
  );

  const liveDeployBlocked =
    deployMode === "live" &&
    (!liveOrdersEnabled || !selectedExchange || !liveAccountOk || !liveConfirm);

  const deployServerBot = async (botSymbol = symbol, capital = num(values, "capital", 1000)) => {
    if (!token) throw new Error("Log in to deploy a bot");
    if (deployMode === "live") {
      if (!liveConfirm) throw new Error("Confirm that this bot may place real orders");
      if (!liveOrdersEnabled) throw new Error("Live orders are disabled on the server (LIVE_ORDERS_ENABLED)");
      if (!exchangeAccountId) throw new Error("Select a Delta exchange account");
    }
    const res = await deployStrategyBot(token, {
      strategy: def.id,
      symbol: botSymbol,
      timeframe,
      capital,
      risk_pct: num(values, "risk_pct", 1),
      channel: num(values, "channel", 30),
      exit_channel: num(values, "exit_channel", 15),
      stop_atr: num(values, "stop_atr", 2),
      allow_shorts: bool(values, "allow_shorts"),
      ...def.botParams?.(values),
      max_daily_loss_pct: maxDailyLossPct,
      max_losing_streak: maxLosingStreak,
      max_positions: maxPositions,
      mode: deployMode,
      ...(deployMode === "live"
        ? { confirm_live: true, exchange_account_id: exchangeAccountId ?? undefined }
        : {}),
    });
    syncUrl();
    refreshBots();
    log(
      `${deployMode === "live" ? "LIVE" : "Paper"} bot deploy — ${symbolLabel(botSymbol)} · ${timeframe} (bot #${res.data.id})`,
    );
  };

  /**
   * BTC + ETH + SOL — capital teeno mein barabar, jaise portfolio backtest. Jis coin par bot
   * pehle se chal raha ho use chhod kar baaki lagao, aur saaf batao kya hua.
   */
  const deployPortfolioBots = async () => {
    const coins = def.portfolio ?? [];
    const share = Math.floor((num(values, "capital", 1000) / coins.length) * 100) / 100;
    const done: string[] = [];
    const failed: string[] = [];
    for (const sym of coins) {
      try {
        await deployServerBot(sym, share);
        done.push(symbolLabel(sym));
      } catch (err) {
        failed.push(`${symbolLabel(sym)}: ${err instanceof Error ? err.message : "deploy failed"}`);
      }
    }
    if (!done.length) throw new Error(failed.join(" · "));
    const modeLabel = deployMode === "live" ? "LIVE" : "paper";
    setDeployNote(
      `${done.length} ${modeLabel} bot(s) running (${done.join(", ")}) — $${share.toLocaleString("en-US")} each.` +
        (failed.length ? ` Skipped: ${failed.join(" · ")}` : ""),
    );
  };

  const handleDeployConfirm = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      if (def.autoTrade) {
        setDeployNote(null);
        if (portfolioDeploy) await deployPortfolioBots();
        else await deployServerBot();
        setDeploySuccess(true);
        return;
      }
      const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
      const slPoints = num(values, "sl_points", 400);
      const targetPoints = num(values, "target_points", 800);
      const slPct = currentPrice > 0 ? Number(((slPoints / currentPrice) * 100).toFixed(2)) : 1.2;
      const tpPct = currentPrice > 0 ? Number(((targetPoints / currentPrice) * 100).toFixed(2)) : 2.5;

      const settings: PaperDeploymentSettings = {
        capitalUsd: testCapital,
        leverage: testLeverage,
        autoExecute: true,
        deployedAt: new Date().toISOString(),
        symbol,
        timeframe,
        confirmedTpPct: tpPct || 2.5,
        confirmedSlPct: slPct || 1.2,
      };

      const cat: StrategyCategory = def.category.toLowerCase().includes("option")
        ? "options"
        : def.category.toLowerCase().includes("perp") || def.category.toLowerCase().includes("future")
        ? "futures"
        : def.category.toLowerCase().includes("hedge")
        ? "hedging"
        : "indicators";

      const deployed = deployStrategyToPaper(def.id, settings, {
        name: def.name,
        description: def.logic,
        category: cat,
      });

      if (!deployed) throw new Error("Could not save strategy");

      setIsPaperActive(true);

      if (token && currentPrice > 0) {
        try {
          const qty = Number((testCapital / currentPrice).toFixed(4));
          const slPrice = currentPrice * (1 - (slPct || 1.2) / 100);
          const tpPrice = currentPrice * (1 + (tpPct || 2.5) / 100);

          await placeDemoOrder(token, {
            symbol,
            side: "buy",
            order_type: "market",
            quantity: Math.max(0.001, qty),
            stop_loss: slPrice,
            take_profit: tpPrice,
          });
        } catch {
          // demo order fallback
        }
      }

      setDeploySuccess(true);
      log(`Strategy ${def.name} successfully deployed to Paper Trading!`);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleBacktest = async () => {
    setBtRunning(true);
    setBtError(null);
    setBtResult(null);
    syncUrl();
    try {
      const res = optionsKind(def)
        ? await runOptionsBacktest(def, values, setBtProgress)
        : isBgrhStrategy(def.id)
          ? await runBgrhBacktest(values)
          : await runBacktest(def.toBacktest(values));
      if (!res.success) throw new Error(res.error || "Backtest fail");
      setBtResult(res);
      log(`Backtest done — ${res.total_trades ?? 0} trades, win rate ${res.win_rate ?? 0}%`);
    } catch (err) {
      setBtError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setBtRunning(false);
      setBtProgress(null);
    }
  };

  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoBacktest || autoRan.current) return;
    autoRan.current = true;
    void handleBacktest();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sirf pehli baar, card se aane par
  }, [autoBacktest]);

  const maxDays = maxDaysForInterval(timeframe);
  const clamped = chartDays > maxDays;
  const { market, risk, params, advanced } = splitFields(def, values);
  const onField = (key: string, value: StrategyValues[string]) => setValue(key, value);

  return (
    <div className="sr-layout">
      {/* ── Config rail + server bot (Run backtest ke neeche) ── */}
      <div className="sr-left trade-sticky-rail">
        <aside className="trade-panel sr-rail">
          <div className="trade-panel-head">
            <span className="trade-panel-title">Setup</span>
            <button
              type="button"
              className="trade-btn trade-btn-ghost trade-size-sm"
              onClick={() => setValues({ ...def.defaults })}
              title="Reset to defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="trade-panel-body sr-rail-body">
            {market.length > 0 && (
              <div className="sr-section">
                <div className="trade-section-label">Market</div>
                <div className="sr-fields sr-fields-2">
                  {market.map((field) => (
                    <FieldControl key={field.key} field={field} values={values} onChange={(v) => onField(field.key, v)} />
                  ))}
                </div>
              </div>
            )}

            {risk.length > 0 && (
              <div className="sr-section">
                <div className="trade-section-label">Risk</div>
                <div className="sr-fields sr-fields-2">
                  {risk.map((field) => (
                    <FieldControl key={field.key} field={field} values={values} onChange={(v) => onField(field.key, v)} />
                  ))}
                </div>
              </div>
            )}

            {params.length > 0 && (
              <div className="sr-section">
                <div className="trade-section-label">Params</div>
                <div className={`sr-fields ${params.length === 1 ? "sr-fields-1" : "sr-fields-2"}`}>
                  {params.map((field) => (
                    <FieldControl key={field.key} field={field} values={values} onChange={(v) => onField(field.key, v)} />
                  ))}
                </div>
              </div>
            )}

            {advanced.length > 0 && (
              <div className="sr-section">
                <button
                  type="button"
                  className="trade-btn trade-btn-ghost trade-size-sm w-full justify-between"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                >
                  <span>Advanced</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
                {showAdvanced && (
                  <div className="sr-fields sr-fields-2 sr-fields-advanced">
                    {advanced.map((field) => (
                      <FieldControl key={field.key} field={field} values={values} onChange={(v) => onField(field.key, v)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="sr-actions">
              <button
                type="button"
                className="trade-btn trade-btn-primary trade-btn-lg w-full sr-cta"
                disabled={Boolean(def.autoTrade && paperActive)}
                onClick={() => {
                  setDeployMode("paper");
                  setLiveConfirm(false);
                  setDeploySuccess(false);
                  setDeployError(null);
                  setDeployNote(null);
                  setDeployModalOpen(true);
                }}
              >
                {def.autoTrade ? <Server className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}
                {def.autoTrade
                  ? paperActive
                    ? "Bot running"
                    : "Deploy bot"
                  : isPaperActive
                  ? "Paper active · Re-deploy"
                  : "Deploy to paper"}
              </button>

              {def.backtestable !== false && (
                <button
                  type="button"
                  disabled={btRunning}
                  className="trade-btn trade-btn-ghost trade-btn-lg w-full"
                  onClick={() => void handleBacktest()}
                >
                  <FlaskConical className="w-4 h-4" />
                  {btRunning ? "Running backtest…" : "Run backtest"}
                </button>
              )}
              {btProgress && (
                <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>{btProgress}</p>
              )}
            </div>

            {btError && (
              <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                <AlertCircle className="w-4 h-4 mt-px flex-none" />
                {btError}
              </p>
            )}
          </div>
        </aside>

        {def.autoTrade && (
          <section className="trade-panel sr-bot">
            <div className="trade-panel-head">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="trade-panel-title">Server bot</span>
                {serverBot && (
                  <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                    #{serverBot.id} · {symbolLabel(serverBot.symbol)} · {shortInterval(serverBot.timeframe)}
                  </span>
                )}
              </div>
              {serverBot ? (
                <div className="flex items-center gap-2">
                  <span className={`trade-badge ${serverBot.mode === "live" ? "trade-badge-red" : "trade-badge-blue"}`}>
                    {serverBot.mode === "live" ? "LIVE" : "PAPER"}
                  </span>
                  {serverBot.status === "running" ? (
                    <span className="trade-badge trade-badge-green">
                      <span className="trade-dot" />
                      Running
                    </span>
                  ) : (
                    <span className="trade-badge trade-badge-amber">Paused</span>
                  )}
                </div>
              ) : (
                <span className="trade-badge trade-badge-neutral">Off</span>
              )}
            </div>

            <div className="trade-panel-body space-y-3">
              {!botWorkerRunning && (
                <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--amber)" }}>
                  <AlertTriangle className="w-4 h-4 mt-px flex-none" />
                  Bot worker is offline (BOT_WORKER=0 or serverless) — it will not trade.
                </p>
              )}

              {!token ? (
                <div className="trade-empty">
                  <span className="trade-empty-icon"><Server className="w-4 h-4" /></span>
                  Log in to deploy.
                </div>
              ) : !serverBot ? (
                <div className="trade-empty">
                  <span className="trade-empty-icon"><Server className="w-4 h-4" /></span>
                  No bot running.
                </div>
              ) : (
                <>
                  <div className={`grid grid-cols-2 gap-2 xl:grid-cols-2 ${serverBot.params.tp1_r ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
                    <div className="trade-stat">
                      <div className="trade-stat-label">Trade</div>
                      <div className="trade-stat-value" style={{ color: botTradeLabel(serverBot).color ?? "var(--text-primary)" }}>
                        {botTradeLabel(serverBot).text}
                      </div>
                    </div>
                    <div className="trade-stat">
                      <div className="trade-stat-label">Entry</div>
                      <div className="trade-stat-value">
                        {serverBot.trade_state === "open" ? fmtPx(serverBot.entry_price) : "—"}
                      </div>
                    </div>
                    <div className="trade-stat">
                      <div className="trade-stat-label">Stop</div>
                      <div className="trade-stat-value" style={{ color: "#f59e0b" }}>
                        {serverBot.trade_state === "open" ? fmtPx(serverBot.stop_loss) : "—"}
                      </div>
                    </div>
                    <div className="trade-stat">
                      <div className="trade-stat-label">Size</div>
                      <div className="trade-stat-value">
                        {serverBot.trade_state === "open" && serverBot.quantity != null ? serverBot.quantity.toFixed(6) : "—"}
                      </div>
                    </div>
                    {serverBot.params.tp1_r ? (
                      <div className="trade-stat">
                        <div className="trade-stat-label">
                          First profit · {Math.round(Number(serverBot.params.tp1_frac ?? 0.25) * 100)}%
                        </div>
                        <div className="trade-stat-value" style={{ color: "#0ea5e9" }}>
                          {serverBot.trade_state !== "open"
                            ? "—"
                            : serverBot.tp1_done
                              ? "Booked ✓"
                              : fmtPx(serverBot.tp1_price)}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                    ${serverBot.capital.toLocaleString("en-US")} · {serverBot.risk_pct}% risk/trade · deployed{" "}
                    {fmtDay(Date.parse(serverBot.started_at))}
                    {serverBot.last_run_at ? ` · last check ${fmtDay(Date.parse(serverBot.last_run_at))}` : " · first check on next closed candle"}
                    {serverBot.entry_time != null && serverBot.trade_state === "open"
                      ? ` · entry ${fmtDay(serverBot.entry_time)}`
                      : ""}
                  </p>

                  {serverBot.last_error && (
                    <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                      <AlertCircle className="w-4 h-4 mt-px flex-none" />
                      {serverBot.last_error}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {serverBot.status === "running" ? (
                      <button
                        type="button"
                        disabled={botBusy}
                        className="trade-btn trade-btn-ghost trade-size-sm"
                        title="No new entries; open trade keeps trailing and exiting"
                        onClick={() => void botAction(() => setStrategyBotStatus(token, serverBot.id, "pause"), "Server bot pause")}
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={botBusy}
                        className="trade-btn trade-btn-ghost trade-size-sm"
                        onClick={() => void botAction(() => setStrategyBotStatus(token, serverBot.id, "resume"), "Server bot resume")}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={botBusy}
                      className="trade-btn trade-btn-ghost trade-size-sm"
                      style={{ color: "var(--red)" }}
                      onClick={() => stopBot(true)}
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop & flatten
                    </button>
                    {serverBot.trade_state === "open" && (
                      <button
                        type="button"
                        disabled={botBusy}
                        className="trade-btn trade-btn-ghost trade-size-sm"
                        title="Stop the bot but leave the position and stop-loss"
                        onClick={() => stopBot(false)}
                      >
                        Stop · keep position
                      </button>
                    )}
                  </div>

                  {serverBot.events.length > 0 && (
                    <div className="trade-console">
                      {serverBot.events.map((event) => (
                        <div key={`${event.at}-${event.text}`}>
                          <span className="trade-console-time">{fmtDay(Date.parse(event.at))}</span>
                          {event.text}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {strategyBots.length > 1 && (
                <div className="space-y-1.5">
                  <div className="trade-section-label">All bots for this strategy</div>
                  {strategyBots.map((b) => {
                    const label = botTradeLabel(b);
                    const here = b.symbol === symbol.toUpperCase();
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setValue("symbol", b.symbol)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12px] tnum"
                        style={{ borderColor: here ? "var(--text-muted)" : "var(--border-subtle)" }}
                        title="View this coin’s bot"
                      >
                        <span className="font-semibold">{symbolLabel(b.symbol)}</span>
                        <span style={{ color: label.color ?? "var(--text-secondary)" }}>{label.text}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {b.trade_state === "open" ? `stop ${fmtPx(b.stop_loss)}` : b.status === "paused" ? "paused" : `$${b.capital.toLocaleString("en-US")}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {botError && (
                <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                  <AlertCircle className="w-4 h-4 mt-px flex-none" />
                  {botError}
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── Live monitor + results ────────────────────────── */}
      <div className="sr-main min-w-0">
        {def.presets && <PresetPicker presets={def.presets} active={activePreset} onSelect={applyPreset} />}

        <StrategyOverview def={def} values={settledValues} />

        <section className="trade-panel sr-signal" data-tone={signal.tone}>
          <div className="trade-panel-head">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="trade-panel-title">Live signal</span>
              <span className="text-[11.5px] tnum truncate" style={{ color: "var(--text-muted)" }}>
                {symbolLabel(symbol)} · {shortInterval(timeframe)}
              </span>
              <span
                className={`trade-badge ${
                  signal.tone === "buy"
                    ? "trade-badge-green"
                    : signal.tone === "sell"
                      ? "trade-badge-red"
                      : "trade-badge-neutral"
                }`}
              >
                {signal.tone === "buy" ? "Long" : signal.tone === "sell" ? "Short" : "Flat"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-none">
              {updatedAt && (
                <span className="hidden sm:block text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                  {updatedAt}
                </span>
              )}
              <button
                type="button"
                onClick={() => void loadCandles()}
                disabled={loading}
                className="trade-btn trade-btn-ghost trade-size-sm"
                aria-label="Refresh signal"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
                <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
              </button>
            </div>
          </div>

          <div className="trade-panel-body space-y-3">
            <div className="sr-signal-head">
              <p className="sr-signal-headline" style={{ color: toneColor(signal.tone) }}>
                {signal.headline}
              </p>
              {signal.detail && (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="sr-why"
                    onClick={() => setShowWhy((v) => !v)}
                    aria-expanded={showWhy}
                  >
                    {showWhy ? "Hide Why?" : "Why?"}
                  </button>
                  {showWhy && (
                    <pre
                      className="sr-signal-detail whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {signal.detail}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {signal.readouts.length > 0 && (
              <div className="sr-reads">
                {signal.readouts.slice(0, 28).map((readout) => (
                  <div key={readout.label} className="trade-stat sr-read">
                    <div className="trade-stat-label">{readout.label}</div>
                    <div className="trade-stat-value" style={{ color: readout.color ?? "var(--text-primary)" }}>
                      {readout.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(def.autoTrade || analysis.autoTrade) && (
              <div className="sr-signal-foot tnum">
                <span>
                  Risk{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {num(settledValues, "risk_pct", 1)}% of ${num(settledValues, "capital", 1000).toLocaleString("en-US")}
                  </span>
                </span>
                <span>·</span>
                <span>
                  Execution{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {serverBot?.trade_state === "open"
                      ? `Filled · ${serverBot.side || "pos"} @ ${fmtPx(serverBot.entry_price)}`
                      : serverBot?.trade_state === "entering"
                        ? "Order Submitted"
                        : serverBot?.status === "running" && analysis.autoTrade?.desired
                          ? "Watching · next candle fill"
                          : analysis.autoTrade?.desired
                            ? `Chart ${signal.entry ? "Awaiting Trigger" : "Triggered"} · not exchange fill`
                            : "No bot fill"}
                  </span>
                </span>
                <span>·</span>
                <span style={{ color: "var(--text-muted)" }}>
                  Entry status ≠ exchange position unless Bot panel shows Filled
                </span>
              </div>
            )}

            {liveError && (
              <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                <AlertCircle className="w-4 h-4 mt-px flex-none" />
                {liveError}
              </p>
            )}
          </div>
        </section>

        {def.autoTrade && (
          <section className="trade-panel">
            <div className="trade-panel-head">
              <span className="trade-panel-title">Paper forward test</span>
              <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                Live book · not the hypothetical backtest
              </span>
            </div>
            <div className="trade-panel-body space-y-3">
              {!token ? (
                <div className="trade-empty">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Not Started</p>
                  <p className="text-[12.5px] max-w-[360px]" style={{ color: "var(--text-muted)" }}>
                    Log in and deploy a paper bot to begin forward testing. Hypothetical backtest numbers above are not paper results.
                  </p>
                </div>
              ) : paperError && !paperAccount ? (
                <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{paperError}</p>
              ) : !paperAccount || !paperScoped ? (
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Loading paper account…</p>
              ) : !strategyBots.length && paperScoped.positions.length === 0 && paperAccount.stats.closed_trades === 0 ? (
                <div className="trade-empty">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>No Data · Not Started</p>
                  <p className="text-[12.5px] max-w-[400px]" style={{ color: "var(--text-muted)" }}>
                    No paper bots or fills for this strategy yet. Deploy a paper bot, then this panel will show start date, simulated fills, net P&amp;L, drawdown, fees/funding and backtest vs forward differences.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="trade-kpi">
                      <p className="trade-stat-label">Paper equity</p>
                      <p className="trade-kpi-value">${paperAccount.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                      <p className="trade-kpi-sub tnum">
                        start ${paperAccount.start_balance.toLocaleString("en-US", { maximumFractionDigits: 0 })} ·{" "}
                        <span style={{ color: paperAccount.return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                          {paperAccount.return_pct >= 0 ? "+" : ""}
                          {paperAccount.return_pct.toFixed(2)}%
                        </span>
                      </p>
                    </div>
                    <div className="trade-kpi">
                      <p className="trade-stat-label">Account WR</p>
                      <p className="trade-kpi-value">
                        {paperAccount.stats.win_rate == null ? "—" : `${paperAccount.stats.win_rate.toFixed(1)}%`}
                      </p>
                      <p className="trade-kpi-sub tnum">
                        {paperAccount.stats.wins}W / {paperAccount.stats.losses}L · {paperAccount.stats.closed_trades} closed (all paper)
                      </p>
                    </div>
                    <div className="trade-kpi">
                      <p className="trade-stat-label">This strategy coins</p>
                      <p className="trade-kpi-value">
                        {paperScoped.positions.length} open
                      </p>
                      <p className="trade-kpi-sub tnum">
                        {paperScoped.openLong}L / {paperScoped.openShort}S · unrealized{" "}
                        <span style={{ color: paperScoped.unrealized >= 0 ? "var(--green)" : "var(--red)" }}>
                          {paperScoped.unrealized >= 0 ? "+" : ""}
                          {paperScoped.unrealized.toFixed(2)} $
                        </span>
                      </p>
                    </div>
                    <div className="trade-kpi">
                      <p className="trade-stat-label">Bot execution</p>
                      <p className="trade-kpi-value">{strategyBots.length ? `${strategyBots.length} bot(s)` : "Off"}</p>
                      <p className="trade-kpi-sub tnum">
                        {strategyBots[0]?.started_at
                          ? `started ${fmtDay(Date.parse(strategyBots[0].started_at))}`
                          : paperScoped.botsOpen.length
                            ? `${paperScoped.botsOpen.length} position open/entering`
                            : "No bot position · chart signal ≠ fill"}
                      </p>
                    </div>
                  </div>

                  {paperScoped.positions.length > 0 ? (
                    <div className="overflow-auto">
                      <table className="trade-table">
                        <thead>
                          <tr>
                            <th>Coin</th>
                            <th>Side</th>
                            <th className="trade-num">Entry</th>
                            <th className="trade-num">Mark</th>
                            <th className="trade-num">Notional</th>
                            <th className="trade-num">Margin</th>
                            <th className="trade-num">uP&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paperScoped.positions.map((p) => (
                            <tr key={`${p.symbol}-${p.side}-${p.opened_at}`}>
                              <td className="font-semibold">{symbolLabel(p.symbol)}</td>
                              <td>
                                <span className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}>
                                  {p.side.toUpperCase()}
                                </span>
                              </td>
                              <td className="trade-num">{p.entry_price.toFixed(2)}</td>
                              <td className="trade-num">{p.mark_price != null ? p.mark_price.toFixed(2) : "—"}</td>
                              <td className="trade-num">${p.notional.toFixed(0)}</td>
                              <td className="trade-num">${p.margin.toFixed(0)}</td>
                              <td
                                className="trade-num font-bold"
                                style={{ color: (p.unrealized_pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}
                              >
                                {p.unrealized_pnl == null
                                  ? "—"
                                  : `${p.unrealized_pnl >= 0 ? "+" : ""}${p.unrealized_pnl.toFixed(2)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                        Notional ${paperScoped.notional.toFixed(0)} · margin ${paperScoped.margin.toFixed(0)} on{" "}
                        {strategySymbols.map((s) => symbolLabel(s)).join(" · ")}. Closed WR above is account-wide paper — not strategy-isolated.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      No open paper positions on {strategySymbols.map((s) => symbolLabel(s)).join(", ")}. Deploy a paper bot to forward-test fills.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        <section className="trade-panel sr-chart overflow-hidden">
          <div className="trade-panel-head">
            <span className="trade-panel-title">Chart</span>
            <div className="flex items-center gap-2 min-w-0">
              <div className="trade-seg overflow-x-auto scrollbar-hide max-w-full">
                {CHART_RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    className="trade-seg-btn"
                    data-active={chartDays === range.days}
                    onClick={() => setChartDays(range.days)}
                    title={`Last ${range.days} days`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] tnum flex-none" style={{ color: "var(--text-muted)" }}>
                {candles.length ? `${candles.length} bars` : "—"}
                {clamped ? ` · max ~${maxDays.toFixed(0)}d` : ""}
              </span>
            </div>
          </div>
          <div className="trade-chart-wrap">
            {loading && candles.length === 0 ? (
              <div className="w-full h-full shimmer" />
            ) : (
              <CandleChart
                candles={analysis.candles}
                symbol={symbolLabel(symbol)}
                interval={shortInterval(timeframe)}
                viewKey={`${symbol}|${timeframe}|${chartDays}`}
                overlays={overlays.map((o) => ({ key: o.key, color: o.color }))}
              />
            )}
          </div>
        </section>

        {logs.length > 0 && (
          <section className="trade-panel">
            <div className="trade-panel-head">
              <span className="trade-panel-title">Events</span>
            </div>
            <div className="trade-panel-body">
              <div className="trade-console">
                {logs.slice(0, 12).map((line) => {
                  const [time, ...rest] = line.split("  ");
                  return (
                    <div key={line}>
                      <span className="trade-console-time">{time}</span>
                      {rest.join("  ")}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {def.optionChain && <OptionChainPanel def={def} values={settledValues} tone={signal.tone} />}
        {def.optionSpread && <SpreadPanel def={def} values={settledValues} tone={signal.tone} />}
        {def.optionCondor && <CondorPanel def={def} values={settledValues} />}

        {def.backtestable !== false && (btRunning || btResult) && (
          <BacktestResults
            running={btRunning}
            result={btResult}
            fallbackSymbol={symbol}
            fallbackTimeframe={timeframe}
            emptyHint={<>Run a backtest from Setup.</>}
          />
        )}

        {def.id === "avpt-pullback" && (
          <section className="trade-panel">
            <div className="trade-panel-head">
              <span className="trade-panel-title">Risk disclosure</span>
              <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                Required before deployment
              </span>
            </div>
            <div className="trade-panel-body space-y-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>Historical results are not a guarantee of future performance.</li>
                <li>Backtest results are hypothetical simulations — not paper or live fills.</li>
                <li>Actual fills, fees, spreads and slippage can differ from assumptions.</li>
                <li>Crypto perpetuals involve leverage and liquidation risk; funding rates change.</li>
                <li>Losing streaks can exceed what this sample shows.</li>
                <li>Exchange outages or API failures can affect execution.</li>
                <li>Bot OFF does not automatically close exchange positions — verify separately.</li>
                <li>Deploy only with capital and risk limits you understand and can afford to lose.</li>
              </ul>
              <p className="text-[11.5px] pt-1" style={{ color: "var(--text-muted)" }}>
                Displaying this notice is not a substitute for legal or regulatory compliance review.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* ── Deploy Modal (paper / live) ─────────────────────────── */}
      {deployModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="trade-panel max-w-lg w-full p-6 space-y-4 relative border shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              className="absolute top-4 right-4 trade-iconbtn"
              onClick={() => {
                setDeployModalOpen(false);
                setDeploySuccess(false);
                setDeployError(null);
                setLiveConfirm(false);
              }}
            >
              <X className="w-4 h-4" />
            </button>

            {deploySuccess ? (
              <div className="text-center py-4 space-y-3">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                    def.autoTrade && deployMode === "live"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <h3
                  className={`text-xl font-bold ${
                    def.autoTrade && deployMode === "live" ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {def.autoTrade && deployMode === "live" ? "Live bot deployed" : "Deployed"}
                </h3>
                <p className="text-[13px] max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                  {def.autoTrade ? (
                    <>
                      {deployNote && (
                        <span className="block mb-2 font-semibold" style={{ color: "var(--text-secondary)" }}>{deployNote}</span>
                      )}
                      <b>{def.name}</b> is running on the server
                      {deployMode === "live" ? " with real Delta orders" : " in paper mode"}.
                      {" "}No order yet — entry + stop on the next signal. Status is in the Server bot panel.
                    </>
                  ) : (
                    <>
                      <b>{def.name}</b> is on Paper Desk. Paper trades run when entry/exit conditions hit.
                    </>
                  )}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                  <button
                    type="button"
                    className="trade-btn trade-btn-primary"
                    onClick={() => {
                      setDeployModalOpen(false);
                      router.push(deployMode === "live" ? "/trade?tab=exchanges" : "/trade?tab=trades");
                    }}
                  >
                    {deployMode === "live" ? <Server className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}
                    {deployMode === "live" ? "Open Exchanges" : "Open Paper Trading Desk"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost"
                    onClick={() => {
                      setDeployModalOpen(false);
                      setDeploySuccess(false);
                      setLiveConfirm(false);
                    }}
                  >
                    Stay here
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-none ${
                      deployMode === "live" && def.autoTrade
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {deployMode === "live" && def.autoTrade ? <Server className="w-5 h-5" /> : <FlaskConical className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold">Deploy {def.name}</h3>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {def.autoTrade
                        ? deployMode === "live"
                          ? "Live · real Delta orders on signal"
                          : "Paper · simulated fills, zero real risk"
                        : "Paper trading · live prices, zero real risk"}
                    </p>
                  </div>
                </div>

                {deployError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 text-[12px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-none" />
                    {deployError}
                  </div>
                )}

                {def.autoTrade && (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["paper", "Paper", "Simulated · no real money"],
                      ["live", "Live", "Real orders on Delta"],
                    ] as const).map(([mode, title, hint]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={deployMode === mode}
                        onClick={() => {
                          setDeployMode(mode);
                          setLiveConfirm(false);
                          setDeployError(null);
                        }}
                        className="text-left rounded-xl border p-3 transition-colors"
                        style={{
                          borderColor:
                            deployMode === mode
                              ? mode === "live"
                                ? "#f43f5e"
                                : "#10b981"
                              : "var(--border-subtle)",
                          background:
                            deployMode === mode
                              ? mode === "live"
                                ? "rgba(244,63,94,0.08)"
                                : "rgba(16,185,129,0.08)"
                              : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div className="text-[12.5px] font-bold">{title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>
                      </button>
                    ))}
                  </div>
                )}

                {def.autoTrade && (def.portfolio?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["portfolio", "Portfolio · BTC + ETH + SOL", "One bot per coin · capital ÷ 3"],
                      ["single", `Only ${symbolLabel(symbol)}`, "Full capital on one coin"],
                    ] as const).map(([scope, title, hint]) => (
                      <button
                        key={scope}
                        type="button"
                        aria-pressed={deployScope === scope}
                        onClick={() => setDeployScope(scope)}
                        className="text-left rounded-xl border p-3 transition-colors"
                        style={{
                          borderColor: deployScope === scope ? "#10b981" : "var(--border-subtle)",
                          background: deployScope === scope ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div className="text-[12.5px] font-bold">{title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>
                      </button>
                    ))}
                  </div>
                )}

                {def.autoTrade && deployMode === "live" && (
                  <div className="space-y-3">
                    {!liveOrdersEnabled && (
                      <div className="p-3 rounded-lg bg-amber-500/10 text-amber-300 text-[12px] flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
                        <span>
                          Server live orders are off (<code className="text-[11px]">LIVE_ORDERS_ENABLED</code>).
                          Turn it on on the VPS, then refresh.
                        </span>
                      </div>
                    )}

                    {exchangeAccounts.length === 0 ? (
                      <div className="p-3 rounded-lg bg-rose-500/10 text-rose-300 text-[12px] space-y-2">
                        <p className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
                          No active Delta account. Connect a trade-only key first.
                        </p>
                        <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-ghost trade-size-sm inline-flex">
                          Open Exchanges
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11.5px] font-bold block mb-1">Delta account</label>
                        <select
                          value={exchangeAccountId ?? ""}
                          onChange={(e) => setExchangeAccountId(e.target.value ? Number(e.target.value) : null)}
                          className="trade-input w-full text-[13px] py-1.5 px-3 rounded-lg"
                        >
                          {exchangeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label || `Delta #${a.id}`}
                              {a.key_hint ? ` · ${a.key_hint}` : ""}
                              {!a.live_trading_enabled ? " · live off" : ""}
                              {a.can_withdraw ? " · withdraw on" : ""}
                              {!a.can_trade ? " · no trade" : ""}
                            </option>
                          ))}
                        </select>
                        {selectedExchange && !liveAccountOk && (
                          <p className="text-[11.5px] mt-1.5 text-amber-300">
                            {!selectedExchange.live_trading_enabled
                              ? "Enable live trading for this account on Exchanges."
                              : !selectedExchange.can_trade
                              ? "Key needs trade permission."
                              : "Withdrawal must be off — use a trade-only key."}
                            {" "}
                            <Link href="/trade?tab=exchanges" className="underline">
                              Fix on Exchanges
                            </Link>
                          </p>
                        )}
                      </div>
                    )}

                    <label className="trade-checkrow">
                      <input
                        type="checkbox"
                        className="trade-check"
                        checked={liveConfirm}
                        onChange={(e) => setLiveConfirm(e.target.checked)}
                      />
                      I understand this bot will place real orders with real money.
                    </label>
                  </div>
                )}

                {def.autoTrade && (
                  <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] space-y-3">
                    <p className="text-[12.5px] font-bold">Deployment safety (enforced by bot worker)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                          Max daily loss %
                        </label>
                        <input
                          type="number"
                          min={0.5}
                          max={20}
                          step={0.5}
                          value={maxDailyLossPct}
                          onChange={(e) => setMaxDailyLossPct(Math.max(0.5, Number(e.target.value) || 3))}
                          className="trade-input w-full text-[13px] py-1.5 px-2 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                          Max losing streak
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={30}
                          step={1}
                          value={maxLosingStreak}
                          onChange={(e) => setMaxLosingStreak(Math.max(2, Math.round(Number(e.target.value) || 5)))}
                          className="trade-input w-full text-[13px] py-1.5 px-2 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                          Max positions
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={3}
                          step={1}
                          value={maxPositions}
                          onChange={(e) => setMaxPositions(Math.max(1, Math.min(3, Math.round(Number(e.target.value) || 1))))}
                          className="trade-input w-full text-[13px] py-1.5 px-2 rounded-lg"
                        />
                      </div>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Daily loss / streak pause new entries only. Emergency stop is per-bot — Bot OFF ≠ positions closed unless you choose Stop &amp; flatten.
                    </p>
                  </div>
                )}

                {/* Configuration Summary */}
                <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] space-y-2 text-[12.5px]">
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Strategy</span>
                    <span className="font-bold flex items-center gap-1.5">
                      {def.name}
                      <span className="trade-badge trade-badge-blue text-[10px]">{def.category}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Target Pair & Timeframe</span>
                    <span className="font-bold font-mono">
                      {portfolioDeploy ? "BTC + ETH + SOL" : symbolLabel(symbol)} · {timeframe}
                    </span>
                  </div>
                  {def.autoTrade ? (
                    <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                      <span style={{ color: "var(--text-muted)" }}>Capital & risk</span>
                      <span className="font-bold font-mono">
                        ${num(values, "capital", 1000).toLocaleString("en-US")}
                        {portfolioDeploy && ` (÷3 = $${(Math.floor((num(values, "capital", 1000) / 3) * 100) / 100).toLocaleString("en-US")} each)`}
                        {" "}· {num(values, "risk_pct", 1)}% / trade
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                      <span style={{ color: "var(--text-muted)" }}>Stop Loss & Target</span>
                      <span className="font-bold font-mono text-emerald-400">
                        Target: {num(values, "target_points", 800)} pts · <span className="text-rose-400">SL: {num(values, "sl_points", 400)} pts</span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1">
                    <span style={{ color: "var(--text-muted)" }}>Execution</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        deployMode === "live" && def.autoTrade ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {def.autoTrade
                        ? deployMode === "live"
                          ? "Live entry on signal · exchange stop"
                          : "Paper entry on signal · trailing stop"
                        : "Auto paper orders on signal"}
                    </span>
                  </div>
                </div>

                {/* Capital & Leverage inputs */}
                {!def.autoTrade && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11.5px] font-bold block mb-1">
                      Paper Capital ($ Allocation)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="100000"
                      step="100"
                      value={testCapital}
                      onChange={(e) => setTestCapital(Math.max(50, Number(e.target.value)))}
                      className="trade-input w-full text-[13px] py-1.5 px-3 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[11.5px] font-bold block mb-1">Leverage</label>
                    <select
                      value={testLeverage}
                      onChange={(e) => setTestLeverage(Number(e.target.value))}
                      className="trade-input w-full text-[13px] py-1.5 px-3 rounded-lg"
                    >
                      {[1, 2, 3, 5, 10, 15, 20, 25, 50].map((l) => (
                        <option key={l} value={l}>
                          {l}x Leverage
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost"
                    onClick={() => setDeployModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deploying || (def.autoTrade && liveDeployBlocked)}
                    className="trade-btn trade-btn-primary"
                    style={{
                      background:
                        deployMode === "live" && def.autoTrade
                          ? "#e11d48"
                          : "#059669",
                      borderColor: "transparent",
                      color: "#fff",
                      fontWeight: 700,
                      opacity: deploying || (def.autoTrade && liveDeployBlocked) ? 0.55 : 1,
                    }}
                    onClick={() => void handleDeployConfirm()}
                  >
                    {deploying ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : deployMode === "live" && def.autoTrade ? (
                      <Server className="w-4 h-4" />
                    ) : (
                      <FlaskConical className="w-4 h-4" />
                    )}
                    {def.autoTrade
                      ? deployMode === "live"
                        ? "Confirm & Deploy Live"
                        : "Confirm & Deploy Paper"
                      : "Confirm & Deploy to Paper"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Field control ─────────────────────────────────────── */

function FieldControl({
  field,
  values,
  onChange,
}: {
  field: StrategyField;
  values: StrategyValues;
  onChange: (value: StrategyValues[string]) => void;
}) {
  const id = `f-${field.key}`;

  if (field.kind === "toggle") {
    return (
      <label className="trade-checkrow sr-field-span" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="trade-check"
          checked={bool(values, field.key)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  const control =
    field.kind === "time" ? (
      <input id={id} type="time" className="trade-input" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)} />
    ) : field.kind === "select" ? (
      <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : field.kind === "symbol" ? (
      <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
        {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    ) : field.kind === "interval" ? (
      <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
        {CRYPTO_INTERVALS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    ) : (
      <input
        id={id}
        type="number"
        className="trade-input"
        min={field.min}
        max={field.max}
        step={field.step}
        value={num(values, field.key)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );

  return (
    <div className="sr-field">
      <label className="trade-label" htmlFor={id} title={field.label}>{field.label}</label>
      {control}
    </div>
  );
}
