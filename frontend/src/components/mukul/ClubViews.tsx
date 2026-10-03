"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Candle } from "@/lib/cryptoApi";
import { fetchCandles } from "@/lib/cryptoApi";
import {
  countAlert,
  readAlgo,
  readRadar,
  studyBacktest,
  swings,
  type RadarRead,
  type StudyRules,
} from "@/lib/mukul/market";
import {
  addAlert,
  addPost,
  closePaper,
  disciplineScore,
  markDeposit,
  markFirstTrade,
  openPaper,
  PAPER_START_INR,
  PAPER_USD_INR,
  paperStats,
  removeAlert,
  saveDca,
  submitMission,
  todayKey,
  type ClubState,
  type CommunityPost,
} from "@/lib/mukul/store";
import VideoGrid from "@/components/mukul/VideoGrid";

export interface MarketBag {
  reads: RadarRead[];
  candles: Record<string, Candle[]>;
  loading: boolean;
  error: string;
  reload: () => void;
}

const ACCESS = [
  ["radar", "Mukul Market Radar"],
  ["algo", "Free Algo"],
  ["analyzer", "AI Chart Analyzer"],
  ["backtest", "Backtester"],
  ["paper", "Paper Trading"],
  ["journal", "Trading Journal"],
  ["room", "Live Trading Room"],
  ["community", "Private Community"],
] as const;

export const CLUB_VIEWS: { id: string; label: string }[] = [
  { id: "welcome", label: "Free Access" },
  { id: "videos", label: "Videos" },
  { id: "radar", label: "Market Radar" },
  { id: "algo", label: "Mukul Algo" },
  { id: "alerts", label: "Alerts" },
  { id: "analyzer", label: "AI Chart" },
  { id: "backtest", label: "Backtest" },
  { id: "paper", label: "Paper Trading" },
  { id: "room", label: "Live Room" },
  { id: "community", label: "Community" },
  { id: "library", label: "Strategy Library" },
  { id: "classes", label: "Classes" },
  { id: "dca", label: "DCA Bot" },
  { id: "journal", label: "Journal" },
  { id: "score", label: "Mukul Score" },
  { id: "mission", label: "Daily Mission" },
  { id: "missed", label: "Missed Setup" },
];

const STRATEGIES: { id: string; name: string; learn: string; rules: StudyRules }[] = [
  { id: "trend", name: "Strategy 01 — Trend Following", learn: "EMA structure upar ho, aur price usi direction mein ho. Pehle filter, phir trade sochna.", rules: { emaFast: 20, emaSlow: 50, rsiMin: 55, volMult: 1.5 } },
  { id: "breakout", name: "Strategy 02 — Breakout", learn: "Recent high ke upar close, volume ke saath. Volume na ho to setup incomplete maana jata hai.", rules: { emaFast: 20, emaSlow: 50, rsiMin: 60, volMult: 1.5 } },
  { id: "momentum", name: "Strategy 03 — Momentum", learn: "RSI strong ho aur chhoti EMA badi EMA ke upar ho. Momentum akele entry nahi hai.", rules: { emaFast: 9, emaSlow: 21, rsiMin: 60, volMult: 1.2 } },
  { id: "mean", name: "Strategy 04 — Mean Reversion", learn: "Price average se bahut door jaaye to wapas aane ki padhai. Ye simplified study hai, signal service nahi.", rules: { emaFast: 20, emaSlow: 50, rsiMin: 30, volMult: 1 } },
  { id: "dca", name: "Strategy 05 — DCA", learn: "Fixed INR, fixed schedule. Live automation se pehle API review. Withdrawal permission kabhi on nahi karni.", rules: { emaFast: 20, emaSlow: 50, rsiMin: 45, volMult: 1 } },
];

const MISSIONS = [
  { prompt: "BTC 4H chart mein support identify karein.", analysis: "Support wo zone hai jahan price pehle ruk kar buyers aaye the. Swing low aur uske aas-paas ka volume dekhein. Level likhna chart padhne ki practice hai — trade lene ka homework nahi." },
  { prompt: "ETH par likhein: price EMA 50 ke upar hai ya neeche, aur ek line mein kyun.", analysis: "EMA 50 ek trend filter hai. Upar hona bullish bias ka study note hai, buy order nahi. Neeche hona bhi automatic sell nahi." },
  { prompt: "SOL ka volume average se upar hai ya neeche? Market Radar se match karke likhein.", analysis: "Volume confirmation ke bina breakout incomplete maana jata hai. Radar ka WHY isi liye sirf score nahi hai." },
  { prompt: "Ek plan likhein jisme stop pehle se decide ho. Stop idea likhein, order nahi.", analysis: "Stop baad mein hatana journal mein mistake count hota hai. Mission ka jawab plan hai, execution nahi." },
];

const CHANNELS: { id: CommunityPost["channel"]; label: string }[] = [
  { id: "updates", label: "Market Updates" },
  { id: "learning", label: "Learning" },
  { id: "room", label: "Live Room" },
  { id: "algo", label: "Algo Updates" },
  { id: "education", label: "Education" },
];

function inr(n: number): string {
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function WelcomeView({ club, onOpen }: { club: ClubState; onOpen: (view: string) => void }) {
  const score = disciplineScore(club);
  return (
    <div className="mc-panel">
      <div className="mc-welcome-head">
        <img src="/mukul/mukul-face.webp" alt="Dr. Mukul Agrawal" width={160} height={160} />
        <div>
          <p className="mc-kicker">Verified claim</p>
          <h1>Welcome to Cryptomantra</h1>
          <p className="mc-lede">Aapka free access unlock ho gaya. Neeche se koi bhi tool kholiye — poora Trading Desk bhi saath mein hai.</p>
        </div>
      </div>
      <ul className="mc-access">
        {ACCESS.map(([view, label]) => (
          <li key={view}>
            <button type="button" onClick={() => onOpen(view)}>
              <span aria-hidden>✓</span> {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mc-inline">
        <button type="button" className="mc-btn mc-btn-gold" onClick={markDeposit} disabled={club.membership?.depositMarked}>
          {club.membership?.depositMarked ? "Deposit marked" : "Mark deposit"}
        </button>
        <button type="button" className="mc-btn" onClick={markFirstTrade} disabled={club.membership?.firstTradeMarked}>
          {club.membership?.firstTradeMarked ? "First trade marked" : "Mark first exchange trade"}
        </button>
        <Link href="/trade" className="mc-btn">Open Trading Desk</Link>
      </div>
      <p className="mc-fine">
        Discipline score: {score.total == null ? "abhi data kam hai" : `${score.total}/100`}. Ye trade-count leaderboard nahi hai.
        Exchange confirmation: claim recorded, partner API se match baaki.
      </p>
    </div>
  );
}

export function RadarView({ market }: { market: MarketBag }) {
  return (
    <div className="mc-panel">
      <div className="mc-section-head">
        <h1>Mukul Market Radar</h1>
        <button type="button" className="mc-btn" onClick={market.reload} disabled={market.loading}>
          {market.loading ? "Reading…" : "Refresh"}
        </button>
      </div>
      <p className="mc-fine">Har coin ka readout educational hai. Buy/sell tip nahi.</p>
      {market.error && <p className="mc-error" role="alert">{market.error}</p>}
      <div className="mc-radar">
        {market.reads.map((row) => (
          <article key={row.symbol} className="mc-radar-card">
            <header>
              <h2>{row.base}</h2>
              <strong data-setup={row.setup}>{row.setup}</strong>
            </header>
            <p>{usd(row.price)}</p>
            <dl>
              <div><dt>Trend</dt><dd>{row.trend}</dd></div>
              <div><dt>Momentum</dt><dd>{row.momentum}</dd></div>
              <div><dt>Volume</dt><dd>{row.volume}</dd></div>
              <div><dt>Volatility</dt><dd>{row.volatility}</dd></div>
              <div><dt>Market Structure</dt><dd>{row.structure}</dd></div>
            </dl>
            <h3>WHY?</h3>
            <p>{row.why}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AlgoView({ market }: { market: MarketBag }) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const algo = useMemo(() => readAlgo(market.candles[symbol] ?? []), [market.candles, symbol]);
  return (
    <div className="mc-panel">
      <h1>Mukul Algo</h1>
      <p className="mc-lede">MUKUL TREND — signal aur explanation. Auto buy/sell nahi.</p>
      <label className="mc-field">
        Coin
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {market.reads.map((row) => <option key={row.symbol} value={row.symbol}>{row.base}</option>)}
        </select>
      </label>
      {!algo && <p className="mc-fine">{market.loading ? "Candles aa rahi hain." : "Is coin ka data abhi nahi mila."}</p>}
      {algo && (
        <>
          <p className="mc-status" data-status={algo.status}>
            {algo.status === "forming" && "Setup forming"}
            {algo.status === "awaited" && "Confirmation awaited"}
            {algo.status === "invalidated" && "Setup invalidated"}
          </p>
          <ul className="mc-checks">
            {algo.checks.map((check) => (
              <li key={check.label} data-ok={check.ok}>
                <strong>{check.label}</strong>
                <span>{check.note}</span>
              </li>
            ))}
          </ul>
          <p>{algo.explanation}</p>
        </>
      )}
    </div>
  );
}

export function AlertsView({ club, market }: { club: ClubState; market: MarketBag }) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [rsiGt, setRsiGt] = useState(true);
  const [priceAboveEma50, setPriceAboveEma50] = useState(true);
  const [volumeAbove, setVolumeAbove] = useState(true);
  const [trendBullish, setTrendBullish] = useState(false);
  const [structureBullish, setStructureBullish] = useState(false);
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState(false);

  const coins = market.reads.length ? market.reads : [{ symbol: "BTCUSDT", base: "BTC" }, { symbol: "ETHUSDT", base: "ETH" }, { symbol: "SOLUSDT", base: "SOL" }];

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!rsiGt && !priceAboveEma50 && !volumeAbove && !trendBullish && !structureBullish) return;
    addAlert({ symbol, rsiGt, priceAboveEma50, volumeAbove, trendBullish, structureBullish, email: email.trim(), telegram });
  };

  return (
    <div className="mc-panel">
      <h1>Create Alert</h1>
      <form className="mc-form" onSubmit={onCreate}>
        <label className="mc-field">Coin
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {coins.map((row) => <option key={row.symbol} value={row.symbol}>{row.base}</option>)}
          </select>
        </label>
        <label className="mc-check"><input type="checkbox" checked={rsiGt} onChange={(e) => setRsiGt(e.target.checked)} /> RSI &gt; 60</label>
        <label className="mc-check"><input type="checkbox" checked={priceAboveEma50} onChange={(e) => setPriceAboveEma50(e.target.checked)} /> Price &gt; EMA 50</label>
        <label className="mc-check"><input type="checkbox" checked={volumeAbove} onChange={(e) => setVolumeAbove(e.target.checked)} /> Volume &gt; 1.5× average</label>
        <label className="mc-check"><input type="checkbox" checked={trendBullish} onChange={(e) => setTrendBullish(e.target.checked)} /> Trend bullish</label>
        <label className="mc-check"><input type="checkbox" checked={structureBullish} onChange={(e) => setStructureBullish(e.target.checked)} /> Structure bullish</label>
        <label className="mc-field">Email option
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" type="email" />
        </label>
        <label className="mc-check"><input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} /> Telegram share option</label>
        <button type="submit" className="mc-btn mc-btn-gold">Alert Me</button>
      </form>
      <p className="mc-fine">Alert club ke andar save hoti hai. Email aur Telegram ke liye ready link tab dikhta hai jab condition meet ho — alag push server abhi connected nahi.</p>
      <ul className="mc-list">
        {club.alerts.map((rule) => {
          const read = market.reads.find((row) => row.symbol === rule.symbol);
          const hit = read ? countAlert(rule, read) : null;
          return (
            <li key={rule.id}>
              <strong>{rule.symbol.replace("USDT", "")}</strong>
              {hit && <span> {hit.met}/{hit.total} conditions</span>}
              <button type="button" onClick={() => removeAlert(rule.id)}>Remove</button>
            </li>
          );
        })}
      </ul>
      <h2>Mukul Radar Alert</h2>
      <ul className="mc-list">
        {club.notices.map((notice) => (
          <li key={notice.id}>
            <p>{notice.text}</p>
            {notice.email && (
              <a href={`mailto:${notice.email}?subject=${encodeURIComponent("Mukul Radar Alert")}&body=${encodeURIComponent(notice.text)}`}>Email this alert</a>
            )}
            {notice.telegram && (
              <a href={`https://t.me/share/url?url=${encodeURIComponent("https://www.youtube.com/@mukulagrawal")}&text=${encodeURIComponent(notice.text)}`} target="_blank" rel="noreferrer">Telegram share</a>
            )}
          </li>
        ))}
        {!club.notices.length && <li>Abhi koi alert fire nahi hui.</li>}
      </ul>
    </div>
  );
}

export function AnalyzerView({ market }: { market: MarketBag }) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [preview, setPreview] = useState("");
  const [plannedR, setPlannedR] = useState("");
  const read = market.reads.find((row) => row.symbol === symbol) ?? null;
  const levels = swings(market.candles[symbol] ?? []);
  const planned = Number(plannedR);
  const checks = [
    ["Trend", Boolean(read && read.trend !== "Sideways")],
    ["Momentum", Boolean(read && read.momentum === "Strong")],
    ["Volume", Boolean(read && read.volume === "Above Average")],
    ["Confirmation", Boolean(read && read.setup === "ALIGNED")],
    ["Risk/Reward", Number.isFinite(planned) && planned >= 2],
  ] as const;
  const complete = checks.every(([, ok]) => ok);

  return (
    <div className="mc-panel">
      <h1>AI Chart Analyzer</h1>
      <p className="mc-fine">Chart screenshot aapke note ke saath rehta hai. Checklist live candles se banta hai. Ye guaranteed prediction ya personal financial advice nahi hai.</p>
      <label className="mc-field">
        Chart screenshot
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPreview((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return URL.createObjectURL(file);
            });
          }}
        />
      </label>
      {preview && <img className="mc-upload" src={preview} alt="Uploaded chart" />}
      <label className="mc-field">Symbol
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {(market.reads.length ? market.reads : [{ symbol: "BTCUSDT", base: "BTC" }]).map((row) => (
            <option key={row.symbol} value={row.symbol}>{row.base}</option>
          ))}
        </select>
      </label>
      {read && (
        <dl className="mc-metrics">
          <div><dt>Trend</dt><dd>{read.trend}</dd></div>
          <div><dt>Support</dt><dd>{levels ? usd(levels.support) : "—"}</dd></div>
          <div><dt>Resistance</dt><dd>{levels ? usd(levels.resistance) : "—"}</dd></div>
          <div><dt>Momentum</dt><dd>{read.momentum}</dd></div>
          <div><dt>Volume</dt><dd>{read.volume}</dd></div>
          <div><dt>Market Structure</dt><dd>{read.structure}</dd></div>
          <div><dt>Volatility</dt><dd>{read.volatility}</dd></div>
        </dl>
      )}
      <label className="mc-field">
        Planned reward vs risk
        <input value={plannedR} onChange={(e) => setPlannedR(e.target.value)} inputMode="decimal" placeholder="2" />
      </label>
      <h2>MUKUL CHECKLIST</h2>
      <ul className="mc-checks">
        {checks.map(([label, ok]) => (
          <li key={label} data-ok={ok}><strong>{ok ? "Done" : "Open"}</strong><span>{label}</span></li>
        ))}
      </ul>
      <p className="mc-status" data-status={complete ? "forming" : "invalidated"}>{complete ? "Checklist complete — still a study, not an order" : "Setup incomplete"}</p>
    </div>
  );
}

export function BacktestView({ market, preset }: { market: MarketBag; preset?: string }) {
  const initial = STRATEGIES.find((item) => item.id === preset)?.rules ?? STRATEGIES[0].rules;
  const [rules, setRules] = useState<StudyRules>(initial);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof studyBacktest>>(null);

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await fetchCandles({ symbol, interval: "1d", limit: 400 });
      const study = studyBacktest(res.candles, rules);
      if (!study) setError("Itni candles nahi mili.");
      setResult(study);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest fail");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mc-panel">
      <h1>Backtest</h1>
      <p className="mc-fine">EMA, RSI aur volume ki simplified long-only study. Poora desk backtester alag se /trade par hai.</p>
      <div className="mc-grid-form">
        <label>EMA fast <input type="number" value={rules.emaFast} min={2} onChange={(e) => setRules({ ...rules, emaFast: Number(e.target.value) })} /></label>
        <label>EMA slow <input type="number" value={rules.emaSlow} min={3} onChange={(e) => setRules({ ...rules, emaSlow: Number(e.target.value) })} /></label>
        <label>RSI &gt; <input type="number" value={rules.rsiMin} min={1} max={99} onChange={(e) => setRules({ ...rules, rsiMin: Number(e.target.value) })} /></label>
        <label>Volume × <input type="number" value={rules.volMult} min={0.5} step={0.1} onChange={(e) => setRules({ ...rules, volMult: Number(e.target.value) })} /></label>
        <label>Symbol
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"].map((item) => (
              <option key={item} value={item}>{item.replace("USDT", "")}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="mc-btn mc-btn-gold" onClick={run} disabled={running}>{running ? "Running…" : "BACKTEST · 1Y"}</button>
      <Link href="/trade?tab=backtest" className="mc-btn">Full desk backtester</Link>
      {error && <p className="mc-error" role="alert">{error}</p>}
      {result && (
        <dl className="mc-metrics">
          <div><dt>Total Trades</dt><dd>{result.trades}</dd></div>
          <div><dt>Win Rate</dt><dd>{result.winRate.toFixed(1)}%</dd></div>
          <div><dt>Profit Factor</dt><dd>{result.profitFactor == null ? "No losses" : result.profitFactor.toFixed(2)}</dd></div>
          <div><dt>Max Drawdown</dt><dd>{result.maxDrawdown.toFixed(1)}%</dd></div>
          <div><dt>Average Trade</dt><dd>{pct(result.averageTrade)}</dd></div>
          <div><dt>Losing Streak</dt><dd>{result.losingStreak}</dd></div>
          <div><dt>Buy & Hold</dt><dd>{pct(result.buyHold)}</dd></div>
        </dl>
      )}
      {market.error && <p className="mc-fine">{market.error}</p>}
    </div>
  );
}

export function PaperView({ club, market }: { club: ClubState; market: MarketBag }) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [amount, setAmount] = useState(5000);
  const [strategy, setStrategy] = useState("Trend Following");
  const marks = Object.fromEntries(market.reads.map((row) => [row.symbol, row.price]));
  const stats = paperStats(club, marks);
  const price = marks[symbol];

  return (
    <div className="mc-panel">
      <h1>Paper Trading</h1>
      <p className="mc-lede">{inr(PAPER_START_INR)} virtual capital. Real order nahi jaata.</p>
      <dl className="mc-metrics">
        <div><dt>Virtual P&amp;L</dt><dd>{inr(stats.equity - PAPER_START_INR)}</dd></div>
        <div><dt>Equity</dt><dd>{inr(stats.equity)}</dd></div>
        <div><dt>Win Rate</dt><dd>{stats.winRate.toFixed(0)}%</dd></div>
        <div><dt>Drawdown</dt><dd>{stats.drawdown.toFixed(1)}%</dd></div>
        <div><dt>Risk/Reward</dt><dd>{stats.rr == null ? "—" : stats.rr.toFixed(2)}</dd></div>
      </dl>
      <p className="mc-fine">Marks {PAPER_USD_INR} INR per USD ke study rate par hain.</p>
      <form className="mc-grid-form" onSubmit={(event) => {
        event.preventDefault();
        if (!price) return;
        openPaper({ symbol, strategy, notionalInr: amount, entryUsd: price });
      }}>
        <label>Symbol
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {(market.reads.length ? market.reads : [{ symbol: "BTCUSDT", base: "BTC" }]).map((row) => (
              <option key={row.symbol} value={row.symbol}>{row.base}</option>
            ))}
          </select>
        </label>
        <label>Strategy
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((item) => <option key={item.id}>{item.name.replace(/Strategy 0\d — /, "")}</option>)}
          </select>
        </label>
        <label>Amount INR <input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <button type="submit" className="mc-btn mc-btn-gold" disabled={!price || amount > club.paperCash}>Paper buy</button>
      </form>
      <p className="mc-fine">Cash left {inr(club.paperCash)}. Live ticket ke liye <Link href="/trade">Trading Desk</Link>.</p>
      <ul className="mc-list">
        {club.positions.map((pos) => (
          <li key={pos.id}>
            <span>{pos.symbol.replace("USDT", "")} · {inr(pos.notionalInr)} @ {usd(pos.entryUsd)}</span>
            <button type="button" onClick={() => closePaper(pos.id, marks[pos.symbol] || pos.entryUsd, false)} disabled={!marks[pos.symbol]}>Close</button>
            <button type="button" onClick={() => closePaper(pos.id, marks[pos.symbol] || pos.entryUsd, true)} disabled={!marks[pos.symbol]}>Stop moved</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoomView({ market }: { market: MarketBag }) {
  return (
    <div className="mc-panel">
      <h1>Daily Mukul Crypto Room</h1>
      <ol className="mc-agenda">
        <li>Market Overview</li>
        <li>BTC</li>
        <li>ETH</li>
        <li>Major setups</li>
        <li>Risk discussion</li>
      </ol>
      <p>Yahi Market Radar live room ke saath dikhta hai — YouTube par jo padhai hai, wahi yahan numbers mein.</p>
      <p><a href="https://www.youtube.com/@mukulagrawal/streams" target="_blank" rel="noreferrer">YouTube live / streams kholen</a></p>
      <RadarView market={market} />
    </div>
  );
}

export function CommunityView({ club }: { club: ClubState }) {
  const [channel, setChannel] = useState<CommunityPost["channel"]>("learning");
  const [body, setBody] = useState("");
  const posts = club.posts.filter((post) => post.channel === channel);
  return (
    <div className="mc-panel">
      <h1>Private Community</h1>
      <p className="mc-fine">Seekhne wala room hai. Signal dump nahi.</p>
      <div className="mc-chips">
        {CHANNELS.map((item) => (
          <button type="button" key={item.id} data-active={channel === item.id} onClick={() => setChannel(item.id)}>{item.label}</button>
        ))}
      </div>
      <ul className="mc-list">
        {posts.map((post) => (
          <li key={post.id}><strong>{post.author}</strong><p>{post.body}</p></li>
        ))}
        {!posts.length && <li>Is channel par abhi koi note nahi.</li>}
      </ul>
      <form className="mc-form" onSubmit={(event) => {
        event.preventDefault();
        if (body.trim().length < 2) return;
        addPost(channel, body);
        setBody("");
      }}>
        <label className="mc-field">Note
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </label>
        <button type="submit" className="mc-btn mc-btn-gold">Post in {CHANNELS.find((item) => item.id === channel)?.label}</button>
      </form>
    </div>
  );
}

export function LibraryView({ onOpen }: { onOpen: (view: string, strategy?: string) => void }) {
  const [open, setOpen] = useState<string | null>(STRATEGIES[0].id);
  return (
    <div className="mc-panel">
      <h1>Mukul Strategy Library</h1>
      <ul className="mc-library">
        {STRATEGIES.map((item) => (
          <li key={item.id}>
            <h2>{item.name}</h2>
            {open === item.id && <p>{item.learn}</p>}
            <div className="mc-inline">
              <button type="button" onClick={() => setOpen(item.id)}>Learn</button>
              <button type="button" onClick={() => onOpen("backtest", item.id)}>Backtest</button>
              <button type="button" onClick={() => onOpen("paper")}>Paper Trade</button>
              <button type="button" onClick={() => onOpen("journal")}>Track</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClassesView({ onOpen }: { onOpen: (view: string) => void }) {
  return (
    <div className="mc-panel">
      <h1>Exclusive Classes</h1>
      <p>Class ka path: video dekho, strategy padho, phir paper par try karo.</p>
      <div className="mc-inline">
        <button type="button" className="mc-btn mc-btn-gold" onClick={() => onOpen("videos")}>Videos</button>
        <button type="button" className="mc-btn" onClick={() => onOpen("library")}>Strategy Library</button>
      </div>
      <VideoGrid featured={false} />
    </div>
  );
}

export function DcaView({ club, market }: { club: ClubState; market: MarketBag }) {
  const [symbol, setSymbol] = useState(club.dca?.symbol ?? "BTCUSDT");
  const [amount, setAmount] = useState(club.dca?.amountInr ?? 1000);
  const [cadence, setCadence] = useState<"week" | "month">(club.dca?.cadence ?? "week");
  const [saved, setSaved] = useState(false);
  const price = market.reads.find((row) => row.symbol === symbol)?.price;

  return (
    <div className="mc-panel">
      <h1>Free DCA Bot</h1>
      <p className="mc-error" role="note">
        Live orders band hain jab tak exchange API permissions, security aur compliance review na ho.
        API key par withdrawal permission kabhi enable mat karna.
      </p>
      <form className="mc-grid-form" onSubmit={(event) => {
        event.preventDefault();
        const next = new Date();
        next.setDate(next.getDate() + (cadence === "week" ? 7 : 30));
        saveDca({ symbol, amountInr: amount, cadence, nextDate: next.toISOString().slice(0, 10) });
        setSaved(true);
      }}>
        <label>Coin
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="BTCUSDT">BTC</option>
            <option value="ETHUSDT">ETH</option>
          </select>
        </label>
        <label>Amount INR <input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <label>Schedule
          <select value={cadence} onChange={(e) => setCadence(e.target.value as "week" | "month")}>
            <option value="week">₹ per week</option>
            <option value="month">₹ per month</option>
          </select>
        </label>
        <button type="submit" className="mc-btn mc-btn-gold">Save paper plan</button>
      </form>
      {club.dca && <p>Next paper date {club.dca.nextDate} · {club.dca.symbol.replace("USDT", "")} · {inr(club.dca.amountInr)}</p>}
      {saved && <p className="mc-fine">Plan save ho gaya. Exchange par order nahi gaya.</p>}
      <button
        type="button"
        className="mc-btn"
        disabled={!price || !club.dca}
        onClick={() => {
          if (!club.dca || !price) return;
          openPaper({ symbol: club.dca.symbol, strategy: "DCA", notionalInr: club.dca.amountInr, entryUsd: price });
        }}
      >
        Record one paper DCA fill
      </button>
    </div>
  );
}

export function JournalView({ club, market }: { club: ClubState; market: MarketBag }) {
  const marks = Object.fromEntries(market.reads.map((row) => [row.symbol, row.price]));
  const stats = paperStats(club, marks);
  return (
    <div className="mc-panel">
      <h1>My Trading</h1>
      <dl className="mc-metrics">
        <div><dt>Trades</dt><dd>{stats.trades}</dd></div>
        <div><dt>Win Rate</dt><dd>{stats.winRate.toFixed(0)}%</dd></div>
        <div><dt>Average R:R</dt><dd>{stats.rr == null ? "—" : stats.rr.toFixed(2)}</dd></div>
        <div><dt>Max Drawdown</dt><dd>{stats.drawdown.toFixed(1)}%</dd></div>
      </dl>
      <h2>Your Mistakes</h2>
      <p>{stats.stopsMoved} trades mein predefined stop-loss badla gaya.</p>
      <ul className="mc-list">
        {club.paperTrades.map((trade) => (
          <li key={trade.id}>
            {trade.symbol.replace("USDT", "")} · {pct(trade.pnlPct)} · {trade.strategy}
            {trade.stopMoved ? " · stop moved" : ""}
          </li>
        ))}
        {!club.paperTrades.length && <li>Paper trade close hone par journal yahan aata hai. Desk trades /trade par hain.</li>}
      </ul>
      <Link href="/trade?tab=trades">Desk trades kholen</Link>
    </div>
  );
}

export function ScoreView({ club }: { club: ClubState }) {
  const score = disciplineScore(club);
  const rows = [
    ["Risk Management", score.risk],
    ["Discipline", score.discipline],
    ["Overtrading", score.overtrading],
    ["Strategy Consistency", score.consistency],
  ] as const;
  return (
    <div className="mc-panel">
      <h1>Mukul Score</h1>
      <p className="mc-score">{score.total == null ? "—" : `${score.total}/100`}</p>
      <p className="mc-fine">Trading discipline score. Zyada trades karne wale ka leaderboard nahi.</p>
      <ul className="mc-score-list">
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{value == null ? "—" : value}</strong>
            <i style={{ width: `${value ?? 0}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MissionView({ club }: { club: ClubState }) {
  const mission = MISSIONS[Math.floor(Date.now() / 86400000) % MISSIONS.length];
  const day = todayKey();
  const saved = club.missions.find((item) => item.day === day);
  const [text, setText] = useState(saved?.text ?? "");
  return (
    <div className="mc-panel">
      <h1>Today’s Mission</h1>
      <p className="mc-lede">{mission.prompt}</p>
      <form className="mc-form" onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length < 2) return;
        submitMission(day, text);
      }}>
        <label className="mc-field">Your answer
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        </label>
        <button type="submit" className="mc-btn mc-btn-gold">Submit</button>
      </form>
      {saved && (
        <article>
          <h2>Mukul’s Analysis</h2>
          <p>{mission.analysis}</p>
        </article>
      )}
    </div>
  );
}

export function MissedView({ club }: { club: ClubState }) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const past = club.radarHistory.filter((row) => row.day === yesterday);
  const preview = !past.length;
  const rows = past.length ? past : club.radarHistory.filter((row) => row.day === todayKey()).slice(0, 1);
  const row = rows.find((item) => item.setup === "WATCH" || item.setup === "ALIGNED") ?? rows[0];
  const hadAlert = row ? club.alerts.some((alert) => alert.symbol === row.symbol) : false;
  const checked = club.activeDays.includes(yesterday);
  if (!row) {
    return (
      <div className="mc-panel">
        <h1>Missed Setup</h1>
        <p>Radar ek baar refresh hone ke baad yahan replay banta hai.</p>
      </div>
    );
  }
  return (
    <div className="mc-panel">
      <h1>{preview ? "Setup replay preview" : "You missed this setup yesterday."}</h1>
      <p className="mc-fine">{preview ? "Kal isi saved radar se missed-setup banega. Ye abhi aaj ka study replay hai." : `${row.symbol.replace("USDT", "")} · ${row.setup}`}</p>
      <ol className="mc-agenda">
        <li>09:30 — Setup forming</li>
        <li>10:05 — Confirmation</li>
        <li>10:30 — Move</li>
      </ol>
      <p>{row.why}</p>
      <h2>Why did you miss it?</h2>
      <ul>
        <li>{hadAlert ? "Alert enabled thi." : "Alert not enabled"}</li>
        <li>{row.setup === "ALIGNED" ? "Setup study complete tha." : "Setup incomplete"}</li>
        <li>{checked ? "Dashboard kal khula tha." : "User didn’t check dashboard"}</li>
      </ul>
    </div>
  );
}

export function VideosView() {
  return (
    <div className="mc-panel">
      <VideoGrid />
    </div>
  );
}
