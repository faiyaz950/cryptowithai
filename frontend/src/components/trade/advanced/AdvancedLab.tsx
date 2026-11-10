"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BASKET_SYMBOLS,
  CANDLE_CAP,
  cloneSpec,
  candlePlan,
  deleteSavedLab,
  readSavedLabs,
  runBasket,
  specIssues,
  strategyRows,
  sweepGrid,
  upsertSavedLab,
  type Bucket,
  type LabPeriod,
  type LabReport,
  type LabSpec,
  type SavedLab,
  type StrategyRow,
} from "@/lib/advancedBacktest";
import { loadLabHistory, type LoadedBook } from "@/lib/labCandles";
import { CRYPTO_INTERVALS, CRYPTO_SYMBOLS } from "@/lib/cryptoApi";
import { LabChart } from "./LabChart";
import "./advanced.css";

type Tab = "build" | "describe" | "saved";
type Patch = (partial: Partial<LabSpec>) => void;

interface OptRow {
  id: string;
  stopText: string;
  targetText: string;
  patch: Partial<LabSpec>;
  practice: Bucket;
}

interface OptState {
  status: "running" | "done" | "error";
  rows: OptRow[];
  message?: string;
  picked: string | null;
  finalTest: Bucket | null;
  stopLabel: string;
  targetLabel: string;
}

const LEVERAGE = [1, 2, 3, 5, 10, 20, 25, 50, 100];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function AdvancedLab() {
  const [tab, setTab] = useState<Tab>("build");
  const [spec, setSpec] = useState<LabSpec>(() => cloneSpec());
  const [saved, setSaved] = useState<SavedLab[]>(() => readSavedLabs());
  const [report, setReport] = useState<LabReport | null>(null);
  const [books, setBooks] = useState<LoadedBook[]>([]);
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [opt, setOpt] = useState<OptState | null>(null);
  const cache = useRef<{ key: string; books: LoadedBook[] } | null>(null);
  const optRef = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const issues = useMemo(() => specIssues(spec), [spec]);
  const plan = useMemo(
    () => candlePlan(spec.timeframe, spec.period, spec.customBars),
    [spec.timeframe, spec.period, spec.customBars],
  );
  const rows = useMemo(() => strategyRows(spec), [spec]);

  const patch: Patch = (partial) => setSpec((prev) => ({ ...prev, ...partial }));

  const loadBooks = async (next: LabSpec) => {
    const nextPlan = candlePlan(next.timeframe, next.period, next.customBars);
    const symbols = next.basket ? [...BASKET_SYMBOLS] : [next.symbol];
    const key = `${symbols.join(",")}|${next.timeframe}|${nextPlan.load}`;
    if (cache.current?.key === key) return cache.current.books;
    const loaded: LoadedBook[] = [];
    for (const symbol of symbols) {
      const name = symbol.replace(/USDT$/, "USD");
      setStatus(`Loading ${name}`);
      const book = await loadLabHistory(symbol, next.timeframe, nextPlan.load, (page, got) => {
        setStatus(`Loading ${name} · page ${page} · ${got.toLocaleString("en-IN")} candles`);
      });
      if (!book.candles.length) throw new Error(`${name} returned no candles`);
      loaded.push(book);
    }
    cache.current = { key, books: loaded };
    return loaded;
  };

  const run = async (next: LabSpec = spec) => {
    const problems = specIssues(next);
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setRunning(true);
    setError(null);
    setStatus("Running the backtest.");
    try {
      const loaded = await loadBooks(next);
      const nextPlan = candlePlan(next.timeframe, next.period, next.customBars);
      const result = runBasket(loaded.map((book) => ({ symbol: book.symbol, candles: book.candles })), next);
      const notes = [...result.notes];
      for (const book of loaded) {
        const name = book.symbol.replace(/USDT$/, "USD");
        if (book.candles.length >= nextPlan.load && nextPlan.need > nextPlan.load) {
          notes.push(`${name}: this period wants ${nextPlan.need.toLocaleString("en-IN")} candles. Loaded the latest ${nextPlan.load.toLocaleString("en-IN")}.`);
        } else if (book.ended && book.candles.length < nextPlan.need) {
          const from = book.candles[0] ? fmtTime(book.candles[0].time) : "the start";
          notes.push(`${name}: history ends at ${from}. Loaded ${book.candles.length.toLocaleString("en-IN")} of ${nextPlan.need.toLocaleString("en-IN")} candles.`);
        }
      }
      setBooks(loaded);
      setReport({ ...result, notes });
      setRunId((n) => n + 1);
      setStatus(`Backtest finished. ${result.trades.length} trades.`);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    } catch (e) {
      setReport(null);
      setBooks([]);
      const message = e instanceof Error ? e.message : "Backtest failed";
      setError(message);
      setStatus(message);
    } finally {
      setRunning(false);
    }
  };

  const save = () => {
    const named = { ...spec, name: spec.name.trim() || "Untitled" };
    setSpec(named);
    setSaved(upsertSavedLab(named));
    setStatus(`Saved “${named.name}” in this browser.`);
  };

  const scoreBooks = (loaded: LoadedBook[], next: LabSpec) => (
    runBasket(loaded.map((book) => ({ symbol: book.symbol, candles: book.candles })), next)
  );

  const optimize = async () => {
    if (issues.length || running) return;
    const grid = sweepGrid(spec);
    setOpt({
      status: "running",
      rows: [],
      picked: null,
      finalTest: null,
      stopLabel: grid.stop.label,
      targetLabel: grid.target.label,
    });
    const dlg = optRef.current;
    if (dlg && !dlg.open) dlg.showModal();
    try {
      const loaded = await loadBooks(spec);
      const found: OptRow[] = [];
      for (const point of grid.points) {
        const practice = scoreBooks(loaded, { ...spec, ...point.patch }).practice;
        found.push({ ...point, practice });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      found.sort((a, b) => rank(b.practice) - rank(a.practice) || b.practice.net - a.practice.net);
      const winner = found.find((row) => row.practice.trades >= 5) ?? null;
      const finalTest = winner ? scoreBooks(loaded, { ...spec, ...winner.patch }).finalTest : null;
      setOpt({
        status: "done",
        rows: found,
        picked: winner?.id ?? null,
        finalTest,
        stopLabel: grid.stop.label,
        targetLabel: grid.target.label,
      });
    } catch (e) {
      setOpt({
        status: "error",
        rows: [],
        message: e instanceof Error ? e.message : "The sweep failed",
        picked: null,
        finalTest: null,
        stopLabel: grid.stop.label,
        targetLabel: grid.target.label,
      });
    }
  };

  const inspectOpt = (row: OptRow) => {
    const loaded = cache.current?.books;
    if (!loaded) return;
    const finalTest = scoreBooks(loaded, { ...spec, ...row.patch }).finalTest;
    setOpt((prev) => (prev ? { ...prev, picked: row.id, finalTest } : prev));
  };

  const applyOpt = (row: OptRow) => {
    const next: LabSpec = { ...spec, ...row.patch };
    setSpec(next);
    optRef.current?.close();
    void run(next);
  };

  return (
    <div className="lab">
      <div className="lab-tabs" role="tablist" aria-label="Backtester">
        {([
          ["build", "Build"],
          ["describe", "Describe"],
          ["saved", "My tests"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <div className="lab-workspace">
          <div className="lab-main">
            <div className="lab-head">
              <label className="lab-name-wrap">
                <span>Strategy</span>
                <input
                  className="lab-name"
                  aria-label="Strategy name"
                  value={spec.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <div className="lab-head-tools">
                <div className="lab-dir" role="group" aria-label="Direction">
                  {(["long", "short", "both"] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      data-side={side}
                      aria-pressed={spec.side === side}
                      onClick={() => patch({ side })}
                    >
                      {side === "both" ? "Both" : side === "long" ? "Long" : "Short"}
                    </button>
                  ))}
                </div>
                <button type="button" className="lab-ghost lab-ghost-sm" onClick={() => { setSpec(cloneSpec()); setReport(null); setError(null); }}>
                  Load example
                </button>
              </div>
            </div>

            <MarketCard spec={spec} patch={patch} planNeed={plan.need} planLoad={plan.load} planDays={plan.days} />
            <EntryCard spec={spec} patch={patch} />
            <ExitCard spec={spec} patch={patch} />
            <FilterCard spec={spec} patch={patch} />
            {spec.side === "both" && <SellCard spec={spec} patch={patch} />}
            <TimeCard spec={spec} patch={patch} />
            <SessionCard spec={spec} patch={patch} />

            {issues.length > 0 && (
              <ul className="lab-issues">
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
            <div className="lab-actions lab-dock">
              <span className="lab-status" aria-live="polite">{status}</span>
              <button type="button" className="lab-ghost" onClick={save}>Save</button>
              <button type="button" className="lab-ghost" onClick={optimize} disabled={running || issues.length > 0}>
                Optimize
              </button>
              <button type="button" className="lab-run" onClick={() => void run()} disabled={running || issues.length > 0}>
                {running ? "Running…" : "Run backtest"}
              </button>
            </div>
            {error && <p className="lab-error" role="alert">{error}</p>}
          </div>

          <aside className="lab-rail">
            <section className="lab-card lab-summary">
              <div className="lab-summary-top">
                <p className="lab-ready" data-bad={issues.length ? "1" : "0"}>{issues.length ? "Fix the builder" : "Ready"}</p>
                <button type="button" className="lab-run" onClick={() => void run()} disabled={running || issues.length > 0}>
                  {running ? "Running…" : "Run"}
                </button>
              </div>
              <h2>Your strategy</h2>
              <Rows rows={rows} />
              <p className="lab-note">This is what the run will test. If a line is wrong, change it on the left.</p>
            </section>
          </aside>
        </div>
      )}

      {tab === "describe" && (
        <article className="lab-card">
          <h2>What will be tested</h2>
          <Rows rows={rows} />
          <h3 className="lab-subhead">How a fill is counted</h3>
          <ul className="lab-prose">
            <li>The stop order can fill only on a candle after the retest.</li>
            <li>If one candle touches the stop and the target, the stop is taken. A gap through the stop fills at the open.</li>
            <li>A partial, breakeven, or trail moves the stop for the next candle.</li>
            <li>The final test and the four folds use these same rules. Nothing is re-optimized on them.</li>
            <li>Funding stays off unless you type a rate. The candle feed has no historical funding print.</li>
          </ul>
        </article>
      )}

      {tab === "saved" && (
        <SavedList
          rows={saved}
          onLoad={(row) => { setSpec(cloneSpec(row.spec)); setReport(null); setError(null); setTab("build"); }}
          onDelete={(id) => setSaved(deleteSavedLab(id))}
        />
      )}

      {report && (
        <Results key={runId} report={report} books={books} spec={spec} resultRef={resultRef} />
      )}

      <dialog ref={optRef} className="lab-dialog" aria-labelledby="lab-opt-title">
        <h2 id="lab-opt-title">Practice sweep</h2>
        <p className="lab-note">
          The sweep keeps your stop mode and your target mode, and only moves those two knobs.
          Rows are ranked on practice. A row with fewer than 5 practice trades cannot win.
          The final test is shown only for the selected row, and it is not used to rank.
        </p>
        {opt?.status === "running" && <p className="lab-note">Checking practice runs…</p>}
        {opt?.status === "error" && <p className="lab-error" role="alert">{opt.message}</p>}
        {opt?.status === "done" && opt.rows.length > 0 && !opt.rows.some((row) => row.practice.trades >= 5) && (
          <p className="lab-note">No row has 5 practice trades, so none of them can win.</p>
        )}
        {opt?.status === "done" && opt.rows.length > 0 && (
          <div className="lab-table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>{opt.targetLabel}</th>
                  <th>{opt.stopLabel}</th>
                  <th>Practice</th>
                  <th>Trades</th>
                  <th>PF</th>
                  <th>DD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {opt.rows.map((row) => {
                  const current = samePatch(spec, row.patch);
                  const picked = opt.picked === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr data-on={picked ? "1" : "0"} onClick={() => inspectOpt(row)}>
                        <td>{row.targetText}</td>
                        <td>{row.stopText}</td>
                        <td className={row.practice.net >= 0 ? "up" : "down"}>{money(row.practice.net)}</td>
                        <td>{row.practice.trades}</td>
                        <td>{row.practice.profitFactor == null ? "—" : row.practice.profitFactor.toFixed(2)}</td>
                        <td>{money(row.practice.maxDd)}</td>
                        <td>
                          {current ? "Now" : (
                            <button type="button" className="lab-mini" onClick={(e) => { e.stopPropagation(); applyOpt(row); }}>Apply</button>
                          )}
                        </td>
                      </tr>
                      {picked && opt.finalTest && (
                        <tr>
                          <td colSpan={7}>
                            Final test {money(opt.finalTest.net)} · {opt.finalTest.trades} trades
                            {opt.finalTest.avgR != null ? ` · ${opt.finalTest.avgR.toFixed(2)}R` : ""}. Not used to rank.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="lab-actions">
          <button type="button" className="lab-ghost" onClick={() => optRef.current?.close()}>Close</button>
        </div>
      </dialog>
    </div>
  );
}

function MarketCard({ spec, patch, planNeed, planLoad, planDays }: { spec: LabSpec; patch: Patch; planNeed: number; planLoad: number; planDays: number }) {
  const symbol = spec.symbol.replace(/USDT$/, "USD");
  return (
    <Section
      title="Market"
      hint="Crypto candles come from Delta, paged back as far as the exchange has them. A 30-minute 2-year test fits. A 1-minute multi-year test still stops at 40,000 candles."
      extra={spec.basket ? `BTC · ETH · SOL · ${spec.timeframe}` : `${symbol} · ${spec.timeframe}`}
    >
      <div className="lab-toggle">
        <label className="lab-switch">
          <input type="checkbox" checked={spec.basket} onChange={(e) => patch({ basket: e.target.checked })} />
          <span />
          BTC, ETH and SOL together
        </label>
      </div>
      <div className="lab-grid" style={{ marginTop: 12 }}>
        <Field label={spec.basket ? "Chart opens on" : "Symbol"}>
          <select value={symbolValue(spec)} onChange={(e) => patch({ symbol: e.target.value })}>
            {(spec.basket ? CRYPTO_SYMBOLS.filter((item) => (BASKET_SYMBOLS as readonly string[]).includes(item.value)) : CRYPTO_SYMBOLS).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Final test from">
          <input type="date" value={spec.holdout} onChange={(e) => patch({ holdout: e.target.value })} />
        </Field>
        {spec.period === "custom" && (
          <Field label="Candles">
            <input
              type="number"
              min={50}
              max={CANDLE_CAP}
              value={spec.customBars}
              onChange={(e) => patch({ customBars: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>
      <p className="lab-kicker">Timeframe</p>
      <Chips
        label="Timeframe"
        value={spec.timeframe}
        onChange={(value) => patch({ timeframe: value })}
        options={CRYPTO_INTERVALS.map((item) => ({ value: item.value, label: item.value }))}
      />
      <p className="lab-kicker">Period</p>
      <Chips
        label="Period"
        value={spec.period}
        onChange={(value) => patch({ period: value as LabPeriod })}
        options={["6M", "1Y", "2Y", "3Y", "5Y", "custom"].map((value) => ({ value, label: value === "custom" ? "Custom" : value }))}
      />
      {planNeed > planLoad && (
        <p className="lab-note">
          This period wants {planNeed.toLocaleString("en-IN")} candles. This feed loads {planLoad.toLocaleString("en-IN")}, about {Math.round(planDays)} days.
        </p>
      )}
      {spec.basket && (
        <p className="lab-note">One capital and one daily trade cap cover BTC, ETH and SOL. A fill on one coin does not close the others.</p>
      )}
      <p className="lab-note">The final-test date stays put while you edit. If it sits outside the loaded candles, the last quarter is the final test and the result says so.</p>
    </Section>
  );
}

function EntryCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const short = spec.side === "short";
  const both = spec.side === "both";
  return (
    <Section
      title={short ? "Sell condition" : "Buy condition"}
      hint="The setup has to print before the pullback. The stop order can fill only on a later candle."
      extra="2 steps"
      tone={short ? "short" : undefined}
    >
      <p className="lab-kicker">{short ? "When to go short" : both ? "When to go long. Short is the flip." : "When to go long"}</p>
      <article className="lab-step">
        <header className="lab-step-h">
          <span className="lab-step-no">1</span>
          <strong>Setup — when</strong>
          <label className="lab-barname">
            Call this bar
            <input aria-label="Setup bar name" value={spec.setupBarName} onChange={(e) => patch({ setupBarName: e.target.value })} />
          </label>
        </header>
        <p className="lab-sentence">
          <span>EMA</span>
          <InlineNum label="Fast EMA" value={spec.fast} min={1} onChange={(fast) => patch({ fast })} />
          <span>on Close {both ? "crosses above, for a long," : short ? "crosses below" : "crosses above"}</span>
          <span>EMA</span>
          <InlineNum label="Slow EMA" value={spec.slow} min={1} onChange={(slow) => patch({ slow })} />
          <span>on Close</span>
        </p>
        {both && <p className="lab-quiet">A short setup is the same averages crossing the other way.</p>}
        {spec.andOn ? (
          <div className="lab-rule">
            <span>AND close is</span>
            <InlineSelect
              label="AND side"
              value={spec.andSide}
              onChange={(andSide) => patch({ andSide })}
              options={[{ value: "above", label: "above" }, { value: "below", label: "below" }]}
            />
            EMA
            <InlineNum label="AND EMA" value={spec.andEma} min={1} onChange={(andEma) => patch({ andEma })} />
            <span className="lab-quiet">on the setup bar. Short flips the side.</span>
            <button type="button" className="lab-x" aria-label="Remove AND condition" onClick={() => patch({ andOn: false })}>×</button>
          </div>
        ) : (
          <button type="button" className="lab-add" onClick={() => patch({ andOn: true })}>+ AND condition</button>
        )}
      </article>

      <article className="lab-step">
        <header className="lab-step-h">
          <span className="lab-step-no">2</span>
          <strong>Pullback / retest</strong>
          <label className="lab-barname">
            Call this bar
            <input aria-label="Retest bar name" value={spec.retestBarName} onChange={(e) => patch({ retestBarName: e.target.value })} />
          </label>
        </header>
        <p className="lab-sentence">
          Price comes back to EMA
          <InlineNum label="Pullback EMA" value={spec.pullLen} min={1} onChange={(pullLen) => patch({ pullLen })} />
          on Close, within
          {spec.pullBand === "points" ? (
            <InlineNum label="Pullback points" value={spec.pullPoints} min={0} step={1} onChange={(pullPoints) => patch({ pullPoints })} />
          ) : (
            <InlineNum label="Pullback percent" value={spec.pullPct} min={0} step={0.05} onChange={(pullPct) => patch({ pullPct })} />
          )}
          <InlineSelect
            label="Pullback band"
            value={spec.pullBand}
            onChange={(pullBand) => patch({ pullBand })}
            options={[{ value: "pct", label: "%" }, { value: "points", label: "points" }]}
          />
          pullback no.
          <InlineNum label="Pullback number" value={spec.pullNo} min={1} onChange={(pullNo) => patch({ pullNo: Math.max(1, pullNo) })} />
        </p>
        <p className="lab-sentence">
          inside
          <InlineNum label="Pullback window" value={spec.pullWindow} min={1} onChange={(pullWindow) => patch({ pullWindow })} />
          bars of the setup
        </p>
      </article>

      <div className="lab-order">
        <p className="lab-kicker">{short ? "Then sell" : "Then buy"}</p>
        <p className="lab-sentence">
          {short ? "Sell" : "Buy"} with a stop order at the {spec.retestBarName || "retest"} {short ? "low" : "high"}.
          {both && " Short sells the retest low."} Expires after
          <InlineNum label="Order life in bars" value={spec.expireBars} min={1} onChange={(expireBars) => patch({ expireBars })} />
          bars
        </p>
      </div>
    </Section>
  );
}

function ExitCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const short = spec.side === "short";
  return (
    <Section
      title="Exit"
      hint="The stop is checked before the target. A stop that tightens after a partial, breakeven, or trail protects the next candle."
    >
      <p className="lab-sentence">
        Stop
        <InlineSelect
          label="Stop type"
          value={spec.stopMode}
          onChange={(stopMode) => patch({ stopMode })}
          options={[
            { value: "bar", label: "A named bar's low / high" },
            { value: "pct", label: "% from the fill" },
            { value: "points", label: "Points from the fill" },
            { value: "atr", label: "ATR from the fill" },
          ]}
        />
      </p>
      {spec.stopMode === "bar" && (
        <p className="lab-sentence">
          {short ? "retest high plus" : "retest low minus"}
          {spec.stopPadUnit === "points" ? (
            <InlineNum label="Stop points" value={spec.stopPoints} min={0} step={1} onChange={(stopPoints) => patch({ stopPoints })} />
          ) : (
            <InlineNum label="Stop percent" value={spec.stopPadPct} min={0} step={0.05} onChange={(stopPadPct) => patch({ stopPadPct })} />
          )}
          <InlineSelect
            label="Stop pad unit"
            value={spec.stopPadUnit}
            onChange={(stopPadUnit) => patch({ stopPadUnit })}
            options={[{ value: "pct", label: "%" }, { value: "points", label: "points" }]}
          />
          {spec.side === "both" && <span className="lab-quiet">Short adds the same beyond the retest high.</span>}
        </p>
      )}
      {spec.stopMode === "pct" && (
        <p className="lab-sentence">
          <InlineNum label="Stop percent from fill" value={spec.stopPadPct} min={0} step={0.05} onChange={(stopPadPct) => patch({ stopPadPct })} />
          % from the fill
        </p>
      )}
      {spec.stopMode === "points" && (
        <p className="lab-sentence">
          <InlineNum label="Stop points from fill" value={spec.stopPoints} min={0} step={1} onChange={(stopPoints) => patch({ stopPoints })} />
          points from the fill
        </p>
      )}
      {spec.stopMode === "atr" && (
        <p className="lab-sentence">
          <InlineNum label="ATR multiple" value={spec.stopAtrMult} min={0} step={0.1} onChange={(stopAtrMult) => patch({ stopAtrMult })} />
          × ATR
          <InlineNum label="ATR length" value={spec.stopAtrLen} min={1} onChange={(stopAtrLen) => patch({ stopAtrLen })} />
          from the fill
        </p>
      )}
      <p className="lab-sentence">
        Max points
        <InlineSelect
          label="Max stop distance"
          value={spec.stopMaxMode}
          onChange={(stopMaxMode) => patch({ stopMaxMode })}
          options={[
            { value: "off", label: "Off" },
            { value: "cap", label: "Cap the stop" },
            { value: "skip", label: "Skip the trade" },
          ]}
        />
        {spec.stopMaxMode !== "off" && (
          <InlineNum label="Max stop points" value={spec.stopMaxPoints} min={0} step={1} onChange={(stopMaxPoints) => patch({ stopMaxPoints })} />
        )}
      </p>

      <p className="lab-sentence">
        Target
        <InlineSelect
          label="Target type"
          value={spec.targetMode}
          onChange={(targetMode) => patch({ targetMode })}
          options={[
            { value: "r", label: "R multiple" },
            { value: "pct", label: "Percent" },
            { value: "points", label: "Points" },
            { value: "none", label: "None" },
          ]}
        />
        {spec.targetMode === "r" && (
          <>
            <InlineNum label="Target R" value={spec.targetR} min={0} step={0.5} onChange={(targetR) => patch({ targetR })} />
            R
          </>
        )}
        {spec.targetMode === "pct" && (
          <>
            <InlineNum label="Target percent" value={spec.targetPct} min={0} step={0.1} onChange={(targetPct) => patch({ targetPct })} />
            %
          </>
        )}
        {spec.targetMode === "points" && (
          <InlineNum label="Target points" value={spec.targetPoints} min={0} step={1} onChange={(targetPoints) => patch({ targetPoints })} />
        )}
      </p>

      <div className="lab-grid">
        <Field label="Trailing stop">
          <select value={spec.trailMode} onChange={(e) => patch({ trailMode: e.target.value as LabSpec["trailMode"] })}>
            <option value="off">Off</option>
            <option value="points">Points</option>
            <option value="atr">ATR</option>
          </select>
        </Field>
        {spec.trailMode === "points" && (
          <Field label="Trail points">
            <input type="number" min={0} step={1} value={spec.trailPoints} onChange={(e) => patch({ trailPoints: Number(e.target.value) })} />
          </Field>
        )}
        {spec.trailMode === "atr" && (
          <>
            <Field label="Trail ATR length">
              <input type="number" min={1} value={spec.trailAtrLen} onChange={(e) => patch({ trailAtrLen: Number(e.target.value) })} />
            </Field>
            <Field label="Trail ATR multiple">
              <input type="number" min={0} step={0.1} value={spec.trailAtrMult} onChange={(e) => patch({ trailAtrMult: Number(e.target.value) })} />
            </Field>
          </>
        )}
        <Field label="Breakeven after">
          <input
            type="number"
            min={0}
            step={0.5}
            value={spec.beAfterR}
            onChange={(e) => patch({ beAfterR: Number(e.target.value) })}
          />
        </Field>
        <Field label="Time stop, bars">
          <input
            type="number"
            min={0}
            value={spec.timeStopBars}
            onChange={(e) => patch({ timeStopBars: Number(e.target.value) })}
          />
        </Field>
      </div>
      <p className="lab-note">Breakeven and the time stop use 0 as off. The trail updates after the candle closes.</p>

      <div className="lab-order">
        <Toggle on={spec.partialOn} label="Partial profit booking" onChange={(partialOn) => patch({ partialOn })}>
          {spec.targetMode === "none" ? (
            <p className="lab-note">A partial needs a target. This one is off while the target is none.</p>
          ) : (
            <p className="lab-sentence">
              Book
              <InlineNum label="Partial size percent" value={spec.partialQtyPct} min={1} max={99} onChange={(partialQtyPct) => patch({ partialQtyPct })} />
              % of the position once price has travelled
              <InlineNum label="Partial trigger percent" value={spec.partialAtPct} min={0} onChange={(partialAtPct) => patch({ partialAtPct })} />
              % of the way. Then move the stop to
              <InlineNum label="Stop lock percent" value={spec.stopLockPct} min={0} onChange={(stopLockPct) => patch({ stopLockPct })} />
              % of the way.
            </p>
          )}
        </Toggle>
      </div>
    </Section>
  );
}

function FilterCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const short = spec.side === "short";
  const flipBelow = 100 - spec.rsiLongAbove;
  return (
    <Section
      title="Extra conditions and cancel"
      hint="The RSI filter blocks the fill until it is true, and the order stays live. The cancel rule deletes the setup if the averages cross back."
      extra={spec.useRsi ? "1 filter" : "0 filters"}
    >
      {spec.useRsi ? (
        <div className="lab-rule">
          RSI
          <InlineNum label="RSI length" value={spec.rsiPeriod} min={2} onChange={(rsiPeriod) => patch({ rsiPeriod })} />
          on Close is {short ? "below" : "above"}
          <InlineNum
            label={short ? "RSI short below" : "RSI long above"}
            value={short ? spec.rsiShortBelow : spec.rsiLongAbove}
            onChange={(n) => patch(short ? { rsiShortBelow: n } : { rsiLongAbove: n })}
          />
          {spec.side === "both" && spec.sellMode === "flip" && (
            <span className="lab-quiet">Short is below {Number.isFinite(flipBelow) ? Math.round(flipBelow * 100) / 100 : "—"}.</span>
          )}
          {spec.side === "both" && spec.sellMode === "own" && (
            <>
              <span>and short is below</span>
              <InlineNum label="RSI short below" value={spec.rsiShortBelow} onChange={(rsiShortBelow) => patch({ rsiShortBelow })} />
            </>
          )}
          <button type="button" className="lab-x" aria-label="Remove RSI filter" onClick={() => patch({ useRsi: false })}>×</button>
        </div>
      ) : (
        <button type="button" className="lab-add" onClick={() => patch({ useRsi: true })}>+ Extra condition</button>
      )}

      <p className="lab-kicker">Cancel the setup if any of these happen</p>
      {spec.cancelOnCross ? (
        <div className="lab-rule">
          EMA {spec.fast} crosses back through EMA {spec.slow}
          <button type="button" className="lab-x" aria-label="Remove cancel rule" onClick={() => patch({ cancelOnCross: false })}>×</button>
        </div>
      ) : (
        <button type="button" className="lab-add" onClick={() => patch({ cancelOnCross: true })}>+ Cancel rule</button>
      )}
    </Section>
  );
}

function SellCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const flipBelow = 100 - spec.rsiLongAbove;
  return (
    <Section
      title="Sell condition"
      hint="Opposite keeps one set of rules and flips them. Own RSI and stop changes only those two short numbers. A second free-form short script is not run."
      tone="short"
    >
      <div className="lab-dir" role="group" aria-label="Short rules">
        <button type="button" aria-pressed={spec.sellMode === "flip"} onClick={() => patch({ sellMode: "flip" })}>Opposite of buy</button>
        <button type="button" aria-pressed={spec.sellMode === "own"} onClick={() => patch({ sellMode: "own" })}>Own RSI and stop</button>
      </div>
      {spec.sellMode === "flip" ? (
        <p className="lab-note">
          Short crosses the other way, sells the retest low, and puts the stop beyond the retest high.
          {spec.useRsi ? ` RSI must be below ${Number.isFinite(flipBelow) ? Math.round(flipBelow * 100) / 100 : "—"}.` : " No RSI filter."}
        </p>
      ) : (
        <p className="lab-sentence">
          Short RSI below
          <InlineNum label="Short RSI below" value={spec.rsiShortBelow} onChange={(rsiShortBelow) => patch({ rsiShortBelow })} />
          and stop pad
          <InlineNum label="Short stop pad percent" value={spec.shortStopPadPct} min={0} step={0.05} onChange={(shortStopPadPct) => patch({ shortStopPadPct })} />
          %. The averages, pullback, target, and session stay shared.
        </p>
      )}
    </Section>
  );
}

function TimeCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const toggleList = (key: "blockedHours" | "skippedMonths" | "allowedDays", n: number) => {
    setList(spec, patch, key, n);
  };
  return (
    <Section
      title="Time and month"
      hint="Times are IST. They block new entries. An open trade stays open until the stop, the target, square-off, or the opposite signal."
      extra={spec.windowOn ? `${spec.windowFrom}–${spec.windowTo}` : "Any hour"}
    >
      <Toggle on={spec.windowOn} label="Trade only inside a window" onChange={(windowOn) => patch({ windowOn })}>
        <p className="lab-sentence">
          from
          <input className="lab-inline" aria-label="Window from" type="time" value={spec.windowFrom} onChange={(e) => patch({ windowFrom: e.target.value })} />
          to
          <input className="lab-inline" aria-label="Window to" type="time" value={spec.windowTo} onChange={(e) => patch({ windowTo: e.target.value })} />
          <label className="lab-check">
            <input type="checkbox" checked={spec.nextDayAllowed} onChange={(e) => patch({ nextDayAllowed: e.target.checked })} />
            next day allowed
          </label>
        </p>
      </Toggle>
      <Toggle on={spec.blockHoursOn} label="Don't trade these hours" onChange={(blockHoursOn) => patch({ blockHoursOn })}>
        <GridPick
          label="Blocked hours"
          tone="block"
          selected={spec.blockedHours}
          onToggle={(n) => toggleList("blockedHours", n)}
          items={Array.from({ length: 24 }, (_, id) => ({ id, label: String(id).padStart(2, "0") }))}
        />
      </Toggle>
      <Toggle on={spec.skipMonthsOn} label="Don't trade these months" onChange={(skipMonthsOn) => patch({ skipMonthsOn })}>
        <GridPick
          label="Skipped months"
          tone="block"
          selected={spec.skippedMonths}
          onToggle={(n) => toggleList("skippedMonths", n)}
          items={MONTHS.map((label, index) => ({ id: index + 1, label }))}
        />
      </Toggle>
      <Toggle on={spec.weekdaysOnly} label="Weekdays only" onChange={(weekdaysOnly) => patch({ weekdaysOnly })}>
        <GridPick
          label="Allowed days"
          tone="allow"
          selected={spec.allowedDays}
          onToggle={(n) => toggleList("allowedDays", n)}
          items={DAYS.map((label, id) => ({ id, label }))}
        />
      </Toggle>
    </Section>
  );
}

function SessionCard({ spec, patch }: { spec: LabSpec; patch: Patch }) {
  const levOptions = LEVERAGE.includes(spec.leverage) ? LEVERAGE : [spec.leverage, ...LEVERAGE];
  return (
    <Section
      title="Session, size and costs"
      hint="GST applies to the percent brokerage. The flat per-order amount is extra. Slippage worsens every fill. Quantity is cut if it needs more than capital × leverage."
      extra={spec.squareOff ? `off ${spec.squareOff}` : "carry overnight"}
    >
      <div className="lab-grid">
        <ClockField label="No entry before" value={spec.noEntryBefore} onChange={(noEntryBefore) => patch({ noEntryBefore })} />
        <ClockField label="No entry after" value={spec.noEntryAfter} onChange={(noEntryAfter) => patch({ noEntryAfter })} />
        <ClockField label="Square-off" value={spec.squareOff} onChange={(squareOff) => patch({ squareOff })} />
        <Field label="Max trades / day">
          <input type="number" min={1} value={spec.maxTradesDay} onChange={(e) => patch({ maxTradesDay: Number(e.target.value) })} />
        </Field>
        <Field label="While a trade is open">
          <select value={spec.reverse ? "reverse" : "one"} onChange={(e) => patch({ reverse: e.target.value === "reverse" })}>
            <option value="reverse">Opposite setup closes it and reverses</option>
            <option value="one">One trade at a time</option>
          </select>
        </Field>
        <Field label="Day starts (IST)">
          <select value={spec.dayStart} onChange={(e) => patch({ dayStart: e.target.value as LabSpec["dayStart"] })}>
            <option value="00:00">00:00 midnight</option>
            <option value="05:30">05:30</option>
          </select>
        </Field>
        <Field label="Re-entry after a stop">
          <select value={spec.reentry} onChange={(e) => patch({ reentry: e.target.value as LabSpec["reentry"] })}>
            <option value="off">Off — wait for a new setup</option>
            <option value="same">Same order, until it expires</option>
          </select>
        </Field>
        <Field label="Size by">
          <select value={spec.sizeMode} onChange={(e) => patch({ sizeMode: e.target.value as LabSpec["sizeMode"] })}>
            <option value="lots">Lots</option>
            <option value="risk">Risk %</option>
            <option value="capitalPct">% of capital</option>
            <option value="fixed">Fixed quantity</option>
          </select>
        </Field>
        <Field label="Capital $">
          <input type="number" min={0} step={100} value={spec.capital} onChange={(e) => patch({ capital: Number(e.target.value) })} />
        </Field>
        {spec.sizeMode === "lots" && (
          <>
            <Field label="Lots">
              <input type="number" min={0} step={1} value={spec.lots} onChange={(e) => patch({ lots: Number(e.target.value) })} />
            </Field>
            <Field label="Lot size">
              <input type="number" min={0} step={0.001} value={spec.lotSize} onChange={(e) => patch({ lotSize: Number(e.target.value) })} />
            </Field>
          </>
        )}
        {spec.sizeMode === "risk" && (
          <Field label="Risk %">
            <input type="number" min={0} step={0.1} value={spec.riskPct} onChange={(e) => patch({ riskPct: Number(e.target.value) })} />
          </Field>
        )}
        {spec.sizeMode === "capitalPct" && (
          <Field label="% of capital">
            <input type="number" min={0} step={1} value={spec.capitalPct} onChange={(e) => patch({ capitalPct: Number(e.target.value) })} />
          </Field>
        )}
        {spec.sizeMode === "fixed" && (
          <Field label="Quantity">
            <input type="number" min={0} step={0.001} value={spec.fixedQty} onChange={(e) => patch({ fixedQty: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Leverage">
          <select value={spec.leverage} onChange={(e) => patch({ leverage: Number(e.target.value) })}>
            {levOptions.map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        </Field>
        <Field label="Brokerage % / side">
          <input type="number" min={0} step={0.01} value={spec.feePct} onChange={(e) => patch({ feePct: Number(e.target.value) })} />
        </Field>
        <Field label="GST on brokerage %">
          <input type="number" min={0} step={1} value={spec.gstPct} onChange={(e) => patch({ gstPct: Number(e.target.value) })} />
        </Field>
        <Field label="$ per order">
          <input type="number" min={0} step={0.1} value={spec.feePerOrder} onChange={(e) => patch({ feePerOrder: Number(e.target.value) })} />
        </Field>
        <Field label="Slippage %">
          <input type="number" min={0} step={0.01} value={spec.slipPct} onChange={(e) => patch({ slipPct: Number(e.target.value) })} />
        </Field>
        <Field label="Assumed funding bps / 8h">
          <input type="number" min={0} step={0.1} value={spec.fundingBps8h} onChange={(e) => patch({ fundingBps8h: Number(e.target.value) })} />
        </Field>
      </div>
      <p className="lab-note">
        Same candle, stop and target: counted as the stop. A candle does not say which wick came first.
        {spec.sizeMode === "lots" ? ` ${trim(spec.lots)} lots × ${trim(spec.lotSize)} = ${trim(spec.lots * spec.lotSize)}.` : ""}
        {" "}Funding stays 0 unless you type a rate.
      </p>
    </Section>
  );
}

function Results({
  report,
  books,
  spec,
  resultRef,
}: {
  report: LabReport;
  books: LoadedBook[];
  spec: LabSpec;
  resultRef: RefObject<HTMLElement | null>;
}) {
  const [symbol, setSymbol] = useState(() => books.some((book) => book.symbol === spec.symbol) ? spec.symbol : (books[0]?.symbol ?? spec.symbol));
  const [focusN, setFocusN] = useState<number | null>(null);
  const book = books.find((item) => item.symbol === symbol) ?? books[0];
  const focus = report.trades.find((trade) => trade.n === focusN) ?? null;
  const chartTrades = report.trades.filter((trade) => trade.symbol === book?.symbol);
  const chartMarks = report.marks.filter((mark) => mark.symbol === book?.symbol);
  const bits = [
    `${fmtTime(report.from)} → ${fmtTime(report.to)}`,
    `${report.setups} setups`,
    `${report.expired} expired`,
    report.rsiBlocked ? `${report.rsiBlocked} RSI blocks` : "",
    report.cancelled ? `${report.cancelled} cancelled` : "",
    report.skipped ? `${report.skipped} stop or size blocks` : "",
    report.andBlocked ? `${report.andBlocked} AND blocks` : "",
  ].filter(Boolean);
  return (
    <section className="lab-card" ref={resultRef} id="lab-result">
      <h2>Result</h2>
      <p className="lab-stability" data-exam={report.stability.exam}>{report.stability.headline}</p>
      <p className="lab-note">{bits.join(" · ")}</p>
      {report.bySymbol.length > 0 && (
        <div className="lab-folds">
          {report.bySymbol.map((row) => (
            <div key={row.symbol}>
              <span>{row.symbol.replace(/USDT$/, "USD")}</span>
              <strong className={row.net >= 0 ? "up" : "down"}>{money(row.net)}</strong>
              <em>{row.trades} trades</em>
            </div>
          ))}
        </div>
      )}
      <div className="lab-buckets">
        <BucketView bucket={report.practice} />
        <BucketView bucket={report.finalTest} />
      </div>
      <div className="lab-folds">
        {report.folds.map((fold) => (
          <div key={fold.label}>
            <span>{fold.label}</span>
            <strong className={fold.net >= 0 ? "up" : "down"}>{money(fold.net)}</strong>
            <em>{fold.trades} trades</em>
          </div>
        ))}
      </div>
      {book && book.candles.length > 0 && (
        <>
          {books.length > 1 && (
            <div className="lab-chart-bar">
              <Chips
                label="Chart symbol"
                value={book.symbol}
                onChange={setSymbol}
                options={books.map((item) => ({ value: item.symbol, label: item.symbol.replace(/USDT$/, "USD") }))}
              />
            </div>
          )}
          <LabChart candles={book.candles} trades={chartTrades} marks={chartMarks} spec={spec} focus={focus} />
        </>
      )}
      <ul className="lab-notes">
        {report.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <h3 className="lab-subhead">Trades</h3>
      {report.trades.length === 0 ? (
        <p className="lab-note">No fill. The cross, the pullback, and the break did not line up inside this window.</p>
      ) : (
        <div className="lab-table-wrap">
          <table className="lab-table">
            <thead>
              <tr>
                <th>#</th><th>Coin</th><th>Side</th><th>Entry</th><th>Exit</th><th>Entry px</th><th>Stop</th><th>Target</th><th>Exit px</th><th>Qty</th><th>Why</th><th>P&L</th><th>R</th><th></th>
              </tr>
            </thead>
            <tbody>
              {report.trades.map((trade) => (
                <tr
                  key={trade.n}
                  data-on={focusN === trade.n ? "1" : "0"}
                  onClick={() => {
                    setFocusN(trade.n);
                    setSymbol(trade.symbol);
                  }}
                >
                  <td>{trade.n}</td>
                  <td>{trade.symbol.replace(/USDT$/, "")}</td>
                  <td>{trade.side === "long" ? "L" : "S"}</td>
                  <td>{fmtTime(trade.entryTime)}</td>
                  <td>{fmtTime(trade.exitTime)}</td>
                  <td>{px(trade.entry)}</td>
                  <td>{px(trade.stop)}</td>
                  <td>{px(trade.target)}</td>
                  <td>{px(trade.exit)}</td>
                  <td>{trim(trade.qty)}</td>
                  <td>{trade.reason}</td>
                  <td className={trade.pnl >= 0 ? "up" : "down"}>{money(trade.pnl)}</td>
                  <td className={trade.r >= 0 ? "up" : "down"}>{trade.r.toFixed(2)}R</td>
                  <td>{trade.holdout ? "Final" : "Practice"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SavedList({ rows, onLoad, onDelete }: { rows: SavedLab[]; onLoad: (row: SavedLab) => void; onDelete: (id: string) => void }) {
  if (!rows.length) {
    return (
      <section className="lab-card">
        <h2>My tests</h2>
        <p className="lab-note">Save keeps the rules in this browser. Nothing is stored on the server.</p>
      </section>
    );
  }
  return (
    <ul className="lab-saved">
      {rows.map((row) => (
        <li key={row.id}>
          <div>
            <strong>{row.spec.name}</strong>
            <span>{row.spec.basket ? "BTC+ETH+SOL" : row.spec.symbol.replace(/USDT$/, "USD")} · {row.spec.timeframe} · {row.spec.side}</span>
            <em>{fmtSaved(row.savedAt)}</em>
          </div>
          <button type="button" className="lab-ghost lab-ghost-sm" onClick={() => onLoad(row)}>Load</button>
          <button type="button" className="lab-ghost lab-ghost-sm" onClick={() => onDelete(row.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}

function Rows({ rows }: { rows: StrategyRow[] }) {
  return (
    <dl className="lab-rows">
      {rows.map((row) => (
        <div key={row.k}>
          <dt>{row.k}</dt>
          <dd>{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, hint, extra, tone, children }: { title: string; hint: string; extra?: string; tone?: "short"; children: ReactNode }) {
  return (
    <section className="lab-card" data-tone={tone}>
      <header className="lab-sec-h">
        <h2>{title}</h2>
        <details className="lab-hint">
          <summary aria-label={`About ${title}`}>i</summary>
          <p>{hint}</p>
        </details>
        {extra ? <span className="lab-sec-extra">{extra}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Toggle({ on, label, onChange, children }: { on: boolean; label: string; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className="lab-toggle">
      <label className="lab-switch">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span />
        {label}
      </label>
      {on ? children : null}
    </div>
  );
}

function Chips({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; disabled?: boolean }[]; onChange: (value: string) => void }) {
  return (
    <div className="lab-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={!option.disabled && value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="lab-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function InlineNum({ label, value, onChange, step = 1, min, max, width = 76 }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; width?: number }) {
  return (
    <input
      className="lab-inline"
      aria-label={label}
      type="number"
      step={step}
      min={min}
      max={max}
      style={{ width }}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function InlineSelect<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className="lab-inline" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function ClockField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <span className="lab-clock">
        <input type="time" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => onChange("")} disabled={!value}>Off</button>
      </span>
    </Field>
  );
}

function GridPick({ label, items, selected, onToggle, tone }: { label: string; items: { id: number; label: string }[]; selected: number[]; onToggle: (id: number) => void; tone: "block" | "allow" }) {
  return (
    <div className="lab-hours" role="group" aria-label={label} data-tone={tone}>
      {items.map((item) => (
        <button key={item.id} type="button" aria-pressed={selected.includes(item.id)} onClick={() => onToggle(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function BucketView({ bucket }: { bucket: Bucket }) {
  return (
    <div className="lab-bucket">
      <span>{bucket.label}</span>
      <strong className={bucket.net >= 0 ? "up" : "down"}>{money(bucket.net)}</strong>
      <em>
        {bucket.trades} trades
        {bucket.winRate != null ? ` · ${bucket.winRate.toFixed(0)}% win` : ""}
        {bucket.avgR != null ? ` · ${bucket.avgR.toFixed(2)}R` : ""}
        {bucket.profitFactor != null ? ` · PF ${bucket.profitFactor.toFixed(2)}` : ""}
        {` · DD ${money(bucket.maxDd)}`}
      </em>
    </div>
  );
}

function setList(spec: LabSpec, patch: Patch, key: "blockedHours" | "skippedMonths" | "allowedDays", n: number) {
  const current = spec[key];
  const next = current.includes(n) ? current.filter((item) => item !== n) : [...current, n];
  patch({ [key]: next });
}

function rank(bucket: Bucket): number {
  if (bucket.trades < 5) return -1;
  if (bucket.profitFactor == null) return bucket.net > 0 ? 1000 : 0;
  return bucket.profitFactor;
}

function symbolValue(spec: LabSpec): string {
  if (!spec.basket) return spec.symbol;
  return (BASKET_SYMBOLS as readonly string[]).includes(spec.symbol) ? spec.symbol : BASKET_SYMBOLS[0];
}

function samePatch(spec: LabSpec, patch: Partial<LabSpec>): boolean {
  return Object.entries(patch).every(([key, value]) => spec[key as keyof LabSpec] === value);
}

function money(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function px(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}

function trim(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 1e8) / 1e8);
}

function fmtTime(ms: number): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function fmtSaved(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}
