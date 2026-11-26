"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellRing,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Star,
  Trophy,
  X,
} from "lucide-react";
import type { ExchangeAccount } from "@/lib/accountApi";
import { symbolLabel } from "@/lib/cryptoApi";
import { strategyHref, type StrategyDef } from "@/lib/strategies";
import {
  EXCHANGES_HREF,
  LOGIN_HREF,
  RESEARCH_ONLY_NOTE,
  ROUND_TRIP_COST_PCT,
  authorOf,
  botDemoBalance,
  dayKey,
  exitRule,
  fmtClock,
  fmtDemoWallet,
  fmtPct,
  fmtPrice,
  fmtSince,
  fmtWhen,
  isOptionsStrategy,
  isResearchOnly,
  levelMove,
  marketOf,
  outcomeLabel,
  runsOnServer,
  sideTag,
  signalKey,
  strategyTimeframe,
  strateoValues,
  writeSettings,
  type AppliedStrategy,
  type Execution,
  type StrateoMarket,
  type StrateoSettings,
  type StrateoStats,
  type StrateoTrade,
  type TradeGate,
} from "@/lib/strateo";
import type { StrateoPosition } from "@/lib/strateoPositions";
import PositionsView, { LevelDist } from "./StrateoPositions";

export type PanelTab = "strategies" | "positions" | "signals" | "settings";

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
  /** Applied strategies ki asli haalat — Positions tab. */
  positions: StrateoPosition[];
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
  onPlacePosition: (pos: StrateoPosition) => void;
  onRefresh: () => void;
  onClose: () => void;
  /** "Add a strategy" dabaya — list ke upar scroll. */
  scrollToken: number;
}

// Chaar tab 392px mein — icon hata kar sirf text, terminal jaisa.
const TABS: { id: PanelTab; label: string }[] = [
  { id: "strategies", label: "Strategies" },
  { id: "positions", label: "Positions" },
  { id: "signals", label: "Signals" },
  { id: "settings", label: "Settings" },
];

// US / IN stocks ke tab hata diye — Strateo abhi sirf crypto perpetuals par chalta hai.
const MARKETS: { id: StrateoMarket; label: string; flag: string }[] = [{ id: "crypto", label: "Crypto", flag: "₿" }];

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
    positions,
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
    onPlacePosition,
    onRefresh,
    onClose,
    scrollToken,
  } = props;
  const market: StrateoMarket = "crypto";
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (scrollToken) bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollToken]);

  // Phone par chaar tab scroll hote hain — chuna hua tab dikhe (sirf tab-bar ke andar, page nahi hilta).
  useEffect(() => {
    const bar = tabsRef.current;
    const btn = bar?.querySelector<HTMLElement>('[data-active="true"]');
    if (!bar || !btn || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
  }, [tab]);

  const appliedIds = useMemo(() => new Set(applied.map((a) => a.id)), [applied]);

  /** Aaj ke signals — har strategy ke asli trades jo aaj khule. */
  const signals = useMemo(() => {
    const today = dayKey(now);
    const out: StrateoSignal[] = [];
    for (const def of defs) {
      // Research-only (grid EA) ke signal trade nahi hote — list unse bhar jaati thi. Card / chart par dikhte hain.
      if (isResearchOnly(def)) continue;
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

  /**
   * Top performers = poore backtest ka return, fees + slippage ke baad, sabse upar 10.
   * Pehle "aaj ka return" se ek hi strategy chunte the — 4H strategies aaj trade hi nahi
   * karti, to list mein sirf options bachte the. Options ka % premium par hai (coin move par
   * nahi), isliye wo coin strategies ke baad alag group mein aate hain.
   */
  const top = useMemo(() => {
    const rank = (pool: StrategyDef[]) =>
      pool
        .flatMap((def) => {
          // Research-only (BGRH grid EA) Strateo chala hi nahi sakta — uska ~100% win top par aata tha.
          if (isResearchOnly(def)) return [];
          const s = stats[def.id];
          // Target fees jitne chhote (feeRisk) ya fees ke baad ghaata — "top performer" kehna dhoka hai.
          if (!s || s.error || s.feeRisk || s.closed === 0 || s.totalPct <= 0) return [];
          return [{ def, s }];
        })
        .sort((a, b) => b.s.totalPct - a.s.totalPct || (b.s.winRate ?? 0) - (a.s.winRate ?? 0));
    const coin = rank(marketDefs.filter((d) => !isOptionsStrategy(d)));
    const rows = [...coin, ...rank(marketDefs.filter((d) => isOptionsStrategy(d)))].slice(0, TOP_N);
    const last = Math.max(0, ...rows.flatMap(({ s }) => s.trades.map((t) => t.entryTime)));
    return { rows, coinCount: coin.length, last, ids: new Set(rows.map((r) => r.def.id)) };
  }, [marketDefs, stats]);

  const ordered = useMemo(() => {
    const fav = new Set(favorites);
    return [...marketDefs].sort((a, b) => {
      // Research-only sabse neeche — upar wahi jo Strateo sach mein chala sakta hai.
      const rank = (d: StrategyDef) =>
        appliedIds.has(d.id) ? 0 : fav.has(d.id) ? 1 : isResearchOnly(d) ? 3 : 2;
      return rank(a) - rank(b);
    });
  }, [marketDefs, favorites, appliedIds]);

  /** Naam ya banane wale se dhoondo — 25 strategies mein scroll karna lamba hai. */
  const q = query.trim().toLowerCase();
  const matches = (d: StrategyDef) => !q || d.name.toLowerCase().includes(q) || authorOf(d).toLowerCase().includes(q);
  const showTop = !q && top.rows.length > 0;
  // Top list wale cards neeche dobara nahi — warna focus par dono jagah ek saath khulte.
  const listed = ordered.filter((d) => !(showTop && top.ids.has(d.id)) && matches(d));

  const card = (def: StrategyDef, rank?: number) => {
    const pos = positions.find((p) => p.def.id === def.id);
    const wallet =
      pos?.bot != null
        ? botDemoBalance(pos.bot, pos.mark ?? stats[def.id]?.lastPrice ?? null)
        : null;
    return (
      <StrategyCard
        key={def.id}
        def={def}
        rank={rank}
        stats={stats[def.id]}
        loading={pending.has(def.id) && !stats[def.id]}
        refreshing={pending.has(def.id) && Boolean(stats[def.id])}
        applied={appliedIds.has(def.id)}
        wallet={wallet}
        fav={favorites.includes(def.id)}
        bell={bells.includes(def.id)}
        focused={focusId === def.id}
        busy={busyId === def.id}
        lockHint={!gate.ok && gate.reason !== "checking" ? gate.title : null}
        symbol={symbol}
        onApply={() => onApply(def)}
        onRemove={() => onRemove(def)}
        onFocus={() => onFocus(def)}
        onFav={() => onToggleFav(def.id)}
        onBell={() => onToggleBell(def.id)}
      />
    );
  };

  const accountForLive = accounts.find((a) => a.id === settings.accountId) ?? null;
  const openCount = positions.filter((p) => p.state === "open" || p.state === "entering").length;

  return (
    <aside className="st-panel" aria-label="Strateo strategies">
      <header className="st-panel-head">
        <div className="st-tabs" role="tablist" aria-label="Strateo sections" ref={tabsRef}>
          {TABS.map(({ id: t, label }) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="st-tab"
              data-active={tab === t}
              onClick={() => onTab(t)}
            >
              {label}
              {t === "positions" && openCount > 0 && (
                <span className="st-tab-count" data-tone="live" aria-label={`${openCount} open`}>
                  {openCount}
                </span>
              )}
              {t === "signals" && signals.length > 0 && <span className="st-tab-count">{signals.length}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="st-icon-btn" onClick={onClose} aria-label="Hide strategy panel" title="Hide panel">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="st-panel-body" ref={bodyRef}>
        {tab === "positions" ? (
          <PositionsView
            positions={positions}
            executions={executions}
            now={now}
            focusId={focusId}
            busyId={busyId}
            oneClick={settings.oneClick && gate.ok}
            exchangeName={exchangeName}
            onFocus={onFocus}
            onPlace={onPlacePosition}
            onBrowse={() => onTab("strategies")}
          />
        ) : (
          <>
            <section className="st-context" aria-label="Strateo">
              <div className="st-context-main">
                <span className="st-coin" data-coin={symbolLabel(symbol).split("/")[0]} aria-hidden>
                  {symbolLabel(symbol).charAt(0)}
                </span>
                <div className="st-context-copy">
                  <b>
                    {defs.length} strategies on {symbolLabel(symbol).split("/")[0]}
                  </b>
                  <small title="Every number below is a real backtest on this coin. Past results do not promise future ones.">
                    Backtested on {exchangeName} candles · past ≠ future
                  </small>
                </div>
              </div>
              {/* Asli CTA (Log in / Connect) LockBar mein hai — yahan sirf haalat. */}
              {gate.ok ? (
                <span className="st-ready">
                  <span aria-hidden /> Ready
                </span>
              ) : (
                <button type="button" className="st-ready" data-locked onClick={onGate} title={gate.title}>
                  {gate.reason === "checking" ? (
                    <Loader2 className="w-3 h-3 st-spin" aria-hidden />
                  ) : (
                    <Lock className="w-3 h-3" aria-hidden />
                  )}
                  {gate.reason === "checking" ? "Checking" : "Locked"}
                </button>
              )}
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
                >
                  <span className="st-market-flag" data-m={m.id}>{m.flag}</span>
                  {m.label} <span className="st-market-count">{counts[m.id]}</span>
                </button>
              ))}
            </div>

            {tab === "strategies" ? (
              <div className="st-list">
                <label className="st-search">
                  <Search className="w-3.5 h-3.5" aria-hidden />
                  <span className="sr-only">Search strategies</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search strategy or author"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                {!gate.ok && gate.reason !== "checking" && <LockBar gate={gate} onGate={onGate} />}

                {showTop && (
                  <section className="st-trending" aria-label="Top performers">
                    <div className="st-trending-head">
                      <Trophy className="w-3.5 h-3.5" aria-hidden />
                      <span>{top.rows.length === 1 ? "Top performer" : `Top ${top.rows.length} performers`}</span>
                      {top.last > 0 && (
                        <span className="st-trending-timer">
                          last signal <b>{fmtAgo(top.last, now)}</b> ago
                        </span>
                      )}
                      <span
                        className="st-info"
                        title={`Ranked by the whole backtest on this coin, after fees and slippage. Only strategies that end in profit after those costs are listed, up to ${TOP_N}. Options come after coin strategies because their % is on the option premium, not the coin price. Timer = time since the newest entry among them.`}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <p className="st-top-note">Full backtest return after fees · last 5 days in bars</p>
                    <ol className="st-top-list">
                      {top.rows.map(({ def }, i) => (
                        <li key={def.id}>
                          {i === top.coinCount && i > 0 && (
                            <span className="st-top-sep">Options · return on premium</span>
                          )}
                          {card(def, i + 1)}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                <div className="st-list-head">
                  <h2>
                    {q
                      ? `Results (${listed.length})`
                      : showTop
                        ? `More strategies (${listed.length})`
                        : `All strategies (${marketDefs.length})`}
                  </h2>
                  <button type="button" className="st-text-btn" onClick={onRefresh} title="Run every backtest again">
                    <RefreshCw className={`w-3.5 h-3.5${pending.size ? " st-spin" : ""}`} />
                    {pending.size ? `${defs.length - pending.size}/${defs.length}` : "Refresh"}
                  </button>
                </div>

                {listed.length ? (
                  listed.map((d) => card(d))
                ) : (
                  <div className="st-empty">
                    <b>No strategy matches “{query.trim()}”</b>
                    <span>Try a shorter name or the author, like “EMA” or “MT5”.</span>
                  </div>
                )}
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
                  stats={stats}
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
          </>
        )}
      </div>
    </aside>
  );
}

/* ── Strategy card ─────────────────────────────────────── */

/** Top performers list kitni lambi. */
const TOP_N = 10;

/** Strategies wale full backtest page par, isi coin aur window ke saath, khulte hi chalao. */
function cardBacktestHref(def: StrategyDef, symbol: string): string {
  const base = strategyHref(def, strateoValues(def, symbol));
  return `${base}${base.includes("?") ? "&" : "?"}backtest=1`;
}

/** "05:58" ek din tak; usse purana ho to "3d" — 4H strategies din bhar chup rehti hain. */
function fmtAgo(ms: number, now: number): string {
  const days = Math.floor((now - ms) / 86_400_000);
  return days >= 1 ? `${days}d` : fmtSince(ms, now);
}

function StrategyCard({
  def,
  rank,
  stats,
  loading,
  refreshing,
  applied,
  wallet,
  fav,
  bell,
  focused,
  busy,
  lockHint,
  symbol,
  onApply,
  onRemove,
  onFocus,
  onFav,
  onBell,
}: {
  def: StrategyDef;
  /** Top performers mein jagah — tab card poore backtest ka return dikhata hai, aaj ka nahi. */
  rank?: number;
  stats: StrateoStats | undefined;
  loading: boolean;
  refreshing: boolean;
  applied: boolean;
  /** Live demo wallet for an applied server bot. */
  wallet: { started: number; now: number; pnl: number } | null;
  fav: boolean;
  bell: boolean;
  focused: boolean;
  busy: boolean;
  /** Login / exchange baaki — Apply dabane par raasta dikhega. */
  lockHint: string | null;
  /** Chart wala coin — backtest isi par chale. */
  symbol: string;
  onApply: () => void;
  onRemove: () => void;
  onFocus: () => void;
  onFav: () => void;
  onBell: () => void;
}) {
  const Icon = def.icon;
  const tf = strategyTimeframe(def).toUpperCase();
  const server = runsOnServer(def);
  const options = isOptionsStrategy(def);
  const today = stats?.todayPct ?? 0;
  const BellIcon = bell ? BellRing : Bell;

  const week = stats?.week ?? [];
  const weekMax = Math.max(0.01, ...week.map((d) => Math.abs(d.pct)));
  const win = stats?.winRate ?? null;
  const research = isResearchOnly(def);
  const costTxt = `~${ROUND_TRIP_COST_PCT.toFixed(2)}% fees + slippage`;
  const feeTitle =
    stats?.feeRisk && stats.avgWinGross != null
      ? `Average win is ${fmtPct(stats.avgWinGross)} of price before costs; ${costTxt} per trade ${
          stats.feeRisk === "below" ? "is more than that — an average win ends as a loss." : "takes more than half of it."
        }`
      : null;
  // Ranked card wahi number dikhaye jis par rank hua — warna #1 par "+0.00%" (aaj trade nahi) dikhta.
  const ranked = rank != null;
  const shown = ranked ? (stats?.totalPct ?? 0) : today;
  const tone = shown > 0 ? "st-up" : shown < 0 ? "st-down" : "st-flat";
  const shownTitle = ranked
    ? options
      ? `Whole ${stats?.days ?? 0}-day backtest, as % of the option premium (not the coin price)`
      : `Whole ${stats?.days ?? 0}-day backtest, % price move after ${costTxt} (no leverage)`
    : options
      ? "Today: trades closed today plus a trade opened today, as % of the option premium (not the coin price)"
      : `Today: trades closed today plus a trade opened today, as % price move after ${costTxt} (no leverage)`;
  const coin = stats ? symbolLabel(stats.symbol).split("/")[0] : "";
  const barHeight = (pct: number, result: string) =>
    `${result === "none" ? 0 : Math.max(14, (Math.abs(pct) / weekMax) * 100)}%`;
  const detailId = `st-card-${def.id}`;

  // Dheemi (4H) strategies hafton tak trade nahi karti — khaali bars ki jagah batao aakhri trade kab tha.
  const asOf = stats?.computedAt ?? 0;
  const quietWeek = week.length > 0 && week.every((d) => d.result === "none");
  const lastDone = stats ? [...stats.trades].reverse().find((t) => !t.open) : undefined;
  const lastAgo = !lastDone
    ? null
    : dayKey(lastDone.exitTime) === dayKey(asOf)
      ? "today"
      : `${Math.max(1, Math.floor((asOf - lastDone.exitTime) / 86_400_000))}d ago`;
  // "Today" sirf aaj band ya aaj khule trades ginta hai — pehle se khula trade alag se dikhao.
  const openBefore = stats?.open && dayKey(stats.open.entryTime) !== dayKey(asOf) ? stats.open : null;
  const tradedToday = (stats?.todayClosed ?? 0) > 0 || Boolean(stats?.open && !openBefore);

  return (
    <article className="st-card" data-applied={applied} data-focused={focused} aria-label={def.name}>
      {/* Watchlist row — dabao to chart par trades aur neeche poori detail. */}
      <div
        className="st-card-top"
        role="button"
        tabIndex={0}
        aria-expanded={focused}
        aria-controls={focused ? detailId : undefined}
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
          {ranked && (
            <span className="st-rank" data-podium={rank <= 3} aria-label={`Rank ${rank}`}>
              {rank}
            </span>
          )}
        </span>
        <div className="st-card-id">
          <h3 className="st-card-name">
            <span>{def.name}</span>
            {fav && <Star className="w-3 h-3 st-card-flag" fill="currentColor" aria-label="Favourite" />}
            {bell && <BellRing className="w-3 h-3 st-card-flag" aria-label="Alerts on" />}
          </h3>
          <div className="st-chips">
            <span className="st-chip st-chip-by" title={`by ${authorOf(def)}`}>
              by {authorOf(def)}
            </span>
            <span className="st-chip st-chip-tf" title={server ? "Runs as a server bot, 24×7" : "Monitored while Strateo is open"}>
              {tf}
              {server ? " · 24×7" : ""}
            </span>
            {options && (
              <span className="st-chip st-chip-opt" title="Options strategy — signals only: Strateo shows the signal; you trade the legs on your exchange">
                Options
              </span>
            )}
            {research && (
              <span className="st-chip st-chip-sim" title={RESEARCH_ONLY_NOTE}>
                Research only
              </span>
            )}
            {stats?.feeRisk && !research && (
              <span className="st-chip st-chip-fee" data-risk={stats.feeRisk} title={feeTitle ?? undefined}>
                {stats.feeRisk === "below" ? "Below fees" : "Tiny targets"}
              </span>
            )}
            {applied && <span className="st-chip st-chip-live">Running</span>}
            {wallet && (
              <span
                className="st-chip st-chip-wallet"
                data-pnl={wallet.pnl > 0 ? "up" : wallet.pnl < 0 ? "down" : "flat"}
                title={fmtDemoWallet(wallet)}
              >
                {fmtDemoWallet(wallet)}
              </span>
            )}
          </div>
        </div>
        <span className="st-spark" aria-hidden>
          {!loading &&
            !stats?.error &&
            week.map((d) => <i key={d.key} data-r={d.result} style={{ height: barHeight(d.pct, d.result) }} />)}
        </span>
        <div className="st-card-quote">
          {loading ? (
            <span className="st-shimmer st-shimmer-xs" />
          ) : stats?.error ? (
            <span className="st-return st-flat" title={stats.error}>
              —
            </span>
          ) : (
            <span className={`st-return ${tone}`} title={shownTitle}>
              {refreshing && <Loader2 className="w-3 h-3 st-spin st-muted" />}
              {fmtPct(shown)}
              {options && <small className="st-prem">prem</small>}
            </span>
          )}
          {ranked && !loading && !stats?.error ? (
            // Phone par 66px column mein ek line nahi aati — CSS do line mein tod deti hai.
            <small className="st-quote-sub">
              <span>{stats?.days ?? 0}d</span>
              {win != null && <span>{Math.round(win)}% win</span>}
            </small>
          ) : (
            <small>
              {loading ? "Backtesting…" : stats?.error ? `Not on ${coin}` : win != null ? `${Math.round(win)}% win` : "Today"}
            </small>
          )}
          {!focused && def.backtestable !== false && (
            <Link
              href={cardBacktestHref(def, symbol)}
              className="st-card-bt"
              title="Open the full backtest — the same page as Strategies"
              onClick={(e) => e.stopPropagation()}
            >
              Backtest
            </Link>
          )}
        </div>
      </div>

      {focused && (
        <div className="st-card-detail" id={detailId}>
          <div className="st-card-stats">
            <div className="st-stat">
              <span className="st-label" title={options ? undefined : `A win = profit left after ${costTxt}`}>
                Win rate
              </span>
              {loading ? (
                <span className="st-shimmer st-shimmer-xs" />
              ) : (
                <>
                  <b className="st-stat-val">{win != null ? `${Math.round(win)}%` : "—"}</b>
                  <span className="st-meter" aria-hidden>
                    <span style={{ width: `${Math.max(0, Math.min(100, win ?? 0))}%` }} />
                  </span>
                </>
              )}
            </div>
            <div className="st-stat st-stat-week">
              <span className="st-label">Last 5 days</span>
              {loading ? (
                <span className="st-shimmer st-shimmer-row" />
              ) : stats?.error ? (
                <span className="st-muted-sm" title={stats.error}>
                  Not available on {symbolLabel(stats.symbol).split("/")[0]}
                </span>
              ) : quietWeek ? (
                <div
                  className="st-week-empty"
                  title={
                    lastDone
                      ? `No trade closed in the last 5 days. Last one closed ${fmtWhen(lastDone.exitTime, asOf)} · ${outcomeLabel(lastDone)} ${fmtPct(lastDone.pct)}`
                      : `No trade closed in the last ${stats?.days ?? 0} days`
                  }
                >
                  <span>None closed</span>
                  <small>{lastAgo ? `Last ${lastAgo}` : `None in ${stats?.days ?? 0}d`}</small>
                </div>
              ) : (
                <div className="st-week" aria-label="Result of each of the last five days">
                  {week.map((d) => (
                    <span
                      key={d.key}
                      className="st-day"
                      data-r={d.result}
                      title={`${d.label} ${d.key}: ${d.trades ? `${fmtPct(d.pct)} · ${d.trades} trade${d.trades > 1 ? "s" : ""}` : "no closed trade"}`}
                    >
                      <span className="st-day-bar">
                        <span style={{ height: barHeight(d.pct, d.result) }} />
                      </span>
                      <span className="st-day-letter">{d.letter}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="st-stat st-stat-today">
              <span className="st-label">Today</span>
              {loading ? (
                <span className="st-shimmer st-shimmer-xs" />
              ) : stats?.error ? (
                <span className="st-muted-sm">—</span>
              ) : (
                <span
                  className={`st-return ${today > 0 ? "st-up" : today < 0 ? "st-down" : "st-flat"}`}
                  title={
                    options
                      ? "Trades closed today plus a trade opened today, as % of the option premium (not the coin price)"
                      : `Trades closed today plus a trade opened today, as % price move after ${costTxt} (no leverage)`
                  }
                >
                  {fmtPct(today)}
                  {options && <small className="st-prem">premium</small>}
                  {refreshing && <Loader2 className="w-3 h-3 st-spin st-muted" />}
                </span>
              )}
              {!loading && !stats?.error && stats && !tradedToday && (
                <small
                  className="st-stat-note"
                  title={
                    openBefore
                      ? `A trade opened ${fmtWhen(openBefore.entryTime, asOf)} is still open — Today counts only trades closed or opened today`
                      : "No trade closed or opened today"
                  }
                >
                  {openBefore
                    ? `Open for ${Math.max(1, Math.floor((asOf - openBefore.entryTime) / 86_400_000))}d`
                    : "No trade today"}
                </small>
              )}
            </div>
          </div>

          {research ? (
            <p className="st-card-warn" data-tone="info">
              <Info className="w-3.5 h-3.5" aria-hidden />
              <span>{RESEARCH_ONLY_NOTE}</span>
            </p>
          ) : feeTitle ? (
            <p className="st-card-warn" data-tone={stats?.feeRisk === "below" ? "bad" : "warn"}>
              <Info className="w-3.5 h-3.5" aria-hidden />
              <span>
                <b>{stats?.feeRisk === "below" ? "Targets are below fees." : "Targets are tiny."}</b> {feeTitle}
              </span>
            </p>
          ) : (
            !options &&
            !loading &&
            stats?.avgWinGross != null && (
              // Target ka asli size aur fees — "brokerage nikalegi ya nahi" ek line mein.
              <p className="st-card-costs">
                Average win <b>{fmtPct(stats.avgWinGross)}</b> of price · each trade pays {costTxt} · % shown are after
                fees
              </p>
            )
          )}

          <div className="st-card-foot">
            {def.backtestable !== false && (
              <Link
                href={cardBacktestHref(def, symbol)}
                className="st-btn st-btn-outline"
                title="Open the full backtest — the same page as Strategies"
                onClick={(e) => e.stopPropagation()}
              >
                Backtest
              </Link>
            )}
            <button
              type="button"
              className="st-icon-btn st-toggle"
              data-on={bell}
              aria-pressed={bell}
              aria-label={bell ? "Turn off signal alerts" : "Alert me on signals"}
              title={bell ? "Alerts on" : "Alert me on signals"}
              onClick={onBell}
            >
              <BellIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="st-icon-btn st-toggle"
              data-on={fav}
              aria-pressed={fav}
              aria-label={fav ? "Remove from favourites" : "Add to favourites"}
              title={fav ? "Favourite" : "Add to favourites"}
              onClick={onFav}
            >
              <Star className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
            </button>
            {applied ? (
              <button type="button" className="st-btn st-btn-outline" onClick={onRemove} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 st-spin" /> : "Remove"}
              </button>
            ) : research ? (
              <button type="button" className="st-btn st-btn-outline" disabled title={RESEARCH_ONLY_NOTE}>
                Research only
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
                    <ArrowRight className="w-3.5 h-3.5 st-btn-arrow" aria-hidden />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
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
  stats,
  onTrade,
  onFocus,
}: {
  signals: StrateoSignal[];
  appliedIds: Set<string>;
  executions: Execution[];
  busyId: string | null;
  symbol: string;
  stats: Record<string, StrateoStats | undefined>;
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
          // Options ke legs perp order se nahi bante — unke liye sirf signal.
          const options = isOptionsStrategy(def);
          const research = isResearchOnly(def);
          const canPlace = trade.open && appliedIds.has(def.id) && !runsOnServer(def) && !options && !research && !exec;
          // Entry se pehle hi pata ho: target / SL kitna door, fees ke baad kitna bachega.
          const coinMove = !trade.premium && !trade.basket;
          const Icon = def.icon;
          return (
            <article key={key} className="st-signal" data-open={trade.open} data-side={trade.side}>
              <button type="button" className="st-signal-top" onClick={() => onFocus(def)} title="Show on chart">
                <span className="st-card-icon st-card-icon-sm">
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                </span>
                <span className="st-signal-name">{def.name}</span>
                <span className="st-side" data-side={trade.structure ? "options" : trade.side}>
                  {sideTag(trade)}
                </span>
              </button>
              <div className="st-signal-meta">
                <span>{symbolLabel(sig.symbol)}</span>
                <span>{fmtClock(trade.entryTime)}</span>
                <span>{strategyTimeframe(def).toUpperCase()}</span>
                {trade.instrument && <span title={trade.instrument}>{trade.instrument}</span>}
              </div>
              <dl className="st-levels">
                <div>
                  <dt>{trade.premium ? "Premium" : "Entry"}</dt>
                  <dd>{fmtPrice(trade.entry)}</dd>
                </div>
                <div>
                  <dt>{trade.target != null ? "Target" : "Exit"}</dt>
                  {trade.target != null ? (
                    <dd className="st-up">
                      {fmtPrice(trade.target)}
                      <LevelDist move={coinMove ? levelMove(trade.side, trade.entry, trade.target) : null} />
                    </dd>
                  ) : (
                    <dd className="st-lvl-rule">{exitRule(trade, stats[def.id]?.trades)}</dd>
                  )}
                </div>
                <div>
                  <dt>Stop-loss</dt>
                  {trade.stop != null ? (
                    <dd className="st-down">
                      {fmtPrice(trade.stop)}
                      <LevelDist move={coinMove ? levelMove(trade.side, trade.entry, trade.stop) : null} />
                    </dd>
                  ) : (
                    // Options ka risk premium mein hai — "None" padh kar lagega bina SL ka trade hai.
                    <dd className="st-lvl-rule">{trade.premium ? "—" : "None"}</dd>
                  )}
                </div>
              </dl>
              <div className="st-signal-foot">
                <span
                  className={`st-status ${trade.pct > 0 ? "st-up" : trade.pct < 0 ? "st-down" : ""}`}
                  data-o={trade.outcome}
                  title={coinMove ? `After ~${ROUND_TRIP_COST_PCT.toFixed(2)}% fees + slippage · ${fmtPct(trade.gross)} before` : undefined}
                >
                  {outcomeLabel(trade)} {fmtPct(trade.pct)}
                  {trade.premium ? " of premium" : ""}
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
                ) : trade.open && research ? (
                  <span className="st-muted-sm" title={RESEARCH_ONLY_NOTE}>
                    Research only
                  </span>
                ) : trade.open && appliedIds.has(def.id) && options ? (
                  <span className="st-muted-sm" title="Trade the option legs on your exchange">
                    Signal only
                  </span>
                ) : trade.open && appliedIds.has(def.id) && runsOnServer(def) ? (
                  <span className="st-placed">Server bot handles it</span>
                ) : trade.open && !appliedIds.has(def.id) ? (
                  <span className="st-muted-sm">{options ? "Apply for signals" : "Apply to trade"}</span>
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
            <b>Auto-trade</b>
            <small>
              Master switch. On: strategies applied with Auto-trade place their own entries and exits while Strateo is
              open. Off: they only signal. Server bots (24×7) are not affected.
            </small>
          </div>
          <Switch
            on={settings.oneClick && gate.ok}
            onChange={(v) => (gate.ok ? writeSettings({ oneClick: v }) : onGate())}
            label="Auto-trade"
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
            <b>Demo amount</b>
            <small>Virtual wallet for each new bot. Starts here; updates as trades fill.</small>
          </div>
          <label className="st-money">
            $
            <input
              className="st-input"
              type="number"
              min={10}
              step={10}
              value={settings.botCapital}
              onChange={(e) => writeSettings({ botCapital: Math.max(10, Number(e.target.value) || 0) })}
              aria-label="Demo amount in USD"
            />
          </label>
        </div>
        <div className="st-row">
          <div>
            <b>Risk per trade</b>
            <small>A stop-out loses about this much of the demo wallet.</small>
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
