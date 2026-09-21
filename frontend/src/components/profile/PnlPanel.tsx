"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AccountApiError, fetchPnl, type PnlSummary } from "@/lib/accountApi";

const RANGES = [
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
] as const;

const GREEN = "#00e676";
const RED = "#ff5252";

function money(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/**
 * Din ke P&L ko rang mein badlo.
 *
 * Rang ki gehrai sabse bade din ke hisaab se hai, sabse bade *number* ke
 * nahi — warna ek bade din ke saamne baaki sab din ek jaise phike lagte
 * hain aur heatmap kuch batata hi nahi.
 */
function cellStyle(pnl: number, peak: number) {
  if (!pnl) return { background: "var(--tr-field)", borderColor: "var(--tr-line-soft)" };
  const strength = Math.min(1, Math.abs(pnl) / (peak || 1));
  const alpha = 0.18 + strength * 0.62;
  const base = pnl > 0 ? "0, 230, 118" : "255, 82, 82";
  return { background: `rgba(${base}, ${alpha})`, borderColor: `rgba(${base}, 0.45)` };
}

export default function PnlPanel({
  token,
  onApiError,
}: {
  token: string;
  onApiError: (err: unknown) => void;
}) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<PnlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchPnl(token, days)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        onApiError(err);
        if (!alive) return;
        setError(err instanceof AccountApiError ? err.message : "P&L load nahi hua");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, days, reloadKey, onApiError]);

  const refresh = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const peak = useMemo(
    () => Math.max(...(data?.by_day ?? []).map((d) => Math.abs(d.pnl)), 0),
    [data],
  );

  /** Heatmap ke liye hafte — har column ek hafta, har row ek din. */
  const weeks = useMemo(() => {
    const rows = data?.by_day ?? [];
    if (!rows.length) return [];
    const out: (typeof rows[number] | null)[][] = [];
    let week: (typeof rows[number] | null)[] = [];
    const firstDay = new Date(`${rows[0].date}T00:00:00Z`).getUTCDay();
    for (let i = 0; i < firstDay; i += 1) week.push(null);
    for (const row of rows) {
      week.push(row);
      if (week.length === 7) {
        out.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      out.push(week);
    }
    return out;
  }, [data]);

  const totals = data?.totals;
  const unsupported = (data?.by_exchange ?? []).filter((e) => !e.supported);

  return (
    <section className="pf-card pnl">
      <header className="pnl-head">
        <div className="min-w-0 flex-1">
          <h3>Profit &amp; loss</h3>
          <p>Seedha exchange ke wallet se — is desk se lage orders hi nahi, aapke saare trades.</p>
        </div>
        <div className="pnl-range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              data-active={days === r.days}
              className="trade-seg-btn"
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="pf-link" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="pf-issue" role="alert">
          <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="pf-skeleton shimmer" />
      ) : (
        data && (
          <>
            <div className="pf-stats">
              <div>
                <dt>Realized P&amp;L</dt>
                <dd className="tnum" data-up={totals!.realized >= 0}>
                  {money(totals!.realized)}
                </dd>
              </div>
              <div>
                <dt>Trade wale din</dt>
                <dd className="tnum">{totals!.traded_days}</dd>
              </div>
              <div>
                <dt>Green / red din</dt>
                <dd className="tnum">
                  <span style={{ color: GREEN }}>{totals!.win_days}</span>
                  <span style={{ color: "var(--text-muted)" }}> / </span>
                  <span style={{ color: RED }}>{totals!.loss_days}</span>
                </dd>
              </div>
              <div>
                <dt>Sabse achha din</dt>
                <dd className="tnum" data-up={true}>
                  {totals!.best_day ? money(totals!.best_day.pnl) : "—"}
                </dd>
              </div>
              <div>
                <dt>Sabse kharab din</dt>
                <dd className="tnum" data-up={false}>
                  {totals!.worst_day ? money(totals!.worst_day.pnl) : "—"}
                </dd>
              </div>
            </div>

            {totals!.traded_days === 0 ? (
              <p className="pf-note">
                Is duration mein koi closed trade nahi mila. Jaise hi koi position band hogi, uska P&amp;L yahan
                aayega.
              </p>
            ) : (
              <>
                <div className="pnl-block">
                  <h4 className="pf-block-head">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Din ke hisaab se
                  </h4>
                  <div className="pnl-chart">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.by_day} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                        <XAxis
                          dataKey="date"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                          axisLine={false}
                          tickLine={false}
                          width={54}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          contentStyle={{
                            background: "#0f141c",
                            border: "1px solid var(--tr-line)",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                          labelFormatter={(v) => shortDate(String(v))}
                          formatter={(v) => [money(Number(v ?? 0)), "P&L"]}
                        />
                        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                          {data.by_day.map((d) => (
                            <Cell key={d.date} fill={d.pnl >= 0 ? GREEN : RED} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pnl-block">
                  <h4 className="pf-block-head">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Heatmap
                  </h4>
                  <div className="pnl-heat">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="pnl-heat-col">
                        {week.map((day, di) => (
                          <span
                            key={day?.date ?? `${wi}-${di}`}
                            className="pnl-heat-cell"
                            style={day ? cellStyle(day.pnl, peak) : { visibility: "hidden" }}
                            title={day ? `${shortDate(day.date)} · ${money(day.pnl)}` : ""}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  {data.by_month.length > 1 && (
                    <div className="pnl-months">
                      {data.by_month.map((m) => (
                        <span key={m.month} className="pnl-month">
                          <b>{monthLabel(m.month)}</b>
                          <i className="tnum" data-up={m.pnl >= 0}>
                            {money(m.pnl)}
                          </i>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="pnl-block">
              <h4 className="pf-block-head">
                <TrendingDown className="w-3.5 h-3.5" />
                Exchange ke hisaab se
              </h4>
              <div className="pnl-exchanges">
                {data.by_exchange.map((e) => (
                  <div key={e.account_id} className="pnl-exchange">
                    <span className="min-w-0">
                      <b>{e.name}</b>
                      <small>{e.error || e.label}</small>
                    </span>
                    {e.pnl === null ? (
                      // Number dikhana yahan jhooth hota: 0 ka matlab "koi
                      // munafa nahi" hai, aur hume to pata hi nahi chala.
                      <span className="pnl-exchange-na">
                        {e.error ? "nahi aaya" : "abhi support nahi"}
                      </span>
                    ) : (
                      <span className="tnum pnl-exchange-value" data-up={e.pnl >= 0}>
                        {money(e.pnl)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <footer className="pf-ex-foot">
              {data.note}
              {unsupported.length > 0 &&
                ` · ${unsupported.map((e) => e.name).join(", ")} se history abhi nahi aati.`}
            </footer>
          </>
        )
      )}
    </section>
  );
}
