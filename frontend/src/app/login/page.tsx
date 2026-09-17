"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CandlestickChart,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Tab = "login" | "signup";

const FEATURES = [
  {
    icon: CandlestickChart,
    title: "Live Delta charts",
    desc: "Har trade par banti candles, screener, backtest aur Risk Desk — ek jagah.",
  },
  {
    icon: KeyRound,
    title: "Apna exchange jodein",
    desc: "Delta Exchange India ki API key jodein; orders aur positions aapke apne account se.",
  },
  {
    icon: Sparkles,
    title: "AI trading desk",
    desc: "Live data par chalne wala assistant — Hindi, Hinglish ya English mein.",
  },
];

/**
 * Login ke baad wapas wahin bhejo jahan se user aaya tha (`?next=/trade?tab=exchanges`).
 * Sirf apni site ke path — "//evil.com" jaisa bahar ka redirect nahi.
 */
function safeNext(): string {
  if (typeof window === "undefined") return "/trade";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/trade";
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
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya, dobara try karein");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
  };

  return (
    <div className="trade-root auth-root">
      <aside className="auth-aside" aria-hidden={false}>
        <div>
          <div className="auth-brand">
            <span className="auth-brand-mark">F</span>
            <span>
              <span className="auth-brand-name">Finowings</span>
              <span className="auth-brand-sub">Desk</span>
            </span>
          </div>

          <h2 className="auth-headline">
            Apne exchange account se
            <br />
            <span className="auth-headline-accent">seedha trade karein.</span>
          </h2>
          <p className="auth-lede">
            Ek account banayein, Delta Exchange India ki API key jodein, aur desk ke saare tools aapke apne
            portfolio par chalenge.
          </p>

          <ul className="auth-features">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="auth-feature">
                  <span className="auth-feature-icon">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="auth-feature-title">{f.title}</span>
                    <span className="auth-feature-desc">{f.desc}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="auth-trust">
          <ShieldCheck className="w-4 h-4 flex-none" />
          <span>
            API keys encrypted store hoti hain, withdrawal permission kabhi nahi maangi jaati, aur disconnect
            karte hi permanently delete.
          </span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-card-brand">
            <span className="auth-brand-mark">F</span>
            <span className="auth-brand-name">Finowings Desk</span>
          </div>

          <h1 className="auth-title">{tab === "login" ? "Welcome back" : "Account banayein"}</h1>
          <p className="auth-subtitle">
            {tab === "login"
              ? "Apne Finowings account mein sign in karein."
              : "Free account — exchange jodne aur apni settings save karne ke liye."}
          </p>

          <div className="auth-tabs" role="tablist">
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

          <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
            {tab === "signup" && (
              <label className="auth-field">
                <span className="trade-label">Full name</span>
                <input
                  type="text"
                  className="trade-input auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aapka naam"
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label className="auth-field">
              <span className="trade-label">Email</span>
              <input
                type="email"
                className="trade-input auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="auth-field">
              <span className="trade-label">Password</span>
              <span className="auth-password">
                <input
                  type={showPassword ? "text" : "password"}
                  className="trade-input auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "Kam se kam 8 characters" : "Password"}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  minLength={tab === "signup" ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Password chhupao" : "Password dikhao"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="trade-btn trade-btn-primary auth-submit">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tab === "login" ? "Signing in…" : "Account ban raha hai…"}
                </>
              ) : (
                <>
                  {tab === "login" ? "Sign in" : "Create account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>ya</span>
          </div>

          <Link href="/trade" className="trade-btn trade-btn-ghost auth-guest">
            Bina account desk dekhein
          </Link>

          <p className="auth-footnote">
            <Lock className="w-3 h-3 inline -mt-0.5" /> Charts aur AI bina login bhi chalte hain. Exchange jodne ke
            liye account zaroori hai.
          </p>
        </div>
      </main>
    </div>
  );
}
