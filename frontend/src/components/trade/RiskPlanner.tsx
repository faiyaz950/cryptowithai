"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookmarkPlus,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { CRYPTO_SYMBOLS, symbolLabel, type Candle, type MarketInfo } from "@/lib/cryptoApi";
import {
  computePlan,
  fmtNum,
  fmtQty,
  fmtUsd,
  safeMaxLeverage,
  stopSuggestions,
  type PlanInput,
  type Side,
} from "@/lib/risk";

interface Props {
  plan: PlanInput;
  onChange: (patch: Partial<PlanInput>) => void;
  candles: Candle[];
  market: MarketInfo | null;
  /** Live funding rate mila ya nahi — UI batata hai ki number kahan se aaya. */
  fundingLive: boolean;
  onSave: () => void;
  onAskAi: () => void;
  saved: boolean;
}

const RISK_PRESETS = [0.25, 0.5, 1, 2];
const LEVERAGE_MARKS = [1, 5, 10, 25, 50, 100];

function NumField({
  label,
  value,
  onChange,
  unit,
  step = "any",
  min,
  hint,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: string;
  min?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="trade-label">{label}</label>
      <span className="risk-affix">
        <input
          type="number"
          className="trade-input"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {unit && <span className="risk-affix-unit">{unit}</span>}
      </span>
      {hint && <p className="risk-stat-sub">{hint}</p>}
    </div>
  );
}

export default function RiskPlanner({
  plan,
  onChange,
  candles,
  market,
  fundingLive,
  onSave,
  onAskAi,
  saved,
}: Props) {
  const math = useMemo(() => computePlan(plan), [plan]);

  const suggestions = useMemo(
    () => stopSuggestions(candles, plan.side, plan.entry),
    [candles, plan.side, plan.entry],
  );

  const maxLev = useMemo(
    () => safeMaxLeverage(plan.entry, plan.stop, plan.maintMarginPct),
    [plan.entry, plan.stop, plan.maintMarginPct],
  );

  const verdict = math.valid ? math.grade : "critical";
  const VerdictIcon = verdict === "ok" ? CheckCircle2 : verdict === "warn" ? AlertTriangle : ShieldAlert;
  const verdictText =
    !math.valid
      ? math.invalidReason
      : verdict === "ok"
        ? "Plan saaf hai — size, liquidation aur cost sab limits ke andar."
        : verdict === "warn"
          ? "Trade chal sakti hai, par neeche wali baatein dekh lo."
          : "Ye plan aise mat lo — neeche critical issue hai.";

  return (
    <div className="risk-grid">
      {/* ── Inputs ──────────────────────────────────────── */}
      <section className="trade-panel">
        <div className="trade-panel-head">
          <h3 className="trade-panel-title">Trade inputs</h3>
          {market && (
            <span className="trade-badge trade-badge-neutral">
              LTP {fmtNum(market.current_price)}
            </span>
          )}
        </div>

        <div className="trade-panel-body space-y-4">
          <div className="risk-fields">
            <div>
              <label className="trade-label">Pair</label>
              <select
                className="trade-select"
                value={plan.symbol}
                onChange={(e) => onChange({ symbol: e.target.value })}
                aria-label="Pair"
              >
                {CRYPTO_SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="trade-label">Direction</label>
              <div className="risk-side">
                {(["long", "short"] as Side[]).map((side) => {
                  const Icon = side === "long" ? ArrowUpRight : ArrowDownRight;
                  return (
                    <button
                      key={side}
                      type="button"
                      data-side={side}
                      data-on={plan.side === side}
                      className="risk-side-btn"
                      onClick={() => onChange({ side })}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {side}
                    </button>
                  );
                })}
              </div>
            </div>

            <NumField
              label="Account equity"
              value={plan.equity}
              onChange={(v) => onChange({ equity: v })}
              unit="USD"
              min={0}
            />
            <NumField
              label="Risk per trade"
              value={plan.riskPct}
              onChange={(v) => onChange({ riskPct: v })}
              unit="%"
              step="0.05"
              min={0}
              hint={math.valid ? `= ${fmtUsd(math.riskAmount)}` : undefined}
            />

            <div className="risk-field-full risk-chips">
              {RISK_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="risk-chip"
                  onClick={() => onChange({ riskPct: p })}
                >
                  <span className="risk-chip-label">{p}%</span>
                  <span className="risk-chip-hint">{fmtUsd((plan.equity * p) / 100)}</span>
                </button>
              ))}
            </div>

            <NumField
              label="Entry"
              value={plan.entry}
              onChange={(v) => onChange({ entry: v })}
              min={0}
              hint={market ? `Live ${fmtNum(market.current_price)}` : undefined}
            />
            <NumField
              label="Stop loss"
              value={plan.stop}
              onChange={(v) => onChange({ stop: v })}
              min={0}
              hint={math.valid ? `${math.stopPct.toFixed(2)}% door` : undefined}
            />
          </div>

          {suggestions.length > 0 && (
            <div>
              <label className="trade-label">Stop suggestions — volatility se</label>
              <div className="risk-chips">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="risk-chip"
                    onClick={() => onChange({ stop: Number(s.price.toFixed(6)) })}
                    title={`Stop ${fmtNum(s.price)} par set karo`}
                  >
                    <span className="risk-chip-label">{s.label} · {fmtNum(s.price)}</span>
                    <span className="risk-chip-hint">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="trade-label" style={{ marginBottom: 0 }}>Leverage</label>
              <span className="tnum text-[12px] font-bold" style={{ color: "var(--accent)" }}>
                {plan.leverage}x
              </span>
            </div>
            <input
              type="range"
              className="risk-slider"
              min={1}
              max={100}
              step={1}
              value={plan.leverage}
              onChange={(e) => onChange({ leverage: Number(e.target.value) })}
              aria-label="Leverage"
            />
            <div className="risk-slider-scale">
              {LEVERAGE_MARKS.map((m) => <span key={m}>{m}x</span>)}
            </div>
            {math.valid && maxLev >= 1 && (
              <p className="risk-stat-sub">
                Is stop ke saath liquidation stop ke paar rehne ke liye zyada se zyada{" "}
                <b style={{ color: math.liqBeforeStop ? "var(--red)" : "var(--green)" }}>
                  {Math.floor(maxLev)}x
                </b>{" "}
                chalega.
              </p>
            )}
          </div>

          <details>
            <summary className="trade-label cursor-pointer" style={{ marginBottom: 8 }}>
              Fees, funding &amp; hold time
            </summary>
            <div className="risk-fields">
              <NumField
                label="Taker fee (per side)"
                value={plan.feePct}
                onChange={(v) => onChange({ feePct: v })}
                unit="%"
                step="0.005"
                min={0}
              />
              <NumField
                label="Maintenance margin"
                value={plan.maintMarginPct}
                onChange={(v) => onChange({ maintMarginPct: v })}
                unit="%"
                step="0.05"
                min={0}
              />
              <NumField
                label="Funding rate"
                value={plan.fundingPct}
                onChange={(v) => onChange({ fundingPct: v })}
                unit="%"
                step="0.001"
                hint={fundingLive ? "Live exchange se" : "Manual"}
              />
              <NumField
                label="Funding interval"
                value={plan.fundingIntervalHours}
                onChange={(v) => onChange({ fundingIntervalHours: v })}
                unit="h"
                step="1"
                min={1}
              />
              <NumField
                label="Hold time"
                value={plan.holdHours}
                onChange={(v) => onChange({ holdHours: v })}
                unit="h"
                step="1"
                min={0}
                className="risk-field-full"
                hint="Funding cost isi ke hisaab se project hota hai."
              />
            </div>
          </details>

          <div>
            <label className="trade-label">Target ladder (R multiples)</label>
            <input
              type="text"
              className="trade-input"
              defaultValue={plan.targetsR.join(", ")}
              onBlur={(e) => {
                const parsed = e.target.value
                  .split(/[,\s]+/)
                  .map((v) => Number(v))
                  .filter((v) => Number.isFinite(v) && v > 0);
                onChange({ targetsR: parsed.length ? parsed : [1, 2, 3] });
              }}
              aria-label="Target ladder"
            />
            <p className="risk-stat-sub">
              1R = stop distance. &quot;1, 2, 3&quot; matlab teen scale-out levels.
            </p>
          </div>
        </div>
      </section>

      {/* ── Results ─────────────────────────────────────── */}
      <div className="space-y-3">
        <section className="trade-panel">
          <div className="risk-verdict" data-level={verdict}>
            <span className="risk-verdict-badge">
              <VerdictIcon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="risk-verdict-title">
                {math.valid
                  ? `${symbolLabel(plan.symbol)} ${plan.side} · ${fmtQty(math.qty)} units`
                  : "Plan adhoora hai"}
              </div>
              <p className="risk-verdict-sub">{verdictText}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-none">
              <button
                type="button"
                className="trade-btn trade-btn-ghost trade-size-sm"
                onClick={onSave}
                disabled={!math.valid}
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                {saved ? "Saved" : "Book"}
              </button>
              <button
                type="button"
                className="trade-btn trade-btn-primary trade-size-sm"
                onClick={onAskAi}
                disabled={!math.valid}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ask AI
              </button>
            </div>
          </div>

          <div className="risk-stat-grid risk-stat-grid-4" style={{ border: 0, borderRadius: 0 }}>
            <div className="risk-stat">
              <div className="risk-stat-label">Position size</div>
              <div className="risk-stat-value">{math.valid ? fmtQty(math.qty) : "—"}</div>
              <div className="risk-stat-sub">units of {plan.symbol.replace(/USDT$/, "")}</div>
            </div>
            <div className="risk-stat">
              <div className="risk-stat-label">Notional</div>
              <div className="risk-stat-value">{math.valid ? fmtUsd(math.notional) : "—"}</div>
              <div className="risk-stat-sub">
                {math.valid ? `${math.effectiveLeverage.toFixed(1)}x equity` : ""}
              </div>
            </div>
            <div className="risk-stat">
              <div className="risk-stat-label">Margin needed</div>
              <div className="risk-stat-value" style={{ color: math.margin > plan.equity ? "var(--red)" : undefined }}>
                {math.valid ? fmtUsd(math.margin) : "—"}
              </div>
              <div className="risk-stat-sub">at {plan.leverage}x isolated</div>
            </div>
            <div className="risk-stat">
              <div className="risk-stat-label">Risk if stopped</div>
              <div className="risk-stat-value" style={{ color: "var(--red)" }}>
                {math.valid ? `-${fmtUsd(math.netRisk)}` : "—"}
              </div>
              <div className="risk-stat-sub">
                {math.valid ? `${math.netRiskPct.toFixed(2)}% of equity, costs included` : ""}
              </div>
            </div>
          </div>
        </section>

        {math.warnings.length > 0 && (
          <div className="space-y-2">
            {math.warnings.map((w) => (
              <div key={w.id} className="risk-warn" data-level={w.level}>
                <ShieldAlert className="w-4 h-4 risk-warn-icon" />
                <span>{w.text}</span>
              </div>
            ))}
          </div>
        )}

        {math.valid && math.warnings.length === 0 && (
          <div className="risk-warn" data-level="ok">
            <CheckCircle2 className="w-4 h-4 risk-warn-icon" />
            <span>
              Liquidation stop se {math.liqDistancePct != null ? `${(math.liqDistancePct - math.stopPct).toFixed(2)}%` : ""} aage hai,
              costs risk ka {math.riskAmount > 0 ? ((Math.abs(math.totalCost) / math.riskAmount) * 100).toFixed(0) : "0"}% —
              sizing theek hai.
            </span>
          </div>
        )}

        <section className="trade-panel">
          <div className="trade-panel-head">
            <h3 className="trade-panel-title">Price ladder</h3>
            <span className="trade-badge trade-badge-neutral">
              1R = {math.valid ? fmtNum(math.stopDistance) : "—"}
            </span>
          </div>
          <div className="trade-panel-body">
            {math.valid ? (
              <PriceRail plan={plan} math={math} live={market?.current_price ?? null} />
            ) : (
              <div className="trade-empty trade-empty-md">
                <span className="trade-empty-icon"><Target className="w-4 h-4" /></span>
                <p>Entry aur stop daalte hi poora ladder yahan ban jayega.</p>
              </div>
            )}
          </div>
        </section>

        <section className="trade-panel">
          <div className="trade-panel-head">
            <h3 className="trade-panel-title">Cost &amp; exits</h3>
          </div>
          <div className="risk-stat-grid risk-stat-grid-3" style={{ border: 0, borderRadius: 0 }}>
            <div className="risk-stat">
              <div className="risk-stat-label">Round-trip fees</div>
              <div className="risk-stat-value">{math.valid ? fmtUsd(math.feeCost) : "—"}</div>
              <div className="risk-stat-sub">{plan.feePct}% × 2 on notional</div>
            </div>
            <div className="risk-stat">
              <div className="risk-stat-label">Funding ({plan.holdHours}h)</div>
              <div
                className="risk-stat-value"
                style={{ color: math.fundingCost > 0 ? "var(--red)" : math.fundingCost < 0 ? "var(--green)" : undefined }}
              >
                {math.valid ? fmtUsd(math.fundingCost) : "—"}
              </div>
              <div className="risk-stat-sub">
                {plan.fundingPct === 0
                  ? fundingLive ? "Funding flat abhi" : "Rate set nahi — manual daalo"
                  : `${plan.fundingPct > 0 ? "Longs pay" : "Shorts pay"} ${Math.abs(plan.fundingPct)}% / ${plan.fundingIntervalHours}h`}
              </div>
            </div>
            <div className="risk-stat">
              <div className="risk-stat-label">Breakeven price</div>
              <div className="risk-stat-value">{math.valid ? fmtNum(math.breakeven) : "—"}</div>
              <div className="risk-stat-sub">yahan se profit shuru</div>
            </div>
          </div>

          {math.ladder.length > 0 && (
            <div className="overflow-auto">
              <table className="trade-table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th className="trade-num">Price</th>
                    <th className="trade-num">Move</th>
                    <th className="trade-num">Net P&amp;L</th>
                    <th className="trade-num">% of equity</th>
                  </tr>
                </thead>
                <tbody>
                  {math.ladder.map((rung) => {
                    const movePct = (Math.abs(rung.price - plan.entry) / plan.entry) * 100;
                    return (
                      <tr key={rung.r}>
                        <td className="font-bold">{rung.r}R</td>
                        <td className="trade-num tnum">{fmtNum(rung.price)}</td>
                        <td className="trade-num tnum" style={{ color: "var(--text-muted)" }}>
                          {plan.side === "long" ? "+" : "-"}{movePct.toFixed(2)}%
                        </td>
                        <td className="trade-num tnum" style={{ color: rung.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                          {rung.pnl >= 0 ? "+" : ""}{fmtUsd(rung.pnl)}
                        </td>
                        <td className="trade-num tnum">
                          {plan.equity > 0 ? `${((rung.pnl / plan.equity) * 100).toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="px-4 py-3 text-[11.5px] leading-relaxed flex gap-2" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--tr-line-soft)" }}>
            <Info className="w-3.5 h-3.5 flex-none mt-px" />
            <span>
              Liquidation isolated-margin formula se hai (IMR = 1/leverage, MMR {plan.maintMarginPct}%).
              Exchange ka tiered margin aur insurance fund thoda alag number de sakta hai — buffer hamesha rakho.
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}

/* ── Price rail ───────────────────────────────────────────
   Entry, breakeven, stop, liquidation aur saare targets ek hi price scale par.
   Number tables batate hain "kitna"; ye batata hai "kitna paas" — aur wahi
   liquidation ki galti pakadta hai. */

/** Do labels itne percent se paas aaye to neeche wala khiska diya jata hai. */
const LABEL_GAP = 9.5;

interface RailMark {
  key: string;
  tag: string;
  sub?: string;
  price: number;
  color: string;
  strong?: boolean;
}

/**
 * Labels ko itna khisakao ki ek doosre par na chadhein. Line apni asli jagah
 * par rehti hai, isliye geometry jhooth nahi bolti — sirf text saans leta hai.
 */
function declutter(ys: number[]): number[] {
  const out = [...ys];
  for (let i = 1; i < out.length; i++) {
    out[i] = Math.max(out[i], out[i - 1] + LABEL_GAP);
  }
  for (let i = out.length - 2; i >= 0; i--) {
    out[i] = Math.min(out[i], out[i + 1] - LABEL_GAP);
  }
  const drift = Math.min(0, out[0]);
  return out.map((v) => v - drift);
}

function PriceRail({
  plan,
  math,
  live,
}: {
  plan: PlanInput;
  math: ReturnType<typeof computePlan>;
  live: number | null;
}) {
  const marks: RailMark[] = [
    ...math.ladder.map((l) => ({
      key: `t${l.r}`,
      tag: `${l.r}R target`,
      sub: `+${fmtUsd(l.pnl)}`,
      price: l.price,
      color: "var(--green)",
    })),
    { key: "entry", tag: "Entry", price: plan.entry, color: "var(--text-primary)", strong: true },
    { key: "be", tag: "Breakeven", sub: "fees + funding", price: math.breakeven, color: "var(--text-muted)" },
    {
      key: "stop",
      tag: "Stop",
      sub: `-${fmtUsd(math.netRisk)}`,
      price: plan.stop,
      color: "var(--red)",
      strong: true,
    },
  ];
  if (live != null && plan.entry > 0 && Math.abs(live - plan.entry) / plan.entry > 0.0015) {
    marks.push({ key: "live", tag: "Live price", price: live, color: "var(--amber)" });
  }

  /*
   * Scale sirf trade ke envelope par set hoti hai (targets se stop tak). 10x par
   * liquidation ~9% door hoti hai jabki stop 0.4% — dono ko ek linear scale par
   * daalne se poora trade upar ek patli lakeer ban jaata tha. Isliye door wali
   * liquidation neeche apni alag row mein jaati hai, aur agar wo stop ke andar
   * aa gayi (asli khatra) to wahi khud-ba-khud scale ke andar dikhne lagti hai.
   */
  const envelope = marks.map((m) => m.price);
  const lo = Math.min(...envelope);
  const hi = Math.max(...envelope);
  const pad = (hi - lo) * 0.14 || hi * 0.01 || 1;
  const domainHi = hi + pad;
  const domainLo = lo - pad;

  const liq = math.liqPrice;
  const liqInside = liq != null && liq <= domainHi && liq >= domainLo;
  if (liq != null && liqInside) {
    marks.push({
      key: "liq",
      tag: "Liquidation",
      sub: `${math.liqDistancePct?.toFixed(2)}% away`,
      price: liq,
      color: "var(--red)",
      strong: true,
    });
  }

  const span = domainHi - domainLo || 1;
  /** Price -> track ke andar 0-100% (0 = sabse upar). */
  const y = (price: number) =>
    Math.max(0, Math.min(100, ((domainHi - price) / span) * 100));
  /** Track top/bottom par 14px inset hai — CSS calc usi ko honour karta hai. */
  const at = (pct: number) => `calc(14px + ${(pct / 100).toFixed(4)} * (100% - 28px))`;

  const sorted = [...marks].sort((a, b) => b.price - a.price);
  const labelY = declutter(sorted.map((m) => y(m.price)));

  const bestTarget = math.ladder.length ? math.ladder[math.ladder.length - 1].price : plan.entry;
  const zone = (a: number, b: number) => {
    const ya = y(a);
    const yb = y(b);
    return { top: `${Math.min(ya, yb)}%`, height: `${Math.abs(ya - yb)}%` };
  };
  /** Danger zone: liquidation off-scale ho to stop se track ke kinaare tak. */
  const dangerEnd = liq == null ? null : liqInside ? liq : plan.side === "long" ? domainLo : domainHi;

  return (
    <div>
      <div className="risk-rail">
        <div className="risk-rail-track">
          <div className="risk-rail-zone" data-kind="profit" style={zone(plan.entry, bestTarget)} />
          <div className="risk-rail-zone" data-kind="loss" style={zone(plan.entry, plan.stop)} />
          {dangerEnd != null && (
            <div
              className="risk-rail-zone"
              data-kind="danger"
              data-open={liqInside ? "false" : "true"}
              style={zone(plan.stop, dangerEnd)}
            />
          )}
        </div>

        {sorted.map((m) => (
          <span
            key={`${m.key}-line`}
            className="risk-rail-line"
            data-strong={m.strong ? "true" : "false"}
            style={{ top: at(y(m.price)), borderTopColor: m.strong ? m.color : undefined }}
            aria-hidden
          />
        ))}
        {sorted.map((m) => (
          <span
            key={`${m.key}-dot`}
            className="risk-rail-dot"
            style={{ top: at(y(m.price)), background: m.color }}
            aria-hidden
          />
        ))}

        {sorted.map((m, i) => (
          <div key={m.key} className="risk-rail-mark" style={{ top: at(labelY[i]) }}>
            <span className="risk-rail-tag" style={{ color: m.color }}>
              {m.tag}
              {m.sub && <span className="risk-rail-sub">{m.sub}</span>}
            </span>
            <span className="risk-rail-price" style={{ color: m.color }}>{fmtNum(m.price)}</span>
          </div>
        ))}
      </div>

      {liq != null && !liqInside && (
        <div className="risk-rail-foot" data-safe="true">
          <span className="risk-rail-foot-tag">
            Liquidation
            <span className="risk-rail-sub">scale ke bahar</span>
          </span>
          <span className="risk-rail-foot-text">
            {fmtNum(liq)} — entry se {math.liqDistancePct?.toFixed(2)}% door, stop se{" "}
            <b style={{ color: "var(--green)" }}>
              {((math.liqDistancePct ?? 0) - math.stopPct).toFixed(2)}%
            </b>{" "}
            aage. Stop pehle lagega.
          </span>
        </div>
      )}
      {liq != null && liqInside && (
        <div className="risk-rail-foot" data-safe="false">
          <span className="risk-rail-foot-tag" style={{ color: "var(--red)" }}>
            Liquidation
            <span className="risk-rail-sub">trade ke andar</span>
          </span>
          <span className="risk-rail-foot-text">
            {fmtNum(liq)} stop se pehle aa jaati hai — is size par exchange position
            band kar dega, aapka stop chalega hi nahi.
          </span>
        </div>
      )}
    </div>
  );
}
