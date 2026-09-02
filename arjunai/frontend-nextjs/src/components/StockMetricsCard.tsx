"use client";

import type { ChartData } from "@/lib/types";
import { formatMarketCap } from "@/lib/parseResponse";

interface Props {
  data: ChartData;
}

interface GaugeProps {
  label: string;
  score: number;
}

function MetricGauge({ label, score }: GaugeProps) {
  const clamped = Math.max(1, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const color = clamped >= 8 ? "#10b981" : clamped >= 5 ? "#f59e0b" : "#f87171";

  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{clamped}/10</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #f87171 0%, #f59e0b 50%, #10b981 100%)`,
            backgroundSize: "200% 100%",
            backgroundPosition: `${pct}% 0`,
          }}
        />
      </div>
    </div>
  );
}

function deriveScores(data: ChartData) {
  const change = data.change_pct ?? 0;
  const momentum = change > 3 ? 9 : change > 0 ? 7 : change > -3 ? 5 : 3;
  const pe = data.pe_ratio;
  const valuation = pe == null ? 6 : pe < 20 ? 8 : pe < 35 ? 6 : 4;
  const nearLow = data.fifty_two_week_low && data.price
    ? (data.price - data.fifty_two_week_low) / (data.fifty_two_week_low || 1)
    : 0;
  const risk = nearLow < 0.05 ? 8 : nearLow < 0.15 ? 6 : 4;
  const earnings = momentum > 6 ? 7 : 5;
  const fundamentals = valuation > 6 ? 7 : 5;

  return { momentum, valuation, risk, earnings, fundamentals };
}

export default function StockMetricsCard({ data }: Props) {
  if (data.type !== "stock" || !data.price) return null;

  const scores = deriveScores(data);
  const overall = Math.round(
    (scores.momentum + scores.valuation + scores.risk + scores.earnings + scores.fundamentals) / 5,
  );
  const sentiment = overall >= 7 ? "positive" : overall >= 5 ? "neutral" : "negative";
  const sentimentColor = overall >= 7 ? "#10b981" : overall >= 5 ? "#f59e0b" : "#f87171";

  return (
    <div className="card-elevated my-4 rounded-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-2">
      {/* Sentiment score */}
      <div className="p-4 flex flex-col items-center justify-center" style={{ borderRight: "1px solid var(--border)" }}>
        <div
          className="w-20 h-20 rounded-full flex flex-col items-center justify-center mb-2"
          style={{
            background: `conic-gradient(${sentimentColor} ${overall * 36}deg, var(--bg-hover) 0deg)`,
            padding: 3,
          }}
        >
          <div
            className="w-full h-full rounded-full flex flex-col items-center justify-center"
            style={{ background: "var(--bg-card)" }}
          >
            <span className="text-2xl font-bold" style={{ color: sentimentColor }}>{overall}</span>
          </div>
        </div>
        <span className="text-xs font-semibold capitalize" style={{ color: sentimentColor }}>
          {sentiment} sentiment
        </span>
        <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Overall Score</span>
      </div>

      {/* Metric gauges */}
      <div className="p-4">
        <MetricGauge label="Price Momentum" score={scores.momentum} />
        <MetricGauge label="Relative Valuation" score={scores.valuation} />
        <MetricGauge label="Fundamentals" score={scores.fundamentals} />
        <MetricGauge label="Earnings Quality" score={scores.earnings} />
        <MetricGauge label="Risk Profile" score={scores.risk} />
        {data.market_cap != null && (
          <div className="mt-2 pt-2 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Market Cap: <span style={{ color: "var(--text-primary)" }}>{formatMarketCap(data.market_cap)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
