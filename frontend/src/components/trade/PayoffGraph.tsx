"use client";

import { useMemo, useState } from "react";

export interface SpreadPayoffProps {
  type: "spread";
  spot: number;
  longStrike: number;
  shortStrike: number;
  netDebit: number;
  maxProfit: number;
  breakeven: number;
  isCall: boolean;
  underlying?: string;
}

export interface CondorPayoffProps {
  type: "condor";
  spot: number;
  longPutStrike: number;
  shortPutStrike: number;
  shortCallStrike: number;
  longCallStrike: number;
  netCredit: number;
  maxLoss: number;
  breakevenLow: number;
  breakevenHigh: number;
  underlying?: string;
}

export interface SinglePayoffProps {
  type: "single";
  spot: number;
  strike: number;
  premium: number;
  isCall: boolean;
  underlying?: string;
}

export type PayoffProps = SpreadPayoffProps | CondorPayoffProps | SinglePayoffProps;

interface Point {
  price: number;
  pnl: number;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtPnl(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function PayoffGraph(props: PayoffProps) {
  const [hovered, setHovered] = useState<Point | null>(null);

  // Compute curve points
  const { points, minPrice, maxPrice, minPnl, maxPnl, spot, breakevens } = useMemo(() => {
    let pList: Point[] = [];
    let minP = 0;
    let maxP = 0;
    let minL = 0;
    let maxL = 0;
    let bes: number[] = [];
    const curSpot = props.spot || 1;

    if (props.type === "spread") {
      const { longStrike, shortStrike, netDebit, maxProfit, breakeven, isCall } = props;
      bes = [breakeven];
      const lowStrike = Math.min(longStrike, shortStrike);
      const highStrike = Math.max(longStrike, shortStrike);
      const range = (highStrike - lowStrike) || curSpot * 0.1;
      minP = Math.max(1, lowStrike - range * 0.6);
      maxP = highStrike + range * 0.6;
      minL = -netDebit;
      maxL = maxProfit;

      const steps = 60;
      const stepSize = (maxP - minP) / steps;
      for (let i = 0; i <= steps; i++) {
        const pr = minP + i * stepSize;
        let pnl = 0;
        if (isCall) {
          // Bull call: Long lower, Short higher
          const longVal = Math.max(0, pr - lowStrike);
          const shortVal = Math.max(0, pr - highStrike);
          pnl = longVal - shortVal - netDebit;
        } else {
          // Bear put: Long higher, Short lower
          const longVal = Math.max(0, highStrike - pr);
          const shortVal = Math.max(0, lowStrike - pr);
          pnl = longVal - shortVal - netDebit;
        }
        pList.push({ price: pr, pnl });
      }
    } else if (props.type === "condor") {
      const { longPutStrike, shortPutStrike, shortCallStrike, longCallStrike, netCredit, maxLoss, breakevenLow, breakevenHigh } = props;
      bes = [breakevenLow, breakevenHigh];
      const span = longCallStrike - longPutStrike || curSpot * 0.2;
      minP = Math.max(1, longPutStrike - span * 0.35);
      maxP = longCallStrike + span * 0.35;
      minL = -maxLoss;
      maxL = netCredit;

      const steps = 80;
      const stepSize = (maxP - minP) / steps;
      for (let i = 0; i <= steps; i++) {
        const pr = minP + i * stepSize;
        // PnL = intrinsic of (Long Call - Short Call - Short Put + Long Put) + net credit
        const lc = Math.max(0, pr - longCallStrike);
        const sc = Math.max(0, pr - shortCallStrike);
        const sp = Math.max(0, shortPutStrike - pr);
        const lp = Math.max(0, longPutStrike - pr);
        const pnl = lc - sc - sp + lp + netCredit;
        pList.push({ price: pr, pnl });
      }
    } else {
      // Single leg
      const { strike, premium, isCall } = props;
      const be = isCall ? strike + premium : strike - premium;
      bes = [be];
      const span = strike * 0.15;
      minP = Math.max(1, strike - span);
      maxP = strike + span;
      minL = -premium;
      maxL = premium * 3;

      const steps = 60;
      const stepSize = (maxP - minP) / steps;
      for (let i = 0; i <= steps; i++) {
        const pr = minP + i * stepSize;
        const intrinsic = isCall ? Math.max(0, pr - strike) : Math.max(0, strike - pr);
        const pnl = intrinsic - premium;
        pList.push({ price: pr, pnl });
      }
    }

    // Safety margins for graph bounds
    const pnlPadding = Math.max(1, (maxL - minL) * 0.18);
    return {
      points: pList,
      minPrice: minP,
      maxPrice: maxP,
      minPnl: minL - pnlPadding,
      maxPnl: maxL + pnlPadding,
      spot: curSpot,
      breakevens: bes,
    };
  }, [props]);

  // SVG coordinate dimensions
  const width = 640;
  const height = 220;
  const padL = 60;
  const padR = 25;
  const padT = 25;
  const padB = 40;

  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const getX = (price: number) => {
    if (maxPrice === minPrice) return padL + chartW / 2;
    return padL + ((price - minPrice) / (maxPrice - minPrice)) * chartW;
  };

  const getY = (pnl: number) => {
    if (maxPnl === minPnl) return padT + chartH / 2;
    return padT + chartH - ((pnl - minPnl) / (maxPnl - minPnl)) * chartH;
  };

  const zeroY = getY(0);
  const spotX = getX(spot);

  // Path generator
  const pathD = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${getX(p.price).toFixed(1)} ${getY(p.pnl).toFixed(1)}`)
      .join(" ");
  }, [points, minPrice, maxPrice, minPnl, maxPnl]);

  // Fill path for positive and negative shading
  const areaD = useMemo(() => {
    if (points.length === 0) return "";
    const firstX = getX(points[0].price).toFixed(1);
    const lastX = getX(points[points.length - 1].price).toFixed(1);
    return `${pathD} L ${lastX} ${zeroY.toFixed(1)} L ${firstX} ${zeroY.toFixed(1)} Z`;
  }, [pathD, points, zeroY]);

  return (
    <div className="payoff-graph-card rounded-xl border p-4 space-y-3" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            Payoff Graph (Expiry P&L)
          </span>
          <span className="trade-badge trade-badge-blue text-[11px]">
            {props.type === "spread"
              ? props.isCall
                ? "Bull Call Spread"
                : "Bear Put Spread"
              : props.type === "condor"
              ? "Iron Condor"
              : props.isCall
              ? "Long Call"
              : "Long Put"}
          </span>
        </div>
        <div className="text-[12px] tnum flex items-center gap-3">
          {hovered ? (
            <span style={{ color: hovered.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
              At {fmtPrice(hovered.price)}: {fmtPnl(hovered.pnl)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>
              Current Spot: <b style={{ color: "var(--text-primary)" }}>{fmtPrice(spot)}</b>
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block"
          onMouseLeave={() => setHovered(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            if (relX >= padL && relX <= width - padR) {
              const priceHover = minPrice + ((relX - padL) / chartW) * (maxPrice - minPrice);
              // Find nearest point
              let nearest = points[0];
              let minDist = Infinity;
              for (const pt of points) {
                const dist = Math.abs(pt.price - priceHover);
                if (dist < minDist) {
                  minDist = dist;
                  nearest = pt;
                }
              }
              if (nearest) setHovered(nearest);
            }
          }}
        >
          <defs>
            <linearGradient id="pnlGradGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="pnlGradRed" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Zero P&L horizontal line */}
          <line
            x1={padL}
            y1={zeroY}
            x2={width - padR}
            y2={zeroY}
            stroke="var(--border-subtle)"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text
            x={padL - 6}
            y={zeroY + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--text-muted)"
            fontFamily="monospace"
          >
            $0
          </text>

          {/* Max Profit label */}
          <line
            x1={padL}
            y1={getY(maxPnl)}
            x2={width - padR}
            y2={getY(maxPnl)}
            stroke="rgba(16, 185, 129, 0.2)"
            strokeDasharray="2 4"
            strokeWidth="1"
          />

          {/* Shaded Area */}
          <path d={areaD} fill="url(#pnlGradGreen)" opacity="0.8" />

          {/* Payoff curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Breakeven markers */}
          {breakevens.map((be, idx) => {
            const beX = getX(be);
            if (beX < padL || beX > width - padR) return null;
            return (
              <g key={`be-${idx}`}>
                <line
                  x1={beX}
                  y1={padT}
                  x2={beX}
                  y2={height - padB}
                  stroke="var(--amber)"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                />
                <circle cx={beX} cy={zeroY} r="3.5" fill="var(--amber)" />
                <text
                  x={beX}
                  y={height - padB + 14}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--amber)"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  BE {fmtPrice(be)}
                </text>
              </g>
            );
          })}

          {/* Spot price vertical line */}
          {spotX >= padL && spotX <= width - padR && (
            <g>
              <line
                x1={spotX}
                y1={padT}
                x2={spotX}
                y2={height - padB}
                stroke="var(--accent)"
                strokeWidth="1.8"
              />
              <circle cx={spotX} cy={getY(0)} r="4" fill="var(--accent)" />
              <text
                x={spotX}
                y={padT - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--accent)"
                fontWeight="700"
                fontFamily="monospace"
              >
                Spot {fmtPrice(spot)}
              </text>
            </g>
          )}

          {/* Hover indicator */}
          {hovered && (
            <g>
              <line
                x1={getX(hovered.price)}
                y1={padT}
                x2={getX(hovered.price)}
                y2={height - padB}
                stroke="#fff"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={getX(hovered.price)}
                cy={getY(hovered.pnl)}
                r="5"
                fill={hovered.pnl >= 0 ? "var(--green)" : "var(--red)"}
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Axis labels */}
          <text
            x={padL}
            y={height - 10}
            fontSize="10"
            fill="var(--text-muted)"
            fontFamily="monospace"
          >
            {fmtPrice(minPrice)}
          </text>
          <text
            x={width - padR}
            y={height - 10}
            textAnchor="end"
            fontSize="10"
            fill="var(--text-muted)"
            fontFamily="monospace"
          >
            {fmtPrice(maxPrice)}
          </text>
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] pt-1" style={{ color: "var(--text-muted)" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent)" }} /> Spot Price
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--amber)" }} /> Breakeven (BE)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5" style={{ background: "#38bdf8" }} /> Expiry Payoff
          </span>
        </div>
        <span>Hover curve to inspect P&L at spot</span>
      </div>
    </div>
  );
}
