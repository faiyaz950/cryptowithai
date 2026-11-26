import { atr, ema, rsi } from "@/lib/indicators";
import type {
  Bucket,
  LabCandle,
  LabMark,
  LabReport,
  LabSpec,
  LabTrade,
  Stability,
  SymbolScore,
} from "@/lib/advancedBacktest";

export interface LabSeries {
  symbol: string;
  candles: LabCandle[];
}

interface Bar { t: number; o: number; h: number; l: number; c: number }
interface Clock { day: string; mins: number; month: number; weekday: number }
type Side = "long" | "short";
type Fill = "filled" | "wait" | "expired";

interface Book {
  symbol: string;
  bars: Bar[];
  fast: number[];
  slow: number[];
  pull: number[];
  andLine: number[];
  rsi: (number | null)[];
  atrStop: (number | null)[];
  atrTrail: (number | null)[];
  clock: Clock[];
  tradeDay: string[];
}

interface Arm {
  book: number;
  side: Side;
  phase: "pull" | "break";
  setupAt: number;
  pulls: number;
  retestAt: number;
  level: number;
  retestHigh: number;
  retestLow: number;
  deadline: number;
  rsiMarked: boolean;
}

interface Pos {
  book: number;
  side: Side;
  entry: number;
  entryTime: number;
  entryIndex: number;
  stop: number;
  target: number | null;
  qtyLeft: number;
  qty0: number;
  riskPx: number;
  pnl: number;
  partial: boolean;
  level: number;
  retestHigh: number;
  retestLow: number;
  deadline: number;
}

const TF_MIN: Record<string, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440,
};

const emptyBucket = (label: string): Bucket => ({
  label, trades: 0, net: 0, wins: 0, winRate: null, avgR: null, profitFactor: null, maxDd: 0,
});

export function describeStability(folds: Bucket[], finalTrades: number, total: number): Stability {
  const signs = folds.map((fold) => (fold.trades === 0 || Math.abs(fold.net) < 0.005 ? 0 : fold.net > 0 ? 1 : -1));
  let flips = 0;
  let prev = 0;
  for (const sign of signs) {
    if (sign === 0) continue;
    if (prev !== 0 && sign !== prev) flips += 1;
    prev = sign;
  }
  const exam = finalTrades < 30 ? "too-small" : "ok";
  const headline = `${total} trades. The fold sign changed ${flips} ${flips === 1 ? "time" : "times"}. Final test has ${finalTrades} ${finalTrades === 1 ? "trade" : "trades"}.${exam === "too-small" ? " Exam too small." : ""}`;
  return { flips, finalTrades, exam, headline };
}

export function simulate(series: LabSeries[], spec: LabSpec): LabReport {
  const shared = series.length > 1;
  const notes = [
    "A stop order fills on a later candle, never on the retest candle that set the level.",
    "If one candle touches the stop and the target, the stop is taken. A gap through the stop fills at the open.",
    "A stop that moves after a partial, breakeven, or trail protects the next candle.",
    spec.fundingBps8h > 0
      ? `Funding is an assumption of ${num(spec.fundingBps8h)} bps per 8h, not the historical funding print.`
      : "Historical funding is not on these candles, so funding is off.",
  ];
  if (shared) notes.push("BTC, ETH and SOL share one capital and one daily trade cap. A fill on one coin does not close the others. If two coins fill on the same candle, BTC is checked first, then ETH, then SOL.");
  if (spec.reentry === "same") notes.push("After a stop, the same order can be placed again until it expires.");
  if (spec.squareOff) notes.push("Square-off fills at the open of the first candle that starts at or after that IST time.");
  if (spec.targetMode === "none") notes.push("No target is set. Trades leave on the stop, the time stop, square-off, the opposite signal, or the end of the data.");

  const fastN = Math.max(1, Math.round(spec.fast));
  const slowN = Math.max(1, Math.round(spec.slow));
  const pullN = Math.max(1, Math.round(spec.pullLen));
  const pullWindow = Math.max(1, Math.round(spec.pullWindow));
  const pullNo = Math.max(1, Math.round(spec.pullNo));
  const expireBars = Math.max(1, Math.round(spec.expireBars));
  const rsiPeriod = Math.max(2, Math.round(spec.rsiPeriod));
  const dayStartMins = spec.dayStart === "05:30" ? 5 * 60 + 30 : 0;
  const minutes = TF_MIN[spec.timeframe] ?? 30;

  const blank = (extra: string, bars = 0, from = 0, to = 0): LabReport => ({
    trades: [], bars, from, to,
    setups: 0, expired: 0, rsiBlocked: 0, cancelled: 0, skipped: 0, andBlocked: 0,
    practice: emptyBucket("Practice"), finalTest: emptyBucket("Final test"), folds: [],
    notes: [...notes, extra],
    marks: [], bySymbol: [], stability: describeStability([], 0, 0), solo: null,
  });

  const books: Book[] = [];
  const skippedNames: string[] = [];
  for (const item of series) {
    const bars: Bar[] = item.candles
      .filter((c) => [c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n) && n > 0))
      .map((c) => ({ t: c.time, o: c.open, h: c.high, l: c.low, c: c.close }));
    if (bars.length < slowN + 5) {
      skippedNames.push(item.symbol.replace(/USDT$/, "USD"));
      continue;
    }
    const closes = bars.map((b) => b.c);
    const clock = bars.map((b) => istClock(b.t));
    books.push({
      symbol: item.symbol,
      bars,
      fast: ema(closes, fastN),
      slow: ema(closes, slowN),
      pull: ema(closes, pullN),
      andLine: ema(closes, Math.max(1, Math.round(spec.andEma))),
      rsi: rsi(closes, rsiPeriod),
      atrStop: atr(bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: 0 })), Math.max(1, Math.round(spec.stopAtrLen))),
      atrTrail: atr(bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: 0 })), Math.max(1, Math.round(spec.trailAtrLen))),
      clock,
      tradeDay: clock.map((c) => (c.mins >= dayStartMins ? c.day : prevDate(c.day))),
    });
  }
  if (!books.length) return blank("Not enough candles for the slow average.");
  if (skippedNames.length) notes.push(`${skippedNames.join(", ")} did not have enough candles, so that market was left out.`);

  const spanStart = Math.min(...books.map((b) => b.bars[0].t));
  const spanEnd = Math.max(...books.map((b) => b.bars[b.bars.length - 1].t));
  const requestedCut = Date.parse(`${spec.holdout}T00:00:00+05:30`);
  const cutInRange = Number.isFinite(requestedCut) && requestedCut > spanStart && requestedCut < spanEnd;
  const holdoutMs = cutInRange ? requestedCut : spanStart + (spanEnd - spanStart) * 0.75;
  if (!cutInRange) {
    notes.push("The final-test date sits outside the loaded candles, so the last quarter of this window is the final test. Move the date inside the window, or load more candles, to use that date.");
  }

  const trades: LabTrade[] = [];
  const marks: LabMark[] = [];
  const arms: Arm[] = [];
  const open = new Map<number, Pos>();
  let setups = 0;
  let expired = 0;
  let rsiBlocked = 0;
  let cancelled = 0;
  let skipped = 0;
  let andBlocked = 0;
  let capped = false;
  let equity = spec.capital;
  const dayCount = new Map<string, number>();

  const pushMark = (mark: LabMark) => {
    if (marks.length < 500) marks.push(mark);
  };
  const want = (side: Side) => spec.side === "both" || spec.side === side;
  const fee = (px: number, qty: number) => px * qty * (Math.max(0, spec.feePct) / 100) * (1 + Math.max(0, spec.gstPct) / 100) + Math.max(0, spec.feePerOrder);
  const slip = (px: number, side: Side, entering: boolean) => {
    const worse = Math.max(0, spec.slipPct) / 100;
    const up = (side === "long") === entering;
    return px * (up ? 1 + worse : 1 - worse);
  };
  const padPctFor = (side: Side) => (
    spec.side === "both" && spec.sellMode === "own" && side === "short" ? spec.shortStopPadPct : spec.stopPadPct
  );

  const closePos = (p: Pos, exitPx: number, time: number, reason: string) => {
    const book = books[p.book];
    const px = slip(exitPx, p.side, false);
    const dir = p.side === "long" ? 1 : -1;
    p.pnl += (px - p.entry) * dir * p.qtyLeft;
    p.pnl -= fee(px, p.qtyLeft);
    const riskCash = Math.abs(p.riskPx) * p.qty0;
    const trade: LabTrade = {
      n: trades.length + 1,
      side: p.side,
      entryTime: p.entryTime,
      exitTime: time,
      entry: p.entry,
      stop: p.stop,
      target: p.target,
      exit: px,
      qty: p.qty0,
      pnl: p.pnl,
      r: riskCash > 0 ? p.pnl / riskCash : 0,
      reason,
      holdout: p.entryTime >= holdoutMs,
      symbol: book.symbol,
    };
    trades.push(trade);
    if (shared) equity += trade.pnl;
  };

  const tighten = (p: Pos, candidate: number) => {
    if (!Number.isFinite(candidate)) return;
    p.stop = p.side === "long" ? Math.max(p.stop, candidate) : Math.min(p.stop, candidate);
  };

  const bookPartial = (p: Pos, pxRaw: number) => {
    if (!spec.partialOn || p.partial || p.target == null || spec.partialQtyPct <= 0) return;
    const qty = p.qty0 * (spec.partialQtyPct / 100);
    if (qty <= 0 || qty >= p.qtyLeft) return;
    const px = slip(pxRaw, p.side, false);
    const dir = p.side === "long" ? 1 : -1;
    p.pnl += (px - p.entry) * dir * qty;
    p.pnl -= fee(px, qty);
    p.qtyLeft -= qty;
    p.partial = true;
    tighten(p, p.entry + (p.target - p.entry) * (spec.stopLockPct / 100));
  };

  const reopen = (p: Pos, i: number, reason: string) => {
    if (spec.reentry !== "same") return;
    if (reason !== "Stop" && reason !== "Partial + stop") return;
    if (i >= p.deadline) return;
    arms.push({
      book: p.book, side: p.side, phase: "break", setupAt: i, pulls: pullNo, retestAt: i,
      level: p.level, retestHigh: p.retestHigh, retestLow: p.retestLow, deadline: p.deadline, rsiMarked: false,
    });
  };

  const manage = (b: number, i: number) => {
    const pos = open.get(b);
    if (!pos) return;
    const book = books[b];
    const bar = book.bars[i];
    if (spec.fundingBps8h > 0) {
      pos.pnl -= pos.qtyLeft * bar.c * (spec.fundingBps8h / 10000) * (minutes / 480);
    }
    if (spec.squareOff) {
      const so = toMin(spec.squareOff);
      const now = book.clock[i].mins >= so;
      const prev = i === 0 ? null : book.clock[i - 1];
      const crossed = now && (prev == null || prev.mins < so || (book.clock[i].day !== prev.day && prev.mins >= so));
      if (crossed) {
        closePos(pos, bar.o, bar.t, pos.partial ? "Partial + square-off" : "Square-off");
        open.delete(b);
        return;
      }
    }
    const gapStop = pos.side === "long" ? bar.o <= pos.stop : bar.o >= pos.stop;
    const stopHit = pos.side === "long" ? bar.o <= pos.stop || bar.l <= pos.stop : bar.o >= pos.stop || bar.h >= pos.stop;
    if (stopHit) {
      const reason = pos.partial ? "Partial + stop" : "Stop";
      closePos(pos, gapStop ? bar.o : pos.stop, bar.t, reason);
      reopen(pos, i, reason);
      open.delete(b);
      return;
    }
    if (pos.target != null) {
      const partialPx = pos.entry + (pos.target - pos.entry) * (spec.partialAtPct / 100);
      const partialHit = pos.side === "long" ? bar.h >= partialPx : bar.l <= partialPx;
      if (!pos.partial && partialHit) bookPartial(pos, partialPx);
      const tgtHit = pos.side === "long" ? bar.h >= pos.target : bar.l <= pos.target;
      if (tgtHit) {
        closePos(pos, pos.target, bar.t, pos.partial ? "Partial + target" : "Target");
        open.delete(b);
        return;
      }
    }
    if (spec.timeStopBars > 0 && i - pos.entryIndex >= spec.timeStopBars) {
      closePos(pos, bar.c, bar.t, pos.partial ? "Partial + time" : "Time");
      open.delete(b);
      return;
    }
    if (spec.trailMode === "points" && spec.trailPoints > 0) {
      tighten(pos, pos.side === "long" ? bar.h - spec.trailPoints : bar.l + spec.trailPoints);
    } else if (spec.trailMode === "atr") {
      const width = book.atrTrail[i];
      if (width != null) tighten(pos, pos.side === "long" ? bar.h - width * spec.trailAtrMult : bar.l + width * spec.trailAtrMult);
    }
    if (spec.beAfterR > 0) {
      const trigger = pos.side === "long" ? pos.entry + pos.riskPx * spec.beAfterR : pos.entry - pos.riskPx * spec.beAfterR;
      if (pos.side === "long" ? bar.h >= trigger : bar.l <= trigger) tighten(pos, pos.entry);
    }
  };

  const clockOk = (b: number, i: number) => {
    const c = books[b].clock[i];
    if (spec.noEntryBefore && c.mins < toMin(spec.noEntryBefore)) return false;
    if (spec.noEntryAfter && c.mins >= toMin(spec.noEntryAfter)) return false;
    if (spec.blockHoursOn && spec.blockedHours.includes(Math.floor(c.mins / 60))) return false;
    if (spec.skipMonthsOn && spec.skippedMonths.includes(c.month)) return false;
    if (spec.weekdaysOnly && !spec.allowedDays.includes(c.weekday)) return false;
    if (!spec.windowOn) return true;
    const a = toMin(spec.windowFrom);
    const z = toMin(spec.windowTo);
    if (a === z) return true;
    if (a < z) return c.mins >= a && c.mins < z;
    if (spec.nextDayAllowed) return c.mins >= a || c.mins < z;
    return c.mins >= a;
  };

  const rsiOk = (b: number, i: number, side: Side) => {
    if (!spec.useRsi) return true;
    const v = books[b].rsi[i];
    if (v == null) return false;
    if (side === "long") return v > spec.rsiLongAbove;
    const below = spec.side === "short" || spec.sellMode === "own" ? spec.rsiShortBelow : 100 - spec.rsiLongAbove;
    return v < below;
  };

  const andOk = (b: number, i: number, side: Side) => {
    if (!spec.andOn) return true;
    const level = books[b].andLine[i];
    if (!level) return false;
    const wantAbove = side === "short" ? spec.andSide !== "above" : spec.andSide === "above";
    return wantAbove ? books[b].bars[i].c > level : books[b].bars[i].c < level;
  };

  const sized = (fill: number, riskPx: number, ignoreBook: number | null) => {
    const lev = Math.max(1, spec.leverage);
    const capital = shared ? Math.max(0, equity) : spec.capital;
    let qty = spec.lots * spec.lotSize;
    if (spec.sizeMode === "fixed") qty = spec.fixedQty;
    if (spec.sizeMode === "capitalPct") qty = (capital * (spec.capitalPct / 100) * lev) / fill;
    if (spec.sizeMode === "risk") qty = riskPx > 0 ? (capital * (spec.riskPct / 100)) / riskPx : 0;
    const used = shared
      ? [...open.values()].reduce((sum, pos) => (pos.book === ignoreBook ? sum : sum + pos.qtyLeft * pos.entry), 0)
      : 0;
    const room = capital * lev - used;
    const max = room > 0 ? room / fill : 0;
    if (qty > max + 1e-12) capped = true;
    return Math.min(Math.max(0, qty), Math.max(0, max));
  };

  const protective = (arm: Arm, rawFill: number, i: number): { stop: number } | "unready" | "wide" => {
    const book = books[arm.book];
    const pad = Math.max(0, padPctFor(arm.side));
    const points = Math.max(0, spec.stopPoints);
    let stop: number | null = null;
    if (spec.stopMode === "pct") {
      stop = arm.side === "long" ? rawFill * (1 - pad / 100) : rawFill * (1 + pad / 100);
    } else if (spec.stopMode === "points") {
      stop = arm.side === "long" ? rawFill - points : rawFill + points;
    } else if (spec.stopMode === "atr") {
      const width = book.atrStop[i];
      if (width == null) return "unready";
      stop = arm.side === "long" ? rawFill - width * Math.max(0, spec.stopAtrMult) : rawFill + width * Math.max(0, spec.stopAtrMult);
    } else if (spec.stopPadUnit === "points") {
      stop = arm.side === "long" ? arm.retestLow - points : arm.retestHigh + points;
    } else {
      stop = arm.side === "long" ? arm.retestLow * (1 - pad / 100) : arm.retestHigh * (1 + pad / 100);
    }
    if (stop == null || !Number.isFinite(stop)) return "unready";
    if (spec.stopMaxMode !== "off" && spec.stopMaxPoints > 0 && Math.abs(rawFill - stop) > spec.stopMaxPoints) {
      if (spec.stopMaxMode === "skip") return "wide";
      stop = arm.side === "long" ? rawFill - spec.stopMaxPoints : rawFill + spec.stopMaxPoints;
    }
    return { stop };
  };

  const targetFor = (side: Side, fill: number, riskPx: number): number | null => {
    if (spec.targetMode === "none") return null;
    if (spec.targetMode === "pct") {
      const pct = Math.max(0, spec.targetPct) / 100;
      return side === "long" ? fill * (1 + pct) : fill * (1 - pct);
    }
    if (spec.targetMode === "points") {
      return side === "long" ? fill + Math.max(0, spec.targetPoints) : fill - Math.max(0, spec.targetPoints);
    }
    return side === "long" ? fill + riskPx * spec.targetR : fill - riskPx * spec.targetR;
  };

  const tryFill = (b: number, i: number, arm: Arm): Fill => {
    if (i <= arm.retestAt) return "wait";
    if (i > arm.deadline) return "expired";
    const book = books[b];
    const bar = book.bars[i];
    const touched = arm.side === "long" ? bar.h >= arm.level : bar.l <= arm.level;
    if (!touched) return "wait";
    if (!rsiOk(b, i, arm.side)) {
      rsiBlocked += 1;
      if (!arm.rsiMarked) {
        arm.rsiMarked = true;
        pushMark({ time: bar.t, price: bar.c, kind: "rsi", side: arm.side, symbol: book.symbol });
      }
      return "wait";
    }
    if (!clockOk(b, i)) return "wait";
    const day = book.tradeDay[i];
    if ((dayCount.get(day) ?? 0) >= spec.maxTradesDay) return "wait";
    const pos = open.get(b);
    if (pos && pos.side === arm.side) return "wait";
    if (pos && !spec.reverse) return "wait";

    const gap = arm.side === "long" ? bar.o >= arm.level : bar.o <= arm.level;
    const rawFill = gap ? bar.o : arm.level;
    const decided = protective(arm, rawFill, i);
    if (decided === "unready") return "wait";
    if (decided === "wide") {
      skipped += 1;
      return "wait";
    }
    const stop = decided.stop;
    const fill = slip(rawFill, arm.side, true);
    const riskPx = arm.side === "long" ? fill - stop : stop - fill;
    const replacing = pos && pos.side !== arm.side ? b : null;
    const qty = riskPx > 0 ? sized(fill, riskPx, replacing) : 0;
    if (!(qty > 0)) {
      skipped += 1;
      return "wait";
    }
    if (pos && pos.side !== arm.side) {
      closePos(pos, fill, bar.t, "Opposite");
      open.delete(b);
    }
    open.set(b, {
      book: b,
      side: arm.side,
      entry: fill,
      entryTime: bar.t,
      entryIndex: i,
      stop,
      target: targetFor(arm.side, fill, riskPx),
      qtyLeft: qty,
      qty0: qty,
      riskPx,
      pnl: -fee(fill, qty),
      partial: false,
      level: arm.level,
      retestHigh: arm.retestHigh,
      retestLow: arm.retestLow,
      deadline: arm.deadline,
    });
    dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
    return "filled";
  };

  const cross = (b: number, i: number): Side | null => {
    if (i < 1) return null;
    const book = books[b];
    const f0 = book.fast[i - 1];
    const f1 = book.fast[i];
    const s0 = book.slow[i - 1];
    const s1 = book.slow[i];
    if (![f0, f1, s0, s1].every((n) => Number.isFinite(n))) return null;
    if (f0 <= s0 && f1 > s1) return "long";
    if (f0 >= s0 && f1 < s1) return "short";
    return null;
  };

  const nearPull = (b: number, i: number) => {
    const level = books[b].pull[i];
    if (!Number.isFinite(level) || level <= 0) return false;
    const band = spec.pullBand === "points" ? Math.max(0, spec.pullPoints) : level * (Math.max(0, spec.pullPct) / 100);
    const bar = books[b].bars[i];
    return bar.l <= level + band && bar.h >= level - band;
  };

  const steps: { t: number; b: number; i: number }[] = [];
  books.forEach((book, b) => {
    for (let i = 1; i < book.bars.length; i++) steps.push({ t: book.bars[i].t, b, i });
  });
  steps.sort((a, c) => a.t - c.t || a.b - c.b);

  for (const step of steps) {
    const { b, i } = step;
    const book = books[b];
    manage(b, i);
    const flipped = cross(b, i);
    if (flipped && spec.cancelOnCross) {
      for (let k = arms.length - 1; k >= 0; k--) {
        const arm = arms[k];
        if (arm.book !== b || arm.side === flipped) continue;
        pushMark({ time: book.bars[i].t, price: book.bars[i].c, kind: "cancel", side: arm.side, symbol: book.symbol });
        arms.splice(k, 1);
        cancelled += 1;
      }
    }
    if (flipped && want(flipped)) {
      if (!andOk(b, i, flipped)) andBlocked += 1;
      else {
        setups += 1;
        const same = arms.findIndex((arm) => arm.book === b && arm.side === flipped);
        if (same >= 0) arms.splice(same, 1);
        arms.push({
          book: b, side: flipped, phase: "pull", setupAt: i, pulls: 0, retestAt: i,
          level: 0, retestHigh: 0, retestLow: 0, deadline: i + pullWindow, rsiMarked: false,
        });
      }
    }
    for (let k = arms.length - 1; k >= 0; k--) {
      const arm = arms[k];
      if (arm.book !== b) continue;
      if (arm.phase === "pull") {
        if (i <= arm.setupAt) continue;
        if (i > arm.deadline) {
          pushMark({ time: book.bars[i].t, price: book.bars[i].c, kind: "expired", side: arm.side, symbol: book.symbol });
          arms.splice(k, 1);
          expired += 1;
          continue;
        }
        if (!nearPull(b, i)) continue;
        arm.pulls += 1;
        if (arm.pulls < pullNo) continue;
        const bar = book.bars[i];
        arm.level = arm.side === "long" ? bar.h : bar.l;
        arm.retestHigh = bar.h;
        arm.retestLow = bar.l;
        arm.phase = "break";
        arm.retestAt = i;
        arm.deadline = i + expireBars;
        continue;
      }
      const fill = tryFill(b, i, arm);
      if (fill === "wait") continue;
      if (fill === "expired") {
        pushMark({ time: book.bars[i].t, price: book.bars[i].c, kind: "expired", side: arm.side, symbol: book.symbol });
        expired += 1;
      }
      arms.splice(k, 1);
    }
  }

  for (const pos of open.values()) {
    const last = books[pos.book].bars[books[pos.book].bars.length - 1];
    closePos(pos, last.c, last.t, "End of data");
  }
  if (capped) notes.push(shared
    ? "At least one order was cut so the open notional stayed inside the shared capital × leverage."
    : "At least one order was cut so the notional stayed inside capital × leverage.");

  const practiceTrades = trades.filter((t) => !t.holdout);
  const finalTrades = trades.filter((t) => t.holdout);
  const span = spanEnd - spanStart;
  const folds = [0, 1, 2, 3].map((n) => {
    const a = spanStart + (span * n) / 4;
    const z = spanStart + (span * (n + 1)) / 4;
    return bucket(`Fold ${n + 1}`, trades.filter((t) => t.entryTime >= a && (n === 3 ? t.entryTime <= z : t.entryTime < z)));
  });
  const bySymbol: SymbolScore[] = books.map((book) => {
    const rows = trades.filter((t) => t.symbol === book.symbol);
    return { symbol: book.symbol, net: rows.reduce((sum, t) => sum + t.pnl, 0), trades: rows.length };
  });
  const winners = bySymbol.filter((row) => row.trades > 0 && row.net > 0);
  const active = bySymbol.filter((row) => row.trades > 0);
  const solo = winners.length === 1 && active.length > 1 ? winners[0].symbol.replace(/USDT$/, "USD") : null;
  if (solo) notes.push(`This rule made money on ${solo} only.`);

  notes.push(`${books.map((book) => `${book.symbol.replace(/USDT$/, "USD")} ${book.bars.length.toLocaleString("en-IN")}`).join(" · ")} candles.`);
  return {
    trades,
    bars: Math.max(...books.map((book) => book.bars.length)),
    from: spanStart,
    to: spanEnd,
    setups,
    expired,
    rsiBlocked,
    cancelled,
    skipped,
    andBlocked,
    practice: bucket("Practice", practiceTrades),
    finalTest: bucket("Final test", finalTrades),
    folds,
    notes,
    marks,
    bySymbol,
    stability: describeStability(folds, finalTrades.length, trades.length),
    solo,
  };
}

function bucket(label: string, rows: LabTrade[]): Bucket {
  const net = rows.reduce((sum, t) => sum + t.pnl, 0);
  const wins = rows.filter((t) => t.pnl > 0).length;
  const grossWin = rows.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(rows.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  let peak = 0;
  let eq = 0;
  let maxDd = 0;
  for (const trade of rows) {
    eq += trade.pnl;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
  }
  return {
    label,
    trades: rows.length,
    net,
    wins,
    winRate: rows.length ? (wins / rows.length) * 100 : null,
    avgR: rows.length ? rows.reduce((sum, t) => sum + t.r, 0) / rows.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    maxDd,
  };
}

function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 1e8) / 1e8);
}

function toMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function prevDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function istClock(ms: number): Clock {
  const parts = IST.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    mins: hour * 60 + (Number(get("minute")) || 0),
    month: Number(get("month")) || 1,
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}
