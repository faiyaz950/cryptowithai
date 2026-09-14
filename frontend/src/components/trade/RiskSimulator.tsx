"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Dices, Info, RefreshCw, Skull } from "lucide-react";
import {
  breakevenWinRate,
  expectancyR,
  fmtUsd,
  kellyFraction,
  simulate,
  sweepRisk,
  type SimResult,
} from "@/lib/risk";

interface Props {
  equity: number;
  /** Planner ka pehla target — "use plan R:R" isse aata hai. */
  planRr: number | null;
  planRiskPct: number;
}

const SWEEP_ANCHORS = [0.5, 1, 2, 5];

/**
 * Sweep ko Kelly ke *paar* tak le jaana zaroori hai — warna table sirf "zyada
 * size = zyada return" dikhati hai aur asli sabak (optimal ke baad return
 * girta hai, drawdown nahi) kabhi screen par aata hi nahi.
 */
function sweepPoints(kellyPct: number, current: number): number[] {
  const points = [...SWEEP_ANCHORS, current];
  if (kellyPct > 0) points.push(kellyPct / 2, kellyPct, kellyPct * 1.5, kellyPct * 2);
  const rounded = points
    .map((v) => Math.round(Math.min(40, Math.max(0.25, v)) * 100) / 100)
    .sort((a, b) => a - b);
  return rounded.filter((v, i) => i === 0 || v !== rounded[i - 1]);
}

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export default function RiskSimulator({ equity, planRr, planRiskPct }: Props) {
  const [winRate, setWinRate] = useState(45);
  const [rr, setRr] = useState(2);
  const [riskPct, setRiskPct] = useState(planRiskPct > 0 ? planRiskPct : 1);
  const [trades, setTrades] = useState(100);
  const [runs, setRuns] = useState(1000);
  const [ruinPct, setRuinPct] = useState(50);
  const [seed, setSeed] = useState(7);

  const expectancy = expectancyR(winRate, rr);
  const breakeven = breakevenWinRate(rr);
  const kelly = kellyFraction(winRate, rr) * 100;

  const sim: SimResult = useMemo(
    () => simulate({ equity, riskPct, winRate, rr, trades, runs, ruinPct, seed }),
    [equity, riskPct, winRate, rr, trades, runs, ruinPct, seed],
  );

  const sweep = useMemo(
    () => sweepRisk({ equity, winRate, rr, trades, runs, ruinPct, seed }, sweepPoints(kelly, riskPct)),
    [equity, winRate, rr, trades, runs, ruinPct, seed, kelly, riskPct],
  );

  /** Is edge par median equity kis size par top karti hai. */
  const peak = useMemo(
    () => sweep.reduce((best, row) => (row.medianFinal > best.medianFinal ? row : best), sweep[0]),
    [sweep],
  );
  const beyondPeak = sweep.filter((r) => r.riskPct > peak.riskPct);
  const worstBeyond = beyondPeak.length ? beyondPeak[beyondPeak.length - 1] : null;

  const hasEdge = expectancy > 0;

  return (
    <div className="space-y-3">
      <section className="trade-panel">
        <div className="trade-panel-head">
          <h3 className="trade-panel-title">Edge assumptions</h3>
          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            onClick={() => setSeed((s) => (s % 9973) + 17)}
            title="Naye random draws"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reshuffle
          </button>
        </div>

        <div className="trade-panel-body">
          <div className="risk-fields risk-fields-3">
            <div>
              <label className="trade-label">Win rate — {winRate}%</label>
              <input
                type="range" className="risk-slider" min={5} max={95} step={1}
                value={winRate} onChange={(e) => setWinRate(Number(e.target.value))}
              />
              <div className="risk-slider-scale"><span>5%</span><span>50%</span><span>95%</span></div>
            </div>
            <div>
              <label className="trade-label">Reward : risk — {rr}R</label>
              <input
                type="range" className="risk-slider" min={0.25} max={6} step={0.25}
                value={rr} onChange={(e) => setRr(Number(e.target.value))}
              />
              <div className="risk-slider-scale"><span>0.25R</span><span>3R</span><span>6R</span></div>
            </div>
            <div>
              <label className="trade-label">Risk per trade — {riskPct}%</label>
              <input
                type="range" className="risk-slider" min={0.25} max={15} step={0.25}
                value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))}
              />
              <div className="risk-slider-scale"><span>0.25%</span><span>7%</span><span>15%</span></div>
            </div>

            <div>
              <label className="trade-label">Trades simulated</label>
              <select className="trade-select" value={trades} onChange={(e) => setTrades(Number(e.target.value))}>
                {[25, 50, 100, 200, 300].map((n) => <option key={n} value={n}>{n} trades</option>)}
              </select>
            </div>
            <div>
              <label className="trade-label">Simulations</label>
              <select className="trade-select" value={runs} onChange={(e) => setRuns(Number(e.target.value))}>
                {[250, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} runs</option>)}
              </select>
            </div>
            <div>
              <label className="trade-label">Ruin level</label>
              <select className="trade-select" value={ruinPct} onChange={(e) => setRuinPct(Number(e.target.value))}>
                {[25, 40, 50, 70].map((n) => <option key={n} value={n}>{n}% of start</option>)}
              </select>
            </div>
          </div>

          {planRr != null && (
            <div className="risk-chips mt-3">
              <button type="button" className="risk-chip" onClick={() => { setRr(planRr); setRiskPct(planRiskPct); }}>
                <span className="risk-chip-label">Planner se lo</span>
                <span className="risk-chip-hint">{planRr}R · {planRiskPct}% risk</span>
              </button>
            </div>
          )}
        </div>

        <div className="risk-stat-grid risk-stat-grid-4" style={{ border: 0, borderRadius: 0 }}>
          <div className="risk-stat" data-tone={hasEdge ? "good" : "risk"}>
            <div className="risk-stat-label">Expectancy</div>
            <div className="risk-stat-value" style={{ color: hasEdge ? "var(--green)" : "var(--red)" }}>
              {expectancy >= 0 ? "+" : ""}{expectancy.toFixed(3)}R
            </div>
            <div className="risk-stat-sub">per trade, average</div>
          </div>
          <div className="risk-stat" data-tone="info">
            <div className="risk-stat-label">Breakeven win rate</div>
            <div className="risk-stat-value">{fmtPct(breakeven)}</div>
            <div className="risk-stat-sub">{rr}R par isse kam = loss</div>
          </div>
          <div className="risk-stat" data-tone="info">
            <div className="risk-stat-label">Kelly</div>
            <div className="risk-stat-value" style={{ color: kelly > 0 ? undefined : "var(--red)" }}>
              {fmtPct(kelly)}
            </div>
            <div className="risk-stat-sub">half-Kelly {fmtPct(Math.max(0, kelly / 2))} practical</div>
          </div>
          <div className="risk-stat" data-tone={kelly > 0 && riskPct > kelly ? "risk" : kelly > 0 && riskPct > kelly / 2 ? "warn" : "good"}>
            <div className="risk-stat-label">Your sizing</div>
            <div
              className="risk-stat-value"
              style={{ color: kelly > 0 && riskPct > kelly ? "var(--red)" : "var(--green)" }}
            >
              {fmtPct(riskPct)}
            </div>
            <div className="risk-stat-sub">
              {kelly <= 0 ? "edge negative" : riskPct > kelly ? "Kelly se upar — overbetting" : riskPct > kelly / 2 ? "Kelly ke andar" : "conservative"}
            </div>
          </div>
        </div>
      </section>

      {!hasEdge && (
        <div className="risk-warn" data-level="critical">
          <AlertTriangle className="w-4 h-4 risk-warn-icon" />
          <span>
            {winRate}% win rate par {rr}R chahiye kam se kam {fmtPct(breakeven)} — ye edge negative hai.
            Position sizing kitni bhi acchi ho, negative edge lambe time mein account khaata hai.
          </span>
        </div>
      )}
      {hasEdge && kelly > 0 && riskPct > kelly && (
        <div className="risk-warn" data-level="warn">
          <AlertTriangle className="w-4 h-4 risk-warn-icon" />
          <span>
            Edge positive hai par {fmtPct(riskPct)} risk Kelly ({fmtPct(kelly)}) se upar hai — is zone mein
            zyada size ulta <b>kam</b> return deta hai, drawdown badhta hai.
          </span>
        </div>
      )}

      <section className="trade-panel">
        <div className="trade-panel-head">
          <h3 className="trade-panel-title">{runs} equity curves</h3>
          <span className="trade-badge trade-badge-neutral">{trades} trades</span>
        </div>
        <div className="trade-panel-body">
          <FanChart sim={sim} equity={equity} />
          <div className="risk-legend mt-3">
            <span className="risk-legend-item">
              <span className="risk-legend-swatch" style={{ background: "rgba(0,230,118,.35)", height: 8 }} />
              10th–90th percentile
            </span>
            <span className="risk-legend-item">
              <span className="risk-legend-swatch" style={{ background: "var(--accent)" }} />
              Median path
            </span>
            <span className="risk-legend-item">
              <span className="risk-legend-swatch" style={{ background: "var(--text-muted)" }} />
              Starting equity
            </span>
            <span className="risk-legend-item">
              <span className="risk-legend-swatch" style={{ background: "rgba(148,163,184,.5)" }} />
              Sample runs
            </span>
          </div>
        </div>

        <div className="risk-stat-grid risk-stat-grid-4" style={{ border: 0, borderRadius: 0 }}>
          <div className="risk-stat" data-tone={sim.median >= equity ? "good" : "risk"}>
            <div className="risk-stat-label">Median outcome</div>
            <div className="risk-stat-value" style={{ color: sim.median >= equity ? "var(--green)" : "var(--red)" }}>
              {fmtUsd(sim.median)}
            </div>
            <div className="risk-stat-sub">
              {(((sim.median - equity) / equity) * 100).toFixed(1)}% from {fmtUsd(equity)}
            </div>
          </div>
          <div className="risk-stat" data-tone={sim.p5 >= equity ? "info" : "risk"}>
            <div className="risk-stat-label">Unlucky (5th pct)</div>
            <div className="risk-stat-value" style={{ color: "var(--red)" }}>{fmtUsd(sim.p5)}</div>
            <div className="risk-stat-sub">20 mein se 1 run isse bhi bura</div>
          </div>
          <div className="risk-stat" data-tone={sim.medianMaxDD > 25 ? "risk" : "warn"}>
            <div className="risk-stat-label">Max drawdown</div>
            <div className="risk-stat-value" style={{ color: "var(--amber)" }}>{fmtPct(sim.medianMaxDD)}</div>
            <div className="risk-stat-sub">typical · worst 5% {fmtPct(sim.p95MaxDD)}</div>
          </div>
          <div className="risk-stat" data-tone={sim.ruinProb > 5 ? "risk" : "good"}>
            <div className="risk-stat-label">Risk of ruin</div>
            <div className="risk-stat-value" style={{ color: sim.ruinProb > 5 ? "var(--red)" : "var(--green)" }}>
              {fmtPct(sim.ruinProb)}
            </div>
            <div className="risk-stat-sub">{ruinPct}% equity tak girne ka chance</div>
          </div>
        </div>
      </section>

      <section className="trade-panel">
        <div className="trade-panel-head">
          <h3 className="trade-panel-title">Same edge, alag sizing</h3>
          <span className="trade-badge trade-badge-neutral">
            <Dices className="w-3 h-3" />
            same {runs} draws each
          </span>
        </div>
        <div className="overflow-auto">
          <table className="trade-table">
            <thead>
              <tr>
                <th>Risk / trade</th>
                <th className="trade-num">Median equity</th>
                <th className="trade-num">Median max DD</th>
                <th className="trade-num">Risk of ruin</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((row) => {
                const verdict =
                  row.ruinProb > 25 ? { text: "Account killer", tone: "trade-badge-red" }
                  : row.medianFinal < equity ? { text: "Bleeds out", tone: "trade-badge-red" }
                  : row.ruinProb > 5 || row.medianMaxDD > 40 ? { text: "Risky", tone: "trade-badge-amber" }
                  : row.medianMaxDD > 25 ? { text: "Rough ride", tone: "trade-badge-amber" }
                  : { text: "Survivable", tone: "trade-badge-green" };
                return (
                  <tr key={row.riskPct} style={row.riskPct === riskPct ? { background: "var(--accent-soft)" } : undefined}>
                    <td className="font-bold tnum">{fmtPct(row.riskPct, 2)}</td>
                    <td className="trade-num tnum" style={{ color: row.medianFinal >= equity ? "var(--green)" : "var(--red)" }}>
                      {fmtUsd(row.medianFinal)}
                    </td>
                    <td className="trade-num tnum" style={{ color: "var(--amber)" }}>{fmtPct(row.medianMaxDD)}</td>
                    <td className="trade-num tnum" style={{ color: row.ruinProb > 5 ? "var(--red)" : "var(--text-secondary)" }}>
                      {fmtPct(row.ruinProb)}
                    </td>
                    <td><span className={`trade-badge ${verdict.tone}`}>{verdict.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11.5px] leading-relaxed flex gap-2" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--tr-line-soft)" }}>
          {worstBeyond && worstBeyond.medianMaxDD > peak.medianMaxDD
            ? <Skull className="w-3.5 h-3.5 flex-none mt-px" />
            : <CheckCircle2 className="w-3.5 h-3.5 flex-none mt-px" />}
          <span>
            Har row bilkul same win/loss sequence par chalti hai — farq sirf position size ka hai.
            Is edge par median equity <b>{fmtPct(peak.riskPct, 2)}</b> risk par top karti hai
            ({fmtUsd(peak.medianFinal)}, {fmtPct(peak.medianMaxDD)} drawdown).
            {worstBeyond && (
              <>
                {" "}Usse badha kar {fmtPct(worstBeyond.riskPct, 2)} karne par median{" "}
                {worstBeyond.medianFinal >= peak.medianFinal ? "bas " : ""}
                <b style={{ color: worstBeyond.medianFinal < peak.medianFinal ? "var(--red)" : undefined }}>
                  {fmtUsd(worstBeyond.medianFinal)}
                </b>{" "}
                rehta hai, par drawdown{" "}
                <b style={{ color: "var(--amber)" }}>{fmtPct(worstBeyond.medianMaxDD)}</b> aur ruin{" "}
                <b style={{ color: worstBeyond.ruinProb > 5 ? "var(--red)" : undefined }}>
                  {fmtPct(worstBeyond.ruinProb)}
                </b>{" "}
                ho jaata hai — yahi over-betting ki keemat hai.
              </>
            )}
          </span>
        </p>
      </section>

      <p className="text-[11.5px] leading-relaxed flex gap-2" style={{ color: "var(--text-muted)" }}>
        <Info className="w-3.5 h-3.5 flex-none mt-px" />
        <span>
          Simulation har trade ko independent maanta hai aur fixed-fractional sizing use karta hai
          (risk hamesha current equity ka %). Asli trading mein losses cluster karte hain aur slippage
          lagti hai, isliye asli drawdown yahan se thoda bura hota hai — better nahi.
        </span>
      </p>
    </div>
  );
}

/* ── Fan chart ────────────────────────────────────────────
   Equity log scale par hai: compounding mein +100% aur -50% barabar distance
   par dikhne chahiye, warna upar wale outcomes poora chart kha jaate hain. */
function FanChart({ sim, equity }: { sim: SimResult; equity: number }) {
  const W = 800;
  const H = 320;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 10;

  const { band } = sim;
  const steps = band.p50.length;

  const floor = Math.max(1, Math.min(...band.p10, equity) * 0.92);
  const ceil = Math.max(...band.p90, equity) * 1.08;
  const lo = Math.log10(floor);
  const hi = Math.log10(ceil);
  const spanY = hi - lo || 1;

  const x = (i: number) => padL + (i / Math.max(1, steps - 1)) * (W - padL - padR);
  const y = (v: number) => padT + ((hi - Math.log10(Math.max(v, floor))) / spanY) * (H - padT - padB);

  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area =
    `${band.p90.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} ` +
    `${band.p10.map((v, i) => `L${x(steps - 1 - i).toFixed(1)} ${y(band.p10[steps - 1 - i]).toFixed(1)}`).join(" ")} Z`;

  // Log scale par 4 "round" equity levels — labels HTML mein hain taaki crisp rahein.
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = Math.pow(10, lo + (spanY * i) / 4);
      out.push(v);
    }
    return out;
  }, [lo, spanY]);

  return (
    <div className="relative">
      <svg className="risk-fan" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Equity curve distribution">
        {ticks.map((t) => (
          <line
            key={t}
            x1={padL} x2={W - padR} y1={y(t)} y2={y(t)}
            stroke="var(--tr-line-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="rgba(0, 230, 118, 0.14)" stroke="none" />
        <path d={line(band.p90)} fill="none" stroke="rgba(0, 230, 118, 0.45)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={line(band.p10)} fill="none" stroke="rgba(255, 82, 82, 0.45)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

        {sim.samples.slice(0, 10).map((path, i) => (
          <path
            key={i}
            d={line(path)}
            fill="none"
            stroke="rgba(148, 163, 184, 0.28)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <line
          x1={padL} x2={W - padR} y1={y(equity)} y2={y(equity)}
          stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke"
        />
        <path d={line(band.p50)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="absolute inset-0 pointer-events-none">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute text-[9.5px] tnum px-1"
            style={{
              top: `${(y(t) / H) * 100}%`,
              left: 4,
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              background: "var(--tr-field)",
            }}
          >
            {fmtUsd(t)}
          </span>
        ))}
        <span className="absolute text-[9.5px]" style={{ right: 6, bottom: 4, color: "var(--text-muted)" }}>
          {steps - 1} trades
        </span>
      </div>
    </div>
  );
}
