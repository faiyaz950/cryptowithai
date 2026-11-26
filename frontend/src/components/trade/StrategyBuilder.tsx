"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  EXCHANGES,
  INDICATOR_OPTIONS,
  INTERVAL_CHIPS,
  OPERATOR_OPTIONS,
  STRATEGY_CATEGORIES,
  STRATEGY_TEMPLATES,
  availableCoins,
  createBlankStrategy,
  customStrategyHref,
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
  type StrategyTemplate,
} from "@/lib/strategyBuilder";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Info,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Sigma,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { fetchCandles, symbolLabel, type Candle } from "@/lib/cryptoApi";
import StrategySimulator from "@/components/trade/StrategySimulator";

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
    <div className="sb-cond-card">
      <div className="sb-cond">
        <span className="sb-when">WHEN</span>
        <select
          className="trade-select sb-cond-select"
          value={condition.indicator}
          aria-label="Indicator"
          onChange={(e) => {
            const indicator = e.target.value as IndicatorId;
            const def = INDICATOR_OPTIONS.find((i) => i.value === indicator);
            onChange({ ...condition, indicator, period: def?.defaultPeriod ?? 14 });
          }}
        >
          {["Price", "Trend", "Bands", "Momentum", "Volatility", "Volume"].map((group) => (
            <optgroup key={group} label={group}>
              {INDICATOR_OPTIONS.filter((i) => i.group === group).map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </optgroup>
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
        {canRemove && (
          <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={onRemove} aria-label="Remove">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="sb-cond-compare">
        <Seg
          size="sm"
          value={condition.compareTo}
          onChange={(compareTo) => onChange({ ...condition, compareTo })}
          options={[
            { value: "value", label: "Value" },
            { value: "ema", label: "EMA" },
            { value: "sma", label: "SMA" },
            { value: "price", label: "Price" },
          ]}
        />
        {condition.compareTo === "value" ? (
          <input
            type="number"
            className="trade-input sb-cond-num"
            value={condition.value}
            step="any"
            onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
            aria-label="Compare value"
          />
        ) : condition.compareTo === "ema" || condition.compareTo === "sma" ? (
          <div className="flex items-center gap-1.5">
            <span className="sb-hint" style={{ margin: 0 }}>{condition.compareTo === "sma" ? "SMA" : "EMA"}</span>
            <input
              type="number"
              className="trade-input sb-cond-num"
              value={condition.comparePeriod}
              min={1}
              onChange={(e) => onChange({ ...condition, comparePeriod: Number(e.target.value) || 21 })}
              aria-label="Average period"
            />
          </div>
        ) : (
          <span className="sb-hint" style={{ margin: 0, alignSelf: "center" }}>Last close price</span>
        )}
      </div>
    </div>
  );
}

function RuleGroups({
  groups,
  onChange,
  allowEmpty,
}: {
  groups: ConditionGroup[];
  onChange: (next: ConditionGroup[]) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <div key={g.id} className="sb-group">
          {gi > 0 && <div className="sb-or-badge">OR</div>}
          <div className="flex items-center justify-between mb-2">
            <span className="sb-hint">Group · conditions {g.join.toUpperCase()}</span>
            <div className="flex gap-1">
              <Seg
                size="sm"
                value={g.join}
                onChange={(join) => onChange(groups.map((row) => (row.id === g.id ? { ...row, join } : row)))}
                options={[
                  { value: "and", label: "AND" },
                  { value: "or", label: "OR" },
                ]}
              />
              {(allowEmpty || groups.length > 1) && (
                <button
                  type="button"
                  className="trade-iconbtn trade-iconbtn-sm"
                  onClick={() => onChange(groups.filter((row) => row.id !== g.id))}
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
                  onChange(groups.map((row) => (
                    row.id === g.id
                      ? { ...row, conditions: row.conditions.map((x) => (x.id === c.id ? next : x)) }
                      : row
                  )))
                }
                onRemove={() =>
                  onChange(groups.map((row) => (
                    row.id === g.id
                      ? { ...row, conditions: row.conditions.filter((x) => x.id !== c.id) }
                      : row
                  )))
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="sb-link-btn mt-2"
            onClick={() =>
              onChange(groups.map((row) => (
                row.id === g.id ? { ...row, conditions: [...row.conditions, newCondition()] } : row
              )))
            }
          >
            <Plus className="w-3.5 h-3.5" /> Add condition
          </button>
        </div>
      ))}
      <button
        type="button"
        className="sb-link-btn"
        onClick={() => onChange([...groups, newGroup()])}
      >
        <Plus className="w-3.5 h-3.5" /> Add group (OR)
      </button>
    </div>
  );
}

function TemplatePicker({
  symbol,
  onPick,
  onBack,
}: {
  symbol: string;
  onPick: (t: StrategyTemplate) => void;
  onBack: () => void;
}) {
  const scratch = STRATEGY_TEMPLATES.find((t) => t.id === "blank");
  if (!scratch) return null;

  return (
    <div className="sb-root sb-start">
      <div className="trade-panel sb-header sb-start-hero">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className="trade-iconbtn" aria-label="Back">
            <ArrowLeft className="w-[17px] h-[17px]" />
          </button>
          <div className="min-w-0">
            <p className="sb-start-kicker">Strategy builder</p>
            <h2>Start from scratch</h2>
            <p className="sb-start-lead">
              A blank strategy on {symbolLabel(symbol)}. You choose the market, write the entry, and set the stop and target.
            </p>
          </div>
        </div>
      </div>

      <div className="sb-start-layout">
        <ol className="sb-start-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Market</strong>
              <p>Coin, timeframe, and direction.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Entry</strong>
              <p>The rules that open a trade.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Exits</strong>
              <p>Stop, target, and position size.</p>
            </div>
          </li>
        </ol>

        <button type="button" className="sb-start-card" onClick={() => onPick(scratch)}>
          <span className="sb-start-tag">Scratch</span>
          <strong>Blank cockpit</strong>
          <p>Nothing is filled in. The first screen is the market, then the rules, then the simulator.</p>
          <span className="sb-start-go">
            Open the builder
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </div>
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
  const [strategy, setStrategy] = useState<CustomStrategy>(() => createBlankStrategy(defaultSymbol));
  const [hydrated, setHydrated] = useState(!strategyId);
  /** Nayi strategy par pehle templates dikhao. */
  const [pickingTemplate, setPickingTemplate] = useState(!strategyId);
  const [view, setView] = useState<BuilderView>("cockpit");
  const [marketTab, setMarketTab] = useState<"instrument" | "session">("instrument");
  const [signalTab, setSignalTab] = useState<"entry" | "exit">("entry");
  const [riskTab, setRiskTab] = useState<"exits" | "size" | "limits">("exits");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [coinPicker, setCoinPicker] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [runHref, setRunHref] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!strategyId) {
      setHydrated(true);
      setPickingTemplate(true);
      return;
    }
    const existing = getCustomStrategy(strategyId);
    if (existing) {
      setStrategy({
        ...existing,
        risk: {
          ...createBlankStrategy().risk,
          ...existing.risk,
          dailyCapEnabled: existing.risk.dailyCapEnabled ?? true,
          killSwitch: existing.risk.killSwitch ?? false,
          killSwitchLosses: existing.risk.killSwitchLosses ?? 3,
        },
      });
      setPickingTemplate(false);
    }
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

  const applyTemplate = (t: StrategyTemplate) => {
    const next = t.apply(defaultSymbol);
    // Editing existing id preserve? New create always new id from template.
    if (strategyId) next.id = strategyId;
    setStrategy(next);
    setPickingTemplate(false);
    setNotice(t.id === "blank" ? "Blank strategy. Name it, then set the market and the rules." : `Template applied: ${t.name}`);
    setRunHref(null);
  };

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
      setNotice("Fix errors before deploying");
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
        setNotice("Strategy deploy ho gayi — ab Open & run se live monitor chalao");
      } else {
        setStrategy(saved);
        setNotice("Draft save ho gaya");
      }
      setRunHref(customStrategyHref(saved.id));
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  };

  const toneColor =
    live.tone === "buy" ? "var(--green)" : live.tone === "sell" ? "var(--red)" : "var(--text-muted)";

  if (!hydrated) {
    return <div className="trade-panel h-48 shimmer" />;
  }

  if (pickingTemplate) {
    return (
      <TemplatePicker
        symbol={defaultSymbol}
        onPick={applyTemplate}
        onBack={onBack}
      />
    );
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
                  { id: "simulator" as const, label: "Simulator", icon: FlaskConical },
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
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="trade-btn trade-btn-ghost"
              onClick={() => setView("simulator")}
              title="Test & Simulate strategy"
            >
              <FlaskConical className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="hidden lg:inline">Simulator</span>
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-ghost"
              onClick={() => setPickingTemplate(true)}
              title="Start again from a blank strategy"
            >
              <LayoutTemplate className="w-4 h-4" />
              <span className="hidden md:inline">Start over</span>
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-ghost"
              disabled={saving}
              onClick={() => handleSave("draft")}
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <button
              type="button"
              className="trade-btn trade-btn-primary"
              disabled={saving}
              onClick={() => handleSave("live")}
            >
              <Rocket className="w-4 h-4" />
              Deploy
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="sb-summary">
          <span className="sb-reads">READS</span>
          {summary}
        </p>

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
            {runHref && (
              <Link href={runHref} className="trade-btn trade-btn-primary" style={{ height: 30, padding: "0 10px", fontSize: 12 }}>
                <ExternalLink className="w-3.5 h-3.5" />
                Open & run
              </Link>
            )}
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setNotice(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {view === "simulator" && (
        <StrategySimulator
          strategy={strategy}
          candles={candles}
          defaultSymbol={defaultSymbol}
          onTweakRules={() => setView("cockpit")}
          onDeploy={() => handleSave("live")}
          onUpdateStrategy={patch}
          onReloadCandles={async (interval, limit, exchange) => {
            const sym = strategy.market.symbols[0] ?? defaultSymbol;
            const res = await fetchCandles({ symbol: sym, interval, limit, exchange });
            if (res.success && res.candles) setCandles(res.candles);
          }}
        />
      )}

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
                  {/* ── 4 Strategy Types Selector ── */}
                  <div>
                    <FieldLabel tip="Strategy category determines what rules, execution model, and risk controls are used">
                      Strategy Type
                    </FieldLabel>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl" style={{ background: "var(--bg-tertiary)" }}>
                      {STRATEGY_CATEGORIES.map((cat) => {
                        const active = (strategy.market.strategyType ?? "indicators") === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  strategyType: cat.id,
                                  instrument: cat.id === "options" ? "options" : "perps",
                                },
                              }))
                            }
                            className={`px-2.5 py-2 text-left rounded-lg text-[11.5px] transition-all ${
                              active
                                ? "bg-accent text-white font-bold shadow-sm"
                                : "text-muted hover:text-primary hover:bg-[rgba(255,255,255,0.04)]"
                            }`}
                            style={active ? { background: "var(--accent)", color: "#fff" } : {}}
                          >
                            <div className="font-semibold leading-tight">{cat.label}</div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="sb-hint" style={{ marginTop: 8 }}>
                      {STRATEGY_CATEGORIES.find((c) => c.id === (strategy.market.strategyType ?? "indicators"))?.blurb}
                    </p>
                  </div>

                  {/* ── Options Strategy Specific Parameters ── */}
                  {strategy.market.strategyType === "options" && (
                    <div
                      className="p-3 rounded-xl border space-y-3"
                      style={{ background: "rgba(59, 130, 246, 0.05)", borderColor: "rgba(59, 130, 246, 0.2)" }}
                    >
                      <div className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: "#3b82f6" }}>
                        <Sigma className="w-3.5 h-3.5" /> Options Rules & Structure
                      </div>
                      <div>
                        <FieldLabel tip="Structure of option legs">Options Structure</FieldLabel>
                        <select
                          className="trade-select w-full"
                          value={strategy.market.optionsConfig?.structure ?? "bull_spread"}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              market: {
                                ...s.market,
                                optionsConfig: {
                                  structure: e.target.value as any,
                                  legType: e.target.value === "iron_condor" ? "both" : "call",
                                  strikeSelection: s.market.optionsConfig?.strikeSelection ?? "otm",
                                  targetDelta: s.market.optionsConfig?.targetDelta ?? 0.35,
                                  expiryPreference: s.market.optionsConfig?.expiryPreference ?? "weekly",
                                },
                              },
                            }))
                          }
                        >
                          <option value="bull_spread">Bull Call Spread (Debit)</option>
                          <option value="bear_spread">Bear Put Spread (Debit)</option>
                          <option value="iron_condor">Delta Neutral Iron Condor</option>
                          <option value="single">Single Leg (Directional Call/Put)</option>
                          <option value="straddle">Long Straddle (Volatility Breakout)</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <FieldLabel>Strike Selection</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.optionsConfig?.strikeSelection ?? "otm"}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  optionsConfig: {
                                    ...s.market.optionsConfig!,
                                    strikeSelection: e.target.value as any,
                                  },
                                },
                              }))
                            }
                          >
                            <option value="otm">OTM (Delta ~0.35)</option>
                            <option value="atm">ATM (Delta ~0.50)</option>
                            <option value="itm">ITM (Delta ~0.70)</option>
                            <option value="delta">Custom Delta Target</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Expiry Preference</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.optionsConfig?.expiryPreference ?? "weekly"}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  optionsConfig: {
                                    ...s.market.optionsConfig!,
                                    expiryPreference: e.target.value as any,
                                  },
                                },
                              }))
                            }
                          >
                            <option value="daily">Current Day (0 DTE)</option>
                            <option value="weekly">Weekly Expiry (Friday)</option>
                            <option value="monthly">Monthly Expiry</option>
                          </select>
                        </div>
                      </div>
                      {strategy.market.optionsConfig?.structure === "single" && (
                        <div>
                          <FieldLabel>Leg</FieldLabel>
                          <Seg
                            value={strategy.market.optionsConfig?.legType === "put" ? "put" : "call"}
                            onChange={(legType) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  optionsConfig: { ...s.market.optionsConfig!, legType },
                                },
                              }))
                            }
                            options={[
                              { value: "call", label: "Call" },
                              { value: "put", label: "Put" },
                            ]}
                          />
                        </div>
                      )}
                      {strategy.market.optionsConfig?.strikeSelection === "delta" && (
                        <div>
                          <FieldLabel tip="Absolute delta used to pick the strike">Target delta</FieldLabel>
                          <input
                            type="number"
                            className="trade-input w-full"
                            min={0.05}
                            max={0.95}
                            step={0.05}
                            value={strategy.market.optionsConfig?.targetDelta ?? 0.35}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  optionsConfig: {
                                    ...s.market.optionsConfig!,
                                    targetDelta: Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.35)),
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      )}
                      <p className="sb-hint">
                        The simulator scores the entry rules on the coin candles. It does not price the option legs.
                      </p>
                    </div>
                  )}

                  {/* ── Futures Strategy Specific Parameters ── */}
                  {strategy.market.strategyType === "futures" && (
                    <div
                      className="p-3 rounded-xl border space-y-3"
                      style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.2)" }}
                    >
                      <div className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: "var(--green)" }}>
                        <TrendingUp className="w-3.5 h-3.5" /> Futures & Perps Parameters
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <FieldLabel tip="Order execution type">Order Type</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.futuresConfig?.orderType ?? "market"}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  futuresConfig: {
                                    orderType: e.target.value as any,
                                    liquidationBufferAtr: s.market.futuresConfig?.liquidationBufferAtr ?? 2.5,
                                    trailingType: s.market.futuresConfig?.trailingType ?? "percent",
                                  },
                                },
                              }))
                            }
                          >
                            <option value="market">Market (Instant Fill)</option>
                            <option value="limit">Limit (Maker Rebate)</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel tip="Liquidation distance buffer">Liq Buffer</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.futuresConfig?.liquidationBufferAtr ?? 2.5}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  futuresConfig: {
                                    ...s.market.futuresConfig!,
                                    liquidationBufferAtr: Number(e.target.value),
                                  },
                                },
                              }))
                            }
                          >
                            <option value={1.5}>1.5× ATR (Aggressive)</option>
                            <option value={2.5}>2.5× ATR (Standard)</option>
                            <option value={4.0}>4.0× ATR (Conservative)</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <FieldLabel tip="How the trailing stop measures distance">Trail measure</FieldLabel>
                        <Seg
                          value={strategy.market.futuresConfig?.trailingType ?? "percent"}
                          onChange={(trailingType) =>
                            patch((s) => ({
                              ...s,
                              market: {
                                ...s.market,
                                futuresConfig: {
                                  orderType: s.market.futuresConfig?.orderType ?? "market",
                                  liquidationBufferAtr: s.market.futuresConfig?.liquidationBufferAtr ?? 2.5,
                                  trailingType,
                                },
                              },
                            }))
                          }
                          options={[
                            { value: "percent", label: "Percent" },
                            { value: "atr", label: "ATR" },
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Hedging Strategy Specific Parameters ── */}
                  {strategy.market.strategyType === "hedging" && (
                    <div
                      className="p-3 rounded-xl border space-y-3"
                      style={{ background: "rgba(6, 182, 212, 0.05)", borderColor: "rgba(6, 182, 212, 0.2)" }}
                    >
                      <div className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: "#06b6d4" }}>
                        <ShieldCheck className="w-3.5 h-3.5" /> Hedging & Downside Protection
                      </div>
                      <div>
                        <FieldLabel tip="Hedge mechanism">Hedge Structure</FieldLabel>
                        <select
                          className="trade-select w-full"
                          value={strategy.market.hedgingConfig?.hedgeType ?? "spot_futures"}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              market: {
                                ...s.market,
                                hedgingConfig: {
                                  hedgeType: e.target.value as any,
                                  hedgeRatioPct: s.market.hedgingConfig?.hedgeRatioPct ?? 100,
                                  rebalanceTriggerPct: s.market.hedgingConfig?.rebalanceTriggerPct ?? 5,
                                },
                              },
                            }))
                          }
                        >
                          <option value="spot_futures">Spot + Short Futures (Delta-Neutral Cash & Carry)</option>
                          <option value="protective_put">Protective Put (Portfolio Downside Floor)</option>
                          <option value="covered_call">Covered Call (Yield Enhancement)</option>
                          <option value="pair_hedge">Pair Hedge (Cross-Asset Beta Arbitrage)</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <FieldLabel tip="Hedge ratio percentage">Hedge Ratio</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.hedgingConfig?.hedgeRatioPct ?? 100}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  hedgingConfig: {
                                    ...s.market.hedgingConfig!,
                                    hedgeRatioPct: Number(e.target.value),
                                  },
                                },
                              }))
                            }
                          >
                            <option value={25}>25% Partial</option>
                            <option value={50}>50% Half</option>
                            <option value={75}>75% Strong</option>
                            <option value={100}>100% Full Delta Neutral</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel tip="Rebalance trigger drift">Rebalance Drift</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.hedgingConfig?.rebalanceTriggerPct ?? 5}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  hedgingConfig: {
                                    ...s.market.hedgingConfig!,
                                    rebalanceTriggerPct: Number(e.target.value),
                                  },
                                },
                              }))
                            }
                          >
                            <option value={3}>±3% Tight</option>
                            <option value={5}>±5% Standard</option>
                            <option value={10}>±10% Wide</option>
                          </select>
                        </div>
                      </div>
                      {strategy.market.hedgingConfig?.hedgeType === "pair_hedge" && (
                        <div>
                          <FieldLabel tip="The second coin in the pair">Pair coin</FieldLabel>
                          <select
                            className="trade-select w-full"
                            value={strategy.market.hedgingConfig?.secondarySymbol ?? "ETHUSDT"}
                            onChange={(e) =>
                              patch((s) => ({
                                ...s,
                                market: {
                                  ...s.market,
                                  hedgingConfig: {
                                    ...s.market.hedgingConfig!,
                                    secondarySymbol: e.target.value,
                                  },
                                },
                              }))
                            }
                          >
                            {coins.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <p className="sb-hint">
                        The candle test follows the entry rules on the chart coin. The hedge ratio is stored with the strategy.
                      </p>
                    </div>
                  )}
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
              <div className="sb-mini-tabs">
                <button type="button" data-active={signalTab === "entry"} onClick={() => setSignalTab("entry")}>Entry</button>
                <button type="button" data-active={signalTab === "exit"} onClick={() => setSignalTab("exit")}>Exit</button>
              </div>
            </div>
            <div className="sb-col-body space-y-4">
              {signalTab === "entry" ? (
                <>
                  <div>
                    <FieldLabel tip="Indicator cross ya fixed IST time">Trigger</FieldLabel>
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
                      <FieldLabel tip="IST time jab position open hogi">Entry time (IST)</FieldLabel>
                      <input
                        type="time"
                        className="trade-input w-full"
                        value={strategy.signal.entryTime ?? "09:30"}
                        onChange={(e) => patch((s) => ({ ...s, signal: { ...s.signal, entryTime: e.target.value } }))}
                      />
                    </div>
                  ) : (
                    <RuleGroups
                      groups={strategy.signal.entryGroups}
                      onChange={(entryGroups) => patch((s) => ({ ...s, signal: { ...s.signal, entryGroups } }))}
                    />
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="sb-hint">
                    Close the trade when a rule is true. The stop, target, trail, and time stop stay in the risk column.
                  </p>
                  <RuleGroups
                    allowEmpty
                    groups={strategy.signal.exitGroups ?? []}
                    onChange={(exitGroups) => patch((s) => ({ ...s, signal: { ...s.signal, exitGroups } }))}
                  />
                  <Toggle
                    checked={strategy.signal.exitOnSignal}
                    onChange={(exitOnSignal) => patch((s) => ({ ...s, signal: { ...s.signal, exitOnSignal } }))}
                    label="On opposite signal"
                    hint="Close when the entry rules flip the other way"
                  />
                  <Toggle
                    checked={strategy.signal.exitOnReversal}
                    onChange={(exitOnReversal) => patch((s) => ({ ...s, signal: { ...s.signal, exitOnReversal } }))}
                    label="On the same signal again"
                    hint="Close if the entry rules fire a second time"
                  />
                </div>
              )}

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
                <button type="button" data-active={riskTab === "limits"} onClick={() => setRiskTab("limits")}>Limits</button>
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
                    Advanced {showAdvanced ? "· hide" : "· none"}
                  </button>
                  {showAdvanced && (
                    <p className="sb-hint">
                      Extra exits (partial TP, breakeven) jaldi add honge. Abhi TP/SL + trailing kaafi hain.
                    </p>
                  )}
                </>
              ) : riskTab === "size" ? (
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
                  <div className="mt-4">
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
              ) : (
                <div className="space-y-4">
                  <Toggle
                    checked={strategy.risk.dailyCapEnabled}
                    onChange={(dailyCapEnabled) => patch((s) => ({ ...s, risk: { ...s.risk, dailyCapEnabled } }))}
                    label="Daily cap"
                    hint="Din ka loss limit hit hone par strategy pause"
                  />
                  {strategy.risk.dailyCapEnabled && (
                    <div>
                      <FieldLabel>Max daily loss %</FieldLabel>
                      <input
                        type="number"
                        className="trade-input w-full"
                        value={strategy.risk.maxDailyLossPct}
                        min={0.1}
                        step="0.1"
                        onChange={(e) =>
                          patch((s) => ({
                            ...s,
                            risk: { ...s.risk, maxDailyLossPct: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                  )}
                  <Toggle
                    checked={strategy.risk.killSwitch}
                    onChange={(killSwitch) => patch((s) => ({ ...s, risk: { ...s.risk, killSwitch } }))}
                    label="Kill switch"
                    hint="Lagataar losing streak ke baad strategy band"
                  />
                  {strategy.risk.killSwitch && (
                    <div>
                      <FieldLabel>Stop after N losses</FieldLabel>
                      <input
                        type="number"
                        className="trade-input w-full"
                        value={strategy.risk.killSwitchLosses}
                        min={1}
                        onChange={(e) =>
                          patch((s) => ({
                            ...s,
                            risk: { ...s.risk, killSwitchLosses: Number(e.target.value) || 1 },
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
