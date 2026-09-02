"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Logo from "@/components/Logo";

type Tab = "login" | "signup";

const FEATURES = [
  {
    title: "Indian Stock Market",
    desc: "NSE/BSE stocks ka fundamental & technical analysis, sector insights, IPO guidance",
  },
  {
    title: "Cryptocurrency",
    desc: "Bitcoin, Ethereum aur top altcoins — market cycles, DeFi, India tax rules",
  },
  {
    title: "Mutual Funds",
    desc: "SIP planning, ELSS tax saving, fund comparison, NAV aur expense ratio analysis",
  },
];

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
      if (tab === "login") {
        await login(email, password);
      } else {
        await signup(name, email, password);
      }
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError("");
    setLoading(true);
    try {
      await login("demo@finowings.com", "demo123");
      router.push("/");
    } catch {
      setError("Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-primary)" }}>

      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-12"
        style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--bg-hover)" }}
      >
        {/* Brand */}
        <div>
          <div className="mb-16">
            <Logo size={40} showName subtitle="by Finowings" />
          </div>

          <h2 className="text-3xl font-semibold mb-3 leading-snug" style={{ color: "var(--text-primary)" }}>
            India ka Financial<br />Intelligence Platform
          </h2>
          <p className="text-sm mb-12" style={{ color: "var(--text-muted)", lineHeight: "1.7" }}>
            Expert-level market analysis, real-time insights aur personalized guidance — Hindi, Hinglish ya English mein.
          </p>

          <div className="space-y-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex gap-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-muted)" }} />
                </div>
                <div>
                  <div className="text-sm font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>{f.title}</div>
                  <div className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="flex items-center gap-8 pt-8" style={{ borderTop: "1px solid var(--bg-hover)" }}>
          {[
            { value: "2,200+", label: "NSE Stocks" },
            { value: "500+", label: "Cryptos" },
            { value: "1,500+", label: "MF Schemes" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{s.value}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="card-elevated w-full max-w-sm rounded-2xl p-6 sm:p-8">

          {/* Mobile brand */}
          <div className="mb-10 lg:hidden">
            <Logo size={36} showName />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
              {tab === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {tab === "login"
                ? "Sign in to continue to Finowings AI"
                : "Join Finowings AI — free mein shuru karein"}
            </p>
          </div>

          {/* Tab switcher */}
          <div
            className="flex rounded-lg p-0.5 mb-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {(["login", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className="flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150"
                style={{
                  background: tab === t ? "var(--border)" : "transparent",
                  color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {t === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name (signup only) */}
            {tab === "signup" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Faiyaz Mujtaba"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-muted)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-muted)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "Min 6 characters" : "Enter password"}
                  required
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm outline-none transition-all"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-muted)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="px-3.5 py-2.5 rounded-lg text-sm"
                style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171" }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                background: loading ? "var(--bg-hover)" : "linear-gradient(135deg, #1e40af, #2563eb)",
                color: loading ? "var(--text-muted)" : "#ffffff",
                border: "none",
                boxShadow: loading ? "none" : "0 8px 20px rgba(37, 99, 235, 0.22)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "linear-gradient(135deg, #1e3a8a, #1e40af)"; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "linear-gradient(135deg, #1e40af, #2563eb)"; }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {tab === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : tab === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "var(--bg-hover)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--bg-hover)" }} />
          </div>

          {/* Demo login */}
          <button
            onClick={handleDemo}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--bg-card)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
          >
            Try Demo Account
          </button>


          <p className="text-center text-xs mt-5" style={{ color: "var(--text-muted)" }}>
            By continuing, you agree to Finowings{" "}
            <span
              className="cursor-pointer transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Terms of Service
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
