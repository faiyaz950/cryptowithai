"use client";

import type { PortfolioFile } from "@/lib/portfolio";
import { fmtBytes, fmtDate } from "@/lib/portfolio";

interface Props {
  file: PortfolioFile;
  onRemove: (id: string) => void;
}

const FORMAT_CONFIG: Record<string, { label: string; color: string }> = {
  csv: { label: "CSV", color: "var(--accent)" },
  excel: { label: "XLS", color: "#2563eb" },
  pdf: { label: "PDF", color: "#f87171" },
  unknown: { label: "FILE", color: "var(--text-muted)" },
};

export default function FileCard({ file, onRemove }: Props) {
  const cfg = FORMAT_CONFIG[file.format] ?? FORMAT_CONFIG.unknown;
  const meta = [
    file.holdingsCount > 0 ? `${file.holdingsCount} holdings` : "Document",
    fmtBytes(file.sizeBytes),
    fmtDate(file.uploadedAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="card-elevated group flex items-center gap-3 rounded-2xl p-3.5 transition-all duration-150"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Format badge */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-[10px] font-bold tracking-wider flex-shrink-0"
        style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}
      >
        {cfg.label}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }} title={file.fileName}>
          {file.fileName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{meta}</span>
          <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "var(--accent)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            AI connected
          </span>
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(file.id)}
        className="p-2 rounded-lg transition-colors flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
        title="Remove file"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#f87171";
          e.currentTarget.style.background = "rgba(248,113,113,0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
