"use client";

import { useState } from "react";
import { AlertCircle, FlaskConical, Play } from "lucide-react";
import type { BacktestParams, BacktestResult } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";

interface Props {
  defaults: Partial<BacktestParams>;
  running: boolean;
  result: BacktestResult | null;
  error: string | null;
  onRun: (params: BacktestParams) => void;
}

/** entry_time may arrive in seconds or milliseconds — normalise before formatting. */
function fmtTime(value?: number): string {
  if (!value) return "—";
  const ms = value < 1e12 ? value * 1000 : value;
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Backend reports outcomes as TARGET_HIT / SL_HIT — colour them accordingly. */
function statusTone(status?: string): string {
  const s = String(status || "").toLowerCase();
  if (s.includes("target")) return "trade-badge-green";
  if (s.includes("sl") || s.includes("stop")) return "trade-badge-red";
  return "trade-badge-neutral";
}

function prettyStatus(status?: string): string {
  return String(status || "—").replace(/_/g, " ");
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
  });

  const set = <K extends keyof BacktestParams>(key: K, value: BacktestParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const trades = result?.trades?.slice().reverse().slice(0, 40) ?? [];
  const wins = Number(result?.winning_trades ?? 0);
  const losses = Number(result?.losing_trades ?? 0);
  const settled = wins + losses;
  const winPct = settled > 0 ? (wins / settled) * 100 : 0;
  const profit = Number(result?.total_profit ?? 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[370px_minmax(0,1fr)] items-start">
      {/* ── Config rail ───────────────────────────────────── */}
      <div className="trade-panel xl:sticky xl:top-[116px]">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Backtest settings</span>
          <span className="trade-badge trade-badge-blue">{params.strategy === "ema-crossover" ? "EMA" : "Range"}</span>
        </div>

        <div className="trade-panel-body space-y-5">
          <section>
            <div className="trade-section-label">Strategy</div>
            <select
              value={params.strategy}
              onChange={(e) => set("strategy", e.target.value as BacktestParams["strategy"])}
              className="trade-select font-semibold"
              aria-label="Strategy"
            >
              <option value="ema-crossover">EMA Crossover</option>
              <option value="range-breakout">Range Breakout</option>
            </select>
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
            <label className="trade-checkrow mt-1">
              <input type="checkbox" className="trade-check" checked={params.use_no_entry_window} onChange={(e) => set("use_no_entry_window", e.target.checked)} />
              Block entries (11:00–14:00 IST)
            </label>
          </section>

          {params.strategy === "ema-crossover" && (
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
            <div className="trade-section-label">RSI filter</div>
            <label className="trade-checkrow">
              <input type="checkbox" className="trade-check" checked={params.use_rsi_filter} onChange={(e) => set("use_rsi_filter", e.target.checked)} />
              Enable RSI confirmation
            </label>
            {params.use_rsi_filter && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-p">Period</label>
                  <input id="bt-rsi-p" type="number" min={1} max={50} value={params.rsi_period} onChange={(e) => set("rsi_period", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-ob">Overbght</label>
                  <input id="bt-rsi-ob" type="number" min={50} max={100} value={params.rsi_overbought} onChange={(e) => set("rsi_overbought", Number(e.target.value))} className="trade-input" />
                </div>
                <div>
                  <label className="trade-label" htmlFor="bt-rsi-os">Oversold</label>
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
      <div className="space-y-4 min-w-0">
        {running && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer rounded-xl h-[92px]" />)}
          </div>
        )}

        {!running && !result?.success && (
          <div className="trade-panel">
            <div className="trade-empty trade-empty-lg">
              <span className="trade-empty-icon trade-empty-icon-lg"><FlaskConical className="w-5 h-5" /></span>
              <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
                Abhi tak koi backtest nahi chala
              </p>
              <p className="max-w-[320px]">
                Left panel se settings choose karke <b>Run backtest</b>{" "}dabao — trades, win rate aur P&amp;L yahan aayenge.
              </p>
            </div>
          </div>
        )}

        {!running && result?.success && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Total trades" value={String(result.total_trades ?? 0)} sub={`${result.total_signals ?? 0} signals generated`} />
              <Kpi
                label="Win rate"
                value={`${result.win_rate ?? 0}%`}
                color={Number(result.win_rate) >= 50 ? "var(--green)" : "var(--red)"}
                sub={`${wins}W · ${losses}L`}
              />
              <Kpi
                label="Net P&L"
                value={`${profit >= 0 ? "+" : ""}${profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                color={profit >= 0 ? "var(--green)" : "var(--red)"}
                sub={`${result.lots ?? 1} lot(s)`}
              />
              <Kpi label="Days covered" value={String(result.days_covered ?? 0)} sub={`${result.total_candles ?? 0} candles`} />
            </div>

            {settled > 0 && (
              <div className="trade-panel trade-panel-body">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="trade-panel-title">Outcome split</span>
                  <span className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
                    Target hits {result.target_hits ?? 0} · SL hits {result.sl_hits ?? 0}
                  </span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--tr-line-soft)" }}>
                  <div style={{ width: `${winPct}%`, background: "var(--green)" }} />
                  <div style={{ width: `${100 - winPct}%`, background: "var(--red)", opacity: 0.8 }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11.5px] font-semibold tnum">
                  <span style={{ color: "var(--green)" }}>{wins} wins</span>
                  <span style={{ color: "var(--red)" }}>{losses} losses</span>
                </div>
              </div>
            )}

            <div className="trade-panel overflow-hidden">
              <div className="trade-panel-head">
                <span className="trade-panel-title">Trade log</span>
                <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  {symbolLabel(result.symbol || params.symbol)} · {result.strategy} · {result.timeframe ?? params.timeframe} · showing {trades.length}
                </span>
              </div>
              {trades.length === 0 ? (
                <div className="trade-empty trade-empty-md">Is period mein koi completed trade nahi mili</div>
              ) : (
                <div className="overflow-auto max-h-[560px]">
                  <table className="trade-table">
                    <thead>
                      <tr>
                        <th>Side</th>
                        <th>Entry time</th>
                        <th className="trade-num">Entry</th>
                        <th className="trade-num">Exit</th>
                        <th>Status</th>
                        <th className="trade-num">Points</th>
                        <th className="trade-num">P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => {
                        const up = t.pnl >= 0;
                        return (
                          <tr key={`${t.entry_time}-${i}`}>
                            <td>
                              <span className={`trade-badge ${t.side === "buy" ? "trade-badge-green" : "trade-badge-red"}`}>{t.side}</span>
                            </td>
                            <td style={{ color: "var(--text-muted)" }}>{fmtTime(t.entry_time)}</td>
                            <td className="trade-num">{t.entry_price?.toFixed(2)}</td>
                            <td className="trade-num">{t.exit_price?.toFixed(2)}</td>
                            <td>
                              <span className={`trade-badge ${statusTone(t.status)}`}>{prettyStatus(t.status)}</span>
                            </td>
                            <td className="trade-num" style={{ color: "var(--text-muted)" }}>{t.pnl_points?.toFixed(1)}</td>
                            <td className="trade-num font-bold" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                              {up ? "+" : ""}{t.pnl.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="trade-kpi">
      <p className="trade-stat-label">{label}</p>
      <p className="trade-kpi-value" style={{ color: color ?? "var(--text-primary)" }}>{value}</p>
      {sub && <p className="trade-kpi-sub tnum">{sub}</p>}
    </div>
  );
}
