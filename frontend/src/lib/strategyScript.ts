import type { StrategyDef, StrategyField } from "./strategies";

/** One titled bullet — matches TradingView script doc sections. */
export interface ScriptBullet {
  title: string;
  body: string;
}

/** Full script explanation shown under the Script section. */
export interface StrategyScriptDoc {
  overview: string;
  howItWorks: ScriptBullet[];
  keyFeatures: string[];
  applications: string[];
  settings: ScriptBullet[];
  conclusion: string;
}

export interface ScriptComment {
  id: string;
  text: string;
  author: string;
  at: string;
}

const COMMENTS_PREFIX = "arjunai:strategy-script-comments:";

export function loadScriptComments(strategyId: string): ScriptComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${COMMENTS_PREFIX}${strategyId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScriptComment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScriptComments(strategyId: string, comments: ScriptComment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${COMMENTS_PREFIX}${strategyId}`, JSON.stringify(comments.slice(0, 100)));
}

function fieldSettings(fields: StrategyField[]): ScriptBullet[] {
  return fields
    .filter((f) => f.group !== "backtest" && f.kind !== "symbol" && f.kind !== "interval")
    .slice(0, 10)
    .map((f) => ({
      title: f.label,
      body: f.hint || (f.kind === "toggle" ? "On/off toggle in Setup." : "Tunable in Setup."),
    }));
}

/** Fallback doc built from blurb / logic / fields — every strategy gets a Script page. */
export function buildScriptDoc(def: StrategyDef): StrategyScriptDoc {
  const override = SCRIPT_OVERRIDES[def.id];
  if (override) return override;

  const settings = fieldSettings(def.fields);
  const auto = def.autoTrade
    ? "Server bots can run paper or live on each closed candle."
    : "Use Paper deploy for simulated fills on this signal.";

  return {
    overview:
      `${def.blurb} ${def.logic}`.trim() ||
      `${def.name} is a ${def.category.toLowerCase()} setup on the Trading Desk.`,
    howItWorks: [
      { title: "Signal", body: def.logic || def.blurb },
      ...(def.engineNote
        ? [{ title: "Engine", body: def.engineNote }]
        : [{ title: "Chart", body: "Live overlays and readouts update from the same rules used in backtest where available." }]),
      { title: "Execution", body: auto },
    ],
    keyFeatures: [
      def.category,
      def.autoTrade ? "Server bot · paper & live" : "Paper deploy on signal",
      def.backtestable === false ? "Educational / options — no candle backtest" : "Candle backtest available",
      ...(def.portfolio?.length ? [`Portfolio deploy · ${def.portfolio.length} coins`] : []),
      ...(def.featured ? ["Featured research strategy"] : []),
    ],
    applications: [
      "Confirm direction on the strategy chart before sizing.",
      "Tune risk % so a stop-out is a known fraction of capital.",
      "Backtest on a long window before going live.",
      ...(def.autoTrade ? ["Deploy a server bot so entries fire even with the browser closed."] : []),
    ],
    settings: settings.length
      ? settings
      : [{ title: "Defaults", body: "Open Setup on this page to change symbol, timeframe, and risk." }],
    conclusion:
      def.engineNote ||
      `${def.name} keeps entry, exit, and risk rules in one place — use Script as the reference, then tune in Setup.`,
  };
}

/** Hand-tuned docs for featured / complex engines. */
const SCRIPT_OVERRIDES: Record<string, StrategyScriptDoc> = {
  "avpt-pullback": {
    overview:
      "AVPT (Anchored VWAP Pullback & Target Zones) is a PhenLabs Pine Script port. It auto-anchors a volume-weighted VWAP to structural swing pivots, waits for a value-band pullback, then enters on a reclaim with Kaufman efficiency and quality filters. Each setup draws ENTRY, stop, and TP1–TP3.",
    howItWorks: [
      {
        title: "Structural AVWAP anchor",
        body: "Confirmed swing lows/highs (lookback) start a fresh anchored VWAP. The impulse must expand by a minimum ATR before pullbacks arm.",
      },
      {
        title: "Pullback & reclaim",
        body: "Price dips into the ±σ value band, then closes back across AVWAP with body conviction. Chop is skipped when trend efficiency or quality score fails.",
      },
      {
        title: "Trade plan",
        body: "Entry at reclaim close; stop beyond the pullback / band with ATR buffer; TP1 / TP2 / TP3 at 1R / 2R / 3R (optional impulse magnet). Stop can move to breakeven after TP1.",
      },
      {
        title: "Filter profiles",
        body: "Six built-in profiles (Balanced → Volume Climax) run in parallel. Auto-Optimize picks by TP1+ win rate; research favored Volume Climax on ETH/SOL 4h.",
      },
    ],
    keyFeatures: [
      "Auto BOS-anchored VWAP + σ bands",
      "Kaufman ER chop filter + quality score",
      "TP1–TP3 ladder · optional BE after TP1",
      "Native candle backtest · fees + slippage + funding",
      "Server bot · paper & live deploy",
      "Portfolio backtest / deploy · BTC / ETH / SOL",
    ],
    applications: [
      "Trade pullbacks in a confirmed impulse instead of chasing breakouts.",
      "Prefer Volume Climax on alts; review BTC separately — costs can erase R-ledger wins.",
      "Backtest 6–12 months on 4h before sizing up.",
      "Use Script + Setup together: tune σ / ER, then run portfolio backtest.",
    ],
    settings: [
      { title: "Swing lookback", body: "Bars to confirm structural pivots that re-anchor AVWAP (default 10)." },
      { title: "Pullback filter", body: "Auto-Optimize or lock Balanced / Conservative / Vol Climax / Custom." },
      { title: "Min impulse · ATR", body: "How far price must run from the anchor before pullbacks count." },
      { title: "SL buffer · ATR", body: "Extra room beyond the pullback extreme for the stop." },
      { title: "Targets / BE", body: "Fixed R ladder or impulse magnet; optional stop-to-breakeven after TP1." },
    ],
    conclusion:
      "AVPT is a reclaim playbook, not a high win-rate scalper. Edge shows up when efficiency filters cut chop and runners reach TP2/TP3 — validate on your symbol/timeframe before live size.",
  },
  "trident-momentum": {
    overview:
      "Trident Momentum tracks whether price is above or below the closes from ~5, 15, and 30 days ago (on 4h: 30 / 90 / 180 bars). When all three horizons agree, it takes a directional trade; when two flip against the position, it exits. No channel breakout and no trailing stop — momentum consensus only.",
    howItWorks: [
      {
        title: "Horizon votes",
        body: "Each horizon votes +1 if close > close N bars ago, else −1. Three ups = long bias; three downs = short bias (shorts only in bear regime).",
      },
      {
        title: "Entries",
        body: "Signal is set on a closed 4h bar; fill is the next open. Long when all three turn up; short when all three turn down and EMA 50 < EMA 200.",
      },
      {
        title: "Exits",
        body: "Exit next open after two of three votes flip against the trade. Initial stop is fixed at entry (ATR × stop multiplier) — it does not trail.",
      },
      {
        title: "Sizing",
        body: "Position size = risk % of capital at the stop distance. Portfolio mode splits capital across BTC, ETH, and SOL.",
      },
    ],
    keyFeatures: [
      "Triple-horizon momentum consensus",
      "Bear-regime filter for shorts (EMA 50 / 200)",
      "Fixed ATR stop · momentum exit",
      "Native server bot · paper & live",
      "Portfolio backtest / deploy",
    ],
    applications: [
      "Ride multi-week crypto trends without waiting for a Donchian high.",
      "Compare holdout vs Rider Pro on the same capital.",
      "Use portfolio deploy for one bot per major coin.",
      "Keep risk at ~1% until you trust the live path.",
    ],
    settings: [
      { title: "Horizons", body: "Short / mid / long candle counts (default 30 / 90 / 180 on 4h)." },
      { title: "Stop · ATR ×", body: "Initial stop distance; stop stays fixed until momentum exit." },
      { title: "Allow shorts", body: "Shorts only when EMA fast < slow (bear regime)." },
      { title: "Capital & risk %", body: "Account size and % lost if the stop hits first." },
    ],
    conclusion:
      "Trident is a momentum-consensus script: enter when horizons align, leave when they disagree. Prefer 6–12 months of backtest before live — win rate is often modest; edge comes from staying with the trend.",
  },
  "trend-rider": {
    overview:
      "Channel Break is a 4h breakout system: enter on a 30-bar high/low with EMA 200 filter, risk a fixed % to a 2× ATR stop, then trail on a 15-bar channel. Built for perpetual longs and shorts.",
    howItWorks: [
      {
        title: "Breakout entry",
        body: "LONG when a closed 4h bar breaks the prior 30-bar high and price is above EMA 200. SHORT on a 30-bar low break when EMA 50 < EMA 200 (confirmed bear).",
      },
      {
        title: "Stops",
        body: "Initial stop = 2× ATR from entry. After entry, trail on the 15-bar low (long) or high (short).",
      },
      {
        title: "Execution",
        body: "Signal on closed bar; server bot waits for the next bar to place/manage orders. Paper and live share the same engine.",
      },
    ],
    keyFeatures: [
      "30-bar channel breakout",
      "EMA 200 trend filter",
      "ATR stop + 15-bar trail",
      "Long/short perps",
      "Server bot · portfolio deploy",
    ],
    applications: [
      "Catch sustained crypto trends on 4h without scalp noise.",
      "Run paper first, then live with a trade-only Delta key.",
      "Use portfolio mode for BTC + ETH + SOL with capital ÷ 3.",
    ],
    settings: [
      { title: "Channel / exit channel", body: "Entry lookback (30) and trail lookback (15)." },
      { title: "Stop · ATR ×", body: "Initial stop width (default 2)." },
      { title: "Allow shorts", body: "Enable bear-regime shorts." },
      { title: "Risk %", body: "Fraction of capital risked to the stop." },
    ],
    conclusion:
      "Channel Break is the base research engine — simple breakout + trail. Prefer Bank Steady or Rider Pro if you want partial profits or weekend/BTC filters.",
  },
  "trend-rider-steady": {
    overview:
      "Bank Steady keeps the Channel Break rules and adds a first profit take: book 25% at +1R and move the stop to breakeven so winners pay for losers more often (~50% win rate).",
    howItWorks: [
      {
        title: "Same entry as Channel Break",
        body: "30-bar breakout, EMA 200 filter, 2× ATR stop, 15-bar trail.",
      },
      {
        title: "TP1 · bank",
        body: "At +1R (risk distance), close 25% of size and pull stop to entry (+ fees). The remaining 75% rides the trail.",
      },
      {
        title: "Why Bank Steady",
        body: "Partial bank + breakeven stop lifts win rate vs pure runners, with a milder equity curve.",
      },
    ],
    keyFeatures: [
      "Channel Break core + TP1",
      "~50% win-rate profile",
      "Breakeven stop after first bank",
      "Safe / Growth presets",
      "Server bot · paper & live",
    ],
    applications: [
      "Prefer Bank Steady when you want more green trades psychologically.",
      "Use Safe preset (~1% risk) or Growth (~2% risk) from Setup.",
      "Still evaluate on multi-year portfolio backtests.",
    ],
    settings: [
      { title: "TP1 R / TP1 %", body: "When to bank (in R multiples) and what fraction to close." },
      { title: "Channel / ATR / risk", body: "Same as Channel Break." },
    ],
    conclusion:
      "Bank Steady is Channel Break with a disciplined first harvest — keep the runner, lock the win rate edge.",
  },
  "trend-rider-pro": {
    overview:
      "Rider Pro is Bank Steady plus two filters: skip weekend UTC signals, and require BTC regime confirmation before alt longs/shorts. Built for lower drawdown on the research portfolio.",
    howItWorks: [
      {
        title: "Bank Steady core",
        body: "Breakout + trail + 25% at +1R → stop to entry.",
      },
      {
        title: "Weekend filter",
        body: "No new signals on Saturday/Sunday UTC candles — cuts thin-liquidity noise.",
      },
      {
        title: "BTC confirmation",
        body: "Alt LONG only if BTC is above its EMA 200; SHORT only if BTC is in a bear regime.",
      },
    ],
    keyFeatures: [
      "Bank Steady + weekend skip",
      "BTC confirm for alts",
      "Lower max DD profile in research",
      "Server bot · paper & live",
    ],
    applications: [
      "Default choice when trading ETH/SOL alongside BTC.",
      "Compare holdout metrics vs Trident on the same capital.",
      "Keep live risk small until filters match your venue hours.",
    ],
    settings: [
      { title: "Bank Steady knobs", body: "TP1 R, TP1 %, channel, ATR, risk %." },
      { title: "Filters", body: "Weekend skip and BTC confirm are on by design for Rider Pro." },
    ],
    conclusion:
      "Rider Pro trades fewer bars and asks BTC for permission — use it when you care more about drawdown than raw trade count.",
  },
  "buy-grid-recovery-hedge": {
    overview:
      "Buy Grid Recovery · Hedge is an MT5 Expert Advisor for XAUUSD. It opens a small Buy scalp, waits for either a mini profit or a downside grid unlock, then runs a fixed Buy-lot ladder with a constant 0.01 Sell hedge until the basket hits target. The desk runs the same rules as a candle-path backtest (O→L→H→C) — approximate vs MT5 ticks. Live trading remains `mt5/BuyGridRecoveryHedge.mq5`.",
    howItWorks: [
      {
        title: "New cycle · Buy scalp",
        body: "Each cycle starts with BUY 0.01 and UpsideGrid OFF. If price rises without a downside fill, no extra Buys — close when Mini Profit is hit (default $0.20) and start again.",
      },
      {
        title: "Downside unlock",
        body: "First fill −GridStep (default $5 on gold) opens the next Buy from the fixed lot array and places SELL 0.01. UpsideGrid turns ON for the rest of the basket.",
      },
      {
        title: "Both-side grid",
        body: "Buys continue on the predefined sequence (0.01 → 7.10). Sell size stays 0.01 with its own spacing. One basket until Basket Profit Target (default $96), then close all and reopen BUY 0.01.",
      },
      {
        title: "Daily DD guard",
        body: "If floating/day loss hits Daily DD % (default 30%), the basket closes and trading pauses until the next UTC day — on desk backtest and on the MT5 EA.",
      },
      {
        title: "Desk backtest",
        body: "Run Backtest on this page: candles walk O→L→H→C, P&L uses XAU-style $100 per $1 move per 1.00 lot. Not tick-accurate — use MT5 Strategy Tester for gold realism.",
      },
    ],
    keyFeatures: [
      "Fixed Buy lot array — not open-ended martingale math",
      "Sell hedge always 0.01 (never scales with Buy size)",
      "Mini profit scalp while waiting for downside",
      "Basket TP + daily DD pause",
      "Desk candle-path backtest · MT5 live EA",
    ],
    applications: [
      "Tune Grid / Mini / Basket / Capital / Days, then Run backtest on the strategy page.",
      "On BTC/ETH raise Grid step well above gold defaults — $5 is tiny vs crypto dollars.",
      "Compile and attach BuyGridRecoveryHedge.mq5 to XAUUSD for live / MT5 tester.",
      "Treat desk numbers as stress of the rules, not broker-accurate gold P&L.",
    ],
    settings: [
      { title: "Grid step ($)", body: "Distance to next Buy level. Gold default 5; raise for crypto." },
      { title: "Mini profit ($)", body: "Close the initial Buy scalp before downside unlock (default 0.20)." },
      { title: "Basket profit target ($)", body: "Close the whole grid when floating P&L hits this (default 96)." },
      { title: "Initial / Sell lot", body: "Starting Buy size and fixed Sell hedge (both default 0.01)." },
      { title: "Daily DD % · Capital · Days", body: "DD pause, starting equity, and candle history window for backtest." },
    ],
    conclusion:
      "Recovery-grid playbook for gold. Desk backtest shows how baskets behave on candle paths; size live only from the MT5 EA with capital you can afford to grid.",
  },
};
