"use client";

import { Info } from "lucide-react";
import { BIAS_THRESHOLD, COUNTED_STRATEGIES, SCORE_WEIGHTS, WATCH_ONLY_STRATEGIES, type ScreenerRow } from "@/lib/screener";

const pct = (w: number) => `${Math.round(w * 100)}%`;

function clock(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

interface MethodProps {
  interval: string;
  bars: number;
  /** Terminal chart ka timeframe — screener se alag ho to signals alag aate hain. */
  chartInterval: string;
  scannedAt: string | null;
}

/** Screener ka data source aur score ka formula — header ke neeche hamesha dikhta hai. */
export function ScreenerMethod({ interval, bars, chartInterval, scannedAt }: MethodProps) {
  return (
    <div className="trade-panel">
      <div className="p-3 space-y-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        <p className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-[3px] flex-none" style={{ color: "var(--accent)" }} />
          <span>
            <b>Data source:</b> Delta Exchange India ke USD perpetual futures ki <b>{interval}</b> candles (har coin ki
            pichhli {bars} candles) — chart tab mein bhi wahi feed chalti hai. Price = aakhri candle ka close
            (abhi chal rahi candle, to live badalta hai){scannedAt ? ` · scan ${scannedAt}` : ""}. Backend candles 60 second cache karta hai.
          </span>
        </p>
        {interval !== chartInterval && (
          <p style={{ color: "var(--amber)" }}>
            Dhyan do: chart <b>{chartInterval}</b> par hai, screener <b>{interval}</b> par. Alag timeframe par trend alag hota hai,
            isliye chart aur screener mein farak dikh sakta hai — timeframe same karke dekho.
          </p>
        )}
        <details>
          <summary className="cursor-pointer font-semibold" style={{ color: "var(--text-primary)" }}>
            Signal strength kaise nikalta hai?
          </summary>
          <div className="mt-2 space-y-2">
            <p>
              Score <b>−100 se +100</b> tak hota hai. Plus = teji (bullish), minus = mandi (bearish). <b>Strength</b> uska
              bina-sign ka hissa hai (|score|). Score {BIAS_THRESHOLD} se kam ho to coin <b>neutral</b> hai.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <b>Trend {pct(SCORE_WEIGHTS.trend)}</b> — EMA 9 aur EMA 50 ka gap, ATR(14) mein naapa. EMA9 upar = teji. Gap 2 ATR par full marks.
              </li>
              <li>
                <b>Momentum {pct(SCORE_WEIGHTS.momentum)}</b> — MACD(12, 26, 9) histogram, ATR mein. 0.3 ATR par full marks.
              </li>
              <li>
                <b>RSI {pct(SCORE_WEIGHTS.rsi)}</b> — RSI(14) 50 se kitna door hai. 50 se 20 point door par full marks.
              </li>
              <li>
                <b>Strategy votes {pct(SCORE_WEIGHTS.strategies)}</b> — {COUNTED_STRATEGIES.map((s) => s.name).join(", ")} ke buy/sell
                signal (buy − sell, bolne walon mein se, kam se kam 3 par bhaga hua).
              </li>
            </ul>
            {WATCH_ONLY_STRATEGIES.length > 0 && (
              <p>
                {WATCH_ONLY_STRATEGIES.map((s) => s.name).join(", ")} range/reversal strategies hain — wo dikhti hain par score mein
                nahi gini jaati.
              </p>
            )}
            <p>
              Indicators wahi hain jo chart par lagte hain, aur strategy signals wahi jo har strategy ke apne page par dikhte
              hain. Score ka har hissa coin ke &quot;Why&quot; button mein dikhta hai. Jab trend aur strategy votes ek doosre ke ulta
              bolte hain, coin par <b>Mixed</b> tag lagta hai. Ye analysis hai, trading advice nahi.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

/** Ek coin ke score ka poora hisaab — kaunsa hissa kitne points laaya. */
export function ScoreBreakdown({ row, interval }: { row: ScreenerRow; interval: string }) {
  const sign = (n: number) => (n > 0 ? "+" : "");
  return (
    <div className="space-y-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Score <b className="tnum" style={{ color: "var(--text-primary)" }}>{sign(row.score)}{row.score}</b> → <b>{row.bias}</b>
          {row.mixed && <span style={{ color: "var(--amber)" }}> · Mixed (trend aur strategy votes ulte hain)</span>}
        </span>
        <span>
          Last candle: <b className="tnum">{clock(row.lastTime)}</b> ({interval}) · close <b className="tnum">{row.price.toLocaleString("en-US", { maximumFractionDigits: 6 })}</b>
        </span>
      </div>

      <div className="overflow-auto">
        <table className="trade-table">
          <thead>
            <tr>
              <th>Hissa</th>
              <th>Kya dekha</th>
              <th className="trade-num">Weight</th>
              <th className="trade-num">Points</th>
            </tr>
          </thead>
          <tbody>
            {row.parts.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td>{p.reading}</td>
                <td className="trade-num tnum">{pct(p.weight)}</td>
                <td className="trade-num tnum" style={{ color: p.points > 0 ? "var(--green)" : p.points < 0 ? "var(--red)" : undefined }}>
                  {sign(p.points)}{p.points}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}><b>Kul score</b> (points ka jod, rounding ke saath)</td>
              <td className="trade-num tnum"><b>{sign(row.score)}{row.score}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        {row.signals.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <span
              className="trade-vote mt-1 flex-none"
              style={{ background: s.tone === "buy" ? "var(--green)" : s.tone === "sell" ? "var(--red)" : "var(--tr-line)" }}
            />
            <span>
              <b>{s.name}</b>: {s.headline}
              {!s.counted && <span style={{ color: "var(--text-muted)" }}> (score mein nahi gini)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
