"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import type { StrategyPreset } from "@/lib/strategies";

interface Props {
  presets: StrategyPreset[];
  /** Abhi ki values kis preset jaisi hain — null = user ne khud badla (custom). */
  active: StrategyPreset | null;
  onSelect: (preset: StrategyPreset) => void;
}

/**
 * Safe / Balanced / Growth — user ko channel, ATR, tp1 samajhne ki zaroorat na pade.
 * Har card ke numbers backtest ke hain; neeche saaf likha hai ki guarantee nahi.
 */
export default function PresetPicker({ presets, active, onSelect }: Props) {
  return (
    <section className="trade-panel">
      <div className="trade-panel-head">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-4 h-4 flex-none" style={{ color: "var(--text-muted)" }} />
          <span className="trade-panel-title">Preset chuno</span>
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {active ? `${active.label} · ${active.summary}` : "Custom — aapne rules badle hain"}
        </span>
      </div>

      <div className="trade-panel-body space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {presets.map((p) => {
            const on = active?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                aria-pressed={on}
                className="text-left rounded-xl border p-3.5 transition-colors"
                style={{
                  borderColor: on ? p.color : "var(--border-subtle)",
                  background: on ? `color-mix(in srgb, ${p.color} 10%, transparent)` : "rgba(255,255,255,0.02)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold" style={{ color: p.color }}>
                    {p.label}
                  </span>
                  {on && <Check className="w-4 h-4" style={{ color: p.color }} />}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {p.summary} · BTC + ETH + SOL
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] tnum">
                  <span style={{ color: "var(--text-muted)" }}>Saalana</span>
                  <span className="text-right font-semibold" style={{ color: "var(--green)" }}>{p.expect.yearly}</span>
                  <span style={{ color: "var(--text-muted)" }}>Max girawat</span>
                  <span className="text-right font-semibold" style={{ color: "var(--red)" }}>−{p.expect.maxDrawdown}</span>
                  <span style={{ color: "var(--text-muted)" }}>Bura mahina</span>
                  <span className="text-right">{p.expect.worstMonth}</span>
                </div>
              </button>
            );
          })}
        </div>

        {active && (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold" style={{ color: active.color }}>{active.label}:</span>{" "}
            Sep 2020 – Oct 2026 (BTC + ETH + SOL, fees ke baad) mein {active.expect.yearly} saalana, max girawat −
            {active.expect.maxDrawdown}, sabse bura mahina {active.expect.worstMonth}, {active.expect.positiveMonths} mahine plus,
            aur koi saal minus nahi (sabse kamzor {active.expect.worstYear}). Mahine mein {active.expect.tradesPerMonth} trades.
          </p>
        )}
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Ye purane data ke numbers hain, guarantee nahi — aage market alag ho sakta hai. Pehle paper par chalao.
        </p>
      </div>
    </section>
  );
}
