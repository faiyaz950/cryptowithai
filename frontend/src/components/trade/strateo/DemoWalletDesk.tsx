"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Server,
  StopCircle,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  DESK_TZ_LABEL,
  fetchMarketTickers,
  fetchStrategyBots,
  symbolLabel,
  type StrategyBot,
} from "@/lib/cryptoApi";
import { getStrategy } from "@/lib/strategies";
import { botDemoBalance, fmtPct, fmtPrice, fmtUsd } from "@/lib/strateo";
import "./strateo.css";
import "./demo-wallets.css";

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusMeta(status: StrategyBot["status"]) {
  if (status === "running") return { label: "Running", Icon: PlayCircle, tone: "up" as const };
  if (status === "paused") return { label: "Paused", Icon: PauseCircle, tone: "flat" as const };
  return { label: "Stopped", Icon: StopCircle, tone: "down" as const };
}

function tradeLabel(bot: StrategyBot): string {
  if (bot.trade_state === "open" || bot.trade_state === "entering") {
    const side = bot.side === "long" ? "Long" : bot.side === "short" ? "Short" : "Trade";
    return `${side} · ${bot.trade_state}`;
  }
  if (bot.trade_state === "closed") return "Flat · last closed";
  return "No open trade";
}

function markFor(bot: StrategyBot, marks: Record<string, number>): number | null {
  const direct = marks[bot.symbol];
  if (direct != null) return direct;
  const base = bot.symbol.replace(/USD[T]?$/i, "").replace(/_PERP$/i, "");
  const hit = Object.entries(marks).find(([sym]) => sym.replace(/USD[T]?$/i, "").startsWith(base));
  return hit ? hit[1] : null;
}

export default function DemoWalletDesk() {
  const { token, user, handleExpiredSession } = useAuth();
  const [bots, setBots] = useState<StrategyBot[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [workerRunning, setWorkerRunning] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) {
      setBots([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const [botRes, tickers] = await Promise.all([
        fetchStrategyBots(token),
        fetchMarketTickers().catch(() => [] as Awaited<ReturnType<typeof fetchMarketTickers>>),
      ]);
      setBots(botRes.data ?? []);
      setWorkerRunning(botRes.worker_running);
      const next: Record<string, number> = {};
      for (const t of tickers) {
        const px = t.mark_price ?? t.price;
        if (px != null && px > 0) {
          next[t.symbol] = px;
          if (t.base) next[`${t.base}USD`] = px;
        }
      }
      setMarks(next);
      setError(null);
    } catch (err) {
      if (err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 401) {
        handleExpiredSession();
      }
      setError(err instanceof Error ? err.message : "Could not load demo wallets");
    } finally {
      setLoading(false);
    }
  }, [token, handleExpiredSession]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => setReloadKey((k) => k + 1), 30_000);
    return () => window.clearInterval(id);
  }, [token]);

  /** Demo capital wale bots — Apply pe amount set hone wale server Auto bots. */
  const wallets = useMemo(() => {
    return bots
      .filter((b) => Number(b.capital) > 0)
      .map((bot) => {
        const mark = markFor(bot, marks);
        const bal = botDemoBalance(bot, mark);
        const def = getStrategy(bot.strategy);
        const open =
          (bot.trade_state === "open" || bot.trade_state === "entering") &&
          bot.entry_price != null &&
          bot.quantity != null;
        const unrealized =
          open && mark != null && bot.entry_price
            ? (bot.side === "long" ? 1 : bot.side === "short" ? -1 : 0) *
              (mark - bot.entry_price) *
              (bot.quantity ?? 0)
            : 0;
        return { bot, def, bal, mark, open, unrealized };
      })
      .sort((a, b) => {
        const rank = (s: StrategyBot["status"]) => (s === "running" ? 0 : s === "paused" ? 1 : 2);
        return rank(a.bot.status) - rank(b.bot.status) || b.bal.started - a.bal.started;
      });
  }, [bots, marks]);

  useEffect(() => {
    if (!wallets.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !wallets.some((w) => w.bot.id === selectedId)) {
      setSelectedId(wallets[0].bot.id);
    }
  }, [wallets, selectedId]);

  const selected = wallets.find((w) => w.bot.id === selectedId) ?? null;

  const totals = useMemo(() => {
    const active = wallets.filter((w) => w.bot.status !== "stopped");
    const started = active.reduce((s, w) => s + w.bal.started, 0);
    const now = active.reduce((s, w) => s + w.bal.now, 0);
    const pnl = now - started;
    const profits = active.filter((w) => w.bal.pnl > 0).reduce((s, w) => s + w.bal.pnl, 0);
    const losses = active.filter((w) => w.bal.pnl < 0).reduce((s, w) => s + w.bal.pnl, 0);
    const openTrades = active.filter((w) => w.open).length;
    return { started, now, pnl, profits, losses, openTrades, count: active.length, all: wallets.length };
  }, [wallets]);

  return (
    <div className="strateo dw-root">
      <header className="dw-top">
        <div className="dw-top-left">
          <Link href="/trade/strateo" className="st-icon-btn" aria-label="Back to Strateo">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="dw-icon">
            <Wallet className="w-4 h-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="st-kicker">Strateo · server Auto bots</div>
            <h1 className="dw-title">Demo wallets</h1>
            <p className="dw-sub">
              Apply pe jo demo amount diya — uspe kitna allocated hai, running P&amp;L, aur active trade
            </p>
          </div>
        </div>
        <div className="dw-top-actions">
          <button
            type="button"
            className="st-btn st-btn-outline st-btn-sm"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading || !token}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 st-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <Link href="/trade/strateo" className="st-btn st-btn-solid st-btn-sm">
            Open Strateo
          </Link>
        </div>
      </header>

      {!token || !user ? (
        <div className="dw-empty">
          <b>Log in to see demo wallets</b>
          <span>Server bots aur unka demo amount aapke account se jude hote hain.</span>
          <Link href="/login" className="st-btn st-btn-solid st-btn-sm">
            Sign in
          </Link>
        </div>
      ) : error ? (
        <div className="dw-empty" data-tone="warn">
          <AlertTriangle className="w-5 h-5" aria-hidden />
          <b>{error}</b>
          <button type="button" className="st-btn st-btn-outline st-btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : loading && !wallets.length ? (
        <div className="dw-empty">
          <Loader2 className="w-5 h-5 st-spin" aria-hidden />
          <span>Loading demo wallets…</span>
        </div>
      ) : !wallets.length ? (
        <div className="dw-empty">
          <b>No demo wallets yet</b>
          <span>
            Strateo mein ek <b>24×7 / server</b> strategy Apply karke <b>Auto-trade</b> choose karo, Demo amount
            (jaise $10,000) set karo — yahan uska wallet dikhega.
          </span>
          <p className="dw-hint">
            Browser strategies aur options (Signals only) yahan nahi aate — unke paas demo capital sleeve nahi hota.
          </p>
          <Link href="/trade/strateo" className="st-btn st-btn-solid st-btn-sm">
            Go to Strateo
          </Link>
        </div>
      ) : (
        <>
          {workerRunning === false && (
            <div className="dw-banner" role="status">
              <AlertTriangle className="w-4 h-4" aria-hidden />
              Bot worker is not running on this server — wallets still show last equity, but new fills may pause.
            </div>
          )}

          <section className="dw-summary" aria-label="Demo wallet overview">
            <article className="dw-stat">
              <span>Strategies with demo amount</span>
              <b>{totals.count}</b>
              <small>{totals.all > totals.count ? `${totals.all - totals.count} stopped also listed` : "Active + paused"}</small>
            </article>
            <article className="dw-stat">
              <span>Total allocated</span>
              <b>{money(totals.started)}</b>
              <small>Sum of demo amounts (not stopped)</small>
            </article>
            <article className="dw-stat">
              <span>Running balance</span>
              <b data-pnl={totals.pnl > 0 ? "up" : totals.pnl < 0 ? "down" : "flat"}>{money(totals.now)}</b>
              <small>After closed fills + open mark</small>
            </article>
            <article className="dw-stat">
              <span>Net P&amp;L</span>
              <b data-pnl={totals.pnl > 0 ? "up" : totals.pnl < 0 ? "down" : "flat"}>{fmtUsd(totals.pnl)}</b>
              <small>
                Profit {fmtUsd(totals.profits)} · Loss {fmtUsd(totals.losses)}
              </small>
            </article>
            <article className="dw-stat">
              <span>Open trades</span>
              <b>{totals.openTrades}</b>
              <small>Active on allocated demo amounts · {DESK_TZ_LABEL}</small>
            </article>
          </section>

          <div className="dw-body">
            <section className="dw-list" aria-label="Per-strategy allocation">
              <header className="dw-section-head">
                <h2>Allocation by strategy</h2>
                <span>Click a row for breakdown</span>
              </header>
              <ul className="dw-cards">
                {wallets.map(({ bot, def, bal, open, unrealized }) => {
                  const meta = statusMeta(bot.status);
                  const Icon = def?.icon ?? Server;
                  const selectedRow = bot.id === selectedId;
                  const pnlPct = bal.started > 0 ? (bal.pnl / bal.started) * 100 : 0;
                  return (
                    <li key={bot.id}>
                      <button
                        type="button"
                        className="dw-card"
                        data-active={selectedRow}
                        data-status={bot.status}
                        onClick={() => setSelectedId(bot.id)}
                      >
                        <span className="dw-card-icon" style={{ color: def?.accent ?? "var(--st-acc)" }}>
                          <Icon className="w-4 h-4" aria-hidden />
                        </span>
                        <span className="dw-card-main">
                          <span className="dw-card-title">
                            {def?.name ?? bot.strategy}
                            <span className="dw-pill" data-tone={meta.tone}>
                              <meta.Icon className="w-3 h-3" aria-hidden />
                              {meta.label}
                            </span>
                          </span>
                          <span className="dw-card-meta">
                            {symbolLabel(bot.symbol)} · {bot.timeframe.toUpperCase()} · {bot.mode}
                            {open ? " · trade open" : ""}
                          </span>
                        </span>
                        <span className="dw-card-nums">
                          <span className="dw-alloc">{money(bal.started)}</span>
                          <span className="dw-now" data-pnl={bal.pnl > 0 ? "up" : bal.pnl < 0 ? "down" : "flat"}>
                            {money(bal.now)} · {fmtUsd(bal.pnl)} ({fmtPct(pnlPct)})
                          </span>
                          {open && unrealized !== 0 && (
                            <span className="dw-unreal">Open MTM {fmtUsd(unrealized)}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="dw-detail" aria-label="Strategy demo wallet detail">
              {selected ? (
                <Detail
                  bot={selected.bot}
                  name={selected.def?.name ?? selected.bot.strategy}
                  accent={selected.def?.accent}
                  bal={selected.bal}
                  mark={selected.mark}
                  open={selected.open}
                  unrealized={selected.unrealized}
                />
              ) : (
                <div className="dw-empty dw-empty-inline">
                  <span>Select a strategy to see its demo wallet.</span>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({
  bot,
  name,
  accent,
  bal,
  mark,
  open,
  unrealized,
}: {
  bot: StrategyBot;
  name: string;
  accent?: string;
  bal: { started: number; now: number; pnl: number };
  mark: number | null;
  open: boolean;
  unrealized: number;
}) {
  const meta = statusMeta(bot.status);
  const pnlPct = bal.started > 0 ? (bal.pnl / bal.started) * 100 : 0;
  const events = (bot.events ?? []).slice(0, 12);

  return (
    <div className="dw-detail-inner">
      <header className="dw-detail-head">
        <div>
          <div className="st-kicker">Bot #{bot.id}</div>
          <h2 style={{ color: accent }}>{name}</h2>
          <p>
            {symbolLabel(bot.symbol)} · {bot.timeframe.toUpperCase()} · {bot.mode} · risk {bot.risk_pct}% / trade
          </p>
        </div>
        <span className="dw-pill" data-tone={meta.tone}>
          <meta.Icon className="w-3.5 h-3.5" aria-hidden />
          {meta.label}
        </span>
      </header>

      <div className="dw-detail-grid">
        <div>
          <span>Amount added (demo)</span>
          <b>{money(bal.started)}</b>
        </div>
        <div>
          <span>Running balance</span>
          <b data-pnl={bal.pnl > 0 ? "up" : bal.pnl < 0 ? "down" : "flat"}>{money(bal.now)}</b>
        </div>
        <div>
          <span>P&amp;L on this amount</span>
          <b data-pnl={bal.pnl > 0 ? "up" : bal.pnl < 0 ? "down" : "flat"}>
            {fmtUsd(bal.pnl)} · {fmtPct(pnlPct)}
          </b>
        </div>
        <div>
          <span>Of which open MTM</span>
          <b data-pnl={unrealized > 0 ? "up" : unrealized < 0 ? "down" : "flat"}>
            {open ? fmtUsd(unrealized) : "—"}
          </b>
        </div>
      </div>

      <div className="dw-trade" data-open={open}>
        <header>
          <Activity className="w-3.5 h-3.5" aria-hidden />
          <h3>Trade on this amount</h3>
        </header>
        <p className="dw-trade-status">{tradeLabel(bot)}</p>
        {open ? (
          <dl className="dw-kv">
            <div>
              <dt>Side</dt>
              <dd>{bot.side === "long" ? "Long / buy" : bot.side === "short" ? "Short / sell" : "—"}</dd>
            </div>
            <div>
              <dt>Qty</dt>
              <dd>{bot.quantity ?? "—"}</dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>{fmtPrice(bot.entry_price)}</dd>
            </div>
            <div>
              <dt>Mark</dt>
              <dd>{fmtPrice(mark)}</dd>
            </div>
            <div>
              <dt>Stop</dt>
              <dd>{fmtPrice(bot.stop_loss)}</dd>
            </div>
            {bot.tp1_price != null && (
              <div>
                <dt>TP1</dt>
                <dd>
                  {fmtPrice(bot.tp1_price)}
                  {bot.tp1_done ? " · done" : ""}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="dw-muted">Waiting for next entry on this demo wallet.</p>
        )}
      </div>

      <div className="dw-events">
        <header>
          <h3>Recent bot activity</h3>
          <span>Newest first · fills move this wallet</span>
        </header>
        {events.length ? (
          <ul>
            {events.map((ev, i) => (
              <li key={`${ev.at}-${i}`}>
                <time>{ev.at ? new Date(ev.at).toLocaleString("en-GB", { hour12: false }) : "—"}</time>
                <span>{ev.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dw-muted">No events yet for this bot.</p>
        )}
      </div>

      <p className="dw-footnote">
        Demo wallets are virtual sleeves for server Auto-trade bots. Profile / exchange P&amp;L is separate and
        unchanged. Manage apply &amp; amount in{" "}
        <Link href="/trade/strateo">Strateo</Link>.
      </p>
    </div>
  );
}
