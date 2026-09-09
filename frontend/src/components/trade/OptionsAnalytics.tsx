"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertCircle, RefreshCw, Scale, Sigma, Timer, type LucideIcon } from "lucide-react";
import {
  fetchFunding,
  fetchMarketInfo,
  fetchOptionsAnalytics,
  type FundingRow,
  type MarketInfo,
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

/**
 * Term structure mein sirf ek series hai, isliye yahan adjacent-pair contrast ka
 * sawaal nahi uthta. Indigo page ke masthead gradient se mel khaata hai aur CALL
 * blue se alag hai, taaki koi is line ko "call IV" na samjhe.
 */
const IV = "#4f46e5";

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

/** Panel head mein legend — chart ke neeche rakhne se uski height kam ho jaati hai. */
function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="trade-key">
      <span className="trade-key-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}

interface MarketRead {
  icon: LucideIcon;
  label: string;
  verdict: string;
  body: string;
  tone: string;
}

export default function OptionsAnalytics() {
  const [underlying, setUnderlying] = useState("BTC");
  const [data, setData] = useState<Analytics | null>(null);
  const [funding, setFunding] = useState<FundingRow[]>([]);
  /**
   * Sirf 24h change ke liye. Funding feed mein majors nahi aate (wo sirf sabse
   * hilti hui perpetuals lautata hai), isliye ye alag call zaroori hai.
   */
  const [spotInfo, setSpotInfo] = useState<MarketInfo | null>(null);
  const [expiryKey, setExpiryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analytics, fundingRes, info] = await Promise.all([
        fetchOptionsAnalytics(underlying),
        fetchFunding().catch(() => null),
        fetchMarketInfo(`${underlying}USDT`).catch(() => null),
      ]);
      if (!analytics.success) throw new Error(analytics.error || "Options data nahi mila");
      setData(analytics);
      setExpiryKey((prev) =>
        prev && analytics.chains.some((c) => c.expiry_key === prev) ? prev : analytics.chains[0]?.expiry_key ?? null,
      );
      setFunding(fundingRes?.success ? fundingRes.rates : []);
      setSpotInfo(info?.success ? info : null);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
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

  /** Sabse nazdeeki expiry — "abhi market kya soch raha hai" isi se padha jaata hai. */
  const front = data?.chains[0] ?? null;

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

  /** Front IV vs back IV — curve ka dhal hi "event kab hai" bata deta hai. */
  const termSlope = useMemo(() => (term.length < 2 ? null : term[0].iv - term[term.length - 1].iv), [term]);

  const pcrOi = data?.totals.pcr_oi ?? null;

  /**
   * Teen sawaal jinke jawab traders sabse pehle dhoondte hain: volatility mehngi
   * hai ya sasti, bheed kis taraf khadi hai, aur dar abhi ka hai ya aage ka.
   * Raw number har card par likha rehta hai, taaki verdict par andha bharosa
   * na karna pade.
   */
  const reads = useMemo<MarketRead[]>(() => {
    const out: MarketRead[] = [];
    const ivPct = front?.atm_iv != null ? front.atm_iv * 100 : null;

    if (ivPct != null) {
      const band =
        ivPct < 35
          ? { tone: "var(--green)", verdict: "Volatility sasti hai", body: "Option premium kam hai — market abhi bade jhatke ki ummeed nahi kar raha. Kharidne walon ke liye theek, bechne walon ke liye kam kamai." }
          : ivPct <= 55
            ? { tone: "var(--accent)", verdict: "Volatility normal hai", body: "Premium na mehnga na sasta. Aisi haalat mein direction ka sahi hona zyada maayne rakhta hai, volatility ka nahi." }
            : { tone: "var(--red)", verdict: "Volatility mehngi hai", body: "Premium chadha hua hai — market ko bade move ka dar hai. Option kharidna mehnga padega, chahe direction sahi ho." };
      out.push({
        icon: Activity,
        label: "Volatility",
        tone: band.tone,
        verdict: band.verdict,
        body: `Nearest expiry (${fmtHours(front!.hours_to_expiry)}) par ATM IV ${ivPct.toFixed(1)}%. ${band.body}`,
      });
    }

    if (pcrOi != null) {
      const perHundred = Math.round(pcrOi * 100);
      const band =
        pcrOi > 1.15
          ? { tone: "var(--red)", verdict: "Puts bhaari — bachav khareeda ja raha", body: "Log giravat se bachne ke liye insurance le rahe hain." }
          : pcrOi < 0.85
            ? { tone: "var(--green)", verdict: "Calls bhaari — upar ka daaon", body: "Bheed tezi par paisa laga rahi hai." }
            : { tone: "var(--text-secondary)", verdict: "Dono taraf barabar", body: "Positioning se koi saaf jhukav nahi nikal raha." };
      out.push({
        icon: Scale,
        label: "Positioning",
        tone: band.tone,
        verdict: band.verdict,
        body: `Har 100 call ke saamne ${perHundred} put khule hain. ${band.body}`,
      });
    }

    if (termSlope != null) {
      const band =
        termSlope > 2
          ? { tone: "var(--red)", verdict: "Dar turant ka hai", body: `Front IV baad wali expiry se ${termSlope.toFixed(1)} point upar — market ko jaldi kuch bada hone ki aashanka hai.` }
          : termSlope < -2
            ? { tone: "var(--green)", verdict: "Dar aage ka hai", body: `Front IV ${Math.abs(termSlope).toFixed(1)} point neeche — abhi shaanti hai, chinta door ki expiry mein pricing ho rahi hai.` }
            : { tone: "var(--text-secondary)", verdict: "Curve flat hai", body: "Front aur back IV lagbhag barabar — kisi khaas event ki pricing nahi dikh rahi." };
      out.push({ icon: Timer, label: "Event risk", tone: band.tone, verdict: band.verdict, body: band.body });
    }

    return out;
  }, [front, pcrOi, termSlope]);

  /** Max pain spot se kitni door hai — number se zyada ye distance kaam ka hai. */
  const maxPainGap = useMemo(() => {
    if (!chain?.max_pain || !data?.spot) return undefined;
    const diff = ((chain.max_pain.strike - data.spot) / data.spot) * 100;
    if (Math.abs(diff) < 0.05) return "spot par hi";
    return `spot se ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? "upar" : "neeche"}`;
  }, [chain, data]);

  const topFunding = funding.slice(0, 10);
  const maxAbsFunding = useMemo(
    () => Math.max(...topFunding.map((r) => Math.abs(r.funding_rate ?? 0)), 1e-6),
    [topFunding],
  );

  return (
    <div className="space-y-4">
      {/* ── Masthead ───────────────────────────────────── */}
      <div className="trade-panel trade-hero">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-4 pb-3.5">
          <span className="trade-hero-icon"><Sigma className="w-5 h-5" /></span>

          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-tight leading-tight">Options &amp; Volatility</h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Market khud kya soch raha hai — dar kahan hai, paisa kahan pada hai
            </p>
          </div>

          <div className="trade-divider-v hidden lg:block my-0.5" />

          {data?.spot != null && (
            <div className="min-w-0">
              <div className="trade-stat-label">{underlying} spot</div>
              <div className="flex items-baseline gap-2">
                <span className="trade-hero-price">${fmtK(data.spot)}</span>
                {spotInfo && (
                  <span
                    className="text-[12px] font-bold tnum"
                    style={{ color: spotInfo.change_24h >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {spotInfo.change_24h >= 0 ? "+" : ""}{spotInfo.change_24h.toFixed(2)}% <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>24h</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
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

          {updatedAt && (
            <span className="w-full lg:w-auto text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
              {data ? `${data.chains.length} expiries · ` : ""}updated {updatedAt}
            </span>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-2 px-4 py-2.5 text-[12.5px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
            <AlertCircle className="w-4 h-4 mt-px flex-none" />
            {error}
          </p>
        )}

        {data && (
          <div className="trade-kpi-rail">
            <Kpi
              label="ATM IV · nearest"
              value={pct(front?.atm_iv)}
              hint={front ? `${fmtHours(front.hours_to_expiry)} expiry` : undefined}
              color={IV}
            />
            {/* Iska matlab Positioning card padhta hai — yahan sirf raw ratio,
                warna dono jagah alag-alag threshold se ulta-pulta lagta hai. */}
            <Kpi
              label="Put / Call · OI"
              value={pcrOi?.toFixed(2) ?? "—"}
              hint={pcrOi == null ? undefined : `har 100 call par ${Math.round(pcrOi * 100)} put`}
            />
            <Kpi label="Put / Call · volume" value={data.totals.pcr_volume?.toFixed(2) ?? "—"} hint="aaj ka trading flow" />
            <Kpi label="Max pain" value={chain?.max_pain ? fmtK(chain.max_pain.strike) : "—"} hint={maxPainGap ?? (chain ? `${chain.expiry_key} expiry` : undefined)} />
            <Kpi label="Live contracts" value={String(data.totals.contracts)} hint={`${data.chains.length} expiries`} />
          </div>
        )}
      </div>

      {loading && !data ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="shimmer rounded-xl h-[104px]" />)}
          </div>
          <div className="shimmer rounded-xl h-[290px]" />
          <div className="grid gap-4 xl:grid-cols-2">
            {[0, 1].map((i) => <div key={i} className="shimmer rounded-xl h-[330px]" />)}
          </div>
        </>
      ) : data ? (
        <>
          {/* ── Market read ──────────────────────────────── */}
          {reads.length > 0 && (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {reads.map((r) => (
                <div key={r.label} className="trade-read" style={{ "--read-tone": r.tone } as CSSProperties}>
                  <div className="trade-read-head">
                    <r.icon className="w-3.5 h-3.5" style={{ color: r.tone }} />
                    {r.label}
                  </div>
                  <div className="trade-read-verdict">{r.verdict}</div>
                  <p className="trade-read-body">{r.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Term structure ───────────────────────────── */}
          <section className="trade-panel">
            <div className="trade-panel-head">
              <div className="min-w-0">
                <span className="trade-panel-title">Term structure — ATM implied volatility</span>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Har expiry par market kitna hilne ki ummeed rakhta hai
                </p>
              </div>
              <Key color={IV} label="ATM IV" />
            </div>
            <div className="trade-panel-body">
              <div style={{ height: 248 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={term} margin={{ top: 22, right: 16, bottom: 4, left: -8 }}>
                    <defs>
                      <linearGradient id="ivFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={IV} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={IV} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                    {/* IV kabhi zero ke paas nahi jaati — 0 se shuru karne par 32-38% ka
                        asli farq flat dikhta hai. Line chart mein baseline zaroori nahi
                        (bars ke liye hai, jo neeche OI chart mein rakha hai).
                        Axis floor (dataMin-2) ko data samajhna aasaan hai, isliye
                        har point pe IV label bhi dikhate hain. */}
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} unit="%" width={46} tickFormatter={(v) => v.toFixed(0)} />
                    <Tooltip content={<ChartTooltip labelPrefix="Expiry in " format={(v) => `${v.toFixed(1)}%`} />} cursor={{ stroke: "var(--tr-line)" }} />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="iv"
                      name="ATM IV"
                      stroke={IV}
                      strokeWidth={2.25}
                      fill="url(#ivFill)"
                      dot={{ r: 3, fill: "#fff", stroke: IV, strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: IV, stroke: "#fff", strokeWidth: 2 }}
                    >
                      <LabelList
                        dataKey="iv"
                        position="top"
                        offset={10}
                        formatter={(v) => (typeof v === "number" ? `${v.toFixed(1)}%` : "")}
                        style={{ fontSize: 11, fontWeight: 600, fill: "var(--text-secondary)" }}
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ── Expiry picker ────────────────────────────── */}
          <div className="trade-panel">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="trade-stat-label">Expiry</div>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Neeche ke dono chart isi expiry ke hain
                </p>
              </div>
              {/* Phone par rail apni poori chaudai leti hai — flex row mein
                  nichud kar sirf ek chip dikhti thi. */}
              <div className="w-full sm:flex-1 sm:w-auto min-w-0 trade-expiry-rail">
                {data.chains.map((c) => (
                  <button
                    key={c.expiry_key}
                    type="button"
                    title={`${c.expiry_key} · ${c.strikes.length} strikes`}
                    className="trade-expiry-chip"
                    data-active={c.expiry_key === chain?.expiry_key}
                    onClick={() => setExpiryKey(c.expiry_key)}
                  >
                    <span className="trade-expiry-dte">{fmtHours(c.hours_to_expiry)}</span>
                    <span className="trade-expiry-iv">IV {pct(c.atm_iv, 1)}</span>
                  </button>
                ))}
              </div>
              {chain && (
                <span className="text-[11.5px] tnum" style={{ color: "var(--text-muted)" }}>
                  {chain.strikes.length} strikes · PCR {chain.pcr_oi?.toFixed(2) ?? "—"}
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
                <div className="flex items-center gap-3 flex-none">
                  <Key color={CALL} label="Call IV" />
                  <Key color={PUT} label="Put IV" />
                </div>
              </div>
              <div className="trade-panel-body">
                <div style={{ height: 270 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={smile} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
                      <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                      <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                      <YAxis domain={["dataMin - 3", "dataMax + 3"]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} unit="%" width={46} tickFormatter={(v) => v.toFixed(0)} />
                      <Tooltip content={<ChartTooltip labelPrefix="Strike " format={(v) => `${v.toFixed(1)}%`} />} cursor={{ stroke: "var(--tr-line)" }} />
                      {data.spot && (
                        <ReferenceLine
                          x={data.spot}
                          stroke="var(--text-muted)"
                          strokeDasharray="4 4"
                          label={{ value: "spot", fontSize: 10, fontWeight: 700, fill: "var(--text-muted)", position: "top" }}
                        />
                      )}
                      <Line isAnimationActive={false} type="monotone" dataKey="call" name="Call IV" stroke={CALL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                      <Line isAnimationActive={false} type="monotone" dataKey="put" name="Put IV" stroke={PUT} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
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
                <div className="flex items-center gap-3 flex-none">
                  <Key color={CALL} label="Call OI" />
                  <Key color={PUT} label="Put OI" />
                </div>
              </div>
              <div className="trade-panel-body">
                <div style={{ height: 270 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={oi} margin={{ top: 10, right: 12, bottom: 4, left: -8 }} barGap={2}>
                      <defs>
                        <linearGradient id="callBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CALL} stopOpacity={1} />
                          <stop offset="100%" stopColor={CALL} stopOpacity={0.62} />
                        </linearGradient>
                        <linearGradient id="putBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PUT} stopOpacity={1} />
                          <stop offset="100%" stopColor={PUT} stopOpacity={0.62} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--tr-line-soft)" vertical={false} />
                      <XAxis dataKey="strike" tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--tr-line)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={46} />
                      <Tooltip content={<ChartTooltip labelPrefix="Strike " format={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })} />} cursor={{ fill: "var(--tr-field)" }} />
                      {chain?.max_pain && (
                        <ReferenceLine
                          x={chain.max_pain.strike}
                          stroke="var(--text-muted)"
                          strokeDasharray="4 4"
                          label={{ value: "max pain", fontSize: 10, fontWeight: 700, fill: "var(--text-muted)", position: "top" }}
                        />
                      )}
                      <Bar isAnimationActive={false} dataKey="call" name="Call OI" fill="url(#callBar)" radius={[3, 3, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="put" name="Put OI" fill="url(#putBar)" radius={[3, 3, 0, 0]} />
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
                    Sabse zyada khinche hue perpetuals. Positive matlab long walon ko fees deni pad rahi
                    hai; negative matlab short walon ko
                  </p>
                </div>
              </div>
              <div className="overflow-auto max-h-[340px]">
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
                      const tone = f > 0 ? "var(--green)" : f < 0 ? "var(--red)" : "var(--text-muted)";
                      return (
                        <tr key={r.symbol}>
                          <td className="font-bold tnum">{r.symbol}</td>
                          <td
                            className="trade-num tnum font-bold trade-databar"
                            style={{
                              color: tone,
                              "--bar-w": `${(Math.abs(f) / maxAbsFunding) * 100}%`,
                              "--bar-color": tone,
                            } as CSSProperties}
                          >
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

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="trade-kpi">
      <div className="trade-stat-label">{label}</div>
      <div className="trade-kpi-value" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {hint && <div className="trade-kpi-hint">{hint}</div>}
    </div>
  );
}
