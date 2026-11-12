"use client";

import { useTradingMode, type TradingMode } from "@/lib/tradingMode";

/** Ek switch. Terminal, trades, bots aur journal isi mode ko padhte hain. */
export default function ModeSwitch() {
  const [mode, setMode] = useTradingMode();
  const choose = (next: TradingMode) => setMode(next);

  const hint = mode === "paper" ? "Practice money" : "Exchange orders";

  return (
    <div className="desk-mode-wrap">
      <div className="trade-seg desk-mode" role="group" aria-label={`Trading mode. ${hint}.`}>
        <button type="button" className="trade-seg-btn" data-active={mode === "paper"} onClick={() => choose("paper")}>
          Paper
        </button>
        <button type="button" className="trade-seg-btn" data-active={mode === "live"} onClick={() => choose("live")}>
          Live
        </button>
      </div>
      <span className="desk-mode-hint">{hint}</span>
    </div>
  );
}
