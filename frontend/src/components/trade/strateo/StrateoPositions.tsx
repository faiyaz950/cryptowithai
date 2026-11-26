"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, Info, Loader2, Plus, Server, TriangleAlert } from "lucide-react";
import { DESK_TZ, symbolLabel, venueShort } from "@/lib/cryptoApi";
import type { StrategyDef } from "@/lib/strategies";
import {
  ROUND_TRIP_COST_PCT,
  botDemoBalance,
  dayKey,
  exitRule,
  fmtClock,
  fmtDemoWallet,
  fmtPct,
  fmtPrice,
  fmtUsd,
  fmtWhen,
  levelMove,
  netOfCosts,
  signalKey,
  type Execution,
} from "@/lib/strateo";
import {
  fmtDuration,
  historyResultLabel,
  levelHits,
  positionHistory,
  sideName,
  sideShort,
  type HistoryRow,
  type StrateoPosition,
} from "@/lib/strateoPositions";

const HISTORY_SHOWN = 5;

interface Props {
  positions: StrateoPosition[];
  executions: Execution[];
  now: number;
  focusId: string | null;
  busyId: string | null;
  oneClick: boolean;
  exchangeName: string;
  onFocus: (def: StrategyDef) => void;
  onPlace: (pos: StrateoPosition) => void;
  onBrowse: () => void;
}

/**
 * Positions — apply ke baad ek nazar mein: abhi BUY / SELL chal raha hai ya nahi, kab aur kis
 * price par khula, SL / target kya hai, aur pichhle trades kab khule / band hue.
 */
export default function PositionsView({
  positions,
  executions,
  now,
  focusId,
  busyId,
  oneClick,
  exchangeName,
  onFocus,
  onPlace,
  onBrowse,
}: Props) {
  if (!positions.length) {
    return (
      <div className="st-list">
        <div className="st-empty st-pos-empty">
          <b>No strategy applied yet</b>
          <span>
            Apply a strategy and its live position shows here: whether a buy or sell is open, where and when it
            opened, and when each trade closed.
          </span>
          <button type="button" className="st-btn st-btn-solid st-btn-sm" onClick={onBrowse}>
            <Plus className="w-3.5 h-3.5" aria-hidden /> Browse strategies
          </button>
        </div>
      </div>
    );
  }

  const open = positions.filter((p) => p.state === "open" || p.state === "entering");
  const buys = open.filter((p) => p.side === "long").length;
  const sells = open.filter((p) => p.side === "short").length;
  const signals = positions.filter((p) => p.state === "signal").length;
  const waiting = positions.filter((p) => p.state === "flat").length;
  const openUsd = open.reduce((s, p) => s + (p.usd ?? 0), 0);
  // Paper ka P&L virtual hai — saaf likho, warna lagta hai exchange par paisa laga.
  const modes = new Set(open.map((p) => p.exec?.mode ?? p.bot?.mode ?? p.row.mode));
  const pnlNote = !open.length
    ? "Strateo orders"
    : modes.size > 1
      ? "Paper + live"
      : modes.has("live")
        ? "Live orders"
        : "Paper (virtual)";

  // Khuli position sabse upar — "abhi kya chal raha hai" pehle dikhe.
  const rank = (p: StrateoPosition) =>
    p.state === "open" || p.state === "entering" ? 0 : p.state === "signal" ? 1 : p.state === "flat" ? 2 : 3;
  const ordered = [...positions].sort((a, b) => rank(a) - rank(b) || b.row.appliedAt - a.row.appliedAt);

  return (
    <div className="st-list">
      <section className="st-pos-sum" aria-label="Positions summary">
        <div>
          <span className="st-label">Open</span>
          <b>{open.length}</b>
          <small>
            {open.length ? (
              <>
                <span className="st-up">{buys} buy</span> · <span className="st-down">{sells} sell</span>
              </>
            ) : (
              "No order open"
            )}
          </small>
        </div>
        <div>
          <span className="st-label">Open P&amp;L</span>
          <b className={openUsd > 0 ? "st-up" : openUsd < 0 ? "st-down" : undefined}>{open.length ? fmtUsd(openUsd) : "—"}</b>
          <small>{pnlNote}</small>
        </div>
        <div>
          <span className="st-label">Waiting</span>
          <b>{waiting}</b>
          <small title={signals ? "Strategy is in a trade but no order was placed on your account" : undefined}>
            {signals ? `${signals} not placed` : "Next entry"}
          </small>
        </div>
      </section>

      {ordered.map((p) => (
        <PositionCard
          key={p.key}
          pos={p}
          executions={executions}
          now={now}
          focused={focusId === p.row.id}
          busy={p.signal ? busyId === signalKey(p.row.id, p.row.symbol, p.signal.entryTime) : false}
          autoMaster={oneClick}
          exchangeName={exchangeName}
          onFocus={() => onFocus(p.def)}
          onPlace={() => onPlace(p)}
        />
      ))}
    </div>
  );
}

function PositionCard({
  pos,
  executions,
  now,
  focused,
  busy,
  autoMaster,
  exchangeName,
  onFocus,
  onPlace,
}: {
  pos: StrateoPosition;
  executions: Execution[];
  now: number;
  focused: boolean;
  busy: boolean;
  autoMaster: boolean;
  exchangeName: string;
  onFocus: () => void;
  onPlace: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { def, row, state, side, bot } = pos;
  const Icon = def.icon;
  const history = positionHistory(pos, executions);
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN);
  const tone = pos.pct == null ? "" : pos.pct > 0 ? "st-up" : pos.pct < 0 ? "st-down" : "st-flat";
  const sideLabel = sideName(side, pos.structure);
  const word = side === "short" ? "Sell" : "Buy";
  const sideData = pos.structure ? "options" : side ?? "none";
  const coin = symbolLabel(row.symbol).split("/")[0];

  let headline: string;
  let sub: string;
  switch (state) {
    case "open":
      headline = `${word} position open`;
      sub = pos.entryTime ? `Since ${fmtWhen(pos.entryTime, now)} · ${fmtDuration(now - pos.entryTime)}` : "Open";
      break;
    case "entering":
      headline = `Placing ${word.toLowerCase()} order…`;
      sub = "Server bot is entering now";
      break;
    case "signal":
      headline = pos.structure ? `${pos.structure} signal` : `${word} signal · no order`;
      sub = pos.entryTime ? `Signal since ${fmtWhen(pos.entryTime, now)} · ${fmtDuration(now - pos.entryTime)}` : "";
      break;
    case "loading":
      headline = "Checking position…";
      sub = "Running the strategy on the latest candles";
      break;
    case "error":
      headline = `Not available on ${coin}`;
      sub = pos.stats?.error ?? "This strategy cannot run on this coin";
      break;
    default:
      headline = "No open position";
      sub = pos.lastClosed
        ? `Waiting for next entry · last closed ${fmtWhen(pos.lastClosed.exitTime, now)}`
        : "Waiting for the next entry signal";
  }

  return (
    <article className="st-pos" data-state={state} data-side={sideData} data-focused={focused} aria-label={`${def.name} position`}>
      <button type="button" className="st-pos-head" onClick={onFocus} title="Show this strategy on the chart">
        <span className="st-card-icon st-card-icon-sm">
          <Icon className="w-3.5 h-3.5" aria-hidden />
        </span>
        <span className="st-pos-id">
          <b>{def.name}</b>
          <small>
            {symbolLabel(row.symbol)} · {row.timeframe.toUpperCase()} ·{" "}
            <span data-mode={row.mode}>{row.mode === "live" ? "Live" : "Paper"}</span>
            {" · "}
            {row.runner === "server"
              ? "Auto · server 24×7"
              : pos.options || pos.why === "research"
                ? "Signals only"
                : row.auto === false
                  ? "Signals only"
                  : autoMaster
                    ? "Auto · while open"
                    : "Auto (switch off)"}
          </small>
          {pos.bot && (() => {
            const wallet = botDemoBalance(pos.bot, pos.mark);
            return (
              <small
                className="st-pos-wallet"
                data-pnl={wallet.pnl > 0 ? "up" : wallet.pnl < 0 ? "down" : "flat"}
              >
                {fmtDemoWallet(wallet)}
              </small>
            );
          })()}
        </span>
        <span className="st-pos-chart">
          Chart <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </span>
      </button>

      {/* Abhi ki haalat — sabse bada, sabse pehle. */}
      <div className="st-pos-now" role="status">
        {state === "open" || state === "entering" || state === "signal" ? (
          <span className="st-side st-pos-side" data-side={sideData} data-dim={state === "signal"}>
            {state === "open" && <span className="st-pos-live" aria-hidden />}
            {sideLabel}
          </span>
        ) : (
          <span className="st-side st-pos-side" data-side="none">
            {state === "loading" ? <Loader2 className="w-3 h-3 st-spin" aria-hidden /> : state === "error" ? "N/A" : "FLAT"}
          </span>
        )}
        <span className="st-pos-state">
          <b>{headline}</b>
          {sub && <small>{sub}</small>}
        </span>
        {pos.pct != null && (state === "open" || state === "signal") && (
          <span className={`st-pos-pnl ${tone}`}>
            <b>
              {fmtPct(pos.pct)}
              {pos.premium && <small className="st-prem">prem</small>}
            </b>
            {pos.usd != null && <small>{fmtUsd(pos.usd)}</small>}
          </span>
        )}
      </div>

      {(state === "open" || state === "signal") && pos.entry != null && (
        <dl className="st-levels st-pos-levels">
          <div>
            <dt>{pos.premium ? "Premium" : "Entry"}</dt>
            <dd>{fmtPrice(pos.entry)}</dd>
          </div>
          <div>
            <dt>{pos.premium ? "Now (prem)" : "Now"}</dt>
            <dd className={tone}>{fmtPrice(pos.mark)}</dd>
          </div>
          {/* Options par SL / target nahi aate — khaali "—" dikhane se behtar chhupa do. */}
          {(!pos.premium || pos.stop != null) && (
            <div>
              <dt>Stop-loss</dt>
              {pos.stop != null ? (
                <dd className="st-down">
                  {fmtPrice(pos.stop)}
                  <LevelDist move={pos.premium ? null : levelMove(side, pos.entry, pos.stop)} />
                </dd>
              ) : (
                <dd className="st-lvl-rule">None</dd>
              )}
            </div>
          )}
          {(!pos.premium || pos.target != null) && (
            <div>
              <dt>{pos.tp1 != null ? "Target 1" : pos.target != null ? "Target" : "Exit"}</dt>
              {pos.tp1 != null ? (
                // Options: aadha Target 1 par, baaki final par — dono dikhao.
                <dd className="st-up">
                  {fmtPrice(pos.tp1)}
                  <small className="st-lvl-dist">
                    <span>Half here · rest {fmtPrice(pos.target)}</span>
                  </small>
                </dd>
              ) : pos.target != null ? (
                <dd className="st-up">
                  {fmtPrice(pos.target)}
                  <LevelDist move={pos.premium ? null : levelMove(side, pos.entry, pos.target)} />
                </dd>
              ) : (
                <dd className="st-lvl-rule">{exitRule(pos.signal, pos.stats?.trades)}</dd>
              )}
            </div>
          )}
        </dl>
      )}

      <OrderNote pos={pos} now={now} busy={busy} exchangeName={exchangeName} onPlace={onPlace} />

      <div className="st-pos-hist">
        <div className="st-pos-hist-head">
          <h4>Trade history</h4>
          <span>Newest first</span>
        </div>
        {history.length === 0 ? (
          <p className="st-muted-sm st-pos-hist-empty">
            {pos.stats?.error
              ? "No trades — the strategy does not run on this coin."
              : `No trades in the last ${pos.stats?.days ?? 0} days.`}
          </p>
        ) : (
          <ol className="st-tl">
            {timeline(shown, row.appliedAt, now)}
          </ol>
        )}
        {history.length > HISTORY_SHOWN && (
          <button type="button" className="st-text-btn st-pos-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show less" : `Show all ${history.length}`}
          </button>
        )}
      </div>

      {bot && bot.events.length > 0 && (
        <details className="st-pos-log">
          <summary>
            <Server className="w-3.5 h-3.5" aria-hidden /> Server bot log
            <span className="st-tab-count">{bot.events.length}</span>
          </summary>
          <ol>
            {[...bot.events]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .slice(0, 12)
              .map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <time>{fmtWhen(Date.parse(e.at), now)}</time>
                  <span>{e.text}</span>
                </li>
              ))}
          </ol>
        </details>
      )}
    </article>
  );
}

/** Order ka sach — laga, nahi laga (aur kyun), ya server bot sambhal raha hai. */
function OrderNote({
  pos,
  now,
  busy,
  exchangeName,
  onPlace,
}: {
  pos: StrateoPosition;
  now: number;
  busy: boolean;
  exchangeName: string;
  onPlace: () => void;
}) {
  const { state, exec, bot, why, row } = pos;
  const venue = venueShort(row.exchange);
  // Paper = Cryptomantra ka apna virtual account. Exchange par order nahi jaata, wahan ka balance nahi lagta.
  const paperNote = (
    <small className="st-pos-note-sub">
      Virtual money — not sent to {venue}. Your {venue} balance is not used.
    </small>
  );
  if (state === "open" && exec) {
    const paper = exec.mode !== "live";
    return (
      <p className="st-pos-note" data-tone={paper ? "paper" : "good"}>
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
        <span>
          <b>{paper ? "Paper order placed" : `Live order placed on ${venue}`}</b> · {exec.qty}{" "}
          {symbolLabel(exec.symbol).split("/")[0]} at {fmtPrice(exec.entry)} · {fmtWhen(exec.at, now)}
          {paper && paperNote}
        </span>
      </p>
    );
  }
  if (state === "open" && bot) {
    const paper = bot.mode !== "live";
    return (
      <p className="st-pos-note" data-tone={paper ? "paper" : "good"}>
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
        <span>
          <b>{paper ? `Server bot #${bot.id} · paper position` : `Server bot #${bot.id} · live on ${venue}`}</b>
          {bot.quantity ? ` · ${bot.quantity} ${symbolLabel(bot.symbol).split("/")[0]}` : ""}
          {bot.tp1_done ? " · first profit booked" : ""}
          {paper && paperNote}
        </span>
      </p>
    );
  }
  if (state === "signal") {
    const canPlace =
      (why === "signals-only" || why === "auto-off" || why === "auto-missed" || why === "before-apply") &&
      row.runner === "browser";
    const word = pos.side === "short" ? "sell" : "buy";
    const text =
      why === "options"
        ? `Options strategy — signal only. Trade the legs on ${exchangeName}.`
        : why === "research"
          ? "Research only — Strateo does not trade this strategy."
          : why === "before-apply"
            ? `This ${word} opened before you applied (${fmtWhen(row.appliedAt, now)}). Auto-trade only takes the next fresh entry — or place this one yourself.`
            : why === "server"
              ? bot?.trade_state === "skipped"
                ? `Server bot skipped this entry${bot.events.length ? ` — ${bot.events[bot.events.length - 1].text}` : ""}.`
                : "Server bot will pick this up at the next candle check."
              : why === "signals-only"
                ? `Signals only — no order was placed. Place this ${word} yourself if you want it.`
                : why === "auto-off"
                  ? `Auto-trade switch is off, so no order was placed. Turn it on (top bar) or place this ${word} yourself.`
                  : `No order was placed — Strateo was closed or the order failed when this ${word} signalled. Place it yourself if you want it.`;
    return (
      <div className="st-pos-note st-pos-note-act" data-tone="warn">
        <Info className="w-3.5 h-3.5" aria-hidden />
        <span>{text}</span>
        {canPlace && (
          <button type="button" className="st-btn st-btn-solid st-btn-sm" disabled={busy} onClick={onPlace}>
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 st-spin" />
            ) : (
              <>
                Place order <ArrowRight className="w-3.5 h-3.5 st-btn-arrow" aria-hidden />
              </>
            )}
          </button>
        )}
      </div>
    );
  }
  if (bot && (bot.status !== "running" || bot.last_error)) {
    return (
      <p className="st-pos-note" data-tone="bad">
        <TriangleAlert className="w-3.5 h-3.5" aria-hidden />
        <span>
          {bot.status === "paused"
            ? "Server bot is paused — no new entries."
            : bot.status === "stopped"
              ? "Server bot is stopped."
              : bot.last_error}
        </span>
      </p>
    );
  }
  return null;
}

/** Entry se level ki doori: price move, aur fees + slippage ke baad asal mein kitna. */
export function LevelDist({ move }: { move: number | null }) {
  if (move == null) return null;
  const net = netOfCosts(move);
  return (
    <small
      className="st-lvl-dist"
      title={`Price move from entry ${fmtPct(move)} · after ~${ROUND_TRIP_COST_PCT.toFixed(2)}% fees + slippage ${fmtPct(net)}`}
    >
      <span>{fmtPct(move)}</span>
      <span className={net >= 0 ? "st-up" : "st-down"}>{fmtPct(net)} net</span>
    </small>
  );
}

function fmtDay(ms: number): string {
  const day = new Date(ms).toLocaleDateString("en-GB", { timeZone: DESK_TZ, day: "2-digit", month: "short" });
  return `${day} ${fmtClock(ms)}`;
}

/** Trades naye se purane; jahan apply hua wahan ek "You applied" ki line. */
function timeline(rows: HistoryRow[], appliedAt: number, now: number) {
  const out: ReactNode[] = [];
  let marked = false;
  for (const r of rows) {
    if (!marked && r.entryTime < appliedAt) {
      marked = true;
      out.push(
        <li key="applied" className="st-tl-applied">
          <span>You applied · {fmtWhen(appliedAt, now)}</span>
        </li>,
      );
    }
    out.push(<HistoryItem key={r.key} r={r} now={now} />);
  }
  if (!marked) {
    out.push(
      <li key="applied" className="st-tl-applied">
        <span>You applied · {fmtWhen(appliedAt, now)}</span>
      </li>,
    );
  }
  return out;
}

/**
 * Trade ka SL aur target, aur kaunsa chhua. Senior ka sawaal — "1 : 2 hai? algo beech mein nikal
 * gaya ya target tak ruka?" — isi line se dikhta hai. Options par % premium ka, settings se.
 */
function HistoryLevels({ r }: { r: HistoryRow }) {
  const hits = levelHits(r);
  const p = r.levelPcts;
  const cells = [
    { key: "stop", label: "SL", value: r.stop, pct: p ? p.stop : levelMove(r.side, r.entry, r.stop), hit: hits.stop, tone: "st-down" },
    { key: "tp1", label: "Target 1", value: r.tp1, pct: p?.tp1 ?? null, hit: hits.tp1, tone: "st-up" },
    {
      key: "target",
      label: r.tp1 != null ? "Final" : "Target",
      value: r.target,
      pct: p ? p.target : levelMove(r.side, r.entry, r.target),
      hit: hits.target,
      tone: "st-up",
    },
  ].filter((c) => c.value != null);
  if (!cells.length) return null;
  return (
    <dl
      className="st-trade-grid st-trade-lv"
      style={{ "--n": cells.length } as CSSProperties}
      title={
        p
          ? `From strategy settings, % of premium: full exit at ${fmtPct(p.stop, 0)}${p.tp1 != null ? `, half booked at ${fmtPct(p.tp1, 0)}` : ""}, ${p.tp1 != null ? "rest" : "exit"} at ${fmtPct(p.target, 0)}. Fills include bid/ask slippage, so Exit sits a little past the level.`
          : "Stop-loss and target, % price move from entry."
      }
    >
      {cells.map((c) => (
        <div key={c.key} data-hit={c.hit || undefined}>
          <dt>
            {c.label}
            {c.pct != null && <span className="st-lv-pct">{fmtPct(c.pct, p ? 0 : 2)}</span>}
          </dt>
          {/* Band trade par jo level nahi chhua wo phika — rang sirf jahan price pahuncha. */}
          <dd className={c.hit || r.open ? c.tone : "st-lv-miss"}>
            {fmtPrice(c.value)}
            {c.hit && <small className="st-lv-hit">hit</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryItem({ r, now }: { r: HistoryRow; now: number }) {
  const tone = r.pct > 0 ? "st-up" : r.pct < 0 ? "st-down" : "st-flat";
  const sameDay = r.exitTime != null && dayKey(r.exitTime) === dayKey(r.entryTime);
  // Agle din band hua to date ke saath — "11 Nov 22:31 → 12 Nov 04:31", sirf "04:31" nahi.
  const exitWhen = r.exitTime == null ? null : sameDay ? fmtClock(r.exitTime) : fmtDay(r.exitTime);
  // Aadha TP1 par book, baaki SL / time par — "SL hit" akela likhna aur + % dikhana ulta lagta.
  const partialResult = r.partial && !r.open && !r.closedReason;
  const result = historyResultLabel(r);
  const tag =
    r.status === "placed"
      ? `Order · ${r.exec?.mode === "live" ? "Live" : "Paper"}`
      : r.status === "server"
        ? "Server bot"
        : r.status === "signal"
          ? "Not placed"
          : "Before apply";
  const feesAteGain = !r.premium && !r.basket && r.gross > 0 && r.pct <= 0;
  return (
    <li className="st-trade" data-side={r.structure ? "options" : r.side} data-open={r.open} data-status={r.status}>
      <div className="st-trade-top">
        <span className="st-side" data-side={r.structure ? "options" : r.side} title={r.structure ?? undefined}>
          {sideShort(r.side, r.structure)}
        </span>
        <span className="st-trade-when">
          {fmtWhen(r.entryTime, now)} → {exitWhen ?? <em>now</em>}
        </span>
        <span className="st-tl-tag" data-status={r.status}>
          {tag}
        </span>
        <b
          className={`st-trade-pct ${tone}`}
          title={r.premium || r.basket ? undefined : `${fmtPct(r.gross)} price move − ~${ROUND_TRIP_COST_PCT.toFixed(2)}% fees + slippage`}
        >
          {fmtPct(r.pct)}
          {r.premium && <small className="st-prem">prem</small>}
        </b>
      </div>
      <dl className="st-trade-grid">
        <div>
          <dt>Entry</dt>
          <dd>{fmtPrice(r.entry)}</dd>
        </div>
        <div>
          {/* Chalu trade ka koi exit nahi hua — ye abhi ka bhaav hai. */}
          <dt>{r.open ? "Now" : "Exit"}</dt>
          <dd>{r.exit != null ? fmtPrice(r.exit) : "—"}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd
            className="st-tl-result"
            data-o={r.open ? "open" : r.outcome}
            title={partialResult ? "Half was booked at TP1; the rest closed later at the exit shown. The % is for the whole trade." : undefined}
          >
            {result}
            {feesAteGain && (
              <span className="st-tl-fee" title={`Price moved ${fmtPct(r.gross)}, fees + slippage took ~${ROUND_TRIP_COST_PCT.toFixed(2)}%`}>
                Fees &gt; gain
              </span>
            )}
          </dd>
        </div>
      </dl>
      <HistoryLevels r={r} />
    </li>
  );
}
