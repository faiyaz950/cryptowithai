"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpRight, KeyRound, Lock, Play, ShieldCheck, Trash2 } from "lucide-react";
import { captureVisit } from "@/lib/mukul/store";
import { DESK_STAGES, type DeskFeature, type DeskStage } from "@/lib/deskFlow";
import type { MarketTicker } from "@/lib/cryptoApi";
import { fmtPct, heatRgb, rgbCss, squarify } from "@/lib/marketOverview";
import LandingVideos from "@/components/mukul/LandingVideos";
import "./landing.css";

/* ═══════════════════════ Content ═══════════════════════ */

type FeatureCopy = { title: string; desc: string; points?: string[] };

/**
 * Landing ki copy desk ke apne feature ids par chalti hai (`DESK_STAGES`),
 * isliye desk mein naya tool aaye to yahan bhi card ban jaata hai — copy na
 * ho to desk ka apna blurb dikh jaata hai.
 */
const COPY: Record<string, FeatureCopy> = {
  overview: {
    title: "Market Overview",
    desc: "Market mood, top movers, a live heatmap and sector moves on one screen.",
    points: ["Fear & Greed, BTC dominance", "Heatmap, sectors, bubble map"],
  },
  strategies: {
    title: "Strategy Catalogue",
    desc: "Ready-made strategies with clear rules. Backtest one, then run it on paper.",
    points: ["Trend, breakout, momentum", "Futures, spot and options"],
  },
  builder: {
    title: "Strategy Builder",
    desc: "Turn your own idea into entry and exit rules — no code needed.",
    points: ["Indicator-based conditions", "Stop-loss, target, position size"],
  },
  backtester: {
    title: "Backtester",
    desc: "Test rules on history with trading costs included.",
    points: ["Fees and slippage in every run", "A held-out final test period"],
  },
  calculators: {
    title: "Calculators",
    desc: "35+ calculators for risk, futures, spot and performance.",
    points: ["Position size, liquidation, R:R", "DCA, grid, fees and tax"],
  },
  exchanges: {
    title: "Connect your exchange",
    desc: "Add a read + trading API key. Orders and positions run on your own exchange account.",
  },
  markets: {
    title: "Trading Terminal",
    desc: "A professional candlestick chart on live exchange data, with paper and live orders.",
  },
  watchlist: {
    title: "Watchlists",
    desc: "Keep the coins you follow in lists with live prices.",
    points: ["Live price and 24h change", "Open the chart in one click"],
  },
  trades: {
    title: "Trades",
    desc: "Open positions, orders and trade history in one place.",
    points: ["Positions and open P&L", "Order history from your exchange"],
  },
  bots: {
    title: "Trading Bots",
    desc: "DCA, Grid and Combo bots. Set the rules, backtest, then start.",
    points: ["Paper or live mode", "Backtest before you start"],
  },
  mine: {
    title: "My Strategies",
    desc: "Every strategy you have saved, running on paper or live.",
    points: ["Start, pause and edit", "Drafts and archived runs"],
  },
  portfolio: {
    title: "Portfolio",
    desc: "Upload exchange statements and see holdings, allocation and coin-wise P&L.",
    points: ["CSV, Excel and PDF statements", "AI diversification and risk check"],
  },
  journal: {
    title: "Trade Journal",
    desc: "Review paper and live trades day by day.",
    points: ["Calendar view and tags", "Win rate and results"],
  },
  profile: {
    title: "P&L Analytics",
    desc: "Your account, connected exchanges and P&L on one screen.",
    points: ["Day-wise P&L, monthly heatmap", "Exchange-wise breakdown"],
  },
  ai: {
    title: "Mukul AI Assistant",
    desc: "Ask about live markets, your trades or a chart — in English, Hindi or Hinglish.",
  },
};

const STAGE_COPY: Record<DeskStage["id"], { title: string; line: string }> = {
  research: { title: "Research & Test", line: "Prove an idea before you put money on it." },
  trade: { title: "Trade & Automate", line: "Trade by hand on your own exchange, or let a strategy run." },
  track: { title: "Track & Improve", line: "Read the result, then ask what to change." },
};

/** Har stage ka bada card — baaki tools uske saath chhote cards mein. */
const FLAGSHIP: Record<DeskStage["id"], string> = { research: "overview", trade: "markets", track: "ai" };
/** Trade stage mein exchanges poori chaudai ki patti hai, card nahi. */
const BAND_ID = "exchanges";

const EXCHANGES = ["Delta Exchange India", "Bybit", "CoinDCX"];
const ASSURANCES = [
  { icon: Lock, text: "API keys stored encrypted" },
  { icon: ShieldCheck, text: "Withdrawal permission never requested" },
  { icon: Trash2, text: "Keys deleted when you disconnect" },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
const AI_PROMPTS = ["Explain today's BTC trend", "Is my portfolio too risky?", "ETH ka RSI kya bata raha hai?"];

const TOOL_COUNT = DESK_STAGES.reduce((n, s) => n + s.items.length, 0);

function copyFor(item: DeskFeature): FeatureCopy {
  return COPY[item.id] ?? { title: item.label, desc: item.blurb };
}

/* ═══════════════════════ Hooks ═══════════════════════ */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scroll reveal — JS hi `data-anim="on"` lagata hai, tab hi elements chhupte
 * hain. JS band ho ya reduced-motion ho to page bina animation ke poora dikhta hai.
 */
function useReveal(rootRef: RefObject<HTMLDivElement | null>) {
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    root.setAttribute("data-anim", "on");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-in", "true");
          io.unobserve(entry.target);
        });
      },
      { root, threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((node) => io.observe(node));
    return () => {
      io.disconnect();
      root.removeAttribute("data-anim");
    };
  }, [rootRef]);
}

type LiveState = { status: "loading" } | { status: "error" } | { status: "ready"; tickers: MarketTicker[]; at: number };
const LIVE_REFRESH_MS = 30_000;

/** Hero heatmap aur Overview card dono ek hi fetch se chalte hain. */
function useLiveTickers(): LiveState {
  const [state, setState] = useState<LiveState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/overview/tickers", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: { tickers?: MarketTicker[] }) => {
          if (!alive) return;
          const tickers = (Array.isArray(data.tickers) ? data.tickers : []).filter(
            (t) => t.price != null && Number.isFinite(t.price) && t.change_24h != null,
          );
          setState((prev) =>
            tickers.length
              ? { status: "ready", tickers, at: Date.now() }
              : prev.status === "ready"
                ? prev
                : { status: "error" },
          );
        })
        .catch(() => {
          if (alive) setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
        });
    };
    load();
    const id = window.setInterval(load, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return state;
}

/* ═══════════════════════ Page ═══════════════════════ */

export default function LandingPage() {
  const params = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useLiveTickers();
  useReveal(rootRef);

  useEffect(() => {
    captureVisit(params);
  }, [params]);

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-top">
        <div className="lp-wrap lp-top-inner">
          <Link href="/" className="lp-brand" aria-label="Cryptomantra home">
            <img src="/mukul/icon.png" alt="" width={36} height={36} />
            <span>
              <strong>Cryptomantra</strong>
              <small>by Dr. Mukul Agrawal</small>
            </span>
          </Link>
          <nav className="lp-nav" aria-label="Page">
            <a href="#features">Features</a>
            <a href="#videos">Videos</a>
            <Link href="/trade/overview" className="lp-btn lp-btn-primary lp-btn-sm">
              <span>
                Open <span className="lp-hide-xs">Trading </span>Desk
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-hero-bg" aria-hidden />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow lp-rise" style={{ "--d": 0 } as CSSProperties}>
                <i aria-hidden /> {TOOL_COUNT} tools · Free to start
              </p>
              <h1 className="lp-rise" style={{ "--d": 1 } as CSSProperties}>
                Research it.
                <br />
                Trade it.
                <span>Learn from it.</span>
              </h1>
              <p className="lp-lede lp-rise" style={{ "--d": 2 } as CSSProperties}>
                Cryptomantra is a complete crypto trading desk — {TOOL_COUNT} tools that run on your own exchange
                account, plus free crypto lessons from Dr. Mukul Agrawal.
              </p>
              <div className="lp-hero-cta lp-rise" style={{ "--d": 3 } as CSSProperties}>
                <Link href="/trade/overview" className="lp-btn lp-btn-primary lp-btn-lg">
                  Open Trading Desk <ArrowRight aria-hidden />
                </Link>
                <a href="#videos" className="lp-btn lp-btn-ghost lp-btn-lg">
                  <Play aria-hidden /> Watch free lessons
                </a>
              </div>
              <p className="lp-hero-note lp-rise" style={{ "--d": 4 } as CSSProperties}>
                Works with <strong>Delta Exchange India</strong>, <strong>Bybit</strong> and <strong>CoinDCX</strong>.
                Charts and AI need no account.
              </p>
            </div>

            <div className="lp-rise" style={{ "--d": 2 } as CSSProperties}>
              <HeroHeatmap live={live} />
            </div>
          </div>

          <div className="lp-wrap">
            <ol className="lp-loop lp-rise" style={{ "--d": 5 } as CSSProperties}>
              {DESK_STAGES.map((stage) => (
                <li key={stage.id}>
                  <a href={`#stage-${stage.id}`}>
                    <span className="lp-loop-step">0{stage.step}</span>
                    <span className="lp-loop-text">
                      <strong>{STAGE_COPY[stage.id].title}</strong>
                      <span>{stage.items.map((i) => copyFor(i).title).join(" · ")}</span>
                    </span>
                    <ArrowRight className="lp-loop-arrow" aria-hidden />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────── */}
        <section className="lp-section" id="features" aria-labelledby="features-heading">
          <div className="lp-wrap">
            <header className="lp-section-head" data-reveal>
              <p className="lp-kicker">The trading desk</p>
              <h2 id="features-heading">
                {TOOL_COUNT} tools. <span>One loop.</span>
              </h2>
              <p>
                Every tool sits in one of three steps — research it, trade it, then learn from it. Click any card to
                open that tool.
              </p>
            </header>

            {DESK_STAGES.map((stage) => (
              <StageBlock key={stage.id} stage={stage} live={live} />
            ))}
          </div>
        </section>

        {/* ── Videos ───────────────────────────────────── */}
        <section className="lp-section lp-section-alt" id="videos" aria-labelledby="videos-heading">
          <div className="lp-wrap">
            <LandingVideos />
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-row">
            <Link href="/" className="lp-brand" aria-label="Cryptomantra home">
              <img src="/mukul/icon.png" alt="" width={32} height={32} />
              <span>
                <strong>Cryptomantra</strong>
                <small>by Dr. Mukul Agrawal</small>
              </span>
            </Link>
            <nav className="lp-foot-links" aria-label="Footer">
              <Link href="/trade/overview">Trading Desk</Link>
              <a href="#features">Features</a>
              <a href="#videos">Videos</a>
              <a href="https://www.youtube.com/@mukulagrawal" target="_blank" rel="noreferrer">
                YouTube <ArrowUpRight aria-hidden />
              </a>
            </nav>
          </div>
          <p className="lp-legal">
            Cryptomantra is a learning platform. Nothing here is a guaranteed prediction or personal financial advice.
            Crypto is high-risk — only risk what you can afford to lose. © {new Date().getFullYear()} Mukul Agrawal.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════ Features ═══════════════════════ */

function StageBlock({ stage, live }: { stage: DeskStage; live: LiveState }) {
  const flagship = stage.items.find((i) => i.id === FLAGSHIP[stage.id]);
  const band = stage.items.find((i) => i.id === BAND_ID);
  const rest = stage.items.filter((i) => i !== flagship && i !== band);

  return (
    <section className="lp-stage" id={`stage-${stage.id}`} aria-labelledby={`stage-${stage.id}-title`}>
      <header className="lp-stage-head" data-reveal>
        <span className="lp-stage-step">0{stage.step}</span>
        <h3 id={`stage-${stage.id}-title`}>{STAGE_COPY[stage.id].title}</h3>
        <p>{STAGE_COPY[stage.id].line}</p>
      </header>

      <ul className="lp-bento" data-flip={stage.step % 2 === 0}>
        {flagship && (
          <li className="lp-cell-flagship" data-reveal>
            <FlagshipCard item={flagship} live={live} />
          </li>
        )}
        {rest.map((item, i) => (
          <li
            key={item.id}
            className={i === 0 && rest.length % 2 === 1 ? "lp-cell-wide" : undefined}
            data-reveal
            style={{ "--d": i % 4 } as CSSProperties}
          >
            <FeatureCard item={item} />
          </li>
        ))}
        {band && (
          <li className="lp-cell-band" data-reveal>
            <ExchangeBand item={band} />
          </li>
        )}
      </ul>
    </section>
  );
}

function FeatureCard({ item }: { item: DeskFeature }) {
  const { title, desc, points } = copyFor(item);
  const Icon = item.icon;
  return (
    <Link href={item.href} className="lp-card">
      <span className="lp-card-icon">
        <Icon aria-hidden />
      </span>
      <h4>{title}</h4>
      <p>{desc}</p>
      {points && (
        <ul className="lp-card-points">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <span className="lp-card-open">
        Open <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

function FlagshipCard({ item, live }: { item: DeskFeature; live: LiveState }) {
  const { title, desc } = copyFor(item);
  const Icon = item.icon;
  return (
    <Link href={item.href} className="lp-card lp-card-flagship">
      <span className="lp-card-icon">
        <Icon aria-hidden />
      </span>
      <h4>{title}</h4>
      <p>{desc}</p>
      <div className="lp-visual">
        {item.id === "overview" && <MoversVisual live={live} />}
        {item.id === "markets" && <TerminalVisual />}
        {item.id === "ai" && <AiVisual />}
      </div>
      <span className="lp-card-open">
        Open {title} <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

function ExchangeBand({ item }: { item: DeskFeature }) {
  const { title, desc } = copyFor(item);
  return (
    <Link href={item.href} className="lp-card lp-band">
      <div className="lp-band-copy">
        <span className="lp-card-icon">
          <KeyRound aria-hidden />
        </span>
        <h4>{title}</h4>
        <p>{desc}</p>
        <ul className="lp-band-exchanges" aria-label="Supported exchanges">
          {EXCHANGES.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <ul className="lp-band-assure">
        {ASSURANCES.map(({ icon: I, text }) => (
          <li key={text}>
            <I aria-hidden /> {text}
          </li>
        ))}
      </ul>
    </Link>
  );
}

/* ═══════════════════════ Visuals ═══════════════════════ */

const HEAT_W = 600;
const HEAT_H = 380;
const HEAT_COUNT = 24;

function HeroHeatmap({ live }: { live: LiveState }) {
  const coins = useMemo(() => (live.status === "ready" ? live.tickers : []), [live]);
  const top = useMemo(
    () => [...coins].sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0)).slice(0, HEAT_COUNT),
    [coins],
  );
  const rects = useMemo(
    () =>
      squarify(
        top.map((t) => ({ id: t.symbol, value: Math.sqrt(Math.max(t.turnover_usd || 0, 1)) })),
        HEAT_W,
        HEAT_H,
      ),
    [top],
  );
  const bySymbol = useMemo(() => new Map(top.map((t) => [t.symbol, t])), [top]);
  const up = coins.filter((t) => (t.change_24h ?? 0) > 0).length;
  const down = coins.filter((t) => (t.change_24h ?? 0) < 0).length;
  const upShare = up + down ? up / (up + down) : 0.5;

  return (
    <Link href="/trade/overview" className="lp-window" aria-label="Open the live market overview">
      <div className="lp-window-bar">
        <span className="lp-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <strong>Market overview</strong>
        <span className="lp-live" data-state={live.status}>
          <i aria-hidden /> {live.status === "error" ? "Offline" : "Live"}
        </span>
      </div>

      <div className="lp-heat" aria-hidden={live.status !== "ready"}>
        {live.status === "ready" &&
          rects.map((r) => {
            const t = bySymbol.get(r.id);
            if (!t) return null;
            const area = r.w * r.h;
            const size = area > 22000 ? "xl" : area > 11000 ? "lg" : area > 5000 ? "md" : area > 2200 ? "sm" : "xs";
            return (
              <span
                key={r.id}
                className="lp-tile"
                data-size={size}
                title={`${t.base} ${fmtPct(t.change_24h)}`}
                style={{
                  left: `${(r.x / HEAT_W) * 100}%`,
                  top: `${(r.y / HEAT_H) * 100}%`,
                  width: `${(r.w / HEAT_W) * 100}%`,
                  height: `${(r.h / HEAT_H) * 100}%`,
                  background: rgbCss(heatRgb(t.change_24h)),
                }}
              >
                <strong>{t.base}</strong>
                <span>{fmtPct(t.change_24h)}</span>
              </span>
            );
          })}
        {live.status === "loading" && <span className="lp-heat-skel" />}
        {live.status === "error" && <span className="lp-heat-empty">Live market data is unavailable right now.</span>}
      </div>

      <div className="lp-window-foot">
        <span className="lp-breadth-label">
          <b data-tone="up">{up}</b> up
        </span>
        <span className="lp-breadth" aria-hidden>
          <i style={{ width: `${upShare * 100}%` }} />
        </span>
        <span className="lp-breadth-label">
          <b data-tone="down">{down}</b> down
        </span>
        <span className="lp-window-sub">Perpetual futures · 24h</span>
      </div>
    </Link>
  );
}

function MoversVisual({ live }: { live: LiveState }) {
  if (live.status !== "ready") {
    return (
      <div className="lp-movers" aria-hidden>
        {[0, 1].map((col) => (
          <div key={col}>
            {[0, 1, 2, 3, 4].map((r) => (
              <span key={r} className="lp-skel-row" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  const liquid = live.tickers.filter((t) => (t.turnover_usd || 0) > 1_000_000);
  const sorted = [...(liquid.length >= 6 ? liquid : live.tickers)].sort(
    (a, b) => (b.change_24h ?? 0) - (a.change_24h ?? 0),
  );
  const cols = [
    { label: "Top gainers", rows: sorted.slice(0, 5) },
    { label: "Top losers", rows: sorted.slice(-5).reverse() },
  ];
  return (
    <div className="lp-movers">
      {cols.map((col) => (
        <div key={col.label}>
          <span className="lp-movers-label">{col.label}</span>
          <ol>
            {col.rows.map((t) => {
              const tone = (t.change_24h ?? 0) >= 0 ? "up" : "down";
              return (
                <li key={t.symbol}>
                  <span className="lp-coin">{t.base.slice(0, 3)}</span>
                  <strong>{t.base}</strong>
                  <em data-tone={tone}>{fmtPct(t.change_24h)}</em>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/* Terminal card ka chart sirf illustration hai — koi price ya number nahi. */
type Candle = { o: number; c: number; h: number; l: number };
function buildCandles(n: number): Candle[] {
  let seed = 23;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o + (rand() - 0.42) * 8;
    out.push({ o, c, h: Math.max(o, c) + rand() * 3.5, l: Math.min(o, c) - rand() * 3.5 });
    p = c;
  }
  return out;
}
const T_CANDLES = buildCandles(34);
const T_W = 340;
const T_H = 130;

function TerminalVisual() {
  const lo = Math.min(...T_CANDLES.map((c) => c.l));
  const hi = Math.max(...T_CANDLES.map((c) => c.h));
  const y = (v: number) => 6 + ((hi - v) / (hi - lo)) * (T_H - 12);
  const step = T_W / T_CANDLES.length;
  const ema = T_CANDLES.map((_, i) => {
    const win = T_CANDLES.slice(Math.max(0, i - 6), i + 1);
    const avg = win.reduce((s, c) => s + c.c, 0) / win.length;
    return `${(i * step + step / 2).toFixed(1)},${y(avg).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="lp-term" aria-hidden>
      <div className="lp-term-tf">
        {TIMEFRAMES.map((tf) => (
          <span key={tf} data-on={tf === "4h"}>
            {tf}
          </span>
        ))}
        <span className="lp-term-ind">45+ indicators</span>
      </div>
      <svg viewBox={`0 0 ${T_W} ${T_H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={T_W} y1={T_H * f} y2={T_H * f} className="lp-term-grid" />
        ))}
        {T_CANDLES.map((c, i) => {
          const x = i * step + step / 2;
          const top = y(Math.max(c.o, c.c));
          return (
            <g key={i} className={c.c >= c.o ? "up" : "down"}>
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} />
              <rect
                x={x - step * 0.28}
                y={top}
                width={step * 0.56}
                height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))}
                rx={1}
              />
            </g>
          );
        })}
        <polyline points={ema} className="lp-term-ema" />
      </svg>
    </div>
  );
}

function AiVisual() {
  return (
    <div className="lp-ai" aria-hidden>
      <span className="lp-ai-label">Try asking</span>
      <ul>
        {AI_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <span className="lp-ai-input">
        Ask Mukul AI anything…
        <i>
          <ArrowRight />
        </i>
      </span>
    </div>
  );
}
