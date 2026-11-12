"use client";

/**
 * Strateo — strategy marketplace jo chart ke saath chalta hai.
 *
 * Card par jo bhi number hai (win rate, last week ke din, aaj ka return) wo
 * isi coin par strategy ke asli backtest se nikalta hai — wahi engine jo
 * strategy page aur Backtest tab chalate hain. Apply karne par:
 *   - server bot wali strategies (`autoTrade`) backend worker par deploy hoti hain
 *     (browser band ho tab bhi chalti hain);
 *   - baaki strategies yahin monitor hoti hain: har band candle par dobara
 *     backtest, naya trade khula to signal, aur 1-Click Trade on ho to order
 *     seedha connected exchange (ya paper account) par.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DESK_TZ,
  fetchPaperAccount,
  intervalMinutes,
  placeDemoOrder,
  runBacktest,
  type BacktestResult,
  type BacktestTrade,
} from "./cryptoApi";
import { placeByokOrder, type ExchangeAccount } from "./accountApi";
import { optionsKind, runOptionsBacktest } from "./optionsBacktest";
import { isBgrhStrategy, runBgrhBacktest } from "./buyGridRecovery";
import { STRATEGIES, num, str, type StrategyDef, type StrategyValues } from "./strategies";

const DAY_MS = 86_400_000;
/** Card ka data itni der taaza maana jaata hai. */
export const STATS_TTL_MS = 20 * 60_000;
/** Ek saath itne backtest — backend ko exchange se history laani padti hai. */
const CONCURRENCY = 2;
/** Chart par itne pichhle trades ke markers kaafi hain. */
const KEEP_TRADES = 80;

/* ── Strategy meta ─────────────────────────────────────── */

export type StrateoMarket = "crypto" | "us" | "in";

/**
 * Options strategies (condor, spread, single option) — inke trades option premium mein hain,
 * coin price mein nahi. Strateo inka order nahi lagata (perp order galat instrument hota),
 * sirf signal deta hai.
 */
export function isOptionsStrategy(def: StrategyDef): boolean {
  return optionsKind(def) != null;
}

/** Server worker par chalne wali strategies — baaki browser se monitor hoti hain. */
export function runsOnServer(def: StrategyDef): boolean {
  return def.autoTrade === true;
}

export function authorOf(def: StrategyDef): string {
  const c = def.category.toLowerCase();
  if (c.includes("phenlabs")) return "PhenLabs";
  if (c.includes("mt5")) return "MT5 EA";
  return "Cryptomantra";
}

export function marketOf(def: StrategyDef): StrateoMarket {
  void def;
  return "crypto";
}

export function strategyTimeframe(def: StrategyDef): string {
  return def.fixedTimeframe ?? str(def.defaults, "timeframe", "1h");
}

/** Backtest window — 4h jaisi dheemi strategies ko zyada din chahiye, warna 3-4 trade hi aate. */
function statDays(def: StrategyDef, timeframe: string): number {
  if (intervalMinutes(timeframe) >= 240) return 180;
  const base = num(def.defaults, "days", 30);
  return Math.max(14, Math.min(60, base));
}

/** Strategy ke defaults, bas coin chart wala aur backtest isi ek coin par. */
export function strateoValues(def: StrategyDef, symbol: string): StrategyValues {
  const timeframe = strategyTimeframe(def);
  const values: StrategyValues = { ...def.defaults, symbol, timeframe, days: statDays(def, timeframe) };
  if (def.portfolio?.length) values.backtest_scope = "single";
  return values;
}

/* ── Stats from a real backtest ────────────────────────── */

export interface StrateoTrade {
  side: "long" | "short";
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stop: number | null;
  target: number | null;
  /** Entry se exit tak price ka move, side ke hisaab se (bina leverage). Options par premium ka. */
  pct: number;
  outcome: "target" | "stop" | "trail" | "exit" | "open";
  open: boolean;
  /** Options trade: entry/exit/pct premium ke hain, coin price ke nahi. */
  premium?: boolean;
  /** Options structure, jaise "Iron condor" / "Bear put spread". */
  structure?: string;
  /** Options legs + expiry, jaise "-C76000 +C77000 · 16 Sep". */
  instrument?: string;
  /** Grid basket (kai legs): pct basket ka asli P&L hai — pehli buy se live price ka move nahi. */
  basket?: boolean;
}

export interface WeekDay {
  key: string;
  letter: string;
  label: string;
  pct: number;
  trades: number;
  result: "win" | "loss" | "flat" | "none";
}

export interface StrateoStats {
  strategyId: string;
  symbol: string;
  timeframe: string;
  days: number;
  computedAt: number;
  winRate: number | null;
  closed: number;
  totalPct: number;
  /** Aaj se pehle ke 5 din, purane se naya. */
  week: WeekDay[];
  todayPct: number;
  todayClosed: number;
  /** Aaj kitni nayi entries aayi. */
  todaySignals: number;
  open: StrateoTrade | null;
  trades: StrateoTrade[];
  lastPrice: number | null;
  error?: string;
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: DESK_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: DESK_TZ, weekday: "short" });

export function dayKey(ms: number): string {
  return dayFmt.format(ms);
}

function toMs(t: number): number {
  return t > 1e12 ? t : t * 1000;
}

function sideOf(raw: unknown): "long" | "short" {
  return /^(sell|short|bear|put$)/i.test(String(raw ?? "")) ? "short" : "long";
}

/** Options backtest ka side — "iron_condor", "bull_call_spread", "bear_put_spread", "call", "put". */
const OPTION_STRUCTURES: Record<string, string> = {
  iron_condor: "Iron condor",
  bull_call_spread: "Bull call spread",
  bear_put_spread: "Bear put spread",
  call: "Buy call",
  put: "Buy put",
};

function movePct(side: "long" | "short", entry: number, exit: number): number {
  return side === "long" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
}

function toTrade(t: BacktestTrade): StrateoTrade | null {
  const entry = Number(t.entry_price);
  const exit = Number(t.exit_price);
  if (!(entry > 0) || !Number.isFinite(exit) || !t.entry_time) return null;
  const rawSide = String(t.side ?? "").toLowerCase();
  const structure = OPTION_STRUCTURES[rawSide];
  const side = sideOf(rawSide);
  // Grid basket: engine legs ka asli P&L % deta hai. Pehli buy se exit ka move yahan galat
  // hota (price gira par hedge se basket profit mein band hua) — isliye wahi lo, flip nahi.
  const basket = typeof t.pnl_pct === "number" && Number.isFinite(t.pnl_pct);
  let pct = basket ? (t.pnl_pct as number) : movePct(side, entry, exit);
  // Options (short premium) jaise trades mein price ka move ulta padh sakta hai — P&L ka sign sach hai.
  if (!basket && Number.isFinite(t.pnl) && t.pnl !== 0 && Math.sign(t.pnl) !== Math.sign(pct)) {
    pct = Math.abs(pct) * Math.sign(t.pnl);
  }
  const status = String(t.status || "").toUpperCase();
  const open = status === "CLOSED_AT_END" || status === "OPEN" || status === "OPEN_AT_END";
  const outcome: StrateoTrade["outcome"] = open
    ? "open"
    : status === "TRAILING_STOP"
      ? "trail"
      : /SL|STOP|EMERGENCY/.test(status)
        ? "stop"
        : /TARGET|TP/.test(status)
          ? "target"
          : "exit";
  const stop = Number(t.stop_loss);
  const target = Number(t.target);
  return {
    side,
    entryTime: toMs(t.entry_time),
    exitTime: toMs(t.exit_time || t.entry_time),
    entry,
    exit,
    stop: stop > 0 ? stop : null,
    target: target > 0 ? target : null,
    pct,
    outcome,
    open,
    ...(structure ? { premium: true, structure, instrument: t.instrument || undefined } : {}),
    ...(basket ? { basket: true } : {}),
  };
}

export function statsFromResult(
  def: StrategyDef,
  symbol: string,
  timeframe: string,
  days: number,
  res: BacktestResult,
  now = Date.now(),
): StrateoStats {
  const trades = (res.trades ?? [])
    .map(toTrade)
    .filter((t): t is StrateoTrade => t !== null)
    .sort((a, b) => a.entryTime - b.entryTime);

  const op = res.open_position;
  if (op && op.entry_price > 0) {
    const side = sideOf(op.side);
    const mark = Number(op.mark_price) || op.entry_price;
    const basket = typeof op.unrealized_pct === "number" && Number.isFinite(op.unrealized_pct);
    trades.push({
      side,
      entryTime: toMs(op.entry_time),
      exitTime: now,
      entry: op.entry_price,
      exit: mark,
      stop: op.stop_loss > 0 ? op.stop_loss : null,
      target: null,
      pct: basket ? (op.unrealized_pct as number) : movePct(side, op.entry_price, mark),
      outcome: "open",
      open: true,
      ...(basket ? { basket: true } : {}),
    });
  }

  const closed = trades.filter((t) => !t.open);
  const wins = closed.filter((t) => t.pct > 0).length;
  const today = dayKey(now);

  const byDay = new Map<string, { pct: number; trades: number }>();
  for (const t of closed) {
    const key = dayKey(t.exitTime);
    const row = byDay.get(key) ?? { pct: 0, trades: 0 };
    row.pct += t.pct;
    row.trades += 1;
    byDay.set(key, row);
  }

  const week: WeekDay[] = [];
  for (let i = 5; i >= 1; i--) {
    const at = now - i * DAY_MS;
    const key = dayKey(at);
    const label = weekdayFmt.format(at);
    const row = byDay.get(key);
    week.push({
      key,
      label,
      letter: label.charAt(0),
      pct: row?.pct ?? 0,
      trades: row?.trades ?? 0,
      result: !row ? "none" : row.pct > 0 ? "win" : row.pct < 0 ? "loss" : "flat",
    });
  }

  const open = trades.find((t) => t.open) ?? null;
  const todayRow = byDay.get(today);
  const openToday = open && dayKey(open.entryTime) === today ? open.pct : 0;
  const last = trades[trades.length - 1];

  return {
    strategyId: def.id,
    symbol,
    timeframe,
    days,
    computedAt: now,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    closed: closed.length,
    totalPct: closed.reduce((s, t) => s + t.pct, 0),
    week,
    todayPct: (todayRow?.pct ?? 0) + openToday,
    todayClosed: todayRow?.trades ?? 0,
    todaySignals: trades.filter((t) => dayKey(t.entryTime) === today).length,
    open,
    trades: trades.slice(-KEEP_TRADES),
    lastPrice: open ? open.exit : last ? last.exit : null,
  };
}

async function backtestFor(def: StrategyDef, values: StrategyValues): Promise<BacktestResult> {
  if (optionsKind(def)) return runOptionsBacktest(def, values);
  if (isBgrhStrategy(def.id)) return runBgrhBacktest(values);
  return runBacktest(def.toBacktest(values));
}

export async function computeStats(def: StrategyDef, symbol: string): Promise<StrateoStats> {
  const values = strateoValues(def, symbol);
  const timeframe = str(values, "timeframe", "1h");
  const days = num(values, "days", 30);
  try {
    const res = await backtestFor(def, values);
    if (!res.success) throw new Error(res.error || "Backtest failed");
    return statsFromResult(def, symbol, timeframe, days, res);
  } catch (err) {
    return {
      strategyId: def.id,
      symbol,
      timeframe,
      days,
      computedAt: Date.now(),
      winRate: null,
      closed: 0,
      totalPct: 0,
      week: [],
      todayPct: 0,
      todayClosed: 0,
      todaySignals: 0,
      open: null,
      trades: [],
      lastPrice: null,
      error: err instanceof Error ? err.message : "Backtest failed",
    };
  }
}

/* ── Stats cache + queue ───────────────────────────────── */

// v2: options trades ab structure / premium ke saath — purana cache inke bina tha.
// v3: grid basket (BGRH) ka % ab asli P&L se — purane cache mein ulta-pulta flip hua % tha.
const STATS_KEY = "strateo.stats.v3";
const STATS_EVENT = "strateo:stats";
const memo = new Map<string, StrateoStats>();
const inflight = new Map<string, Promise<StrateoStats>>();
let memoLoaded = false;

function statKey(id: string, symbol: string) {
  return `${id}|${symbol}`;
}

function loadMemo() {
  if (memoLoaded || typeof window === "undefined") return;
  memoLoaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STATS_KEY) || "{}") as Record<string, StrateoStats>;
    for (const [k, v] of Object.entries(raw)) if (v && typeof v === "object") memo.set(k, v);
  } catch {
    /* kharab cache — naya ban jayega */
  }
}

function saveMemo() {
  try {
    // Sirf taaza aur bina error wale — error dobara try hona chahiye.
    const keep: Record<string, StrateoStats> = {};
    const cutoff = Date.now() - 6 * 60 * 60_000;
    for (const [k, v] of memo) if (!v.error && v.computedAt > cutoff) keep[k] = v;
    window.localStorage.setItem(STATS_KEY, JSON.stringify(keep));
  } catch {
    /* storage full / blocked — memory cache kaafi hai */
  }
}

export function peekStats(id: string, symbol: string): StrateoStats | undefined {
  loadMemo();
  return memo.get(statKey(id, symbol));
}

export function isFresh(stats: StrateoStats | undefined, ttl = STATS_TTL_MS): boolean {
  return Boolean(stats && Date.now() - stats.computedAt < ttl);
}

type Job = { run: () => void; priority: boolean };
const queue: Job[] = [];
let running = 0;

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running += 1;
    job.run();
  }
}

function schedule<T>(task: () => Promise<T>, priority: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = {
      priority,
      run: () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            running -= 1;
            pump();
          });
      },
    };
    if (priority) {
      const at = queue.findIndex((j) => !j.priority);
      if (at === -1) queue.push(job);
      else queue.splice(at, 0, job);
    } else queue.push(job);
    pump();
  });
}

/** Cache taaza ho to wahi; warna queue mein backtest. `force` = cache chhodo. */
export function requestStats(
  def: StrategyDef,
  symbol: string,
  opts: { force?: boolean; priority?: boolean } = {},
): Promise<StrateoStats> {
  loadMemo();
  const key = statKey(def.id, symbol);
  const cached = memo.get(key);
  if (!opts.force && isFresh(cached) && !cached?.error) return Promise.resolve(cached!);
  const running = inflight.get(key);
  if (running) return running;
  const p = schedule(() => computeStats(def, symbol), Boolean(opts.priority))
    .then((stats) => {
      memo.set(key, stats);
      saveMemo();
      return stats;
    })
    .finally(() => {
      inflight.delete(key);
      window.dispatchEvent(new CustomEvent(STATS_EVENT, { detail: key }));
    });
  inflight.set(key, p);
  // Card "calculating" dikhaye — pending bhi isi event se padha jaata hai.
  window.dispatchEvent(new CustomEvent(STATS_EVENT, { detail: key }));
  return p;
}

/** Saari strategies ka data is coin par — jo aata jaye card par dikhta jaye. */
export function useStrateoStats(symbol: string, defs: StrategyDef[] = STRATEGIES) {
  const [version, setVersion] = useState(0);

  const load = useCallback(
    (force: boolean) => {
      // Options wale browser mein har bar replay karte hain — sabse aakhir mein.
      const ordered = [...defs].sort((a, b) => Number(Boolean(optionsKind(a))) - Number(Boolean(optionsKind(b))));
      for (const def of ordered) {
        const cached = peekStats(def.id, symbol);
        if (force || !isFresh(cached) || cached?.error) void requestStats(def, symbol, { force });
      }
    },
    [defs, symbol],
  );

  useEffect(() => {
    const onStats = () => setVersion((v) => v + 1);
    window.addEventListener(STATS_EVENT, onStats);
    load(false);
    // TTL nikal gaya ho aur tab dikh raha ho to chupchaap taaza karo.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, 60_000);
    return () => {
      window.removeEventListener(STATS_EVENT, onStats);
      window.clearInterval(timer);
    };
  }, [load]);

  const { stats, pending } = useMemo(() => {
    void version;
    const out: Record<string, StrateoStats | undefined> = {};
    const busy = new Set<string>();
    for (const def of defs) {
      out[def.id] = peekStats(def.id, symbol);
      if (inflight.has(statKey(def.id, symbol))) busy.add(def.id);
    }
    return { stats: out, pending: busy };
  }, [defs, symbol, version]);

  return { stats, pending, refresh: () => load(true) };
}

/* ── Small localStorage stores ─────────────────────────── */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeAndNotify(key: string, event: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage band — is tab mein event se kaam chal jayega */
  }
  window.dispatchEvent(new Event(event));
}

/** `read` module-level (stable) function honi chahiye. Desk client-only hai, isliye pehli render par hi storage padh lete hain. */
function useStored<T>(read: () => T, event: string): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(event, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(event, sync);
      window.removeEventListener("storage", sync);
    };
  }, [read, event]);
  return value;
}

/* Applied strategies — top bar ke tabs. */

export interface AppliedStrategy {
  id: string;
  symbol: string;
  timeframe: string;
  appliedAt: number;
  mode: "paper" | "live";
  /** Chart source jis par apply hua (delta / bybit / coindcx). */
  exchange: string;
  accountId: number | null;
  runner: "server" | "browser";
  botId: number | null;
  /** Kis account ne apply kiya — ek browser par doosra user login kare to use ye na dikhe. */
  userId?: number;
}

const APPLIED_KEY = "strateo.applied.v1";
const APPLIED_EVENT = "strateo:applied";

export function readApplied(): AppliedStrategy[] {
  return readList<AppliedStrategy>(APPLIED_KEY);
}

export function saveApplied(row: AppliedStrategy) {
  writeAndNotify(APPLIED_KEY, APPLIED_EVENT, [
    ...readApplied().filter((a) => !(a.id === row.id && a.userId === row.userId)),
    row,
  ]);
}

export function removeApplied(id: string, userId: number | undefined) {
  writeAndNotify(
    APPLIED_KEY,
    APPLIED_EVENT,
    readApplied().filter((a) => !(a.id === id && a.userId === userId)),
  );
}

export function useApplied(): AppliedStrategy[] {
  return useStored(readApplied, APPLIED_EVENT);
}

/* Settings tab. */

export interface StrateoSettings {
  /** Signal aate hi order — bina poochhe. */
  oneClick: boolean;
  mode: "paper" | "live";
  /** Live orders kis exchange key se. */
  accountId: number | null;
  /** Har browser signal par itne dollar ka order. */
  orderUsd: number;
  /** Server bots ke liye. */
  botCapital: number;
  botRiskPct: number;
  sound: boolean;
  desktopAlerts: boolean;
}

export const DEFAULT_SETTINGS: StrateoSettings = {
  oneClick: false,
  mode: "paper",
  accountId: null,
  orderUsd: 100,
  botCapital: 1000,
  botRiskPct: 1,
  sound: true,
  desktopAlerts: false,
};

const SETTINGS_KEY = "strateo.settings.v1";
const SETTINGS_EVENT = "strateo:settings";

export function readSettings(): StrateoSettings {
  return readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function writeSettings(patch: Partial<StrateoSettings>) {
  writeAndNotify(SETTINGS_KEY, SETTINGS_EVENT, { ...readSettings(), ...patch });
}

export function useSettings(): StrateoSettings {
  return useStored(readSettings, SETTINGS_EVENT);
}

/* Prefs — exchanges, coin, timeframe, favourites, bells. */

export interface StrateoPrefs {
  exchanges: string[];
  exchange: string;
  symbol: string;
  interval: string;
  favorites: string[];
  bells: string[];
  focus: string | null;
  panelOpen: boolean;
}

export const DEFAULT_PREFS: StrateoPrefs = {
  exchanges: ["delta"],
  exchange: "delta",
  symbol: "BTCUSDT",
  interval: "5m",
  favorites: [],
  bells: [],
  focus: null,
  panelOpen: true,
};

const PREFS_KEY = "strateo.prefs.v1";
const PREFS_EVENT = "strateo:prefs";

export function readPrefs(): StrateoPrefs {
  return readJson(PREFS_KEY, DEFAULT_PREFS);
}

export function writePrefs(patch: Partial<StrateoPrefs>) {
  writeAndNotify(PREFS_KEY, PREFS_EVENT, { ...readPrefs(), ...patch });
}

export function usePrefs(): StrateoPrefs {
  return useStored(readPrefs, PREFS_EVENT);
}

export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/* Executions — Strateo ne jo orders lagaye. */

export interface Execution {
  key: string;
  strategyId: string;
  symbol: string;
  side: "long" | "short";
  entryTime: number;
  entry: number;
  qty: number;
  stop: number | null;
  target: number | null;
  /** Server ne asal mein kya kiya — live maanga par switch band ho to paper. */
  mode: "paper" | "live";
  accountId: number | null;
  orderId: string;
  at: number;
  closed?: { at: number; price: number; reason: string; orderId?: string };
  /** Order kis account se gaya — close bhi sirf wahi user kare. */
  userId?: number;
}

const EXEC_KEY = "strateo.exec.v1";
const EXEC_EVENT = "strateo:exec";

export function signalKey(strategyId: string, symbol: string, entryTime: number) {
  return `${strategyId}|${symbol}|${entryTime}`;
}

export function readExecutions(): Execution[] {
  return readList<Execution>(EXEC_KEY);
}

export function upsertExecution(row: Execution) {
  const rows = readExecutions().filter((r) => r.key !== row.key);
  // Sirf pichhle 30 din — store hamesha chhota rahe.
  const cutoff = Date.now() - 30 * DAY_MS;
  writeAndNotify(EXEC_KEY, EXEC_EVENT, [row, ...rows].filter((r) => r.at > cutoff).slice(0, 300));
}

export function useExecutions(): Execution[] {
  return useStored(readExecutions, EXEC_EVENT);
}

/* Signals already announced — reload par dobara alert / order nahi. */

const SEEN_KEY = "strateo.seen.v1";

export function lastSeenEntry(strategyId: string, symbol: string): number {
  return readJson<Record<string, number>>(SEEN_KEY, {})[`${strategyId}|${symbol}`] ?? 0;
}

export function markSeen(strategyId: string, symbol: string, entryTime: number) {
  const all = readJson<Record<string, number>>(SEEN_KEY, {});
  all[`${strategyId}|${symbol}`] = Math.max(entryTime, all[`${strategyId}|${symbol}`] ?? 0);
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/* ── Who may trade ─────────────────────────────────────── */

export const LOGIN_HREF = "/login?next=%2Ftrade%2Fstrateo";
export const EXCHANGES_HREF = "/trade?tab=exchanges";

export type TradeGate =
  | { ok: true }
  | { ok: false; reason: "login" | "exchange" | "checking" | "error"; title: string; body: string };

/**
 * Apply, Place order aur 1-Click sirf tab — user logged in ho aur Exchanges par kam se
 * kam ek chalu API key judi ho. Backtest dekhna aur bell alerts sabke liye khule hain.
 * `accounts` null = abhi load ho rahe hain.
 */
export function tradeGate(opts: {
  signedIn: boolean;
  accounts: ExchangeAccount[] | null;
  failed: boolean;
}): TradeGate {
  if (!opts.signedIn) {
    return {
      ok: false,
      reason: "login",
      title: "Log in to trade",
      body: "Strateo trades on your own account. Log in, connect your exchange, then apply any strategy.",
    };
  }
  if (opts.failed) {
    return {
      ok: false,
      reason: "error",
      title: "Couldn't load your exchanges",
      body: "Check your connection and try again.",
    };
  }
  if (opts.accounts == null) {
    return {
      ok: false,
      reason: "checking",
      title: "Checking your exchange…",
      body: "Loading your connected exchanges — one moment.",
    };
  }
  if (!opts.accounts.some((a) => a.is_active)) {
    return {
      ok: false,
      reason: "exchange",
      title: "Connect an exchange",
      body: "Add your exchange API key once on Exchanges. After that, any strategy you apply trades on it.",
    };
  }
  return { ok: true };
}

/* ── Execution on the exchange ─────────────────────────── */

export class StrateoOrderError extends Error {}

/** Coin quantity — exchange contracts mein badal leta hai aur minimum se kam ho to mana karta hai. */
export function quantityFor(usd: number, price: number): number {
  if (!(usd > 0) || !(price > 0)) return 0;
  return Number((usd / price).toPrecision(3));
}

/** SL / target galat taraf ho to backend bracket reject karta — aise level hata do. */
function bracketFor(side: "long" | "short", price: number, stop: number | null, target: number | null) {
  const long = side === "long";
  const okStop = stop != null && (long ? stop < price : stop > price) ? stop : null;
  const okTarget = target != null && (long ? target > price : target < price) ? target : null;
  return { stop: okStop, target: okTarget };
}

export async function executeSignal(opts: {
  token: string;
  userId: number;
  strategyId: string;
  symbol: string;
  trade: StrateoTrade;
  price: number;
  settings: StrateoSettings;
  account: ExchangeAccount | null;
}): Promise<Execution> {
  const { token, userId, strategyId, symbol, trade, price, settings, account } = opts;
  const qty = quantityFor(settings.orderUsd, price);
  if (!qty) throw new StrateoOrderError("Order size is zero — set an amount in Settings.");
  const side = trade.side === "long" ? "buy" : "sell";
  const { stop, target } = bracketFor(trade.side, price, trade.stop, trade.target);
  const base = {
    key: signalKey(strategyId, symbol, trade.entryTime),
    strategyId,
    symbol,
    side: trade.side,
    entryTime: trade.entryTime,
    entry: price,
    qty,
    stop,
    target,
    at: Date.now(),
    userId,
  };

  if (settings.mode === "live") {
    if (!account) throw new StrateoOrderError("Select an exchange account in Settings for live orders.");
    const res = await placeByokOrder(token, {
      exchange_account_id: account.id,
      symbol,
      side,
      order_type: "market",
      quantity: qty,
      mode: "live",
    });
    const row: Execution = {
      ...base,
      mode: res.data.mode,
      accountId: account.id,
      orderId: String(res.data.order_id || ""),
    };
    upsertExecution(row);
    return row;
  }

  const res = await placeDemoOrder(token, {
    symbol,
    side,
    order_type: "market",
    quantity: qty,
    stop_loss: stop,
    take_profit: target,
  });
  if (!res.success) throw new StrateoOrderError(res.error || res.message || "Paper order failed");
  const row: Execution = {
    ...base,
    mode: "paper",
    accountId: null,
    orderId: String(res.order_id || res.data?.order_id || ""),
  };
  upsertExecution(row);
  return row;
}

/**
 * Strategy ne trade band kiya. Live par reduce-only market — position ulti nahi ho sakti.
 * Paper par SL/target bracket khud kaat-ta hai; sirf strategy ke apne exit par, aur tabhi
 * jab paper position abhi bhi usi taraf khuli ho.
 */
export async function closeExecution(opts: {
  token: string;
  exec: Execution;
  trade: StrateoTrade;
  account: ExchangeAccount | null;
}): Promise<Execution> {
  const { token, exec, trade, account } = opts;
  const closeSide = exec.side === "long" ? "sell" : "buy";
  const reason = trade.outcome === "stop" ? "SL hit" : trade.outcome === "target" ? "Target hit" : "Strategy exit";
  let orderId: string | undefined;

  if (exec.mode === "live" && account) {
    const res = await placeByokOrder(token, {
      exchange_account_id: account.id,
      symbol: exec.symbol,
      side: closeSide,
      order_type: "market",
      quantity: exec.qty,
      reduce_only: true,
      mode: "live",
    });
    orderId = String(res.data.order_id || "");
  } else if (exec.mode === "paper" && (trade.outcome === "exit" || trade.outcome === "trail")) {
    const account = await fetchPaperAccount(token);
    const pos = account.positions.find((p) => p.symbol === exec.symbol && p.side === exec.side);
    if (pos && pos.size > 0) {
      const res = await placeDemoOrder(token, {
        symbol: exec.symbol,
        side: closeSide,
        order_type: "market",
        quantity: Math.min(pos.size, exec.qty),
      });
      orderId = String(res.order_id || res.data?.order_id || "");
    }
  }

  const row: Execution = { ...exec, closed: { at: Date.now(), price: trade.exit, reason, orderId } };
  upsertExecution(row);
  return row;
}

export function executionPnl(exec: Execution, mark: number | null): number {
  const price = exec.closed?.price ?? mark;
  if (price == null || !(price > 0)) return 0;
  const dir = exec.side === "long" ? 1 : -1;
  return dir * (price - exec.entry) * exec.qty;
}

/* ── Formatting ────────────────────────────────────────── */

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 1 : abs >= 1 ? 2 : 5;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signal chip — "BUY" / "SELL", options par structure ("IRON CONDOR"). */
export function sideTag(t: Pick<StrateoTrade, "side" | "structure">): string {
  if (t.structure) return t.structure.toUpperCase();
  return t.side === "long" ? "BUY" : "SELL";
}

/** Bubble / toast — "Long" / "Short", options par structure. */
export function sideWord(t: Pick<StrateoTrade, "side" | "structure">): string {
  return t.structure ?? (t.side === "long" ? "Long" : "Short");
}

/** "03:15" aaj ke liye, warna "11 Nov 03:15" — IST. */
export function fmtWhen(ms: number, now = Date.now()): string {
  if (dayKey(ms) === dayKey(now)) return fmtClock(ms);
  const day = new Date(ms).toLocaleDateString("en-GB", { timeZone: DESK_TZ, day: "2-digit", month: "short" });
  return `${day} ${fmtClock(ms)}`;
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: DESK_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "01:47" — kitne ghante:minute se. */
export function fmtSince(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - ms) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function outcomeLabel(t: StrateoTrade): string {
  switch (t.outcome) {
    case "stop":
      return "SL Hit";
    case "target":
      return "Target Hit";
    case "trail":
      return "Trail Stop";
    case "open":
      return "Open";
    default:
      return "Exit";
  }
}
