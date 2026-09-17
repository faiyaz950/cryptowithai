"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Loader2,
  LogOut,
  Pencil,
  Plug,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DESK_TZ, DESK_TZ_LABEL, syncStamp } from "@/lib/cryptoApi";
import {
  AccountApiError,
  fetchExchangeOverview,
  listExchangeAccounts,
  updateFullName,
  verifyExchangeAccount,
  type ExchangeAccount,
  type ExchangeOverview,
} from "@/lib/accountApi";

/* ── Helpers ───────────────────────────────────────────── */

const EXCHANGE_NAMES: Record<string, string> = {
  delta: "Delta Exchange India",
  binance: "Binance",
  bybit: "Bybit",
};

function fmtMoney(value: number, digits = 2): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtQty(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: DESK_TZ });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: DESK_TZ })}, ${d.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DESK_TZ },
  )}`;
}

/** Delta "limit_order" bhejta hai; screen par "Limit" padhna behtar hai. */
function orderTypeLabel(raw: string): string {
  const cleaned = raw.replace(/_order$/, "").replace(/_/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "—";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Kabhi nahi";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Abhi";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min pehle`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} ghante pehle`;
  return `${Math.round(seconds / 86_400)} din pehle`;
}

function Issue({ message }: { message: string }) {
  return (
    <div className="pf-issue" role="alert">
      <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
      <p>{message}</p>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function ProfileDesk() {
  const { user, token, logout, handleExpiredSession } = useAuth();
  const [accounts, setAccounts] = useState<ExchangeAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const onApiError = useCallback(
    (err: unknown) => {
      if (err instanceof AccountApiError && err.status === 401) handleExpiredSession();
    },
    [handleExpiredSession],
  );

  useEffect(() => {
    if (!token) return;
    let alive = true;
    listExchangeAccounts(token)
      .then((list) => alive && setAccounts(list.filter((a) => a.is_active)))
      .catch((err) => {
        onApiError(err);
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Exchanges load nahi hue");
        setAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, [token, onApiError]);

  if (!user || !token) {
    return (
      <div className="pf-page">
        <section className="pf-empty">
          <span className="pf-empty-icon">
            <ShieldCheck className="w-6 h-6" />
          </span>
          <h3>Profile dekhne ke liye sign in karein</h3>
          <p>Aapka account, judi hui exchange aur uska live data — sab login ke peeche hai.</p>
          <Link href="/login?next=%2Fprofile" className="trade-btn trade-btn-primary">
            Sign in
            <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="pf-page">
      <IdentityCard onLogout={logout} />

      <section>
        <div className="pf-section-head">
          <h3>Judi hui exchange</h3>
          <Link href="/trade?tab=exchanges" className="pf-link">
            <Plug className="w-3.5 h-3.5" />
            Exchanges manage karein
          </Link>
        </div>

        {loadError && <Issue message={loadError} />}

        {accounts === null ? (
          <div className="pf-skeleton shimmer" />
        ) : accounts.length === 0 ? (
          <section className="pf-empty">
            <span className="pf-empty-icon">
              <Plug className="w-6 h-6" />
            </span>
            <h3>Abhi koi exchange nahi juda</h3>
            <p>
              Delta Exchange India ki API key jodiye — uske baad aapka wallet, khuli positions aur pending orders
              yahin is page par live dikhenge.
            </p>
            <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-primary">
              Exchange jodein
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        ) : (
          <div className="pf-accounts">
            {accounts.map((account) => (
              <ExchangeBlock key={account.id} account={account} token={token} onApiError={onApiError} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Account identity ──────────────────────────────────── */

function IdentityCard({ onLogout }: { onLogout: () => void }) {
  const { user, token, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await updateFullName(token, name.trim());
      await refreshUser();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Naam save nahi hua");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pf-card pf-identity">
      <span className="pf-avatar">{user.avatar}</span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="pf-name-edit">
            <input
              className="trade-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              aria-label="Full name"
            />
            <button
              type="button"
              className="trade-btn trade-btn-primary trade-size-sm"
              onClick={save}
              disabled={saving || name.trim().length < 2}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-ghost trade-size-sm"
              onClick={() => {
                setEditing(false);
                setName(user.name);
                setError("");
              }}
              disabled={saving}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="pf-name-row">
            <h2>{user.name}</h2>
            <button type="button" className="pf-link" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
              Naam badlein
            </button>
          </div>
        )}

        {error && <Issue message={error} />}

        <div className="pf-id-facts">
          <span>
            {user.email}
            {user.emailVerified ? (
              <b className="pf-verified">
                <BadgeCheck className="w-3.5 h-3.5" />
                Verified
              </b>
            ) : null}
          </span>
          <span>@{user.username}</span>
          <span>Member since {fmtDate(user.createdAt)}</span>
        </div>
      </div>

      <button type="button" className="trade-btn trade-btn-ghost trade-size-sm pf-logout" onClick={onLogout}>
        <LogOut className="w-3.5 h-3.5" />
        Logout
      </button>
    </section>
  );
}

/* ── Per-exchange live block ───────────────────────────── */

function ExchangeBlock({
  account,
  token,
  onApiError,
}: {
  account: ExchangeAccount;
  token: string;
  onApiError: (err: unknown) => void;
}) {
  const [overview, setOverview] = useState<ExchangeOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  /** Refresh / re-verify ke baad dobara fetch karane ke liye. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchExchangeOverview(token, account.id)
      .then((data) => {
        if (!alive) return;
        setOverview(data);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        onApiError(err);
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Data load nahi hua");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, account.id, reloadKey, onApiError]);

  /** User ke click par — pehle spinner, phir dobara fetch. */
  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const reverify = async () => {
    setVerifying(true);
    try {
      await verifyExchangeAccount(token, account.id);
    } catch (err) {
      onApiError(err);
    } finally {
      setVerifying(false);
      refresh();
    }
  };

  const name = EXCHANGE_NAMES[account.exchange] ?? account.exchange;
  const totals = overview?.totals;
  const profile = overview?.exchange_profile;
  // Re-verify ke baad list row purani reh jaati hai, isliye jo abhi live call
  // se aaya hai wahi pehle.
  const live = overview?.account ?? account;
  const healthy = live.permissions_verified && !live.last_error;

  // Key hi kaam na kare to wallet, positions aur orders — teeno wahi ek error
  // dete hain. Use teen baar dikhane ka koi matlab nahi: ek baar, saaf, aur
  // seedha wahin jaane ka rasta jahan key theek hoti hai.
  const sections = overview ? [overview.balances.error, overview.positions.error, overview.orders.error] : [];
  const keyBroken =
    sections.length > 0 && sections[0] !== "" && sections.every((e) => e === sections[0]) ? sections[0] : "";

  return (
    <article className="pf-card pf-exchange">
      <header className="pf-ex-head">
        <div className="min-w-0 flex-1">
          <div className="pf-ex-title">
            <h3>{name}</h3>
            <span className={`pf-pill ${healthy ? "pf-pill-ok" : "pf-pill-warn"}`}>
              <span className="pf-dot" />
              {healthy ? "Active" : "Dhyan dein"}
            </span>
          </div>
          <p className="pf-ex-sub">
            {live.label} · key <span className="tnum">{live.key_hint}</span> · verified{" "}
            {timeAgo(live.last_verified_at)}
          </p>
        </div>
        <div className="pf-ex-actions">
          <button type="button" className="pf-link" onClick={reverify} disabled={verifying}>
            <ShieldCheck className={`w-3.5 h-3.5 ${verifying ? "animate-pulse" : ""}`} />
            Re-verify
          </button>
          <button type="button" className="pf-link" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error && <Issue message={error} />}

      {loading && !overview ? (
        <div className="pf-skeleton shimmer" />
      ) : (
        overview && (
          <>
            {profile && (profile.account_name || profile.exchange_email || profile.exchange_username) && (
              <div className="pf-ex-who">
                <span>Exchange account</span>
                <b>
                  {profile.account_name || profile.exchange_username}
                  {profile.exchange_email ? ` · ${profile.exchange_email}` : ""}
                </b>
              </div>
            )}

            {keyBroken ? (
              <div className="pf-keybroken">
                <Issue message={keyBroken} />
                <Link href="/trade?tab=exchanges" className="trade-btn trade-btn-ghost trade-size-sm">
                  Key theek karein
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <>
            <div className="pf-stats">
              <div>
                <dt>Cash (USD)</dt>
                <dd className="tnum">{totals ? fmtMoney(totals.cash) : "—"}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd className="tnum">{totals ? fmtMoney(totals.cash_available) : "—"}</dd>
              </div>
              <div>
                <dt>Open positions</dt>
                <dd className="tnum">{totals?.open_positions ?? 0}</dd>
              </div>
              <div>
                <dt>Pending orders</dt>
                <dd className="tnum">{totals?.open_orders ?? 0}</dd>
              </div>
            </div>

            {/* Wallet */}
            <div className="pf-block">
              <h4 className="pf-block-head">
                <Wallet className="w-3.5 h-3.5" />
                Wallet
              </h4>
              {overview.balances.error ? (
                <Issue message={overview.balances.error} />
              ) : overview.balances.items.length === 0 ? (
                <p className="pf-note">Wallet khaali hai.</p>
              ) : (
                <div className="pf-balances">
                  {overview.balances.items.map((b) => (
                    <div key={b.asset} className="pf-balance">
                      <span className="pf-balance-asset">{b.asset}</span>
                      <span className="pf-balance-value tnum">{fmtQty(b.balance)}</span>
                      {b.available !== b.balance && (
                        <span className="pf-balance-avail tnum">{fmtQty(b.available)} available</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Positions */}
            <div className="pf-block">
              <h4 className="pf-block-head">Khuli positions</h4>
              {overview.positions.error ? (
                <Issue message={overview.positions.error} />
              ) : overview.positions.items.length === 0 ? (
                <p className="pf-note">Koi position khuli nahi hai.</p>
              ) : (
                <div className="pf-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Side</th>
                        <th className="pf-num">Size</th>
                        <th className="pf-num">Entry</th>
                        <th className="pf-num">Mark</th>
                        <th className="pf-num">Move</th>
                        <th className="pf-num">Liquidation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.positions.items.map((p) => (
                        <tr key={`${p.symbol}-${p.side}-${p.entry_price}`}>
                          <td className="pf-sym">{p.symbol}</td>
                          <td>
                            <span className={`pf-side pf-side-${p.side}`}>{p.side === "long" ? "Long" : "Short"}</span>
                          </td>
                          <td className="pf-num tnum">{fmtQty(p.size)}</td>
                          <td className="pf-num tnum">{fmtMoney(p.entry_price)}</td>
                          <td className="pf-num tnum">{p.mark_price ? fmtMoney(p.mark_price) : "—"}</td>
                          <td className="pf-num tnum" data-up={p.move_pct !== null ? p.move_pct >= 0 : undefined}>
                            {p.move_pct === null ? "—" : `${p.move_pct >= 0 ? "+" : ""}${p.move_pct.toFixed(2)}%`}
                          </td>
                          <td className="pf-num tnum">{p.liquidation_price ? fmtMoney(p.liquidation_price) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="pf-note">
                    Move = entry se mark tak ka price change (side ke hisaab se). Exact rupee-PnL exchange par hi
                    dekhein — usme contract size, fees aur funding jodna padta hai.
                  </p>
                </div>
              )}
            </div>

            {/* Orders */}
            <div className="pf-block">
              <h4 className="pf-block-head">Pending orders</h4>
              {overview.orders.error ? (
                <Issue message={overview.orders.error} />
              ) : overview.orders.items.length === 0 ? (
                <p className="pf-note">Koi order pending nahi hai.</p>
              ) : (
                <div className="pf-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Side</th>
                        <th>Type</th>
                        <th className="pf-num">Size</th>
                        <th className="pf-num">Price</th>
                        <th>Lagaya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.orders.items.map((o) => (
                        <tr key={String(o.id)}>
                          <td className="pf-sym">{o.symbol}</td>
                          <td>
                            <span className={`pf-side pf-side-${o.side === "buy" ? "long" : "short"}`}>
                              {o.side === "buy" ? "Buy" : "Sell"}
                            </span>
                          </td>
                          <td className="pf-muted">{orderTypeLabel(o.order_type)}</td>
                          <td className="pf-num tnum">
                            {fmtQty(o.unfilled_size)}
                            {o.unfilled_size !== o.size && <span className="pf-muted"> / {fmtQty(o.size)}</span>}
                          </td>
                          <td className="pf-num tnum">{o.price ? fmtMoney(o.price) : "Market"}</td>
                          <td className="pf-muted">{fmtDateTime(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

              </>
            )}

            <footer className="pf-ex-foot">
              Live {name} se · {syncStamp(new Date(overview.fetched_at))} {DESK_TZ_LABEL}
            </footer>
          </>
        )
      )}
    </article>
  );
}
