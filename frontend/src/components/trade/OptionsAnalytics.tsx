"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
  fetchFunding,
  fetchOptionsAnalytics,
  type FundingRow,
  type OptionsAnalytics as Analytics,
} from "@/lib/cryptoApi";

/**
 * Calls aur puts ki identity ke liye categorical hues — app ke green/red nahi.
 * Wahan green/red ka matlab profit/loss hai; unhe yahan identity ke liye use karna
 * P&L tables ke bagal mein confusing hota. Ye jodi CVD ke liye validate ki gayi hai
 * (worst adjacent ΔE 24.7 protan, 33.6 normal-vision).
 */
const CALL = "#2a78d6";
const PUT = "#eb6834";

const UNDERLYINGS = ["BTC", "ETH"];

/**
 * Recharts ka entrance animation line ko stroke-dasharray se "draw" karta hai aur
 * wo requestAnimationFrame par chalta hai. Background tab mein rAF nahi chalta, to
 * dasharray "0, length" par atak jaata hai — line poori tarah invisible. Ek
 * data-dense terminal mein reveal animation ki keemat readability se zyada nahi,
 * isliye har series par isAnimationActive={false} hai.
 */

function pct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function fmtK(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtHours(hours: number): string {
  return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

/** Recharts ka default tooltip app tokens use nahi karta — apna banate hain. */
function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string | number;
  labelPrefix?: string;
  format: (value: number, key?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="trade-chart-tip">
      <div className="trade-chart-tip-head">{labelPrefix}{typeof label === "number" ? fmtK(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="trade-chart-tip-row">
          <span className="trade-chart-tip-dot" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b>{p.value != null ? format(p.value, p.dataKey) : "—"}</b>
        </div>
      ))}
    </div>
  );
}

export default function OptionsAnalytics() {
  const [underlying, setUnderlying] = useState("BTC");
  const [data, setData] = useState<Analytics | null>(null);
  const [funding, setFunding] = useState<FundingRow[]>([]);
  const [expiryKey, setExpiryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analytics, fundingRes] = await Promise.all([
        fetchOptionsAnalytics(underlying),
        fetchFunding().catch(() => null),
      ]);
      if (!analytics.success) throw new Error(analytics.error || "Options data nahi mila");
      setData(analytics);
      setExpiryKey((prev) =>
        prev && analytics.chains.some((c) => c.expiry_key === prev) ? prev : analytics.chains[0]?.expiry_key ?? null,
      );
      setFunding(fundingRes?.success ? fundingRes.rates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Options data nahi mila");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [underlying]);

  useEffect(() => {
    void load();
  }, [load]);

  const chain = useMemo(
    () => data?.chains.find((c) => c.expiry_key === expiryKey) ?? data?.chains[0] ?? null,
    [data, expiryKey],
  );

  const smile = useMemo(
    () =>
      (chain?.strikes ?? [])
        .filter((s) => s.call_iv || s.put_iv)
        .map((s) => ({
          strike: s.strike,
          call: s.call_iv != null ? s.call_iv * 100 : null,
          put: s.put_iv != null ? s.put_iv * 100 : null,
        })),
    [chain],
  );

  // OI sirf un strikes par jahan kuch pada ho — khaali strikes chart ko patla kar dete hain.
  const oi = useMemo(
    () => (chain?.strikes ?? []).filter((s) => s.call_oi > 0 || s.put_oi > 0).map((s) => ({
      strike: s.strike,
      call: s.call_oi,
      put: s.put_oi,
    })),
    [chain],
  );

  const term = useMemo(
    () =>
      (data?.term_structure ?? [])
        .filter((t) => t.atm_iv != null)
        .map((t) => ({ label: fmtHours(t.hours_to_expiry), iv: (t.atm_iv as number) * 100, hours: t.hours_to_expiry })),
    [data],
  );

  // Term structure ka matlab ek line mein — front IV vs back IV.
  const termRead = useMemo(() => {
    if (term.length < 2) return null;
    const front = term[0].iv;
    const back = term[term.length - 1].iv;
    const diff = front - back;
    if (diff > 2) return { tone: "var(--red)", text: `Front IV ${diff.toFixed(1)} point upar — market ko turant kuch bada hone ka dar hai.` };
    if (diff < -2) return { tone: "var(--green)", text: `Front IV ${Math.abs(diff).toFixed(1)} point neeche — abhi shaanti hai, dar aage ka hai.` };
    return { tone: "var(--text-muted)", text: "Front aur back IV lagbhag barabar — koi khaas event pricing mein nahi hai." };
  }, [term]);

  const pcrOi = data?.totals.pcr_oi ?? null;
  const topFunding = funding.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="trade-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-tight leading-tight">Options &amp; Volatility</h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Market khud kya soch raha hai — dar kahan hai, paisa kahan pada hai
            </p>
          </div>
          <div className="flex-1" />
          <div className="trade-seg">
            {UNDERLYINGS.map((u) => (
              <button key={u} type="button" className="trade-seg-btn" data-active={underlying === u} onClick={() => setUnderlying(u)}>
                {u}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
          </button>
        </div>

        {error && (
          <p className="flex items-start gap-2 px-4 py-2.5 text-[12.5px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
            <AlertCircle className="w-4 h-4 mt-px flex-none" />
            {error}
          </p>
        )}

        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 1, background: "var(--tr-line-soft)", borderTop: "1px solid var(--tr-line-soft)" }}>
            <Cell label="Spot" value={fmtK(data.spot)} />
            <Cell
              label="Put / Call · OI"
              value={pcrOi?.toFixed(2) ?? "—"}
              hint={pcrOi == null ? undefined : pcrOi > 1 ? "puts bhaari — bachav khareeda ja raha" : "calls bhaari — upar ka daaon"}
              color={pcrOi == null ? undefined : pcrOi > 1 ? "var(--red)" : "var(--green)"}
            />
            <Cell label="Put / Call · volume" value={data.totals.pcr_volume?.toFixed(2) ?? "—"} hint="aaj ka trading flow" />
            <Cell label="Max pain" value={chain?.max_pain ? fmtK(chain.max_pain.strike) : "—"} hint={chain ? `${chain.expiry_key} expiry` : undefined} />
            <Cell label="Live contracts" value={String(data.totals.contracts)} hint={`${data.chains.length} expiries`} />
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer rounded-xl h-[300px]" />)}
        </div>
      ) : data ? (
        <>
          {/* ── Term structure ───────────────────────────── */}
          <section className="trade-panel">
            <div className="trade-panel-head">
              <div className="min-w-0">
                <span className="trade-panel-title">Term structure — ATM implied volatility</span>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Har expiry par market kitna hilne ki ummeed rakhta hai
                </p>
              </div>
            </div>
            <div className="trade-panel-body">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={term} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                    <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                    {/* IV kabhi zero ke paas nahi jaati — 0 se shuru karne par 32-38% ka
                        asli farq flat dikhta hai. Line chart mein baseline zaroori nahi
                        (bars ke liye hai, jo neeche OI chart mein rakha hai). */}
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} unit="%" width={46} tickFormatter={(v) => v.toFixed(0)} />
                    <Tooltip content={<ChartTooltip labelPrefix="Expiry in " format={(v) => `${v.toFixed(1)}%`} />} cursor={{ stroke: "var(--tr-line)" }} />
                    <Line isAnimationActive={false} type="monotone" dataKey="iv" name="ATM IV" stroke={CALL} strokeWidth={2} dot={{ r: 3, fill: CALL }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {termRead && (
                <p className="text-[12px] mt-2" style={{ color: termRead.tone }}>{termRead.text}</p>
              )}
            </div>
          </section>

          {/* ── Expiry picker ────────────────────────────── */}
          <div className="trade-panel">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="trade-stat-label">Expiry</span>
              <div className="trade-seg overflow-x-auto scrollbar-hide max-w-full">
                {data.chains.map((c) => (
                  <button key={c.expiry_key} type="button" className="trade-seg-btn" data-active={c.expiry_key === chain?.expiry_key} onClick={() => setExpiryKey(c.expiry_key)}>
                    {fmtHours(c.hours_to_expiry)}
                  </button>
                ))}
              </div>
              {chain && (
                <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  ATM {pct(chain.atm_iv)} · PCR {chain.pcr_oi?.toFixed(2) ?? "—"} · {chain.strikes.length} strikes
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* ── IV smile ───────────────────────────────── */}
            <section className="trade-panel">
              <div className="trade-panel-head">
                <div className="min-w-0">
                  <span className="trade-panel-title">IV smile</span>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Har strike par dar — jahan IV upar, wahan option mehnga
                  </p>
                </div>
              </div>
              <div className="trade-panel-body">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={smile} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                      <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                      <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                      <YAxis domain={["dataMin - 3", "dataMax + 3"]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} unit="%" width={46} tickFormatter={(v) => v.toFixed(0)} />
                      <Tooltip content={<ChartTooltip labelPrefix="Strike " format={(v) => `${v.toFixed(1)}%`} />} cursor={{ stroke: "var(--tr-line)" }} />
                      <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }} iconType="plainline" />
                      {data.spot && <ReferenceLine x={data.spot} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "spot", fontSize: 10, fill: "var(--text-muted)", position: "top" }} />}
                      <Line isAnimationActive={false} type="monotone" dataKey="call" name="Call IV" stroke={CALL} strokeWidth={2} dot={false} connectNulls />
                      <Line isAnimationActive={false} type="monotone" dataKey="put" name="Put IV" stroke={PUT} strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* ── OI by strike ───────────────────────────── */}
            <section className="trade-panel">
              <div className="trade-panel-head">
                <div className="min-w-0">
                  <span className="trade-panel-title">Open interest by strike</span>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Paisa kis strike par pada hai — ye levels deewar ban jaate hain
                  </p>
                </div>
              </div>
              <div className="trade-panel-body">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={oi} margin={{ top: 8, right: 12, bottom: 4, left: -8 }} barGap={2}>
                      <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                      <XAxis dataKey="strike" tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={46} />
                      <Tooltip content={<ChartTooltip labelPrefix="Strike " format={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })} />} cursor={{ fill: "var(--tr-field)" }} />
                      <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }} iconType="square" />
                      {chain?.max_pain && (
                        <ReferenceLine x={chain.max_pain.strike} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "max pain", fontSize: 10, fill: "var(--text-muted)", position: "top" }} />
                      )}
                      <Bar isAnimationActive={false} dataKey="call" name="Call OI" fill={CALL} radius={[3, 3, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="put" name="Put OI" fill={PUT} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>

          {/* ── Funding ──────────────────────────────────── */}
          {topFunding.length > 0 && (
            <section className="trade-panel overflow-hidden">
              <div className="trade-panel-head">
                <div className="min-w-0">
                  <span className="trade-panel-title">Funding rates — bheed kis taraf hai</span>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Positive matlab long walon ko fees deni pad rahi hai; negative matlab short walon ko
                  </p>
                </div>
              </div>
              <div className="overflow-auto max-h-[320px]">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="trade-num">Funding</th>
                      <th className="trade-num">Mark price</th>
                      <th className="trade-num">24h</th>
                      <th className="trade-num">Open interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFunding.map((r) => {
                      const f = r.funding_rate ?? 0;
                      return (
                        <tr key={r.symbol}>
                          <td className="font-bold tnum">{r.symbol}</td>
                          <td className="trade-num tnum font-bold" style={{ color: f > 0 ? "var(--green)" : f < 0 ? "var(--red)" : undefined }}>
                            {f > 0 ? "+" : ""}{f.toFixed(4)}%
                          </td>
                          <td className="trade-num tnum">{r.mark_price?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "—"}</td>
                          <td className="trade-num tnum" style={{ color: (r.change_24h ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                            {r.change_24h != null ? `${r.change_24h >= 0 ? "+" : ""}${r.change_24h.toFixed(2)}%` : "—"}
                          </td>
                          <td className="trade-num tnum">${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(r.oi_value_usd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Saara data Delta Exchange ke live option chain se hai. <b>Max pain</b> wo strike hai jahan expiry par
            option kharidne walon ki total value sabse kam bachti hai — traders ise dekhte hain, par ye koi niyam
            nahi hai. Ye page analysis ke liye hai, trading advice nahi.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Cell({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="px-4 py-2.5" style={{ background: "var(--bg-card)" }}>
      <div className="trade-stat-label">{label}</div>
      <div className="text-[15px] font-bold mt-1 tnum tracking-tight" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {hint && <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}
