"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  GitBranch,
  Info,
  LayoutDashboard,
  LineChart,
  Plus,
  Rocket,
  Save,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { fetchCandles, symbolLabel, type Candle } from "@/lib/cryptoApi";
import {
  COMPARE_OPTIONS,
  EXCHANGES,
  INDICATOR_OPTIONS,
  INTERVAL_CHIPS,
  OPERATOR_OPTIONS,
  availableCoins,
  createBlankStrategy,
  evaluateStrategyLive,
  getCustomStrategy,
  newCondition,
  newGroup,
  riskRewardRatio,
  saveCustomStrategy,
  setCustomStrategyStatus,
  summarizeStrategy,
  validateStrategy,
  type BuilderView,
  type Condition,
  type ConditionGroup,
  type CustomStrategy,
  type IndicatorId,
} from "@/lib/strategyBuilder";

const CandleChart = dynamic(() => import("@/components/trade/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-[320px] shimmer rounded-xl" />,
});

interface Props {
  /** Edit existing — nahi to blank. */
  strategyId?: string | null;
  defaultSymbol?: string;
  onBack: () => void;
  onSaved?: (s: CustomStrategy) => void;
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; tone?: "green" | "red" | "neutral" }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={`sb-seg ${size === "sm" ? "sb-seg-sm" : ""}`} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-active={value === o.value}
          data-tone={o.tone ?? "neutral"}
          onClick={() => onChange(o.value)}
          className="sb-seg-btn"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="sb-toggle-row">
      <div className="min-w-0">
        <div className="sb-label">{label}</div>
        {hint && <div className="sb-hint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-on={checked}
        className="sb-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="sb-switch-knob" />
      </button>
    </label>
  );
}

function FieldLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div className="sb-label inline-flex items-center gap-1.5">
      {children}
      {tip && (
        <span title={tip} className="sb-info" aria-label={tip}>
          <Info className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

function RiskRail({ strategy }: { strategy: CustomStrategy }) {
  const tp = strategy.risk.takeProfit;
  const sl = strategy.risk.stopLoss;
  const tpPct = tp.enabled && tp.unit === "%" ? tp.value : tp.enabled ? 2.5 : 0;
  const slPct = sl.enabled && sl.unit === "%" ? sl.value : sl.enabled ? 1.2 : 0;
  const total = tpPct + slPct || 1;
  const slW = (slPct / total) * 100;
  const tpW = (tpPct / total) * 100;
  const rr = riskRewardRatio(strategy);

  return (
    <div className="sb-risk-rail">
      <div className="sb-risk-bar">
        <div className="sb-risk-sl" style={{ width: `${slW}%` }} />
        <div className="sb-risk-entry" />
        <div className="sb-risk-tp" style={{ width: `${tpW}%` }} />
      </div>
      <div className="sb-risk-labels">
        <span style={{ color: "var(--red)" }}>
          {sl.enabled ? `−${sl.value}${sl.unit === "atr" ? "×ATR" : sl.unit === "%" ? "%" : ` ${sl.unit}`}` : "No SL"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>Entry</span>
        <span style={{ color: "var(--green)" }}>
          {tp.enabled ? `+${tp.value}${tp.unit === "rr" ? ":1" : tp.unit === "%" ? "%" : ` ${tp.unit}`}` : "No TP"}
        </span>
      </div>
      {rr != null && (
        <div className="sb-hint mt-1.5">
          Risk : Reward ≈ <b className="tnum" style={{ color: "var(--text-primary)" }}>1 : {rr.toFixed(2)}</b>
        </div>
      )}
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const needsPeriod = condition.indicator !== "price" && condition.indicator !== "volume";

  return (
    <div className="sb-cond">
      <span className="sb-when">WHEN</span>
      <select
        className="trade-select sb-cond-select"
        value={condition.indicator}
        onChange={(e) => {
          const indicator = e.target.value as IndicatorId;
          const def = INDICATOR_OPTIONS.find((i) => i.value === indicator);
          onChange({ ...condition, indicator, period: def?.defaultPeriod ?? 14 });
        }}
      >
        {INDICATOR_OPTIONS.map((i) => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>
      {needsPeriod && (
        <input
          type="number"
          className="trade-input sb-cond-num"
          value={condition.period}
          min={1}
          max={500}
          onChange={(e) => onChange({ ...condition, period: Number(e.target.value) || 1 })}
          aria-label="Period"
        />
      )}
      <select
        className="trade-select sb-cond-select"
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as Condition["operator"] })}
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="trade-select sb-cond-select"
        value={condition.compareTo}
        onChange={(e) => onChange({ ...condition, compareTo: e.target.value as Condition["compareTo"] })}
      >
        {COMPARE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {condition.compareTo === "value" ? (
        <input
          type="number"
          className="trade-input sb-cond-num"
          value={condition.value}
          step="any"
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
          aria-label="Value"
        />
      ) : condition.compareTo === "ema" ? (
        <input
          type="number"
          className="trade-input sb-cond-num"
          value={condition.comparePeriod}
          min={1}
          onChange={(e) => onChange({ ...condition, comparePeriod: Number(e.target.value) || 21 })}
          aria-label="EMA period"
        />
      ) : null}
      {canRemove && (
        <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={onRemove} aria-label="Remove">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function FlowView({ strategy }: { strategy: CustomStrategy }) {
  const groups = strategy.signal.entryGroups;
  return (
    <div className="sb-flow">
      <div className="sb-flow-node sb-flow-market">
        <div className="sb-flow-kicker">MARKET</div>
        <div className="sb-flow-title">
          {strategy.market.direction.toUpperCase()} · {strategy.market.instrument}
        </div>
        <div className="sb-hint">
          {strategy.market.symbols.map(symbolLabel).join(", ") || "No coins"} · {strategy.market.interval} · {strategy.market.leverage}x
        </div>
      </div>
      <div className="sb-flow-arrow" />
      <div className="sb-flow-node sb-flow-signal">
        <div className="sb-flow-kicker">ENTRY</div>
        {groups.map((g, gi) => (
          <div key={g.id} className="sb-flow-group">
            {gi > 0 && <div className="sb-flow-or">OR</div>}
            {g.conditions.map((c, ci) => (
              <div key={c.id} className="sb-flow-cond">
                {ci > 0 && <span className="sb-flow-and">{g.join.toUpperCase()}</span>}
                <span>
                  {INDICATOR_OPTIONS.find((i) => i.value === c.indicator)?.label}{" "}
                  {c.indicator !== "price" && c.indicator !== "volume" ? c.period : ""}{" "}
                  {OPERATOR_OPTIONS.find((o) => o.value === c.operator)?.label}{" "}
                  {c.compareTo === "value" ? c.value : c.compareTo === "ema" ? `EMA ${c.comparePeriod}` : "price"}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sb-flow-arrow" />
      <div className="sb-flow-node sb-flow-risk">
        <div className="sb-flow-kicker">EXITS</div>
        <div className="sb-flow-title">
          {strategy.risk.takeProfit.enabled ? `TP ${strategy.risk.takeProfit.value}${strategy.risk.takeProfit.unit}` : "No TP"}
          {" · "}
          {strategy.risk.stopLoss.enabled ? `SL ${strategy.risk.stopLoss.value}${strategy.risk.stopLoss.unit}` : "No SL"}
        </div>
        <div className="sb-hint">
          {[
            strategy.risk.trailing && "Trailing",
            strategy.risk.timeStop && `Time ${strategy.risk.timeStopCandles}`,
            strategy.signal.exitOnReversal && "Reversal",
            strategy.signal.exitOnSignal && "Opposite signal",
          ]
            .filter(Boolean)
            .join(" · ") || "Only configured exits"}
        </div>
      </div>
    </div>
  );
}

export default function StrategyBuilder({ strategyId, defaultSymbol = "BTCUSDT", onBack, onSaved }: Props) {
  const [strategy, setStrategy] = useState<CustomStrategy>(() => {
    const blank = createBlankStrategy();
    blank.market.symbols = [defaultSymbol];
    return blank;
  });
  const [hydrated, setHydrated] = useState(!strategyId);
  const [view, setView] = useState<BuilderView>("cockpit");
  const [marketTab, setMarketTab] = useState<"instrument" | "session">("instrument");
  const [riskTab, setRiskTab] = useState<"exits" | "size">("exits");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [coinPicker, setCoinPicker] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!strategyId) {
      setHydrated(true);
      return;
    }
    const existing = getCustomStrategy(strategyId);
    if (existing) setStrategy(existing);
    setHydrated(true);
  }, [strategyId]);

  const issues = useMemo(() => validateStrategy(strategy), [strategy]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const summary = useMemo(() => summarizeStrategy(strategy), [strategy]);
  const live = useMemo(() => evaluateStrategyLive(strategy, candles), [strategy, candles]);
  const coins = availableCoins();

  const patch = useCallback((fn: (s: CustomStrategy) => CustomStrategy) => {
    setStrategy((prev) => fn(prev));
  }, []);

  useEffect(() => {
    const symbol = strategy.market.symbols[0] ?? defaultSymbol;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchCandles({
          symbol,
          interval: strategy.market.interval,
          limit: 400,
        });
        if (!cancelled) setCandles(res.success ? res.candles ?? [] : []);
      } catch {
        if (!cancelled) setCandles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strategy.market.symbols, strategy.market.interval, defaultSymbol]);

  const handleSave = (as: "draft" | "live" = "draft") => {
    if (as === "live" && errors.length) {
      setNotice("Deploy se pehle errors fix karo");
      return;
    }
    setSaving(true);
    try {
      const named = {
        ...strategy,
        name: strategy.name.trim() || "Untitled strategy",
        status: as === "live" ? ("live" as const) : strategy.status === "live" ? ("live" as const) : ("draft" as const),
      };
      const saved = saveCustomStrategy(named);
      if (as === "live") {
        setCustomStrategyStatus(saved.id, "live");
        setStrategy({ ...saved, status: "live" });
        setNotice("Strategy deploy ho gayi — My Strategies mein live dikhegi");
      } else {
        setStrategy(saved);
        setNotice("Draft save ho gaya");
      }
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = (gid: string, fn: (g: ConditionGroup) => ConditionGroup) => {
    patch((s) => ({
      ...s,
      signal: {
        ...s.signal,
        entryGroups: s.signal.entryGroups.map((g) => (g.id === gid ? fn(g) : g)),
      },
    }));
  };

  const toneColor =
    live.tone === "buy" ? "var(--green)" : live.tone === "sell" ? "var(--red)" : "var(--text-muted)";

  if (!hydrated) {
    return <div className="trade-panel h-48 shimmer" />;
  }

  return (
    <div className="sb-root space-y-4">
      {/* Header */}
      <div className="trade-panel sb-header">
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" onClick={onBack} className="trade-iconbtn mt-1" aria-label="Back">
            <ArrowLeft className="w-[17px] h-[17px]" />
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            <input
              className="sb-name"
              placeholder="Name your strategy"
              value={strategy.name}
              onChange={(e) => patch((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              className="sb-desc"
              placeholder="Optional short description"
              value={strategy.description}
              onChange={(e) => patch((s) => ({ ...s, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {errors.length > 0 && (
              <span className="trade-badge trade-badge-red">{errors.length} to fix</span>
            )}
            {warnings.length > 0 && (
              <span className="trade-badge trade-badge-amber">{warnings.length} warning{warnings.length > 1 ? "s" : ""}</span>
            )}
            {errors.length === 0 && warnings.length === 0 && (
              <span className="trade-badge trade-badge-green inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> Ready
              </span>
            )}
            <div className="sb-view-toggle">
              {(
                [
                  { id: "cockpit" as const, label: "Cockpit", icon: LayoutDashboard },
                  { id: "flow" as const, label: "Flow", icon: GitBranch },
                  { id: "chart" as const, label: "Chart", icon: LineChart },
                ] as const
              ).map((v) => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    data-active={view === v.id}
                    className="sb-view-btn"
                    onClick={() => setView(v.id)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {v.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="trade-btn trade-btn-ghost"
              disabled={saving}
              onClick={() => handleSave("draft")}
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-primary"
              disabled={saving}
              onClick={() => handleSave("live")}
            >
              <Rocket className="w-4 h-4" />
              Deploy
            </button>
          </div>
        </div>

        <p className="sb-summary">{summary}</p>

        {(errors.length > 0 || warnings.length > 0) && (
          <div className="sb-issues">
            {issues.map((iss, i) => (
              <div key={`${iss.field}-${i}`} className="sb-issue" data-level={iss.level}>
                <AlertTriangle className="w-3.5 h-3.5 flex-none" />
                {iss.message}
              </div>
            ))}
          </div>
        )}

        {notice && (
          <div className="sb-notice">
            <Zap className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1">{notice}</span>
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setNotice(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {view === "flow" && (
        <div className="trade-panel p-5">
          <FlowView strategy={strategy} />
        </div>
      )}

      {view === "chart" && (
        <div className="trade-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--tr-line-soft)" }}>
            <div>
              <div className="text-[13px] font-bold">{symbolLabel(strategy.market.symbols[0] ?? defaultSymbol)} · {strategy.market.interval}</div>
              <div className="text-[12px] mt-0.5" style={{ color: toneColor }}>{live.headline} — {live.detail}</div>
            </div>
            <div className="flex gap-3">
              {live.readouts.map((r) => (
                <div key={r.label} className="text-right">
                  <div className="trade-stat-label">{r.label}</div>
                  <div className="text-[13px] font-bold tnum" style={{ color: r.color }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="trade-chart-wrap" style={{ height: 380 }}>
            <CandleChart
              candles={candles}
              symbol={symbolLabel(strategy.market.symbols[0] ?? defaultSymbol)}
              interval={strategy.market.interval}
              showEma9
              showEma21
              showEma50
            />
          </div>
        </div>
      )}

      {view === "cockpit" && (
        <div className="sb-grid">
          {/* ── MARKET ─────────────────────────────────── */}
          <section className="trade-panel sb-col">
            <div className="sb-col-head">
              <div>
                <div className="sb-col-kicker">Market</div>
                <div className="sb-col-title">What to trade</div>
              </div>
              <div className="sb-mini-tabs">
                <button type="button" data-active={marketTab === "instrument"} onClick={() => setMarketTab("instrument")}>Instrument</button>
                <button type="button" data-active={marketTab === "session"} onClick={() => setMarketTab("session")}>Session</button>
              </div>
            </div>
            <div className="sb-col-body space-y-4">
              {marketTab === "instrument" ? (
                <>
                  <div>
                    <FieldLabel tip="Perpetual futures ya options">Type</FieldLabel>
                    <Seg
                      value={strategy.market.instrument}
                      onChange={(instrument) => patch((s) => ({ ...s, market: { ...s.market, instrument } }))}
                      options={[
                        { value: "perps", label: "Perps" },
                        { value: "options", label: "Options" },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>Exchange</FieldLabel>
                    <select
                      className="trade-select w-full"
                      value={strategy.market.exchange}
                      onChange={(e) => patch((s) => ({ ...s, market: { ...s.market, exchange: e.target.value } }))}
                    >
                      {EXCHANGES.map((ex) => (
                        <option key={ex} value={ex}>{ex}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel tip="Strategy in coins par chalegi">Coins</FieldLabel>
                    <div className="sb-coins">
                      {strategy.market.symbols.map((sym) => (
                        <span key={sym} className="sb-coin-chip">
                          {symbolLabel(sym)}
                          <button
                            type="button"
                            aria-label={`Remove ${sym}`}
                            onClick={() =>
                              patch((s) => ({
                                ...s,
                                market: { ...s.market, symbols: s.market.symbols.filter((x) => x !== sym) },
                              }))
                            }
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button type="button" className="sb-add-coin" onClick={() => setCoinPicker((v) => !v)}>
                        <Plus className="w-3.5 h-3.5" /> Add coins
                      </button>
                    </div>
                    {coinPicker && (
                      <div className="sb-coin-picker">
                        {coins.map((c) => {
                          const on = strategy.market.symbols.includes(c.value);
                          return (
                            <button
                              key={c.value}
                              type="button"
                              data-on={on}
                              className="sb-coin-opt"
                              onClick={() =>
                                patch((s) => {
                                  const has = s.market.symbols.includes(c.value);
                                  return {
                                    ...s,
                                    market: {
                                      ...s.market,
                                      symbols: has
                                        ? s.market.symbols.filter((x) => x !== c.value)
                                        : [...s.market.symbols, c.value],
                                    },
                                  };
                                })
                              }
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <FieldLabel>Direction</FieldLabel>
                    <Seg
                      value={strategy.market.direction}
                      onChange={(direction) => patch((s) => ({ ...s, market: { ...s.market, direction } }))}
                      options={[
                        { value: "long", label: "Long", tone: "green" },
                        { value: "short", label: "Short", tone: "red" },
                        { value: "both", label: "Both" },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel tip="Isolated = risk sirf is position tak">Margin</FieldLabel>
                    <div className="flex gap-2 items-center">
                      <Seg
                        value={strategy.market.margin}
                        onChange={(margin) => patch((s) => ({ ...s, market: { ...s.market, margin } }))}
                        options={[
                          { value: "isolated", label: "Isolated" },
                          { value: "cross", label: "Cross" },
                        ]}
                      />
                      <div className="sb-lev">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="trade-input"
                          value={strategy.market.leverage}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              market: { ...s.market, leverage: Math.min(100, Math.max(1, Number(e.target.value) || 1)) },
                            }))
                          }
                        />
                        <span>x</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <FieldLabel tip="Candle timeframe jisse signals evaluate honge">Interval</FieldLabel>
                    <div className="sb-interval">
                      {INTERVAL_CHIPS.map((iv) => (
                        <button
                          key={iv}
                          type="button"
                          data-active={strategy.market.interval === iv}
                          onClick={() => patch((s) => ({ ...s, market: { ...s.market, interval: iv } }))}
                        >
                          {iv.endsWith("m") ? iv : iv.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle
                    checked={strategy.market.run247}
                    onChange={(run247) => patch((s) => ({ ...s, market: { ...s.market, run247 } }))}
                    label="Run 24/7"
                    hint="Band karne par sirf session hours mein trade"
                  />
                </>
              )}
            </div>
          </section>

          {/* ── SIGNAL ─────────────────────────────────── */}
          <section className="trade-panel sb-col">
            <div className="sb-col-head">
              <div>
                <div className="sb-col-kicker">Signal</div>
                <div className="sb-col-title">Entry & exit</div>
              </div>
            </div>
            <div className="sb-col-body space-y-4">
              <div>
                <FieldLabel>Entry trigger</FieldLabel>
                <Seg
                  value={strategy.signal.triggerType}
                  onChange={(triggerType) => patch((s) => ({ ...s, signal: { ...s.signal, triggerType } }))}
                  options={[
                    { value: "indicator", label: "Indicator" },
                    { value: "time", label: "Time" },
                  ]}
                />
              </div>

              {strategy.signal.triggerType === "time" ? (
                <div>
                  <FieldLabel tip="UTC time jab position open hogi">Entry time (UTC)</FieldLabel>
                  <input
                    type="time"
                    className="trade-input w-full"
                    value={strategy.signal.entryTime ?? "09:30"}
                    onChange={(e) => patch((s) => ({ ...s, signal: { ...s.signal, entryTime: e.target.value } }))}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {strategy.signal.entryGroups.map((g, gi) => (
                    <div key={g.id} className="sb-group">
                      {gi > 0 && <div className="sb-or-badge">OR</div>}
                      <div className="flex items-center justify-between mb-2">
                        <span className="sb-hint">Group · conditions {g.join.toUpperCase()}</span>
                        <div className="flex gap-1">
                          <Seg
                            size="sm"
                            value={g.join}
                            onChange={(join) => updateGroup(g.id, (gr) => ({ ...gr, join }))}
                            options={[
                              { value: "and", label: "AND" },
                              { value: "or", label: "OR" },
                            ]}
                          />
                          {strategy.signal.entryGroups.length > 1 && (
                            <button
                              type="button"
                              className="trade-iconbtn trade-iconbtn-sm"
                              onClick={() =>
                                patch((s) => ({
                                  ...s,
                                  signal: {
                                    ...s.signal,
                                    entryGroups: s.signal.entryGroups.filter((x) => x.id !== g.id),
                                  },
                                }))
                              }
                              aria-label="Remove group"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {g.conditions.map((c) => (
                          <ConditionRow
                            key={c.id}
                            condition={c}
                            canRemove={g.conditions.length > 1}
                            onChange={(next) =>
                              updateGroup(g.id, (gr) => ({
                                ...gr,
                                conditions: gr.conditions.map((x) => (x.id === c.id ? next : x)),
                              }))
                            }
                            onRemove={() =>
                              updateGroup(g.id, (gr) => ({
                                ...gr,
                                conditions: gr.conditions.filter((x) => x.id !== c.id),
                              }))
                            }
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="sb-link-btn mt-2"
                        onClick={() => updateGroup(g.id, (gr) => ({ ...gr, conditions: [...gr.conditions, newCondition()] }))}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add condition
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="sb-link-btn"
                    onClick={() =>
                      patch((s) => ({
                        ...s,
                        signal: { ...s.signal, entryGroups: [...s.signal.entryGroups, newGroup()] },
                      }))
                    }
                  >
                    <Plus className="w-3.5 h-3.5" /> Add group (OR)
                  </button>
                </div>
              )}

              <div className="sb-divider" />
              <div>
                <div className="sb-label mb-2">Exit signal</div>
                <div className="space-y-2">
                  <Toggle
                    checked={strategy.signal.exitOnSignal}
                    onChange={(exitOnSignal) => patch((s) => ({ ...s, signal: { ...s.signal, exitOnSignal } }))}
                    label="On opposite signal"
                    hint="Entry conditions reverse hone par band"
                  />
                  <Toggle
                    checked={strategy.signal.exitOnReversal}
                    onChange={(exitOnReversal) => patch((s) => ({ ...s, signal: { ...s.signal, exitOnReversal } }))}
                    label="On reversal"
                    hint="Indicator cross reverse direction"
                  />
                </div>
              </div>

              {/* Live pulse */}
              <div className="sb-live" style={{ ["--live-tone" as string]: toneColor }}>
                <div className="sb-live-head">
                  <span className="sb-col-kicker">Live pulse</span>
                  <span className="sb-live-tone">{live.headline}</span>
                </div>
                <p className="sb-hint mt-1">{live.detail}</p>
                <div className="sb-live-reads">
                  {live.readouts.map((r) => (
                    <div key={r.label}>
                      <div className="trade-stat-label">{r.label}</div>
                      <div className="text-[13px] font-bold tnum" style={{ color: r.color }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── RISK ───────────────────────────────────── */}
          <section className="trade-panel sb-col">
            <div className="sb-col-head">
              <div>
                <div className="sb-col-kicker">Risk & size</div>
                <div className="sb-col-title">Protection & limits</div>
              </div>
              <div className="sb-mini-tabs">
                <button type="button" data-active={riskTab === "exits"} onClick={() => setRiskTab("exits")}>Exits</button>
                <button type="button" data-active={riskTab === "size"} onClick={() => setRiskTab("size")}>Size</button>
              </div>
            </div>
            <div className="sb-col-body space-y-4">
              {riskTab === "exits" ? (
                <>
                  <RiskRail strategy={strategy} />

                  <div className="sb-exit-block">
                    <Toggle
                      checked={strategy.risk.takeProfit.enabled}
                      onChange={(enabled) =>
                        patch((s) => ({ ...s, risk: { ...s.risk, takeProfit: { ...s.risk.takeProfit, enabled } } }))
                      }
                      label="Take profit"
                    />
                    {strategy.risk.takeProfit.enabled && (
                      <div className="sb-exit-inputs">
                        <input
                          type="number"
                          step="0.1"
                          className="trade-input"
                          value={strategy.risk.takeProfit.value}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              risk: {
                                ...s.risk,
                                takeProfit: { ...s.risk.takeProfit, value: Number(e.target.value) || 0 },
                              },
                            }))
                          }
                        />
                        <Seg
                          size="sm"
                          value={strategy.risk.takeProfit.unit}
                          onChange={(unit) =>
                            patch((s) => ({
                              ...s,
                              risk: { ...s.risk, takeProfit: { ...s.risk.takeProfit, unit } },
                            }))
                          }
                          options={[
                            { value: "%", label: "%" },
                            { value: "pts", label: "Pts" },
                            { value: "price", label: "Price" },
                            { value: "rr", label: "R:R" },
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  <div className="sb-exit-block">
                    <Toggle
                      checked={strategy.risk.stopLoss.enabled}
                      onChange={(enabled) =>
                        patch((s) => ({ ...s, risk: { ...s.risk, stopLoss: { ...s.risk.stopLoss, enabled } } }))
                      }
                      label="Stop loss"
                    />
                    {strategy.risk.stopLoss.enabled && (
                      <div className="sb-exit-inputs">
                        <input
                          type="number"
                          step="0.1"
                          className="trade-input"
                          value={strategy.risk.stopLoss.value}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              risk: {
                                ...s.risk,
                                stopLoss: { ...s.risk.stopLoss, value: Number(e.target.value) || 0 },
                              },
                            }))
                          }
                        />
                        <Seg
                          size="sm"
                          value={strategy.risk.stopLoss.unit}
                          onChange={(unit) =>
                            patch((s) => ({
                              ...s,
                              risk: { ...s.risk, stopLoss: { ...s.risk.stopLoss, unit } },
                            }))
                          }
                          options={[
                            { value: "%", label: "%" },
                            { value: "atr", label: "ATR" },
                            { value: "pts", label: "Pts" },
                            { value: "price", label: "Price" },
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  <Toggle
                    checked={strategy.risk.trailing}
                    onChange={(trailing) => patch((s) => ({ ...s, risk: { ...s.risk, trailing } }))}
                    label="Trailing stop"
                    hint={strategy.risk.trailing ? `${strategy.risk.trailingPct}% trail` : "Peak se peeche move"}
                  />
                  {strategy.risk.trailing && (
                    <input
                      type="number"
                      step="0.1"
                      className="trade-input w-full"
                      value={strategy.risk.trailingPct}
                      onChange={(e) =>
                        patch((s) => ({ ...s, risk: { ...s.risk, trailingPct: Number(e.target.value) || 0 } }))
                      }
                    />
                  )}

                  <Toggle
                    checked={strategy.risk.timeStop}
                    onChange={(timeStop) => patch((s) => ({ ...s, risk: { ...s.risk, timeStop } }))}
                    label="Time stop"
                    hint="N candles baad force exit"
                  />
                  {strategy.risk.timeStop && (
                    <input
                      type="number"
                      className="trade-input w-full"
                      value={strategy.risk.timeStopCandles}
                      min={1}
                      onChange={(e) =>
                        patch((s) => ({
                          ...s,
                          risk: { ...s.risk, timeStopCandles: Number(e.target.value) || 1 },
                        }))
                      }
                    />
                  )}

                  <label className="sb-check">
                    <input
                      type="checkbox"
                      checked={strategy.risk.liveSafety}
                      onChange={(e) => patch((s) => ({ ...s, risk: { ...s.risk, liveSafety: e.target.checked } }))}
                    />
                    <span>
                      Live safety — exchange par hard stop place karo
                      {!strategy.risk.liveSafety && (
                        <span className="block text-[11px]" style={{ color: "var(--amber)" }}>
                          Warning: bina protective stop ke chalega
                        </span>
                      )}
                    </span>
                  </label>

                  <button type="button" className="sb-link-btn" onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? "Hide" : "Show"} advanced limits
                  </button>
                  {showAdvanced && (
                    <div className="space-y-3 pt-1">
                      <div>
                        <FieldLabel>Max daily loss %</FieldLabel>
                        <input
                          type="number"
                          className="trade-input w-full"
                          value={strategy.risk.maxDailyLossPct}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              risk: { ...s.risk, maxDailyLossPct: Number(e.target.value) || 0 },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel>Max open positions</FieldLabel>
                        <input
                          type="number"
                          className="trade-input w-full"
                          value={strategy.risk.maxOpenPositions}
                          min={1}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              risk: { ...s.risk, maxOpenPositions: Number(e.target.value) || 1 },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <FieldLabel tip="Har trade ka notional size (USDT)">Position size (USDT)</FieldLabel>
                  <input
                    type="number"
                    className="trade-input w-full"
                    value={strategy.risk.positionSizeUsd}
                    min={1}
                    onChange={(e) =>
                      patch((s) => ({
                        ...s,
                        risk: { ...s.risk, positionSizeUsd: Number(e.target.value) || 1 },
                      }))
                    }
                  />
                  <p className="sb-hint mt-2">
                    Approx margin @ {strategy.market.leverage}x ≈{" "}
                    <b className="tnum" style={{ color: "var(--text-primary)" }}>
                      ${(strategy.risk.positionSizeUsd / Math.max(1, strategy.market.leverage)).toFixed(2)}
                    </b>
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
