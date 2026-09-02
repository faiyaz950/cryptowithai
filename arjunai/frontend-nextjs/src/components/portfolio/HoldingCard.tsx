"use client";

import type { PricedHolding } from "@/lib/portfolio";
import { fmtINR, fmtPct } from "@/lib/portfolio";

interface Props {
  holding: PricedHolding;
  usdInr: number;
}

// Type colors — PortfolioCharts ke validated palette se sync (stocks/crypto/mf har jagah same hue)
const TYPE_CONFIG = {
  stock: { icon: "📈", color: "#2563eb", label: "Stock" },
  crypto: { icon: "₿", color: "#c98500", label: "Crypto" },
  mf: { icon: "🏦", color: "var(--accent)", label: "MF" },
};

export default function HoldingCard({ holding: h, usdInr }: Props) {
  const cfg = TYPE_CONFIG[h.type];
  const isPositive = h.pnlINR >= 0;
  const pnlColor = isPositive ? "#10b981" : "#f87171";
  const priceDisplay =
    h.type === "crypto"
      ? `$${h.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })} (₹${(h.currentPrice * usdInr).toLocaleString("en-IN", { maximumFractionDigits: 0 })})`
      : `₹${h.currentPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div
      className="card-elevated group relative rounded-2xl p-4 transition-all duration-150"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}
        >
          {cfg.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {h.symbol}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-md"
              style={{ background: `${cfg.color}12`, color: cfg.color }}
            >
              {cfg.label}
            </span>
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{h.name}</div>
        </div>
      </div>

      {/* Price loading / error */}
      {h.priceLoading && (
        <div className="flex items-center gap-1.5 py-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Fetching price…</span>
        </div>
      )}

      {h.priceError && (
        <div className="text-xs py-1" style={{ color: "#f87171" }}>
          ⚠️ Price unavailable — check symbol
        </div>
      )}

      {!h.priceLoading && !h.priceError && (
        <>
          {/* Price row */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{priceDisplay}</span>
            <span
              className="text-xs font-medium"
              style={{ color: h.change24h >= 0 ? "#10b981" : "#f87171" }}
            >
              {h.change24h >= 0 ? "▲" : "▼"} {Math.abs(h.change24h).toFixed(2)}% (24h)
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Qty</div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {h.quantity.toLocaleString("en-IN", { maximumFractionDigits: 6 })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Invested</div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {fmtINR(h.investedINR)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Current</div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {fmtINR(h.currentValueINR)}
              </div>
            </div>
          </div>

          {/* P&L bar */}
          <div
            className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl"
            style={{
              background: isPositive ? "rgba(16,185,129,0.06)" : "rgba(248,113,113,0.06)",
              border: `1px solid ${isPositive ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)"}`,
            }}
          >
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>P&amp;L</span>
            <div className="text-right">
              <span className="text-sm font-bold" style={{ color: pnlColor }}>
                {fmtINR(Math.abs(h.pnlINR))}
              </span>
              <span className="text-xs ml-1.5 font-medium" style={{ color: pnlColor }}>
                ({fmtPct(h.pnlPct)})
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
