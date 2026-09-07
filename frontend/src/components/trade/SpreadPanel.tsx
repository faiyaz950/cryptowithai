"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Layers, RefreshCw } from "lucide-react";
import {
  fetchOptionSpread,
  optionUnderlying,
  type DebitSpread,
  type SpreadResponse,
} from "@/lib/cryptoApi";
import { num, str, type SignalTone, type StrategyDef, type StrategyValues } from "@/lib/strategies";

interface Props {
  def: StrategyDef;
  values: StrategyValues;
  tone: SignalTone;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtK(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Debit spread ke dono legs aur uska risk profile.
 *
 * Naked buying se ulta, yahan max loss aur max profit dono pehle se tay hote hain,
 * aur expiry par spot levels bhi exact hote hain (strikes se) — koi delta-based
 * estimate nahi lagana padta.
 */
export default function SpreadPanel({ def, values, tone }: Props) {
  const [data, setData] = useState<SpreadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = def.optionSpread;
  const optionType = config ? (tone === "sell" ? config.bearish : config.bullish) : "call";
  const underlying = optionUnderlying(str(values, "symbol", "BTCUSDT"));
  const width = num(values, "spread_width", 2000);
  const longDelta = num(values, "long_delta", 0.5);
  const maxSpread = num(values, "max_spread_pct", 8);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOptionSpread({ underlying, optionType, width, longDelta, maxSpreadPct: maxSpread });
      if (!res.success) throw new Error(res.error || "Spread load nahi hua");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spread load nahi hua");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [underlying, optionType, width, longDelta, maxSpread]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!config) return null;

  const spread = data?.selected ?? null;
  const slPct = num(values, "sl_debit_pct", 45);
  const tpPct = num(values, "tp_max_profit_pct", 75);
  const timeExit = num(values, "time_exit_hours", 1.5);
  const isCall = optionType === "call";

  return (
    <section className="trade-panel">
      <div className="trade-panel-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="trade-panel-title">Spread legs</span>
          <span className={`trade-badge ${isCall ? "trade-badge-green" : "trade-badge-red"}`}>
            {underlying} {isCall ? "BULL CALL" : "BEAR PUT"}
          </span>
          <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
            width {fmtK(width)}
          </span>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      <div className="trade-panel-body space-y-4">
        {error && (
          <p className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--red)" }}>
            <AlertCircle className="w-4 h-4 mt-px flex-none" />
            {error}
          </p>
        )}

        {!error && !spread && !loading && (
          <div className="trade-empty">
            <span className="trade-empty-icon"><Layers className="w-4 h-4" /></span>
            Is width par koi tradable spread nahi mila. Width badlein ya bid/ask limit dhili karein.
          </div>
        )}

        {spread && (
          <>
            {/* ── Dono legs ─────────────────────────────── */}
            <div className="grid gap-3 md:grid-cols-2">
              <LegCard label="BUY (long leg)" leg={spread.long_leg} price={spread.long_leg.best_ask} priceLabel="Ask" accent="var(--green)" />
              <LegCard label="SELL (short leg)" leg={spread.short_leg} price={spread.short_leg.best_bid} priceLabel="Bid" accent="var(--red)" />
            </div>

            {/* ── Risk profile ──────────────────────────── */}
            <div>
              <div className="trade-section-label">Risk profile · capped dono taraf</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Net debit = max loss</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>{fmt(spread.net_debit)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    mark par {fmt(spread.net_debit_mark)}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Max profit</div>
                  <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(spread.max_profit)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    width {fmtK(spread.width)} − debit
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Risk : reward</div>
                  <div className="trade-stat-value">1 : {fmt(spread.risk_reward)}</div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Breakeven (expiry)</div>
                  <div className="trade-stat-value">{fmtK(spread.breakeven)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    spot {fmtK(spread.spot)} se {spread.spot != null ? fmtK(Math.abs(spread.breakeven - spread.spot)) : "—"} {isCall ? "upar" : "neeche"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Net greeks ────────────────────────────── */}
            <div>
              <div className="trade-section-label">Net greeks · short leg ka fayda</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Net delta</div>
                  <div className="trade-stat-value">{fmt(spread.net_delta, 3)}</div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Net theta · per din</div>
                  <div className="trade-stat-value" style={{ color: "var(--amber)" }}>{fmt(spread.net_theta)}</div>
                  {spread.long_leg.theta != null && spread.net_theta != null && (
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      akela long hota to {fmt(spread.long_leg.theta)}
                    </div>
                  )}
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Net vega</div>
                  <div className="trade-stat-value">{fmt(spread.net_vega)}</div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Expiry mein</div>
                  <div className="trade-stat-value">{spread.hours_to_expiry != null ? `${spread.hours_to_expiry.toFixed(1)}h` : "—"}</div>
                </div>
              </div>
              {spread.long_leg.theta != null && spread.net_theta != null && spread.long_leg.theta !== 0 && (
                <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Short leg theta ka {Math.max(0, Math.round((1 - spread.net_theta / spread.long_leg.theta) * 100))}% kaat raha hai —
                  yahi spread ka naked buying par sabse bada fayda hai. Badle mein upside {fmtK(spread.short_leg.strike)} par cap ho jaata hai.
                </p>
              )}
            </div>

            {/* ── Exit plan ─────────────────────────────── */}
            <div>
              <div className="trade-section-label">Exit plan</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Entry debit</div>
                  <div className="trade-stat-value">{fmt(spread.net_debit)}</div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Stop · −{slPct}% of debit</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>
                    {fmt(spread.net_debit * (1 - slPct / 100))}
                  </div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    loss {fmt(spread.net_debit * (slPct / 100))}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Target · {tpPct}% of max</div>
                  <div className="trade-stat-value" style={{ color: "var(--green)" }}>
                    {fmt(spread.net_debit + spread.max_profit * (tpPct / 100))}
                  </div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    profit {fmt(spread.max_profit * (tpPct / 100))}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Full profit spot (expiry)</div>
                  <div className="trade-stat-value">{fmtK(spread.short_leg.strike)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    {isCall ? "isse upar" : "isse neeche"} sab barabar
                  </div>
                </div>
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                Breakeven aur full-profit levels <b>expiry par exact</b> hain — strikes se aate hain, kisi estimate se nahi.
                Expiry se pehle spread value inke beech theta aur IV ke hisaab se ghoomti rahegi.
                Time exit: expiry se {timeExit}h pehle dono legs band.
              </p>
            </div>

            {/* ── Alternatives ──────────────────────────── */}
            {data && data.alternatives.length > 0 && (
              <div>
                <div className="trade-section-label">Doosre expiries / strikes</div>
                <div className="overflow-auto max-h-[240px]">
                  <table className="trade-table">
                    <thead>
                      <tr>
                        <th>Long</th>
                        <th>Short</th>
                        <th className="trade-num">Width</th>
                        <th className="trade-num">Debit</th>
                        <th className="trade-num">Max profit</th>
                        <th className="trade-num">R:R</th>
                        <th className="trade-num">BE</th>
                        <th className="trade-num">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.alternatives.map((alt: DebitSpread) => (
                        <tr key={`${alt.long_leg.symbol}-${alt.short_leg.symbol}`}>
                          <td className="tnum">{fmtK(alt.long_leg.strike)}</td>
                          <td className="tnum">{fmtK(alt.short_leg.strike)}</td>
                          <td className="trade-num tnum">{fmtK(alt.width)}</td>
                          <td className="trade-num tnum">{fmt(alt.net_debit)}</td>
                          <td className="trade-num tnum">{fmt(alt.max_profit)}</td>
                          <td className="trade-num tnum">1:{fmt(alt.risk_reward)}</td>
                          <td className="trade-num tnum">{fmtK(alt.breakeven)}</td>
                          <td className="trade-num tnum">{alt.hours_to_expiry != null ? `${alt.hours_to_expiry.toFixed(0)}h` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Debit long ke <b>ask</b> aur short ke <b>bid</b> se nikala hai — asli mein wahi bharna padta hai.
          Mark-based number optimistic hota hai, isliye wo alag se dikhaya hai. Order placement abhi nahi hai.
        </p>
      </div>
    </section>
  );
}

function LegCard({
  label,
  leg,
  price,
  priceLabel,
  accent,
}: {
  label: string;
  leg: DebitSpread["long_leg"];
  price: number | null;
  priceLabel: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: "var(--tr-field)", border: `1px solid ${accent}44` }}>
      <div className="trade-stat-label" style={{ color: accent }}>{label}</div>
      <p className="text-[14.5px] font-bold mt-1 tnum">{leg.symbol}</p>
      <div className="grid grid-cols-3 gap-2 mt-2.5 text-[11.5px] tnum" style={{ color: "var(--text-secondary)" }}>
        <span>Strike <b>{fmtK(leg.strike)}</b></span>
        <span>Delta <b>{fmt(leg.delta, 3)}</b></span>
        <span>{priceLabel} <b>{fmt(price)}</b></span>
        <span>IV <b>{leg.iv != null ? `${(leg.iv * 100).toFixed(0)}%` : "—"}</b></span>
        <span>OI <b>{leg.oi.toLocaleString("en-US", { maximumFractionDigits: 1 })}</b></span>
        <span>Spread <b>{fmt(leg.spread_pct)}%</b></span>
      </div>
    </div>
  );
}
