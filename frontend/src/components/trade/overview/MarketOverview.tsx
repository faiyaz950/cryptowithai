"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bitcoin,
  CircleDot,
  Flame,
  Gauge,
  Grid3x3,
  Info,
  Layers,
  Waves,
} from "lucide-react";
import { fetchScreener, type MarketTicker } from "@/lib/cryptoApi";
import { rsi } from "@/lib/indicators";
import {
  HEAT_SPAN_PCT,
  altZone,
  buildSectors,
  fearLabel,
  fetchOverviewMeta,
  fmtPct,
  fmtPrice,
  fmtUsdCompact,
  fmtUsdLarge,
  heatRgb,
  rgbCss,
  rsiZone,
  shadeRgb,
  squarify,
  summarizeCoins,
  tickersToCoins,
  type OverviewCoin,
  type OverviewMeta,
  type OverviewSector,
} from "@/lib/marketOverview";
import BubbleMap from "./BubbleMap";
import "./overview.css";

async function fetchOverviewTickers(): Promise<MarketTicker[]> {
  const res = await fetch("/api/overview/tickers", { signal: AbortSignal.timeout(12000) });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    tickers?: MarketTicker[];
    error?: string;
  };
  if (!res.ok || !data.success || !data.tickers?.length) {
    throw new Error(data.error || "Could not load market data");
  }
  return data.tickers;
}

/** Top pairs ka mean 1h RSI(14). Screener offline ho to null — RSI secondary hai. */
async function averageRsi(symbols: string[]): Promise<number | null> {
  if (!symbols.length) return null;
  try {
    const res = await fetchScreener({ symbols, interval: "1h", limit: 80 });
    if (!res.success) return null;
    const values: number[] = [];
    for (const row of res.results ?? []) {
      const closes = row.candles.map((c) => c.close).filter((n) => Number.isFinite(n));
      const last = rsi(closes, 14).at(-1);
      if (last != null && Number.isFinite(last)) values.push(last);
    }
    return values.length ? values.reduce((s, n) => s + n, 0) / values.length : null;
  } catch {
    return null;
  }
}

const REFRESH_MS = 20_000;
const TAPE_COUNT = 24;
const ALT_SAMPLE = 50;

type LiveState = "live" | "delayed" | "stale" | "waiting";
type BubbleTop = 100 | 200 | 250;
type HeatTop = 30 | 60;

const terminalHref = (symbol: string) => `/trade?tab=markets&symbol=${encodeURIComponent(symbol)}`;

export default function MarketOverview() {
  const [coins, setCoins] = useState<OverviewCoin[]>([]);
  const [meta, setMeta] = useState<OverviewMeta | null>(null);
  const [avgRsi, setAvgRsi] = useState<number | null>(null);
  const [rsiState, setRsiState] = useState<"loading" | "ok" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fngMode, setFngMode] = useState<"now" | "prev">("now");
  const [heatTop, setHeatTop] = useState<HeatTop>(30);
  const [bubbleTop, setBubbleTop] = useState<BubbleTop>(100);

  useEffect(() => {
    let alive = true;
    const pullTickers = () => {
      fetchOverviewTickers()
        .then((tickers) => {
          if (!alive) return;
          setCoins(tickersToCoins(tickers));
          setUpdatedAt(Date.now());
          setError(null);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "Could not load market data");
        });
    };
    const pullMeta = () => {
      fetchOverviewMeta()
        .then((m) => {
          if (alive) setMeta(m);
        })
        .catch(() => {
          /* optional feed — KPIs tickers se bhi chal jaate hain */
        });
    };
    pullTickers();
    pullMeta();
    const t = window.setInterval(pullTickers, REFRESH_MS);
    const m = window.setInterval(pullMeta, 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.clearInterval(m);
      window.clearInterval(clock);
    };
  }, []);

  const hasCoins = coins.length > 0;
  useEffect(() => {
    if (!hasCoins) return;
    let alive = true;
    averageRsi(coins.slice(0, 40).map((c) => c.symbol)).then((value) => {
      if (!alive) return;
      setAvgRsi(value);
      setRsiState(value == null ? "offline" : "ok");
    });
    return () => {
      alive = false;
    };
  }, [hasCoins]); // eslint-disable-line react-hooks/exhaustive-deps -- universe aate hi ek baar

  const stats = useMemo(() => summarizeCoins(coins), [coins]);
  const sectors = useMemo(() => buildSectors(coins), [coins]);
  const alt = useMemo(() => altSeason(coins), [coins]);
  const volumeLeaders = useMemo(() => coins.slice(0, 5), [coins]);

  const liveState: LiveState = !updatedAt
    ? "waiting"
    : now - updatedAt < 45_000
      ? "live"
      : now - updatedAt < 120_000
        ? "delayed"
        : "stale";

  const loading = !hasCoins && !error;
  const fear = fngMode === "prev" ? meta?.fearGreedPrev : meta?.fearGreed;
  const fearValue = fear?.value ?? null;
  const fearText = fearValue != null ? fear?.classification || fearLabel(fearValue) : "Unavailable";
  const fearDelta =
    meta?.fearGreed && meta?.fearGreedPrev ? meta.fearGreed.value - meta.fearGreedPrev.value : null;

  return (
    <div className="mo-page">
      <TickerTape
        coins={coins.slice(0, TAPE_COUNT)}
        liveState={liveState}
        tracked={stats.tracked}
        age={updatedAt ? formatAge(now - updatedAt) : null}
      />

      {error && (
        <div className="mo-alert" role="status">
          <span className="mo-alert-dot" aria-hidden />
          {hasCoins ? `Feed hiccup — showing last snapshot. (${error})` : error}
        </div>
      )}

      {/* ── Hero: market pulse ─────────────────────────────── */}
      <section className="mo-card mo-hero" aria-label="Market pulse">
        <div className="mo-hero-main">
          <div className="mo-hero-top">
            <div>
              <Eyebrow icon={<Layers />}>Total crypto market cap</Eyebrow>
              <div className="mo-hero-value-row">
                {meta ? (
                  <span className="mo-hero-value">{fmtUsdLarge(meta.marketCapUsd)}</span>
                ) : (
                  <span className="mo-skel" style={{ width: 200, height: 44 }} />
                )}
                {meta?.marketCapChange24h != null && (
                  <DeltaPill value={meta.marketCapChange24h} suffix="24H" />
                )}
              </div>
              <p className="mo-hero-sub">
                {meta?.activeCryptos != null && (
                  <>
                    <strong>{meta.activeCryptos.toLocaleString("en-US")}</strong> assets listed
                    <span className="mo-sep" aria-hidden>/</span>
                  </>
                )}
                BTC dominance{" "}
                <strong>{meta?.btcDominance != null ? `${meta.btcDominance.toFixed(1)}%` : "—"}</strong>
              </p>
            </div>
          </div>
          <TrendChart values={meta?.marketCapSpark ?? []} title="BTC / USD" windowLabel="48H" />
        </div>

        <div className="mo-hero-side">
          <div className="mo-stat-grid">
            <Stat
              label="24H volume"
              value={hasCoins ? fmtUsdLarge(stats.volumeUsd) : null}
              sub={`${stats.tracked || "—"} USDT pairs`}
            />
            <Stat
              label="Avg 24H move"
              value={hasCoins ? fmtPct(stats.avgChange) : null}
              tone={toneAttr(stats.avgChange)}
              sub="equal-weight mean"
            />
            <Stat
              label="BTC dominance"
              value={meta?.btcDominance != null ? `${meta.btcDominance.toFixed(1)}%` : meta ? "—" : null}
              sub="share of total cap"
              meter={meta?.btcDominance ?? null}
            />
            <Stat
              label="Advance / decline"
              value={hasCoins ? (stats.down ? (stats.up / stats.down).toFixed(2) : "∞") : null}
              sub={stats.up >= stats.down ? "buyers in control" : "sellers in control"}
              tone={hasCoins ? (stats.up >= stats.down ? "up" : "down") : undefined}
            />
          </div>
          <Breadth up={stats.up} flat={stats.flat} down={stats.down} loading={loading} />
        </div>
      </section>

      {/* ── Sentiment instruments ─────────────────────────── */}
      <div className="mo-grid-3">
        <section className="mo-card mo-panel mo-instrument" aria-label="Fear and greed index">
          <PanelHead
            icon={<Gauge />}
            title="Fear & Greed"
            right={
              <Segmented
                label="Fear and greed reading"
                value={fngMode}
                onChange={setFngMode}
                options={[
                  { value: "now", label: "Now" },
                  { value: "prev", label: "Yesterday" },
                ]}
              />
            }
          />
          <FearGauge value={fearValue} label={fearText} />
          <p className="mo-foot">
            {fearDelta == null ? (
              "alternative.me · daily"
            ) : (
              <>
                <span className={toneClass(fearDelta)}>
                  {fearDelta > 0 ? "+" : ""}
                  {fearDelta} pts
                </span>{" "}
                vs yesterday · alternative.me
              </>
            )}
          </p>
        </section>

        <section className="mo-card mo-panel mo-instrument" aria-label="Average RSI">
          <PanelHead
            icon={<Activity />}
            title="Average RSI"
            right={
              avgRsi != null ? (
                <span className="mo-chip" data-tone={avgRsi >= 70 ? "down" : avgRsi <= 30 ? "up" : undefined}>
                  {rsiZone(avgRsi)}
                </span>
              ) : rsiState === "offline" ? (
                <span className="mo-chip" data-tone="warn">OFFLINE</span>
              ) : null
            }
          />
          <div className="mo-inst-value">
            {avgRsi != null ? (
              avgRsi.toFixed(1)
            ) : rsiState === "loading" ? (
              <span className="mo-skel" style={{ width: 96, height: 36 }} />
            ) : (
              <span className="mo-inst-na">No data</span>
            )}
            <span className="mo-inst-unit">RSI 14 · 1H</span>
          </div>
          <ZoneMeter
            value={avgRsi}
            ariaLabel={avgRsi != null ? `Average RSI ${avgRsi.toFixed(1)}` : "Average RSI unavailable"}
            zones={[
              { from: 0, to: 30, color: "var(--green)", label: "Oversold" },
              { from: 30, to: 70, color: "#6f6b67", label: "Neutral" },
              { from: 70, to: 100, color: "var(--red)", label: "Overbought" },
            ]}
            ticks={[
              { at: 0, label: "0" },
              { at: 30, label: "30" },
              { at: 70, label: "70" },
              { at: 100, label: "100" },
            ]}
          />
          <p className="mo-foot">
            {rsiState === "offline" ? "Screener feed offline — RSI sample unavailable" : "Mean of top-40 pairs by volume"}
          </p>
        </section>

        <section className="mo-card mo-panel mo-instrument" aria-label="Altcoin season index">
          <PanelHead
            icon={<Bitcoin />}
            title="Altcoin season"
            right={
              alt ? (
                <span className="mo-chip" data-tone={alt.index >= 75 ? "alt" : alt.index <= 25 ? "btc" : undefined}>
                  {altZone(alt.index)}
                </span>
              ) : null
            }
          />
          <div className="mo-inst-value">
            {alt ? alt.index.toFixed(0) : loading ? <span className="mo-skel" style={{ width: 80, height: 36 }} /> : "—"}
            <span className="mo-inst-unit">/ 100</span>
          </div>
          <ZoneMeter
            value={alt?.index ?? null}
            ariaLabel={alt ? `Altcoin season index ${alt.index.toFixed(0)}` : "Altcoin season index unavailable"}
            zones={[
              { from: 0, to: 25, color: "#f7931a", label: "Bitcoin season" },
              { from: 25, to: 75, color: "#6f6b67", label: "Neutral" },
              { from: 75, to: 100, color: "#8b7cf6", label: "Altcoin season" },
            ]}
            ticks={[
              { at: 0, label: "BTC season" },
              { at: 50, label: "50" },
              { at: 100, label: "Alt season" },
            ]}
          />
          <p className="mo-foot">
            {alt ? (
              <>
                <strong>{alt.beat}</strong> of {alt.sample} top alts beat BTC ({fmtPct(alt.btcChange)}) · 24H
              </>
            ) : (
              "Share of top-50 alts outperforming BTC · 24H"
            )}
          </p>
        </section>
      </div>

      {/* ── Movers ─────────────────────────────────────────── */}
      <div className="mo-grid-movers">
        <MoverCard
          title="Top gainers"
          icon={<ArrowUpRight />}
          tone="up"
          coins={stats.gainers}
          mode="change"
          loading={loading}
          empty="No coin is green over 24H"
        />
        <MoverCard
          title="Top losers"
          icon={<ArrowDownRight />}
          tone="down"
          coins={stats.losers}
          mode="change"
          loading={loading}
          empty="No coin is red over 24H"
        />
        <MoverCard
          title="Most traded"
          icon={<Flame />}
          coins={volumeLeaders}
          mode="volume"
          loading={loading}
          empty="Waiting for volume data"
        />
      </div>

      {/* ── Heatmap ────────────────────────────────────────── */}
      <section className="mo-card mo-panel" aria-label="Market heatmap">
        <PanelHead
          icon={<Grid3x3 />}
          title="Market heatmap"
          sub="Area = 24H volume · colour = 24H change"
          right={
            <div className="mo-head-tools">
              <HeatLegend />
              <Segmented
                label="Heatmap universe"
                value={heatTop}
                onChange={setHeatTop}
                options={[
                  { value: 30, label: "Top 30" },
                  { value: 60, label: "Top 60" },
                ]}
              />
            </div>
          }
        />
        <HeatTreemap coins={coins.slice(0, heatTop)} loading={loading} />
      </section>

      {/* ── Sectors ───────────────────────────────────────── */}
      <section className="mo-card mo-panel" aria-label="Sector performance">
        <PanelHead
          icon={<BarChart3 />}
          title="Sectors · 24H"
          sub="Average change per sector"
          right={
            <Link href="/trade?tab=markets" className="mo-link">
              Open terminal <span aria-hidden>→</span>
            </Link>
          }
        />
        <SectorBars sectors={sectors} loading={loading} />
      </section>

      {/* ── Bubble map ────────────────────────────────────── */}
      <section className="mo-card mo-panel" aria-label="Bubble map">
        <PanelHead
          icon={<CircleDot />}
          title="Bubble map"
          info="Bubble size = 24H volume. Ring brightness = size of the 24H move. Bubbles drift live — hover to pause, click to open in the terminal."
          right={
            <div className="mo-head-tools">
              <div className="mo-bubble-legend" aria-hidden>
                <span>
                  <i data-tone="up" />
                  up
                </span>
                <span>
                  <i data-tone="down" />
                  down
                </span>
                <span className="mo-bubble-legend-note">· brighter = bigger move</span>
              </div>
              <span className="mo-window">
                Window <strong>24H</strong>
              </span>
              <span className="mo-coins-label">Coins</span>
              <Segmented
                label="Bubble universe"
                value={bubbleTop}
                onChange={setBubbleTop}
                options={[
                  { value: 100, label: "Top 100" },
                  { value: 200, label: "Top 200" },
                  { value: 250, label: "Top 250" },
                ]}
              />
            </div>
          }
        />
        <BubbleMap coins={coins.slice(0, bubbleTop)} loading={loading} />
      </section>
    </div>
  );
}

/* ═══════════════════════ Ticker tape ═══════════════════════ */

function TickerTape({
  coins,
  liveState,
  tracked,
  age,
}: {
  coins: OverviewCoin[];
  liveState: LiveState;
  tracked: number;
  age: string | null;
}) {
  const label =
    liveState === "waiting" ? "Connecting" : liveState === "live" ? "Live" : liveState === "delayed" ? "Delayed" : "Stale";
  // Loop seamless rahe isliye list do baar — doosri copy screen readers se chhupi.
  const duration = Math.max(30, coins.length * 3.2);
  return (
    <div className="mo-tape" data-state={liveState}>
      <div className="mo-tape-status">
        <span className="mo-pulse" aria-hidden />
        <strong>{label}</strong>
        <span>
          {tracked ? `${tracked} pairs` : "—"}
          {age ? ` · ${age}` : ""}
        </span>
      </div>
      <div className="mo-tape-track">
        {coins.length ? (
          <div className="mo-tape-rail" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <ul key={copy} className="mo-tape-list" aria-hidden={copy === 1 || undefined}>
                {coins.map((c) => (
                  <li key={c.symbol}>
                    <Link href={terminalHref(c.symbol)} tabIndex={copy === 1 ? -1 : undefined}>
                      <strong>{c.base}</strong>
                      <span className="mo-tape-price">{fmtPrice(c.price)}</span>
                      <span className={`mo-tape-chg ${toneClass(c.change24h)}`}>
                        {(c.change24h ?? 0) >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(c.change24h ?? 0))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ) : (
          <div className="mo-tape-empty">Waiting for market feed…</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ Hero pieces ═══════════════════════ */

function Stat({
  label,
  value,
  sub,
  tone,
  meter,
}: {
  label: string;
  value: string | null;
  sub?: ReactNode;
  tone?: "up" | "down";
  meter?: number | null;
}) {
  return (
    <div className="mo-stat">
      <div className="mo-stat-label">{label}</div>
      <div className="mo-stat-value" data-tone={tone}>
        {value ?? <span className="mo-skel" style={{ width: 90, height: 24 }} />}
      </div>
      {meter != null && (
        <div className="mo-stat-meter" aria-hidden>
          <i style={{ width: `${clamp(meter, 0, 100)}%` }} />
        </div>
      )}
      {sub != null && <div className="mo-stat-sub">{sub}</div>}
    </div>
  );
}

function Breadth({ up, flat, down, loading }: { up: number; flat: number; down: number; loading: boolean }) {
  const total = up + flat + down;
  const upPct = total ? (up / total) * 100 : 0;
  return (
    <div className="mo-breadth">
      <div className="mo-breadth-head">
        <span className="mo-stat-label">Market breadth · 24H</span>
        <span className="mo-breadth-pct">
          {total ? (
            <>
              <span className="mo-up">{upPct.toFixed(0)}%</span> advancing
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div
        className="mo-breadth-bar"
        role="img"
        aria-label={total ? `${up} advancing, ${flat} unchanged, ${down} declining` : "Breadth loading"}
        data-loading={loading ? "1" : undefined}
      >
        {total > 0 && (
          <>
            {up > 0 && <i className="is-up" style={{ flexGrow: up }} />}
            {flat > 0 && <i className="is-flat" style={{ flexGrow: flat }} />}
            {down > 0 && <i className="is-down" style={{ flexGrow: down }} />}
          </>
        )}
      </div>
      <div className="mo-breadth-legend">
        <span>
          <i className="is-up" aria-hidden />
          <strong>{up}</strong> up
        </span>
        <span>
          <i className="is-flat" aria-hidden />
          <strong>{flat}</strong> flat
        </span>
        <span>
          <i className="is-down" aria-hidden />
          <strong>{down}</strong> down
        </span>
      </div>
    </div>
  );
}

/** Area chart + crosshair. Series CoinGecko ka BTC price (last 48 hourly points) hai. */
function TrendChart({ values, title, windowLabel }: { values: number[]; title: string; windowLabel: string }) {
  const gid = useId().replace(/:/g, "");
  const plotRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * 100,
      y: 8 + (1 - (v - min) / span) * 84,
      v,
    }));
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L100 100 L0 100 Z`;
    const first = values[0];
    const last = values[values.length - 1];
    return { pts, line, area, min, max, mid: (min + max) / 2, change: ((last - first) / first) * 100 };
  }, [values]);

  if (!geo) {
    return (
      <div className="mo-chart-wrap">
        <div className="mo-chart-head">
          <span className="mo-stat-label">{title}</span>
        </div>
        <div className="mo-chart mo-chart-empty">
          <span className="mo-skel" style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    );
  }

  const up = geo.change >= 0;
  const active = idx != null ? geo.pts[idx] : geo.pts[geo.pts.length - 1];
  const hoursAgo = idx != null ? geo.pts.length - 1 - idx : 0;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box) return;
    const frac = clamp((e.clientX - box.left) / box.width, 0, 1);
    setIdx(Math.round(frac * (geo.pts.length - 1)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cur = idx ?? geo.pts.length - 1;
    setIdx(clamp(cur + (e.key === "ArrowLeft" ? -1 : 1), 0, geo.pts.length - 1));
  };

  return (
    <div className="mo-chart-wrap" data-tone={up ? "up" : "down"}>
      <div className="mo-chart-head">
        <span className="mo-stat-label">
          {title} · {windowLabel}
        </span>
        <span className="mo-chart-readout">
          <strong>{fmtPrice(active.v)}</strong>
          <span>{idx == null || hoursAgo === 0 ? "now" : `${hoursAgo}h ago`}</span>
          <DeltaPill value={geo.change} suffix={windowLabel} small />
        </span>
      </div>
      <div
        className="mo-chart"
        tabIndex={0}
        role="img"
        aria-label={`${title} over ${windowLabel}: ${fmtPrice(geo.pts[0].v)} to ${fmtPrice(
          geo.pts[geo.pts.length - 1].v,
        )} (${fmtPct(geo.change)}). Use arrow keys to inspect.`}
        onPointerMove={onMove}
        onPointerLeave={() => setIdx(null)}
        onKeyDown={onKey}
        onBlur={() => setIdx(null)}
      >
        <div className="mo-chart-grid" aria-hidden>
          <span style={{ top: "8%" }}>
            <em>{fmtPrice(geo.max)}</em>
          </span>
          <span style={{ top: "50%" }}>
            <em>{fmtPrice(geo.mid)}</em>
          </span>
          <span style={{ top: "92%" }}>
            <em>{fmtPrice(geo.min)}</em>
          </span>
        </div>
        {/* Plot right gutter chhodta hai — price labels line se na takraayein. */}
        <div className="mo-chart-plot" ref={plotRef}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="70%" stopColor="currentColor" stopOpacity="0.04" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill={`url(#area-${gid})`} />
            <path
              d={geo.line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {idx != null && <span className="mo-chart-cross" style={{ left: `${active.x}%` }} aria-hidden />}
          <span
            className="mo-chart-dot"
            data-live={idx == null ? "1" : undefined}
            style={{ left: `${active.x}%`, top: `${active.y}%` }}
            aria-hidden
          />
        </div>
      </div>
      <div className="mo-chart-axis" aria-hidden>
        <span>−{values.length - 1}h</span>
        <span>−{Math.round((values.length - 1) / 2)}h</span>
        <span>now</span>
      </div>
    </div>
  );
}

/* ═══════════════════════ Instruments ═══════════════════════ */

const FNG_ZONES = [
  { from: 0, to: 25, color: "#ff5252", label: "Extreme fear" },
  { from: 25, to: 45, color: "#c4504c", label: "Fear" },
  { from: 45, to: 55, color: "#77726d", label: "Neutral" },
  { from: 55, to: 75, color: "#3f9d60", label: "Greed" },
  { from: 75, to: 100, color: "#22c55e", label: "Extreme greed" },
];

/** fearLabel() ke thresholds ke saath match: ≤24, ≤44, ≤55, ≤75, baaki. */
function fngZoneIndex(v: number): number {
  if (v <= 24) return 0;
  if (v <= 44) return 1;
  if (v <= 55) return 2;
  if (v <= 75) return 3;
  return 4;
}

function FearGauge({ value, label }: { value: number | null; label: string }) {
  const cx = 120;
  const cy = 118;
  const r = 96;
  // 0 = left (extreme fear), 100 = right (extreme greed) — upar wale arc par.
  const pt = (v: number, rr: number) => {
    const a = Math.PI + (clamp(v, 0, 100) / 100) * Math.PI;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
  };
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const active = value != null ? fngZoneIndex(value) : -1;
  const GAP = 1.1;
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);
  const marker = value != null ? pt(value, r) : null;

  return (
    <div className="mo-fng" role="img" aria-label={value != null ? `Fear and greed ${Math.round(value)}, ${label}` : "Fear and greed unavailable"}>
      <svg viewBox="0 0 240 132" aria-hidden>
        {ticks.map((t) => {
          const major = t % 25 === 0;
          const [x1, y1] = pt(t, r - 15);
          const [x2, y2] = pt(t, r - (major ? 22 : 18));
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={major ? 0.35 : 0.15}
              strokeWidth={major ? 1.5 : 1}
            />
          );
        })}
        {FNG_ZONES.map((z, i) => (
          <path
            key={z.label}
            d={arc(z.from + (i ? GAP : 0), z.to - (i < FNG_ZONES.length - 1 ? GAP : 0))}
            fill="none"
            stroke={z.color}
            strokeWidth={active === i ? 14 : 10}
            strokeOpacity={active === -1 ? 0.35 : active === i ? 1 : 0.28}
            strokeLinecap="butt"
          />
        ))}
        {marker && (
          <>
            <circle cx={marker[0]} cy={marker[1]} r="10" fill="var(--mo-card)" />
            <circle cx={marker[0]} cy={marker[1]} r="6.5" fill="#fff" />
            <circle
              cx={marker[0]}
              cy={marker[1]}
              r="2.5"
              fill={active >= 0 ? FNG_ZONES[active].color : "var(--mo-card)"}
            />
          </>
        )}
      </svg>
      <div className="mo-fng-readout">
        <div className="mo-fng-value">{value == null ? "—" : Math.round(value)}</div>
        <div
          className="mo-fng-label"
          style={{ color: active >= 0 ? FNG_ZONES[active].color : undefined }}
        >
          {label}
        </div>
      </div>
      <div className="mo-fng-ends" aria-hidden>
        <span>Fear</span>
        <span>Greed</span>
      </div>
    </div>
  );
}

function ZoneMeter({
  value,
  zones,
  ticks,
  ariaLabel,
}: {
  value: number | null;
  zones: { from: number; to: number; color: string; label: string }[];
  ticks: { at: number; label: string }[];
  ariaLabel: string;
}) {
  const active = value == null ? -1 : zones.findIndex((z, i) => value < z.to || i === zones.length - 1);
  return (
    <div className="mo-meter" role="img" aria-label={ariaLabel}>
      <div className="mo-meter-track">
        {zones.map((z, i) => (
          <i
            key={z.label}
            title={z.label}
            style={{
              flexGrow: z.to - z.from,
              background: z.color,
              opacity: active === -1 ? 0.25 : active === i ? 0.95 : 0.22,
            }}
          />
        ))}
        {value != null && <span className="mo-meter-pin" style={{ left: `${clamp(value, 0, 100)}%` }} />}
      </div>
      <div className="mo-meter-ticks" aria-hidden>
        {ticks.map((t) => (
          <span key={t.at} data-edge={t.at === 0 ? "start" : t.at === 100 ? "end" : undefined} style={{ left: `${t.at}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════ Movers ═══════════════════════ */

function MoverCard({
  title,
  icon,
  tone,
  coins,
  mode,
  loading,
  empty,
}: {
  title: string;
  icon: ReactNode;
  tone?: "up" | "down";
  coins: OverviewCoin[];
  mode: "change" | "volume";
  loading: boolean;
  empty: string;
}) {
  const maxAbs = Math.max(
    ...coins.map((c) => (mode === "volume" ? c.volumeUsd : Math.abs(c.change24h ?? 0))),
    1e-9,
  );
  return (
    <section className="mo-card mo-panel mo-movers" data-tone={tone} aria-label={title}>
      <PanelHead icon={icon} title={title} sub="24H" />
      {loading ? (
        <div className="mo-mover-list">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="mo-mover-row is-skel">
              <span className="mo-skel" style={{ width: 18, height: 12 }} />
              <span className="mo-skel" style={{ width: 30, height: 30, borderRadius: 10 }} />
              <span className="mo-skel" style={{ width: "60%", height: 14 }} />
              <span className="mo-skel" style={{ width: 64, height: 14 }} />
            </div>
          ))}
        </div>
      ) : !coins.length ? (
        <div className="mo-empty">{empty}</div>
      ) : (
        <ol className="mo-mover-list">
          {coins.map((c, i) => {
            const mag = mode === "volume" ? c.volumeUsd : Math.abs(c.change24h ?? 0);
            const barTone = mode === "volume" ? "accent" : (c.change24h ?? 0) >= 0 ? "up" : "down";
            return (
              <li key={c.symbol}>
                <Link href={terminalHref(c.symbol)} className="mo-mover-row">
                  <span className="mo-rank">{String(i + 1).padStart(2, "0")}</span>
                  <CoinMark base={c.base} />
                  <span className="mo-mover-name">
                    <strong>
                      {c.base}
                      <em>/USDT</em>
                    </strong>
                    <span>{c.name}</span>
                  </span>
                  <span className="mo-mover-stats">
                    {mode === "volume" ? (
                      <>
                        <strong>{fmtUsdCompact(c.volumeUsd)}</strong>
                        <span className={toneClass(c.change24h)}>{fmtPct(c.change24h)}</span>
                      </>
                    ) : (
                      <>
                        <strong className={toneClass(c.change24h)}>{fmtPct(c.change24h)}</strong>
                        <span>{fmtPrice(c.price)}</span>
                      </>
                    )}
                  </span>
                  <span className="mo-mover-bar" data-tone={barTone} aria-hidden>
                    <i style={{ width: `${Math.max(4, (mag / maxAbs) * 100)}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CoinMark({ base, size }: { base: string; size?: number }) {
  return (
    <span className="mo-coin" style={size ? { width: size, height: size, fontSize: size * 0.34 } : undefined} aria-hidden>
      {base.slice(0, 3)}
    </span>
  );
}

/* ═══════════════════════ Heatmap (treemap) ═══════════════════════ */

function HeatLegend() {
  const stops = [-1, -0.5, 0, 0.5, 1].map((k) => rgbCss(heatRgb(k * HEAT_SPAN_PCT)));
  return (
    <div className="mo-heat-legend" aria-hidden>
      <span>−{HEAT_SPAN_PCT}%</span>
      <i style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }} />
      <span>+{HEAT_SPAN_PCT}%</span>
    </div>
  );
}

function HeatTreemap({ coins, loading }: { coins: OverviewCoin[]; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const rects = useMemo(() => {
    if (!size.w || !size.h) return [];
    // sqrt-compress: BTC jaisa giant baaki tiles ko kuchal na de.
    return squarify(
      coins.map((c) => ({ id: c.symbol, value: Math.sqrt(Math.max(c.volumeUsd, 1)) })),
      size.w,
      size.h,
    );
  }, [coins, size.w, size.h]);

  const bySymbol = useMemo(() => new Map(coins.map((c) => [c.symbol, c])), [coins]);
  const hoverCoin = hover ? bySymbol.get(hover.id) : null;

  return (
    <div
      ref={ref}
      className="mo-tree"
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const box = ref.current?.getBoundingClientRect();
        const tile = (e.target as HTMLElement).closest<HTMLElement>("[data-sym]");
        if (!box || !tile) return setHover(null);
        setHover({ id: tile.dataset.sym as string, x: e.clientX - box.left, y: e.clientY - box.top });
      }}
    >
      {loading && <span className="mo-skel mo-tree-skel" />}
      {!loading && !rects.length && <div className="mo-empty">Waiting for market feed…</div>}
      {rects.map((r) => {
        const c = bySymbol.get(r.id);
        if (!c) return null;
        const w = r.w - 2;
        const h = r.h - 2;
        const rgb = heatRgb(c.change24h);
        const tier = w > 150 && h > 96 ? "xl" : w > 96 && h > 64 ? "lg" : w > 58 && h > 38 ? "md" : w > 30 && h > 18 ? "sm" : "xs";
        const symSize = clamp(Math.min(w / 4.2, h / 2.6), 10, 30);
        return (
          <Link
            key={r.id}
            href={terminalHref(c.symbol)}
            data-sym={c.symbol}
            data-tier={tier}
            className="mo-tile"
            aria-label={`${c.base}: ${fmtPct(c.change24h)} over 24H, price ${fmtPrice(c.price)}, volume ${fmtUsdCompact(c.volumeUsd)}`}
            data-active={hover?.id === c.symbol ? "1" : undefined}
            style={{
              left: r.x + 1,
              top: r.y + 1,
              width: Math.max(0, w),
              height: Math.max(0, h),
              background: `linear-gradient(160deg, ${rgbCss(shadeRgb(rgb, 0.1))}, ${rgbCss(rgb)} 55%, ${rgbCss(
                shadeRgb(rgb, -0.18),
              )})`,
            }}
          >
            {tier !== "xs" && (
              <>
                <span className="mo-tile-sym" style={{ fontSize: symSize }}>
                  {c.base}
                </span>
                {tier !== "sm" && (
                  <span className="mo-tile-chg" style={{ fontSize: clamp(symSize * 0.62, 10, 18) }}>
                    {fmtPct(c.change24h)}
                  </span>
                )}
                {(tier === "lg" || tier === "xl") && <span className="mo-tile-price">{fmtPrice(c.price)}</span>}
                {tier === "xl" && <span className="mo-tile-vol">Vol {fmtUsdCompact(c.volumeUsd)}</span>}
              </>
            )}
          </Link>
        );
      })}
      {hoverCoin && hover && (
        <FloatTip x={hover.x} y={hover.y} boxW={size.w} boxH={size.h} coin={hoverCoin} />
      )}
    </div>
  );
}

function FloatTip({
  x,
  y,
  boxW,
  boxH,
  coin,
}: {
  x: number;
  y: number;
  boxW: number;
  boxH: number;
  coin: OverviewCoin;
}) {
  const TW = 200;
  const TH = 118;
  const left = x + 16 + TW > boxW ? x - TW - 12 : x + 16;
  const top = clamp(y + 16 + TH > boxH ? y - TH - 10 : y + 16, 4, Math.max(4, boxH - TH - 4));
  return (
    <div className="mo-tip" style={{ left: Math.max(4, left), top }} aria-hidden>
      <div className="mo-tip-head">
        <CoinMark base={coin.base} size={24} />
        <strong>{coin.base}/USDT</strong>
        <span className={`mo-tip-chg ${toneClass(coin.change24h)}`}>{fmtPct(coin.change24h)}</span>
      </div>
      <dl>
        <dt>Price</dt>
        <dd>{fmtPrice(coin.price)}</dd>
        <dt>24H volume</dt>
        <dd>{fmtUsdCompact(coin.volumeUsd)}</dd>
        <dt>Sector</dt>
        <dd>{coin.sector}</dd>
      </dl>
      <div className="mo-tip-foot">Click → open in terminal</div>
    </div>
  );
}

/* ═══════════════════════ Sectors ═══════════════════════ */

function SectorBars({ sectors, loading }: { sectors: OverviewSector[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="mo-sectors">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="mo-sector-row">
            <div className="mo-sector-line">
              <span className="mo-skel" style={{ width: 140, height: 16 }} />
              <span className="mo-skel" style={{ width: 60, height: 16 }} />
            </div>
            <span className="mo-skel" style={{ display: "block", width: "100%", height: 5 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!sectors.length) return <div className="mo-empty">No sector data yet</div>;
  // Sabse bada move ~80% width par — bars ko saans lene ki jagah milti hai.
  const scale = Math.max(...sectors.map((s) => Math.abs(s.avgChange)), 0.5) * 1.25;
  return (
    <div className="mo-sectors">
      {sectors.map((s) => {
        const tone = s.avgChange > 0 ? "up" : s.avgChange < 0 ? "down" : "flat";
        return (
          <div
            key={s.name}
            className="mo-sector-row"
            title={`${s.name}: ${s.up} up · ${s.down} down · vol ${fmtUsdCompact(s.volumeUsd)}`}
          >
            <div className="mo-sector-line">
              <span className="mo-sector-name">
                <strong>{s.name}</strong>
                <span>· {s.count}</span>
              </span>
              <span className={`mo-sector-pct ${toneClass(s.avgChange)}`}>{fmtPct(s.avgChange)}</span>
            </div>
            <div className="mo-sector-bar" aria-hidden>
              <i data-tone={tone} style={{ width: `${Math.max(1.5, (Math.abs(s.avgChange) / scale) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ Shared bits ═══════════════════════ */

function PanelHead({
  icon,
  title,
  sub,
  info,
  right,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  info?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mo-panel-head">
      <div className="mo-panel-title">
        <span className="mo-panel-icon" aria-hidden>
          {icon}
        </span>
        <h2>{title}</h2>
        {info && (
          <span className="mo-info" tabIndex={0} role="img" aria-label={info} title={info}>
            <Info aria-hidden />
          </span>
        )}
        {sub && <span className="mo-panel-sub">{sub}</span>}
      </div>
      {right}
    </header>
  );
}

function Eyebrow({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mo-eyebrow">
      {icon && (
        <span className="mo-panel-icon" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}

function DeltaPill({ value, suffix, small }: { value: number; suffix?: string; small?: boolean }) {
  const tone = toneAttr(value);
  return (
    <span className="mo-delta" data-tone={tone} data-size={small ? "sm" : undefined}>
      {tone === "up" ? <ArrowUpRight aria-hidden /> : tone === "down" ? <ArrowDownRight aria-hidden /> : <Waves aria-hidden />}
      {fmtPct(value)}
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="mo-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          data-on={value === o.value ? "1" : "0"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((prev) =>
        Math.abs(prev.w - box.width) < 1 && Math.abs(prev.h - box.height) < 1
          ? prev
          : { w: Math.round(box.width), h: Math.round(box.height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Altcoin season — index ke saath counts bhi, taaki footnote bata sake "31 of 50". */
function altSeason(coins: OverviewCoin[]) {
  const btc = coins.find((c) => c.base === "BTC");
  if (!btc || btc.change24h == null) return null;
  const alts = coins.filter((c) => c.base !== "BTC" && c.change24h != null).slice(0, ALT_SAMPLE);
  if (alts.length < 10) return null;
  const beat = alts.filter((c) => (c.change24h as number) > (btc.change24h as number)).length;
  return { index: (beat / alts.length) * 100, beat, sample: alts.length, btcChange: btc.change24h };
}

function toneClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return n > 0 ? "mo-up" : "mo-down";
}

function toneAttr(n: number | null | undefined): "up" | "down" | undefined {
  if (n == null || !Number.isFinite(n) || n === 0) return undefined;
  return n > 0 ? "up" : "down";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}
