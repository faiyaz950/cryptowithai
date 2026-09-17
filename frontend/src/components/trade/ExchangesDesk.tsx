"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  AccountApiError,
  connectExchangeAccount,
  deleteExchangeAccount,
  fetchExchangeBalances,
  listExchangeAccounts,
  verifyExchangeAccount,
  type ExchangeAccount,
  type ExchangeBalance,
  type ExchangeId,
} from "@/lib/accountApi";

/* ── Catalogue ─────────────────────────────────────────── */

interface CatalogEntry {
  id: string;
  name: string;
  tagline: string;
  region: "India" | "Global";
  /** Sirf wahi exchange "available" jiska backend adapter sach mein bana hai. */
  available: boolean;
  mark: string;
  tint: string;
}

const CATALOG: CatalogEntry[] = [
  { id: "delta", name: "Delta Exchange India", tagline: "BTC/ETH options · USD perpetuals", region: "India", available: true, mark: "Δ", tint: "#ff8a3d" },
  { id: "coindcx", name: "CoinDCX", tagline: "USDT + INR perpetuals", region: "India", available: false, mark: "C", tint: "#3b82f6" },
  { id: "pi42", name: "Pi42", tagline: "INR-margined perpetuals", region: "India", available: false, mark: "π", tint: "#a78bfa" },
  { id: "coinswitch", name: "CoinSwitch", tagline: "INR ramps · spot", region: "India", available: false, mark: "S", tint: "#22d3ee" },
  { id: "binance", name: "Binance", tagline: "Deepest liquidity · USDT perps", region: "Global", available: false, mark: "B", tint: "#f0b90b" },
  { id: "bybit", name: "Bybit", tagline: "USDT-margined contracts", region: "Global", available: false, mark: "B", tint: "#f7a600" },
  { id: "okx", name: "OKX", tagline: "Perps + options", region: "Global", available: false, mark: "O", tint: "#e5e7eb" },
  { id: "deribit", name: "Deribit", tagline: "BTC/ETH options", region: "Global", available: false, mark: "D", tint: "#34d399" },
];

const catalogFor = (exchange: string) =>
  CATALOG.find((c) => c.id === exchange) ?? { ...CATALOG[0], id: exchange, name: exchange, mark: exchange[0]?.toUpperCase() ?? "?" };

/* ── Helpers ───────────────────────────────────────────── */

function timeAgo(iso: string | null): string {
  if (!iso) return "Kabhi nahi";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Abhi";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min pehle`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} ghante pehle`;
  return `${Math.round(seconds / 86_400)} din pehle`;
}

function fmtBalance(value: number, asset: string): string {
  const stable = /^(USD|USDT|USDC|INR)$/i.test(asset);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: stable ? 2 : 0,
    maximumFractionDigits: stable ? 2 : 6,
  });
}

function ExchangeMark({ entry, size = 40 }: { entry: CatalogEntry; size?: number }) {
  return (
    <span
      className="ex-mark"
      style={{
        width: size,
        height: size,
        color: entry.tint,
        background: `${entry.tint}1a`,
        borderColor: `${entry.tint}40`,
        fontSize: Math.round(size * 0.44),
      }}
      aria-hidden
    >
      {entry.mark}
    </span>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ex-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard band ho to user khud select kar le */
        }
      }}
      title="Copy karein"
    >
      <span className="tnum">{value}</span>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/** Backend ka error, aur IP whitelist wala ho to wahi IP copy karne layak. */
function IssueBox({ message, clientIp }: { message: string; clientIp?: string | null }) {
  return (
    <div className="ex-issue" role="alert">
      <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
      <div className="min-w-0">
        <p>{message}</p>
        {clientIp && (
          <div className="ex-issue-ip">
            <span>Whitelist karne wala IP</span>
            <CopyChip value={clientIp} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────── */

type BalanceState =
  | { status: "loading" }
  | { status: "ready"; data: ExchangeBalance[] }
  | { status: "error"; message: string; clientIp: string | null };

export default function ExchangesDesk() {
  const { user, token, handleExpiredSession } = useAuth();
  const [accounts, setAccounts] = useState<ExchangeAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<CatalogEntry | null>(null);
  const [balances, setBalances] = useState<Record<number, BalanceState>>({});

  const onApiError = useCallback(
    (err: unknown) => {
      if (err instanceof AccountApiError && err.status === 401) handleExpiredSession();
    },
    [handleExpiredSession],
  );

  const loadBalances = useCallback(
    async (accountId: number) => {
      if (!token) return;
      setBalances((prev) => ({ ...prev, [accountId]: { status: "loading" } }));
      try {
        const data = await fetchExchangeBalances(token, accountId);
        setBalances((prev) => ({ ...prev, [accountId]: { status: "ready", data } }));
      } catch (err) {
        onApiError(err);
        setBalances((prev) => ({
          ...prev,
          [accountId]: {
            status: "error",
            message: err instanceof Error ? err.message : "Balance nahi mila",
            clientIp: err instanceof AccountApiError ? err.clientIp : null,
          },
        }));
      }
    },
    [token, onApiError],
  );

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    try {
      const list = (await listExchangeAccounts(token)).filter((a) => a.is_active);
      setAccounts(list);
      setLoadError(null);
      for (const account of list) void loadBalances(account.id);
    } catch (err) {
      onApiError(err);
      setLoadError(err instanceof Error ? err.message : "Exchanges load nahi hue");
      setAccounts((prev) => prev ?? []);
    }
  }, [token, onApiError, loadBalances]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const connectedCount = accounts?.length ?? 0;
  const deltaEntry = CATALOG[0];

  return (
    <div className="ex-page">
      <header className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Exchanges</div>
          <h2 className="trade-page-title">
            {user ? `${connectedCount} connected` : "Apna exchange jodein"}
          </h2>
          <p className="trade-page-sub">
            Exchange ki API key jodein — orders aur positions aapke apne account se chalenge.
          </p>
        </div>
        {user && (
          <div className="trade-page-actions">
            <button type="button" className="trade-btn trade-btn-primary" onClick={() => setConnecting(deltaEntry)}>
              <Plus className="w-4 h-4" />
              Connect exchange
            </button>
          </div>
        )}
      </header>

      <div className="ex-trust">
        <div className="ex-trust-item">
          <Lock className="w-4 h-4" />
          <span>
            <b>Encrypted storage</b>
            Key aur secret server par encrypt hokar save hote hain
          </span>
        </div>
        <div className="ex-trust-item">
          <ShieldOff className="w-4 h-4" />
          <span>
            <b>Withdrawal kabhi nahi</b>
            Sirf Read + Trading permission chahiye
          </span>
        </div>
        <div className="ex-trust-item">
          <Trash2 className="w-4 h-4" />
          <span>
            <b>Disconnect = delete</b>
            Hatate hi keys permanently mit jaati hain
          </span>
        </div>
      </div>

      {!user ? (
        <section className="ex-empty">
          <span className="ex-empty-icon">
            <KeyRound className="w-6 h-6" />
          </span>
          <h3>Exchange jodne ke liye sign in karein</h3>
          <p>
            API keys aapke account se judti hain, isliye pehle login ya free account banana hoga. Charts aur AI bina
            login bhi chalte rahenge.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/login?next=%2Ftrade%3Ftab%3Dexchanges" className="trade-btn trade-btn-primary">
              Sign in
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login?next=%2Ftrade%3Ftab%3Dexchanges" className="trade-btn trade-btn-ghost">
              Free account banayein
            </Link>
          </div>
        </section>
      ) : accounts === null ? (
        <div className="ex-skeleton shimmer" />
      ) : (
        <>
          {loadError && <IssueBox message={loadError} />}
          {accounts.length === 0 ? (
            <section className="ex-empty">
              <span className="ex-empty-icon">
                <Plug className="w-6 h-6" />
              </span>
              <h3>Abhi koi exchange nahi juda</h3>
              <p>
                Delta Exchange India ki Read + Trading API key jodein. Withdrawal permission kabhi nahi maangi jaati.
              </p>
              <button type="button" className="trade-btn trade-btn-primary" onClick={() => setConnecting(deltaEntry)}>
                <Plus className="w-4 h-4" />
                Pehla exchange jodein
              </button>
            </section>
          ) : (
            <section className="ex-connected">
              {accounts.map((account) => (
                <ConnectedCard
                  key={account.id}
                  account={account}
                  token={token!}
                  balance={balances[account.id]}
                  onReloadBalance={() => loadBalances(account.id)}
                  onChanged={loadAccounts}
                  onApiError={onApiError}
                />
              ))}
            </section>
          )}
        </>
      )}

      <section>
        <div className="ex-section-head">
          <h3>All exchanges</h3>
          <span>{CATALOG.filter((c) => c.available).length} live · {CATALOG.filter((c) => !c.available).length} jald aa rahe hain</span>
        </div>
        <div className="ex-grid">
          {CATALOG.map((entry) => (
            <article key={entry.id} className="ex-tile" data-available={entry.available}>
              <div className="ex-tile-top">
                <ExchangeMark entry={entry} size={36} />
                <span className={`ex-pill ${entry.available ? "ex-pill-live" : ""}`}>
                  {entry.available ? "Live" : "Coming soon"}
                </span>
              </div>
              <h4>{entry.name}</h4>
              <p>
                {entry.region} · {entry.tagline}
              </p>
              {entry.available ? (
                user ? (
                  <button type="button" className="trade-btn trade-btn-ghost ex-tile-btn" onClick={() => setConnecting(entry)}>
                    <Plug className="w-3.5 h-3.5" />
                    Connect
                  </button>
                ) : (
                  <Link href="/login?next=%2Ftrade%3Ftab%3Dexchanges" className="trade-btn trade-btn-ghost ex-tile-btn">
                    Sign in to connect
                  </Link>
                )
              ) : (
                <button type="button" className="trade-btn trade-btn-ghost ex-tile-btn" disabled>
                  Coming soon
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      {connecting && token && (
        <ConnectModal
          entry={connecting}
          token={token}
          onClose={() => setConnecting(null)}
          onConnected={() => void loadAccounts()}
          onApiError={onApiError}
        />
      )}
    </div>
  );
}

/* ── Connected account card ────────────────────────────── */

function ConnectedCard({
  account,
  token,
  balance,
  onReloadBalance,
  onChanged,
  onApiError,
}: {
  account: ExchangeAccount;
  token: string;
  balance?: BalanceState;
  onReloadBalance: () => void;
  onChanged: () => Promise<void>;
  onApiError: (err: unknown) => void;
}) {
  const entry = catalogFor(account.exchange);
  const [busy, setBusy] = useState<"verify" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [issue, setIssue] = useState<{ message: string; clientIp: string | null } | null>(null);

  const healthy = account.permissions_verified && !account.last_error;

  const reverify = async () => {
    setBusy("verify");
    setIssue(null);
    try {
      await verifyExchangeAccount(token, account.id);
      onReloadBalance();
    } catch (err) {
      onApiError(err);
      setIssue({
        message: err instanceof Error ? err.message : "Verify nahi ho paya",
        clientIp: err instanceof AccountApiError ? err.clientIp : null,
      });
    } finally {
      await onChanged();
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("delete");
    try {
      await deleteExchangeAccount(token, account.id);
      await onChanged();
    } catch (err) {
      onApiError(err);
      setIssue({ message: err instanceof Error ? err.message : "Disconnect nahi ho paya", clientIp: null });
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <article className="ex-card" data-healthy={healthy}>
      <div className="ex-card-head">
        <ExchangeMark entry={entry} size={44} />
        <div className="min-w-0 flex-1">
          <div className="ex-card-title">
            <h4>{entry.name}</h4>
            <span className={`ex-status ${healthy ? "ex-status-ok" : "ex-status-warn"}`}>
              <span className="ex-status-dot" />
              {healthy ? "Active" : "Dhyan dein"}
            </span>
          </div>
          <p className="ex-card-sub">
            {account.label} · key <span className="tnum">{account.key_hint}</span>
          </p>
        </div>
      </div>

      <dl className="ex-facts">
        <div>
          <dt>Trading</dt>
          <dd style={{ color: account.can_trade ? "var(--green)" : "var(--text-muted)" }}>
            {account.can_trade ? "Enabled" : "Off"}
          </dd>
        </div>
        <div>
          <dt>Withdrawal</dt>
          <dd>Exchange par OFF rakhein</dd>
        </div>
        <div>
          <dt>Last verified</dt>
          <dd>{timeAgo(account.last_verified_at)}</dd>
        </div>
        <div>
          <dt>Connected</dt>
          <dd>{account.created_at ? new Date(account.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd>
        </div>
      </dl>

      <div className="ex-balances">
        <div className="ex-balances-head">
          <Wallet className="w-3.5 h-3.5" />
          <span>Wallet</span>
          <button type="button" className="ex-link" onClick={onReloadBalance} disabled={balance?.status === "loading"}>
            <RefreshCw className={`w-3 h-3 ${balance?.status === "loading" ? "spin-slow" : ""}`} />
            Refresh
          </button>
        </div>
        {!balance || balance.status === "loading" ? (
          <div className="ex-balance-skeleton shimmer" />
        ) : balance.status === "error" ? (
          <p className="ex-balance-note">
            {/* Key hi kharab ho to wahi error neeche box mein pehle se hai — do baar mat dikhao. */}
            {balance.message === (issue?.message ?? account.last_error)
              ? "Key theek hone par balance yahan dikhega."
              : balance.message}
          </p>
        ) : balance.data.length === 0 ? (
          <p className="ex-balance-note">Wallet khaali hai</p>
        ) : (
          <div className="ex-balance-list">
            {balance.data.slice(0, 4).map((b) => (
              <div key={b.asset} className="ex-balance">
                <span className="ex-balance-asset">{b.asset}</span>
                <span className="ex-balance-value tnum">{fmtBalance(b.balance, b.asset)}</span>
                {b.available !== b.balance && (
                  <span className="ex-balance-avail tnum">{fmtBalance(b.available, b.asset)} available</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(issue || account.last_error) && (
        <IssueBox message={issue?.message ?? account.last_error} clientIp={issue?.clientIp} />
      )}

      {confirming ? (
        <div className="ex-confirm">
          <p>
            <b>Disconnect karein?</b> Encrypted key aur secret server se permanently delete honge. Dobara jodne ke liye
            key phir se daalni hogi.
          </p>
          <div className="flex gap-2">
            <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => setConfirming(false)} disabled={busy === "delete"}>
              Cancel
            </button>
            <button type="button" className="trade-btn trade-size-sm ex-danger" onClick={disconnect} disabled={busy === "delete"}>
              {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Haan, disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="ex-card-actions">
          <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={reverify} disabled={busy !== null}>
            {busy === "verify" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {busy === "verify" ? "Verify ho raha hai…" : "Re-verify"}
          </button>
          <button type="button" className="trade-btn trade-btn-ghost trade-size-sm ex-danger-ghost" onClick={() => setConfirming(true)} disabled={busy !== null}>
            <Trash2 className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      )}
    </article>
  );
}

/* ── Connect modal ─────────────────────────────────────── */

function ConnectModal({
  entry,
  token,
  onClose,
  onConnected,
  onApiError,
}: {
  entry: CatalogEntry;
  token: string;
  onClose: () => void;
  onConnected: () => void;
  onApiError: (err: unknown) => void;
}) {
  const [step, setStep] = useState<"guide" | "form" | "done">("guide");
  const [label, setLabel] = useState("Main account");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [withdrawOff, setWithdrawOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issue, setIssue] = useState<{ message: string; clientIp: string | null } | null>(null);
  const [keyHint, setKeyHint] = useState("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    if (step === "form") firstFieldRef.current?.focus();
  }, [step]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!withdrawOff) return;
    setSubmitting(true);
    setIssue(null);
    try {
      const result = await connectExchangeAccount(token, {
        exchange: entry.id as ExchangeId,
        label: label.trim() || "Main account",
        apiKey: apiKey.trim(),
        secretKey: secret.trim(),
      });
      setKeyHint(result.key_hint);
      // Secret browser memory mein bhi zaroorat se zyada na rahe.
      setApiKey("");
      setSecret("");
      setStep("done");
      onConnected();
    } catch (err) {
      onApiError(err);
      setIssue({
        message: err instanceof Error ? err.message : "Connect nahi ho paya",
        clientIp: err instanceof AccountApiError ? err.clientIp : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ex-overlay" onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <div className="ex-modal" role="dialog" aria-modal="true" aria-labelledby="ex-modal-title">
        <div className="ex-modal-head">
          <ExchangeMark entry={entry} size={38} />
          <div className="min-w-0 flex-1">
            <h3 id="ex-modal-title">Connect {entry.name}</h3>
            <p>{step === "done" ? "Ho gaya" : step === "guide" ? "Step 1 of 2 · API key banayein" : "Step 2 of 2 · Key daalein"}</p>
          </div>
          <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={onClose} disabled={submitting} aria-label="Band karein">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step !== "done" && (
          <div className="ex-steps" aria-hidden>
            <span data-on="true" />
            <span data-on={step === "form"} />
          </div>
        )}

        {step === "guide" && (
          <div className="ex-modal-body">
            <ol className="ex-guide">
              <li>
                <span className="ex-guide-num">1</span>
                <div>
                  <b>Delta Exchange India par login karein</b>
                  <p>
                    <a href="https://india.delta.exchange" target="_blank" rel="noopener noreferrer" className="ex-link">
                      india.delta.exchange
                    </a>{" "}
                    → Account → <b>API Keys</b> → Create new API key. Global delta.exchange ki key yahan kaam nahi karegi.
                  </p>
                </div>
              </li>
              <li>
                <span className="ex-guide-num">2</span>
                <div>
                  <b>Permissions chuniye</b>
                  <div className="ex-perms">
                    <span className="ex-perm ex-perm-on"><Check className="w-3 h-3" /> Read Data</span>
                    <span className="ex-perm ex-perm-on"><Check className="w-3 h-3" /> Trading</span>
                    <span className="ex-perm ex-perm-off"><X className="w-3 h-3" /> Withdrawal / Transfer</span>
                  </div>
                </div>
              </li>
              <li>
                <span className="ex-guide-num">3</span>
                <div>
                  <b>IP whitelist (agar lagayein)</b>
                  <p>
                    Key par IP restriction lagayi to humare server ka IP add karna hoga. Connect fail hua to hum wahi
                    exact IP dikhayenge, copy karke add kar dijiye.
                  </p>
                </div>
              </li>
              <li>
                <span className="ex-guide-num">4</span>
                <div>
                  <b>Key aur Secret copy karein</b>
                  <p>Secret sirf ek baar dikhta hai — abhi copy kar lijiye.</p>
                </div>
              </li>
            </ol>
            <div className="ex-modal-actions">
              <button type="button" className="trade-btn trade-btn-ghost" onClick={onClose}>
                Baad mein
              </button>
              <button type="button" className="trade-btn trade-btn-primary" onClick={() => setStep("form")}>
                Key ready hai
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === "form" && (
          <form className="ex-modal-body" onSubmit={submit}>
            <label className="ex-field">
              <span className="trade-label">Label</span>
              <input
                ref={firstFieldRef}
                className="trade-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={40}
                placeholder="Main account"
              />
            </label>
            <label className="ex-field">
              <span className="trade-label">API key</span>
              <input
                className="trade-input ex-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Delta se copy ki hui API key"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="ex-field">
              <span className="trade-label">API secret</span>
              <span className="ex-secret">
                <input
                  className="trade-input ex-mono"
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="API secret"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <button
                  type="button"
                  className="ex-secret-eye"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? "Secret chhupao" : "Secret dikhao"}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>

            <label className="ex-check">
              <input type="checkbox" checked={withdrawOff} onChange={(e) => setWithdrawOff(e.target.checked)} />
              <span>Maine is key par <b>withdrawal / transfer permission OFF</b> rakhi hai.</span>
            </label>

            <p className="ex-secure-note">
              <Lock className="w-3.5 h-3.5 flex-none mt-px" />
              Key connect hone se pehle Delta se verify hoti hai, phir encrypt hokar save hoti hai. Secret dobara kabhi
              screen par nahi dikhaya jaata.
            </p>

            {issue && <IssueBox message={issue.message} clientIp={issue.clientIp} />}

            <div className="ex-modal-actions">
              <button type="button" className="trade-btn trade-btn-ghost" onClick={() => setStep("guide")} disabled={submitting}>
                Peeche
              </button>
              <button
                type="submit"
                className="trade-btn trade-btn-primary"
                disabled={submitting || !withdrawOff || !apiKey.trim() || !secret.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Delta se verify ho raha hai…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Verify & connect
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="ex-modal-body ex-done">
            <span className="ex-done-icon">
              <CheckCircle2 className="w-8 h-8" />
            </span>
            <h4>{entry.name} connected</h4>
            <p>
              Key <span className="tnum">{keyHint}</span> verify hokar judi. Wallet balance card par dikh raha hai.
            </p>
            <button type="button" className="trade-btn trade-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
