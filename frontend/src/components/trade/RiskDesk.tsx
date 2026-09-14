"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Calculator, Dices, Flame, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import RiskBook from "@/components/trade/RiskBook";
import RiskPlanner from "@/components/trade/RiskPlanner";
import RiskSimulator from "@/components/trade/RiskSimulator";
import {
  barsForDays,
  fetchCandles,
  fetchFundingFor,
  fetchMarketInfo,
  symbolLabel,
  type Candle,
  type MarketInfo,
} from "@/lib/cryptoApi";
import {
  DEFAULT_PLAN,
  RISK_PLANS_CHANGED,
  RISK_SETTINGS_KEY,
  buildRiskPrompt,
  bookHeat,
  computePlan,
  fmtNum,
  fmtQty,
  fmtUsd,
  listPlans,
  lastAtr,
  newPlanId,
  savePlan,
  toPlanInput,
  type PlanInput,
  type SavedPlan,
} from "@/lib/risk";

type View = "planner" | "book" | "sim";

/** Har view ka apna rang — green yahan kuch nahi keh raha hota, isliye neutral family. */
const VIEWS: { id: View; label: string; sub: string; icon: typeof Calculator; tone: string }[] = [
  { id: "planner", label: "Position Planner", sub: "Size, stop aur liquidation", icon: Calculator, tone: "#2563eb" },
  { id: "book", label: "Risk Book", sub: "Saare open plans ka heat", icon: BookOpen, tone: "#d97706" },
  { id: "sim", label: "Ruin Simulator", sub: "Edge par sizing ka asar", icon: Dices, tone: "#7c3aed" },
];

/** Book heat ka rang — thanda se garam. */
function heatTone(pct: number): string {
  if (pct <= 3) return "var(--green)";
  if (pct <= 6) return "#a3e635";
  if (pct <= 10) return "var(--amber)";
  return "var(--red)";
}

function coinTint(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC")) return "linear-gradient(145deg, #f7931a, #e67e00)";
  if (s.startsWith("ETH")) return "linear-gradient(145deg, #627eea, #4b64c7)";
  if (s.startsWith("SOL")) return "linear-gradient(145deg, #9945ff, #14f195)";
  return "linear-gradient(145deg, #94a3b8, #64748b)";
}

/** Settings jo trade-se-trade nahi badalte — equity, fees, leverage. */
type Sticky = Pick<PlanInput, "equity" | "riskPct" | "leverage" | "feePct" | "maintMarginPct">;

function loadSticky(): Partial<Sticky> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RISK_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Sticky>) : {};
  } catch {
    return {};
  }
}

function saveSticky(plan: PlanInput): void {
  try {
    const sticky: Sticky = {
      equity: plan.equity,
      riskPct: plan.riskPct,
      leverage: plan.leverage,
      feePct: plan.feePct,
      maintMarginPct: plan.maintMarginPct,
    };
    window.localStorage.setItem(RISK_SETTINGS_KEY, JSON.stringify(sticky));
  } catch {
    // private mode — settings sirf is session ke liye
  }
}

export default function RiskDesk({ initialSymbol = "BTCUSDT" }: { initialSymbol?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("planner");
  const [plan, setPlan] = useState<PlanInput>(() => ({
    ...DEFAULT_PLAN,
    symbol: initialSymbol,
    ...loadSticky(),
  }));
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [fundingLive, setFundingLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  /** Kis symbol par entry/stop apne aap bhare ja chuke hain — dobara overwrite na ho. */
  const autoFilled = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => setPlans(listPlans());
    sync();
    window.addEventListener(RISK_PLANS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RISK_PLANS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const load = useCallback(async (symbol: string, refill: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [candleRes, info, funding] = await Promise.all([
        fetchCandles({ symbol, interval: "1h", limit: barsForDays(14, "1h") }),
        fetchMarketInfo(symbol).catch(() => null),
        fetchFundingFor(symbol).catch(() => null),
      ]);
      if (!candleRes.success) throw new Error(candleRes.error || "Candle data nahi mili");

      const bars = candleRes.candles ?? [];
      setCandles(bars);
      setMarket(info?.success ? info : null);

      const rate = funding?.funding_rate;
      setFundingLive(rate != null);

      const price = info?.success ? info.current_price : bars.at(-1)?.close;
      setPlan((prev) => {
        const next: PlanInput = { ...prev };
        if (rate != null) next.fundingPct = Number(rate.toFixed(4));
        if (refill && price && price > 0) {
          next.entry = Number(price.toPrecision(8));
          const a = lastAtr(bars, 14);
          if (a != null && a > 0) {
            const stop = prev.side === "long" ? price - a * 1.5 : price + a * 1.5;
            if (stop > 0) next.stop = Number(stop.toPrecision(8));
          }
        }
        return next;
      });
      if (refill) autoFilled.current = symbol;
      setSyncedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Market data load nahi hua");
      setCandles([]);
      setMarket(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(plan.symbol, autoFilled.current !== plan.symbol);
  }, [load, plan.symbol]);

  const onChange = useCallback((patch: Partial<PlanInput>) => {
    setPlan((prev) => {
      const next = { ...prev, ...patch };
      saveSticky(next);
      return next;
    });
  }, []);

  const math = useMemo(() => computePlan(plan), [plan]);
  const heat = useMemo(() => bookHeat(plans, plan.equity), [plans, plan.equity]);

  const onSave = useCallback(() => {
    if (!math.valid) return;
    savePlan({
      ...plan,
      id: newPlanId(),
      createdAt: new Date().toISOString(),
      status: "planned",
      note: "",
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }, [plan, math.valid]);

  const onAskAi = useCallback(() => {
    sessionStorage.setItem("arjunai_portfolio_prompt", buildRiskPrompt(plan, math, heat));
    router.push("/trade?tab=ai");
  }, [plan, math, heat, router]);

  const onLoadPlan = useCallback((saved: SavedPlan) => {
    autoFilled.current = saved.symbol;
    setPlan(toPlanInput(saved));
    setView("planner");
  }, []);

  return (
    <div className="space-y-4">
      <div className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Risk management</div>
          <h2 className="trade-page-title">Risk Desk</h2>
          <p className="trade-page-sub">
            Position size, liquidation buffer, funding cost aur poori book ka heat — ek jagah.
            Chart batata hai kahan ghusna hai; ye batata hai <b>kitna</b>.
          </p>
        </div>
      </div>

      {/*
        Context bar — ye numbers har view par saath rehte hain. Pehle sirf
        Planner par the, to Book ya Simulator par jaate hi pata nahi chalta
        tha ki equity kitni hai aur book pehle se kitni garam hai.
      */}
      <div className="risk-bar">
        <div className="risk-bar-cell" data-lead="true">
          <div className="risk-bar-label">Instrument</div>
          <div className="risk-bar-pair" style={{ marginTop: 6 }}>
            <span className="risk-bar-coin" style={{ background: coinTint(plan.symbol) }} aria-hidden>
              {plan.symbol.replace(/USDT$/, "").slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="risk-bar-value" style={{ marginTop: 0, fontSize: 15 }}>
                {market ? fmtNum(market.current_price) : loading ? "—" : "offline"}
                {market && (
                  <span
                    className="risk-bar-delta"
                    style={{ color: market.change_24h >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {market.change_24h >= 0 ? <TrendingUp className="w-3 h-3 inline mb-px" /> : <TrendingDown className="w-3 h-3 inline mb-px" />}
                    {market.change_24h >= 0 ? "+" : ""}{market.change_24h.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="risk-bar-sub">{symbolLabel(plan.symbol)} · 1h ATR</div>
            </div>
          </div>
        </div>

        <div className="risk-bar-cell">
          <div className="risk-bar-label">Account equity</div>
          <div className="risk-bar-value">{fmtUsd(plan.equity)}</div>
          <div className="risk-bar-sub">{plan.riskPct}% per trade = {fmtUsd((plan.equity * plan.riskPct) / 100)}</div>
        </div>

        <div className="risk-bar-cell">
          <div className="risk-bar-label">Open heat</div>
          <div className="risk-bar-value" style={{ color: heat.count ? heatTone(heat.heatPct) : undefined }}>
            {heat.heatPct.toFixed(2)}%
            {heat.heatPct > 6 && <Flame className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />}
          </div>
          <div className="risk-bar-heat" aria-hidden>
            <span
              style={{
                width: `${Math.min(100, (heat.heatPct / 12) * 100)}%`,
                background: heatTone(heat.heatPct),
              }}
            />
          </div>
        </div>

        <div className="risk-bar-cell">
          <div className="risk-bar-label">This plan</div>
          <div className="risk-bar-value" style={{ color: math.valid ? "var(--red)" : undefined }}>
            {math.valid ? `-${fmtUsd(math.netRisk)}` : "—"}
          </div>
          <div className="risk-bar-sub">
            {math.valid ? `${fmtQty(math.qty)} units · ${plan.leverage}x` : "entry + stop daalo"}
          </div>
        </div>

        <div className="risk-bar-actions">
          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            onClick={() => void load(plan.symbol, true)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      <div className="risk-tabs" role="tablist" aria-label="Risk desk views">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              data-active={view === v.id}
              onClick={() => setView(v.id)}
              className="risk-tab"
              style={{ ["--tab-tone" as string]: v.tone }}
            >
              <span className="risk-tab-icon" aria-hidden>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="risk-tab-label block">{v.label}</span>
                <span className="risk-tab-sub block">{v.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(savedFlash || syncedAt || error) && (
        <div className="flex flex-wrap items-center gap-2.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {savedFlash && (
            <span className="trade-badge trade-badge-green">
              <ShieldCheck className="w-3 h-3" />
              Book mein add ho gaya
            </span>
          )}
          {error ? (
            <span style={{ color: "var(--red)" }}>
              {error} — numbers manual daal kar bhi plan bana sakte ho.
            </span>
          ) : (
            syncedAt && <span>Synced {syncedAt}</span>
          )}
        </div>
      )}

      {view === "planner" && (
        <RiskPlanner
          plan={plan}
          onChange={onChange}
          candles={candles}
          market={market}
          fundingLive={fundingLive}
          onSave={onSave}
          onAskAi={onAskAi}
          saved={savedFlash}
        />
      )}

      {view === "book" && <RiskBook plans={plans} equity={plan.equity} onLoad={onLoadPlan} />}

      {view === "sim" && (
        <RiskSimulator
          equity={plan.equity}
          planRr={math.ladder.length ? math.ladder[0].r : null}
          planRiskPct={plan.riskPct}
        />
      )}
    </div>
  );
}
