"use client";

import { useMemo, useState } from "react";
import { useJournal, type JournalTrade } from "@/lib/tradeJournal";
import { useTradingMode } from "@/lib/tradingMode";
import { symbolLabel } from "@/lib/cryptoApi";

function dayKey(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function TradeJournal() {
  const rows = useJournal();
  const [mode] = useTradingMode();
  const [cursor, setCursor] = useState(() => new Date());
  const [picked, setPicked] = useState<string | null>(null);

  const mine = useMemo(() => rows.filter((row) => row.mode === mode), [rows, mode]);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const map = new Map<string, JournalTrade[]>();
    for (const row of mine) {
      const key = dayKey(row.at);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [mine]);

  const shown = picked ? mine.filter((row) => dayKey(row.at) === picked) : mine;
  const pnl = shown.reduce((sum, row) => sum + row.pnl, 0);
  const wins = shown.filter((row) => row.pnl > 0).length;
  const decided = shown.filter((row) => row.pnl !== 0).length;
  const winRate = decided ? (wins / decided) * 100 : null;

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < first; i++) cells.push({ day: null, key: `pad-${i}` });
  for (let day = 1; day <= days; day++) cells.push({ day, key: `${year}-${month}-${day}` });

  return (
    <div className="space-y-4">
      <div className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Track</div>
          <h2 className="trade-page-title">Trade journal</h2>
          <p className="trade-page-line">
            {mode === "paper" ? "Paper" : "Live"} trades. Din kholo, result dekho.
          </p>
        </div>
        <div className="trade-page-actions">
          <span className="trade-badge">{shown.length} trades</span>
          <span className={`trade-badge ${pnl >= 0 ? "trade-badge-green" : "trade-badge-red"}`}>{money(pnl)}</span>
          <span className="trade-badge">{winRate == null ? "—" : `${winRate.toFixed(0)}% win`}</span>
        </div>
      </div>

      <div className="trade-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" className="trade-btn trade-btn-ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            Prev
          </button>
          <h3 className="text-[15px] font-bold">
            {cursor.toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </h3>
          <button type="button" className="trade-btn trade-btn-ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            Next
          </button>
        </div>
        <div className="journal-week">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="journal-grid">
          {cells.map((cell) => {
            if (!cell.day) return <span key={cell.key} />;
            const trades = byDay.get(cell.key) ?? [];
            const dayPnl = trades.reduce((sum, row) => sum + row.pnl, 0);
            return (
              <button
                key={cell.key}
                type="button"
                className="journal-day"
                data-active={picked === cell.key}
                data-tone={trades.length === 0 ? "flat" : dayPnl >= 0 ? "up" : "down"}
                onClick={() => setPicked(picked === cell.key ? null : cell.key)}
              >
                <b>{cell.day}</b>
                {trades.length > 0 && <small>{money(dayPnl)}</small>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="trade-panel overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Is mode mein abhi koi trade nahi. Bots page par backtest chala kar Start dabao — band deals yahan aa jaati hain.
          </p>
        ) : (
          <ul className="ms-list">
            {shown.slice(0, 40).map((row) => (
              <li key={row.id} className="ms-row" style={{ cursor: "default" }}>
                <div className="ms-row-top">
                  <span className="ms-row-name">{symbolLabel(row.symbol)} · {row.side}</span>
                  <span className="tnum" style={{ color: row.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                    {money(row.pnl)}
                  </span>
                </div>
                <div className="ms-row-meta">
                  {row.strategy} · {row.tags.join(" · ")} · {new Date(row.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
