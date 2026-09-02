"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import type { PricedHolding } from "@/lib/portfolio";
import { fmtINR, fmtPct } from "@/lib/portfolio";

// Light surface palette for charts
export const CHART_COLORS = {
  profit: "#0ca678",
  loss: "#e5484d",
  stock: "#2563eb",
  crypto: "#c98500",
  mf: "var(--accent)",
  value: "var(--accent)",
  grid: "var(--border)",
  axis: "var(--text-muted)",
  label: "var(--text-secondary)",
};

const MAX_BARS = 8;
const ROW_H = 34;
const AXIS_BAND = 28;

// "₹-750" ki jagah "-₹750"
const fmtSignedINR = (v: number) => (v < 0 ? "-" : "") + fmtINR(Math.abs(v));

interface BarDatum {
  name: string;      // y-axis label (symbol)
  fullName: string;  // tooltip title
  invested: number;
  current: number;
  pnl: number;
  pnlPct: number;
}

function toBarDatum(h: PricedHolding): BarDatum {
  return {
    name: h.symbol.length > 10 ? h.symbol.slice(0, 9) + "…" : h.symbol,
    fullName: h.name,
    invested: h.investedINR,
    current: h.currentValueINR,
    pnl: h.pnlINR,
    pnlPct: h.pnlPct,
  };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BarDatum }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pnlColor = d.pnl >= 0 ? "#10b981" : "#f87171";
  return (
    <div
      className="card-elevated rounded-xl px-3 py-2.5 text-xs space-y-1"
    >
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{d.fullName}</p>
      <p style={{ color: "var(--text-secondary)" }}>Invested: {fmtINR(d.invested)}</p>
      <p style={{ color: "var(--text-secondary)" }}>Current: {fmtINR(d.current)}</p>
      <p style={{ color: pnlColor }}>
        P&amp;L: {d.pnl >= 0 ? "+" : ""}{fmtSignedINR(d.pnl)} ({fmtPct(d.pnlPct)})
      </p>
    </div>
  );
}

/** Sign-aware value label at the bar tip (vertical layout). */
function TipLabel(props: { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: string | number }) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  const positive = value >= 0;
  // Negative bars mein x/width orientation renderer par depend karta hai — dono edges se resolve karo
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  return (
    <text
      x={positive ? right + 6 : left - 6}
      y={y + height / 2}
      dy={3.5}
      textAnchor={positive ? "start" : "end"}
      fontSize={11}
      fill={CHART_COLORS.label}
    >
      {fmtSignedINR(value)}
    </text>
  );
}

/** Diverging bar: profit/loss color + data-end par rounded corner, baseline square. */
function PnlBarShape(props: BarShapeProps) {
  const { x, y, width, height } = props;
  const pnl = (props as unknown as { payload: BarDatum }).payload?.pnl ?? 0;
  const positive = pnl >= 0;
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={positive ? CHART_COLORS.profit : CHART_COLORS.loss}
      radius={positive ? [0, 4, 4, 0] : [4, 0, 0, 4]}
    />
  );
}

const ChartCard = ({ title, sub, legend, children }: {
  title: string;
  sub?: string;
  legend?: { label: string; color: string }[];
  children: React.ReactNode;
}) => (
  <div className="card-elevated rounded-2xl p-5">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{title}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      {legend && (
        <div className="flex items-center gap-3 flex-shrink-0">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
    {children}
  </div>
);

/** P&L per holding — diverging horizontal bars around the zero baseline. */
export function PnlByHoldingChart({ holdings }: { holdings: PricedHolding[] }) {
  const data = useMemo(() => {
    const done = holdings.filter((h) => !h.priceLoading && !h.priceError);
    return [...done]
      .sort((a, b) => Math.abs(b.pnlINR) - Math.abs(a.pnlINR))
      .slice(0, MAX_BARS)
      .map(toBarDatum)
      .sort((a, b) => b.pnl - a.pnl);
  }, [holdings]);

  if (data.length === 0) return null;
  const height = data.length * ROW_H + AXIS_BAND;

  return (
    <ChartCard
      title="P&L by Holding"
      sub={holdings.length > MAX_BARS ? `Top ${MAX_BARS} by impact` : undefined}
      legend={[
        { label: "Profit", color: CHART_COLORS.profit },
        { label: "Loss", color: CHART_COLORS.loss },
      ]}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
          <XAxis
            type="number"
            tickFormatter={fmtSignedINR}
            tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={80}
            tick={{ fontSize: 11, fill: CHART_COLORS.label }}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(124,111,247,0.05)" }} />
          <Bar dataKey="pnl" barSize={18} isAnimationActive={false} shape={PnlBarShape}>
            <LabelList dataKey="pnl" content={<TipLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Current value per holding — single-hue magnitude bars, concentration dikhane ke liye. */
export function TopHoldingsChart({ holdings }: { holdings: PricedHolding[] }) {
  const data = useMemo(() => {
    const done = holdings.filter((h) => !h.priceLoading && !h.priceError);
    const sorted = [...done].sort((a, b) => b.currentValueINR - a.currentValueINR);
    const top = sorted.slice(0, MAX_BARS).map(toBarDatum);
    const rest = sorted.slice(MAX_BARS);
    if (rest.length) {
      top.push({
        name: `Other (${rest.length})`,
        fullName: `${rest.length} smaller holdings`,
        invested: rest.reduce((s, h) => s + h.investedINR, 0),
        current: rest.reduce((s, h) => s + h.currentValueINR, 0),
        pnl: rest.reduce((s, h) => s + h.pnlINR, 0),
        pnlPct: 0,
      });
    }
    return top.map((d) => ({ ...d, value: d.current }));
  }, [holdings]);

  if (data.length === 0) return null;
  const height = data.length * ROW_H + AXIS_BAND;
  const total = data.reduce((s, d) => s + d.current, 0);
  const topShare = total > 0 ? (data[0].current / total) * 100 : 0;

  return (
    <ChartCard
      title="Value by Holding"
      sub={`${data[0].name} = ${topShare.toFixed(0)}% of portfolio`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
          <XAxis
            type="number"
            tickFormatter={fmtSignedINR}
            tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={80}
            tick={{ fontSize: 11, fill: CHART_COLORS.label }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(124,111,247,0.05)" }} />
          <Bar dataKey="value" barSize={18} fill={CHART_COLORS.value} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="value" content={<TipLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
