"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, BarChart3, Gauge, Play, Power, TrendingUp, Zap } from "lucide-react";
import type { BacktestParams, BacktestResult } from "@/lib/cryptoApi";
import {
  CRYPTO_INTERVALS,
  CRYPTO_SYMBOLS,
  candleEma,
  fetchCandles,
  symbolLabel,
} from "@/lib/cryptoApi";

interface Props {
  defaultSymbol: string;
  running: boolean;
  result: BacktestResult | null;
  error: string | null;
  onTest: (params: BacktestParams) => void;
  onBacktest: (params: BacktestParams) => void;
}

/* ── Small building blocks ─────────────────────────────── */

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="trade-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function SymbolSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="trade-select">
      {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

function IntervalSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="trade-select">
      {CRYPTO_INTERVALS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className="trade-input" />;
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return active ? (
    <span className="trade-badge trade-badge-green">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
      {label ?? "Active"}
    </span>
  ) : (
    <span className="trade-badge trade-badge-neutral">Inactive</span>
  );
}

function defaultBacktest(overrides: Partial<BacktestParams> = {}): BacktestParams {
  return {
    strategy: "ema-crossover",
    symbol: "BTCUSDT",
    timeframe: "1h",
    days: 30,
    sl_points: 400,
    target_points: 800,
    lots: 1,
    ema9: 9,
    ema21: 21,
    ema50: 50,
    use_rsi_filter: false,
    rsi_period: 14,
    rsi_overbought: 60,
    rsi_oversold: 40,
    use_no_entry_window: true,
    ...overrides,
  };
}

/* ── Component ─────────────────────────────────────────── */

export default function StrategyCards({ defaultSymbol, running, result, error, onTest, onBacktest }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  const [ema, setEma] = useState({ fast: 9, slow: 21, symbol: defaultSymbol, interval: "1h" });
  const [rsi, setRsi] = useState({ period: 14, overbought: 70, oversold: 30, symbol: defaultSymbol });
  const [macd, setMacd] = useState({ fast: 12, slow: 26, signal: 9, symbol: defaultSymbol });

  const [custom, setCustom] = useState({
    ema9: 9,
    ema21: 21,
    ema50: 50,
    symbol: defaultSymbol,
    qty: 0.001,
    sl: 400,
    target: 800,
    autoClose: true,
    autoTrade: false,
    blockEntries: true,
    days: 30,
    lots: 1,
    timeframe: "5m",
    useRsi: false,
    rsiPeriod: 14,
    rsiOverbought: 60,
    rsiOversold: 40,
    backtestBlock: true,
  });
  const [live, setLive] = useState<{
    ema9: number | null;
    ema21: number | null;
    ema50: number | null;
    price: number | null;
    state: string;
    logs: string[];
  }>({ ema9: null, ema21: null, ema50: null, price: null, state: "Waiting", logs: [] });

  const log = (line: string) => {
    setLive((prev) => ({ ...prev, logs: [`${new Date().toLocaleTimeString()}  ${line}`, ...prev.logs].slice(0, 20) }));
  };

  useEffect(() => {
    if (!active.custom) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchCandles({
          symbol: custom.symbol,
          interval: custom.timeframe,
          limit: 100,
          emaPeriods: [custom.ema9, custom.ema21, custom.ema50],
        });
        if (cancelled || !data.success || !data.candles?.length) return;
        const last = data.candles[data.candles.length - 1];
        const prev = data.candles[data.candles.length - 2] ?? last;
        const e9 = candleEma(last, custom.ema9);
        const e21 = candleEma(last, custom.ema21);
        const e50 = candleEma(last, custom.ema50);
        const p9 = candleEma(prev, custom.ema9);
        const p21 = candleEma(prev, custom.ema21);
        const p50 = candleEma(prev, custom.ema50);
        let state = "No clear cross";
        if (e9 != null && e21 != null && e50 != null) {
          const above = e9 > e50 && e21 > e50;
          const below = e9 < e50 && e21 < e50;
          const wasAbove = p9 != null && p21 != null && p50 != null && p9 > p50 && p21 > p50;
          const wasBelow = p9 != null && p21 != null && p50 != null && p9 < p50 && p21 < p50;
          if (above && !wasAbove) state = "BUY — EMA 9 & 21 crossed above EMA 50";
          else if (below && !wasBelow) state = "SELL — EMA 9 & 21 crossed below EMA 50";
          else if (above) state = "Bullish (both EMAs above 50)";
          else if (below) state = "Bearish (both EMAs below 50)";
        }
        setLive((prev) => ({ ...prev, ema9: e9, ema21: e21, ema50: e50, price: last.close, state }));
      } catch (err) {
        if (!cancelled) log(err instanceof Error ? err.message : "Candle fetch fail");
      }
    };

    poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active.custom, custom.symbol, custom.timeframe, custom.ema9, custom.ema21, custom.ema50]);

  const setCustomField = <K extends keyof typeof custom>(key: K, value: (typeof custom)[K]) => {
    setCustom((prev) => ({ ...prev, [key]: value }));
  };

  const customParams = (): BacktestParams =>
    defaultBacktest({
      strategy: "ema-crossover",
      symbol: custom.symbol,
      timeframe: custom.timeframe,
      days: custom.days,
      sl_points: custom.sl,
      target_points: custom.target,
      lots: custom.lots,
      ema9: custom.ema9,
      ema21: custom.ema21,
      ema50: custom.ema50,
      use_rsi_filter: custom.useRsi,
      rsi_period: custom.rsiPeriod,
      rsi_overbought: custom.rsiOverbought,
      rsi_oversold: custom.rsiOversold,
      use_no_entry_window: custom.backtestBlock,
    });

  const activeCount = Object.values(active).filter(Boolean).length;
  const stateTone = live.state.startsWith("BUY") || live.state.startsWith("Bullish")
    ? "var(--green)"
    : live.state.startsWith("SELL") || live.state.startsWith("Bearish")
      ? "var(--red)"
      : "var(--text-primary)";

  return (
    <div className="space-y-4">
      {/* ── Section header ────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">Trading Strategies</h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Manage and configure your trading strategies.
          </p>
        </div>
        <span className={`trade-badge ${activeCount > 0 ? "trade-badge-green" : "trade-badge-neutral"}`}>
          {activeCount} active
        </span>
      </div>

      {notice && (
        <div className="trade-panel flex items-center gap-3 px-4 py-3 text-[13px]" style={{ borderColor: "rgba(37, 99, 235, 0.28)", background: "rgba(37, 99, 235, 0.05)" }}>
          <span style={{ color: "var(--text-secondary)" }}>{notice}</span>
        </div>
      )}

      {/* ── Strategy cards ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* EMA Crossover */}
        <article className="trade-panel trade-strategy" data-active={!!active.ema}>
          <div className="trade-panel-body flex flex-col flex-1">
            <div className="flex items-start gap-3">
              <span className="trade-strategy-icon" style={{ background: "rgba(37, 99, 235, 0.1)", color: "#2563eb" }}>
                <TrendingUp className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold leading-tight">EMA Crossover</h3>
                <p className="text-[11px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Trend following
                </p>
              </div>
              <StatusBadge active={!!active.ema} />
            </div>

            <p className="text-[12.5px] mt-3.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Exponential Moving Average crossovers se buy/sell signal milta hai. Short EMA jab long EMA ke upar cross kare to buy, neeche to sell.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label="Fast EMA" htmlFor="s-ema-fast">
                <NumberInput id="s-ema-fast" min={1} max={50} value={ema.fast} onChange={(e) => setEma({ ...ema, fast: Number(e.target.value) })} />
              </Field>
              <Field label="Slow EMA" htmlFor="s-ema-slow">
                <NumberInput id="s-ema-slow" min={1} max={200} value={ema.slow} onChange={(e) => setEma({ ...ema, slow: Number(e.target.value) })} />
              </Field>
              <Field label="Symbol" htmlFor="s-ema-sym">
                <SymbolSelect id="s-ema-sym" value={ema.symbol} onChange={(v) => setEma({ ...ema, symbol: v })} />
              </Field>
              <Field label="Interval" htmlFor="s-ema-int">
                <IntervalSelect id="s-ema-int" value={ema.interval} onChange={(v) => setEma({ ...ema, interval: v })} />
              </Field>
            </div>

            <div className="flex-1" />
            <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
              <button
                type="button"
                className="trade-btn trade-btn-primary flex-1"
                onClick={() => {
                  setActive((a) => ({ ...a, ema: true }));
                  setNotice("EMA Crossover activate ho gayi (signal demo). Live auto-trade Custom EMA card se chalta hai.");
                }}
              >
                Activate
              </button>
              <button
                type="button"
                className="trade-btn trade-btn-ghost flex-1"
                onClick={() => onTest(defaultBacktest({ symbol: ema.symbol, timeframe: ema.interval, ema9: ema.fast, ema21: ema.slow }))}
              >
                Test
              </button>
            </div>
          </div>
        </article>

        {/* RSI Divergence */}
        <article className="trade-panel trade-strategy" data-active={!!active.rsi}>
          <div className="trade-panel-body flex flex-col flex-1">
            <div className="flex items-start gap-3">
              <span className="trade-strategy-icon" style={{ background: "rgba(217, 119, 6, 0.1)", color: "#d97706" }}>
                <Gauge className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold leading-tight">RSI Divergence</h3>
                <p className="text-[11px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Mean reversion
                </p>
              </div>
              <StatusBadge active={!!active.rsi} />
            </div>

            <p className="text-[12.5px] mt-3.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              RSI divergences se reversal points milte hain. 70+ overbought, 30 se neeche oversold.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label="RSI Period" htmlFor="s-rsi-p">
                <NumberInput id="s-rsi-p" min={1} max={50} value={rsi.period} onChange={(e) => setRsi({ ...rsi, period: Number(e.target.value) })} />
              </Field>
              <Field label="Overbought" htmlFor="s-rsi-ob">
                <NumberInput id="s-rsi-ob" min={50} max={90} value={rsi.overbought} onChange={(e) => setRsi({ ...rsi, overbought: Number(e.target.value) })} />
              </Field>
              <Field label="Oversold" htmlFor="s-rsi-os">
                <NumberInput id="s-rsi-os" min={10} max={50} value={rsi.oversold} onChange={(e) => setRsi({ ...rsi, oversold: Number(e.target.value) })} />
              </Field>
              <Field label="Symbol" htmlFor="s-rsi-sym">
                <SymbolSelect id="s-rsi-sym" value={rsi.symbol} onChange={(v) => setRsi({ ...rsi, symbol: v })} />
              </Field>
            </div>

            <div className="flex-1" />
            <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
              <button
                type="button"
                className="trade-btn trade-btn-primary flex-1"
                onClick={() => {
                  setActive((a) => ({ ...a, rsi: true }));
                  setNotice("RSI Divergence activate ho gayi (signal demo).");
                }}
              >
                Activate
              </button>
              <button
                type="button"
                className="trade-btn trade-btn-ghost flex-1"
                onClick={() => onTest(defaultBacktest({
                  symbol: rsi.symbol,
                  use_rsi_filter: true,
                  rsi_period: rsi.period,
                  rsi_overbought: rsi.overbought,
                  rsi_oversold: rsi.oversold,
                }))}
              >
                Test
              </button>
            </div>
          </div>
        </article>

        {/* MACD */}
        <article className="trade-panel trade-strategy" data-active={!!active.macd}>
          <div className="trade-panel-body flex flex-col flex-1">
            <div className="flex items-start gap-3">
              <span className="trade-strategy-icon" style={{ background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed" }}>
                <BarChart3 className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold leading-tight">MACD</h3>
                <p className="text-[11px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Momentum
                </p>
              </div>
              <StatusBadge active={!!active.macd} />
            </div>

            <p className="text-[12.5px] mt-3.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              MACD line jab signal line ke upar cross kare to bullish signal. Neeche cross par bearish.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label="Fast Period" htmlFor="s-macd-f">
                <NumberInput id="s-macd-f" min={1} max={50} value={macd.fast} onChange={(e) => setMacd({ ...macd, fast: Number(e.target.value) })} />
              </Field>
              <Field label="Slow Period" htmlFor="s-macd-s">
                <NumberInput id="s-macd-s" min={1} max={100} value={macd.slow} onChange={(e) => setMacd({ ...macd, slow: Number(e.target.value) })} />
              </Field>
              <Field label="Signal Period" htmlFor="s-macd-sig">
                <NumberInput id="s-macd-sig" min={1} max={50} value={macd.signal} onChange={(e) => setMacd({ ...macd, signal: Number(e.target.value) })} />
              </Field>
              <Field label="Symbol" htmlFor="s-macd-sym">
                <SymbolSelect id="s-macd-sym" value={macd.symbol} onChange={(v) => setMacd({ ...macd, symbol: v })} />
              </Field>
            </div>

            <div className="flex-1" />
            <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
              <button
                type="button"
                className="trade-btn trade-btn-primary flex-1"
                onClick={() => {
                  setActive((a) => ({ ...a, macd: true }));
                  setNotice("MACD strategy activate ho gayi (signal demo). Professional backtest abhi EMA engine par hai.");
                }}
              >
                Activate
              </button>
              <button
                type="button"
                className="trade-btn trade-btn-ghost flex-1"
                onClick={() => {
                  setNotice("MACD test demo mode mein hai — backend abhi EMA crossover backtest run karta hai.");
                  onTest(defaultBacktest({ symbol: macd.symbol, ema9: macd.fast, ema21: macd.signal, ema50: macd.slow }));
                }}
              >
                Test
              </button>
            </div>
          </div>
        </article>
      </div>

      {/* ── Featured: Custom EMA Crossover ────────────────── */}
      <article className="trade-panel trade-featured">
        <div className="trade-panel-head" style={{ paddingTop: 14 }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="trade-strategy-icon" style={{ background: "rgba(37, 99, 235, 0.1)", color: "#2563eb" }}>
              <Zap className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14.5px] font-bold leading-tight">Custom EMA Crossover Strategy</h3>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                EMA 9 &amp; 21 vs EMA 50 · live monitor with optional auto-trade
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {custom.autoTrade && <span className="trade-badge trade-badge-amber">Live trade</span>}
            <StatusBadge active={!!active.custom} label={active.custom ? symbolLabel(custom.symbol) : undefined} />
          </div>
        </div>

        <div className="trade-panel-body">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* Config side */}
            <div className="space-y-5 min-w-0">
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text-primary)" }}>Logic:</strong>{" "}Jab EMA 9 aur EMA 21 dono EMA 50 ko cross down karein to SELL, aur jab cross above ho to BUY.
                Timeframe default 5 minutes. Live trade par mark price se SL / Target par position auto cut ho sakti hai.
              </p>

              <section>
                <div className="trade-section-label">Signal parameters</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="EMA 9" htmlFor="c-e9"><NumberInput id="c-e9" min={1} max={50} value={custom.ema9} onChange={(e) => setCustomField("ema9", Number(e.target.value))} /></Field>
                  <Field label="EMA 21" htmlFor="c-e21"><NumberInput id="c-e21" min={1} max={200} value={custom.ema21} onChange={(e) => setCustomField("ema21", Number(e.target.value))} /></Field>
                  <Field label="EMA 50" htmlFor="c-e50"><NumberInput id="c-e50" min={1} max={200} value={custom.ema50} onChange={(e) => setCustomField("ema50", Number(e.target.value))} /></Field>
                  <Field label="Symbol" htmlFor="c-sym"><SymbolSelect id="c-sym" value={custom.symbol} onChange={(v) => setCustomField("symbol", v)} /></Field>
                </div>
              </section>

              <section>
                <div className="trade-section-label">Execution &amp; risk</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Quantity" htmlFor="c-qty"><NumberInput id="c-qty" min={0.001} step={0.001} value={custom.qty} onChange={(e) => setCustomField("qty", Number(e.target.value))} /></Field>
                  <Field label="Stop loss · pts" htmlFor="c-sl"><NumberInput id="c-sl" min={1} value={custom.sl} onChange={(e) => setCustomField("sl", Number(e.target.value))} /></Field>
                  <Field label="Target · pts" htmlFor="c-tg"><NumberInput id="c-tg" min={1} value={custom.target} onChange={(e) => setCustomField("target", Number(e.target.value))} /></Field>
                  <Field label="Mode" htmlFor="c-mode">
                    <select id="c-mode" value={custom.autoTrade ? "true" : "false"} onChange={(e) => setCustomField("autoTrade", e.target.value === "true")} className="trade-select">
                      <option value="false">Manual (Signal Only)</option>
                      <option value="true">Live (Delta Exchange)</option>
                    </select>
                  </Field>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-6 mt-1">
                  <label className="trade-checkrow">
                    <input type="checkbox" className="trade-check" checked={custom.autoClose} onChange={(e) => setCustomField("autoClose", e.target.checked)} />
                    SL / Target par position auto close
                  </label>
                  <label className="trade-checkrow">
                    <input type="checkbox" className="trade-check" checked={custom.blockEntries} onChange={(e) => setCustomField("blockEntries", e.target.checked)} />
                    Block entries (11:00–14:00 IST)
                  </label>
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Points = entry se kitna move par exit (SL loss side, target profit side).
                </p>
              </section>

              <section className="rounded-xl p-4" style={{ background: "var(--accent-soft)", border: "1px solid rgba(37, 99, 235, 0.2)" }}>
                <div className="trade-section-label">Backtest settings</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Days" htmlFor="c-days"><NumberInput id="c-days" min={1} max={700} value={custom.days} onChange={(e) => setCustomField("days", Number(e.target.value))} /></Field>
                  <Field label="Lots" htmlFor="c-lots"><NumberInput id="c-lots" min={0.01} step={0.01} value={custom.lots} onChange={(e) => setCustomField("lots", Number(e.target.value))} /></Field>
                  <Field label="Timeframe" htmlFor="c-tf"><IntervalSelect id="c-tf" value={custom.timeframe} onChange={(v) => setCustomField("timeframe", v)} /></Field>
                  <label className="trade-checkrow self-end">
                    <input type="checkbox" className="trade-check" checked={custom.useRsi} onChange={(e) => setCustomField("useRsi", e.target.checked)} />
                    Enable RSI
                  </label>
                  <Field label="RSI Period" htmlFor="c-rp"><NumberInput id="c-rp" min={1} max={50} value={custom.rsiPeriod} onChange={(e) => setCustomField("rsiPeriod", Number(e.target.value))} /></Field>
                  <Field label="Overbought" htmlFor="c-rob"><NumberInput id="c-rob" min={50} max={100} value={custom.rsiOverbought} onChange={(e) => setCustomField("rsiOverbought", Number(e.target.value))} /></Field>
                  <Field label="Oversold" htmlFor="c-ros"><NumberInput id="c-ros" min={0} max={50} value={custom.rsiOversold} onChange={(e) => setCustomField("rsiOversold", Number(e.target.value))} /></Field>
                  <label className="trade-checkrow self-end">
                    <input type="checkbox" className="trade-check" checked={custom.backtestBlock} onChange={(e) => setCustomField("backtestBlock", e.target.checked)} />
                    Block 11:00–14:00
                  </label>
                </div>
              </section>
            </div>

            {/* Live monitor side */}
            <aside className="rounded-xl p-4 space-y-3.5 self-start" style={{ background: "var(--tr-field)", border: "1px solid var(--tr-line)" }}>
              <div className="flex items-center justify-between">
                <span className="trade-panel-title">Live monitor</span>
                {active.custom ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--green)" }}>
                    <span className="trade-dot" />
                    Streaming
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Idle</span>
                )}
              </div>

              {active.custom ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <LiveStat label={`EMA ${custom.ema9}`} value={live.ema9?.toFixed(2) ?? "—"} color="#2563eb" />
                    <LiveStat label={`EMA ${custom.ema21}`} value={live.ema21?.toFixed(2) ?? "—"} color="#d97706" />
                    <LiveStat label={`EMA ${custom.ema50}`} value={live.ema50?.toFixed(2) ?? "—"} color="#7c3aed" />
                    <LiveStat label="Price" value={live.price != null ? live.price.toFixed(2) : "—"} />
                  </div>

                  <div className="rounded-[10px] px-3 py-2.5" style={{ background: "var(--bg-card)", border: "1px solid var(--tr-line)" }}>
                    <div className="trade-stat-label">Crossover analysis</div>
                    <p className="mt-1 text-[13px] font-bold leading-snug" style={{ color: stateTone }}>{live.state}</p>
                  </div>

                  <div>
                    <div className="trade-stat-label mb-1.5">Event log</div>
                    <div className="trade-console">
                      {live.logs.length === 0
                        ? "Waiting for data…"
                        : live.logs.map((line) => {
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
                </>
              ) : (
                <div className="trade-empty">
                  <span className="trade-empty-icon"><Activity className="w-4 h-4" /></span>
                  Activate karo — EMA values, price aur crossover signals yahan live dikhenge.
                </div>
              )}
            </aside>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
            <button
              type="button"
              className="trade-btn trade-btn-primary"
              onClick={() => {
                setActive((a) => ({ ...a, custom: true }));
                log(`Strategy activated — ${custom.symbol}, auto trade ${custom.autoTrade ? "ON" : "OFF"}`);
                setNotice("Custom EMA Strategy live monitor start ho gayi.");
              }}
            >
              <Play className="w-4 h-4" />
              Activate (Live)
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-ghost"
              onClick={() => {
                setActive((a) => ({ ...a, custom: false }));
                log("Strategy deactivated");
                setNotice("Custom EMA Strategy deactivate ho gayi.");
              }}
            >
              <Power className="w-3.5 h-3.5" />
              Deactivate
            </button>
            <button type="button" disabled={running} className="trade-btn trade-btn-ghost" onClick={() => onBacktest(customParams())}>
              {running ? "Backtest chal raha hai…" : "Run Professional Backtest"}
            </button>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-[12.5px] mt-3" style={{ color: "var(--red)" }}>
              <AlertCircle className="w-4 h-4 mt-px flex-none" />
              {error}
            </p>
          )}

          {result?.success && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <LiveStat label="Trades" value={String(result.total_trades ?? 0)} />
              <LiveStat label="Win rate" value={`${result.win_rate ?? 0}%`} color={Number(result.win_rate) >= 50 ? "var(--green)" : "var(--red)"} />
              <LiveStat label="Net P&L" value={Number(result.total_profit ?? 0).toFixed(2)} color={Number(result.total_profit) >= 0 ? "var(--green)" : "var(--red)"} />
              <LiveStat label="Days covered" value={String(result.days_covered ?? 0)} />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function LiveStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[10px] px-3 py-2" style={{ background: "var(--bg-card)", border: "1px solid var(--tr-line)" }}>
      <div className="trade-stat-label">{label}</div>
      <div className="text-[13.5px] font-bold mt-1 tnum" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
