"use client";

import { FlaskConical } from "lucide-react";
import type { BacktestResult } from "@/lib/cryptoApi";
import { symbolLabel } from "@/lib/cryptoApi";

interface Props {
  running: boolean;
  result: BacktestResult | null;
  /** Result mein symbol/timeframe na aaye to inhi se label banta hai. */
  fallbackSymbol: string;
  fallbackTimeframe: string;
  emptyHint: React.ReactNode;
}

/** entry_time seconds ya milliseconds dono mein aa sakta hai — format se pehle normalise. */
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

/** Backend TARGET_HIT / SL_HIT bhejta hai — usi hisaab se colour. */
function statusTone(status?: string): string {
  const s = String(status || "").toLowerCase();
  if (s.includes("target")) return "trade-badge-green";
  if (s.includes("sl") || s.includes("stop")) return "trade-badge-red";
  return "trade-badge-neutral";
}

function prettyStatus(status?: string): string {
  return String(status || "—").replace(/_/g, " ");
}

export default function BacktestResults({ running, result, fallbackSymbol, fallbackTimeframe, emptyHint }: Props) {
  const trades = result?.trades?.slice().reverse().slice(0, 40) ?? [];
  const wins = Number(result?.winning_trades ?? 0);
  const losses = Number(result?.losing_trades ?? 0);
  const settled = wins + losses;
  const winPct = settled > 0 ? (wins / settled) * 100 : 0;
  const profit = Number(result?.total_profit ?? 0);

  // Backend period ke timestamps alag se nahi bhejta — trades se nikaal lete hain.
  const allTrades = result?.trades ?? [];
  const firstTrade = allTrades[0];
  const lastTrade = allTrades[allTrades.length - 1];
  const testedPeriod = firstTrade
    ? `${fmtTime(firstTrade.entry_time)} → ${fmtTime(lastTrade.exit_time || lastTrade.entry_time)}  (${result?.days_covered ?? 0} din)`
    : `${result?.days_covered ?? 0} din · ${result?.total_candles ?? 0} candles`;

  if (running) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer rounded-xl h-[92px]" />)}
      </div>
    );
  }

  if (!result?.success) {
    return (
      <div className="trade-panel">
        <div className="trade-empty trade-empty-lg">
          <span className="trade-empty-icon trade-empty-icon-lg"><FlaskConical className="w-5 h-5" /></span>
          <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
            Abhi tak koi backtest nahi chala
          </p>
          <p className="max-w-[320px]">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="trade-panel trade-panel-body flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        <span>
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Tested period:</span>{" "}
          <span className="tnum">{testedPeriod}</span>
        </span>
        {result.days_requested != null && (
          <span className="tnum">Requested {result.days_requested} din</span>
        )}
        {result.range_settings && (
          <span className="tnum">
            Range {result.range_settings.start}–{result.range_settings.end} {result.range_settings.timezone}
          </span>
        )}
        {result.ema_periods && (
          <span className="tnum">EMA {result.ema_periods.ema9}/{result.ema_periods.ema21}/{result.ema_periods.ema50}</span>
        )}
        {result.rsi_settings?.enabled && (
          <span className="tnum">
            RSI {result.rsi_settings.period} · {result.rsi_settings.oversold}/{result.rsi_settings.overbought}
          </span>
        )}
        <span className="tnum">SL {result.sl_points} · Target {result.target_points}</span>
      </div>

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
            {symbolLabel(result.symbol || fallbackSymbol)} · {result.strategy} · {result.timeframe ?? fallbackTimeframe} · showing {trades.length}
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
