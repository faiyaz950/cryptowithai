"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  ExternalLink,
  FlaskConical,
  History,
  Layers,
  Percent,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { Candle } from "@/lib/cryptoApi";
import {
  DEFAULT_MARKET_SOURCES,
  fetchCandles,
  placeDemoOrder,
  symbolLabel,
} from "@/lib/cryptoApi";
import {
  deployStrategyToPaper,
  simulateStrategy,
  type CustomStrategy,
  type PaperDeploymentSettings,
  type SimOverrides,
  type SimulationResult,
  type SimulationTrade,
} from "@/lib/strategyBuilder";
import PayoffGraph from "@/components/trade/PayoffGraph";

interface Props {
  strategy: CustomStrategy;
  candles: Candle[];
  defaultSymbol?: string;
  onTweakRules: () => void;
  onDeploy: () => void;
  onUpdateStrategy?: (updater: (prev: CustomStrategy) => CustomStrategy) => void;
  onReloadCandles?: (interval: string, limit: number, exchange?: string) => Promise<void>;
}

function fmtMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

const TIMEFRAME_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const LOOKBACK_OPTIONS = [
  { label: "100 Candles (~Quick)", limit: 100 },
  { label: "300 Candles (~Medium)", limit: 300 },
  { label: "500 Candles (~Deep)", limit: 500 },
  { label: "1000 Candles (~Extended)", limit: 1000 },
];

export default function StrategySimulator({
  strategy,
  candles: initialCandles,
  defaultSymbol = "BTCUSDT",
  onTweakRules,
  onDeploy,
  onUpdateStrategy,
  onReloadCandles,
}: Props) {
  const router = useRouter();
  const { token } = useAuth();

  // Local candles state for dynamic historical market testing
  const [candles, setCandles] = useState<Candle[]>(initialCandles);
  const [activeInterval, setActiveInterval] = useState(strategy.market.interval || "15m");
  const [activeLimit, setActiveLimit] = useState(400);
  const [activeExchange, setActiveExchange] = useState("delta");
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sync initial candles when parent loads new ones
  useEffect(() => {
    if (initialCandles && initialCandles.length > 0) {
      setCandles(initialCandles);
    }
  }, [initialCandles]);

  // Interactive SL & Target testing controls (Overrides state)
  const initialTp = strategy.risk.takeProfit.value || 2.5;
  const initialSl = strategy.risk.stopLoss.value || 1.2;
  const initialTrailing = strategy.risk.trailing;
  const initialTrailingPct = strategy.risk.trailingPct || 0.8;

  const [testTp, setTestTp] = useState(initialTp);
  const [testSl, setTestSl] = useState(initialSl);
  const [testTrailing, setTestTrailing] = useState(initialTrailing);
  const [testTrailingPct, setTestTrailingPct] = useState(initialTrailingPct);
  const [testCapital, setTestCapital] = useState(strategy.risk.positionSizeUsd || 1000);
  const [testLeverage, setTestLeverage] = useState(strategy.market.leverage || 1);

  // Hover state for SVG equity curve
  const [hoveredPoint, setHoveredPoint] = useState<{ time: number; equity: number } | null>(null);

  // Paper Trading Deployment Modal state
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const symbol = strategy.market.symbols[0] ?? defaultSymbol;
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  // Run simulation with interactive overrides
  const overrides: SimOverrides = useMemo(() => {
    return {
      tpVal: testTp,
      slVal: testSl,
      trailing: testTrailing,
      trailingPct: testTrailingPct,
      positionSizeUsd: testCapital,
      leverage: testLeverage,
    };
  }, [testTp, testSl, testTrailing, testTrailingPct, testCapital, testLeverage]);

  const sim: SimulationResult = useMemo(() => {
    return simulateStrategy(strategy, candles, overrides);
  }, [strategy, candles, overrides]);

  // Handle re-fetching historical market data
  const handleFetchHistory = useCallback(
    async (interval: string, limit: number, exchange = activeExchange) => {
      setLoadingHistory(true);
      try {
        if (onReloadCandles) {
          await onReloadCandles(interval, limit, exchange);
        } else {
          const res = await fetchCandles({
            symbol,
            interval,
            limit,
            exchange,
          });
          if (res.success && res.candles) {
            setCandles(res.candles);
          }
        }
      } catch (err) {
        console.error("Failed to load historical candles:", err);
      } finally {
        setLoadingHistory(false);
      }
    },
    [symbol, activeExchange, onReloadCandles]
  );

  // SVG Coordinates for Equity Curve
  const svgW = 740;
  const svgH = 200;
  const padL = 65;
  const padR = 25;
  const padT = 20;
  const padB = 35;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const { minEq, maxEq, pathD, areaD, zeroY } = useMemo(() => {
    const pts = sim.equityCurve;
    if (!pts || pts.length === 0) {
      return { minEq: 10000, maxEq: 10000, pathD: "", areaD: "", zeroY: svgH / 2 };
    }
    let min = Math.min(...pts.map((p) => p.equity));
    let max = Math.max(...pts.map((p) => p.equity));
    const span = max - min || 100;
    min = Math.max(0, min - span * 0.15);
    max = max + span * 0.15;

    const getX = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * chartW;
    const getY = (eq: number) => padT + chartH - ((eq - min) / (max - min)) * chartH;

    const d = pts
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${getX(idx).toFixed(1)} ${getY(p.equity).toFixed(1)}`)
      .join(" ");

    const zy = getY(10000);
    const firstX = getX(0).toFixed(1);
    const lastX = getX(pts.length - 1).toFixed(1);
    const aD = `${d} L ${lastX} ${zy.toFixed(1)} L ${firstX} ${zy.toFixed(1)} Z`;

    return { minEq: min, maxEq: max, pathD: d, areaD: aD, zeroY: zy };
  }, [sim.equityCurve, chartW, chartH]);

  const catLabel =
    strategy.market.strategyType === "options"
      ? "Options Strategy"
      : strategy.market.strategyType === "futures"
      ? "Futures Strategy"
      : strategy.market.strategyType === "hedging"
      ? "Hedging Strategy"
      : "Indicator-Based Strategy";

  // Handle Deploying Strategy to Paper Trading
  const handleDeployToPaper = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      const settings: PaperDeploymentSettings = {
        capitalUsd: testCapital,
        leverage: testLeverage,
        autoExecute: true,
        deployedAt: new Date().toISOString(),
        symbol,
        timeframe: activeInterval,
        confirmedTpPct: testTp,
        confirmedSlPct: testSl,
        trailingStopPct: testTrailing ? testTrailingPct : undefined,
        simScore: sim.effectiveness.score,
      };

      // 1. Save strategy as Paper
      const deployed = deployStrategyToPaper(strategy.id, settings);
      if (!deployed) throw new Error("Strategy save nahi ho saki");

      // 2. If authenticated, place an initial demo order so position appears in PaperDesk
      if (token && currentPrice > 0) {
        try {
          const side = strategy.market.direction === "short" ? "sell" : "buy";
          const qty = Number((testCapital / currentPrice).toFixed(4));
          const slPrice = side === "buy" ? currentPrice * (1 - testSl / 100) : currentPrice * (1 + testSl / 100);
          const tpPrice = side === "buy" ? currentPrice * (1 + testTp / 100) : currentPrice * (1 - testTp / 100);

          await placeDemoOrder(token, {
            symbol,
            side,
            order_type: "market",
            quantity: Math.max(0.001, qty),
            stop_loss: slPrice,
            take_profit: tpPrice,
          });
        } catch {
          // If demo order placement fails (e.g. backend offline), the paper strategy is still persisted locally
        }
      }

      setDeploySuccess(true);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Paper deployment mein error aaya");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Simulator Header & Actions ───────────────────────── */}
      <div className="trade-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-none"
            style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--green)" }}
          >
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-extrabold">{strategy.name || "Custom Strategy"} Simulator</span>
              <span className="trade-badge trade-badge-blue text-[11px]">{catLabel}</span>
              {strategy.status === "paper" && (
                <span className="trade-badge trade-badge-green text-[11px] animate-pulse">Paper Active</span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Historical Data: <b>{candles.length} candles</b> ({activeInterval}) · Symbol: <b>{symbolLabel(symbol)}</b> · Base Capital: <b>$10,000</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="trade-btn trade-btn-ghost" onClick={onTweakRules}>
            <RotateCcw className="w-3.5 h-3.5" />
            Tweak Rules
          </button>
          <button
            type="button"
            className="trade-btn trade-btn-primary"
            style={{
              background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              borderColor: "transparent",
              color: "#fff",
              fontWeight: 700,
            }}
            onClick={() => setDeployModalOpen(true)}
          >
            <Zap className="w-3.5 h-3.5" />
            Deploy to Paper Trading
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── 2. Historical Market Data Window (Point 4) ──────────── */}
      <div className="trade-panel p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-500" />
          <span className="text-[13px] font-bold">Historical Backtest Feed:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Chips */}
          <div className="trade-seg">
            {TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf}
                type="button"
                data-active={activeInterval === tf}
                disabled={loadingHistory}
                onClick={() => {
                  setActiveInterval(tf);
                  void handleFetchHistory(tf, activeLimit);
                }}
                className="trade-seg-btn text-[11.5px] uppercase"
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Lookback Selector */}
          <select
            className="trade-input text-[12px] py-1 px-2.5 rounded-lg"
            value={activeLimit}
            disabled={loadingHistory}
            onChange={(e) => {
              const lim = Number(e.target.value);
              setActiveLimit(lim);
              void handleFetchHistory(activeInterval, lim);
            }}
          >
            {LOOKBACK_OPTIONS.map((opt) => (
              <option key={opt.limit} value={opt.limit}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Exchange Selector */}
          <select
            className="trade-input text-[12px] py-1 px-2.5 rounded-lg"
            value={activeExchange}
            disabled={loadingHistory}
            onChange={(e) => {
              const ex = e.target.value;
              setActiveExchange(ex);
              void handleFetchHistory(activeInterval, activeLimit, ex);
            }}
          >
            {DEFAULT_MARKET_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            disabled={loadingHistory}
            onClick={() => void handleFetchHistory(activeInterval, activeLimit)}
            title="Refresh historical market feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin text-emerald-400" : ""}`} />
            {loadingHistory ? "Loading..." : "Run Feed"}
          </button>
        </div>
      </div>

      {/* ── 3. Stop Loss & Target Interactive Testing Sandbox (Point 3) */}
      <div className="trade-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span className="text-[14px] font-bold">Stop Loss & Target Testing Sandbox</span>
            <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              (Adjust parameters to test real-time impact on Win Rate, Hits & Risk-Reward)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="trade-badge trade-badge-blue text-[11px] font-mono">
              Risk:Reward = 1 : {sim.riskRewardRatio}
            </span>
            <button
              type="button"
              className="trade-btn trade-btn-ghost trade-size-sm"
              onClick={() => {
                setTestTp(initialTp);
                setTestSl(initialSl);
                setTestTrailing(initialTrailing);
                setTestTrailingPct(initialTrailingPct);
              }}
            >
              <RotateCcw className="w-3 h-3" />
              Reset Sliders
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {/* Target (Take Profit) Slider */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[rgba(16,185,129,0.03)] border border-[rgba(16,185,129,0.12)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-emerald-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Target (Take Profit): +{testTp}%
              </span>
              <span className="text-[11px] text-emerald-400 font-mono font-semibold">
                🎯 {sim.targetHits} Hits ({sim.totalTrades > 0 ? ((sim.targetHits / sim.totalTrades) * 100).toFixed(0) : 0}%)
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="15.0"
              step="0.1"
              value={testTp}
              onChange={(e) => setTestTp(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              <span>0.5% (Scalp)</span>
              <span>Default: {initialTp}%</span>
              <span>15.0% (Runner)</span>
            </div>
          </div>

          {/* Stop Loss Slider */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[rgba(239,68,68,0.03)] border border-[rgba(239,68,68,0.12)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Stop Loss (Risk): −{testSl}%
              </span>
              <span className="text-[11px] text-rose-400 font-mono font-semibold">
                🛑 {sim.slHits} Hits ({sim.totalTrades > 0 ? ((sim.slHits / sim.totalTrades) * 100).toFixed(0) : 0}%)
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="8.0"
              step="0.1"
              value={testSl}
              onChange={(e) => setTestSl(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              <span>0.2% (Tight)</span>
              <span>Default: {initialSl}%</span>
              <span>8.0% (Wide)</span>
            </div>
          </div>

          {/* Trailing Stop Slider */}
          <div className="space-y-1.5 p-3 rounded-xl bg-[rgba(59,130,246,0.03)] border border-[rgba(59,130,246,0.12)]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold flex items-center gap-1.5 cursor-pointer text-blue-400">
                <input
                  type="checkbox"
                  checked={testTrailing}
                  onChange={(e) => setTestTrailing(e.target.checked)}
                  className="rounded"
                />
                Trailing Stop: {testTrailing ? `${testTrailingPct}%` : "OFF"}
              </label>
              <span className="text-[11px] text-blue-400 font-mono font-semibold">
                🏃 {sim.trailingHits} Hits
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="5.0"
              step="0.1"
              disabled={!testTrailing}
              value={testTrailingPct}
              onChange={(e) => setTestTrailingPct(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer disabled:opacity-30"
            />
            <div className="flex items-center justify-between text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              <span>0.2% lock</span>
              <span>{sim.signalExitHits} Reversal exits</span>
              <span>5.0% lock</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Strategy Performance & Profit/Loss Scorecard (Point 5) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div className="trade-panel p-3">
          <div className="trade-stat-label">Net PnL</div>
          <div
            className="text-[16px] font-bold tnum mt-0.5"
            style={{ color: sim.netPnlUsd >= 0 ? "var(--green)" : "var(--red)" }}
          >
            {fmtMoney(sim.netPnlUsd)}
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {sim.netPnlPct >= 0 ? "+" : ""}
            {sim.netPnlPct.toFixed(2)}% ROI
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Win Rate</div>
          <div
            className="text-[16px] font-bold tnum mt-0.5"
            style={{ color: sim.winRatePct >= 50 ? "var(--green)" : "var(--amber)" }}
          >
            {sim.winRatePct.toFixed(1)}%
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {sim.winningTrades}W · {sim.losingTrades}L
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Profit Factor</div>
          <div className="text-[16px] font-bold tnum mt-0.5">
            {sim.profitFactor.toFixed(2)}x
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Gross P: ${sim.grossProfitUsd.toFixed(0)}
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Max Drawdown</div>
          <div className="text-[16px] font-bold tnum mt-0.5" style={{ color: "var(--red)" }}>
            −{sim.maxDrawdownPct.toFixed(1)}%
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Peak to trough
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Total Trades</div>
          <div className="text-[16px] font-bold tnum mt-0.5">{sim.totalTrades}</div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            In test window
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Avg Trade PnL</div>
          <div
            className="text-[16px] font-bold tnum mt-0.5"
            style={{ color: sim.avgTradePnlUsd >= 0 ? "var(--green)" : "var(--red)" }}
          >
            {fmtMoney(sim.avgTradePnlUsd)}
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Per execution
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Best / Worst</div>
          <div className="text-[12.5px] font-bold tnum mt-0.5 text-emerald-400">
            {fmtMoney(sim.bestTradeUsd)}
          </div>
          <div className="text-[10.5px] text-rose-400 font-bold tnum">
            {fmtMoney(sim.worstTradeUsd)}
          </div>
        </div>

        <div className="trade-panel p-3">
          <div className="trade-stat-label">Avg Holding</div>
          <div className="text-[16px] font-bold tnum mt-0.5">
            {sim.avgHoldingCandles} bars
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Duration per trade
          </div>
        </div>
      </div>

      {/* ── 5. Strategy Effectiveness Evaluation Matrix (Point 6) ─ */}
      <div className="trade-panel p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl"
              style={{
                background:
                  sim.effectiveness.grade === "A+" || sim.effectiveness.grade === "A"
                    ? "rgba(16, 185, 129, 0.15)"
                    : sim.effectiveness.grade === "B"
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(245, 158, 11, 0.15)",
                color:
                  sim.effectiveness.grade === "A+" || sim.effectiveness.grade === "A"
                    ? "var(--green)"
                    : sim.effectiveness.grade === "B"
                    ? "var(--accent)"
                    : "var(--amber)",
              }}
            >
              {sim.effectiveness.grade}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">Effectiveness Score: {sim.effectiveness.score} / 100</span>
                <span
                  className={`trade-badge ${
                    sim.effectiveness.status === "Highly Effective" || sim.effectiveness.status === "Effective"
                      ? "trade-badge-green"
                      : "trade-badge-amber"
                  } text-[11px]`}
                >
                  {sim.effectiveness.status}
                </span>
              </div>
              <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {sim.effectiveness.summary}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="trade-btn trade-btn-primary"
            style={{
              background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              borderColor: "transparent",
              color: "#fff",
              fontWeight: 700,
            }}
            onClick={() => setDeployModalOpen(true)}
          >
            <FlaskConical className="w-4 h-4" />
            Deploy to Paper Trading
          </button>
        </div>

        {/* 4 Health Checklist Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          {sim.effectiveness.checklist.map((item) => (
            <div
              key={item.label}
              className="p-3 rounded-xl border flex items-start gap-2.5"
              style={{
                borderColor: item.passed ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                background: item.passed ? "rgba(16,185,129,0.02)" : "rgba(239,68,68,0.02)",
              }}
            >
              {item.passed ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 flex-none" />
              ) : (
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 flex-none" />
              )}
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                    {item.label}
                  </span>
                  <span className="text-[12px] font-bold font-mono">{item.value}</span>
                </div>
                <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {item.hint}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Insights list */}
        {sim.effectiveness.insights.length > 0 && (
          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Algorithmic Evaluation Insights
            </span>
            <ul className="text-[12px] space-y-1 list-disc list-inside" style={{ color: "var(--text-muted)" }}>
              {sim.effectiveness.insights.map((ins, i) => (
                <li key={i}>{ins}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── 6. Equity Curve SVG ─────────────────────────────────── */}
      <div className="trade-panel p-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold">Simulated Equity Curve (Growth)</span>
            <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
              Starting $10,000 → Final ${sim.equityCurve[sim.equityCurve.length - 1]?.equity.toFixed(2) ?? "10000"}
            </span>
          </div>
          {hoveredPoint && (
            <div
              className="text-[12px] font-bold tnum"
              style={{ color: hoveredPoint.equity >= 10000 ? "var(--green)" : "var(--red)" }}
            >
              Equity: ${hoveredPoint.equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>

        <div className="relative w-full overflow-hidden select-none">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-auto block"
            onMouseLeave={() => setHoveredPoint(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * svgW;
              if (relX >= padL && relX <= svgW - padR) {
                const idx = Math.round(((relX - padL) / chartW) * (sim.equityCurve.length - 1));
                const pt = sim.equityCurve[Math.max(0, Math.min(sim.equityCurve.length - 1, idx))];
                if (pt) setHoveredPoint(pt);
              }
            }}
          >
            <defs>
              <linearGradient id="eqGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Baseline 10,000 */}
            <line
              x1={padL}
              y1={zeroY}
              x2={svgW - padR}
              y2={zeroY}
              stroke="var(--border-subtle)"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />
            <text x={padL - 6} y={zeroY + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="monospace">
              $10,000
            </text>

            {/* Shaded area */}
            {areaD && <path d={areaD} fill="url(#eqGreenGrad)" />}

            {/* Curve path */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={sim.netPnlUsd >= 0 ? "#10b981" : "#ef4444"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Max / Min Y labels */}
            <text x={padL - 6} y={padT + 10} textAnchor="end" fontSize="9.5" fill="var(--text-muted)" fontFamily="monospace">
              ${Math.round(maxEq).toLocaleString()}
            </text>
            <text x={padL - 6} y={svgH - padB} textAnchor="end" fontSize="9.5" fill="var(--text-muted)" fontFamily="monospace">
              ${Math.round(minEq).toLocaleString()}
            </text>
          </svg>
        </div>
      </div>

      {/* Options / Hedging Payoff Preview (if applicable) */}
      {(strategy.market.strategyType === "options" || strategy.market.strategyType === "hedging") && currentPrice > 0 && (
        <PayoffGraph
          type={strategy.market.optionsConfig?.structure === "iron_condor" ? "condor" : "spread"}
          spot={currentPrice}
          longStrike={currentPrice * 0.98}
          shortStrike={currentPrice * 1.04}
          netDebit={currentPrice * 0.015}
          maxProfit={currentPrice * 0.045}
          breakeven={currentPrice * 0.995}
          isCall={strategy.market.direction !== "short"}
          longPutStrike={currentPrice * 0.92}
          shortPutStrike={currentPrice * 0.96}
          shortCallStrike={currentPrice * 1.04}
          longCallStrike={currentPrice * 1.08}
          netCredit={currentPrice * 0.02}
          maxLoss={currentPrice * 0.04}
          breakevenLow={currentPrice * 0.94}
          breakevenHigh={currentPrice * 1.06}
          underlying={symbolLabel(symbol)}
        />
      )}

      {/* ── 7. Simulated Trades History Log (Point 2) ───────────── */}
      <div className="trade-panel overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="text-[13px] font-bold">Simulated Trades Log ({sim.trades.length})</span>
          <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Position Size: ${testCapital} · Leverage: {testLeverage}x · Target: +{testTp}% · SL: −{testSl}%
          </span>
        </div>

        {sim.trades.length === 0 ? (
          <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" />
            Is test window mein koi entry trigger nahi hui. Entry conditions thodi relax karke try karein.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Entry Price</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Exit Reason</th>
                  <th className="py-2.5 px-3 text-right">PnL (%)</th>
                  <th className="py-2.5 px-3 text-right">PnL (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {sim.trades.map((t, idx) => {
                  const win = t.pnlUsd >= 0;
                  return (
                    <tr key={t.id || idx} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2.5 px-3 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`trade-badge ${t.direction === "long" ? "trade-badge-green" : "trade-badge-red"} text-[10.5px] uppercase`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{fmtPrice(t.entryPrice)}</td>
                      <td className="py-2.5 px-3 font-mono">{fmtPrice(t.exitPrice)}</td>
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1.5 text-[11.5px]">
                          {win ? (
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />
                          )}
                          {t.exitReason}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right font-semibold" style={{ color: win ? "var(--green)" : "var(--red)" }}>
                        {t.pnlPct >= 0 ? "+" : ""}
                        {t.pnlPct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right font-bold" style={{ color: win ? "var(--green)" : "var(--red)" }}>
                        {fmtMoney(t.pnlUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 8. Deploy to Paper Trading Modal (Point 1 & 2) ──────── */}
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
                <p className="text-[13px] text-muted-foreground max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                  <b>{strategy.name || "Strategy"}</b> ab Paper Trading Desk par live monitor ho rahi hai. Entry/Exit rules trigger hone par virtual execution automatically execute hogi.
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
                    Keep Simulating
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
                    <h3 className="text-[16px] font-bold">Deploy Strategy to Paper Trading</h3>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Execute trades in real-time on live market prices with zero financial risk.
                    </p>
                  </div>
                </div>

                {deployError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 text-[12px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-none" />
                    {deployError}
                  </div>
                )}

                {/* Configuration Summary */}
                <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)] space-y-2 text-[12.5px]">
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Strategy</span>
                    <span className="font-bold flex items-center gap-1.5">
                      {strategy.name || "Untitled"}
                      <span className="trade-badge trade-badge-blue text-[10px]">{catLabel}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Target Pair</span>
                    <span className="font-bold font-mono">
                      {symbolLabel(symbol)} · {activeInterval}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Stop Loss & Target</span>
                    <span className="font-bold font-mono text-emerald-400">
                      TP: +{testTp}% · <span className="text-rose-400">SL: −{testSl}%</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)]">
                    <span style={{ color: "var(--text-muted)" }}>Backtest Validation</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      Grade {sim.effectiveness.grade} ({sim.effectiveness.score}/100)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span style={{ color: "var(--text-muted)" }}>Execution Mode</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      Auto-Execute on Signal Match
                    </span>
                  </div>
                </div>

                {/* Capital & Leverage inputs */}
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
