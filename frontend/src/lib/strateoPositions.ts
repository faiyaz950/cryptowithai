/**
 * Applied strategy ki asli haalat — "abhi BUY chal raha hai ya SELL, kab aur kahan se khula,
 * kab band hua". Teen source milate hain:
 *  - Execution (browser runner) — Strateo ne jo order lagaya, asli fill price ke saath.
 *  - StrategyBot (server runner) — backend worker ki khuli position.
 *  - StrateoStats — strategy ka apna signal (backtest), jab order na laga ho.
 * User ki asli position pehle; signal sirf tab jab order nahi laga — aur saaf likha ho kyun.
 */
import { intervalMinutes, type StrategyBot } from "@/lib/cryptoApi";
import type { StrategyDef } from "@/lib/strategies";
import {
  executionPnl,
  isOptionsStrategy,
  signalKey,
  type AppliedStrategy,
  type Execution,
  type StrateoStats,
  type StrateoTrade,
} from "@/lib/strateo";

export type PositionState =
  /** Strateo ka order laga hai — asli position khuli. */
  | "open"
  /** Server bot abhi order laga raha hai. */
  | "entering"
  /** Strategy trade mein hai, par is account par order nahi laga. */
  | "signal"
  /** Koi trade nahi — agli entry ka intezaar. */
  | "flat"
  | "loading"
  /** Is coin par strategy nahi chalti. */
  | "error";

/** Signal par order kyun nahi laga. */
export type NotPlacedWhy =
  /** Trade apply karne se pehle khula — Strateo sirf agli taaza entry leta hai. */
  | "before-apply"
  /** Options — Strateo legs ka order nahi lagata. */
  | "options"
  /** 1-Click band — user khud lagaye. */
  | "manual"
  /** Server bot ne ye entry chhod di (ya abhi uthayi nahi). */
  | "server";

export interface StrateoPosition {
  key: string;
  row: AppliedStrategy;
  def: StrategyDef;
  stats: StrateoStats | undefined;
  state: PositionState;
  side: "long" | "short" | null;
  options: boolean;
  /** Options structure, jaise "Iron condor". */
  structure: string | null;
  /** Kahan se khula — asli fill, warna signal ka price (options par premium). */
  entry: number | null;
  /** Kab khula — order ka waqt, warna signal candle. */
  entryTime: number | null;
  stop: number | null;
  target: number | null;
  qty: number | null;
  mark: number | null;
  /** Entry se abhi tak, side ke hisaab se (bina leverage). Options par premium ka. */
  pct: number | null;
  /** Asli order par $ P&L. */
  usd: number | null;
  premium: boolean;
  exec: Execution | null;
  bot: StrategyBot | null;
  why: NotPlacedWhy | null;
  /** Strategy ka abhi khula trade (model). */
  signal: StrateoTrade | null;
  /** Aakhri band trade (strategy ke hisaab se). */
  lastClosed: StrateoTrade | null;
}

function move(side: "long" | "short", entry: number | null, mark: number | null): number | null {
  if (!entry || !mark || !(entry > 0) || !(mark > 0)) return null;
  return ((side === "long" ? 1 : -1) * (mark - entry) * 100) / entry;
}

export function buildPosition(opts: {
  row: AppliedStrategy;
  def: StrategyDef;
  stats: StrateoStats | undefined;
  executions: Execution[];
  bots: StrategyBot[];
  /** Chart wale coin ka live price — doosre coin par null (stats ka mark lete hain). */
  livePrice: number | null;
}): StrateoPosition {
  const { row, def, stats, executions, bots, livePrice } = opts;
  const options = isOptionsStrategy(def);
  const ok = stats && !stats.error ? stats : null;
  const signal = ok?.open ?? null;
  const lastClosed = ok ? [...ok.trades].reverse().find((t) => !t.open) ?? null : null;
  const coinMark = livePrice ?? ok?.lastPrice ?? null;
  const exec =
    executions
      .filter((e) => e.strategyId === row.id && e.symbol === row.symbol && !e.closed)
      .sort((a, b) => b.at - a.at)[0] ?? null;
  const bot = row.botId ? bots.find((b) => b.id === row.botId) ?? null : null;

  const base: StrateoPosition = {
    key: `${row.id}|${row.symbol}`,
    row,
    def,
    stats,
    state: "flat",
    side: null,
    options,
    structure: signal?.structure ?? null,
    entry: null,
    entryTime: null,
    stop: null,
    target: null,
    qty: null,
    mark: null,
    pct: null,
    usd: null,
    premium: false,
    exec,
    bot,
    why: null,
    signal,
    lastClosed,
  };

  if (exec) {
    return {
      ...base,
      state: "open",
      side: exec.side,
      entry: exec.entry,
      entryTime: exec.at,
      stop: exec.stop,
      target: exec.target,
      qty: exec.qty,
      mark: coinMark,
      pct: move(exec.side, exec.entry, coinMark),
      usd: coinMark ? executionPnl(exec, coinMark) : null,
    };
  }

  if (bot && bot.trade_state === "open" && (bot.side === "long" || bot.side === "short")) {
    const pct = move(bot.side, bot.entry_price, coinMark);
    return {
      ...base,
      state: "open",
      side: bot.side,
      entry: bot.entry_price,
      entryTime: bot.entry_time,
      stop: bot.stop_loss,
      target: bot.tp1_done ? null : bot.tp1_price,
      qty: bot.quantity,
      mark: coinMark,
      pct,
      usd:
        coinMark && bot.entry_price && bot.quantity
          ? (bot.side === "short" ? -1 : 1) * (coinMark - bot.entry_price) * bot.quantity
          : null,
    };
  }

  if (bot && bot.trade_state === "entering") {
    const side = bot.side === "long" || bot.side === "short" ? bot.side : signal?.side ?? null;
    return { ...base, state: "entering", side, entry: signal?.entry ?? null, entryTime: bot.entry_time ?? signal?.entryTime ?? null };
  }

  if (!stats) return { ...base, state: "loading" };
  if (stats.error) return { ...base, state: "error" };

  if (signal) {
    const barMs = intervalMinutes(row.timeframe) * 60_000;
    // Monitor sirf apply ke baad wali entry par order lagata hai — usse pehle khula trade "pichhla" hai.
    const fresh = signal.entryTime + barMs > row.appliedAt;
    const why: NotPlacedWhy = options ? "options" : !fresh ? "before-apply" : row.runner === "server" ? "server" : "manual";
    // Options par entry premium hai — coin price se % galat hota; strategy wala % lo.
    const premium = Boolean(signal.premium);
    const mark = premium || signal.basket ? signal.exit : coinMark;
    return {
      ...base,
      state: "signal",
      side: signal.side,
      entry: signal.entry,
      entryTime: signal.entryTime,
      stop: signal.stop,
      target: signal.target,
      mark,
      pct: premium || signal.basket ? signal.pct : move(signal.side, signal.entry, mark),
      premium,
      why,
    };
  }

  return base;
}

/* ── History — har trade ek row: kab / kahan khula, kab / kahan band ── */

export type HistoryStatus =
  /** Strateo ne order lagaya. */
  | "placed"
  /** Apply ke baad aaya, order nahi laga. */
  | "signal"
  /** Server bot ka trade (bot log mein detail). */
  | "server"
  /** Apply se pehle — sirf strategy ka record. */
  | "before";

export interface HistoryRow {
  key: string;
  side: "long" | "short";
  structure: string | null;
  entryTime: number;
  exitTime: number | null;
  entry: number;
  exit: number | null;
  pct: number;
  outcome: StrateoTrade["outcome"];
  open: boolean;
  premium: boolean;
  status: HistoryStatus;
  exec: Execution | null;
  /** Strateo ne band kiya to wajah — "Target hit" / "SL hit" / "Strategy exit". */
  closedReason: string | null;
}

export function positionHistory(pos: StrateoPosition, executions: Execution[]): HistoryRow[] {
  const { row, stats } = pos;
  const trades = stats && !stats.error ? stats.trades : [];
  const mine = executions.filter((e) => e.strategyId === row.id && e.symbol === row.symbol);
  const byKey = new Map(mine.map((e) => [e.key, e]));
  const used = new Set<string>();
  const barMs = intervalMinutes(row.timeframe) * 60_000;
  const out: HistoryRow[] = [];

  for (const t of trades) {
    const key = signalKey(row.id, row.symbol, t.entryTime);
    const exec = byKey.get(key) ?? null;
    if (exec) used.add(key);
    const after = t.entryTime + barMs > row.appliedAt;
    const status: HistoryStatus = exec ? "placed" : !after ? "before" : row.runner === "server" ? "server" : "signal";
    // Asli order ho to uske apne price / waqt — strategy ke candle wale nahi. Server bot ka
    // abhi khula trade bhi bot ke fill par.
    const closed = exec?.closed;
    const botFill =
      !exec && t.open && pos.bot?.trade_state === "open" && pos.bot.entry_time === t.entryTime ? pos.bot.entry_price : null;
    const entry = exec ? exec.entry : botFill ?? t.entry;
    const exit = closed ? closed.price : t.open ? (pos.mark ?? t.exit) : t.exit;
    const pct =
      (exec || t.open) && !t.premium && !t.basket ? (move(t.side, entry, exit) ?? t.pct) : t.pct;
    out.push({
      key,
      side: t.side,
      structure: t.structure ?? null,
      entryTime: exec ? exec.at : t.entryTime,
      exitTime: closed ? closed.at : t.open ? null : t.exitTime,
      entry,
      exit,
      pct,
      outcome: closed ? "exit" : t.outcome,
      open: closed ? false : t.open,
      premium: Boolean(t.premium),
      status,
      exec,
      closedReason: closed?.reason ?? null,
    });
  }

  // Strateo ke order jinka trade ab backtest window mein nahi (purane ya signal palat gaya).
  for (const e of mine) {
    if (used.has(e.key)) continue;
    const exit = e.closed ? e.closed.price : pos.mark;
    out.push({
      key: e.key,
      side: e.side,
      structure: null,
      entryTime: e.at,
      exitTime: e.closed?.at ?? null,
      entry: e.entry,
      exit,
      pct: move(e.side, e.entry, exit) ?? 0,
      outcome: e.closed ? "exit" : "open",
      open: !e.closed,
      premium: false,
      status: "placed",
      exec: e,
      closedReason: e.closed?.reason ?? null,
    });
  }

  return out.sort((a, b) => b.entryTime - a.entryTime);
}

/** "42m", "5h 12m", "3d 4h" — position kitni der se khuli. */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** BUY / SELL — user isi zubaan mein sochta hai; options par structure. */
export function sideName(side: "long" | "short" | null, structure?: string | null): string {
  if (structure) return structure.toUpperCase();
  return side === "short" ? "SELL" : "BUY";
}

const SHORT_STRUCTURE: Record<string, string> = {
  "Iron condor": "CONDOR",
  "Bull call spread": "BULL CALL",
  "Bear put spread": "BEAR PUT",
  "Buy call": "CALL",
  "Buy put": "PUT",
};

/** Tang jagah (timeline, dock) ke liye — "IRON CONDOR" ki jagah "CONDOR". */
export function sideShort(side: "long" | "short" | null, structure?: string | null): string {
  if (structure) return SHORT_STRUCTURE[structure] ?? "OPTIONS";
  return side === "short" ? "SELL" : "BUY";
}
