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
 * Premium ke kisi level par pahunchne ke liye spot kahan hona chahiye.
 *
 * Δpremium ≈ delta·Δspot + ½·gamma·Δspot² — gamma ke saath quadratic solve karte
 * hain (linear se behtar, khaas kar bade moves par). Do roots mein se wahi lete
 * hain jo zero ke paas ho; puts par delta negative hota hai aur wahi root sahi
 * direction deta hai.
 *
 * Ye estimate IV constant aur time freeze maan kar chalta hai — theta ko ignore
 * karta hai. Short-dated options par theta bada hota hai, isliye asli level
 * time ke saath upar khisakta rehta hai. UI mein ye baat likhi hai.
 */
function spotForPremium(
  targetPremium: number,
  currentPremium: number,
  delta: number,
  gamma: number | null,
  spot: number | null,
): number | null {
  if (!spot || !delta) return null;
  const dP = targetPremium - currentPremium;
  if (!gamma || Math.abs(gamma) < 1e-12) return spot + dP / delta;

  const disc = delta * delta + 2 * gamma * dP;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const a = (-delta + root) / gamma;
  const b = (-delta - root) / gamma;
  const move = Math.abs(a) <= Math.abs(b) ? a : b;
  return Number.isFinite(move) ? spot + move : null;
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
  const thetaPctPerDay =
    selected?.theta != null && premium ? (selected.theta / premium) * 100 : null;
  const thetaTone =
    thetaPctPerDay == null ? "var(--text-muted)" : Math.abs(thetaPctPerDay) >= 30 ? "var(--red)" : "var(--amber)";

  /** Trade plan ke har level par spot approx kahan hoga. */
  const spotAt = (target: number) =>
    selected && premium
      ? spotForPremium(target, premium, selected.delta, selected.gamma, selected.spot)
      : null;
  const fmtSpot = (value: number | null) =>
    value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });

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
                {" "}OI {selected.oi.toLocaleString("en-US", { maximumFractionDigits: 1 })} ·
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

            {/* Theta decay — OTM buying ka sabse bada dushman, isliye alag se aur
                premium ke % mein, taaki number ka matlab turant samajh aaye. */}
            <div>
              <div className="trade-section-label">Greeks · time decay risk</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Theta · per din</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>{fmt(selected.theta)}</div>
                  {thetaPctPerDay != null && (
                    <div className="text-[11px] mt-1 tnum" style={{ color: thetaTone }}>
                      premium ka {Math.abs(thetaPctPerDay).toFixed(1)}%/din
                    </div>
                  )}
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Theta · per ghanta</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>
                    {selected.theta != null ? fmt(selected.theta / 24) : "—"}
                  </div>
                  {thetaPctPerDay != null && (
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      ≈ {Math.abs(thetaPctPerDay / 24).toFixed(2)}%/ghanta
                    </div>
                  )}
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Vega · per 1% IV</div>
                  <div className="trade-stat-value">{fmt(selected.vega)}</div>
                  {selected.vega != null && selected.premium ? (
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      IV 1 point giri to −{((selected.vega / selected.premium) * 100).toFixed(1)}%
                    </div>
                  ) : null}
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Gamma · per $1 spot</div>
                  <div className="trade-stat-value">{fmt(selected.gamma, 6)}</div>
                </div>
              </div>
              {thetaPctPerDay != null && Math.abs(thetaPctPerDay) >= 30 && (
                <p className="text-[11.5px] mt-2" style={{ color: "var(--amber)" }}>
                  Ye contract roz apne premium ka {Math.abs(thetaPctPerDay).toFixed(0)}% kho raha hai. Spot bilkul
                  na hile tab bhi position ghatti rahegi — is decay par sirf tez move hi bhaari padta hai.
                </p>
              )}
            </div>

            {premium != null && (
              <div>
                <div className="trade-section-label">Trade plan (premium par)</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="trade-stat">
                    <div className="trade-stat-label">Entry (ask)</div>
                    <div className="trade-stat-value">{fmt(selected.best_ask ?? premium)}</div>
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      spot {fmtSpot(selected.spot)}
                    </div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Stop loss · −{slPct}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--red)" }}>{fmt(premium * (1 - slPct / 100))}</div>
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      spot ≈ {fmtSpot(spotAt(premium * (1 - slPct / 100)))}
                    </div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Book 50% · +{tp1}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(premium * (1 + tp1 / 100))}</div>
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      spot ≈ {fmtSpot(spotAt(premium * (1 + tp1 / 100)))}
                    </div>
                  </div>
                  <div className="trade-stat">
                    <div className="trade-stat-label">Final · +{tp2}%</div>
                    <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(premium * (1 + tp2 / 100))}</div>
                    <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                      spot ≈ {fmtSpot(spotAt(premium * (1 + tp2 / 100)))}
                    </div>
                  </div>
                </div>
                <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Spot levels delta aur gamma se nikale gaye estimate hain — IV wahi rehne aur time freeze
                  maan kar. Theta har ghante premium khaata hai, isliye jitni der lagegi target utna hi upar
                  khisakta jayega.{" "}
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
                        <th className="trade-num">OI</th>
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
                          <td className="trade-num tnum">{c.oi.toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>
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
