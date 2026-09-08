"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, Info, Play, Power, RefreshCw, RotateCcw } from "lucide-react";
import BacktestResults from "@/components/trade/BacktestResults";
import OptionChainPanel from "@/components/trade/OptionChainPanel";
import SpreadPanel from "@/components/trade/SpreadPanel";
import CondorPanel from "@/components/trade/CondorPanel";
import {
  CHART_RANGES,
  CRYPTO_INTERVALS,
  CRYPTO_SYMBOLS,
  barsForDays,
  candlesSpanDays,
  fetchCandles,
  maxDaysForInterval,
  runBacktest,
  symbolLabel,
  type BacktestResult,
  type Candle,
} from "@/lib/cryptoApi";
import {
  bool,
  num,
  readActiveStrategies,
  str,
  strategyHref,
  visibleFields,
  writeActiveStrategy,
  type StrategyDef,
  type StrategyField,
  type StrategyValues,
} from "@/lib/strategies";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full shimmer" />,
});

interface Props {
  def: StrategyDef;
  initialValues: StrategyValues;
  /** Page header live badge dikha sake, isliye state upar bhejte hain. */
  onActiveChange?: (active: boolean) => void;
}

/** Live monitor kitni der mein refresh ho. */
const POLL_MS = 60_000;

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

export default function StrategyRunner({ def, initialValues, onActiveChange }: Props) {
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

  const symbol = str(values, "symbol", "BTCUSDT");
  const timeframe = str(values, "timeframe", "1h");

  // Parent har render par naya callback de sakta hai — ref se effect deps stable rehti hain.
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  const log = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 40));
  }, []);

  const setValue = (key: string, value: StrategyValues[string]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Live data ───────────────────────────────────────── */

  const loadCandles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCandles({ symbol, interval: timeframe, limit: barsForDays(chartDays, timeframe) });
      if (!res.success) throw new Error(res.error || "Candle data nahi mili");
      setCandles(res.candles ?? []);
      setLiveError(null);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Crypto backend connect nahi ho raha";
      setLiveError(message);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, chartDays]);

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

  const handleBacktest = async () => {
    setBtRunning(true);
    setBtError(null);
    setBtResult(null);
    syncUrl();
    try {
      const res = await runBacktest(def.toBacktest(values));
      if (!res.success) throw new Error(res.error || "Backtest fail");
      setBtResult(res);
      log(`Backtest done — ${res.total_trades ?? 0} trades, win rate ${res.win_rate ?? 0}%`);
    } catch (err) {
      setBtError(err instanceof Error ? err.message : "Backtest fail ho gaya");
    } finally {
      setBtRunning(false);
    }
  };

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
    <div className="grid gap-4 xl:grid-cols-[370px_minmax(0,1fr)] items-start">
      {/* ── Config rail ───────────────────────────────────── */}
      <div className="trade-panel xl:sticky xl:top-[116px]">
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
            {active ? (
              <button type="button" className="trade-btn trade-btn-ghost trade-btn-lg w-full" onClick={deactivate}>
                <Power className="w-4 h-4" />
                Deactivate live monitor
              </button>
            ) : (
              <button type="button" className="trade-btn trade-btn-primary trade-btn-lg w-full" onClick={activate}>
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
