"use client";

import { useState, useRef, useEffect } from "react";
import type { AIModelId, AIModelOption } from "@/lib/types";

interface Props {
  models: AIModelOption[];
  selected: AIModelId;
  onChange: (id: AIModelId) => void;
  disabled?: boolean;
}

const MODEL_ICONS: Record<AIModelId, string> = {
  auto: "⚡",
  gemini: "✦",
  openai: "◎",
  grok: "𝕏",
  groq: "⬡",
  claude: "◆",
};

export default function ModelSelector({ models, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = models.find((m) => m.id === selected) ?? models[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: open ? "var(--border)" : "var(--bg-hover)",
          color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
          border: "1px solid",
          borderColor: open ? "var(--text-muted)" : "var(--border)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--text-muted)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <span>{MODEL_ICONS[selected] ?? "AI"}</span>
        <span className="hidden sm:inline">{current?.label ?? "Auto"}</span>
        <svg
          className="w-3 h-3 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 rounded-xl overflow-hidden z-30 fade-in card-elevated"
        >
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>AI Model choose karein</p>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {models.map((model) => {
              const isSelected = model.id === selected;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span className="text-sm mt-0.5 flex-shrink-0">{MODEL_ICONS[model.id] ?? "AI"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {model.label}
                      </span>
                      {model.pro_only && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                          Pro
                        </span>
                      )}
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#2563eb" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {model.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
