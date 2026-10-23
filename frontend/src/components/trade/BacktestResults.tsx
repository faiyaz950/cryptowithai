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
          <div className="trade-empty trade-empty-md">Is period mein koi completed trade nahi mili</div>
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
  const s = result.stats!;
  const capital = Number(result.capital ?? 0);
  const all = result.trades ?? [];
  const trades = all.slice().reverse().slice(0, 60);
  const wins = Number(result.winning_trades ?? 0);
  const losses = Number(result.losing_trades ?? 0);
  const settled = wins + losses;
  const winPct = settled > 0 ? (wins / settled) * 100 : 0;
  const pnl = s.final_equity - capital;
  const edge = s.return_pct - s.buy_hold_pct;
  const pf = s.profit_factor == null ? "—" : s.profit_factor >= 999 ? "∞" : s.profit_factor.toFixed(2);
  const rules = result.rules;
  const costs = result.costs;
  const open = result.open_position;
  const coin = (result.symbol || fallbackSymbol).replace(/USDT?$/, "");
  // Trades se nahi, equity curve se — flat hafte bhi tested period ka hissa hain.
  const curve = result.equity_curve ?? [];
  // Saal zaroori — 365 din ka window warna "23 Oct → 23 Oct" padhta hai.
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const period = curve.length > 1
    ? `${fmtDate(curve[0][0])} → ${fmtDate(curve[curve.length - 1][0])}  (${result.days_covered ?? 0} din)`
    : testedPeriod;

  return (
    <div className="space-y-4 min-w-0">
      <div className="trade-panel trade-panel-body flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        <span>
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Tested period:</span>{" "}
          <span className="tnum">{period}</span>
        </span>
        <span className="tnum">Capital ${capital.toLocaleString("en-US")} · risk {result.risk_pct}%/trade</span>
        {rules && (
          <span className="tnum">
            Channel {rules.channel}/{rules.exit_channel} · stop {rules.stop_atr}×ATR · EMA {rules.ema_fast}/{rules.ema_slow} · shorts {rules.allow_shorts ? "on" : "off"}
          </span>
        )}
        {costs && (
          <span className="tnum">
            Fee {costs.fee_pct_per_side}% + slip {costs.slippage_pct_per_side}% har side · long funding {costs.long_funding_pct_per_8h}%/8h
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Net return" value={`${signed(s.return_pct)}%`} color={tone(s.return_pct)} sub={`${signed(pnl)} $ · fees ke baad`} />
        <Kpi label="Max drawdown" value={`−${s.max_drawdown_pct.toFixed(2)}%`} color="var(--red)" sub="Peak se sabse gehri girawat" />
        <Kpi label="Profit factor" value={pf} color={s.profit_factor != null && s.profit_factor >= 1 ? "var(--green)" : "var(--red)"} sub={`Avg ${signed(s.avg_r)}R · best ${signed(s.best_r, 1)}R`} />
        <Kpi
          label={`vs ${coin} buy & hold`}
          value={`${signed(edge)}%`}
          color={tone(edge)}
          sub={`${coin} khud ${signed(s.buy_hold_pct)}%`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Trades" value={String(result.total_trades ?? 0)} sub={`${wins}W · ${losses}L${open ? " · 1 chalu" : ""}`} />
        <Kpi label="Win rate" value={`${result.win_rate ?? 0}%`} sub="Trend system: 30–40% normal" />
        <Kpi label="Fees + funding" value={`$${(s.fees_paid + s.funding_paid).toFixed(2)}`} sub={`fees $${s.fees_paid.toFixed(2)} · funding $${s.funding_paid.toFixed(2)}`} />
        <Kpi label="Time in market" value={`${s.exposure_pct}%`} sub={`${result.days_covered ?? 0} din · ${result.total_candles ?? 0} candles`} />
      </div>

      {(result.total_trades ?? 0) < 10 && (
        <div className="trade-panel trade-panel-body text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Sirf {result.total_trades ?? 0} trades — itne se strategy ke baare mein kuch pakka nahi kehta. Trend system ka nateeja kuch bade trades par tika hota hai, isliye 365–700 din par backtest chalao.
        </div>
      )}

      {result.equity_curve && result.equity_curve.length > 1 && (
        <div className="trade-panel trade-panel-body">
          <div className="flex items-center justify-between mb-2.5">
            <span className="trade-panel-title">Equity curve</span>
            <span className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
              ${capital.toLocaleString("en-US")} → ${s.final_equity.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <EquityCurve points={result.equity_curve} capital={capital} />
        </div>
      )}

      {open && (
        <div className="trade-panel trade-panel-body flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <span className={`trade-badge ${sideTone(open.side)}`}>{open.side === "buy" ? "LONG chalu" : "SHORT chalu"}</span>
          <span className="tnum" style={{ color: "var(--text-secondary)" }}>
            Entry {open.entry_price.toFixed(2)} · {fmtTime(open.entry_time)} · stop {open.stop_loss.toFixed(2)} · {open.quantity.toFixed(4)} {coin}
          </span>
          <span className="tnum font-bold" style={{ color: tone(open.unrealized_pnl) }}>
            {signed(open.unrealized_pnl)} $ unrealized
          </span>
        </div>
      )}

      {settled > 0 && (
        <div className="trade-panel trade-panel-body">
          <div className="flex items-center justify-between mb-2.5">
            <span className="trade-panel-title">Outcome split</span>
            <span className="text-[12px] tnum" style={{ color: "var(--text-muted)" }}>
              Trailing exits {result.target_hits ?? 0} · Initial SL {result.sl_hits ?? 0}
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
                  <th>Exit by</th>
                  <th className="trade-num">Qty</th>
                  <th className="trade-num">R</th>
                  <th className="trade-num">P&amp;L $</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => {
                  const up = t.pnl >= 0;
                  return (
                    <tr key={`${t.entry_time}-${i}`}>
                      <td>
                        <span className={`trade-badge ${sideTone(t.side)}`}>{t.side === "buy" ? "LONG" : "SHORT"}</span>
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>{fmtTime(t.entry_time)}</td>
                      <td className="trade-num">{t.entry_price?.toFixed(2)}</td>
                      <td className="trade-num">{t.exit_price?.toFixed(2)}</td>
                      <td>
                        <span className={`trade-badge ${up ? "trade-badge-green" : "trade-badge-red"}`}>{prettyStatus(t.status)}</span>
                      </td>
                      <td className="trade-num" style={{ color: "var(--text-muted)" }}>{t.quantity?.toFixed(4) ?? "—"}</td>
                      <td className="trade-num" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                        {t.r_multiple != null ? `${signed(t.r_multiple)}R` : "—"}
                      </td>
                      <td className="trade-num font-bold" style={{ color: up ? "var(--green)" : "var(--red)" }}>
                        {signed(t.pnl)}
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
