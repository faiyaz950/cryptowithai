"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Sliders, TrendingDown, TrendingUp, Wand2 } from "lucide-react";
import type { BacktestParams, Candle } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, fetchCandles, symbolLabel, syncStamp } from "@/lib/cryptoApi";
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

/** Tone sirf rang se nahi — shabd se bhi, taaki colour-blind par bhi padha jaye. */
function toneLabel(tone: SignalTone): string {
  return tone === "buy" ? "Buy" : tone === "sell" ? "Sell" : "Wait";
}

/** "Options · debit · pro" -> "Options · debit" + alag "Pro" tag. */
function splitCategory(category: string): { label: string; pro: boolean } {
  const parts = category.split("·").map((p) => p.trim());
  const pro = parts.at(-1)?.toLowerCase() === "pro";
  return { label: (pro ? parts.slice(0, -1) : parts).join(" · "), pro };
}

/**
 * Har strategy apna accent leke aati hai (blue, amber, violet, cyan, teal).
 * Wahi card ki identity banta hai — pehle sab cards ek jaise green the.
 */
function accentVars(accent: string): React.CSSProperties {
  return {
    ["--sa" as string]: accent,
    ["--sa-soft" as string]: `${accent}1f`,
    ["--sa-line" as string]: `${accent}44`,
  };
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
      setScannedAt(syncStamp());
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
    { title: "Futures & spot", hint: "Perp / coin price — inka backtest chalta hai · pro setups featured", defs: STRATEGIES.filter((d) => !isOptions(d)) },
    { title: "Options", hint: "OTM, debit, condor — live signal + strike / legs selection", defs: STRATEGIES.filter(isOptions) },
  ];

  return (
    <div className="space-y-5">
      <div className="trade-promo">
        <span className="trade-promo-mark" aria-hidden>
          <Wand2 className="w-[18px] h-[18px]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold tracking-tight">Apni custom strategy banana chahte ho?</div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            No-code Strategy Builder — indicators, risk, aur deploy ek jagah
          </p>
        </div>
        <Link href="/trade?tab=builder" className="trade-btn trade-promo-btn">
          Open builder
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Ready-made</div>
          <h2 className="trade-page-title">Strategy catalogue</h2>
          <p className="trade-page-sub">
            Har strategy abhi kya keh rahi hai — live signal, tune, aur backtest.
          </p>
        </div>
        <div className="trade-page-actions">
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
      </div>

      <div className="trade-panel">
        <div className="trade-toolbar">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol" className="trade-select trade-w-symbol trade-size-sm trade-strong">
            {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} aria-label="Timeframe" className="trade-select trade-w-history trade-size-sm">
            {CRYPTO_INTERVALS.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
          </select>
          <div className="flex-1 min-w-[8px]" />
          {scannedAt && (
            <span className="trade-toolbar-meta">
              {symbolLabel(symbol)} · {candles.length} candles · {scannedAt}
            </span>
          )}
          <button type="button" onClick={() => void loadCandles()} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── Grouped cards ─────────────────────────────────── */}
      {groups.map((group) => (
        <section key={group.title}>
          <div className="strat-section">
            <h3 className="strat-section-title">{group.title}</h3>
            <span className="trade-count-chip">{group.defs.length}</span>
            <span className="strat-section-rule" aria-hidden />
            <span className="strat-section-hint hidden lg:inline">{group.hint}</span>
          </div>

          <div className="strat-grid">
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
  const { label: category, pro } = splitCategory(def.category);

  // Card ke khaali hisse par click = strategy page. Controls apna kaam karte rahein.
  const openFromCard = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, select, button, a, label")) return;
    router.push(href);
  };

  return (
    <article
      className="strat-card"
      data-active={active}
      data-tone={tone}
      style={accentVars(def.accent)}
      onClick={openFromCard}
    >
      <div className="strat-head">
        <span className="strat-icon" aria-hidden>
          <Icon className="w-[17px] h-[17px]" />
        </span>

        <div className="min-w-0 flex-1">
          <h4>
            <Link href={href} className="strat-name">{def.name}</Link>
          </h4>
          <div className="strat-meta">
            <span className="strat-cat">{category}</span>
            {pro && <span className="strat-tag">Pro</span>}
            {active && (
              <span className="trade-badge trade-badge-green"><span className="trade-dot" />Live</span>
            )}
          </div>
        </div>

        {!loading && signal && (
          <span className="strat-verdict">{toneLabel(tone)}</span>
        )}
      </div>

      {/* Live signal — card ka asli content */}
      <div className="strat-signal">
        {loading ? (
          <div className="shimmer rounded h-[13px] w-3/4 mt-1" />
        ) : signal ? (
          <p className="strat-headline">{signal.headline}</p>
        ) : (
          <p className="strat-headline" style={{ color: "var(--text-muted)" }}>
            Signal ke liye data nahi mila
          </p>
        )}
      </div>

      {!loading && signal && signal.readouts.length > 0 && (
        <div className="strat-reads">
          {signal.readouts.slice(0, 3).map((r) => (
            <div key={r.label} className="strat-read">
              <div className="strat-read-label" title={r.label}>{r.label}</div>
              <div className="strat-read-value" style={{ color: r.color }} title={r.value}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Params — progressive disclosure ke peeche */}
      {tuneOpen && (
        <div className="strat-params">
          {cardFields(def).map((field) => (
            <CardField key={field.key} def={def} field={field} values={values} onChange={(v) => onField(field.key, v)} />
          ))}
        </div>
      )}

      <div className="flex-1" />

      <div className="strat-actions">
        <Link href={href} className="trade-btn trade-btn-quiet strat-open flex-1">
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
