"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { BacktestParams } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS } from "@/lib/cryptoApi";
import {
  STRATEGIES,
  STRATEGIES_CHANGED_EVENT,
  bool,
  num,
  readActiveStrategies,
  str,
  strategyHref,
  type StrategyDef,
  type StrategyField,
  type StrategyValues,
} from "@/lib/strategies";

interface Props {
  defaultSymbol: string;
  running: boolean;
  /** Card se seedha backtest — parent Backtest tab par result dikhata hai. */
  onTest: (params: BacktestParams) => void;
}

/** Card par sirf pehle chaar params — baaki strategy ke apne page par. */
const CARD_FIELD_LIMIT = 4;

function cardFields(def: StrategyDef): StrategyField[] {
  return def.fields.filter((f) => f.onCard).slice(0, CARD_FIELD_LIMIT);
}

export default function StrategyCards({ defaultSymbol, running, onTest }: Props) {
  const [values, setValues] = useState<Record<string, StrategyValues>>(() =>
    Object.fromEntries(STRATEGIES.map((def) => [def.id, { ...def.defaults, symbol: defaultSymbol }])),
  );
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Activation strategy page par hoti hai — yahan sirf uska reflection dikhta hai.
  useEffect(() => {
    const sync = () => setActive(readActiveStrategies());
    sync();
    window.addEventListener(STRATEGIES_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(STRATEGIES_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const activeCount = STRATEGIES.filter((def) => active[def.id]).length;

  const setField = (id: string, key: string, value: StrategyValues[string]) => {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">Trading Strategies</h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Kisi bhi strategy par click karo — uska apna page khulega jahan live signal aur backtest dono chalte hain.
          </p>
        </div>
        <span className={`trade-badge ${activeCount > 0 ? "trade-badge-green" : "trade-badge-neutral"}`}>
          {activeCount} active
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {STRATEGIES.map((def) => (
          <StrategyCard
            key={def.id}
            def={def}
            values={values[def.id]}
            active={!!active[def.id]}
            running={running}
            onField={(key, value) => setField(def.id, key, value)}
            onTest={() => onTest(def.toBacktest(values[def.id]))}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Card ──────────────────────────────────────────────── */

function StrategyCard({
  def,
  values,
  active,
  running,
  onField,
  onTest,
}: {
  def: StrategyDef;
  values: StrategyValues;
  active: boolean;
  running: boolean;
  onField: (key: string, value: StrategyValues[string]) => void;
  onTest: () => void;
}) {
  const router = useRouter();
  const Icon = def.icon;
  const href = strategyHref(def, values);

  // Card ke khaali hisse par click = strategy page. Inputs/buttons apna kaam karte rahein.
  const openFromCard = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, select, button, a, label")) return;
    router.push(href);
  };

  return (
    <article
      className={`trade-strategy trade-panel ${def.featured ? "trade-featured" : ""} trade-strategy-clickable`}
      data-active={active}
      onClick={openFromCard}
    >
      <div className="trade-panel-body flex flex-col flex-1">
        <div className="flex items-start gap-3">
          <span className="trade-strategy-icon" style={{ background: `${def.accent}1a`, color: def.accent }}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold leading-tight">
              <Link href={href} className="trade-strategy-title">{def.name}</Link>
            </h3>
            <p className="text-[11px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {def.category}
            </p>
          </div>
          <span className={`trade-badge ${active ? "trade-badge-green" : "trade-badge-neutral"}`}>
            {active ? <><span className="trade-dot" />Live</> : "Inactive"}
          </span>
        </div>

        <p className="text-[12.5px] mt-3.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {def.blurb}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {cardFields(def).map((field) => (
            <CardField key={field.key} def={def} field={field} values={values} onChange={(v) => onField(field.key, v)} />
          ))}
        </div>

        <div className="flex-1" />
        <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
          <Link href={href} className="trade-btn trade-btn-primary flex-1">
            Open strategy
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button type="button" disabled={running} className="trade-btn trade-btn-ghost flex-1" onClick={onTest}>
            {running ? "Running…" : "Quick backtest"}
          </button>
        </div>
      </div>
    </article>
  );
}

function CardField({
  def,
  field,
  values,
  onChange,
}: {
  def: StrategyDef;
  field: StrategyField;
  values: StrategyValues;
  onChange: (value: StrategyValues[string]) => void;
}) {
  const id = `card-${def.id}-${field.key}`;

  if (field.kind === "toggle") {
    return (
      <label className="trade-checkrow" htmlFor={id}>
        <input id={id} type="checkbox" className="trade-check" checked={bool(values, field.key)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  return (
    <div>
      <label className="trade-label" htmlFor={id}>{field.label}</label>
      {field.kind === "time" ? (
        <input id={id} type="time" className="trade-input" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "select" ? (
        <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.kind === "symbol" ? (
        <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
          {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      ) : field.kind === "interval" ? (
        <select id={id} className="trade-select" value={str(values, field.key)} onChange={(e) => onChange(e.target.value)}>
          {CRYPTO_INTERVALS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      ) : (
        <input
          id={id}
          type="number"
          className="trade-input"
          min={field.min}
          max={field.max}
          step={field.step}
          value={num(values, field.key)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}
