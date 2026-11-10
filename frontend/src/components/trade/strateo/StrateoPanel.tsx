"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  ChevronRight,
  Flame,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Star,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import type { ExchangeAccount } from "@/lib/accountApi";
import { symbolLabel } from "@/lib/cryptoApi";
import type { StrategyDef } from "@/lib/strategies";
import {
  EXCHANGES_HREF,
  LOGIN_HREF,
  authorOf,
  dayKey,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtSince,
  marketOf,
  outcomeLabel,
  runsOnServer,
  signalKey,
  strategyTimeframe,
  writeSettings,
  type AppliedStrategy,
  type Execution,
  type StrateoMarket,
  type StrateoSettings,
  type StrateoStats,
  type StrateoTrade,
  type TradeGate,
} from "@/lib/strateo";

export type PanelTab = "signals" | "strategies" | "settings";

export interface StrateoSignal {
  def: StrategyDef;
  symbol: string;
  trade: StrateoTrade;
}

interface Props {
  defs: StrategyDef[];
  stats: Record<string, StrateoStats | undefined>;
  pending: Set<string>;
  applied: AppliedStrategy[];
  favorites: string[];
  bells: string[];
  settings: StrateoSettings;
  symbol: string;
  exchangeName: string;
  /** Is exchange ki jo API keys judi hain. */
  accounts: ExchangeAccount[];
  executions: Execution[];
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  focusId: string | null;
  busyId: string | null;
  /** Login + exchange key — na ho to apply / order ki jagah ye raasta dikhao. */
  gate: TradeGate;
  onGate: () => void;
  liveOrdersEnabled: boolean | null;
  workerRunning: boolean | null;
  onApply: (def: StrategyDef) => void;
  onRemove: (def: StrategyDef) => void;
  onFocus: (def: StrategyDef) => void;
  onToggleFav: (id: string) => void;
  onToggleBell: (id: string) => void;
  onTradeSignal: (signal: StrateoSignal) => void;
  onRefresh: () => void;
  onClose: () => void;
  /** "Add a strategy" dabaya — list ke upar scroll. */
  scrollToken: number;
}

const MARKETS: { id: StrateoMarket; label: string; flag: string }[] = [
  { id: "crypto", label: "Crypto", flag: "₿" },
  { id: "us", label: "US Stocks", flag: "US" },
  { id: "in", label: "IN Stocks", flag: "IN" },
];

export default function StrateoPanel(props: Props) {
  const {
    defs,
    stats,
    pending,
    applied,
    favorites,
    bells,
    settings,
    symbol,
    exchangeName,
    accounts,
    executions,
    tab,
    onTab,
    focusId,
    busyId,
    gate,
    onGate,
    onApply,
    onRemove,
    onFocus,
    onToggleFav,
    onToggleBell,
    onTradeSignal,
    onRefresh,
    onClose,
    scrollToken,
  } = props;
  const [market, setMarket] = useState<StrateoMarket>("crypto");
  const [now, setNow] = useState(() => Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (scrollToken) bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollToken]);

  const appliedIds = useMemo(() => new Set(applied.map((a) => a.id)), [applied]);

  /** Aaj ke signals — har strategy ke asli trades jo aaj khule. */
  const signals = useMemo(() => {
    const today = dayKey(now);
    const out: StrateoSignal[] = [];
    for (const def of defs) {
      const s = stats[def.id];
      if (!s) continue;
      for (const trade of s.trades) if (dayKey(trade.entryTime) === today) out.push({ def, symbol: s.symbol, trade });
    }
    return out.sort((a, b) => b.trade.entryTime - a.trade.entryTime);
  }, [defs, stats, now]);

  const counts = useMemo(() => {
    const c: Record<StrateoMarket, number> = { crypto: 0, us: 0, in: 0 };
    for (const sig of signals) c[marketOf(sig.def)] += 1;
    return c;
  }, [signals]);

  const marketDefs = useMemo(() => defs.filter((d) => marketOf(d) === market), [defs, market]);

  /** Trending = aaj sabse zyada return; aaj kuch na ho to pichhle 5 din. */
  const trending = useMemo(() => {
    let best: { def: StrategyDef; score: number; since: number } | null = null;
    for (const def of marketDefs) {
      const s = stats[def.id];
      if (!s || s.error) continue;
      const week = s.week.reduce((sum, d) => sum + d.pct, 0);
      const score = s.todayPct !== 0 ? s.todayPct + 1000 : week;
      if (score <= 0) continue;
      const lastToday = [...s.trades].reverse().find((t) => dayKey(t.entryTime) === dayKey(now));
      if (!best || score > best.score) best = { def, score, since: lastToday?.entryTime ?? s.computedAt };
    }
    return best;
  }, [marketDefs, stats, now]);

  const ordered = useMemo(() => {
    const fav = new Set(favorites);
    return [...marketDefs].sort((a, b) => {
      const rank = (d: StrategyDef) => (appliedIds.has(d.id) ? 0 : fav.has(d.id) ? 1 : 2);
      return rank(a) - rank(b);
    });
  }, [marketDefs, favorites, appliedIds]);

  const card = (def: StrategyDef) => (
    <StrategyCard
      key={def.id}
      def={def}
      stats={stats[def.id]}
      loading={pending.has(def.id) && !stats[def.id]}
      refreshing={pending.has(def.id) && Boolean(stats[def.id])}
      applied={appliedIds.has(def.id)}
      fav={favorites.includes(def.id)}
      bell={bells.includes(def.id)}
      focused={focusId === def.id}
      busy={busyId === def.id}
      lockHint={!gate.ok && gate.reason !== "checking" ? gate.title : null}
      onApply={() => onApply(def)}
      onRemove={() => onRemove(def)}
      onFocus={() => onFocus(def)}
      onFav={() => onToggleFav(def.id)}
      onBell={() => onToggleBell(def.id)}
    />
  );

  const accountForLive = accounts.find((a) => a.id === settings.accountId) ?? null;

  return (
    <aside className="st-panel" aria-label="Strateo strategies">
      <header className="st-panel-head">
        <span className="st-logo">
          <Zap className="w-4 h-4" aria-hidden />
        </span>
        <span className="st-panel-title">Strateo</span>
        <button type="button" className="st-icon-btn" onClick={onClose} aria-label="Hide strategy panel" title="Hide panel">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="st-panel-body" ref={bodyRef}>
        <section className="st-banner" aria-label="Strateo">
          <div className="st-banner-main">
            <div className="st-banner-brand">
              <Zap className="w-5 h-5" aria-hidden /> Strateo <span>×</span> {exchangeName}
            </div>
            <p className="st-banner-line">Apply a strategy. It trades on your exchange.</p>
            {gate.ok ? (
              <button type="button" className="st-banner-cta" onClick={() => onTab("strategies")}>
                Trade now <ChevronRight className="w-4 h-4" />
              </button>
            ) : gate.reason === "login" ? (
              <Link href={LOGIN_HREF} className="st-banner-cta">
                Log in to trade <ChevronRight className="w-4 h-4" />
              </Link>
            ) : gate.reason === "exchange" ? (
              <Link href={EXCHANGES_HREF} className="st-banner-cta">
                Connect exchange <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <button type="button" className="st-banner-cta" onClick={onGate}>
                {gate.reason === "error" ? "Retry" : "Checking…"} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="st-banner-side" aria-hidden>
            <small>Backtested on</small>
            <b>{symbolLabel(symbol).split("/")[0]}</b>
            <small>{defs.length} strategies</small>
          </div>
          <div className="st-banner-foot">
            <span>Every number below is a real backtest on this coin</span>
            <span>Past ≠ future*</span>
          </div>
        </section>

        <div className="st-markets" role="tablist" aria-label="Market">
          {MARKETS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={market === m.id}
              className="st-market"
              data-active={market === m.id}
              onClick={() => setMarket(m.id)}
            >
              <span className="st-market-flag" data-m={m.id}>{m.flag}</span>
              {m.label} <span className="st-market-count">({counts[m.id]})</span>
            </button>
          ))}
        </div>

        <div className="st-tabs" role="tablist" aria-label="Strateo sections">
          {(["signals", "strategies", "settings"] as PanelTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="st-tab"
              data-active={tab === t}
              onClick={() => onTab(t)}
            >
              {t === "signals" ? "Signals" : t === "strategies" ? "Strategies" : "Settings"}
            </button>
          ))}
        </div>

        {market !== "crypto" ? (
          <div className="st-empty">
            <b>No {market === "us" ? "US stock" : "Indian stock"} strategies yet</b>
            <span>Strateo strategies run on crypto perpetuals today. Switch to Crypto.</span>
          </div>
        ) : tab === "strategies" ? (
          <div className="st-list">
            <div className="st-list-head">
              <h2>All strategies ({marketDefs.length})</h2>
              <button type="button" className="st-text-btn" onClick={onRefresh} title="Run every backtest again">
                <RefreshCw className={`w-3.5 h-3.5${pending.size ? " st-spin" : ""}`} />
                {pending.size ? `${defs.length - pending.size}/${defs.length}` : "Refresh"}
              </button>
            </div>

            {!gate.ok && gate.reason !== "checking" && <LockBar gate={gate} onGate={onGate} />}

            {trending && (
              <section className="st-trending" aria-label="Trending strategy">
                <div className="st-trending-head">
                  <Flame className="w-4 h-4" aria-hidden />
                  <span>
                    Trending strategy since last <b>{fmtSince(trending.since, now)}</b>
                  </span>
                  <span
                    className="st-info"
                    title="Highest return today on this coin (or over the last 5 days when nothing traded today). Timer = time since its latest signal."
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>
                {card(trending.def)}
              </section>
            )}

            {ordered.filter((d) => d.id !== trending?.def.id).map(card)}
          </div>
        ) : tab === "signals" ? (
          <>
            {!gate.ok && gate.reason !== "checking" && <LockBar gate={gate} onGate={onGate} />}
          <SignalsList
            signals={signals}
            appliedIds={appliedIds}
            executions={executions}
            busyId={busyId}
            symbol={symbol}
            onTrade={onTradeSignal}
            onFocus={onFocus}
          />
          </>
        ) : (
          <SettingsView
            settings={settings}
            accounts={accounts}
            accountForLive={accountForLive}
            exchangeName={exchangeName}
            gate={gate}
            onGate={onGate}
            liveOrdersEnabled={props.liveOrdersEnabled}
            workerRunning={props.workerRunning}
            symbol={symbol}
            pendingCount={pending.size}
            total={defs.length}
            computedAt={Math.max(0, ...defs.map((d) => stats[d.id]?.computedAt ?? 0))}
            onRefresh={onRefresh}
          />
        )}
      </div>
    </aside>
  );
}

/* ── Strategy card ─────────────────────────────────────── */

function StrategyCard({
  def,
  stats,
  loading,
  refreshing,
  applied,
  fav,
  bell,
  focused,
  busy,
  lockHint,
  onApply,
  onRemove,
  onFocus,
  onFav,
  onBell,
}: {
  def: StrategyDef;
  stats: StrateoStats | undefined;
  loading: boolean;
  refreshing: boolean;
  applied: boolean;
  fav: boolean;
  bell: boolean;
  focused: boolean;
  busy: boolean;
  /** Login / exchange baaki — Apply dabane par raasta dikhega. */
  lockHint: string | null;
  onApply: () => void;
  onRemove: () => void;
  onFocus: () => void;
  onFav: () => void;
  onBell: () => void;
}) {
  const Icon = def.icon;
  const tf = strategyTimeframe(def).toUpperCase();
  const server = runsOnServer(def);
  const today = stats?.todayPct ?? 0;
  const BellIcon = bell ? BellRing : Bell;

  return (
    <article className="st-card" data-applied={applied} data-focused={focused} aria-label={def.name}>
      <div
        className="st-card-top"
        role="button"
        tabIndex={0}
        onClick={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFocus();
          }
        }}
        title="Show this strategy's trades on the chart"
      >
        <span className="st-card-icon">
          <Icon className="w-4 h-4" aria-hidden />
        </span>
        <div className="st-card-id">
          <h3 className="st-card-name">{def.name}</h3>
          <div className="st-chips">
            <span className="st-chip">Built by {authorOf(def)}</span>
            <span className="st-chip">
              Win rate{" "}
              {loading ? (
                <span className="st-shimmer st-shimmer-xs" />
              ) : (
                <b className="st-up">{stats?.winRate != null ? `${Math.round(stats.winRate)}%` : "—"}</b>
              )}
            </span>
            <span className="st-chip st-chip-dim" title={server ? "Runs as a server bot, 24×7" : "Monitored while Strateo is open"}>
              {tf}
              {server ? " · 24×7" : ""}
            </span>
          </div>
        </div>
        <div className="st-card-actions">
          <button
            type="button"
            className="st-icon-btn st-gold"
            data-on={bell}
            aria-pressed={bell}
            aria-label={bell ? "Turn off signal alerts" : "Alert me on signals"}
            title={bell ? "Alerts on" : "Alert me on signals"}
            onClick={(e) => {
              e.stopPropagation();
              onBell();
            }}
          >
            <BellIcon className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            className="st-icon-btn st-gold"
            data-on={fav}
            aria-pressed={fav}
            aria-label={fav ? "Remove from favourites" : "Add to favourites"}
            onClick={(e) => {
              e.stopPropagation();
              onFav();
            }}
          >
            <Star className="w-[18px] h-[18px]" fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="st-card-bottom">
        <div className="st-card-col">
          <span className="st-label">Last week</span>
          {loading ? (
            <span className="st-shimmer st-shimmer-row" />
          ) : stats?.error ? (
            <span className="st-muted-sm" title={stats.error}>
              Not available on {symbolLabel(stats.symbol).split("/")[0]}
            </span>
          ) : (
            <div className="st-week" aria-label="Result of each of the last five days">
              {(stats?.week ?? []).map((d) => (
                <span
                  key={d.key}
                  className="st-day"
                  data-r={d.result}
                  title={`${d.label} ${d.key}: ${d.trades ? `${fmtPct(d.pct)} · ${d.trades} trade${d.trades > 1 ? "s" : ""}` : "no closed trade"}`}
                >
                  {d.letter}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="st-card-col">
          <span className="st-label">Today&apos;s Returns</span>
          {loading ? (
            <span className="st-shimmer st-shimmer-row" />
          ) : stats?.error ? (
            <span className="st-muted-sm">—</span>
          ) : (
            <span
              className={`st-return ${today > 0 ? "st-up" : today < 0 ? "st-down" : "st-flat"}`}
              title="Trades closed today plus a trade opened today, as % price move (no leverage)"
            >
              {today > 0 ? <TrendingUp className="w-4 h-4" /> : today < 0 ? <TrendingDown className="w-4 h-4" /> : null}
              {Math.abs(today).toFixed(2)}%
              {refreshing && <Loader2 className="w-3 h-3 st-spin st-muted" />}
            </span>
          )}
        </div>
        {applied ? (
          <button type="button" className="st-btn st-btn-outline" onClick={onRemove} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 st-spin" /> : "Remove"}
          </button>
        ) : (
          <button
            type="button"
            className="st-btn st-btn-solid"
            onClick={onApply}
            disabled={busy}
            title={lockHint ? `${lockHint} first` : undefined}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 st-spin" />
            ) : (
              <>
                {lockHint && <Lock className="w-3.5 h-3.5 st-lock" aria-hidden />}
                Apply
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

/* ── Lock bar — login / exchange baaki ─────────────────── */

function LockBar({ gate, onGate }: { gate: Exclude<TradeGate, { ok: true }>; onGate: () => void }) {
  return (
    <div className="st-lockbar" role="note">
      <Lock className="w-4 h-4" aria-hidden />
      <span>
        <b>{gate.reason === "login" ? "Log in to apply strategies" : gate.title}</b>
        {gate.reason === "login"
          ? "Then connect your exchange — strategies trade on it."
          : gate.reason === "exchange"
            ? "Add an API key on Exchanges to apply and trade."
            : gate.body}
      </span>
      {gate.reason === "login" ? (
        <Link href={LOGIN_HREF} className="st-btn st-btn-solid st-btn-sm">
          Log in
        </Link>
      ) : gate.reason === "exchange" ? (
        <Link href={EXCHANGES_HREF} className="st-btn st-btn-solid st-btn-sm">
          Connect
        </Link>
      ) : (
        <button type="button" className="st-btn st-btn-outline st-btn-sm" onClick={onGate}>
          Retry
        </button>
      )}
    </div>
  );
}

/* ── Signals ───────────────────────────────────────────── */

function SignalsList({
  signals,
  appliedIds,
  executions,
  busyId,
  symbol,
  onTrade,
  onFocus,
}: {
  signals: StrateoSignal[];
  appliedIds: Set<string>;
  executions: Execution[];
  busyId: string | null;
  symbol: string;
  onTrade: (signal: StrateoSignal) => void;
  onFocus: (def: StrategyDef) => void;
}) {
  const [only, setOnly] = useState<"all" | "applied">("all");
  const execByKey = useMemo(() => new Map(executions.map((e) => [e.key, e])), [executions]);
  const rows = only === "applied" ? signals.filter((s) => appliedIds.has(s.def.id)) : signals;

  return (
    <div className="st-list">
      <div className="st-list-head">
        <h2>Today&apos;s signals ({rows.length})</h2>
        <div className="st-seg" role="group" aria-label="Filter signals">
          {(["all", "applied"] as const).map((v) => (
            <button key={v} type="button" data-active={only === v} onClick={() => setOnly(v)}>
              {v === "all" ? "All" : "Applied"}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="st-empty">
          <b>No signals today on {symbolLabel(symbol)}</b>
          <span>
            {only === "applied"
              ? "Your applied strategies have not entered a trade today."
              : "No strategy has entered a trade today yet. New entries show here as candles close."}
          </span>
        </div>
      ) : (
        rows.map((sig) => {
          const { def, trade } = sig;
          const key = signalKey(def.id, sig.symbol, trade.entryTime);
          const exec = execByKey.get(key);
          const canPlace = trade.open && appliedIds.has(def.id) && !runsOnServer(def) && !exec;
          const Icon = def.icon;
          return (
            <article key={key} className="st-signal" data-open={trade.open}>
              <button type="button" className="st-signal-top" onClick={() => onFocus(def)} title="Show on chart">
                <span className="st-card-icon st-card-icon-sm">
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                </span>
                <span className="st-signal-name">{def.name}</span>
                <span className="st-side" data-side={trade.side}>
                  {trade.side === "long" ? "BUY" : "SELL"}
                </span>
              </button>
              <div className="st-signal-meta">
                <span>{symbolLabel(sig.symbol)}</span>
                <span>{fmtClock(trade.entryTime)}</span>
                <span>{strategyTimeframe(def).toUpperCase()}</span>
              </div>
              <dl className="st-levels">
                <div>
                  <dt>Entry</dt>
                  <dd>{fmtPrice(trade.entry)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd className="st-up">{fmtPrice(trade.target)}</dd>
                </div>
                <div>
                  <dt>Stop-loss</dt>
                  <dd className="st-down">{fmtPrice(trade.stop)}</dd>
                </div>
              </dl>
              <div className="st-signal-foot">
                <span className={`st-status ${trade.pct > 0 ? "st-up" : trade.pct < 0 ? "st-down" : ""}`} data-o={trade.outcome}>
                  {outcomeLabel(trade)} {fmtPct(trade.pct)}
                </span>
                {exec ? (
                  <span className="st-placed">
                    Placed · {exec.mode === "live" ? "Live" : "Paper"}
                    {exec.closed ? ` · closed ${fmtPrice(exec.closed.price)}` : ""}
                  </span>
                ) : canPlace ? (
                  <button
                    type="button"
                    className="st-btn st-btn-solid st-btn-sm"
                    disabled={busyId === key}
                    onClick={() => onTrade(sig)}
                  >
                    {busyId === key ? <Loader2 className="w-3.5 h-3.5 st-spin" /> : "Place order"}
                  </button>
                ) : trade.open && appliedIds.has(def.id) && runsOnServer(def) ? (
                  <span className="st-placed">Server bot handles it</span>
                ) : trade.open && !appliedIds.has(def.id) ? (
                  <span className="st-muted-sm">Apply to trade</span>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

/* ── Settings ──────────────────────────────────────────── */

function SettingsView({
  settings,
  accounts,
  accountForLive,
  exchangeName,
  gate,
  onGate,
  liveOrdersEnabled,
  workerRunning,
  symbol,
  pendingCount,
  total,
  computedAt,
  onRefresh,
}: {
  settings: StrateoSettings;
  accounts: ExchangeAccount[];
  accountForLive: ExchangeAccount | null;
  exchangeName: string;
  gate: TradeGate;
  onGate: () => void;
  liveOrdersEnabled: boolean | null;
  workerRunning: boolean | null;
  symbol: string;
  pendingCount: number;
  total: number;
  computedAt: number;
  onRefresh: () => void;
}) {
  const [permission, setPermission] = useState<string>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const toggleDesktop = async () => {
    if (settings.desktopAlerts) {
      writeSettings({ desktopAlerts: false });
      return;
    }
    if (typeof Notification === "undefined") return;
    const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    writeSettings({ desktopAlerts: result === "granted" });
  };

  const liveProblem = !gate.ok
    ? gate.title
    : !accounts.length
      ? `No ${exchangeName} API key connected.`
      : !accountForLive
        ? "Pick the account that should receive live orders."
        : !accountForLive.live_trading_enabled
          ? "Live trading is off for this key — turn it on in Exchanges."
          : liveOrdersEnabled === false
            ? "Live orders are disabled on the server — orders are recorded as paper."
            : null;

  return (
    <div className="st-settings">
      <section className="st-set">
        <h3>Order execution</h3>
        <div className="st-row">
          <div>
            <b>Mode</b>
            <small>Paper fills in your paper account. Live sends market orders to {exchangeName}.</small>
          </div>
          <div className="st-seg" role="group" aria-label="Trading mode">
            {(["paper", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-active={settings.mode === m}
                data-tone={m}
                onClick={() => {
                  if (m === "live" && !gate.ok) {
                    onGate();
                    return;
                  }
                  if (m === "live" && settings.mode !== "live") {
                    const ok = window.confirm(
                      "Live mode places real orders with real money on your exchange when a strategy signals. Continue?",
                    );
                    if (!ok) return;
                  }
                  writeSettings({ mode: m });
                }}
              >
                {m === "paper" ? "Paper" : "Live"}
              </button>
            ))}
          </div>
        </div>

        <div className="st-row">
          <div>
            <b>Exchange account</b>
            <small>Used for live orders on {exchangeName}.</small>
          </div>
          {accounts.length ? (
            <select
              className="st-input"
              value={settings.accountId ?? ""}
              onChange={(e) => writeSettings({ accountId: e.target.value ? Number(e.target.value) : null })}
              aria-label="Exchange account"
            >
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.exchange} · {a.key_hint}
                  {a.live_trading_enabled ? "" : " (live off)"}
                </option>
              ))}
            </select>
          ) : (
            <Link href="/trade?tab=exchanges" className="st-btn st-btn-outline st-btn-sm">
              Connect
            </Link>
          )}
        </div>
        {settings.mode === "live" && liveProblem && <p className="st-warn">{liveProblem}</p>}

        <div className="st-row">
          <div>
            <b>1-Click Trade</b>
            <small>Place the order the moment an applied strategy signals — no confirm step.</small>
          </div>
          <Switch
            on={settings.oneClick && gate.ok}
            onChange={(v) => (gate.ok ? writeSettings({ oneClick: v }) : onGate())}
            label="1-Click Trade"
          />
        </div>

        <div className="st-row">
          <div>
            <b>Amount per signal</b>
            <small>Order size in USD for in-browser strategies. SL and target come from the strategy.</small>
          </div>
          <label className="st-money">
            $
            <input
              className="st-input"
              type="number"
              min={5}
              step={5}
              value={settings.orderUsd}
              onChange={(e) => writeSettings({ orderUsd: Math.max(0, Number(e.target.value) || 0) })}
              aria-label="Amount per signal in USD"
            />
          </label>
        </div>
      </section>

      <section className="st-set">
        <h3>Server bots · 24×7</h3>
        <p className="st-note">
          Strategies tagged 24×7 deploy as a bot on the server: it keeps trading with the browser closed and keeps an
          exchange stop order. {workerRunning === false ? "The bot worker is not running on this server right now." : ""}
        </p>
        <div className="st-row">
          <div>
            <b>Capital</b>
            <small>Bot sizes each trade from this.</small>
          </div>
          <label className="st-money">
            $
            <input
              className="st-input"
              type="number"
              min={10}
              step={10}
              value={settings.botCapital}
              onChange={(e) => writeSettings({ botCapital: Math.max(0, Number(e.target.value) || 0) })}
              aria-label="Bot capital in USD"
            />
          </label>
        </div>
        <div className="st-row">
          <div>
            <b>Risk per trade</b>
            <small>A stop-out loses about this much of capital.</small>
          </div>
          <label className="st-money">
            <input
              className="st-input"
              type="number"
              min={0.1}
              max={5}
              step={0.1}
              value={settings.botRiskPct}
              onChange={(e) => writeSettings({ botRiskPct: Math.min(5, Math.max(0.1, Number(e.target.value) || 1)) })}
              aria-label="Risk per trade in percent"
            />
            %
          </label>
        </div>
      </section>

      <section className="st-set">
        <h3>Alerts</h3>
        <div className="st-row">
          <div>
            <b>Sound</b>
            <small>Short chime on a new signal.</small>
          </div>
          <Switch on={settings.sound} onChange={(v) => writeSettings({ sound: v })} label="Sound" />
        </div>
        <div className="st-row">
          <div>
            <b>Desktop notifications</b>
            <small>
              {permission === "denied"
                ? "Blocked in this browser — allow notifications for this site."
                : permission === "unsupported"
                  ? "Not supported in this browser."
                  : "For strategies with the bell on, or applied."}
            </small>
          </div>
          <Switch on={settings.desktopAlerts} onChange={() => void toggleDesktop()} label="Desktop notifications" />
        </div>
      </section>

      <section className="st-set">
        <h3>Data</h3>
        <p className="st-note">
          Win rate, last week and today&apos;s return come from each strategy&apos;s own backtest engine on{" "}
          {symbolLabel(symbol)} Delta candles, with the strategy&apos;s own timeframe. Refreshed every 20 minutes;
          applied strategies re-check at every candle close.
        </p>
        <div className="st-row">
          <div>
            <b>{pendingCount ? `Running ${total - pendingCount}/${total}` : "Up to date"}</b>
            <small>{computedAt ? `Last run ${fmtClock(computedAt)}` : "Not run yet"}</small>
          </div>
          <button type="button" className="st-btn st-btn-outline st-btn-sm" onClick={onRefresh}>
            <RefreshCw className={`w-3.5 h-3.5${pendingCount ? " st-spin" : ""}`} /> Refresh
          </button>
        </div>
      </section>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="st-switch"
      data-on={on}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}
