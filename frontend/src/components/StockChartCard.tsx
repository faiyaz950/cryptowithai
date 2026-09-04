"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ChartData } from "@/lib/types";
import { formatINR, formatUSD } from "@/lib/parseResponse";

interface Props {
  data: ChartData;
}

type Range = "1W" | "1M" | "3M" | "6M" | "1Y";

const RANGE_MAP: Record<Range, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function StockChartCard({ data }: Props) {
  const [range, setRange] = useState<Range>("3M");
  const [chartPoints, setChartPoints] = useState(data.points ?? []);
  const [loading, setLoading] = useState(false);

  const isCrypto = data.type === "crypto";
  const fmt = isCrypto ? formatUSD : formatINR;
  const changePct = data.change_pct ?? 0;
  const isPositive = changePct >= 0;

  const displayPoints = useMemo(() => {
    return chartPoints.map((p) => ({
      ...p,
      label: formatDate(p.date),
    }));
  }, [chartPoints]);

  const handleRangeChange = async (r: Range) => {
    if (r === range || data.type === "crypto" || !data.symbol) return;
    setRange(r);
    setLoading(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${API_BASE}/api/chart/${data.symbol}?range=${RANGE_MAP[r]}`);
      if (res.ok) {
        const json = await res.json();
        setChartPoints(json.points ?? []);
      }
    } catch {
      // keep existing points
    } finally {
      setLoading(false);
    }
  };

  if (!displayPoints.length && data.type === "stock") return null;

  return (
    <div className="card-elevated my-4 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--bg-hover)", color: "var(--accent)" }}>
              {data.symbol}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {data.name}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {fmt(data.price)}
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: isPositive ? "#10b981" : "#f87171" }}
            >
              {isPositive ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        {data.pe_ratio != null && (
          <div className="text-right">
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>P/E</div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{data.pe_ratio.toFixed(1)}</div>
          </div>
        )}
      </div>

      {/* Chart */}
      {displayPoints.length > 0 && (
        <div className="px-2 pb-2" style={{ height: 200 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? "#10b981" : "#f87171"} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={isPositive ? "#10b981" : "#f87171"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v) => (isCrypto ? `$${v}` : `₹${v}`)}
                />
                <Tooltip
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)", boxShadow: "var(--shadow-md)" }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(v) => [fmt(typeof v === "number" ? v : Number(v)), "Price"]}
                />
                {data.fifty_two_week_low != null && (
                  <ReferenceLine y={data.fifty_two_week_low} stroke="var(--text-muted)" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={isPositive ? "#10b981" : "#f87171"}
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Range toggles */}
      {data.type === "stock" && (
        <div className="px-4 pb-3 flex gap-1">
          {(Object.keys(RANGE_MAP) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRangeChange(r)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: range === r ? "rgba(37, 99, 235, 0.12)" : "transparent",
                color: range === r ? "var(--accent)" : "var(--text-muted)",
                border: range === r ? "1px solid rgba(37, 99, 235, 0.25)" : "1px solid transparent",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Key levels bar */}
      <div
        className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-primary)" }}
      >
        {data.day_low != null && (
          <div>
            <div style={{ color: "var(--text-muted)" }}>Day Low</div>
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(data.day_low)}</div>
          </div>
        )}
        {data.day_high != null && (
          <div>
            <div style={{ color: "var(--text-muted)" }}>Day High</div>
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(data.day_high)}</div>
          </div>
        )}
        {data.fifty_two_week_low != null && (
          <div>
            <div style={{ color: "var(--text-muted)" }}>52W Low</div>
            <div className="font-semibold" style={{ color: "#f87171" }}>{fmt(data.fifty_two_week_low)}</div>
          </div>
        )}
        {data.fifty_two_week_high != null && (
          <div>
            <div style={{ color: "var(--text-muted)" }}>52W High</div>
            <div className="font-semibold" style={{ color: "#10b981" }}>{fmt(data.fifty_two_week_high)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
