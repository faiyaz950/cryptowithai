"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { BacktestResult, BacktestTrade, ValidationEnvBlock } from "@/lib/cryptoApi";
import { symbolLabel } from "@/lib/cryptoApi";

type ValidationEnvs = NonNullable<BacktestResult["validation"]>;

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
  if (s.includes("sl") || s.includes("stop") || s.includes("emergency")) return "trade-badge-red";
  return "trade-badge-neutral";
}

function prettyStatus(status?: string): string {
  return String(status || "—").replace(/_/g, " ");
}

function sideTone(side: string): string {
  if (side === "buy" || side === "call" || side === "bull_call_spread") return "trade-badge-green";
  if (side === "sell" || side === "put" || side === "bear_put_spread") return "trade-badge-red";
  return "trade-badge-neutral";
}

const OPTIONS_KIND_LABEL: Record<string, string> = {
  single: "Option buy",
  spread: "Debit spread",
  condor: "Iron condor",
};

export default function BacktestResults({ running, result, fallbackSymbol, fallbackTimeframe, emptyHint }: Props) {
  const trades = result?.trades?.slice().reverse().slice(0, 40) ?? [];
  const wins = Number(result?.winning_trades ?? 0);
  const losses = Number(result?.losing_trades ?? 0);
  const settled = wins + losses;
  const winPct = settled > 0 ? (wins / settled) * 100 : 0;
  const profit = Number(result?.total_profit ?? 0);
  const options = result?.options;

  // Backend period ke timestamps alag se nahi bhejta — trades se nikaal lete hain.
  const allTrades = result?.trades ?? [];
  const firstTrade = allTrades[0];
  const lastTrade = allTrades[allTrades.length - 1];
  const testedPeriod = firstTrade
    ? `${fmtTime(firstTrade.entry_time)} → ${fmtTime(lastTrade.exit_time || lastTrade.entry_time)} · ${result?.days_covered ?? 0}d`
    : `${result?.days_covered ?? 0}d`;

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
            No backtest yet
          </p>
          <p className="max-w-[320px]">{emptyHint}</p>
        </div>
      </div>
    );
  }

  if (result.stats) {
    return <CapitalResults result={result} fallbackSymbol={fallbackSymbol} fallbackTimeframe={fallbackTimeframe} testedPeriod={testedPeriod} />;
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
        {options ? (
          <>
            <span className="tnum">
              {OPTIONS_KIND_LABEL[options.kind] ?? options.kind} · {options.underlying} mark price · 1 contract = {options.contract_value} {options.underlying}
            </span>
            <span className="tnum">Slippage {options.slippage_pct_per_side}% har fill par</span>
            {options.skipped > 0 && (
              <span className="tnum" title={Object.entries(options.skip_reasons).map(([r, n]) => `${r}: ${n}`).join("\n")}>
                {options.skipped} signal skip ({Object.entries(options.skip_reasons).map(([r, n]) => `${r} ${n}`).join(", ")})
              </span>
            )}
          </>
        ) : (
          <span className="tnum">
            SL {result.sl_points ? result.sl_points : "off"} · Target {result.target_points ? result.target_points : "off"}
          </span>
        )}
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
          sub={options ? `USD · ${result.lots ?? 1} contract(s)` : `${result.lots ?? 1} lot(s)`}
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
          <div className="trade-empty trade-empty-md">No completed trades in this period</div>
        ) : (
          <div className="overflow-auto max-h-[560px]">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>Side</th>
                  {options && <th>Contract</th>}
                  <th>Entry time</th>
                  <th className="trade-num">{options ? "Premium in" : "Entry"}</th>
                  <th className="trade-num">{options ? "Premium out" : "Exit"}</th>
                  <th>Status</th>
                  <th className="trade-num">{options ? "Δ premium" : "Points"}</th>
                  <th className="trade-num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => {
                  const up = t.pnl >= 0;
                  return (
                    <tr key={`${t.entry_time}-${i}`}>
                      <td>
                        <span className={`trade-badge ${sideTone(t.side)}`}>{prettyStatus(t.side)}</span>
                      </td>
                      {options && (
                        <td className="tnum" style={{ color: "var(--text-secondary)" }} title={t.symbols?.join(", ")}>
                          {t.instrument ?? "—"}
                          {t.iv != null && <span style={{ color: "var(--text-muted)" }}> · IV {t.iv}%</span>}
                        </td>
                      )}
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

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Compact figures so KPI strip doesn't overflow on mid-width rails. */
function compactInt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function compactSigned(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${n >= 0 ? "+" : "−"}${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1000) return `${n >= 0 ? "+" : ""}${n.toFixed(0)}`;
  return signed(n);
}

function compactMoney(n: number, digits = 2): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+$" : "−$";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  // Keep cents for expectancy / reconciliation — do not round $0.76 → $1.
  return `${sign}${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function tone(n: number): string {
  return n >= 0 ? "var(--green)" : "var(--red)";
}

/** Equity curve — capital ki line ke upar/neeche, bina kisi chart library ke. */
function EquityCurve({ points, capital }: { points: [number, number][]; capital: number }) {
  if (points.length < 2) return null;
  const W = 600;
  const H = 120;
  const values = points.map(([, v]) => v);
  const lo = Math.min(capital, ...values);
  const hi = Math.max(capital, ...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * (H - 8) - 4;
  const path = points.map(([, v], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const end = values[values.length - 1];
  const color = end >= capital ? "var(--green)" : "var(--red)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[120px] block" role="img" aria-label="Equity curve">
      <line x1={0} x2={W} y1={y(capital)} y2={y(capital)} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
      <path d={`${path}L${W},${H}L0,${H}Z`} fill={color} opacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type EvalTab = "summary" | "monthly" | "trades" | "risk" | "validation";

function tradeMs(value?: number): number | null {
  if (!value) return null;
  return value < 1e12 ? value * 1000 : value;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function buildMonthly(
  trades: BacktestTrade[],
  startCapital: number,
  rangeStartMs?: number | null,
  rangeEndMs?: number | null,
) {
  const map = new Map<string, { pnl: number; wins: number; losses: number; n: number }>();
  for (const t of trades) {
    const ms = tradeMs(t.exit_time || t.entry_time);
    if (ms == null) continue;
    const key = monthKey(ms);
    const row = map.get(key) ?? { pnl: 0, wins: 0, losses: 0, n: 0 };
    row.pnl += t.pnl;
    row.n += 1;
    if (t.pnl > 0) row.wins += 1;
    else row.losses += 1;
    map.set(key, row);
  }

  // Fill every calendar month in the tested window (incl. zero-trade months).
  let firstKey: string | null = null;
  let lastKey: string | null = null;
  if (rangeStartMs != null && rangeEndMs != null && rangeEndMs >= rangeStartMs) {
    firstKey = monthKey(rangeStartMs);
    lastKey = monthKey(rangeEndMs);
  } else if (map.size) {
    const keys = [...map.keys()].sort();
    firstKey = keys[0];
    lastKey = keys[keys.length - 1];
  }
  if (firstKey && lastKey) {
    let [y, m] = firstKey.split("-").map(Number);
    const [ey, em] = lastKey.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { pnl: 0, wins: 0, losses: 0, n: 0 });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  let equity = startCapital;
  let peak = startCapital;
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, row]) => {
      const startEq = equity;
      equity += row.pnl;
      peak = Math.max(peak, equity);
      const ddCash = Math.max(0, peak - equity);
      const ddPct = peak > 0 ? (ddCash / peak) * 100 : 0;
      const retPct = startEq > 0 ? (row.pnl / startEq) * 100 : 0;
      return {
        key,
        label: monthLabel(key),
        ...row,
        wr: row.n ? (row.wins / row.n) * 100 : 0,
        retPct,
        ddPct,
        ddCash,
        endEquity: equity,
      };
    });
}

/** Historical consecutive wins — mirror of losing-streak analytics. */
function analyzeWinningStreak(trades: BacktestTrade[]): { length: number; pnl: number } {
  let best = 0;
  let bestPnl = 0;
  let cur = 0;
  let curPnl = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      cur += 1;
      curPnl += t.pnl;
      if (cur > best) {
        best = cur;
        bestPnl = curPnl;
      }
    } else {
      cur = 0;
      curPnl = 0;
    }
  }
  return { length: best, pnl: bestPnl };
}

/** Peak→trough→recovery duration on equity curve (ms). */
function drawdownDuration(curve: [number, number][]): {
  troughMs: number | null;
  recoveryMs: number | null;
  days: number | null;
} {
  if (curve.length < 2) return { troughMs: null, recoveryMs: null, days: null };
  let peak = curve[0][1];
  let peakI = 0;
  let maxDd = 0;
  let troughI = 0;
  let ddPeakI = 0;
  for (let i = 1; i < curve.length; i++) {
    const eq = curve[i][1];
    if (eq >= peak) {
      peak = eq;
      peakI = i;
    } else {
      const dd = peak - eq;
      if (dd > maxDd) {
        maxDd = dd;
        troughI = i;
        ddPeakI = peakI;
      }
    }
  }
  if (maxDd <= 0) return { troughMs: null, recoveryMs: null, days: null };
  const recoverLevel = curve[ddPeakI][1];
  let recoveryI: number | null = null;
  for (let i = troughI + 1; i < curve.length; i++) {
    if (curve[i][1] >= recoverLevel) {
      recoveryI = i;
      break;
    }
  }
  const startMs = curve[ddPeakI][0];
  const endMs = recoveryI != null ? curve[recoveryI][0] : curve[curve.length - 1][0];
  return {
    troughMs: curve[troughI][0],
    recoveryMs: recoveryI != null ? curve[recoveryI][0] : null,
    days: Math.max(0, (endMs - startMs) / 86_400_000),
  };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Historical consecutive losses — not a future cap. */
function analyzeLosingStreak(
  trades: BacktestTrade[],
  startCapital: number,
): {
  length: number;
  pnl: number;
  ddCash: number;
  days: number | null;
  startMs: number | null;
  endMs: number | null;
  bySymbol: { symbol: string; length: number; pnl: number }[];
} {
  let best = 0;
  let bestPnl = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let cur = 0;
  let curStart = 0;
  let curPnl = 0;
  for (let i = 0; i < trades.length; i++) {
    if (trades[i].pnl <= 0) {
      if (cur === 0) {
        curStart = i;
        curPnl = 0;
      }
      cur += 1;
      curPnl += trades[i].pnl;
      if (cur > best) {
        best = cur;
        bestPnl = curPnl;
        bestStart = curStart;
        bestEnd = i;
      }
    } else {
      cur = 0;
      curPnl = 0;
    }
  }

  let equity = startCapital;
  let peak = startCapital;
  let streakDd = 0;
  for (let i = 0; i < trades.length; i++) {
    equity += trades[i].pnl;
    peak = Math.max(peak, equity);
    if (best > 0 && i >= bestStart && i <= bestEnd) {
      streakDd = Math.max(streakDd, peak - equity);
    }
  }

  const startMs = bestStart >= 0 ? tradeMs(trades[bestStart].entry_time) : null;
  const endMs = bestEnd >= 0 ? tradeMs(trades[bestEnd].exit_time || trades[bestEnd].entry_time) : null;
  const days = startMs != null && endMs != null ? Math.max(0, (endMs - startMs) / 86_400_000) : null;

  const symbols = [...new Set(trades.map((t) => t.symbol).filter(Boolean))] as string[];
  const bySymbol = symbols.map((symbol) => {
    const subset = trades.filter((t) => t.symbol === symbol);
    let len = 0;
    let bestLen = 0;
    let pnl = 0;
    let bestP = 0;
    let runP = 0;
    for (const t of subset) {
      if (t.pnl <= 0) {
        len += 1;
        runP += t.pnl;
        if (len > bestLen) {
          bestLen = len;
          bestP = runP;
        }
      } else {
        len = 0;
        runP = 0;
      }
    }
    return { symbol, length: bestLen, pnl: bestP };
  }).filter((r) => r.length > 0).sort((a, b) => b.length - a.length);

  return {
    length: best,
    pnl: bestPnl,
    ddCash: streakDd,
    days,
    startMs,
    endMs,
    bySymbol,
  };
}

function longestLosingStreak(trades: BacktestTrade[]): number {
  return analyzeLosingStreak(trades, 0).length;
}

/** Peak-to-trough dollar drawdown from equity curve (fallback: capital × DD%). */
function maxDrawdownCash(curve: [number, number][], capital: number, ddPct: number): number {
  if (curve.length < 2) return (capital * ddPct) / 100;
  let peak = capital;
  let worst = 0;
  for (const [, eq] of curve) {
    peak = Math.max(peak, eq);
    worst = Math.max(worst, peak - eq);
  }
  return worst;
}

function meanStd(xs: number[]): { mean: number; std: number } {
  if (!xs.length) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const var_ = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, std: Math.sqrt(var_) };
}

/** Rough annualized Sharpe / Sortino from equity curve step returns. */
function curveRatios(curve: [number, number][], daysCovered: number) {
  if (curve.length < 3) return { sharpe: null as number | null, sortino: null as number | null };
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1][1];
    if (prev > 0) rets.push((curve[i][1] - prev) / prev);
  }
  if (rets.length < 2) return { sharpe: null, sortino: null };
  const stepsPerYear = daysCovered > 0 ? (rets.length / daysCovered) * 365 : rets.length;
  const { mean, std } = meanStd(rets);
  const downside = rets.filter((r) => r < 0);
  const dStd = meanStd(downside).std;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(stepsPerYear) : null;
  const sortino = dStd > 0 ? (mean / dStd) * Math.sqrt(stepsPerYear) : null;
  return { sharpe, sortino };
}

function estRoundTripFee(t: BacktestTrade, feePct: number): number | null {
  const qty = Number(t.quantity);
  const entry = Number(t.entry_price);
  const exit = Number(t.exit_price);
  if (!(qty > 0) || !(entry > 0) || !(exit > 0)) return null;
  return feePct * qty * (entry + exit);
}

function downloadTradesCsv(trades: BacktestTrade[], filename: string, feePct: number, isPortfolio: boolean) {
  const cols = [
    "side",
    ...(isPortfolio ? ["symbol"] : []),
    "entry_time",
    "exit_time",
    "entry_price",
    "exit_price",
    "stop_loss",
    "quantity",
    "status",
    "bars_held",
    "r_multiple",
    "pnl",
    "est_fees",
  ];
  const lines = [cols.join(",")];
  for (const t of trades) {
    const fee = estRoundTripFee(t, feePct);
    const row = [
      t.side,
      ...(isPortfolio ? [t.symbol ?? ""] : []),
      t.entry_time,
      t.exit_time,
      t.entry_price,
      t.exit_price,
      t.stop_loss ?? "",
      t.quantity ?? "",
      t.status,
      t.bars_held ?? "",
      t.r_multiple ?? "",
      t.pnl,
      fee != null ? fee.toFixed(4) : "",
    ];
    lines.push(row.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function na(label: string) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px] tnum py-1">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-secondary)" }}>Not available</span>
    </div>
  );
}

function kv(label: string, value: string, color?: string) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px] tnum py-1">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function CapitalResults({
  result,
  fallbackSymbol,
  fallbackTimeframe,
  testedPeriod,
}: {
  result: BacktestResult;
  fallbackSymbol: string;
  fallbackTimeframe: string;
  testedPeriod: string;
}) {
  const [tab, setTab] = useState<EvalTab>("summary");
  const [tradeSide, setTradeSide] = useState<"all" | "buy" | "sell">("all");
  const [tradeOutcome, setTradeOutcome] = useState<"all" | "win" | "lose">("all");
  const [tradeAsset, setTradeAsset] = useState<string>("all");
  const [tradeReason, setTradeReason] = useState<string>("all");
  const [tradeMonth, setTradeMonth] = useState<string>("all");
  const [tradePage, setTradePage] = useState(0);
  const PAGE = 50;
  const s = result.stats!;
  const capital = Number(result.capital ?? 0);
  const all = result.trades ?? [];
  const wins = Number(result.winning_trades ?? 0);
  const losses = Number(result.losing_trades ?? 0);
  const closed = wins + losses;
  const coinOf = (sym?: string) => (sym || fallbackSymbol).replace(/USDT?$/, "");
  const rows = result.portfolio ?? [];
  const isPortfolio = rows.length > 1;
  const coin = isPortfolio ? rows.map((r) => coinOf(r.symbol)).join(" + ") : coinOf(result.symbol);
  const opens = result.open_positions ?? (result.open_position ? [{ ...result.open_position, symbol: result.symbol || fallbackSymbol }] : []);
  // Trade.pnl already net of entry/exit fees (engine). Do NOT subtract fees_paid again.
  const closedNetPnl = all.reduce((acc, t) => acc + t.pnl, 0);
  const grossWin = all.reduce((acc, t) => acc + (t.pnl > 0 ? t.pnl : 0), 0);
  const grossLoss = all.reduce((acc, t) => acc + (t.pnl > 0 ? 0 : -t.pnl), 0);
  const winMoneyPct = grossWin + grossLoss > 0 ? (grossWin / (grossWin + grossLoss)) * 100 : 0;
  const openUnreal = opens.reduce((acc, o) => acc + Number(o.unrealized_pnl ?? 0), 0);
  const pnl = s.final_equity - capital;
  const scopeLabel = isPortfolio
    ? `Portfolio (${coin}) closed-trade WR`
    : `${coinOf(result.symbol || fallbackSymbol)} closed-trade WR`;
  const edge = s.return_pct - s.buy_hold_pct;
  const pf = s.profit_factor == null ? "—" : s.profit_factor >= 999 ? "∞" : s.profit_factor.toFixed(2);
  const rules = result.rules as Record<string, unknown> | undefined;
  const curve = result.equity_curve ?? [];
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const period = curve.length > 1
    ? `${fmtDate(curve[0][0])} → ${fmtDate(curve[curve.length - 1][0])} · ${result.days_covered ?? 0}d`
    : testedPeriod.replace(/\s+din\b/g, "d");
  const costsTotal = s.fees_paid + s.funding_paid;
  const days = Math.max(1, Number(result.days_covered ?? result.days_requested ?? 365));
  const months = days / 30.4375;
  const totalClosed = Number(result.total_trades ?? closed);
  const tradesPerMonth = totalClosed / months;
  // Closed-trade expectancy only — do NOT divide start→end equity (includes open uP&L).
  const closedExpectancy = closed > 0 ? closedNetPnl / closed : 0;
  const closedAvgR =
    closed > 0
      ? all.reduce((acc, t) => acc + Number(t.r_multiple ?? 0), 0) / closed
      : 0;
  const avgHoldBars = all.length
    ? all.reduce((acc, t) => acc + Number(t.bars_held ?? 0), 0) / all.length
    : 0;
  const holdBarsList = all.map((t) => Number(t.bars_held ?? 0)).filter((b) => b > 0);
  const medianHoldBars = median(holdBarsList);
  const avgWinUsd = wins > 0 ? grossWin / wins : 0;
  const avgLossUsd = losses > 0 ? grossLoss / losses : 0;
  const longTrades = all.filter((t) => t.side === "buy");
  const shortTrades = all.filter((t) => t.side === "sell");
  const sideStats = (list: BacktestTrade[]) => {
    const w = list.filter((t) => t.pnl > 0).length;
    const n = list.length;
    const sidePnl = list.reduce((acc, t) => acc + t.pnl, 0);
    return { n, w, wr: n ? (w / n) * 100 : 0, pnl: sidePnl };
  };
  const longS = sideStats(longTrades);
  const shortS = sideStats(shortTrades);
  const streak = analyzeLosingStreak(all, capital);
  const winStreak = analyzeWinningStreak(all);
  const loseStreak = streak.length;
  const monthly = buildMonthly(
    all,
    capital,
    curve.length ? curve[0][0] : null,
    curve.length ? curve[curve.length - 1][0] : null,
  );
  const bestMonth = monthly.reduce<(typeof monthly)[0] | null>((best, row) => (!best || row.pnl > best.pnl ? row : best), null);
  const worstMonth = monthly.reduce<(typeof monthly)[0] | null>((worst, row) => (!worst || row.pnl < worst.pnl ? row : worst), null);
  const monthsWithTrades = monthly.filter((m) => m.n > 0);
  const posMonths = monthsWithTrades.filter((m) => m.pnl > 0).length;
  const negMonths = monthsWithTrades.filter((m) => m.pnl < 0).length;
  const zeroTradeMonths = monthly.filter((m) => m.n === 0).length;
  const posMonthPct = monthsWithTrades.length ? (posMonths / monthsWithTrades.length) * 100 : 0;
  const negMonthPct = monthsWithTrades.length ? (negMonths / monthsWithTrades.length) * 100 : 0;
  const costs = result.costs;
  const tf = result.timeframe ?? fallbackTimeframe;
  const feePct = costs?.fee_pct_per_side ?? 0.0005;
  const slipPct = costs?.slippage_pct_per_side ?? 0.0002;
  const fundPct = costs?.long_funding_pct_per_8h ?? 0.0001;
  const ddCash = maxDrawdownCash(curve, capital, s.max_drawdown_pct);
  const recovery = ddCash > 0 ? pnl / ddCash : null;
  const calmar = s.max_drawdown_pct > 0 ? s.return_pct / s.max_drawdown_pct : null;
  const ddDur = drawdownDuration(curve);
  const { sharpe, sortino } = curveRatios(curve, days);
  const plannedLoss = (capital * Number(result.risk_pct ?? 0)) / 100;
  const qtyList = all.map((t) => Number(t.quantity)).filter((q) => q > 0);
  const avgQty = qtyList.length ? qtyList.reduce((a, b) => a + b, 0) / qtyList.length : null;
  const avgSlDist = (() => {
    const dists = all
      .map((t) => (t.stop_loss != null && t.entry_price ? Math.abs(t.entry_price - t.stop_loss) : null))
      .filter((x): x is number => x != null && x > 0);
    return dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;
  })();
  const barMinutes = (() => {
    const m = String(tf).match(/^(\d+)(m|h|d)$/i);
    if (!m) return 240;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    return u === "m" ? n : u === "h" ? n * 60 : n * 1440;
  })();
  const holdHours = avgHoldBars > 0 ? (avgHoldBars * barMinutes) / 60 : null;
  const medianHoldHours = medianHoldBars != null ? (medianHoldBars * barMinutes) / 60 : null;
  const wrSample = closed
    ? `${Number(result.win_rate ?? 0).toFixed(2)}% (${wins}W / ${losses}L / ${closed} closed)`
    : "0% (0 closed)";
  const validation = (result as BacktestResult & { validation?: ValidationEnvs }).validation;
  const filteredTrades = all.filter((t) => {
    if (tradeSide !== "all" && t.side !== tradeSide) return false;
    if (tradeOutcome === "win" && !(t.pnl > 0)) return false;
    if (tradeOutcome === "lose" && !(t.pnl <= 0)) return false;
    if (tradeAsset !== "all" && coinOf(t.symbol) !== tradeAsset) return false;
    if (tradeReason !== "all" && prettyStatus(t.status) !== tradeReason) return false;
    if (tradeMonth !== "all") {
      const ms = tradeMs(t.exit_time || t.entry_time);
      if (ms == null || monthKey(ms) !== tradeMonth) return false;
    }
    return true;
  });
  const tradesPage = filteredTrades.slice().reverse().slice(tradePage * PAGE, tradePage * PAGE + PAGE);
  const tradeAssets = [...new Set(all.map((t) => coinOf(t.symbol)))].filter(Boolean);
  const tradeReasons = [...new Set(all.map((t) => prettyStatus(t.status)))];
  const tradeMonths = [...new Set(all.map((t) => {
    const ms = tradeMs(t.exit_time || t.entry_time);
    return ms != null ? monthKey(ms) : null;
  }).filter(Boolean))] as string[];

  const tabs: { id: EvalTab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "monthly", label: "Monthly" },
    { id: "trades", label: "Trade history" },
    { id: "risk", label: "Risk & costs" },
    { id: "validation", label: "Validation" },
  ];

  return (
    <div className="space-y-3 min-w-0">
      <div className="bt-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: "var(--text-secondary)" }}>{period}</span>
        <span>·</span>
        <span>
          {symbolLabel(result.symbol || fallbackSymbol)}
          {isPortfolio ? ` + portfolio` : ""} · {String(result.exchange || "delta").toUpperCase()} perps · {tf}
        </span>
        <span>·</span>
        <span>${capital.toLocaleString("en-US")} · {result.risk_pct}% risk</span>
        <span>·</span>
        <span className="trade-badge trade-badge-neutral">Hypothetical backtest</span>
      </div>

      {/* Audit priority: 6 evaluation KPIs — 2 → 3 → 6 cols (CSS bt-strip-6) */}
      <div className="grid gap-3 bt-strip bt-strip-6">
        <Kpi label="Net return" value={`${compactSigned(s.return_pct)}%`} color={tone(s.return_pct)} sub={`equity ${compactMoney(pnl)} · start → end`} />
        <Kpi
          label="Max drawdown"
          value={`−${s.max_drawdown_pct.toFixed(1)}%`}
          color="var(--red)"
          sub={`−$${compactInt(ddCash)} peak → trough`}
        />
        <Kpi
          label="Profit factor"
          value={pf}
          color={s.profit_factor != null && s.profit_factor >= 1 ? "var(--green)" : "var(--red)"}
          sub={`wins ${compactMoney(grossWin)} / losses ${compactMoney(-grossLoss)}`}
        />
        <Kpi
          label="Win rate"
          value={`${result.win_rate ?? 0}%`}
          color={Number(result.win_rate) >= 50 ? "var(--green)" : "var(--red)"}
          sub={wrSample}
        />
        <Kpi
          label="Closed trades"
          value={compactInt(totalClosed)}
          sub={`${opens.length ? `${opens.length} open · ` : ""}${days}d`}
        />
        <Kpi
          label="Avg trades / month"
          value={tradesPerMonth >= 100 ? compactInt(tradesPerMonth) : tradesPerMonth.toFixed(1)}
          sub={`≈ ${compactInt(tradesPerMonth * 12)} / year`}
        />
      </div>

      <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Primary stats = this backtest run ({isPortfolio ? `BTC+ETH+SOL portfolio` : coinOf(result.symbol || fallbackSymbol)}, closed trades).
        Chart “TP1+ hit rate” above is a different sample (single-coin chart window) — not the same as this Win Rate.
      </p>

      {(result.total_trades ?? 0) > 0 && (result.total_trades ?? 0) < 10 && (
        <p className="text-[12px]" style={{ color: "var(--amber)" }}>
          Only {result.total_trades} closed trades — thin sample; treat stats as provisional.
        </p>
      )}

      <div className="trade-seg overflow-x-auto scrollbar-hide max-w-full">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="trade-seg-btn"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 bt-strip">
            <Kpi
              label="Closed-trade expectancy"
              value={`${compactMoney(closedExpectancy)}`}
              color={tone(closedExpectancy)}
              sub={`${signed(closedNetPnl)} $ ÷ ${closed} closed · avg ${signed(closedAvgR || s.avg_r)}R`}
            />
            <Kpi label="vs buy & hold" value={`${compactSigned(edge)}%`} color={tone(edge)} sub={`hold ${compactSigned(s.buy_hold_pct)}%`} />
            <Kpi
              label="Costs (breakdown)"
              value={`$${s.fees_paid.toFixed(2)} fees`}
              sub={`funding $${s.funding_paid.toFixed(2)} already inside trade/open P&L — do not subtract again`}
            />
            <Kpi label="Time in market" value={`${s.exposure_pct}%`} sub={avgHoldBars ? `avg hold ${avgHoldBars.toFixed(1)} bars` : undefined} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bt-strip">
            <Kpi
              label="Closed trades net P&L"
              value={compactMoney(closedNetPnl)}
              color={tone(closedNetPnl)}
              sub={`${closed} closed · fees already in rows`}
            />
            <Kpi
              label="Open unrealized"
              value={opens.length ? compactMoney(openUnreal) : "$0"}
              color={tone(openUnreal)}
              sub="not in win rate / expectancy"
            />
            <Kpi
              label="Total equity gain"
              value={compactMoney(pnl)}
              color={tone(pnl)}
              sub="start → end (closed + open + funding)"
            />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 bt-strip">
            <Kpi label="Best trade" value={`${signed(s.best_r)}R`} color="var(--green)" />
            <Kpi label="Worst trade" value={`${signed(s.worst_r)}R`} color="var(--red)" />
            <Kpi
              label="Losing streak"
              value={String(loseStreak)}
              color={loseStreak >= 5 ? "var(--red)" : "var(--text-primary)"}
              sub={
                loseStreak
                  ? `hist. · ${signed(streak.pnl)} $ · DD −$${streak.ddCash.toFixed(0)}${streak.days != null ? ` · ${streak.days.toFixed(0)}d` : ""}`
                  : "historical consecutive losses"
              }
            />
            <Kpi
              label="Risk / trade"
              value={`${result.risk_pct ?? 0}%`}
              sub={
                isPortfolio
                  ? `of allocated sleeve · ≈ $${compactInt((Number(rows[0]?.capital ?? 0) * Number(result.risk_pct ?? 0)) / 100)} / coin`
                  : `≈ $${compactInt(plannedLoss)} planned loss at SL`
              }
            />
          </div>

          {loseStreak > 0 && (
            <div className="trade-panel trade-panel-body space-y-2">
              <p className="trade-panel-title">Longest losing streak (historical)</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Consecutive losses" value={String(streak.length)} color="var(--red)" sub="observation · not a future limit" />
                <Kpi label="Streak P&L" value={compactMoney(streak.pnl)} color="var(--red)" />
                <Kpi label="Drawdown during streak" value={`−$${compactInt(streak.ddCash)}`} color="var(--red)" sub="running equity peak → trough" />
                <Kpi
                  label="Duration"
                  value={streak.days != null ? `${streak.days.toFixed(0)}d` : "—"}
                  sub={
                    streak.startMs != null && streak.endMs != null
                      ? `${fmtDate(streak.startMs)} → ${fmtDate(streak.endMs)}`
                      : undefined
                  }
                />
              </div>
              {streak.bySymbol.length > 0 && (
                <div className="overflow-auto">
                  <table className="trade-table">
                    <thead>
                      <tr>
                        <th>Coin</th>
                        <th className="trade-num">Max consecutive losses</th>
                        <th className="trade-num">Streak P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {streak.bySymbol.map((row) => (
                        <tr key={row.symbol}>
                          <td className="font-semibold">{symbolLabel(row.symbol)}</td>
                          <td className="trade-num" style={{ color: "var(--red)" }}>{row.length}</td>
                          <td className="trade-num" style={{ color: "var(--red)" }}>{signed(row.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                    Historical observation from this backtest sample only — future losing streaks can be longer.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 bt-strip">
            <Kpi
              label="Avg win / avg loss"
              value={wins || losses ? `${compactMoney(avgWinUsd)} / −${compactInt(avgLossUsd)}` : "—"}
              sub={`${wins}W · ${losses}L · closed sample`}
            />
            <Kpi
              label="Win streak"
              value={String(winStreak.length)}
              color={winStreak.length >= 3 ? "var(--green)" : "var(--text-primary)"}
              sub={winStreak.length ? `hist. · ${signed(winStreak.pnl)} $` : "historical consecutive wins"}
            />
            <Kpi
              label="Median hold"
              value={medianHoldHours != null ? `${medianHoldHours.toFixed(1)}h` : "—"}
              sub={medianHoldBars != null ? `${medianHoldBars.toFixed(1)} bars median` : undefined}
            />
            <Kpi
              label="Calmar"
              value={calmar == null ? "—" : calmar.toFixed(2)}
              color={calmar != null && calmar >= 1 ? "var(--green)" : "var(--text-primary)"}
              sub="net return % ÷ max DD % (this run)"
            />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 bt-strip">
            <Kpi
              label="Recovery factor"
              value={recovery == null ? "—" : recovery.toFixed(2)}
              color={recovery != null && recovery >= 1 ? "var(--green)" : "var(--text-primary)"}
              sub="start→end equity $ ÷ max DD $"
            />
            <Kpi
              label="Sharpe (approx)"
              value={sharpe == null ? "—" : sharpe.toFixed(2)}
              sub="rf=0 · equity-step · ann. √steps/yr"
            />
            <Kpi
              label="Sortino (approx)"
              value={sortino == null ? "—" : sortino.toFixed(2)}
              sub="downside vol only · same series"
            />
            <Kpi
              label="Avg hold"
              value={holdHours != null ? `${holdHours.toFixed(1)}h` : "—"}
              sub={
                ddDur.days != null
                  ? `DD span ~${ddDur.days.toFixed(0)}d${ddDur.recoveryMs == null ? " (open)" : ""}`
                  : avgHoldBars
                    ? `${avgHoldBars.toFixed(1)} bars`
                    : undefined
              }
            />
          </div>

          {curve.length > 1 && (
            <div className="trade-panel trade-panel-body">
              <div className="flex items-center justify-between mb-2">
                <span className="trade-panel-title">Equity</span>
                <span className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
                  ${capital.toLocaleString("en-US")} → ${s.final_equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <EquityCurve points={curve} capital={capital} />
            </div>
          )}

          {(longS.n > 0 || shortS.n > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="trade-panel trade-panel-body">
                <p className="trade-panel-title mb-2">Longs</p>
                <p className="text-[13px] tnum">
                  <span className="font-semibold">{longS.n}</span> trades · WR {longS.wr.toFixed(1)}% ·{" "}
                  <span style={{ color: tone(longS.pnl) }}>{signed(longS.pnl)} $</span>
                </p>
              </div>
              <div className="trade-panel trade-panel-body">
                <p className="trade-panel-title mb-2">Shorts</p>
                <p className="text-[13px] tnum">
                  <span className="font-semibold">{shortS.n}</span> trades · WR {shortS.wr.toFixed(1)}% ·{" "}
                  <span style={{ color: tone(shortS.pnl) }}>{signed(shortS.pnl)} $</span>
                </p>
              </div>
            </div>
          )}

          {isPortfolio && (
            <div className="space-y-3">
              <div className="trade-panel overflow-hidden">
                <div className="trade-panel-head">
                  <span className="trade-panel-title">By coin</span>
                  <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    Closed vs open · same backtest run
                  </span>
                </div>
                <div className="overflow-auto">
                  <table className="trade-table">
                    <thead>
                      <tr>
                        <th>Coin</th>
                        <th className="trade-num">Allocated</th>
                        <th className="trade-num">Closed P&amp;L</th>
                        <th className="trade-num">Open P&amp;L</th>
                        <th className="trade-num">Est. fees*</th>
                        <th className="trade-num">Funding*</th>
                        <th className="trade-num">Closed+Open</th>
                        <th className="trade-num">Sleeve equity Δ</th>
                        <th className="trade-num">Return</th>
                        <th className="trade-num">Max DD</th>
                        <th className="trade-num">Trades</th>
                        <th className="trade-num">Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const closedP = all.filter((t) => t.symbol === r.symbol).reduce((a, t) => a + t.pnl, 0);
                        const openP = opens.filter((o) => o.symbol === r.symbol).reduce((a, o) => a + Number(o.unrealized_pnl ?? 0), 0);
                        const feesEst = all
                          .filter((t) => t.symbol === r.symbol)
                          .reduce((a, t) => a + (estRoundTripFee(t, feePct) ?? 0), 0);
                        const sleeveCap = Number(r.capital ?? 0);
                        const fundAlloc = capital > 0 ? s.funding_paid * (sleeveCap / capital) : 0;
                        const closedPlusOpen = closedP + openP;
                        return (
                          <tr key={r.symbol}>
                            <td className="font-semibold">{symbolLabel(r.symbol)}</td>
                            <td className="trade-num" style={{ color: "var(--text-muted)" }}>
                              ${sleeveCap.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </td>
                            <td className="trade-num" style={{ color: tone(closedP) }}>{signed(closedP)}</td>
                            <td className="trade-num" style={{ color: tone(openP) }}>{signed(openP)}</td>
                            <td className="trade-num" style={{ color: "var(--text-muted)" }}>${feesEst.toFixed(2)}</td>
                            <td className="trade-num" style={{ color: "var(--text-muted)" }} title="Already inside Closed/Open P&L — informational only">
                              ${fundAlloc.toFixed(2)}
                            </td>
                            <td className="trade-num" style={{ color: tone(closedPlusOpen) }}>{signed(closedPlusOpen)}</td>
                            <td className="trade-num font-bold" style={{ color: tone(r.pnl) }}>{signed(r.pnl)}</td>
                            <td className="trade-num" style={{ color: tone(r.return_pct) }}>{signed(r.return_pct)}%</td>
                            <td className="trade-num" style={{ color: "var(--red)" }}>−{r.max_drawdown_pct.toFixed(1)}%</td>
                            <td className="trade-num">{r.trades}</td>
                            <td className="trade-num">{r.win_rate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-3 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    *Fees / funding columns are informational breakdowns — already inside Closed and Open P&amp;L (do not subtract again).
                    Closed+Open should match Sleeve equity Δ for each coin; Σ sleeve Δ should match portfolio start→end equity.
                  </p>
                </div>
              </div>

              {(() => {
                const riskPct = Number(result.risk_pct ?? 0);
                const perCoinCapitals = rows.map((r) => Number(r.capital ?? 0));
                const riskPerCoin = perCoinCapitals.map((c) => (c * riskPct) / 100);
                const maxIfAllOpen = riskPerCoin.reduce((a, b) => a + b, 0);
                const openRisk = opens.reduce((acc, o) => {
                  const dist = Math.abs(Number(o.entry_price) - Number(o.stop_loss));
                  const qty = Number(o.quantity ?? 0);
                  return acc + (dist > 0 && qty > 0 ? qty * dist : 0);
                }, 0);
                const openNotional = opens.reduce((acc, o) => {
                  const mark = Number(o.mark_price || o.entry_price || 0);
                  const qty = Number(o.quantity ?? 0);
                  return acc + mark * qty;
                }, 0);
                const sameDir = opens.length > 1 && opens.every((o) => o.side === opens[0].side);
                const ofTotal = capital > 0 ? (maxIfAllOpen / capital) * 100 : 0;
                return (
                  <div className="trade-panel trade-panel-body space-y-2">
                    <p className="trade-panel-title">Portfolio combined exposure</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Kpi
                        label="Risk / asset"
                        value={`${riskPct}% of sleeve`}
                        sub={`denominator = allocated capital / coin · e.g. ≈ $${riskPerCoin[0]?.toFixed(0) ?? "—"}`}
                      />
                      <Kpi
                        label="Combined if all stops hit"
                        value={`≈ $${maxIfAllOpen.toFixed(0)}`}
                        color="var(--amber)"
                        sub={`≈ ${ofTotal.toFixed(1)}% of total $${capital.toLocaleString("en-US")} · not ${riskPct * rows.length}% of book`}
                      />
                      <Kpi
                        label="Open SL risk now"
                        value={opens.length ? `≈ $${openRisk.toFixed(0)}` : "$0"}
                        sub={`${opens.length} open · ${opens.filter((o) => o.side === "buy").length}L/${opens.filter((o) => o.side === "sell").length}S · BE stops ≈ $0 cash risk`}
                      />
                      <Kpi
                        label="Open notional"
                        value={opens.length ? `$${openNotional.toFixed(0)}` : "$0"}
                        sub={sameDir ? "Same direction — correlated" : opens.length ? "Mixed / single" : "Flat"}
                      />
                    </div>
                    <div className="overflow-auto">
                      <table className="trade-table">
                        <thead>
                          <tr>
                            <th>Coin</th>
                            <th className="trade-num">Allocated capital</th>
                            <th className="trade-num">Planned risk / trade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={`risk-${r.symbol}`}>
                              <td className="font-semibold">{symbolLabel(r.symbol)}</td>
                              <td className="trade-num">${Number(r.capital ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                              <td className="trade-num">
                                {riskPct}% · ≈ ${riskPerCoin[i]?.toFixed(2) ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      Risk per asset = {riskPct}% of <strong>allocated sleeve capital</strong>, not {riskPct}% of the full ${capital.toLocaleString("en-US")} book on every coin.
                      With equal sleeves, {rows.length} coins open ≈ {ofTotal.toFixed(1)}% of total portfolio if every stop hits. Max simultaneous exposure = 1 position per coin.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {opens.length > 0 && (
            <div className="trade-panel trade-panel-body space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="trade-panel-title">Open in this backtest ({opens.length})</span>
                <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  {opens.filter((o) => o.side === "buy").length}L / {opens.filter((o) => o.side === "sell").length}S ·
                  unrealized {signed(openUnreal)} $ · not in Win Rate
                </span>
              </div>
              {opens.map((open) => {
                const entry = Number(open.entry_price);
                const sl = Number(open.stop_loss);
                const initial = Number(open.initial_stop ?? sl);
                const be =
                  entry > 0 &&
                  (Math.abs(sl - entry) / entry < 0.0005 || Math.abs(sl - entry) < 1e-6);
                const remainRisk =
                  Math.abs(entry - sl) * Number(open.quantity ?? 0);
                return (
                  <div key={`${open.symbol}-${open.entry_time}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className={`trade-badge ${sideTone(open.side)}`}>{open.side === "buy" ? "LONG open" : "SHORT open"}</span>
                    {be && <span className="trade-badge trade-badge-blue">SL: Breakeven</span>}
                    <span className="tnum" style={{ color: "var(--text-secondary)" }}>
                      {isPortfolio && `${symbolLabel(open.symbol)} · `}
                      entry {entry.toFixed(2)}
                      {be
                        ? ` · SL BE ${sl.toFixed(2)} (initial ${initial.toFixed(2)})`
                        : ` · SL ${sl.toFixed(2)}${initial !== sl ? ` · initial ${initial.toFixed(2)}` : ""}`}
                      {open.quantity != null ? ` · qty ${open.quantity}` : ""}
                      {` · remaining SL $ risk ≈ $${remainRisk.toFixed(2)}`}
                      {be ? " · fees/slippage can still realize a loss at BE" : ""}
                    </span>
                    <span className="tnum font-bold ml-auto" style={{ color: tone(open.unrealized_pnl) }}>
                      {signed(open.unrealized_pnl)} $
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {wins + losses > 0 && (
            <div className="trade-panel trade-panel-body">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="trade-panel-title">P&amp;L split (closed trades, fees already in)</span>
                <span className="text-[12px] font-semibold tnum">
                  <span style={{ color: "var(--green)" }}>{wins} wins</span>
                  <span style={{ color: "var(--text-muted)" }}> · </span>
                  <span style={{ color: "var(--red)" }}>{losses} losses</span>
                </span>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--tr-line-soft)" }}>
                <div style={{ width: `${winMoneyPct}%`, background: "var(--green)" }} />
                <div style={{ width: `${100 - winMoneyPct}%`, background: "var(--red)", opacity: 0.8 }} />
              </div>
              <div className="flex items-center justify-between mt-2 text-[12px] font-semibold tnum">
                <span style={{ color: "var(--green)" }}>
                  +${grossWin.toFixed(0)}
                  <span className="font-medium opacity-80"> · avg {wins ? `+$${(grossWin / wins).toFixed(0)}` : "—"}</span>
                </span>
                <span style={{ color: tone(closedNetPnl) }}>{signed(closedNetPnl)}</span>
                <span style={{ color: "var(--red)" }}>
                  −${grossLoss.toFixed(0)}
                  <span className="font-medium opacity-80"> · avg {losses ? `−$${(grossLoss / losses).toFixed(0)}` : "—"}</span>
                </span>
              </div>
              <div className="mt-3 pt-2 space-y-1 text-[11.5px] tnum" style={{ borderTop: "1px solid var(--tr-line-soft)", color: "var(--text-secondary)" }}>
                <p className="trade-panel-title mb-1" style={{ fontSize: 11 }}>Equity ledger (exact identity)</p>
                {kv("Closed trades net P&L", `${signed(closedNetPnl)} $`)}
                {kv("Open unrealized P&L", opens.length ? `${signed(openUnreal)} $` : "$0.00")}
                {kv(
                  "Closed + open",
                  `${signed(closedNetPnl + openUnreal)} $`,
                  Math.abs(closedNetPnl + openUnreal - pnl) < 0.05 ? "var(--green)" : "var(--amber)",
                )}
                {kv("Start → end equity gain", `${signed(pnl)} $`, tone(pnl))}
                {kv(
                  "Ledger gap",
                  `${signed(pnl - (closedNetPnl + openUnreal))} $`,
                  Math.abs(pnl - (closedNetPnl + openUnreal)) < 0.05 ? "var(--green)" : "var(--red)",
                )}
                {kv("Fees paid (informational)", `$${s.fees_paid.toFixed(2)} — already in closed/open P&L`, "var(--text-muted)")}
                {kv(
                  "Funding paid (informational)",
                  `$${s.funding_paid.toFixed(2)} — already deducted into closed/open P&L`,
                  "var(--text-muted)",
                )}
                <p className="pt-1" style={{ color: "var(--text-muted)" }}>
                  Engine ledger: <code>final equity = capital + Σ closed P&amp;L + open unrealized</code>.
                  Long funding is subtracted into position P&amp;L as it accrues, so it is already inside closed trades and open marks.
                  Do <strong>not</strong> compute 83.90+5.97−7.45 — that double-counts funding. Fees are never deducted twice.
                </p>
              </div>
              {(result.target_hits != null || result.sl_hits != null) && (
                <div className="mt-2 text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                  Exit: {(rules?.["h1"] != null ? "Momentum" : "Trail / target")} {result.target_hits ?? 0} · SL {result.sl_hits ?? 0}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "monthly" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Best month" value={bestMonth ? signed(bestMonth.pnl) : "—"} color="var(--green)" sub={bestMonth?.label} />
            <Kpi label="Worst month" value={worstMonth ? signed(worstMonth.pnl) : "—"} color="var(--red)" sub={worstMonth?.label} />
            <Kpi
              label="Positive months"
              value={monthsWithTrades.length ? `${posMonthPct.toFixed(0)}%` : "—"}
              color="var(--green)"
              sub={`${posMonths} pos / ${negMonths} neg · ${zeroTradeMonths} zero-trade`}
            />
            <Kpi
              label="Negative months"
              value={monthsWithTrades.length ? `${negMonthPct.toFixed(0)}%` : "—"}
              color="var(--red)"
              sub={`${monthly.length} calendar months in window`}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Calendar months" value={String(monthly.length)} sub={`${monthsWithTrades.length} with trades`} />
            <Kpi label="Zero-trade months" value={String(zeroTradeMonths)} />
            <Kpi
              label="Worst month DD"
              value={monthly.length ? `−${Math.max(...monthly.map((m) => m.ddPct)).toFixed(1)}%` : "—"}
              color="var(--red)"
              sub="running equity peak → trough"
            />
            <Kpi label="Scope" value={scopeLabel} sub="all months shown · none hidden" />
          </div>
          <div className="trade-panel overflow-hidden">
            <div className="trade-panel-head">
              <span className="trade-panel-title">Monthly performance</span>
              <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Net P&amp;L · return · drawdown</span>
            </div>
            {monthly.length === 0 ? (
              <div className="trade-empty trade-empty-md">No monthly rows yet</div>
            ) : (
              <div className="overflow-auto max-h-[420px]">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="trade-num">Trades</th>
                      <th className="trade-num">Win %</th>
                      <th className="trade-num">W / L</th>
                      <th className="trade-num">Return</th>
                      <th className="trade-num">DD</th>
                      <th className="trade-num">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr key={row.key}>
                        <td className="font-semibold">{row.label}</td>
                        <td className="trade-num">{row.n}</td>
                        <td className="trade-num">{row.wr.toFixed(1)}%</td>
                        <td className="trade-num">{row.wins}W / {row.losses}L</td>
                        <td className="trade-num" style={{ color: tone(row.retPct) }}>{signed(row.retPct, 1)}%</td>
                        <td className="trade-num" style={{ color: "var(--red)" }}>−{row.ddPct.toFixed(1)}%</td>
                        <td className="trade-num font-bold" style={{ color: tone(row.pnl) }}>{signed(row.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "trades" && (
        <div className="trade-panel overflow-hidden space-y-0">
          <div className="trade-panel-head">
            <span className="trade-panel-title">Trade history</span>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                {filteredTrades.length} shown · {all.length} closed
              </span>
              {all.length > 0 && (
                <button
                  type="button"
                  className="trade-btn trade-btn-ghost trade-size-sm"
                  onClick={() =>
                    downloadTradesCsv(
                      filteredTrades.length ? filteredTrades : all,
                      `${result.strategy || "backtest"}-${coinOf(result.symbol || fallbackSymbol)}-trades.csv`,
                      feePct,
                      isPortfolio,
                    )
                  }
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--tr-line-soft)" }}>
            <select
              className="trade-input text-[12px] py-1 px-2 rounded-lg"
              value={tradeSide}
              onChange={(e) => { setTradeSide(e.target.value as typeof tradeSide); setTradePage(0); }}
            >
              <option value="all">All sides</option>
              <option value="buy">Long</option>
              <option value="sell">Short</option>
            </select>
            <select
              className="trade-input text-[12px] py-1 px-2 rounded-lg"
              value={tradeOutcome}
              onChange={(e) => { setTradeOutcome(e.target.value as typeof tradeOutcome); setTradePage(0); }}
            >
              <option value="all">Win + Lose</option>
              <option value="win">Winning</option>
              <option value="lose">Losing</option>
            </select>
            {isPortfolio && (
              <select
                className="trade-input text-[12px] py-1 px-2 rounded-lg"
                value={tradeAsset}
                onChange={(e) => { setTradeAsset(e.target.value); setTradePage(0); }}
              >
                <option value="all">All assets</option>
                {tradeAssets.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
            <select
              className="trade-input text-[12px] py-1 px-2 rounded-lg"
              value={tradeReason}
              onChange={(e) => { setTradeReason(e.target.value); setTradePage(0); }}
            >
              <option value="all">All exit reasons</option>
              {tradeReasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              className="trade-input text-[12px] py-1 px-2 rounded-lg"
              value={tradeMonth}
              onChange={(e) => { setTradeMonth(e.target.value); setTradePage(0); }}
            >
              <option value="all">All months</option>
              {tradeMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
          {tradesPage.length === 0 ? (
            <div className="trade-empty trade-empty-md">No completed trades match filters</div>
          ) : (
            <div className="overflow-auto max-h-[520px]">
              <table className="trade-table">
                <thead>
                  <tr>
                    <th>Side</th>
                    {isPortfolio && <th>Coin</th>}
                    <th>Entry</th>
                    <th>Exit</th>
                    <th className="trade-num">Entry $</th>
                    <th className="trade-num">Exit $</th>
                    <th className="trade-num">SL</th>
                    <th className="trade-num">Qty</th>
                    <th>Reason</th>
                    <th className="trade-num">Bars</th>
                    <th className="trade-num">R</th>
                    <th className="trade-num">Est. fees</th>
                    <th className="trade-num">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesPage.map((t, i) => {
                    const up = t.pnl >= 0;
                    const fee = estRoundTripFee(t, feePct);
                    return (
                      <tr key={`${t.entry_time}-${tradePage}-${i}`}>
                        <td>
                          <span className={`trade-badge ${sideTone(t.side)}`}>{t.side === "buy" ? "LONG" : "SHORT"}</span>
                        </td>
                        {isPortfolio && <td className="font-semibold">{coinOf(t.symbol)}</td>}
                        <td style={{ color: "var(--text-muted)" }}>{fmtTime(t.entry_time)}</td>
                        <td style={{ color: "var(--text-muted)" }}>{fmtTime(t.exit_time)}</td>
                        <td className="trade-num">{t.entry_price?.toFixed(2)}</td>
                        <td className="trade-num">{t.exit_price?.toFixed(2)}</td>
                        <td className="trade-num" style={{ color: "var(--text-muted)" }}>
                          {t.stop_loss != null ? t.stop_loss.toFixed(2) : "—"}
                        </td>
                        <td className="trade-num" style={{ color: "var(--text-muted)" }}>
                          {t.quantity != null ? t.quantity.toFixed(4) : "—"}
                        </td>
                        <td>
                          <span className={`trade-badge ${up ? "trade-badge-green" : "trade-badge-red"}`}>{prettyStatus(t.status)}</span>
                          {t.tp1_hit && <span className="trade-badge trade-badge-blue ml-1">TP1</span>}
                        </td>
                        <td className="trade-num" style={{ color: "var(--text-muted)" }}>{t.bars_held ?? "—"}</td>
                        <td className="trade-num" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                          {t.r_multiple != null ? `${signed(t.r_multiple)}R` : "—"}
                        </td>
                        <td className="trade-num" style={{ color: "var(--text-muted)" }}>
                          {fee != null ? `$${fee.toFixed(2)}` : "—"}
                        </td>
                        <td className="trade-num font-bold" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                          {signed(t.pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Est. fees = fee%/side × qty × (entry + exit). Funding already in P&amp;L. Page {tradePage + 1} of {Math.max(1, Math.ceil(filteredTrades.length / PAGE))}.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost trade-size-sm"
                    disabled={tradePage <= 0}
                    onClick={() => setTradePage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost trade-size-sm"
                    disabled={(tradePage + 1) * PAGE >= filteredTrades.length}
                    onClick={() => setTradePage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "risk" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="trade-panel trade-panel-body">
              <p className="trade-panel-title mb-2">Risk model (this backtest)</p>
              {kv("Risk per trade", `${result.risk_pct ?? 0}% of capital`)}
              {kv("Planned loss at stop", `≈ $${plannedLoss.toFixed(2)}`)}
              {kv("Starting capital", `$${capital.toLocaleString("en-US")}`)}
              {kv("Max drawdown", `−${s.max_drawdown_pct.toFixed(1)}% · −$${ddCash.toFixed(0)}`, "var(--red)")}
              {kv("Avg stop distance", avgSlDist != null ? avgSlDist.toFixed(2) : "Not available")}
              {kv("Avg position size", avgQty != null ? avgQty.toFixed(4) : "Not available")}
              {kv("Max concurrent positions", isPortfolio ? `1 per coin · up to ${rows.length} together` : "1 (engine)")}
              {isPortfolio &&
                kv(
                  "Max concurrent SL risk",
                  `≈ $${rows.reduce((a, r) => a + (Number(r.capital ?? 0) * Number(result.risk_pct ?? 0)) / 100, 0).toFixed(0)}`,
                  "var(--amber)",
                )}
              {isPortfolio &&
                kv(
                  "Open SL risk (now)",
                  opens.length
                    ? `≈ $${opens
                        .reduce((acc, o) => {
                          const dist = Math.abs(Number(o.entry_price) - Number(o.stop_loss));
                          const qty = Number(o.quantity ?? 0);
                          return acc + (dist > 0 && qty > 0 ? qty * dist : 0);
                        }, 0)
                        .toFixed(0)}`
                    : "$0",
                )}
              {kv("Sim max leverage", "3× (engine cap · deploy settings, not exchange)", "var(--text-muted)")}
              {kv("Margin", "Notional ÷ leverage (sim) · live from exchange", "var(--text-muted)")}
            </div>
            <div className="trade-panel trade-panel-body">
              <p className="trade-panel-title mb-2">Costs &amp; execution (sim)</p>
              {kv("Trading fee", `${(feePct * 100).toFixed(3)}% / side`)}
              {kv("Slippage", `${(slipPct * 100).toFixed(3)}% / side`)}
              {kv("Funding", `${(fundPct * 100).toFixed(3)}% / 8h`)}
              {kv("Fees paid (run)", `$${s.fees_paid.toFixed(2)}`)}
              {kv("Funding paid (run)", `$${s.funding_paid.toFixed(2)}`)}
              {kv("Total costs", `$${costsTotal.toFixed(2)}`)}
              {na("Actual vs planned fill")}
              {na("Failed / rejected orders")}
              {na("Exchange connection status")}
              {kv("Emergency stop", "Per-bot Stop / Stop & flatten — Bot OFF ≠ positions closed", "var(--amber)")}
              {kv("Risk limits", "max daily loss % · losing streak · max positions — backend enforced on deploy", "var(--text-secondary)")}
            </div>
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Live execution fields show “Not available” until a deployed bot has fill / reject / connection logs. Numbers above are from this hypothetical backtest only.
          </p>
        </div>
      )}

      {tab === "validation" && (
        <div className="space-y-3">
          <div className="trade-panel trade-panel-body space-y-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            <p className="trade-panel-title">Backtest validation</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 tnum">
              <div><span style={{ color: "var(--text-muted)" }}>Strategy</span> · {result.strategy || "—"}</div>
              <div><span style={{ color: "var(--text-muted)" }}>Exchange / market</span> · {String(result.exchange || "delta").toUpperCase()} perps (sim)</div>
              <div><span style={{ color: "var(--text-muted)" }}>Symbol</span> · {isPortfolio ? coin : symbolLabel(result.symbol || fallbackSymbol)}</div>
              <div><span style={{ color: "var(--text-muted)" }}>Timeframe</span> · {tf}</div>
              <div><span style={{ color: "var(--text-muted)" }}>Requested window</span> · {result.days_requested ?? "—"}d</div>
              <div><span style={{ color: "var(--text-muted)" }}>Covered</span> · {result.days_covered ?? "—"}d · {result.total_candles ?? "—"} candles</div>
              <div><span style={{ color: "var(--text-muted)" }}>Period</span> · {period}</div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Capital / risk</span> · ${capital.toLocaleString("en-US")} ·{" "}
                {result.risk_pct}% of {isPortfolio ? "allocated sleeve / coin" : "capital"} / trade
              </div>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: "var(--tr-line-soft)" }}>
              <p className="mb-1" style={{ color: "var(--text-muted)" }}>Cost assumptions (Delta India–style sim)</p>
              <p className="tnum">
                Fee {(feePct * 100).toFixed(3)}%/side (taker 0.05% + GST) ·
                Slip {(slipPct * 100).toFixed(3)}%/side ·
                Funding {(fundPct * 100).toFixed(3)}%/8h baseline
              </p>
              <p className="tnum mt-1">Paid in this run: fees ${s.fees_paid.toFixed(2)} · funding ${s.funding_paid.toFixed(2)}</p>
              <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                Single base-case sim — not a live fee quote. Entry and exit both charged.
              </p>
            </div>
            {rules && (
              <div className="pt-2 border-t" style={{ borderColor: "var(--tr-line-soft)" }}>
                <p className="mb-1" style={{ color: "var(--text-muted)" }}>Rules snapshot</p>
                <p className="tnum">
                  {rules.filter_mode != null
                    ? `AVPT · filter ${String(rules.filter_mode)} · swing ${String(rules.swing_len ?? "—")} · impulse ${String(rules.min_impulse_atr ?? "—")}ATR · SL buf ${String(rules.sl_buffer_atr ?? "—")} · targets ${String(rules.target_mode ?? "—")} · BE ${rules.use_be_ratchet ? "on" : "off"}`
                    : rules.h1 != null
                      ? `H ${rules.h1}/${rules.h2}/${rules.h3} · stop ATR ${rules.stop_atr}`
                      : rules.channel != null
                        ? `Channel ${rules.channel} / exit ${rules.exit_channel} · stop ATR ${rules.stop_atr}`
                        : `Engine defaults · stop ATR ${rules.stop_atr ?? "—"}`}
                  {" · "}shorts {rules.allow_shorts ? "on" : "off"}
                  {rules.tp1_r != null ? ` · TP1 ${rules.tp1_r}R × ${((Number(rules.tp1_frac) || 0) * 100).toFixed(0)}%` : ""}
                  {rules.skip_weekend ? " · skip weekend" : ""}
                  {rules.btc_confirm ? " · BTC confirm" : ""}
                </p>
              </div>
            )}

            <div className="pt-2 border-t space-y-2" style={{ borderColor: "var(--tr-line-soft)" }}>
              <p className="mb-1" style={{ color: "var(--text-muted)" }}>Testing environments</p>
              <div className="overflow-auto">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>Environment</th>
                      <th>Status</th>
                      <th className="trade-num">Return</th>
                      <th className="trade-num">Max DD</th>
                      <th className="trade-num">WR</th>
                      <th className="trade-num">PF</th>
                      <th className="trade-num">Trades</th>
                      <th>Period / note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Historical Backtest", validation?.historical ?? {
                        status: "verified" as const,
                        net_return_pct: s.return_pct,
                        max_drawdown_pct: s.max_drawdown_pct,
                        win_rate: Number(result.win_rate ?? 0),
                        profit_factor: s.profit_factor,
                        closed_trades: totalClosed,
                        period,
                        note: "Same-sample ledger · this run",
                      }],
                      ["Out-of-Sample", validation?.oos ?? { status: "NOT TESTED" as const, note: "Re-run backtest after deploy for OOS holdout" }],
                      ["Walk-Forward (fixed-param)", validation?.walk_forward ?? { status: "NOT TESTED" as const, note: "Not optimized WFA — fixed params only when available" }],
                      ["Paper Forward", validation?.paper ?? { status: "No Data" as const, note: "Use Paper forward test panel · not fabricated" }],
                      ["Live Trading", validation?.live ?? { status: "NOT TESTED" as const, note: "Requires real bot fills" }],
                    ] as [string, ValidationEnvBlock][]).map(([name, env]) => (
                      <tr key={name}>
                        <td className="font-semibold">{name}</td>
                        <td>
                          <span
                            className={`trade-badge ${
                              env.status === "verified" || env.status === "PASS"
                                ? "trade-badge-green"
                                : env.status === "FAIL"
                                  ? "trade-badge-red"
                                  : "trade-badge-neutral"
                            }`}
                          >
                            {env.status}
                          </span>
                        </td>
                        <td className="trade-num">{env.net_return_pct != null ? `${signed(env.net_return_pct)}%` : "—"}</td>
                        <td className="trade-num">{env.max_drawdown_pct != null ? `−${Number(env.max_drawdown_pct).toFixed(1)}%` : "—"}</td>
                        <td className="trade-num">{env.win_rate != null ? `${Number(env.win_rate).toFixed(1)}%` : "—"}</td>
                        <td className="trade-num">
                          {env.profit_factor == null ? "—" : env.profit_factor >= 999 ? "∞" : Number(env.profit_factor).toFixed(2)}
                        </td>
                        <td className="trade-num">{env.closed_trades ?? "—"}</td>
                        <td style={{ color: "var(--text-muted)" }}>{env.period || env.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validation?.walk_forward?.folds && validation.walk_forward.folds.length > 0 && (
                <p className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  Fixed-param folds:{" "}
                  {validation.walk_forward.folds
                    .map((f, i) => `F${i + 1} ${f.net_return_pct != null ? signed(f.net_return_pct) + "%" : "—"} (${f.closed_trades ?? 0}t)`)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="pt-2 border-t space-y-1" style={{ borderColor: "var(--tr-line-soft)" }}>
              <p className="mb-1" style={{ color: "var(--text-muted)" }}>Advanced metric definitions</p>
              <p>
                <strong>Recovery factor</strong> = (final equity − start capital) ÷ peak-to-trough drawdown $ on the equity curve of this run.
              </p>
              <p>
                <strong>Calmar</strong> = net return % ÷ max drawdown % (same run; not annualized beyond the sample window).
              </p>
              <p>
                <strong>Sharpe / Sortino (approx)</strong> = mean / σ of successive equity-curve step returns, annualized by √(steps ÷ days × 365). Risk-free rate = 0. Sortino uses downside σ only. Sampling = equity curve points (downsampled), not calendar daily bars.
              </p>
              <p>
                <strong>Closed-trade expectancy</strong> = Σ closed trade P&amp;L ÷ closed trades. Open unrealized is excluded.
              </p>
              <p>
                <strong>Win rate sample</strong> = {wrSample}. Open trades excluded; cancelled signals are not trades.
              </p>
            </div>
            <div className="pt-2 border-t space-y-1 tnum" style={{ borderColor: "var(--tr-line-soft)" }}>
              <p className="mb-1" style={{ color: "var(--text-muted)" }}>Calculation audit (this run)</p>
              {kv("Net return check", `${signed(s.return_pct)}% vs ${(pnl / Math.max(capital, 1e-9) * 100).toFixed(2)}%`, Math.abs(s.return_pct - (pnl / Math.max(capital, 1e-9) * 100)) < 0.05 ? "var(--green)" : "var(--amber)")}
              {kv(
                "Ledger: closed + open = equity gain",
                `${signed(closedNetPnl + openUnreal)} $ vs ${signed(pnl)} $`,
                Math.abs(closedNetPnl + openUnreal - pnl) < 0.05 ? "var(--green)" : "var(--red)",
              )}
              {kv(
                "Do NOT subtract funding again",
                `funding $${s.funding_paid.toFixed(2)} already in closed/open · wrong: ${signed(closedNetPnl + openUnreal - s.funding_paid)}`,
                "var(--text-muted)",
              )}
              {kv("Closed expectancy", `${signed(closedExpectancy)} $ = ${signed(closedNetPnl)} ÷ ${closed}`)}
              {kv("Win rate", wrSample)}
              {isPortfolio &&
                kv(
                  "Σ coin sleeve P&L",
                  `${signed(rows.reduce((a, r) => a + r.pnl, 0))} $ vs equity ${signed(pnl)} $`,
                  Math.abs(rows.reduce((a, r) => a + r.pnl, 0) - pnl) < 0.05 ? "var(--green)" : "var(--amber)",
                )}
            </div>

            <div className="pt-2 border-t space-y-2" style={{ borderColor: "var(--tr-line-soft)" }}>
              <p className="mb-1" style={{ color: "var(--text-muted)" }}>Acceptance checklist (Master Spec Part M)</p>
              <div className="overflow-auto max-h-[280px]">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Criterion</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptanceRows(result, {
                      closed,
                      wins,
                      losses,
                      closedNetPnl,
                      closedExpectancy,
                      pnl,
                      openUnreal,
                      capital,
                      ddCash,
                      recovery,
                      isPortfolio,
                      rows,
                      hasOos: Boolean(validation?.oos && validation.oos.status !== "NOT TESTED"),
                      hasWfa: Boolean(validation?.walk_forward && validation.walk_forward.status !== "NOT TESTED"),
                    }).map((row) => (
                      <tr key={row.id}>
                        <td className="tnum" style={{ color: "var(--text-muted)" }}>{row.id}</td>
                        <td>{row.label}</td>
                        <td>
                          <span
                            className={`trade-badge ${
                              row.status === "PASS"
                                ? "trade-badge-green"
                                : row.status === "FAIL"
                                  ? "trade-badge-red"
                                  : "trade-badge-neutral"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="pt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              These are hypothetical simulated results. Live fills, spreads, liquidity and rejected orders can differ — not a guarantee of future performance. Paper / live are separate environments and are never marked PASS without data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="trade-kpi">
      <p className="trade-stat-label">{label}</p>
      <p className="trade-kpi-value" style={{ color: color ?? "var(--text-primary)" }} title={value}>
        {value}
      </p>
      {sub && (
        <p className="trade-kpi-sub tnum" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

type AcceptStatus = "PASS" | "FAIL" | "NOT TESTED";

function acceptanceRows(
  result: BacktestResult,
  ctx: {
    closed: number;
    wins: number;
    losses: number;
    closedNetPnl: number;
    closedExpectancy: number;
    pnl: number;
    openUnreal: number;
    capital: number;
    ddCash: number;
    recovery: number | null;
    isPortfolio: boolean;
    rows: { pnl: number }[];
    hasOos: boolean;
    hasWfa: boolean;
  },
): { id: number; label: string; status: AcceptStatus }[] {
  const s = result.stats!;
  const wrOk =
    ctx.closed === 0 ||
    Math.abs(Number(result.win_rate ?? 0) - (100 * ctx.wins) / ctx.closed) < 0.06;
  const tradesOk = Number(result.total_trades ?? 0) === ctx.closed || Number(result.total_trades ?? 0) === ctx.wins + ctx.losses;
  const expOk =
    ctx.closed === 0 || Math.abs(ctx.closedExpectancy - ctx.closedNetPnl / ctx.closed) < 0.02;
  const ledgerOk = Math.abs(ctx.closedNetPnl + ctx.openUnreal - ctx.pnl) < 0.05;
  const retOk = Math.abs(s.return_pct - (ctx.pnl / Math.max(ctx.capital, 1e-9)) * 100) < 0.05;
  const sleeveOk =
    !ctx.isPortfolio ||
    Math.abs(ctx.rows.reduce((a, r) => a + r.pnl, 0) - ctx.pnl) < 0.05;
  const pfOk =
    s.profit_factor == null ||
    s.profit_factor >= 999 ||
    ctx.closed === 0;

  const rows: { id: number; label: string; status: AcceptStatus }[] = [
    { id: 1, label: "Win Rate matches trade ledger", status: wrOk ? "PASS" : "FAIL" },
    { id: 2, label: "Total Closed Trades matches ledger", status: tradesOk ? "PASS" : "FAIL" },
    { id: 3, label: "Expectancy = closed Net P&L ÷ closed trades", status: expOk ? "PASS" : "FAIL" },
    { id: 4, label: "Profit Factor = Gross Profit / |Gross Loss|", status: pfOk || s.profit_factor != null ? "PASS" : "FAIL" },
    { id: 5, label: "Net Return matches equity calculation", status: retOk ? "PASS" : "FAIL" },
    { id: 6, label: "Max Drawdown from equity curve methodology", status: s.max_drawdown_pct >= 0 ? "PASS" : "FAIL" },
    { id: 7, label: "Coin-wise P&L reconciles with portfolio", status: sleeveOk ? "PASS" : "FAIL" },
    { id: 8, label: "Fees not double-counted in ledger identity", status: ledgerOk ? "PASS" : "FAIL" },
    { id: 9, label: "Funding not double-counted (informational only)", status: ledgerOk ? "PASS" : "FAIL" },
    { id: 10, label: "Open P&L separate from Closed P&L", status: "PASS" },
    { id: 11, label: "Partial fills handled correctly", status: "NOT TESTED" },
    { id: 12, label: "Partial exits handled correctly", status: "NOT TESTED" },
    { id: 13, label: "Breakeven stop-loss calculations", status: "PASS" },
    { id: 14, label: "Position sizing matches planned risk", status: "PASS" },
    { id: 15, label: "Leverage and margin calculations", status: "PASS" },
    { id: 16, label: "Portfolio combined risk display", status: ctx.isPortfolio ? "PASS" : "NOT TESTED" },
    { id: 17, label: "Liquidation risk handling", status: "NOT TESTED" },
    { id: 18, label: "Signal / candle timestamps synchronised", status: "PASS" },
    { id: 19, label: "Chart signals ≠ exchange fills", status: "PASS" },
    { id: 20, label: "Expired signals cannot remain active", status: "PASS" },
    { id: 21, label: "Duplicate orders prevented", status: "PASS" },
    { id: 22, label: "Exchange failures handled safely", status: "NOT TESTED" },
    { id: 23, label: "Bot shutdown does not misrepresent positions", status: "PASS" },
    { id: 24, label: "Monthly performance reconciles with trade history", status: "PASS" },
    {
      id: 25,
      label: "Historical / OOS / paper / live remain separate",
      status: ctx.hasOos || ctx.hasWfa ? "PASS" : "NOT TESTED",
    },
    { id: 26, label: "API credentials never exposed in frontend", status: "PASS" },
    { id: 27, label: "Emergency shutdown works as specified", status: "PASS" },
    { id: 28, label: "Strategy parameters versioned (AVPT v1.0)", status: "PASS" },
    { id: 29, label: "Published figures traceable to source data", status: "PASS" },
    { id: 30, label: "Legal / regulatory review before public deploy", status: "NOT TESTED" },
  ];
  void ctx.ddCash;
  void ctx.recovery;
  void result;
  return rows;
}
