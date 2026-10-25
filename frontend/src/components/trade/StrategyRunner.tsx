"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  FlaskConical,
  Info,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  X,
  Zap,
} from "lucide-react";
import BacktestResults from "@/components/trade/BacktestResults";
import OptionChainPanel from "@/components/trade/OptionChainPanel";
import SpreadPanel from "@/components/trade/SpreadPanel";
import CondorPanel from "@/components/trade/CondorPanel";
import { useAuth } from "@/context/AuthContext";
import {
  CHART_RANGES,
  CRYPTO_INTERVALS,
  MAX_CHART_CANDLES,
  CRYPTO_SYMBOLS,
  barsForDays,
  candlesSpanDays,
  deployStrategyBot,
  fetchCandles,
  fetchStrategyBots,
  maxDaysForInterval,
  placeDemoOrder,
  runBacktest,
  setStrategyBotStatus,
  stopStrategyBot,
  symbolLabel,
  type BacktestResult,
  type Candle,
  type StrategyBot,
  syncStamp,
} from "@/lib/cryptoApi";
import {
  bool,
  getStrategy,
  matchPreset,
  num,
  readActiveStrategies,
  str,
  strategyHref,
  TREND_RIDER_PORTFOLIO,
  visibleFields,
  writeActiveStrategy,
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
import { optionsKind, runOptionsBacktest } from "@/lib/optionsBacktest";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

interface Props {
  def: StrategyDef;
  initialValues: StrategyValues;
  /** Page header live badge dikha sake, isliye state upar bhejte hain. */
  onActiveChange?: (active: boolean) => void;
  /** Card ke Backtest button se aaye to page khulte hi backtest chalao. */
  autoBacktest?: boolean;
}

/** Live monitor kitni der mein refresh ho. */
const POLL_MS = 60_000;
/** Server bot ki haalat kitni der mein dobara padho — bot khud server par chalta hai, ye sirf dikhana hai. */
const BOT_POLL_MS = 30_000;

const GROUPS: { id: StrategyField["group"]; label: string }[] = [
  { id: "signal", label: "Signal parameters" },
  { id: "risk", label: "Execution & risk" },
  { id: "backtest", label: "Backtest window" },
];

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

/** Bot ka abhi ka trade ek line mein. */
function botTradeLabel(bot: StrategyBot): { text: string; color?: string } {
  const side = bot.side === "long" ? "LONG" : bot.side === "short" ? "SHORT" : "";
  const color = bot.side === "long" ? "var(--green)" : bot.side === "short" ? "var(--red)" : undefined;
  switch (bot.trade_state) {
    case "open":
      return { text: `${side} chalu`, color };
    case "entering":
      return { text: `${side} entry lag rahi hai`, color };
    case "closed":
      return { text: "Flat — pichhla trade band" };
    case "skipped":
      return { text: "Flat — pichhla signal chhoda" };
    default:
      return { text: "Flat — signal ka intezaar" };
  }
}

export default function StrategyRunner({ def, initialValues, onActiveChange, autoBacktest }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<StrategyValues>(initialValues);
  /**
   * Bhaari kaam (indicators + 4000-bar chart redraw + option chain fetch) har
   * keystroke par chalta tha, jisse number fields mein type karna atakta tha.
   * Inputs `values` par turant chalte hain; analysis typing rukne ke baad.
   */
  const [settledValues, setSettledValues] = useState<StrategyValues>(initialValues);
  const [active, setActive] = useState(false);

  // Chart kitne din pehle tak dikhaye — default backtest window ke barabar.
  const [chartDays, setChartDays] = useState(() => num(initialValues, "days", 30));
  const [candles, setCandles] = useState<Candle[]>([]);
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
  /** Preset wali strategies ek click mein teeno coins par bot laga sakti hain. */
  const [deployScope, setDeployScope] = useState<"portfolio" | "single">("portfolio");
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

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
      setDeployModalOpen(true);
    }
  }, [searchParams]);

  const symbol = str(values, "symbol", "BTCUSDT");
  const timeframe = str(values, "timeframe", "1h");

  // Parent har render par naya callback de sakta hai — ref se effect deps stable rehti hain.
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

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
          setBotError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setBotError(err instanceof Error ? err.message : "Bot ki haalat nahi mili");
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
    if (flatten && open && !window.confirm("Bot stop karke khuli position abhi market par band karein?")) return;
    void botAction(
      () => stopStrategyBot(token, serverBot.id, flatten),
      flatten ? "Server bot stop — position band" : "Server bot stop — position aur stop waise hi chhode",
    );
  };

  /* ── Live data ───────────────────────────────────────── */

  const loadCandles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCandles({
        symbol,
        interval: timeframe,
        limit: Math.max(barsForDays(chartDays, timeframe), Math.min(def.minHistoryBars ?? 0, MAX_CHART_CANDLES)),
      });
      if (!res.success) throw new Error(res.error || "Candle data nahi mili");
      setCandles(res.candles ?? []);
      setLiveError(null);
      setUpdatedAt(syncStamp());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Crypto backend connect nahi ho raha";
      setLiveError(message);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, chartDays, def.minHistoryBars]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  // Activate hone par hi auto-refresh chalta hai — warna page ek baar load karke chup rehta hai.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void loadCandles(), POLL_MS);
    return () => window.clearInterval(id);
  }, [active, loadCandles]);

  /* ── Analysis ────────────────────────────────────────── */

  useEffect(() => {
    const id = window.setTimeout(() => setSettledValues(values), 250);
    return () => window.clearTimeout(id);
  }, [values]);

  const analysis = useMemo(() => def.analyze(candles, settledValues), [def, candles, settledValues]);
  const { signal, overlays } = analysis;

  // Signal badalne par hi log likho, har poll par nahi.
  const lastHeadline = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !candles.length) return;
    if (lastHeadline.current === signal.headline) return;
    lastHeadline.current = signal.headline;
    log(signal.headline);
  }, [active, candles.length, signal.headline, log]);

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

  const activate = () => {
    setActive(true);
    onActiveChangeRef.current?.(true);
    writeActiveStrategy(def.id, true);
    lastHeadline.current = null;
    log(`Live monitor ON — ${symbolLabel(symbol)} · ${timeframe}`);
    syncUrl();
    void loadCandles();
  };

  const deactivate = () => {
    setActive(false);
    onActiveChangeRef.current?.(false);
    writeActiveStrategy(def.id, false);
    log("Live monitor OFF");
  };

  /**
   * autoTrade strategy ka bot server par chalta hai — har band candle par backend worker
   * strategy ko paper account se milata hai, browser band ho tab bhi. Order deploy par nahi,
   * agle signal par lagta hai.
   */
  const portfolioDeploy = Boolean(def.autoTrade && def.presets) && deployScope === "portfolio";

  const deployServerBot = async (botSymbol = symbol, capital = num(values, "capital", 1000)) => {
    if (!token) throw new Error("Bot deploy karne ke liye pehle login karo");
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
      mode: "paper",
    });
    syncUrl();
    refreshBots();
    log(`Server bot deploy — ${symbolLabel(botSymbol)} · ${timeframe} (bot #${res.data.id})`);
  };

  /**
   * BTC + ETH + SOL — capital teeno mein barabar, jaise portfolio backtest. Jis coin par bot
   * pehle se chal raha ho use chhod kar baaki lagao, aur saaf batao kya hua.
   */
  const deployPortfolioBots = async () => {
    const share = Math.floor((num(values, "capital", 1000) / TREND_RIDER_PORTFOLIO.length) * 100) / 100;
    const done: string[] = [];
    const failed: string[] = [];
    for (const sym of TREND_RIDER_PORTFOLIO) {
      try {
        await deployServerBot(sym, share);
        done.push(symbolLabel(sym));
      } catch (err) {
        failed.push(`${symbolLabel(sym)}: ${err instanceof Error ? err.message : "deploy nahi hua"}`);
      }
    }
    if (!done.length) throw new Error(failed.join(" · "));
    setDeployNote(
      `${done.length} bot chalu (${done.join(", ")}) — har coin par $${share.toLocaleString("en-US")}.` +
        (failed.length ? ` Nahi lage: ${failed.join(" · ")}` : ""),
    );
  };

  const handleDeployToPaper = async () => {
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

      if (!deployed) throw new Error("Strategy save nahi ho saki");

      activate();
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
      setDeployError(err instanceof Error ? err.message : "Paper deployment fail ho gaya");
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
        : await runBacktest(def.toBacktest(values));
      if (!res.success) throw new Error(res.error || "Backtest fail");
      setBtResult(res);
      log(`Backtest done — ${res.total_trades ?? 0} trades, win rate ${res.win_rate ?? 0}%`);
    } catch (err) {
      setBtError(err instanceof Error ? err.message : "Backtest fail ho gaya");
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

  // Mount ke baad pichhli activation restore karo — localStorage sirf client par hai,
  // isliye ye effect mein hota hai, useState initialiser mein nahi (hydration mismatch).
  useEffect(() => {
    const isActive = readActiveStrategies()[def.id] === true;
    setActive(isActive);
    onActiveChangeRef.current?.(isActive);
  }, [def.id]);

  // "Kitne din pehle tak" — request kiya hua window aur asli coverage dono dikhate hain.
  const backtestDays = num(values, "days", 30);
  const maxDays = maxDaysForInterval(timeframe);
  const clamped = chartDays > maxDays;
  const spanDays = candlesSpanDays(candles);
  const coverage = candles.length
    ? `${fmtDay(candles[0].time)} → ${fmtDay(candles[candles.length - 1].time)} · ${spanDays.toFixed(1)} din · ${candles.length} candles`
    : "—";

  const fields = visibleFields(def, values);
  const grouped = GROUPS.map((group) => ({
    ...group,
    items: fields.filter((f) => f.group === group.id),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,370px)_minmax(0,1fr)] items-start">
      {/* ── Config rail ───────────────────────────────────── */}
      <div className="trade-panel trade-sticky-rail">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Parameters</span>
          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            onClick={() => setValues({ ...def.defaults })}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        <div className="trade-panel-body space-y-5">
          {grouped.map((group) => (
            <section key={group.id}>
              <div className="trade-section-label">{group.label}</div>
              <div className="grid grid-cols-2 gap-3">
                {group.items.map((field) => (
                  <FieldControl
                    key={field.key}
                    field={field}
                    values={values}
                    onChange={(value) => setValue(field.key, value)}
                  />
                ))}
              </div>
            </section>
          ))}

          <div className="space-y-2">
            <button
              type="button"
              className="trade-btn trade-btn-primary trade-btn-lg w-full"
              style={{
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                borderColor: "transparent",
                color: "#fff",
                fontWeight: 700,
              }}
              disabled={Boolean(def.autoTrade && paperActive)}
              onClick={() => setDeployModalOpen(true)}
            >
              {def.autoTrade ? <Server className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}
              {def.autoTrade
                ? paperActive
                  ? "Server bot chal raha hai"
                  : "Deploy paper bot"
                : isPaperActive
                ? "Paper Active · Re-Deploy"
                : "Deploy to Paper Trading"}
            </button>

            {active ? (
              <button type="button" className="trade-btn trade-btn-ghost trade-btn-lg w-full" onClick={deactivate}>
                <Power className="w-4 h-4" />
                Deactivate live monitor
              </button>
            ) : (
              <button type="button" className="trade-btn trade-btn-ghost trade-btn-lg w-full" onClick={activate}>
                <Play className="w-4 h-4" />
                Activate live monitor
              </button>
            )}
            {def.backtestable !== false && (
              <button
                type="button"
                disabled={btRunning}
                className="trade-btn trade-btn-ghost trade-btn-lg w-full"
                onClick={() => void handleBacktest()}
              >
                {btRunning ? "Backtest chal raha hai…" : "Run backtest"}
              </button>
            )}
            {btProgress && (
              <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>{btProgress}</p>
            )}
          </div>

          {def.engineNote && (
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              <Info className="w-3.5 h-3.5 mt-px flex-none" />
              {def.engineNote}
            </p>
          )}

          {btError && (
            <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
              <AlertCircle className="w-4 h-4 mt-px flex-none" />
              {btError}
            </p>
          )}
        </div>
      </div>

      {/* ── Live monitor + results ────────────────────────── */}
      <div className="space-y-4 min-w-0">
        {def.presets && <PresetPicker presets={def.presets} active={activePreset} onSelect={applyPreset} />}
        <section className="trade-panel overflow-hidden">
          <div className="trade-panel-head">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="trade-panel-title">Live signal</span>
              <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                {symbolLabel(symbol)} · {shortInterval(timeframe)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {updatedAt && (
                <span className="hidden sm:block text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                  Updated {updatedAt}
                </span>
              )}
              <button
                type="button"
                onClick={() => void loadCandles()}
                disabled={loading}
                className="trade-btn trade-btn-ghost trade-size-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
                <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
              </button>
              {active ? (
                <span className="trade-badge trade-badge-green">
                  <span className="trade-dot" />
                  Streaming
                </span>
              ) : (
                <span className="trade-badge trade-badge-neutral">Idle</span>
              )}
            </div>
          </div>

          <div className="trade-panel-body space-y-4">
            <div className="rounded-xl px-4 py-3.5" style={{ background: "var(--tr-field)", border: "1px solid var(--tr-line)" }}>
              <div className="trade-stat-label">Current read</div>
              <p className="text-[16px] font-bold mt-1 leading-snug" style={{ color: toneColor(signal.tone) }}>
                {signal.headline}
              </p>
              {signal.detail && (
                <p className="text-[12.5px] mt-1" style={{ color: "var(--text-secondary)" }}>{signal.detail}</p>
              )}
            </div>

            {signal.readouts.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {signal.readouts.map((readout) => (
                  <div key={readout.label} className="trade-stat">
                    <div className="trade-stat-label">{readout.label}</div>
                    <div className="trade-stat-value" style={{ color: readout.color ?? "var(--text-primary)" }}>
                      {readout.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {liveError && (
              <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                <AlertCircle className="w-4 h-4 mt-px flex-none" />
                {liveError}
              </p>
            )}
          </div>

          <div className="px-4 pb-3 space-y-2" style={{ borderTop: "1px solid var(--tr-line-soft)", paddingTop: 12 }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="trade-stat-label">Chart history</span>
              <div className="trade-seg overflow-x-auto scrollbar-hide max-w-full">
                {CHART_RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    className="trade-seg-btn"
                    data-active={chartDays === range.days}
                    onClick={() => setChartDays(range.days)}
                    title={`${range.days} din pehle tak`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              {chartDays !== backtestDays && (
                <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => setChartDays(backtestDays)}>
                  Backtest window · {backtestDays}d
                </button>
              )}
              <div className="flex-1" />
              {overlays.map((overlay) => (
                <span key={overlay.key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  <span className="trade-chip-dot" style={{ background: overlay.color, opacity: 1 }} />
                  {overlay.label}
                </span>
              ))}
            </div>
            <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>{coverage}</p>
            {clamped && (
              <p className="text-[11.5px]" style={{ color: "var(--amber)" }}>
                {shortInterval(timeframe)} par ek request mein zyada se zyada ~{maxDays.toFixed(maxDays < 10 ? 1 : 0)} din aate hain — utna hi dikh raha hai. Peeche tak dekhna ho to bada timeframe chuno.
              </p>
            )}
          </div>

          <div className="trade-chart-wrap">
            {loading && candles.length === 0 ? (
              <div className="w-full h-full shimmer" />
            ) : (
              <CandleChart
                candles={analysis.candles}
                symbol={symbolLabel(symbol)}
                interval={shortInterval(timeframe)}
                overlays={overlays.map((o) => ({ key: o.key, color: o.color }))}
              />
            )}
          </div>
        </section>

        {def.autoTrade && (
          <section className="trade-panel">
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
                  Server par bot worker band hai (BOT_WORKER=0 ya serverless deploy) — bot abhi trade nahi karega.
                </p>
              )}

              {!token ? (
                <div className="trade-empty">
                  <span className="trade-empty-icon"><Server className="w-4 h-4" /></span>
                  Login karo — bot tumhare paper account par chalta hai.
                </div>
              ) : !serverBot ? (
                <div className="trade-empty">
                  <span className="trade-empty-icon"><Server className="w-4 h-4" /></span>
                  Koi bot nahi chal raha. Deploy karo — server har band candle par strategy chalayega, browser band ho tab bhi.
                </div>
              ) : (
                <>
                  <div className={serverBot.params.tp1_r ? "grid grid-cols-2 lg:grid-cols-5 gap-3" : "grid grid-cols-2 lg:grid-cols-4 gap-3"}>
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
                          Pehla profit · {Math.round(Number(serverBot.params.tp1_frac ?? 0.25) * 100)}%
                        </div>
                        <div className="trade-stat-value" style={{ color: "#0ea5e9" }}>
                          {serverBot.trade_state !== "open"
                            ? "—"
                            : serverBot.tp1_done
                              ? "Book ho gaya ✓"
                              : fmtPx(serverBot.tp1_price)}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                    ${serverBot.capital.toLocaleString("en-US")} · {serverBot.risk_pct}% risk/trade · deploy{" "}
                    {fmtDay(Date.parse(serverBot.started_at))}
                    {serverBot.last_run_at ? ` · aakhri check ${fmtDay(Date.parse(serverBot.last_run_at))}` : " · pehla check agli band candle par"}
                    {serverBot.entry_time != null && serverBot.trade_state === "open"
                      ? ` · entry candle ${fmtDay(serverBot.entry_time)}`
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
                        title="Naya trade nahi khulega; chalu trade ka stop trail aur exit chalta rahega"
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
                      Stop & position band
                    </button>
                    {serverBot.trade_state === "open" && (
                      <button
                        type="button"
                        disabled={botBusy}
                        className="trade-btn trade-btn-ghost trade-size-sm"
                        title="Bot band, par position aur uska stop-loss waise hi rahenge"
                        onClick={() => stopBot(false)}
                      >
                        Stop · position rehne do
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
                  <div className="trade-section-label">Is strategy ke saare bots</div>
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
                        title="Is coin ka bot detail dekho"
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

        <section className="trade-panel">
          <div className="trade-panel-head">
            <span className="trade-panel-title">Event log</span>
            <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {active ? `Har ${POLL_MS / 1000}s par refresh` : "Monitor band hai"}
            </span>
          </div>
          <div className="trade-panel-body">
            {logs.length === 0 ? (
              <div className="trade-empty">
                <span className="trade-empty-icon"><Activity className="w-4 h-4" /></span>
                Activate karo — signal change hote hi entries yahan aayengi.
              </div>
            ) : (
              <div className="trade-console">
                {logs.map((line) => {
                  const [time, ...rest] = line.split("  ");
                  return (
                    <div key={line}>
                      <span className="trade-console-time">{time}</span>
                      {rest.join("  ")}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {def.optionChain && <OptionChainPanel def={def} values={settledValues} tone={signal.tone} />}
        {def.optionSpread && <SpreadPanel def={def} values={settledValues} tone={signal.tone} />}
        {def.optionCondor && <CondorPanel def={def} values={settledValues} />}

        {def.backtestable !== false && (
          <BacktestResults
            running={btRunning}
            result={btResult}
            fallbackSymbol={symbol}
            fallbackTimeframe={timeframe}
            emptyHint={<>Left panel se parameters set karke <b>Run backtest</b>{" "}dabao — trades, win rate aur P&amp;L yahan aayenge.</>}
          />
        )}
      </div>

      {/* ── Deploy to Paper Modal ───────────────────────────────── */}
      {deployModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="trade-panel max-w-lg w-full p-6 space-y-4 relative border shadow-2xl">
            <button
              type="button"
              className="absolute top-4 right-4 trade-iconbtn"
              onClick={() => {
                setDeployModalOpen(false);
                setDeploySuccess(false);
                setDeployError(null);
              }}
            >
              <X className="w-4 h-4" />
            </button>

            {deploySuccess ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400">Deployed to Paper Trading!</h3>
                <p className="text-[13px] max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                  {def.autoTrade ? (
                    <>
                      {deployNote && (
                        <span className="block mb-2 font-semibold" style={{ color: "var(--text-secondary)" }}>{deployNote}</span>
                      )}
                      <b>{def.name}</b>{" "}ka bot server par chalu hai. Abhi koi order nahi laga — agle band candle par signal aate hi entry stop ke saath lagegi, aur har candle par stop trail hoga. Bot server par chalta hai, isliye ye page ya browser band karke bhi chalta rahega. Haalat isi page ke &quot;Server bot&quot; panel mein dikhegi.
                    </>
                  ) : (
                    <>
                      <b>{def.name}</b> ab Paper Trading Desk par live virtual capital ke saath deploy ho chuki hai. Entry aur exit conditions trigger hone par automatic paper trades execute hongi.
                    </>
                  )}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                  <button
                    type="button"
                    className="trade-btn trade-btn-primary"
                    onClick={() => {
                      setDeployModalOpen(false);
                      router.push("/trade?tab=trades");
                    }}
                  >
                    <FlaskConical className="w-4 h-4" />
                    Open Paper Trading Desk
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost"
                    onClick={() => {
                      setDeployModalOpen(false);
                      setDeploySuccess(false);
                    }}
                  >
                    Stay on Monitor
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-none">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold">Deploy {def.name} to Paper Trading</h3>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Live market prices par zero financial risk ke saath catalogue strategy test karein.
                    </p>
                  </div>
                </div>

                {deployError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 text-[12px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-none" />
                    {deployError}
                  </div>
                )}

                {def.autoTrade && def.presets && (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["portfolio", "Portfolio · BTC + ETH + SOL", "Teeno par bot — capital ÷ 3. Research mein sabse smooth."],
                      ["single", `Sirf ${symbolLabel(symbol)}`, "Ek coin par poora capital."],
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
                        {portfolioDeploy && ` (÷3 = $${(Math.floor((num(values, "capital", 1000) / 3) * 100) / 100).toLocaleString("en-US")} har coin)`}
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
                    <span style={{ color: "var(--text-muted)" }}>Execution Mode</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      {def.autoTrade ? "Signal par entry · stop har candle trail" : "Auto-Execute Virtual Orders on Signal Match"}
                    </span>
                  </div>
                </div>

                {def.autoTrade && (
                  <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Size strategy khud nikalti hai (stop lagne par capital ka {num(values, "risk_pct", 1)}%, backtest jaisa compounding). Capital aur risk Parameters panel se badlo. Bot server par har {shortInterval(timeframe)} candle band hone ke kuch second baad chalta hai — browser band ho tab bhi. Ek symbol par ek hi bot; us symbol par haath se paper trade mat karo, warna bot ki position gadbad hogi.
                  </p>
                )}

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
                    disabled={deploying}
                    className="trade-btn trade-btn-primary"
                    style={{
                      background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                      borderColor: "transparent",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                    onClick={handleDeployToPaper}
                  >
                    {deploying ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <FlaskConical className="w-4 h-4" />
                    )}
                    Confirm & Deploy to Paper
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
      <label className="trade-checkrow col-span-2" htmlFor={id}>
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
    <div>
      <label className="trade-label" htmlFor={id}>{field.label}</label>
      {control}
      {field.hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{field.hint}</p>}
    </div>
  );
}
