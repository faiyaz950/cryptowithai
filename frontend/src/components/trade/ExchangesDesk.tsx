"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Copy as CopyIcon,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
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
  fetchEgressIps,
  fetchExchangeCatalogue,
  fetchTradingViewSetup,
  regenerateTradingViewToken,
  updateTradingSettings,
  fetchExchangeBalances,
  listExchangeAccounts,
  verifyExchangeAccount,
  type EgressIps,
  type ExchangeAccount,
  type ExchangeBalance,
  type ExchangeCatalogueEntry,
  type TradingSettings,
  type TradingViewSetup,
  type ExchangeId,
} from "@/lib/accountApi";

/* ── Catalogue ─────────────────────────────────────────── */

/**
 * Kaun se exchange jud sakte hain, ye backend batata hai (`/byok/exchanges`).
 * Yahan sirf dikhne wali cheezein hain — har exchange ka nishaan aur rang —
 * kyunki backend ko UI ke rangon se koi matlab nahi hona chahiye.
 */
const VISUALS: Record<string, { mark: string; tint: string }> = {
  delta: { mark: "Δ", tint: "#ff8a3d" },
  coindcx: { mark: "C", tint: "#3b82f6" },
  bybit: { mark: "B", tint: "#f7a600" },
  pi42: { mark: "π", tint: "#a78bfa" },
  mudrex: { mark: "M", tint: "#8b5cf6" },
  binance: { mark: "B", tint: "#f0b90b" },
  okx: { mark: "O", tint: "#e5e7eb" },
  deribit: { mark: "D", tint: "#34d399" },
};

interface CatalogEntry {
  id: string;
  name: string;
  tagline: string;
  region: string;
  /** Sirf wahi exchange "available" jiska backend adapter sach mein bana hai. */
  available: boolean;
  keyUrl: string;
  mark: string;
  tint: string;
}

function toEntry(row: ExchangeCatalogueEntry): CatalogEntry {
  const visual = VISUALS[row.id] ?? { mark: row.name[0]?.toUpperCase() ?? "?", tint: "#94a3b8" };
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    region: row.region,
    available: row.available,
    keyUrl: row.key_url,
    ...visual,
  };
}

/** Jab tak list aa nahi jaati, aur agar kabhi na aaye — kuch to dikhna chahiye. */
const FALLBACK: CatalogEntry[] = [
  {
    id: "delta",
    name: "Delta Exchange India",
    tagline: "BTC/ETH options · USD perpetuals",
    region: "India",
    available: true,
    keyUrl: "https://india.delta.exchange/app/account/manageapikeys",
    ...VISUALS.delta,
  },
];

/* ── Helpers ───────────────────────────────────────────── */

const catalogFor = (catalog: CatalogEntry[], exchange: string): CatalogEntry =>
  catalog.find((c) => c.id === exchange) ?? {
    id: exchange,
    name: exchange,
    tagline: "",
    region: "",
    available: true,
    keyUrl: "",
    mark: exchange[0]?.toUpperCase() ?? "?",
    tint: "#94a3b8",
  };

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
  const [catalog, setCatalog] = useState<CatalogEntry[]>(FALLBACK);
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

  useEffect(() => {
    let alive = true;
    fetchExchangeCatalogue()
      .then((rows) => alive && rows.length && setCatalog(rows.map(toEntry)))
      .catch(() => {
        /* list na aaye to FALLBACK hi sahi — page bekaar nahi hona chahiye */
      });
    return () => {
      alive = false;
    };
  }, []);

  const connectedCount = accounts?.length ?? 0;
  const liveEntries = catalog.filter((c) => c.available);
  const defaultEntry = liveEntries[0] ?? catalog[0];

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
            <button
              type="button"
              className="trade-btn trade-btn-primary"
              onClick={() => setConnecting((cur) => (cur ? null : defaultEntry))}
            >
              {connecting ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {connecting ? "Form band karein" : "Connect exchange"}
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
                Delta, CoinDCX ya Bybit ki Read + Trading API key jodein. Withdrawal permission kabhi nahi maangi
                jaati.
              </p>
              <button type="button" className="trade-btn trade-btn-primary" onClick={() => setConnecting(defaultEntry)}>
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
                  catalog={catalog}
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

      {connecting && token && (
        <ConnectPanel
          entry={connecting}
          catalog={catalog}
          token={token}
          onPickExchange={setConnecting}
          onClose={() => setConnecting(null)}
          onConnected={() => void loadAccounts()}
          onApiError={onApiError}
        />
      )}

      {user && token && <AutomationPanel token={token} onApiError={onApiError} />}

      <section>
        <div className="ex-section-head">
          <h3>All exchanges</h3>
          <span>
            {liveEntries.length} live · {catalog.length - liveEntries.length} jald aa rahe hain
          </span>
        </div>
        <div className="ex-grid">
          {catalog.map((entry) => (
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
                  <button
                    type="button"
                    className="trade-btn trade-btn-ghost ex-tile-btn"
                    data-open={connecting?.id === entry.id}
                    onClick={() => setConnecting(entry)}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    {connecting?.id === entry.id ? "Form neeche khula hai" : "Connect"}
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

    </div>
  );
}

/* ── Connected account card ────────────────────────────── */

function ConnectedCard({
  account,
  catalog,
  token,
  balance,
  onReloadBalance,
  onChanged,
  onApiError,
}: {
  account: ExchangeAccount;
  catalog: CatalogEntry[];
  token: string;
  balance?: BalanceState;
  onReloadBalance: () => void;
  onChanged: () => Promise<void>;
  onApiError: (err: unknown) => void;
}) {
  const entry = catalogFor(catalog, account.exchange);
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

      <TradingControls account={account} token={token} onApiError={onApiError} />

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

/* ── Connect panel (inline, page ke andar hi) ──────────── */

/**
 * Pehle ye ek overlay modal tha. Asli desks par ye form page ke andar hi khulta
 * hai — exchange chuniye, key paste kijiye, aur saath mein hi dikhta hai ki
 * kaunsi permission chahiye aur exchange par kaun sa IP allow karna hai.
 */
function ConnectPanel({
  entry,
  catalog,
  token,
  onPickExchange,
  onClose,
  onConnected,
  onApiError,
}: {
  entry: CatalogEntry;
  catalog: CatalogEntry[];
  token: string;
  onPickExchange: (entry: CatalogEntry) => void;
  onClose: () => void;
  onConnected: () => void;
  onApiError: (err: unknown) => void;
}) {
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [withdrawOff, setWithdrawOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issue, setIssue] = useState<{ message: string; clientIp: string | null } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [egress, setEgress] = useState<EgressIps | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const defaultLabel = `${entry.name} main`;

  // Form page ke andar khulta hai, isliye khud hi view mein aa jaye.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    labelRef.current?.focus({ preventScroll: true });
  }, [entry.id]);

  useEffect(() => {
    let alive = true;
    fetchEgressIps(token)
      .then((data) => alive && setEgress(data))
      .catch(() => {
        /* IP allowlist sirf madad ke liye hai — na mile to form phir bhi chalta hai */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!withdrawOff) return;
    setSubmitting(true);
    setIssue(null);
    try {
      const result = await connectExchangeAccount(token, {
        exchange: entry.id as ExchangeId,
        label: label.trim() || defaultLabel,
        apiKey: apiKey.trim(),
        secretKey: secret.trim(),
      });
      // Secret browser memory mein zaroorat se zyada der na rahe.
      setApiKey("");
      setSecret("");
      setDone(result.key_hint);
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

  if (done !== null) {
    return (
      <section className="ex-connect ex-connect-done" ref={panelRef}>
        <span className="ex-done-icon">
          <CheckCircle2 className="w-7 h-7" />
        </span>
        <div className="min-w-0">
          <h3>{entry.name} connected</h3>
          <p>
            Key <span className="tnum">{done}</span> {entry.name} se verify hokar judi — wallet balance upar card
            par aa gaya hai.
          </p>
        </div>
        <button type="button" className="trade-btn trade-btn-ghost" onClick={onClose}>
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="ex-connect" ref={panelRef} aria-labelledby="ex-connect-title">
      <div className="ex-connect-head">
        <ExchangeMark entry={entry} size={34} />
        <div className="min-w-0 flex-1">
          <span className="ex-connect-kicker">Connecting · {entry.name}</span>
          <h3 id="ex-connect-title">API credentials paste karein</h3>
        </div>
        <button
          type="button"
          className="trade-iconbtn trade-iconbtn-sm"
          onClick={onClose}
          disabled={submitting}
          aria-label="Form band karein"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="ex-connect-grid">
        <form className="ex-connect-form" onSubmit={submit}>
          <label className="ex-field">
            <span className="trade-label">Exchange</span>
            <select
              className="trade-input ex-connect-select"
              value={entry.id}
              onChange={(e) => {
                const next = catalog.find((c) => c.id === e.target.value);
                if (next?.available) onPickExchange(next);
              }}
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.available}>
                  {c.name}
                  {c.available ? "" : " · jald aa raha hai"}
                </option>
              ))}
            </select>
          </label>

          <label className="ex-field">
            <span className="trade-label">Label</span>
            <input
              ref={labelRef}
              className="trade-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder={defaultLabel}
            />
          </label>

          <label className="ex-field">
            <span className="trade-label">API key</span>
            <input
              className="trade-input ex-mono"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`${entry.name} se copy ki hui API key`}
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
            <span>
              Maine is key par <b>withdrawal / transfer permission OFF</b> rakhi hai.
            </span>
          </label>

          {issue && <IssueBox message={issue.message} clientIp={issue.clientIp} />}

          <div className="ex-connect-actions">
            <button
              type="submit"
              className="trade-btn trade-btn-primary"
              disabled={submitting || !withdrawOff || !apiKey.trim() || !secret.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {entry.name} se verify ho raha hai…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Save &amp; connect
                </>
              )}
            </button>
            <p className="ex-secure-note">
              <Lock className="w-3.5 h-3.5 flex-none mt-px" />
              Save se pehle key {entry.name} se verify hoti hai, phir encrypt hokar jaati hai. Secret dobara kabhi
              screen par nahi dikhega.
            </p>
          </div>
        </form>

        <aside className="ex-connect-side">
          <div className="ex-side-block">
            <h4 className="ex-side-title">Zaroori permissions</h4>
            <ul className="ex-req">
              <li data-on="true">
                <Check className="w-3.5 h-3.5" />
                <span>
                  <b>Trading</b> — orders aur positions
                </span>
              </li>
              <li data-on="true">
                <Check className="w-3.5 h-3.5" />
                <span>
                  <b>Read data</b> — balance aur fills
                </span>
              </li>
              <li data-on="false">
                <X className="w-3.5 h-3.5" />
                <span>
                  <b>Withdrawal / transfer</b> — is desk se kabhi use nahi hoti
                </span>
              </li>
            </ul>
          </div>

          <div className="ex-side-block">
            <h4 className="ex-side-title">
              <Globe2 className="w-3.5 h-3.5" />
              IP allowlist
            </h4>
            {egress === null ? (
              <div className="ex-ip-skeleton shimmer" />
            ) : egress.ips.length === 0 ? (
              <p className="ex-side-note">
                Key par IP restriction <b>band</b> (Unrestricted) rakhein — tab kuch add karne ki zaroorat nahi.
              </p>
            ) : (
              <>
                <div className="ex-ip-chips">
                  {egress.ips.map((ip) => (
                    <CopyChip key={ip} value={ip} />
                  ))}
                </div>
                <p className="ex-side-note">
                  {egress.complete
                    ? `Key par IP restriction lagayein to ${entry.name} par yahi IP add karein.`
                    : "IP restriction band rakhna sabse aasan hai — server kabhi doosre IP se bhi jaa sakta hai. Lagani ho to ye IP add karke connect karke dekh lein."}
                </p>
              </>
            )}
          </div>

          <details className="ex-side-block ex-howto">
            <summary>{entry.name} par key kaise banayein?</summary>
            <ol className="ex-guide">
              <li>
                <span className="ex-guide-num">1</span>
                <div>
                  <b>{entry.name} par login karke API settings kholein</b>
                  <p>
                    {entry.id === "delta"
                      ? "Account → API Management → New API Key. Global delta.exchange ki key yahan nahi chalegi."
                      : "Apne account ki API settings mein jaakar nayi key banayein."}
                  </p>
                </div>
              </li>
              <li>
                <span className="ex-guide-num">2</span>
                <div>
                  <b>Read + Trading on, Withdrawal off</b>
                  <p>Balance aur positions ke liye trading permission zaroori hai.</p>
                </div>
              </li>
              <li>
                <span className="ex-guide-num">3</span>
                <div>
                  <b>Key aur Secret wahin copy karein</b>
                  <p>
                    Secret <b>sirf ek baar</b> — key banate waqt — dikhta hai. Baad mein exchange bhi use dobara
                    nahi dikha sakta; kho gaya to nayi key banani padegi.
                  </p>
                </div>
              </li>
            </ol>
            {entry.keyUrl && (
              <a href={entry.keyUrl} target="_blank" rel="noopener noreferrer" className="ex-link">
                {entry.name} ka API page kholein
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </details>
        </aside>
      </div>
    </section>
  );
}

/* ── Live trading controls ─────────────────────────────── */

/**
 * "Key jud gayi" aur "is key se asli order laga sakte ho" do alag faisle
 * hain. Doosra yahan se, jaan-boojh kar, diya jaata hai — aur uske saath
 * ek order ki upper limit bhi, taaki galti ki keemat bandhi rahe.
 */
function TradingControls({
  account,
  token,
  onApiError,
}: {
  account: ExchangeAccount;
  token: string;
  onApiError: (err: unknown) => void;
}) {
  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [cap, setCap] = useState(account.max_order_notional ? String(account.max_order_notional) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const enabled = settings?.live_trading_enabled ?? account.live_trading_enabled;
  const serverLive = settings?.server_live_orders_enabled ?? false;

  const save = async (input: { liveTradingEnabled?: boolean; maxOrderNotional?: number | null }) => {
    setBusy(true);
    setError("");
    try {
      setSettings(await updateTradingSettings(token, account.id, input));
    } catch (err) {
      onApiError(err);
      setError(err instanceof Error ? err.message : "Save nahi hua");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ex-trade-ctl">
      <div className="ex-trade-row">
        <span className="min-w-0">
          <b>Live trading</b>
          <small>
            {enabled
              ? serverLive
                ? "Is key se asli order ja sakta hai."
                : "Aapki taraf se on hai — par server par live orders abhi band hain, isliye order paper hi rahega."
              : "Band hai. Orders sirf paper mein record honge."}
          </small>
        </span>
        <button
          type="button"
          className={`ex-switch ${enabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Live trading"
          disabled={busy}
          onClick={() => void save({ liveTradingEnabled: !enabled })}
        >
          <span />
        </button>
      </div>

      <div className="ex-trade-row">
        <span className="min-w-0">
          <b>Ek order ki limit</b>
          <small>
            Isse bade order khud hi ruk jaate hain. Khaali chhodne par default{" "}
            {settings ? settings.default_max_order_notional.toLocaleString("en-US") : "500"} lagti hai.
          </small>
        </span>
        <span className="ex-cap">
          <input
            className="trade-input"
            inputMode="decimal"
            placeholder="500"
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))}
            disabled={busy}
            aria-label="Max order value"
          />
          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            disabled={busy}
            onClick={() => void save({ maxOrderNotional: cap.trim() ? Number(cap) : null })}
          >
            Save
          </button>
        </span>
      </div>

      {error && <IssueBox message={error} />}
    </div>
  );
}

/* ── TradingView automation ────────────────────────────── */

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ex-auto-row">
      <span className="trade-label">{label}</span>
      <span className="ex-auto-value">
        <code className={mono ? "ex-mono" : ""}>{value}</code>
        <button
          type="button"
          className="trade-btn trade-btn-ghost trade-size-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard band ho to user khud select kar le */
            }
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    </div>
  );
}

/**
 * TradingView se signal lekar order lagana.
 *
 * URL mein token hi poori pehchan hai (TradingView login nahi bhej sakta),
 * isliye ise password ki tarah dikhaya aur samjhaya jaata hai.
 */
function AutomationPanel({ token, onApiError }: { token: string; onApiError: (err: unknown) => void }) {
  const [setup, setSetup] = useState<TradingViewSetup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTradingViewSetup(token)
      .then((data) => alive && setSetup(data))
      .catch((err) => {
        onApiError(err);
        if (alive) setError(err instanceof Error ? err.message : "Setup load nahi hua");
      });
    return () => {
      alive = false;
    };
  }, [token, onApiError]);

  const regenerate = async () => {
    setBusy(true);
    try {
      const next = await regenerateTradingViewToken(token);
      setSetup((cur) => (cur ? { ...cur, ...next } : cur));
      setConfirming(false);
    } catch (err) {
      onApiError(err);
      setError(err instanceof Error ? err.message : "Naya URL nahi bana");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ex-auto">
      <div className="ex-auto-head">
        <span className="ex-auto-icon">
          <Bot className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3>TradingView automation</h3>
          <p>Apne chart ke alert se seedha order — bina kuch code kiye.</p>
        </div>
        {setup && (
          <span className={`ex-pill ${setup.mode === "live" ? "ex-pill-live" : ""}`}>
            {setup.mode === "live" ? "Live" : "Paper mode"}
          </span>
        )}
      </div>

      {error && <IssueBox message={error} />}

      {!setup ? (
        <div className="ex-balance-skeleton shimmer" />
      ) : (
        <>
          {setup.mode === "paper" && (
            <p className="ex-auto-note">
              Abhi <b>paper mode</b> hai: signal aayega, saare check honge aur order history mein record ho jayega —
              par exchange par kuch nahi bheja jayega. Isse poora setup bina paise ke test kar sakte hain.
            </p>
          )}

          <ol className="ex-guide">
            <li>
              <span className="ex-guide-num">1</span>
              <div>
                <b>TradingView par alert banayein</b>
                <p>Chart par apna indicator lagayein → Alert → Notifications mein &ldquo;Webhook URL&rdquo; on karein.</p>
              </div>
            </li>
            <li>
              <span className="ex-guide-num">2</span>
              <div>
                <b>Neeche wala URL webhook mein paste karein</b>
                <p>Ye URL aapki pehchan hai — kisi ke saath share na karein.</p>
              </div>
            </li>
            <li>
              <span className="ex-guide-num">3</span>
              <div>
                <b>Message box mein neeche wala JSON daalein</b>
                <p>
                  <code className="ex-mono">{"{{close}}"}</code> TradingView khud bhav se badal deta hai. Market
                  order ke liye <code className="ex-mono">order_type</code> ko <code className="ex-mono">market</code>{" "}
                  kar dein aur price hata dein.
                </p>
              </div>
            </li>
          </ol>

          <CopyRow label="Webhook URL" value={setup.webhook_url} />
          <div className="ex-auto-row">
            <span className="trade-label">Alert message</span>
            <span className="ex-auto-value">
              <pre className="ex-auto-code">{setup.message_template}</pre>
              <button
                type="button"
                className="trade-btn trade-btn-ghost trade-size-sm"
                onClick={() => void navigator.clipboard.writeText(setup.message_template).catch(() => {})}
              >
                <CopyIcon className="w-3.5 h-3.5" />
                Copy
              </button>
            </span>
          </div>

          <p className="ex-auto-note">
            Ek minute mein zyada se zyada <b>{setup.rate_limit_per_minute} signal</b> liye jaate hain — alert loop
            mein fans jaye to wo yahin ruk jaata hai. Har signal par order ki limit bhi waise hi lagti hai jaise desk
            se lagaye order par.
          </p>

          {confirming ? (
            <div className="ex-confirm">
              <p>
                <b>Naya URL banayein?</b> Purana URL turant kaam karna band kar dega — TradingView par bhi naya URL
                daalna padega.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="trade-btn trade-btn-ghost trade-size-sm"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  Rehne dein
                </button>
                <button type="button" className="trade-btn trade-size-sm ex-danger" onClick={regenerate} disabled={busy}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Haan, naya banayein
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="trade-btn trade-btn-ghost trade-size-sm ex-danger-ghost"
              onClick={() => setConfirming(true)}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Naya URL banayein
            </button>
          )}
        </>
      )}
    </section>
  );
}
