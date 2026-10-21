"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, RotateCcw, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import "./calculators.css";

type Tone = "up" | "down" | "flat";

/* ── Inputs ──────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  min,
  invalid,
  placeholder,
  optional,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  invalid?: boolean;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <label className="cx-field">
      <span className="cx-label">
        {label}
        {optional && <em>optional</em>}
      </span>
      <span className="cx-input" data-invalid={invalid || undefined}>
        {prefix && <span className="cx-affix">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
        />
        {suffix && <span className="cx-affix">{suffix}</span>}
      </span>
      {hint && <span className="cx-hint">{hint}</span>}
    </label>
  );
}

export function DirectionToggle({ side, onChange }: { side: "long" | "short"; onChange: (s: "long" | "short") => void }) {
  return (
    <div>
      <span className="cx-label">Direction</span>
      <div className="cx-dir" role="group" aria-label="Direction">
        <button type="button" data-side="long" data-active={side === "long"} aria-pressed={side === "long"} onClick={() => onChange("long")}>
          <TrendingUp className="w-4 h-4" />
          Long
        </button>
        <button type="button" data-side="short" data-active={side === "short"} aria-pressed={side === "short"} onClick={() => onChange("short")}>
          <TrendingDown className="w-4 h-4" />
          Short
        </button>
      </div>
    </div>
  );
}

export function Chips({ options, value, onPick, suffix = "%", label }: { options: string[]; value: string; onPick: (v: string) => void; suffix?: string; label: string }) {
  return (
    <div className="cx-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="cx-chip" data-active={value === o} onClick={() => onPick(o)}>
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}

/** Number field ke neeche ka slider — min..max ke bahar ki value par bhi slider ek kinare par rukta hai. */
export function Slider({ value, onChange, min, max, step, scale }: { value: number; onChange: (v: string) => void; min: number; max: number; step: number; scale: [string, string] }) {
  const clamped = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const p = ((clamped - min) / (max - min)) * 100;
  return (
    <div className="cx-range-wrap">
      <input
        className="cx-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        style={{ ["--p" as string]: `${p}%` }}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Slider"
      />
      <div className="cx-range-scale">
        <span>{scale[0]}</span>
        <span>{scale[1]}</span>
      </div>
    </div>
  );
}

export function Optional({ children }: { children: ReactNode }) {
  return (
    <div className="cx-optional">
      <span className="cx-optional-title">Optional</span>
      {children}
    </div>
  );
}

/* ── Layout ──────────────────────────────────────────────── */

export interface Dock {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

/**
 * Do panel: inputs (left) aur result (right, desktop par sticky). Mobile par result ke neeche
 * ek floating bar rehta hai jo result screen se bahar ho to dikhta hai aur tap par wahan le jata hai.
 */
export function CalcLayout({
  inputsTitle,
  inputsIcon: InputsIcon,
  onReset,
  inputs,
  resultTitle,
  resultIcon: ResultIcon,
  badge,
  result,
  dock,
  note,
}: {
  inputsTitle: string;
  inputsIcon: LucideIcon;
  onReset: () => void;
  inputs: ReactNode;
  resultTitle: string;
  resultIcon: LucideIcon;
  badge?: ReactNode;
  result: ReactNode;
  dock: Dock | null;
  note?: string;
}) {
  const resultRef = useRef<HTMLElement>(null);
  const [resultInView, setResultInView] = useState(false);

  useEffect(() => {
    const el = resultRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setResultInView(entry.intersectionRatio > 0.35), { threshold: [0, 0.35, 0.7] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className="cx-grid">
        <section className="cx-panel">
          <div className="cx-panel-head">
            <span className="cx-panel-title">
              <InputsIcon className="w-4 h-4" />
              {inputsTitle}
            </span>
            <button type="button" className="cx-reset" onClick={onReset}>
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
          <div className="cx-form">{inputs}</div>
        </section>

        <section className="cx-panel cx-results" ref={resultRef} aria-live="polite">
          <div className="cx-panel-head">
            <span className="cx-panel-title">
              <ResultIcon className="w-4 h-4" />
              {resultTitle}
            </span>
            {badge}
          </div>
          {result}
          {note && <p className="cx-note">{note}</p>}
        </section>
      </div>

      {dock && (
        <button
          type="button"
          className="cx-dock"
          data-up={dock.tone === "up" || undefined}
          data-down={dock.tone === "down" || undefined}
          data-hidden={resultInView || undefined}
          onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          aria-label={`${dock.label}: ${dock.value}. Poora result dekhein`}
          tabIndex={resultInView ? -1 : 0}
        >
          <span>
            <small>{dock.label}</small>
            <b>{dock.value}</b>
          </span>
          <span style={{ display: "grid", justifyItems: "end", gap: 2 }}>
            {dock.sub && <span className="cx-dock-sub">{dock.sub}</span>}
            <span className="cx-dock-go">
              Details <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </span>
        </button>
      )}
    </>
  );
}

export function SideBadge({ side }: { side: "long" | "short" }) {
  return (
    <span className="cx-badge" data-side={side}>
      {side === "long" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {side}
    </span>
  );
}

/* ── Result pieces ───────────────────────────────────────── */

export function Hero({ label, value, unit, tone = "flat", sub }: { label: string; value: ReactNode; unit?: string; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className="cx-hero" data-tone={tone}>
      <span className="cx-hero-label">{label}</span>
      <div className="cx-hero-value">
        {value}
        {unit && <span className="cx-hero-unit">{unit}</span>}
      </div>
      {sub && <div className="cx-hero-sub">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className="cx-pill" data-tone={tone}>
      {children}
    </span>
  );
}

export function Stats({ items }: { items: { label: string; value: ReactNode; tone?: Tone | "warn" }[] }) {
  return (
    <dl className="cx-stats">
      {items.map((it) => (
        <div key={it.label} className="cx-stat" data-tone={it.tone && it.tone !== "flat" ? it.tone : undefined}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="cx-section-title">{children}</div>;
}

/** Har row ek hissa — bar ki lambai sabse bade |value| ke hisaab se. */
export function Flow({ rows }: { rows: { label: string; value: number; text: string; total?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  return (
    <div className="cx-flow">
      {rows.map((r) => {
        const tone: Tone = Math.abs(r.value) < 0.005 ? "flat" : r.value > 0 ? "up" : "down";
        return (
          <div key={r.label} className="cx-flow-row" data-total={r.total || undefined}>
            <span className="cx-flow-label">{r.label}</span>
            <span className="cx-flow-track">
              <span className="cx-flow-bar" data-tone={tone} style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }} />
            </span>
            <span className="cx-flow-val" data-tone={tone}>
              {r.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Meter({ label, valueText, pct, high }: { label: string; valueText: string; pct: number; high?: boolean }) {
  return (
    <div className="cx-meter">
      <div className="cx-meter-head">
        <span>{label}</span>
        <b>{valueText}</b>
      </div>
      <div className="cx-meter-track" role="progressbar" aria-valuenow={Math.round(Math.min(100, pct))} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span className="cx-meter-fill" data-high={high || undefined} style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} />
      </div>
    </div>
  );
}

/** Stop / entry / target ek price line par — risk zone laal, reward zone hara. */
export function PriceRuler({ stop, entry, target, fmt }: { stop: number; entry: number; target?: number; fmt: (n: number) => string }) {
  const pts = [stop, entry, ...(target != null ? [target] : [])];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = (hi - lo) * 0.06 || 1;
  const from = lo - pad;
  const span = hi + pad - from;
  const pos = (v: number) => ((v - from) / span) * 100;

  const zones: { kind: "risk" | "reward"; a: number; b: number }[] = [{ kind: "risk", a: stop, b: entry }];
  if (target != null) zones.push({ kind: "reward", a: entry, b: target });

  const pins: { kind: "stop" | "entry" | "target"; label: string; v: number; at: "top" | "bottom" }[] = [
    { kind: "entry", label: "Entry", v: entry, at: "top" },
    { kind: "stop", label: "Stop loss", v: stop, at: "bottom" },
    ...(target != null ? [{ kind: "target" as const, label: "Target", v: target, at: "bottom" as const }] : []),
  ];

  return (
    <div className="cx-ruler" role="img" aria-label="Price levels">
      <div className="cx-ruler-track" />
      {zones.map((z) => (
        <span key={z.kind} className="cx-ruler-zone" data-kind={z.kind} style={{ left: `${pos(Math.min(z.a, z.b))}%`, width: `${Math.abs(pos(z.b) - pos(z.a))}%` }} />
      ))}
      {pins.map((p) => (
        <span key={p.kind} className="cx-ruler-pin" data-kind={p.kind} data-pos={p.at} style={{ left: `${pos(p.v)}%` }}>
          <span className="cx-ruler-tag">
            <small>{p.label}</small>
            <b>{fmt(p.v)}</b>
          </span>
        </span>
      ))}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "warn" | "info"; children: ReactNode }) {
  const Icon = kind === "info" ? Info : AlertTriangle;
  return (
    <div className="cx-notice" data-kind={kind} role={kind === "error" ? "alert" : undefined}>
      <Icon className="w-4 h-4" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="cx-empty">
      <span className="cx-empty-icon">
        <Icon className="w-6 h-6" />
      </span>
      <p>{children}</p>
    </div>
  );
}

export function Walkthrough({ steps }: { steps: { title: string; math: ReactNode }[] }) {
  return (
    <details className="cx-walk">
      <summary>
        Hisaab kaise bana
        <ChevronDown className="w-4 h-4" />
      </summary>
      <ol>
        {steps.map((s) => (
          <li key={s.title}>
            <span>{s.title}</span>
            <b>{s.math}</b>
          </li>
        ))}
      </ol>
    </details>
  );
}
