"use client";

import Link from "next/link";
import type { StrategyDef, StrategyValues } from "@/lib/strategies";
import { symbolLabel } from "@/lib/cryptoApi";

const AVPT_VERSION = "AVPT v1.0";
const AVPT_UPDATED = "2026-03-31";

function num(values: StrategyValues, key: string, fallback: number): number {
  const v = values[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(values: StrategyValues, key: string, fallback: string): string {
  const v = values[key];
  return typeof v === "string" && v ? v : fallback;
}

function bool(values: StrategyValues, key: string): boolean {
  return Boolean(values[key]);
}

/** Compact strategy identity strip — Final Master Spec Part A. */
export default function StrategyOverview({
  def,
  values,
}: {
  def: StrategyDef;
  values: StrategyValues;
}) {
  if (def.id !== "avpt-pullback") return null;

  const tf = str(values, "timeframe", def.fixedTimeframe || "4h");
  const assets = (def.portfolio ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"]).map((s) => symbolLabel(s)).join(" · ");
  const filter = str(values, "filter_mode", "vol_climax");
  const swing = num(values, "swing_len", 10);
  const shorts = bool(values, "allow_shorts");

  const rows: { label: string; value: string }[] = [
    { label: "Strategy", value: "Anchored VWAP Pullback" },
    { label: "Type", value: "Trend Following / Pullback" },
    { label: "Style", value: "Systematic Algo" },
    { label: "Market", value: "Crypto Perpetual Futures" },
    { label: "Assets", value: assets },
    { label: "Timeframe", value: tf.toUpperCase() },
    { label: "Direction", value: shorts ? "Long & Short" : "Long only" },
    { label: "Entry", value: "AVWAP reclaim + pullback + volume climax" },
    { label: "Exit", value: "Stop + TP1–3 ladder + optional BE trail" },
    { label: "Max positions", value: "1 per asset" },
    { label: "Version", value: AVPT_VERSION },
    { label: "Last updated", value: AVPT_UPDATED },
    { label: "Filter", value: `${filter} · swing ${swing}` },
    { label: "Status", value: "Available" },
  ];

  return (
    <section className="trade-panel">
      <div className="trade-panel-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="trade-panel-title">Strategy overview</span>
          <span className="trade-badge trade-badge-green">Available</span>
          <span className="text-[11.5px] tnum truncate" style={{ color: "var(--text-muted)" }}>
            {AVPT_VERSION} · {tf.toUpperCase()} · {assets}
          </span>
        </div>
        <Link href={`/trade/strategies/${def.id}/script`} className="trade-btn trade-btn-ghost trade-size-sm flex-none">
          Full rules
        </Link>
      </div>
      <div className="trade-panel-body space-y-3">
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {def.blurb} {def.logic.slice(0, 220)}
          {def.logic.length > 220 ? "…" : ""}
        </p>
        <div className="sr-reads">
          {rows.map((row) => (
            <div key={row.label} className="trade-stat sr-read">
              <div className="trade-stat-label">{row.label}</div>
              <div className="trade-stat-value" style={{ color: "var(--text-primary)" }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
        {def.engineNote && (
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {def.engineNote}
          </p>
        )}
      </div>
    </section>
  );
}
