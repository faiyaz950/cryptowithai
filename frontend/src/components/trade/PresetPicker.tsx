"use client";

import { Check } from "lucide-react";
import type { StrategyPreset } from "@/lib/strategies";

interface Props {
  presets: StrategyPreset[];
  active: StrategyPreset | null;
  onSelect: (preset: StrategyPreset) => void;
}

/** Safe / Balanced / Growth — one-click risk profiles. */
export default function PresetPicker({ presets, active, onSelect }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {presets.map((p) => {
        const on = active?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            aria-pressed={on}
            className="text-left rounded-xl border px-3.5 py-3 transition-colors"
            style={{
              borderColor: on ? p.color : "var(--border-subtle)",
              background: on ? `color-mix(in srgb, ${p.color} 10%, transparent)` : "rgba(255,255,255,0.02)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold" style={{ color: p.color }}>
                {p.label}
              </span>
              {on && <Check className="w-3.5 h-3.5" style={{ color: p.color }} />}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[12px] tnum">
              <span style={{ color: "var(--green)" }}>{p.expect.yearly}</span>
              <span style={{ color: "var(--text-muted)" }}>DD −{p.expect.maxDrawdown}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
