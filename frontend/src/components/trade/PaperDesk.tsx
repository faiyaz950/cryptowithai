"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  FlaskConical,
  History,
  Inbox,
  LineChart,
  Loader2,
  LogIn,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  cancelPaperOrder,
  fetchDemoOrders,
  fetchPaperAccount,
  placeDemoOrder,
  symbolLabel,
  type DemoOrder,
  type PaperAccount,
  type PaperPosition,
} from "@/lib/cryptoApi";

type Tab = "positions" | "open" | "history";

const REFRESH_MS = 15_000;

interface Props {
  onPickSymbol?: (symbol: string) => void;
}

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function signedUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${usd(n)}`;
}

function price(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function tone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || Math.abs(n) < 0.005) return "flat";
  return n > 0 ? "up" : "down";
}

function since(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "abhi";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "abhi";
  if (min < 60) return `${min}m pehle`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m pehle`;
  return `${Math.floor(hr / 24)}d pehle`;
}

function when(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Delta({ value, children }: { value: number | null | undefined; children: React.ReactNode }) {
  const t = tone(value);
  const Icon = t === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <span className="pp-delta" data-tone={t}>
      {t !== "flat" && <Icon className="w-3.5 h-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export default function PaperDesk({ onPickSymbol }: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("positions");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [rows, acct] = await Promise.all([fetchDemoOrders(token), fetchPaperAccount(token)]);
      setOrders(rows);
      setAccount(acct);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper account load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const openOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const history = useMemo(() => orders.filter((o) => o.status !== "pending"), [orders]);
  const positions = account?.positions ?? [];
  const stats = account?.stats;
  const totalPnl = account ? account.equity - account.start_balance : 0;
  const usedPct = account && account.equity > 0 ? Math.min(100, (account.used_margin / account.equity) * 100) : 0;

  const closePosition = async (p: PaperPosition) => {
    if (!token) return;
    if (!window.confirm(`${symbolLabel(p.symbol)} ki ${p.side === "long" ? "long" : "short"} position (${p.size}) market par band karein?`)) return;
    setBusyId(p.symbol);
    try {
      const res = await placeDemoOrder(token, {
        symbol: p.symbol,
        side: p.side === "long" ? "sell" : "buy",
        order_type: "market",
        quantity: p.size,
      });
      flash(res.message || "Position band ho gayi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Position band nahi hui");
    } finally {
      setBusyId(null);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!token) return;
    setBusyId(orderId);
    try {
      await cancelPaperOrder(token, orderId);
      flash("Paper order cancel ho gaya");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel nahi hua");
    } finally {
      setBusyId(null);
    }
  };

  if (!token) {
    return (
      <div className="trade-panel">
        <div className="p-6">
          <div className="trade-pos-notice">
            <span className="trade-pos-notice-icon">
              <LogIn className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <b>Paper trading ke liye sign in karein</b>
              <p>Aapke paper orders, positions aur P&amp;L aapke account mein save hote hain.</p>
              <Link href="/login?next=%2Ftrade%3Ftab%3Dtrades" className="trade-btn trade-btn-primary trade-size-sm mt-2">
                Sign in
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pp">
      <section className="trade-panel pp-hero">
        <div className="pp-hero-head">
          <div className="pp-title">
            <span className="pp-title-icon"><FlaskConical className="w-4 h-4" /></span>
            <div>
              <h2>Paper trading account</h2>
              <p>
                Virtual paisa · asli Delta bhaav · {usd(account?.start_balance ?? 10_000, 0)} se shuru
                {updatedAt && <> · updated {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>}
              </p>
            </div>
          </div>
          <div className="pp-hero-actions">
            <Link href="/trade?tab=markets" className="trade-btn trade-btn-primary trade-size-sm">
              <LineChart className="w-3.5 h-3.5" />
              Naya order
            </Link>
            <button type="button" className="trade-btn trade-size-sm" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        {!account && loading ? (
          <div className="pp-skeleton shimmer" />
        ) : account ? (
          <div className="pp-hero-body">
            <div className="pp-equity">
              <span className="pp-label">Equity</span>
              <div className="pp-equity-value tnum">{usd(account.equity)}</div>
              <div className="pp-equity-sub">
                <Delta value={totalPnl}>
                  {signedUsd(totalPnl)} ({pct(account.return_pct)})
                </Delta>
                <span>kul return</span>
              </div>
              <div className="pp-meter" aria-label={`Margin use ${usedPct.toFixed(0)}%`}>
                <div className="pp-meter-head">
                  <span>Margin use</span>
                  <b className="tnum">{usedPct.toFixed(1)}%</b>
                </div>
                <div className="pp-meter-bar">
                  <span style={{ width: `${usedPct}%` }} data-high={usedPct > 80} />
                </div>
                <div className="pp-meter-foot tnum">
                  <span>Used {usd(account.used_margin)}</span>
                  <span>Available {usd(account.available)}</span>
                </div>
              </div>
            </div>

            <div className="pp-kpis">
              <Kpi label="Unrealized P&L" value={signedUsd(account.unrealized_pnl)} t={tone(account.unrealized_pnl)} hint={`${positions.length} open position`} />
              <Kpi label="Realized P&L" value={signedUsd(account.realized_pnl)} t={tone(account.realized_pnl)} hint={`${stats?.closed_trades ?? 0} band trade`} />
              <Kpi
                label="Win rate"
                value={stats?.win_rate == null ? "—" : `${stats.win_rate.toFixed(0)}%`}
                hint={
                  stats
                    ? `${stats.wins} jeet · ${stats.losses} haar${stats.breakeven ? ` · ${stats.breakeven} barabar` : ""}`
                    : undefined
                }
              />
              <Kpi label="Filled orders" value={String(stats?.filled_orders ?? 0)} hint={`${openOrders.length} pending limit`} />
              <Kpi label="Best trade" value={signedUsd(stats?.best_trade)} t={tone(stats?.best_trade)} />
              <Kpi label="Worst trade" value={signedUsd(stats?.worst_trade)} t={tone(stats?.worst_trade)} />
            </div>
          </div>
        ) : null}

        {(error || notice) && (
          <div className="pp-flash" data-kind={error ? "error" : "ok"} role={error ? "alert" : "status"}>
            {error ? <AlertCircle className="w-3.5 h-3.5 flex-none" /> : null}
            <span>{error || notice}</span>
            {error && (
              <button type="button" onClick={() => setError(null)} aria-label="Band karein">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </section>

      <section className="trade-panel">
        <div className="px-3 pt-3">
          <div className="trade-seg trade-seg-full" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "positions"} data-active={tab === "positions"} onClick={() => setTab("positions")} className="trade-seg-btn">
              <Wallet className="w-3.5 h-3.5" /> Positions <span className="tnum">({positions.length})</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "open"} data-active={tab === "open"} onClick={() => setTab("open")} className="trade-seg-btn">
              <Clock className="w-3.5 h-3.5" /> Open orders <span className="tnum">({openOrders.length})</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "history"} data-active={tab === "history"} onClick={() => setTab("history")} className="trade-seg-btn">
              <History className="w-3.5 h-3.5" /> History <span className="tnum">({history.length})</span>
            </button>
          </div>
        </div>

        <div className="p-3">
          {tab === "positions" &&
            (positions.length === 0 ? (
              <Empty icon={<Wallet className="w-4 h-4" />} title="Koi open paper position nahi">
                Markets tab ke order ticket mein <b>Paper</b> mode chunein aur Buy/Sell karein.
              </Empty>
            ) : (
              <div className="pp-pos-grid">
                {positions.map((p) => (
                  <PositionCard
                    key={p.symbol}
                    p={p}
                    equity={account?.equity ?? 0}
                    busy={busyId === p.symbol}
                    onClose={() => void closePosition(p)}
                    onChart={() => onPickSymbol?.(p.symbol)}
                  />
                ))}
              </div>
            ))}

          {tab === "open" &&
            (openOrders.length === 0 ? (
              <Empty icon={<Clock className="w-4 h-4" />} title="Koi pending limit order nahi">
                Limit order tab tak yahan rehta hai jab tak bhaav aapki price cross na kare.
              </Empty>
            ) : (
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Pair</th>
                      <th>Side</th>
                      <th className="num">Qty</th>
                      <th className="num">Limit</th>
                      <th className="num">Value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((o) => (
                      <tr key={o.order_id}>
                        <td className="muted">{when(o.timestamp)}</td>
                        <td>
                          <button type="button" className="pp-pair" onClick={() => onPickSymbol?.(o.symbol)}>
                            {symbolLabel(o.symbol)}
                          </button>
                        </td>
                        <td><SideBadge side={o.side} /></td>
                        <td className="num">{o.quantity}</td>
                        <td className="num">{price(o.price)}</td>
                        <td className="num">{o.price ? usd(o.price * o.quantity) : "—"}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="trade-btn trade-size-sm"
                            disabled={busyId === o.order_id}
                            onClick={() => void cancelOrder(o.order_id)}
                          >
                            {busyId === o.order_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === "history" &&
            (history.length === 0 ? (
              <Empty icon={<Inbox className="w-4 h-4" />} title="Abhi koi paper order nahi">
                Pehla paper trade lagate hi uska poora record yahan aayega.
              </Empty>
            ) : (
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Pair</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th className="num">Qty</th>
                      <th className="num">Fill price</th>
                      <th className="num">Value</th>
                      <th className="num">Realized P&amp;L</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((o) => {
                      const realized = account?.closes?.[o.order_id];
                      return (
                        <tr key={o.order_id}>
                          <td className="muted">{when(o.timestamp)}</td>
                          <td>
                            <button type="button" className="pp-pair" onClick={() => onPickSymbol?.(o.symbol)}>
                              {symbolLabel(o.symbol)}
                            </button>
                          </td>
                          <td><SideBadge side={o.side} /></td>
                          <td className="muted cap">{o.order_type}</td>
                          <td className="num">{o.quantity}</td>
                          <td className="num">{o.status === "filled" ? price(o.price) : "—"}</td>
                          <td className="num">{o.status === "filled" && o.price ? usd(o.price * o.quantity) : "—"}</td>
                          <td className="num">
                            {realized == null ? (
                              <span className="muted">—</span>
                            ) : (
                              <Delta value={realized}>{signedUsd(realized)}</Delta>
                            )}
                          </td>
                          <td><StatusBadge status={o.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </section>

      <p className="pp-footnote">
        Paper orders exchange par nahi jaate. Market order abhi ke Delta bhaav par fill hota hai; limit order tab
        fill hota hai jab aap ye page ya orders kholte hain aur bhaav limit cross kar chuka ho. Leverage 1x hai —
        order value available balance se zyada nahi ho sakti.
      </p>
    </div>
  );
}

function Kpi({ label, value, hint, t }: { label: string; value: string; hint?: string; t?: "up" | "down" | "flat" }) {
  return (
    <div className="pp-kpi">
      <span className="pp-label">{label}</span>
      <b className="pp-kpi-value tnum" data-tone={t}>{value}</b>
      {hint && <span className="pp-kpi-hint">{hint}</span>}
    </div>
  );
}

function PositionCard({
  p,
  equity,
  busy,
  onClose,
  onChart,
}: {
  p: PaperPosition;
  equity: number;
  busy: boolean;
  onClose: () => void;
  onChart: () => void;
}) {
  const share = equity > 0 ? Math.min(100, (p.margin / equity) * 100) : 0;
  return (
    <article className="pp-pos" data-side={p.side}>
      <header className="pp-pos-head">
        <button type="button" className="pp-pos-pair" onClick={onChart} title="Chart kholein">
          {symbolLabel(p.symbol)}
          <span className={`trade-badge ${p.side === "long" ? "trade-badge-green" : "trade-badge-red"}`}>
            {p.side === "long" ? "Long" : "Short"}
          </span>
        </button>
        <button type="button" className="trade-btn trade-size-sm" onClick={onClose} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Close
        </button>
      </header>

      <div className="pp-pos-pnl">
        <Delta value={p.unrealized_pnl}>
          <span className="pp-pos-pnl-value tnum">{signedUsd(p.unrealized_pnl)}</span>
        </Delta>
        <span className="pp-pos-pnl-pct tnum" data-tone={tone(p.move_pct)}>{pct(p.move_pct)}</span>
      </div>

      <dl className="pp-pos-grid-metrics">
        <div><dt>Size</dt><dd className="tnum">{p.size}</dd></div>
        <div><dt>Value</dt><dd className="tnum">{usd(p.notional)}</dd></div>
        <div><dt>Entry</dt><dd className="tnum">{price(p.entry_price)}</dd></div>
        <div><dt>Mark</dt><dd className="tnum">{price(p.mark_price)}</dd></div>
        <div><dt>Margin</dt><dd className="tnum">{usd(p.margin)}</dd></div>
        <div><dt>Opened</dt><dd>{since(p.opened_at)}</dd></div>
      </dl>

      <div className="pp-pos-share">
        <div className="pp-meter-bar"><span style={{ width: `${share}%` }} /></div>
        <span className="tnum">{share.toFixed(1)}% equity</span>
      </div>
    </article>
  );
}

function SideBadge({ side }: { side: string }) {
  const buy = side === "buy";
  return <span className={`trade-badge ${buy ? "trade-badge-green" : "trade-badge-red"}`}>{buy ? "Buy" : "Sell"}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "filled"
      ? "trade-badge-blue"
      : status === "rejected"
        ? "trade-badge-red"
        : status === "pending"
          ? "trade-badge-amber"
          : "trade-badge-neutral";
  const label: Record<string, string> = {
    filled: "Filled",
    cancelled: "Cancelled",
    rejected: "Rejected",
    pending: "Pending",
  };
  return <span className={`trade-badge ${cls}`}>{label[status] ?? status}</span>;
}

function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="trade-empty pp-empty">
      <span className="trade-empty-icon">{icon}</span>
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}
