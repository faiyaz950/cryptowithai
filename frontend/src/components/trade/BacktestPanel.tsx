"use client";

import { useState } from "react";
import { AlertCircle, Play } from "lucide-react";
import BacktestResults from "@/components/trade/BacktestResults";
import type { BacktestParams, BacktestResult } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS } from "@/lib/cryptoApi";
import { RANGE_TIMEZONES, STRATEGIES } from "@/lib/strategies";

interface Props {
  defaults: Partial<BacktestParams>;
  running: boolean;
  result: BacktestResult | null;
  error: string | null;
  onRun: (params: BacktestParams) => void;
}

export default function BacktestPanel({ defaults, running, result, error, onRun }: Props) {
  const [params, setParams] = useState<BacktestParams>({
    strategy: defaults.strategy ?? "ema-crossover",
    symbol: defaults.symbol ?? "BTCUSDT",
    timeframe: defaults.timeframe ?? "5m",
    days: defaults.days ?? 30,
    sl_points: defaults.sl_points ?? 400,
    target_points: defaults.target_points ?? 800,
    lots: defaults.lots ?? 1,
    ema9: defaults.ema9 ?? 9,
    ema21: defaults.ema21 ?? 21,
    ema50: defaults.ema50 ?? 50,
    use_rsi_filter: defaults.use_rsi_filter ?? false,
    rsi_period: defaults.rsi_period ?? 14,
    rsi_overbought: defaults.rsi_overbought ?? 60,
    rsi_oversold: defaults.rsi_oversold ?? 40,
    use_no_entry_window: defaults.use_no_entry_window ?? true,
    range_start: defaults.range_start ?? "11:00",
    range_end: defaults.range_end ?? "13:00",
    range_timezone: defaults.range_timezone ?? "Asia/Kolkata",
  });

  // Range breakout engine RSI hamesha use karta hai aur no-entry window ignore karta hai.
  const isRange = params.strategy === "range-breakout";

  /**
   * Dropdown registry se banti hai, hardcoded list se nahi — warna nayi strategy
   * add karne par ye panel peeche reh jaata hai.
   *
   * Sirf wahi strategies aati hain jo backend ke do engines par imaandari se
   * chal sakti hain. Options wali (`backtestable: false`) yahan nahi hain: unhe
   * chalane par backtest EMA crossover ka result de deta, jiska us strategy se
   * koi taalluk nahi hota — aur galat number dikhane se na dikhana behtar hai.
   */
  const backtestable = STRATEGIES.filter((d) => d.backtestable !== false);
  const [strategyId, setStrategyId] = useState<string>(() => backtestable[0]?.id ?? "custom-ema");
  const selectedDef = STRATEGIES.find((d) => d.id === strategyId);

  const pickStrategy = (id: string) => {
    const def = STRATEGIES.find((d) => d.id === id);
    if (!def || def.backtestable === false) return;
    setStrategyId(id);
    // Us strategy ke apne parameters le aao, par market/window jaisa hai waisa rakho.
    setParams((prev) => ({
      ...def.toBacktest(def.defaults),
      symbol: prev.symbol,
      timeframe: prev.timeframe,
      days: prev.days,
      lots: prev.lots,
    }));
  };

  const set = <K extends keyof BacktestParams>(key: K, value: BacktestParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[370px_minmax(0,1fr)] items-start">
      {/* ── Config rail ───────────────────────────────────── */}
      <div className="trade-panel xl:sticky xl:top-[116px]">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Backtest settings</span>
          <span className="trade-badge trade-badge-blue">{isRange ? "Range engine" : "EMA engine"}</span>
        </div>

        <div className="trade-panel-body space-y-5">
          <section>
            <div className="trade-section-label">Strategy</div>
            <select
              value={strategyId}
              onChange={(e) => pickStrategy(e.target.value)}
              className="trade-select font-semibold"
              aria-label="Strategy"
            >
              {backtestable.map((def) => (
                <option key={def.id} value={def.id}>{def.name}</option>
              ))}
            </select>
            {selectedDef?.engineNote && (
              <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {selectedDef.engineNote}
              </p>
            )}
          </section>

          <section>
            <div className="trade-section-label">Market</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="trade-label" htmlFor="bt-symbol">Symbol</label>
                <select id="bt-symbol" value={params.symbol} onChange={(e) => set("symbol", e.target.value)} className="trade-select">
                  {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="trade-label" htmlFor="bt-tf">Timeframe</label>
                <select id="bt-tf" value={params.timeframe} onChange={(e) => set("timeframe", e.target.value)} className="trade-select">
                  {CRYPTO_INTERVALS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="trade-label" htmlFor="bt-days">Days</label>
                <input id="bt-days" type="number" min={1} max={700} value={params.days} onChange={(e) => set("days", Number(e.target.value))} className="trade-input" />
              </div>
              <div>
                <label className="trade-label" htmlFor="bt-lots">Lots</label>
                <input id="bt-lots" type="number" min={0.01} step={0.01} value={params.lots} onChange={(e) => set("lots", Number(e.target.value))} className="trade-input" />
              </div>
            </div>
          </section>

          <section>
            <div className="trade-section-label">Risk</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="trade-label" htmlFor="bt-sl">Stop loss · pts</label>
                <input id="bt-sl" type="number" value={params.sl_points} onChange={(e) => set("sl_points", Number(e.target.value))} className="trade-input" />
              </div>
              <div>
                <label className="trade-label" htmlFor="bt-target">Target · pts</label>
                <input id="bt-target" type="number" value={params.target_points} onChange={(e) => set("target_points", Number(e.target.value))} className="trade-input" />
              </div>
            </div>
            {!isRange && (
              <label className="trade-checkrow mt-1">
                <input type="checkbox" className="trade-check" checked={params.use_no_entry_window} onChange={(e) => set("use_no_entry_window", e.target.checked)} />
                Block entries (11:00–14:00 IST)
              </label>
            )}
          </section>

          {isRange && (
            <section>
              <div className="trade-section-label">Range window</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="trade-label" htmlFor="bt-range-start">Start</label>
                  <input id="bt-range-start" type="time" value={params.range_start} onChange={(e) => set("range_start", e.target.value)} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-range-end">End</label>
                  <input id="bt-range-end" type="time" value={params.range_end} onChange={(e) => set("range_end", e.target.value)} className="trade-input" />
                </div>
              </div>
              <div className="mt-3">
                <label className="trade-label" htmlFor="bt-range-tz">Timezone</label>
                <select id="bt-range-tz" value={params.range_timezone} onChange={(e) => set("range_timezone", e.target.value)} className="trade-select">
                  {RANGE_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Is window ke high/low se din ka range banta hai; uske baad breakout par entry.
              </p>
            </section>
          )}

          {!isRange && (
            <section>
              <div className="trade-section-label">EMA periods</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="trade-label" htmlFor="bt-ema9">Fast</label>
                  <input id="bt-ema9" type="number" value={params.ema9} onChange={(e) => set("ema9", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-ema21">Mid</label>
                  <input id="bt-ema21" type="number" value={params.ema21} onChange={(e) => set("ema21", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-ema50">Slow</label>
                  <input id="bt-ema50" type="number" value={params.ema50} onChange={(e) => set("ema50", Number(e.target.value))} className="trade-input" />
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="trade-section-label">{isRange ? "RSI confirmation" : "RSI filter"}</div>
            {isRange ? (
              <p className="text-[11.5px] mb-2" style={{ color: "var(--text-muted)" }}>
                Range breakout engine RSI hamesha use karta hai — upar ka breakout upper level se upar, neeche ka lower level se neeche confirm hota hai.
              </p>
            ) : (
              <label className="trade-checkrow">
                <input type="checkbox" className="trade-check" checked={params.use_rsi_filter} onChange={(e) => set("use_rsi_filter", e.target.checked)} />
                Enable RSI confirmation
              </label>
            )}
            {(isRange || params.use_rsi_filter) && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-p">Period</label>
                  <input id="bt-rsi-p" type="number" min={1} max={50} value={params.rsi_period} onChange={(e) => set("rsi_period", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-ob">{isRange ? "Upper" : "Overbght"}</label>
                  <input id="bt-rsi-ob" type="number" min={50} max={100} value={params.rsi_overbought} onChange={(e) => set("rsi_overbought", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-os">{isRange ? "Lower" : "Oversold"}</label>
                  <input id="bt-rsi-os" type="number" min={0} max={50} value={params.rsi_oversold} onChange={(e) => set("rsi_oversold", Number(e.target.value))} className="trade-input" />
                </div>
              </div>
            )}
          </section>

          <button type="button" disabled={running} onClick={() => onRun(params)} className="trade-btn trade-btn-primary trade-btn-lg w-full">
            <Play className="w-4 h-4" />
            {running ? "Running backtest…" : "Run backtest"}
          </button>

          {error && (
            <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
              <AlertCircle className="w-4 h-4 mt-px flex-none" />
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────── */}
      <div className="min-w-0">
        <BacktestResults
          running={running}
          result={result}
          fallbackSymbol={params.symbol}
          fallbackTimeframe={params.timeframe}
          emptyHint={<>Left panel se settings choose karke <b>Run backtest</b>{" "}dabao — trades, win rate aur P&amp;L yahan aayenge.</>}
        />
      </div>
    </div>
  );
}
