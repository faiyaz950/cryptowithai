"use client";

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
  total: number;
  size?: number;
}

export default function DonutChart({ segments, total, size = 140 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.18;
  const circumference = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-xs"
        style={{ width: size, height: size, background: "var(--bg-hover)", color: "var(--text-muted)" }}
      >
        No data
      </div>
    );
  }

  let cumulativePct = 0;
  const GAP = 0.02; // gap between segments as fraction of circumference

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={strokeWidth} />
        {segments
          .filter((s) => s.value > 0)
          .map((seg, i) => {
            const pct = seg.value / total;
            const dashLen = Math.max(0, pct * circumference - GAP * circumference);
            const offset = circumference * (0.25 - cumulativePct);
            cumulativePct += pct;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            );
          })}
      </svg>
      {/* Center text */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ pointerEvents: "none" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Portfolio</span>
        <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
          {segments.filter((s) => s.value > 0).length} assets
        </span>
      </div>
    </div>
  );
}
