"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  CRYPTO_INTERVALS,
  CRYPTO_SYMBOLS,
  fetchScreener,
  symbolLabel,
  type Candle,
} from "@/lib/cryptoApi";
import { buildAiPrompt, scoreSymbol, sortRows, type Bias, type ScreenerRow, type SortKey } from "@/lib/screener";
import { STRATEGIES } from "@/lib/strategies";

interface Props {
  /** Terminal ka chuna hua timeframe — screener wahi se shuru hota hai. */
  defaultInterval: string;
  /** Coin par click karne se Markets tab us symbol par khul jaye. */
  onPickSymbol: (symbol: string) => void;
}

const BARS = 150;

const BIAS_FILTERS: { id: Bias | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bullish", label: "Bullish" },
  { id: "bearish", label: "Bearish" },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "strength", label: "Signal strength" },
  { id: "votes", label: "Strategy agreement" },
  { id: "change24h", label: "24h change" },
  { id: "symbol", label: "Name" },
];

function biasColor(bias: Bias): string {
  return bias === "bullish" ? "var(--green)" : bias === "bearish" ? "var(--red)" : "var(--text-muted)";
}

function fmtPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(6);
}

function fmtPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export default function Screener({ defaultInterval, onPickSymbol }: Props) {
  const router = useRouter();
  const [interval, setInterval] = useState(defaultInterval);
  const [bias, setBias] = useState<Bias | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("strength");
  const [query, setQuery] = useState("");

  const [data, setData] = useState<{ symbol: string; candles: Candle[] }[]>([]);
  const [failed, setFailed] = useState<{ symbol: string; error: string }[]>([]);
  const [scannedInterval, setScannedInterval] = useState(defaultInterval);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchScreener({
        symbols: CRYPTO_SYMBOLS.map((s) => s.value),
        interval,
        limit: BARS,
      });
      if (!res.success) throw new Error(res.error || "Screener scan fail");
      setData(res.results ?? []);
      setFailed(res.failed ?? []);
      setScannedInterval(res.interval || interval);
      setScannedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crypto backend connect nahi ho raha (port 2000)");
      setData([]);
      setFailed([]);
    } finally {
      setLoading(false);
    }
  }, [interval]);

  useEffect(() => {
    void scan();
  }, [scan]);

  // Signals browser mein nikalte hain — 30 coins x 5 strategies, ek pass mein.
  const rows = useMemo(() => {
    const scored = data
      .map((item) => scoreSymbol(item.symbol, item.candles, scannedInterval))
      .filter((row): row is ScreenerRow => row !== null);
    return sortRows(scored, sortKey);
  }, [data, scannedInterval, sortKey]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    return rows.filter((row) => {
      if (bias !== "all" && row.bias !== bias) return false;
      if (q && !row.symbol.includes(q)) return false;
      return true;
    });
  }, [rows, bias, query]);

  const bullCount = rows.filter((r) => r.bias === "bullish").length;
  const bearCount = rows.filter((r) => r.bias === "bearish").length;

  const askAi = () => {
    sessionStorage.setItem("arjunai_portfolio_prompt", buildAiPrompt(rows, scannedInterval));
    router.push("/");
  };

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">AI Coin Screener</h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Saare coins par paanchon strategies ek saath chalti hain — jo bullish ya bearish align hain wo upar aate hain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="trade-badge trade-badge-green">{bullCount} bullish</span>
          <span className="trade-badge trade-badge-red">{bearCount} bearish</span>
          <button type="button" onClick={askAi} disabled={rows.length === 0} className="trade-btn trade-btn-primary">
            <Sparkles className="w-4 h-4" />
            Ask AI
          </button>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────── */}
      <div className="trade-panel">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3">
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Timeframe
            <select value={interval} onChange={(e) => setInterval(e.target.value)} className="trade-select trade-w-history trade-size-sm">
              {CRYPTO_INTERVALS.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
            </select>
          </label>

          <div className="trade-seg">
            {BIAS_FILTERS.map((f) => (
              <button key={f.id} type="button" data-active={bias === f.id} onClick={() => setBias(f.id)} className="trade-seg-btn">
                {f.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Sort
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="trade-select trade-w-sort trade-size-sm">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>

          <div className="trade-search">
            <Search className="w-3.5 h-3.5 flex-none" style={{ color: "var(--text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Coin dhoondho"
              aria-label="Coin search"
              className="trade-search-input"
            />
          </div>

          <div className="flex-1" />

          {scannedAt && (
            <span className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
              Scanned {scannedAt} · {rows.length} coins
            </span>
          )}
          <button type="button" onClick={() => void scan()} disabled={loading} className="trade-btn trade-btn-ghost trade-size-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            {loading ? "Scanning" : "Rescan"}
          </button>
        </div>

        {error && (
          <p className="flex items-start gap-2 px-4 py-2.5 text-[12.5px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
            <AlertCircle className="w-4 h-4 mt-px flex-none" />
            {error}
          </p>
        )}
        {failed.length > 0 && (
          <p className="px-4 py-2.5 text-[11.5px]" style={{ color: "var(--amber)", borderTop: "1px solid var(--tr-line-soft)" }}>
            {failed.length} coin ka data nahi mila: {failed.map((f) => f.symbol).join(", ")}
          </p>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────── */}
      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer rounded-xl h-[46px]" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="trade-panel">
          <div className="trade-empty trade-empty-lg">
            <span className="trade-empty-icon trade-empty-icon-lg"><Search className="w-5 h-5" /></span>
            <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
              Is filter par koi coin nahi mila
            </p>
            <p className="max-w-[320px]">Bias filter badlo ya doosra timeframe chuno.</p>
          </div>
        </div>
      ) : (
        <div className="trade-panel overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Bias</th>
                  <th className="trade-num">Strength</th>
                  <th className="trade-num">Agree</th>
                  <th>Strategies</th>
                  <th className="trade-num">Price</th>
                  <th className="trade-num">24h</th>
                  <th className="trade-num">Trend</th>
                  <th className="trade-num">RSI</th>
                  <th className="trade-num">MACD</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const color = biasColor(row.bias);
                  const Icon = row.bias === "bearish" ? TrendingDown : TrendingUp;
                  return (
                    <tr key={row.symbol}>
                      <td>
                        <button type="button" onClick={() => onPickSymbol(row.symbol)} className="trade-linkish" title="Markets tab mein kholo">
                          {symbolLabel(row.symbol)}
                        </button>
                      </td>
                      <td>
                        <span
                          className={`trade-badge ${row.bias === "bullish" ? "trade-badge-green" : row.bias === "bearish" ? "trade-badge-red" : "trade-badge-neutral"}`}
                        >
                          {row.bias !== "neutral" && <Icon className="w-3 h-3" />}
                          {row.bias}
                        </span>
                      </td>
                      <td className="trade-num">
                        <div className="flex items-center justify-end gap-2">
                          <span className="trade-meter" aria-hidden>
                            <span style={{ width: `${row.strength}%`, background: color }} />
                          </span>
                          <span className="font-bold tnum" style={{ minWidth: 22 }}>{row.strength}</span>
                        </div>
                      </td>
                      <td className="trade-num tnum" style={{ color }}>
                        {row.votes > 0 ? "+" : ""}{row.votes}
                        <span style={{ color: "var(--text-muted)" }}>/{row.signals.length}</span>
                      </td>
                      <td>
                        <span className="flex items-center gap-1">
                          {row.signals.map((sig) => (
                            <span
                              key={sig.id}
                              className="trade-vote"
                              title={`${sig.name}: ${sig.headline}`}
                              style={{ background: sig.tone === "buy" ? "var(--green)" : sig.tone === "sell" ? "var(--red)" : "var(--tr-line)" }}
                            />
                          ))}
                        </span>
                      </td>
                      <td className="trade-num tnum">{fmtPrice(row.price)}</td>
                      <td className="trade-num tnum" style={{ color: (row.change24h ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                        {fmtPct(row.change24h)}
                      </td>
                      <td className="trade-num tnum" style={{ color: (row.trendPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                        {fmtPct(row.trendPct)}
                      </td>
                      <td className="trade-num tnum">{row.rsi == null ? "—" : row.rsi.toFixed(0)}</td>
                      <td className="trade-num tnum" style={{ color: (row.macdPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                        {fmtPct(row.macdPct)}
                      </td>
                      <td>
                        <Link
                          href={`/trade/strategies/${bestStrategyFor(row)}?symbol=${row.symbol}&timeframe=${scannedInterval}`}
                          className="trade-btn trade-btn-ghost trade-size-sm"
                        >
                          Run
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <b>Strength</b> = strategy agreement (40%) + EMA trend (25%) + MACD momentum (20%) + RSI extreme (15%).
        Signals wahi hain jo har strategy ke apne page par dikhte hain — screener sirf unhe ek saath chalata hai.
        Ye analysis hai, trading advice nahi.
      </p>
    </div>
  );
}

/** "Run" button us strategy par le jata hai jo is coin par abhi signal de rahi hai. */
function bestStrategyFor(row: ScreenerRow): string {
  const dominant = row.bias === "bearish" ? "sell" : "buy";
  const match = row.signals.find((s) => s.tone === dominant);
  return match?.id ?? STRATEGIES[0].id;
}
