"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CandlestickChart,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AccountApiError } from "@/lib/accountApi";
import type { MarketTicker } from "@/lib/cryptoApi";
import { fmtPct } from "@/lib/marketOverview";
import "./login.css";

type Tab = "login" | "signup";

const FEATURES = [
  {
    icon: CandlestickChart,
    title: "Live exchange charts",
    desc: "Charts, screener and backtests from the exchange you trade on.",
  },
  {
    icon: KeyRound,
    title: "Your own exchange",
    desc: "Connect Delta, Bybit or CoinDCX. Orders run on your account.",
  },
  {
    icon: Sparkles,
    title: "AI trading assistant",
    desc: "Ask about live markets in English, Hindi or Hinglish.",
  },
];

const ASSURANCES = [
  { icon: Lock, label: "Encrypted API keys" },
  { icon: ShieldCheck, label: "No withdrawal access" },
  { icon: Trash2, label: "Delete keys anytime" },
];

/** Showcase card ke liye — $1 se upar hamesha 2 decimals ($75,924.50), neeche 4 significant. */
function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}

/** Majors shown in the showcase card, in this order. */
const PULSE_BASES = ["BTC", "ETH", "SOL", "XRP"];
const PULSE_REFRESH_MS = 30_000;

/**
 * Login ke baad wapas wahin bhejo jahan se user aaya tha (`?next=/trade?tab=exchanges`).
 * Sirf apni site ke path — "//evil.com" jaisa bahar ka redirect nahi.
 */
function safeNext(): string {
  if (typeof window === "undefined") return "/trade";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/trade";
}

/** Backend ka 401 "Invalid username or password" kehta hai, par form email maangta hai. */
function friendlyError(err: unknown, tab: Tab): string {
  if (err instanceof AccountApiError && err.status === 401 && tab === "login") {
    return "Incorrect email or password. Please try again.";
  }
  return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") await login(email, password);
      else await signup(name, email, password);
      router.push(safeNext());
    } catch (err: unknown) {
      setError(friendlyError(err, tab));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
  };

  const isLogin = tab === "login";
  const passwordOk = password.length >= 8;

  return (
    <div className="trade-root auth-root">
      <div className="auth-grid">
        <aside className="auth-aside">
          <CandleArt />
          <div className="auth-brand auth-rise">
            <img className="auth-brand-mark" src="/mukul/icon.png" alt="" width={40} height={40} />
            <span>
              <span className="auth-brand-name">Cryptomantra</span>
              <span className="auth-brand-sub">by Dr. Mukul Agrawal</span>
            </span>
          </div>

          <div className="auth-showcase">
            <span className="auth-eyebrow auth-rise" style={{ animationDelay: "60ms" }}>
              <i className="auth-live-dot" aria-hidden />
              Live crypto trading desk
            </span>

            <h2 className="auth-headline auth-rise" style={{ animationDelay: "120ms" }}>
              Crypto, simplified.
              <span className="auth-headline-accent">From beginner to pro.</span>
            </h2>
            <p className="auth-lede auth-rise" style={{ animationDelay: "180ms" }}>
              One account for everything. Connect your exchange — Delta, Bybit or CoinDCX — and run every Mukul Crypto
              Club tool on your own portfolio.
            </p>

            <MarketPulse />

            <ul className="auth-features auth-rise" style={{ animationDelay: "300ms" }}>
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="auth-feature">
                    <span className="auth-feature-icon">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="auth-feature-title">{f.title}</span>
                    <span className="auth-feature-desc">{f.desc}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <figure className="auth-coach auth-rise" style={{ animationDelay: "360ms" }}>
            <img src="/mukul/mukul-face.webp" alt="Dr. Mukul Agrawal" width={52} height={52} />
            <figcaption>
              <strong>Dr. Mukul Agrawal</strong>
              <span>Founder &amp; lead mentor</span>
            </figcaption>
            <dl className="auth-coach-stats">
              <div>
                <dt>23+ yrs</dt>
                <dd>Market experience</dd>
              </div>
              <div>
                <dt>50K+</dt>
                <dd>Students</dd>
              </div>
              <div>
                <dt>Guinness</dt>
                <dd>World Record holder</dd>
              </div>
            </dl>
          </figure>
        </aside>

        <main className="auth-main">
          <div className="auth-stage">
            <div className="auth-card auth-rise" style={{ animationDelay: "80ms" }}>
              <div className="auth-card-brand">
                <img className="auth-brand-mark" src="/mukul/icon.png" alt="" width={36} height={36} />
                <span>
                  <span className="auth-brand-name">Cryptomantra</span>
                  <span className="auth-brand-sub">by Dr. Mukul Agrawal</span>
                </span>
              </div>

              <h1 className="auth-title">{isLogin ? "Welcome back" : "Create your account"}</h1>
              <p className="auth-subtitle">
                {isLogin
                  ? "Sign in to continue to your trading desk."
                  : "It's free. Connect exchanges and keep your settings in sync."}
              </p>

              <div className="auth-tabs" role="tablist" aria-label="Account" data-tab={tab}>
                {(["login", "signup"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    data-active={tab === t}
                    className="auth-tab"
                    onClick={() => switchTab(t)}
                  >
                    {t === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="auth-form">
                {!isLogin && (
                  <label className="auth-field">
                    <span className="auth-label">Full name</span>
                    <span className="auth-control">
                      <User className="auth-control-icon" aria-hidden />
                      <input
                        type="text"
                        className="auth-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        autoComplete="name"
                        required
                      />
                    </span>
                  </label>
                )}

                <label className="auth-field">
                  <span className="auth-label">Email address</span>
                  <span className="auth-control">
                    <Mail className="auth-control-icon" aria-hidden />
                    <input
                      type="email"
                      className="auth-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      inputMode="email"
                      required
                    />
                  </span>
                </label>

                <label className="auth-field">
                  <span className="auth-label">Password</span>
                  <span className="auth-control">
                    <Lock className="auth-control-icon" aria-hidden />
                    <input
                      type={showPassword ? "text" : "password"}
                      className="auth-input auth-input-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      minLength={isLogin ? undefined : 8}
                      aria-describedby={isLogin ? undefined : "auth-password-hint"}
                      required
                    />
                    <button
                      type="button"
                      className="auth-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </span>
                  {!isLogin && (
                    <span id="auth-password-hint" className="auth-hint" data-ok={passwordOk}>
                      <Check className="w-3.5 h-3.5" aria-hidden />
                      At least 8 characters
                    </span>
                  )}
                </label>

                {error && (
                  <div className="auth-error" role="alert">
                    <AlertCircle className="w-4 h-4 flex-none" aria-hidden />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      {isLogin ? "Signing in…" : "Creating account…"}
                    </>
                  ) : (
                    <>
                      {isLogin ? "Sign in" : "Create account"}
                      <ArrowRight className="auth-submit-arrow w-4 h-4" aria-hidden />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <Link href="/trade" className="auth-guest">
                Continue as guest
              </Link>

              <p className="auth-footnote">
                Charts and the AI assistant work without an account. You only need one to connect an exchange.
              </p>
            </div>

            <ul className="auth-assurances auth-rise" style={{ animationDelay: "160ms" }}>
              {ASSURANCES.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.label}>
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                    {a.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ═══════════════════ Showcase: background candles ═══════════════════ */

type Candle = { open: number; close: number; high: number; low: number };

/** Seeded random walk — har render par wahi chart, hydration safe. */
function buildCandles(n: number): Candle[] {
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (rand() - 0.4) * 9;
    out.push({
      open,
      close,
      high: Math.max(open, close) + rand() * 4,
      low: Math.min(open, close) - rand() * 4,
    });
    price = close;
  }
  return out;
}

const ART_W = 480;
const ART_H = 220;
const CANDLES = buildCandles(30);

function CandleArt() {
  const lo = Math.min(...CANDLES.map((c) => c.low));
  const hi = Math.max(...CANDLES.map((c) => c.high));
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (ART_H - 16);
  const step = ART_W / CANDLES.length;
  const body = step * 0.52;
  // 5-candle moving average, chart ke upar ek patli line.
  const ma = CANDLES.map((_, i) => {
    const win = CANDLES.slice(Math.max(0, i - 4), i + 1);
    const avg = win.reduce((s, c) => s + c.close, 0) / win.length;
    return `${(i * step + step / 2).toFixed(1)},${y(avg).toFixed(1)}`;
  }).join(" ");

  return (
    <svg className="auth-art" viewBox={`0 0 ${ART_W} ${ART_H}`} aria-hidden focusable="false">
      {CANDLES.map((c, i) => {
        const x = i * step + step / 2;
        const top = y(Math.max(c.open, c.close));
        const h = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
        return (
          <g key={i} className={c.close >= c.open ? "up" : "down"}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
            <rect x={x - body / 2} y={top} width={body} height={h} rx={1.5} strokeWidth={1} />
          </g>
        );
      })}
      <polyline className="ma" points={ma} />
    </svg>
  );
}

/* ═══════════════════ Showcase: live market card ═══════════════════ */

type PulseState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: MarketTicker[] };

function pickPulseRows(tickers: MarketTicker[]): MarketTicker[] {
  const priced = tickers.filter((t) => t.price != null && Number.isFinite(t.price));
  const majors = PULSE_BASES.map((b) => priced.find((t) => t.base?.toUpperCase() === b)).filter(
    (t): t is MarketTicker => Boolean(t),
  );
  if (majors.length >= PULSE_BASES.length) return majors;
  // Koi major list mein na ho to sabse zyada volume wale coins se bhar do.
  const rest = priced.filter((t) => !majors.includes(t)).sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
  return [...majors, ...rest].slice(0, PULSE_BASES.length);
}

function MarketPulse() {
  const [state, setState] = useState<PulseState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/overview/tickers", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: { tickers?: MarketTicker[] }) => {
          if (!alive) return;
          const rows = pickPulseRows(Array.isArray(data.tickers) ? data.tickers : []);
          // Pehle se data dikh raha ho to ek fail hui refresh use mitaye nahi.
          setState((prev) =>
            rows.length ? { status: "ready", rows } : prev.status === "ready" ? prev : { status: "error" },
          );
        })
        .catch(() => {
          if (alive) setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
        });
    };
    load();
    const id = window.setInterval(load, PULSE_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="auth-pulse auth-rise" style={{ animationDelay: "240ms" }} aria-label="Live market prices">
      <header className="auth-pulse-head">
        <span>
          <span className="auth-pulse-title">Market pulse</span>
          <span className="auth-pulse-sub">Perpetual futures · 24h</span>
        </span>
        <span className="auth-pulse-live" data-state={state.status}>
          <i aria-hidden />
          {state.status === "error" ? "Offline" : "Live"}
        </span>
      </header>

      {state.status === "error" ? (
        <p className="auth-pulse-empty">Live prices are unavailable right now.</p>
      ) : (
        <ol className="auth-pulse-rows">
          {state.status === "loading"
            ? PULSE_BASES.map((b) => (
                <li key={b} className="auth-pulse-row" data-skeleton>
                  <span className="auth-coin" />
                  <span className="auth-skel" style={{ width: 92 }} />
                  <span className="auth-skel auth-pulse-range" />
                  <span className="auth-skel" style={{ width: 84, justifySelf: "end" }} />
                  <span className="auth-skel" style={{ width: 62, justifySelf: "end" }} />
                </li>
              ))
            : state.rows.map((t) => <PulseRow key={t.symbol} t={t} />)}
        </ol>
      )}
    </section>
  );
}

function PulseRow({ t }: { t: MarketTicker }) {
  const chg = t.change_24h;
  const tone = chg == null ? "flat" : chg > 0 ? "up" : chg < 0 ? "down" : "flat";
  const { low_24h: lo, high_24h: hi, price } = t;
  const pos =
    lo != null && hi != null && price != null && hi > lo ? Math.min(1, Math.max(0, (price - lo) / (hi - lo))) : null;

  return (
    <li className="auth-pulse-row">
      <span className="auth-coin" aria-hidden>
        {t.base.slice(0, 3)}
      </span>
      <span className="auth-pulse-name">
        <strong>{t.base}</strong>
        <span>{t.name && t.name !== t.base ? t.name : "Perpetual"}</span>
      </span>
      <span
        className="auth-pulse-range"
        title={pos == null ? undefined : `24h range ${fmtPrice(lo)} – ${fmtPrice(hi)}`}
        aria-hidden
      >
        {pos != null && <i style={{ left: `${pos * 100}%` }} data-tone={tone} />}
      </span>
      <span className="auth-pulse-price">{fmtPrice(price)}</span>
      <span className="auth-pulse-chg" data-tone={tone}>
        {fmtPct(chg)}
      </span>
    </li>
  );
}
