"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Sliders, TrendingDown, TrendingUp } from "lucide-react";
import type { BacktestParams, Candle } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, fetchCandles, symbolLabel } from "@/lib/cryptoApi";
import {
  STRATEGIES,
  STRATEGIES_CHANGED_EVENT,
  bool,
  num,
  readActiveStrategies,
  str,
  strategyHref,
  type SignalTone,
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

/** Har strategy ka signal nikalne ke liye itni history kaafi hai. */
const CARD_BARS = 400;

/** Card par sirf pehle chaar params — baaki strategy ke apne page par. */
const CARD_FIELD_LIMIT = 4;

function cardFields(def: StrategyDef): StrategyField[] {
  return def.fields.filter((f) => f.onCard).slice(0, CARD_FIELD_LIMIT);
}

/** Options strategies alag family hain — unka backtest bhi nahi chalta. */
function isOptions(def: StrategyDef): boolean {
  return def.category.toLowerCase().startsWith("options");
}

function toneColor(tone: SignalTone): string {
  return tone === "buy" ? "var(--green)" : tone === "sell" ? "var(--red)" : "var(--text-muted)";
}

export default function StrategyCards({ defaultSymbol, running, onTest }: Props) {
  const [values, setValues] = useState<Record<string, StrategyValues>>(() =>
    Object.fromEntries(STRATEGIES.map((def) => [def.id, { ...def.defaults, symbol: defaultSymbol }])),
  );
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [openTune, setOpenTune] = useState<Record<string, boolean>>({});

  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setIntervalValue] = useState("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

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

  /**
   * Ek hi candle fetch se saari strategies ka signal ban jaata hai — har card
   * apni request nahi maarta. Pehle cards par sirf khaali input fields the;
   * catalogue ye nahi bata paata tha ki abhi kaun kya keh rahi hai.
   */
  const loadCandles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCandles({ symbol, interval, limit: CARD_BARS });
      setCandles(res.success ? res.candles ?? [] : []);
      setScannedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch {
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  // Signals sab ek pass mein — strategy page wahi analyze() chalata hai.
  const signals = useMemo(() => {
    if (!candles.length) return {} as Record<string, ReturnType<StrategyDef["analyze"]>["signal"]>;
    return Object.fromEntries(
      STRATEGIES.map((def) => {
        const merged = { ...values[def.id], symbol, timeframe: interval };
        return [def.id, def.analyze(candles, merged).signal];
      }),
    );
  }, [candles, values, symbol, interval]);

  const activeCount = STRATEGIES.filter((def) => active[def.id]).length;
  const buyCount = STRATEGIES.filter((def) => signals[def.id]?.tone === "buy").length;
  const sellCount = STRATEGIES.filter((def) => signals[def.id]?.tone === "sell").length;

  const setField = (id: string, key: string, value: StrategyValues[string]) => {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const groups = [
    { title: "Spot & perpetual", hint: "Coin ka bhaav directly — inka backtest chalta hai", defs: STRATEGIES.filter((d) => !isOptions(d)) },
    { title: "Options", hint: "Do ya chaar leg positions — live signal + strike selection", defs: STRATEGIES.filter(isOptions) },
  ];

  return (
    <div className="space-y-5">
      <div
        className="trade-panel flex flex-wrap items-center gap-3 px-4 py-3.5"
        style={{ background: "linear-gradient(135deg, var(--accent-soft), #fff 58%)" }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold tracking-tight">Apni custom strategy banana chahte ho?</div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            No-code Strategy Builder — indicators, risk, aur deploy ek jagah
          </p>
        </div>
        <Link href="/trade?tab=builder" className="trade-btn trade-btn-primary">
          Open builder
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* ── Header + live controls ────────────────────────── */}
      <div className="trade-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-tight leading-tight">Strategy catalogue</h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Ready-made strategies — har ek abhi kya keh rahi hai
            </p>
          </div>

          <div className="trade-divider-v hidden lg:block my-0.5" />

          <div className="flex items-center gap-2">
            <span className="trade-signal-pill" style={{ color: "var(--green)" }}>
              <TrendingUp className="w-3.5 h-3.5" />{buyCount} buy
            </span>
            <span className="trade-signal-pill" style={{ color: "var(--red)" }}>
              <TrendingDown className="w-3.5 h-3.5" />{sellCount} sell
            </span>
            <span className={`trade-badge ${activeCount > 0 ? "trade-badge-green" : "trade-badge-neutral"}`}>
              {activeCount} active
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol" className="trade-select trade-w-symbol trade-size-sm trade-strong">
              {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} aria-label="Timeframe" className="trade-select trade-w-history trade-size-sm">
              {CRYPTO_INTERVALS.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
            </select>
            <button type="button" onClick={() => void loadCandles()} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
            </button>
          </div>
        </div>
        {scannedAt && (
          <p className="px-4 pb-3 text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
            {symbolLabel(symbol)} · {candles.length} candles · updated {scannedAt}
          </p>
        )}
      </div>

      {/* ── Grouped cards ─────────────────────────────────── */}
      {groups.map((group) => (
        <section key={group.title}>
          <div className="flex items-baseline gap-2.5 mb-3">
            <h3 className="text-[13px] font-bold tracking-tight">{group.title}</h3>
            <span className="trade-count-chip">{group.defs.length}</span>
            <span className="hidden sm:inline text-[11.5px]" style={{ color: "var(--text-muted)" }}>{group.hint}</span>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
            {group.defs.map((def) => (
              <StrategyCard
                key={def.id}
                def={def}
                values={values[def.id]}
                signal={signals[def.id]}
                loading={loading && !candles.length}
                active={!!active[def.id]}
                running={running}
                tuneOpen={!!openTune[def.id]}
                onToggleTune={() => setOpenTune((p) => ({ ...p, [def.id]: !p[def.id] }))}
                onField={(key, value) => setField(def.id, key, value)}
                onTest={() => onTest(def.toBacktest({ ...values[def.id], symbol, timeframe: interval }))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Card ──────────────────────────────────────────────── */

function StrategyCard({
  def,
  values,
  signal,
  loading,
  active,
  running,
  tuneOpen,
  onToggleTune,
  onField,
  onTest,
}: {
  def: StrategyDef;
  values: StrategyValues;
  signal?: ReturnType<StrategyDef["analyze"]>["signal"];
  loading: boolean;
  active: boolean;
  running: boolean;
  tuneOpen: boolean;
  onToggleTune: () => void;
  onField: (key: string, value: StrategyValues[string]) => void;
  onTest: () => void;
}) {
  const router = useRouter();
  const Icon = def.icon;
  const href = strategyHref(def, values);
  const tone = signal?.tone ?? "neutral";

  // Card ke khaali hisse par click = strategy page. Controls apna kaam karte rahein.
  const openFromCard = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, select, button, a, label")) return;
    router.push(href);
  };

  return (
    <article
      className="trade-strategy trade-panel trade-strategy-clickable"
      data-active={active}
      data-tone={tone}
      onClick={openFromCard}
    >
      <div className="trade-panel-body flex flex-col flex-1">
        {/* Head */}
        <div className="flex items-start gap-3">
          <span className="trade-strategy-icon" style={{ background: `${def.accent}14`, color: def.accent }}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-[14.5px] font-bold leading-tight tracking-tight">
              <Link href={href} className="trade-strategy-title">{def.name}</Link>
            </h4>
            <p className="text-[10.5px] mt-1 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              {def.category}
            </p>
          </div>
          {active && (
            <span className="trade-badge trade-badge-green"><span className="trade-dot" />Live</span>
          )}
        </div>

        {/* Live signal — card ka asli content */}
        <div className="trade-signal-box mt-3.5" data-tone={tone}>
          {loading ? (
            <div className="shimmer rounded h-[13px] w-3/4" />
          ) : signal ? (
            <>
              <p className="text-[12.5px] font-bold leading-snug" style={{ color: toneColor(tone) }}>
                {signal.headline}
              </p>
              {signal.readouts.length > 0 && (
                <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2">
                  {signal.readouts.slice(0, 3).map((r) => (
                    <span key={r.label} className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                      {r.label}{" "}
                      <b style={{ color: r.color ?? "var(--text-secondary)" }}>{r.value}</b>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Signal ke liye data nahi mila</p>
          )}
        </div>

        {/* Params — progressive disclosure ke peeche */}
        {tuneOpen && (
          <div className="grid grid-cols-2 gap-3 mt-3.5 pt-3.5" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
            {cardFields(def).map((field) => (
              <CardField key={field.key} def={def} field={field} values={values} onChange={(v) => onField(field.key, v)} />
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3.5 pt-3.5" style={{ borderTop: "1px solid var(--tr-line-soft)" }}>
          <Link href={href} className="trade-btn trade-btn-primary flex-1">
            Open
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onToggleTune}
            aria-expanded={tuneOpen}
            aria-label={`${def.name} ke parameters ${tuneOpen ? "chhupao" : "kholo"}`}
            className="trade-btn trade-btn-ghost trade-icon-only"
            data-on={tuneOpen}
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
          {def.backtestable !== false && (
            <button type="button" disabled={running} className="trade-btn trade-btn-ghost" onClick={onTest}>
              {running ? "…" : "Backtest"}
            </button>
          )}
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
