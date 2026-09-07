"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Target } from "lucide-react";
import {
  fetchOptionChain,
  optionUnderlying,
  type OptionChainResponse,
  type OptionContract,
} from "@/lib/cryptoApi";
import { num, str, type StrategyDef, type StrategyValues, type SignalTone } from "@/lib/strategies";

interface Props {
  def: StrategyDef;
  values: StrategyValues;
  /** Live signal ka tone — isse tay hota hai call chahiye ya put. */
  tone: SignalTone;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtUsd(value: number): string {
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

/**
 * Strategy A fixed "5% OTM" nahi, Delta band se strike chunti hai. Ye panel wahi
 * band backend ko bhejta hai aur jo contract liquidity filters paas karta hai
 * usko dikhata hai — saath mein premium par SL/target bhi, doc ke rules se.
 */
export default function OptionChainPanel({ def, values, tone }: Props) {
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = def.optionChain;
  const optionType = config ? (tone === "sell" ? config.bearish : config.bullish) : "call";
  const underlying = optionUnderlying(str(values, "symbol", "BTCUSDT"));
  const minDelta = num(values, "delta_min", 0.25);
  const maxDelta = num(values, "delta_max", 0.35);
  const maxSpread = num(values, "max_spread_pct", 5);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOptionChain({ underlying, optionType, minDelta, maxDelta, maxSpreadPct: maxSpread });
      if (!res.success) throw new Error(res.error || "Option chain load nahi hui");
      setChain(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Option chain load nahi hui");
      setChain(null);
    } finally {
      setLoading(false);
    }
  }, [underlying, optionType, minDelta, maxDelta, maxSpread]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!config) return null;

  const selected = chain?.selected ?? null;
  const slPct = num(values, "sl_premium_pct", 45);
  const tp1 = num(values, "tp1_pct", 100);
  const tp2 = num(values, "tp2_pct", 200);
  const timeExit = num(values, "time_exit_hours", 2);
  const premium = selected?.premium ?? null;

  return (
    <section className="trade-panel">
      <div className="trade-panel-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="trade-panel-title">Strike selection</span>
          <span className={`trade-badge ${optionType === "call" ? "trade-badge-green" : "trade-badge-red"}`}>
            {underlying} {optionType.toUpperCase()}
          </span>
          <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
            Delta {minDelta}–{maxDelta}
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

        {!error && !selected && !loading && (
          <div className="trade-empty">
            <span className="trade-empty-icon"><Target className="w-4 h-4" /></span>
            Is delta band mein koi contract filters paas nahi kar paya. Band chaudi karein ya spread limit badhayein.
          </div>
        )}

        {selected && (
          <>
            <div className="rounded-xl px-4 py-3.5" style={{ background: "var(--tr-field)", border: "1px solid var(--tr-line)" }}>
              <div className="trade-stat-label">Selected contract</div>
              <p className="text-[16px] font-bold mt-1 tnum">{selected.symbol}</p>
              <p className="text-[12.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
                Strike {selected.strike?.toLocaleString("en-US")} · spot {selected.spot?.toLocaleString("en-US")} ·
                {" "}expiry {selected.hours_to_expiry != null ? `${selected.hours_to_expiry.toFixed(1)}h baaki` : "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="trade-stat">
                <div className="trade-stat-label">Delta</div>
                <div className="trade-stat-value">{fmt(selected.delta, 3)}</div>
              </div>
              <div className="trade-stat">
                <div className="trade-stat-label">Premium</div>
                <div className="trade-stat-value">{fmt(selected.premium)}</div>
              </div>
              <div className="trade-stat">
                <div className="trade-stat-label">IV</div>
                <div className="trade-stat-value">{selected.iv != null ? `${(selected.iv * 100).toFixed(1)}%` : "—"}</div>
              </div>
              <div className="trade-stat">
                <div className="trade-stat-label">Bid / Ask spread</div>
                <div className="trade-stat-value">{fmt(selected.spread_pct)}%</div>
              </div>
            </div>

            {premium != null && (
              <div>
                <div className="trade-section-label">Trade plan (premium par)</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="trade-stat">
                    <div className="trade-stat-label">Entry (ask)</div>
                    <div className="trade-stat-value">{fmt(selected.best_ask ?? premium)}</div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Stop loss · −{slPct}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--red)" }}>{fmt(premium * (1 - slPct / 100))}</div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Book 50% · +{tp1}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(premium * (1 + tp1 / 100))}</div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Final · +{tp2}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(premium * (1 + tp2 / 100))}</div>
                  </div>
                </div>
                <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Time exit: expiry se {timeExit}h pehle position band — profit/loss chahe kuch bhi ho.
                  {selected.hours_to_expiry != null && selected.hours_to_expiry <= timeExit && (
                    <b style={{ color: "var(--amber)" }}> Ye contract already us window mein hai.</b>
                  )}
                </p>
              </div>
            )}

            {chain && chain.candidates.length > 1 && (
              <div>
                <div className="trade-section-label">Doosre candidates</div>
                <div className="overflow-auto max-h-[240px]">
                  <table className="trade-table">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th className="trade-num">Delta</th>
                        <th className="trade-num">Premium</th>
                        <th className="trade-num">IV</th>
                        <th className="trade-num">Spread</th>
                        <th className="trade-num">Turnover</th>
                        <th className="trade-num">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chain.candidates.map((c: OptionContract) => (
                        <tr key={c.symbol}>
                          <td className="tnum">{c.symbol}</td>
                          <td className="trade-num tnum">{fmt(c.delta, 3)}</td>
                          <td className="trade-num tnum">{fmt(c.premium)}</td>
                          <td className="trade-num tnum">{c.iv != null ? `${(c.iv * 100).toFixed(0)}%` : "—"}</td>
                          <td className="trade-num tnum">{fmt(c.spread_pct)}%</td>
                          <td className="trade-num tnum">{fmtUsd(c.turnover_usd)}</td>
                          <td className="trade-num tnum">{c.hours_to_expiry != null ? `${c.hours_to_expiry.toFixed(0)}h` : "—"}</td>
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
          Chain Delta Exchange se live aati hai aur band + liquidity filters (spread ≤ {maxSpread}%, two-sided quote,
          expiry {">"} 4h) paas karne wale contracts hi dikhte hain. Order placement abhi nahi hai — ye selection aur
          trade plan dikhata hai, trade khud lagani hogi.
        </p>
      </div>
    </section>
  );
}
