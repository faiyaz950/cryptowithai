"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import type { BacktestParams, Candle } from "@/lib/cryptoApi";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS, MAX_CHART_CANDLES, fetchCandles, symbolLabel, syncStamp } from "@/lib/cryptoApi";
import {
  STRATEGIES,
  STRATEGIES_CHANGED_EVENT,
  readActiveStrategies,
  strategyHref,
  type SignalTone,
  type StrategyDef,
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
/**
 * Trend Rider jaisi strategies ko replay ke liye lambi history chahiye — kam candles par card
 * strategy page aur bot se alag trade dikhata. Ek fetch sab cards ke kaam aata hai.
 */
const HISTORY_BARS = Math.min(MAX_CHART_CANDLES, Math.max(CARD_BARS, ...STRATEGIES.map((d) => d.minHistoryBars ?? 0)));

/** Card kis timeframe par chale — Trend Rider jaisi apne research timeframe par hi, scanner chahe kuch bhi ho. */
function cardTimeframe(def: StrategyDef, interval: string): string {
  return def.fixedTimeframe ?? interval;
}

interface CardSeries {
  candles: Candle[];
  /** Pro jaisi strategies ke liye — alt coin par BTC ki candles. */
  btc: Candle[];
}

/** Options strategies alag family hain — unka backtest asli option data par alag engine se. */
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

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtWhen(t: number): string {
  const ms = t > 1e12 ? t : t * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Price path of the scan. Not a profit curve. */
function PricePath({ id, candles, accent, pending }: { id: string; candles: Candle[]; accent: string; pending: boolean }) {
  const closes = candles.map((c) => c.close).filter((n) => Number.isFinite(n));
  if (closes.length < 2) {
    return (
      <div className="prem-chart prem-chart-empty">
        {pending ? "Candles aa rahe hain" : "Candles ke bina signal nahi banta"}
      </div>
    );
  }
  const step = Math.max(1, Math.ceil(closes.length / 72));
  const sampled = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const w = 320;
  const h = 108;
  const pts = sampled.map((v, i) => {
    const x = (i / (sampled.length - 1)) * w;
    const y = 10 + (1 - (v - min) / (max - min || 1)) * (h - 20);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];
  const gid = `prem-fill-${id.replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <div className="prem-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Price path">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="3.2" fill={accent} />
      </svg>
      <div className="prem-axis">
        <span>{fmtWhen(candles[0].time)}</span>
        <span>{fmtWhen(candles[candles.length - 1].time)}</span>
      </div>
    </div>
  );
}

export default function StrategyCards({ defaultSymbol }: Props) {
  const [values, setValues] = useState<Record<string, StrategyValues>>(() =>
    Object.fromEntries(STRATEGIES.map((def) => [def.id, { ...def.defaults, symbol: defaultSymbol }])),
  );
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"all" | "spot" | "options">("all");
  const [query, setQuery] = useState("");

  const router = useRouter();
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setIntervalValue] = useState("1h");
  const [series, setSeries] = useState<Record<string, CardSeries>>({});
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
      // Har zaroori timeframe ek hi baar — scanner wala, aur strategies ke apne fixed wale.
      const tfs = [...new Set(STRATEGIES.map((d) => cardTimeframe(d, interval)))];
      const isBtc = symbol.toUpperCase().startsWith("BTC");
      const loaded = await Promise.all(
        tfs.map(async (tf) => {
          // Pro alt coin ka signal BTC ke regime se pakka karta hai — BTC bhi saath.
          const wantBtc = !isBtc && STRATEGIES.some((d) => d.needsBtc && cardTimeframe(d, interval) === tf);
          const [res, btcRes] = await Promise.all([
            fetchCandles({ symbol, interval: tf, limit: HISTORY_BARS }),
            wantBtc ? fetchCandles({ symbol: "BTCUSDT", interval: tf, limit: HISTORY_BARS }) : Promise.resolve(null),
          ]);
          const set: CardSeries = {
            candles: res.success ? res.candles ?? [] : [],
            btc: btcRes?.success ? btcRes.candles ?? [] : [],
          };
          return [tf, set] as const;
        }),
      );
      setSeries(Object.fromEntries(loaded));
      setScannedAt(syncStamp());
    } catch {
      setSeries({});
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  const candles = series[interval]?.candles ?? [];

  // Signals sab ek pass mein — strategy page wahi analyze() chalata hai.
  const signals = useMemo(() => {
    if (!candles.length) return {} as Record<string, ReturnType<StrategyDef["analyze"]>["signal"]>;
    return Object.fromEntries(
      STRATEGIES.map((def) => {
        const tf = cardTimeframe(def, interval);
        const set = series[tf];
        const merged = { ...values[def.id], symbol, timeframe: tf };
        return [def.id, def.analyze(set?.candles ?? [], merged, { btc: set?.btc }).signal];
      }),
    );
  }, [candles.length, series, values, symbol, interval]);

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const toneRank = (id: string) => {
      const signal = signals[id];
      if (signal?.tone === "buy" || signal?.entry) return 0;
      if (signal?.tone === "sell") return 1;
      return 2;
    };
    return STRATEGIES.filter((def) => {
      if (view === "options") return isOptions(def);
      if (view === "spot") return !isOptions(def);
      return true;
    })
      .filter((def) => !q || `${def.name} ${def.category} ${def.blurb}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const byTone = toneRank(a.id) - toneRank(b.id);
        if (byTone) return byTone;
        if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [query, signals, view]);

  return (
    <div className="strat-rank">
      <div className="trade-page-head">
        <div className="trade-page-copy">
          <h2 className="trade-page-title">Strategies</h2>
          <p className="trade-page-line">Ready strategies. Card kholo, backtest karo, phir paper par chalao.</p>
        </div>
        <Link href="/trade?tab=builder" className="prem-link">Build your own</Link>
      </div>

      <div className="strat-views" role="tablist" aria-label="Strategy views">
        {([
          ["all", "All"],
          ["spot", "Futures & spot"],
          ["options", "Options"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className="strat-view"
            data-active={view === id}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="trade-panel">
        <div className="trade-toolbar">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol" className="trade-select trade-w-symbol trade-size-sm trade-strong">
            {CRYPTO_SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} aria-label="Timeframe" className="trade-select trade-w-history trade-size-sm">
            {CRYPTO_INTERVALS.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
          </select>
          <label className="strat-search">
            <Search className="w-3.5 h-3.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search strategies"
              aria-label="Search strategies"
              className="trade-input trade-size-sm"
            />
          </label>
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

      {ranked.length === 0 ? (
        <p className="strat-empty prem-empty">Is view mein koi strategy nahi.</p>
      ) : (
        <div className="prem-grid">
          {ranked.map((def) => {
            const tf = cardTimeframe(def, interval);
            const tuned = { ...values[def.id], symbol, timeframe: tf };
            const href = strategyHref(def, tuned);
            const signal = signals[def.id];
            const path = series[tf]?.candles ?? [];
            const noData = !loading && path.length < 2;
            const tone = noData ? "neutral" : signal?.tone ?? "neutral";
            const status = active[def.id] ? "Live" : loading && !signal ? "…" : noData ? "Data nahi mila" : toneLabel(tone);
            const { label: category, pro } = splitCategory(def.category);
            const first = path[0]?.close;
            const last = path[path.length - 1]?.close;
            const change = first && last ? ((last - first) / first) * 100 : null;
            const hi = path.length ? Math.max(...path.map((c) => c.high)) : null;
            const lo = path.length ? Math.min(...path.map((c) => c.low)) : null;
            const tfLabel = CRYPTO_INTERVALS.find((iv) => iv.value === tf)?.label ?? tf;
            const Icon = def.icon;
            return (
              <article
                key={def.id}
                className="prem-card"
                style={accentVars(def.accent)}
                data-tone={tone}
                data-featured={def.featured ? "true" : "false"}
                data-live={active[def.id] ? "true" : "false"}
                onClick={() => router.push(href)}
              >
                <div className="prem-head">
                  <span className="prem-mark" aria-hidden>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="prem-title">
                    <h3>
                      <Link href={href} className="strat-name" onClick={(e) => e.stopPropagation()}>{def.name}</Link>
                    </h3>
                    <p className="prem-kicker">
                      {category}
                      <span>·</span>
                      {symbolLabel(symbol)}
                      <span>·</span>
                      {tfLabel}
                      {pro && <><span>·</span>Pro</>}
                    </p>
                  </div>
                  <span className="prem-status">
                    <i />
                    {status}
                  </span>
                </div>
                <p className="prem-blurb">{noData ? def.blurb : signal?.headline || def.blurb}</p>
                <PricePath id={def.id} candles={path} accent={def.accent} pending={loading} />
                {change != null && last != null && hi != null && lo != null && (
                  <div className="prem-stats">
                    <div className="prem-stat" data-up={change >= 0}>
                      <b>{`${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</b>
                      <span>Window</span>
                    </div>
                    <div className="prem-stat">
                      <b>{fmtPx(last)}</b>
                      <span>Last</span>
                    </div>
                    <div className="prem-stat">
                      <b>{fmtPx(hi)}</b>
                      <span>High</span>
                    </div>
                    <div className="prem-stat">
                      <b>{fmtPx(lo)}</b>
                      <span>Low</span>
                    </div>
                  </div>
                )}
                <div className="prem-foot">
                  <p className="prem-hint">Pehle details, phir paper.</p>
                  <Link href={href} className="prem-link" onClick={(e) => e.stopPropagation()}>
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="strat-note">
        {candles.length
          ? `Buy pehle, phir sell, phir wait. Rank is ${symbolLabel(symbol)} ki is scan par.`
          : loading
            ? "Candles aa rahe hain. Signal uske baad aata hai."
            : "Candles ke bina signal nahi banta. Backend chalao, phir Refresh."}
      </p>
    </div>
  );
}
