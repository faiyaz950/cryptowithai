"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Waves } from "lucide-react";
import { fetchIronCondor, optionUnderlying, type CondorResponse, type IronCondor } from "@/lib/cryptoApi";
import { num, str, type StrategyDef, type StrategyValues } from "@/lib/strategies";

interface Props {
  def: StrategyDef;
  values: StrategyValues;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtK(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Iron condor ke chaar legs aur uska risk profile.
 *
 * Yahan A/B se do cheezein ulti hain aur wahi is strategy ka poora point hai:
 * theta positive hota hai (time aapke saath) aur vega negative (IV badhna nuksaan).
 * Panel dono ko saaf dikhata hai, aur IV elevated ho to entry se pehle warn karta hai.
 */
export default function CondorPanel({ def, values }: Props) {
  const [data, setData] = useState<CondorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const underlying = optionUnderlying(str(values, "symbol", "BTCUSDT"));
  const shortDelta = num(values, "short_delta", 0.175);
  const longDelta = num(values, "long_delta", 0.075);
  const maxSpread = num(values, "max_spread_pct", 10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchIronCondor({ underlying, shortDelta, longDelta, maxSpreadPct: maxSpread });
      if (!res.success) throw new Error(res.error || "Condor load nahi hua");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Condor load nahi hua");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [underlying, shortDelta, longDelta, maxSpread]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!def.optionCondor) return null;

  const condor = data?.selected ?? null;
  const tpPct = num(values, "tp_credit_pct", 50);
  const slMult = num(values, "sl_credit_mult", 1.5);
  const emergencyDelta = num(values, "emergency_delta", 0.35);
  const maxIv = num(values, "max_iv_pct", 60);
  const timeExit = num(values, "time_exit_hours", 12);

  // Doc: IV elevated ho to naye entries block. Shorts ki IV hi sabse relevant hai.
  const shortIv = condor
    ? Math.max(condor.short_call.iv ?? 0, condor.short_put.iv ?? 0) * 100
    : null;
  const ivElevated = shortIv != null && shortIv > maxIv;

  return (
    <section className="trade-panel">
      <div className="trade-panel-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="trade-panel-title">Condor legs</span>
          <span className="trade-badge trade-badge-amber">{underlying} · 4 legs</span>
          <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
            short {shortDelta} · long {longDelta}
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

        {!error && !condor && !loading && (
          <div className="trade-empty">
            <span className="trade-empty-icon"><Waves className="w-4 h-4" /></span>
            In delta bands par koi tradable condor nahi mila. Deltas ya bid/ask limit adjust karein.
          </div>
        )}

        {condor && (
          <>
            {ivElevated && (
              <p className="rounded-xl px-4 py-3 text-[12.5px]" style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)", color: "var(--amber)" }}>
                <b>IV elevated hai</b> — short legs {shortIv?.toFixed(0)}% par, aapki limit {maxIv}%.
                Spec kehta hai aise waqt naye condor entries block karein: ye position short vega hai,
                IV aur badhi to nuksaan hoga.
              </p>
            )}

            {/* ── Chaar legs, strike order mein ─────────── */}
            <div className="grid gap-2">
              <LegRow action="BUY" label="Upper protection" leg={condor.long_call} price={condor.long_call.best_ask} priceLabel="Ask" />
              <LegRow action="SELL" label="Short call" leg={condor.short_call} price={condor.short_call.best_bid} priceLabel="Bid" highlight />
              <SpotRow spot={condor.spot} />
              <LegRow action="SELL" label="Short put" leg={condor.short_put} price={condor.short_put.best_bid} priceLabel="Bid" highlight />
              <LegRow action="BUY" label="Lower protection" leg={condor.long_put} price={condor.long_put.best_ask} priceLabel="Ask" />
            </div>

            {/* ── Risk profile ──────────────────────────── */}
            <div>
              <div className="trade-section-label">Risk profile</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Net credit = max profit</div>
                  <div className="trade-stat-value" style={{ color: "var(--green)" }}>{fmt(condor.net_credit)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    mark par {fmt(condor.net_credit_mark)}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Max loss</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>{fmt(condor.max_loss)}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    wing {fmtK(Math.max(condor.call_wing, condor.put_wing))} − credit
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Risk : reward</div>
                  <div className="trade-stat-value">{condor.risk_reward ? `1 : ${fmt(condor.risk_reward)}` : "—"}</div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    jeet chhoti, haar badi
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Expiry mein</div>
                  <div className="trade-stat-value">{condor.hours_to_expiry != null ? `${condor.hours_to_expiry.toFixed(0)}h` : "—"}</div>
                </div>
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                Poora credit tab milta hai jab expiry par spot <b>{fmtK(condor.profit_zone_low)} – {fmtK(condor.profit_zone_high)}</b> ke
                beech ho. Breakevens <b>{fmtK(condor.breakeven_low)}</b> aur <b>{fmtK(condor.breakeven_high)}</b> — inke bahar nuksaan
                shuru. Ye levels strikes se aate hain, expiry par exact hain.
              </p>
            </div>

            {/* ── Net greeks — yahan ulta hai ───────────── */}
            <div>
              <div className="trade-section-label">Net greeks · A aur B se ulta</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Net theta · per din</div>
                  <div className="trade-stat-value" style={{ color: (condor.net_theta ?? 0) > 0 ? "var(--green)" : "var(--red)" }}>
                    {fmt(condor.net_theta)}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    {(condor.net_theta ?? 0) > 0 ? "time aapke saath hai" : "time khilaf hai"}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Net vega</div>
                  <div className="trade-stat-value" style={{ color: (condor.net_vega ?? 0) < 0 ? "var(--amber)" : "var(--text-primary)" }}>
                    {fmt(condor.net_vega)}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    IV badhi to nuksaan
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Net delta</div>
                  <div className="trade-stat-value">{fmt(condor.net_delta, 3)}</div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    ~neutral hona chahiye
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Short legs IV</div>
                  <div className="trade-stat-value" style={{ color: ivElevated ? "var(--amber)" : "var(--text-primary)" }}>
                    {shortIv != null ? `${shortIv.toFixed(0)}%` : "—"}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>limit {maxIv}%</div>
                </div>
              </div>
            </div>

            {/* ── Exit plan ─────────────────────────────── */}
            <div>
              <div className="trade-section-label">Exit plan</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="trade-stat">
                  <div className="trade-stat-label">Target · {tpPct}% of credit</div>
                  <div className="trade-stat-value" style={{ color: "var(--green)" }}>
                    +{fmt(condor.net_credit * (tpPct / 100))}
                  </div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    position value {fmt(condor.net_credit * (1 - tpPct / 100))} par
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Stop · {slMult}x credit</div>
                  <div className="trade-stat-value" style={{ color: "var(--red)" }}>
                    −{fmt(condor.net_credit * slMult)}
                  </div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    position value {fmt(condor.net_credit * (1 + slMult))} par
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Emergency delta</div>
                  <div className="trade-stat-value">{emergencyDelta}</div>
                  <div className="text-[11px] mt-1 tnum" style={{ color: "var(--text-muted)" }}>
                    abhi {fmt(Math.max(Math.abs(condor.short_call.delta), Math.abs(condor.short_put.delta)), 3)}
                  </div>
                </div>
                <div className="trade-stat">
                  <div className="trade-stat-label">Time exit</div>
                  <div className="trade-stat-value">{timeExit}h</div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>expiry se pehle</div>
                </div>
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: "var(--text-muted)" }}>
                Turant nikalne wali conditions: price range tod de, ADX threshold ke upar chala jaaye,
                kisi short strike ka delta {emergencyDelta} paar kar jaaye, ya IV tez badh jaaye.
                Short strike ka delta badhna matlab wo side risk mein aa rahi hai.
              </p>
            </div>
          </>
        )}

        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Credit shorts ke <b>bid</b> aur longs ke <b>ask</b> se nikala hai — asli fill wahi hota hai.
          Chaaron legs ek saath lagni chahiye; ek-ek karke lagane par beech mein price hil gaya to
          risk profile wo nahi rahega jo yahan dikh raha hai. Order placement abhi nahi hai.
        </p>
      </div>
    </section>
  );
}

function LegRow({
  action,
  label,
  leg,
  price,
  priceLabel,
  highlight,
}: {
  action: "BUY" | "SELL";
  label: string;
  leg: IronCondor["short_call"];
  price: number | null;
  priceLabel: string;
  highlight?: boolean;
}) {
  const isSell = action === "SELL";
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] px-3 py-2.5"
      style={{
        background: highlight ? "var(--tr-field)" : "var(--bg-card)",
        border: `1px solid ${highlight ? "var(--tr-line)" : "var(--tr-line-soft)"}`,
      }}
    >
      <span className={`trade-badge ${isSell ? "trade-badge-red" : "trade-badge-green"}`} style={{ minWidth: 52, justifyContent: "center" }}>
        {action}
      </span>
      <span className="text-[12px] font-semibold" style={{ minWidth: 118, color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-[13px] font-bold tnum" style={{ minWidth: 78 }}>{fmtK(leg.strike)}</span>
      <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>delta {fmt(leg.delta, 3)}</span>
      <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>{priceLabel} {fmt(price)}</span>
      <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>OI {leg.oi.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
    </div>
  );
}

function SpotRow({ spot }: { spot: number | null }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
        Spot {fmtK(spot)}
      </span>
      <span className="flex-1" style={{ borderTop: "1px dashed var(--accent)", opacity: 0.4 }} />
    </div>
  );
}
