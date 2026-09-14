"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Calculator, Dices, RefreshCw, ShieldCheck } from "lucide-react";
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
  listPlans,
  lastAtr,
  newPlanId,
  savePlan,
  toPlanInput,
  type PlanInput,
  type SavedPlan,
} from "@/lib/risk";

type View = "planner" | "book" | "sim";

const VIEWS: { id: View; label: string; icon: typeof Calculator }[] = [
  { id: "planner", label: "Position Planner", icon: Calculator },
  { id: "book", label: "Risk Book", icon: BookOpen },
  { id: "sim", label: "Ruin Simulator", icon: Dices },
];

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
        <div className="trade-page-actions">
          <span className={`trade-badge ${heat.heatPct > 6 ? "trade-badge-red" : "trade-badge-neutral"}`}>
            Heat {heat.heatPct.toFixed(2)}%
          </span>
          <span className="trade-badge trade-badge-neutral">
            {symbolLabel(plan.symbol)} · 1h ATR
          </span>
          <button
            type="button"
            className="trade-btn trade-btn-ghost trade-size-sm"
            onClick={() => void load(plan.symbol, true)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin-slow" : ""}`} />
            Sync live
          </button>
        </div>
      </div>

      <div className="trade-panel">
        <div className="trade-toolbar">
          <div className="trade-seg overflow-x-auto scrollbar-hide">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  data-active={view === v.id}
                  onClick={() => setView(v.id)}
                  className="trade-seg-btn"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-w-[8px]" />

          {savedFlash && (
            <span className="trade-badge trade-badge-green">
              <ShieldCheck className="w-3 h-3" />
              Book mein add ho gaya
            </span>
          )}
          {syncedAt && <span className="trade-toolbar-meta">Synced {syncedAt}</span>}
        </div>

        {error && (
          <p className="px-4 py-2.5 text-[12.5px]" style={{ color: "var(--red)", borderTop: "1px solid var(--tr-line-soft)" }}>
            {error} — numbers manual daal kar bhi plan bana sakte ho.
          </p>
        )}
      </div>

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
