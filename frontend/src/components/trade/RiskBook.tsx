"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Flame, PlayCircle, Trash2, Undo2, Wallet } from "lucide-react";
import { symbolLabel } from "@/lib/cryptoApi";
import {
  bookHeat,
  computePlan,
  deletePlan,
  fmtNum,
  fmtQty,
  fmtUsd,
  setPlanStatus,
  type PlanStatus,
  type SavedPlan,
} from "@/lib/risk";

interface Props {
  plans: SavedPlan[];
  equity: number;
  /** Plan wapas planner mein khol do — tweak karke dobara dekhne ke liye. */
  onLoad: (plan: SavedPlan) => void;
}

/** Heat ke rang: thanda -> garam, taaki bar dekhte hi samajh aaye. */
function heatColor(pct: number): string {
  if (pct <= 3) return "var(--green)";
  if (pct <= 6) return "#a3e635";
  if (pct <= 10) return "var(--amber)";
  return "var(--red)";
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "Planned",
  open: "Open",
  closed: "Closed",
};

export default function RiskBook({ plans, equity, onLoad }: Props) {
  const heat = useMemo(() => bookHeat(plans, equity), [plans, equity]);

  const rows = useMemo(
    () => plans.map((p) => ({ plan: p, math: computePlan({ ...p, equity }) })),
    [plans, equity],
  );

  const live = rows.filter((r) => r.plan.status !== "closed");
  /** Har open plan heat bar ka ek segment — sabse bada risk sabse pehle. */
  const segments = [...live]
    .filter((r) => r.math.valid)
    .sort((a, b) => b.math.riskAmount - a.math.riskAmount);

  const barScale = Math.max(12, Math.ceil(heat.heatPct + 2));

  return (
    <div className="space-y-3">
      <section className="trade-panel">
        <div className="trade-panel-head">
          <h3 className="trade-panel-title">Portfolio heat</h3>
          <span
            className={`trade-badge ${heat.heatPct > 6 ? "trade-badge-red" : heat.heatPct > 3 ? "trade-badge-amber" : "trade-badge-green"}`}
          >
            <Flame className="w-3 h-3" />
            {heat.heatPct.toFixed(2)}%
          </span>
        </div>

        <div className="trade-panel-body">
          <div className="risk-heat" title={`${heat.count} open plans`}>
            {segments.map((r) => (
              <span
                key={r.plan.id}
                className="risk-heat-seg"
                style={{
                  width: `${(r.math.riskAmount / equity / (barScale / 100)) * 100}%`,
                  background: r.plan.side === "long" ? "var(--green)" : "var(--red)",
                  opacity: 0.85,
                }}
                title={`${symbolLabel(r.plan.symbol)} · ${fmtUsd(r.math.riskAmount)}`}
              />
            ))}
            <span className="risk-heat-limit" style={{ left: `${(6 / barScale) * 100}%` }} title="6% comfort limit" />
          </div>
          <div className="risk-heat-scale">
            <span>0%</span>
            <span style={{ color: "var(--amber)" }}>6% limit</span>
            <span>{barScale}%</span>
          </div>
        </div>

        <div className="risk-stat-grid risk-stat-grid-4" style={{ border: 0, borderRadius: 0 }}>
          <div className="risk-stat" data-tone={heat.heatPct > 6 ? "risk" : heat.heatPct > 3 ? "warn" : "good"}>
            <div className="risk-stat-label">Open risk</div>
            <div className="risk-stat-value" style={{ color: heatColor(heat.heatPct) }}>
              {fmtUsd(heat.openRisk)}
            </div>
            <div className="risk-stat-sub">{heat.count} active plan{heat.count === 1 ? "" : "s"}</div>
          </div>
          <div className="risk-stat" data-tone={heat.clusterPct > 4 && heat.count > 1 ? "warn" : "info"}>
            <div className="risk-stat-label">Long vs short</div>
            <div className="risk-stat-value" style={{ fontSize: 15 }}>
              <span style={{ color: "var(--green)" }}>{fmtUsd(heat.longRisk)}</span>
              <span style={{ color: "var(--text-muted)" }}> / </span>
              <span style={{ color: "var(--red)" }}>{fmtUsd(heat.shortRisk)}</span>
            </div>
            <div className="risk-stat-sub">
              {heat.clusterSide ? `${heat.clusterPct.toFixed(1)}% ek hi taraf` : "Balanced"}
            </div>
          </div>
          <div className="risk-stat" data-tone={heat.grossLeverage > 20 ? "warn" : "info"}>
            <div className="risk-stat-label">Gross notional</div>
            <div className="risk-stat-value">{fmtUsd(heat.notional)}</div>
            <div className="risk-stat-sub">{heat.grossLeverage.toFixed(1)}x equity</div>
          </div>
          <div className="risk-stat" data-tone="risk">
            <div className="risk-stat-label">Worst case</div>
            <div className="risk-stat-value" style={{ color: "var(--red)" }}>
              {fmtUsd(equity - heat.openRisk)}
            </div>
            <div className="risk-stat-sub">agar saare stops ek saath lage</div>
          </div>
        </div>
      </section>

      {heat.warnings.length > 0 && (
        <div className="space-y-2">
          {heat.warnings.map((w) => (
            <div key={w.id} className="risk-warn" data-level={w.level}>
              <Flame className="w-4 h-4 risk-warn-icon" />
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <section className="trade-panel">
          <div className="trade-empty trade-empty-lg">
            <span className="trade-empty-icon trade-empty-icon-lg"><Wallet className="w-5 h-5" /></span>
            <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
              Book abhi khali hai
            </p>
            <p className="max-w-[340px]">
              Planner mein trade size karke <b>Book</b> dabao — yahan saare plans ka total risk ek saath dikhega.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-2">
          {rows.map(({ plan, math }) => {
            const Icon = plan.side === "long" ? ArrowUpRight : ArrowDownRight;
            const sideColor = plan.side === "long" ? "var(--green)" : "var(--red)";
            return (
              <article key={plan.id} className="risk-book-row" data-status={plan.status}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="trade-strategy-icon"
                    style={{ background: `${plan.side === "long" ? "rgba(0,230,118,.14)" : "rgba(255,82,82,.14)"}`, color: sideColor }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <button type="button" className="trade-linkish text-[14px]" onClick={() => onLoad(plan)}>
                      {symbolLabel(plan.symbol)}
                    </button>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`trade-badge ${plan.status === "open" ? "trade-badge-green" : "trade-badge-neutral"}`}>
                        {STATUS_LABEL[plan.status]}
                      </span>
                      <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                        {plan.leverage}x
                      </span>
                    </div>
                  </div>
                </div>

                <div className="risk-book-metrics">
                  <div>
                    <div className="trade-ticker-label">Entry</div>
                    <div className="trade-ticker-value">{fmtNum(plan.entry)}</div>
                  </div>
                  <div>
                    <div className="trade-ticker-label">Stop</div>
                    <div className="trade-ticker-value" style={{ color: "var(--red)" }}>{fmtNum(plan.stop)}</div>
                  </div>
                  <div>
                    <div className="trade-ticker-label">Size</div>
                    <div className="trade-ticker-value">{math.valid ? fmtQty(math.qty) : "—"}</div>
                  </div>
                  <div>
                    <div className="trade-ticker-label">Risk</div>
                    <div className="trade-ticker-value" style={{ color: "var(--red)" }}>
                      {math.valid ? fmtUsd(math.riskAmount) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="trade-ticker-label">Liquidation</div>
                    <div
                      className="trade-ticker-value"
                      style={{ color: math.liqBeforeStop ? "var(--red)" : "var(--text-secondary)" }}
                    >
                      {math.liqPrice != null ? fmtNum(math.liqPrice) : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost trade-size-sm"
                    onClick={() => setPlanStatus(plan.id, plan.status === "closed" ? "planned" : plan.status === "planned" ? "open" : "closed")}
                    title={plan.status === "closed" ? "Dobara kholo" : plan.status === "planned" ? "Open mark karo" : "Close karo"}
                  >
                    {plan.status === "closed" ? <Undo2 className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">
                      {plan.status === "closed" ? "Reopen" : plan.status === "planned" ? "Open" : "Close"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="trade-iconbtn trade-iconbtn-sm"
                    aria-label={`${symbolLabel(plan.symbol)} plan delete karo`}
                    onClick={() => deletePlan(plan.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <b>Portfolio heat</b> = saare open plans ka total risk, equity ka percent. Har trade par 1% risk
        theek lagta hai, par 8 trades ek saath 8% ban jaate hain — aur crypto majors aapas mein
        correlated hain, isliye wo aksar ek hi trade ki tarah chalte hain. Plans is browser mein save
        hote hain.
      </p>
    </div>
  );
}
