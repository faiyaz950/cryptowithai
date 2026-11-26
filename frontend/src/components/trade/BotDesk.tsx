"use client";

import { useState } from "react";
import { FlaskConical, Pause, Play } from "lucide-react";
import { CRYPTO_SYMBOLS, fetchCandles, symbolLabel } from "@/lib/cryptoApi";
import {
  applySim,
  EMPTY_BOT,
  journalFromSim,
  saveBot,
  setBotStatus,
  simulateBot,
  useBots,
  type DeskBot,
  type SimResult,
} from "@/lib/deskBots";
import { addJournalTrades } from "@/lib/tradeJournal";
import { useTradingMode } from "@/lib/tradingMode";

const STARTS: { id: DeskBot["startWhen"]; label: string }[] = [
  { id: "asap", label: "ASAP" },
  { id: "manual", label: "Manual" },
  { id: "time", label: "Time" },
  { id: "indicator", label: "RSI" },
  { id: "webhook", label: "Webhook" },
];

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function BotDesk() {
  const bots = useBots();
  const [mode] = useTradingMode();
  const [draft, setDraft] = useState<DeskBot>(() => ({ ...EMPTY_BOT(), mode }));
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = bots.filter((bot) => bot.mode === mode || bot.status === "draft");
  const set = <K extends keyof DeskBot>(key: K, value: DeskBot[K]) => setDraft((cur) => ({ ...cur, [key]: value }));

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetchCandles({ symbol: draft.symbol, interval: "1h", limit: 400 });
      if (!res.success || !res.candles?.length) throw new Error(res.error || "Candles nahi mili");
      const next = { ...draft, mode };
      if (next.kind === "grid" && next.lower <= 0) {
        const lows = res.candles.map((candle) => candle.low);
        const highs = res.candles.map((candle) => candle.high);
        next.lower = Math.min(...lows);
        next.upper = Math.max(...highs);
        setDraft(next);
      }
      setResult(simulateBot(next, res.candles));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Backtest fail");
    } finally {
      setRunning(false);
    }
  };

  const start = () => {
    if (!result) return;
    const saved = saveBot(applySim({ ...draft, mode, status: "running" }, result));
    addJournalTrades(journalFromSim(saved, result));
    setDraft(saved);
  };

  return (
    <div className="space-y-4">
      <div className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Trade & automate</div>
          <h2 className="trade-page-title">Bots</h2>
          <p className="trade-page-line">DCA, Grid, Combo. Rules set karo, backtest chalao, phir start.</p>
        </div>
      </div>

      <div className="bot-split">
        <form
          className="trade-panel p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <label className="trade-field">
            <span className="trade-label">Name</span>
            <input className="trade-input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <div className="trade-seg trade-seg-full">
            {(["dca", "grid", "combo"] as const).map((kind) => (
              <button key={kind} type="button" className="trade-seg-btn" data-active={draft.kind === kind} onClick={() => set("kind", kind)}>
                {kind.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="trade-field">
            <span className="trade-label">Pair</span>
            <select className="trade-select" value={draft.symbol} onChange={(e) => set("symbol", e.target.value)}>
              {CRYPTO_SYMBOLS.map((symbol) => (
                <option key={symbol.value} value={symbol.value}>{symbol.label}</option>
              ))}
            </select>
          </label>
          <label className="trade-field">
            <span className="trade-label">Capital (USD)</span>
            <input className="trade-input" type="number" min={50} value={draft.capital} onChange={(e) => set("capital", Number(e.target.value))} />
          </label>
          <div>
            <span className="trade-label">Deal start</span>
            <div className="trade-seg flex-wrap">
              {STARTS.map((item) => (
                <button key={item.id} type="button" className="trade-seg-btn" data-active={draft.startWhen === item.id} onClick={() => set("startWhen", item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {draft.startWhen === "time" && (
            <label className="trade-field">
              <span className="trade-label">Every N bars</span>
              <input className="trade-input" type="number" min={1} value={draft.everyBars} onChange={(e) => set("everyBars", Number(e.target.value))} />
            </label>
          )}
          {draft.startWhen === "indicator" && (
            <label className="trade-field">
              <span className="trade-label">RSI below</span>
              <input className="trade-input" type="number" min={1} max={50} value={draft.rsiBelow} onChange={(e) => set("rsiBelow", Number(e.target.value))} />
            </label>
          )}
          {draft.startWhen === "webhook" && (
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              TradingView alert isi bot ke naam ke saath Exchanges wale webhook URL par bhejo. Historical test mein deal nahi khulegi.
            </p>
          )}
          {draft.kind !== "grid" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="trade-field">
                <span className="trade-label">Safety orders</span>
                <input className="trade-input" type="number" min={0} max={12} value={draft.safetyOrders} onChange={(e) => set("safetyOrders", Number(e.target.value))} />
              </label>
              <label className="trade-field">
                <span className="trade-label">Step %</span>
                <input className="trade-input" type="number" min={0.2} step={0.1} value={draft.stepPct} onChange={(e) => set("stepPct", Number(e.target.value))} />
              </label>
            </div>
          )}
          {draft.kind === "grid" && (
            <div className="grid grid-cols-3 gap-2">
              <label className="trade-field">
                <span className="trade-label">Lower</span>
                <input className="trade-input" type="number" min={0} value={draft.lower} onChange={(e) => set("lower", Number(e.target.value))} />
              </label>
              <label className="trade-field">
                <span className="trade-label">Upper</span>
                <input className="trade-input" type="number" min={0} value={draft.upper} onChange={(e) => set("upper", Number(e.target.value))} />
              </label>
              <label className="trade-field">
                <span className="trade-label">Grids</span>
                <input className="trade-input" type="number" min={2} max={40} value={draft.grids} onChange={(e) => set("grids", Number(e.target.value))} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="trade-field">
              <span className="trade-label">Take profit %</span>
              <input className="trade-input" type="number" min={0} step={0.1} value={draft.tpPct} onChange={(e) => set("tpPct", Number(e.target.value))} />
            </label>
            <label className="trade-field">
              <span className="trade-label">Stop %</span>
              <input className="trade-input" type="number" min={0} step={0.1} value={draft.slPct} onChange={(e) => set("slPct", Number(e.target.value))} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="trade-btn trade-btn-primary" disabled={running}>
              <FlaskConical className="w-4 h-4" />
              {running ? "Running…" : "Run backtest"}
            </button>
            <button type="button" className="trade-btn trade-btn-ghost" disabled={!result} onClick={start}>
              <Play className="w-4 h-4" />
              Start {mode}
            </button>
          </div>
          {error && <p className="text-[13px]" style={{ color: "var(--red)" }}>{error}</p>}
          {result && (
            <div className="ms-detail-summary">
              <div className="font-bold mb-1">
                {result.trades.length} trades · {money(result.realized)} realized · {money(result.unrealized)} open
              </div>
              <p>{result.note}</p>
            </div>
          )}
        </form>

        <div className="trade-panel overflow-hidden">
          {visible.length === 0 ? (
            <p className="p-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {mode === "paper" ? "Paper" : "Live"} par koi bot nahi. Left side se backtest chalao, phir Start.
            </p>
          ) : (
            <ul className="ms-list">
              {visible.map((bot) => {
                const realized = bot.stats?.realized ?? 0;
                const win = bot.stats && bot.stats.trades > 0 ? (bot.stats.wins / bot.stats.trades) * 100 : null;
                return (
                  <li key={bot.id}>
                    <div className="ms-row" style={{ cursor: "default" }}>
                      <div className="ms-row-top">
                        <span className="ms-row-name">{bot.name}</span>
                        <span className={`trade-badge ${bot.status === "running" ? "trade-badge-green" : "trade-badge-neutral"}`}>
                          {bot.status}
                        </span>
                      </div>
                      <div className="ms-row-meta">
                        {bot.kind.toUpperCase()} · {symbolLabel(bot.symbol)} · {bot.startWhen} · {bot.stats?.openDeals ?? 0} open
                      </div>
                      <div className="ms-row-pnl tnum" style={{ color: realized >= 0 ? "var(--green)" : "var(--red)" }}>
                        {money(realized)}
                        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                          {" "}realized · {money(bot.stats?.unrealized ?? 0)} open · {win == null ? "—" : `${win.toFixed(0)}%`}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          className="trade-btn trade-btn-ghost"
                          onClick={() => setBotStatus(bot.id, bot.status === "running" ? "paused" : "running", mode)}
                        >
                          {bot.status === "running" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {bot.status === "running" ? "Stop" : "Start"}
                        </button>
                        <button type="button" className="trade-btn trade-btn-ghost" onClick={() => { setDraft(bot); setResult(null); }}>
                          Edit
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
