import type { Candle } from "./cryptoApi";
import { atr } from "./indicators";

/**
 * AVPT (Anchored VWAP Pullback & Target Zones) — `backend/trading/avpt.py` ka client mirror.
 * PhenLabs Pine v6 closed-bar state machine. Live signal / chart overlays yahan se; equity
 * backtest server `avpt.py` par.
 */

export type AvptFilterMode =
  | "auto"
  | "balanced"
  | "conservative"
  | "aggressive"
  | "shallow"
  | "deep"
  | "vol_climax"
  | "custom";

export interface AvptParams {
  swingLen: number;
  maxPbPerAnchor: number;
  minImpulseAtr: number;
  filterMode: AvptFilterMode;
  customMinEr: number;
  customBandSig: number;
  targetMode: "hybrid" | "r_multiples";
  slBufferAtr: number;
  useBeRatchet: boolean;
  allowShorts: boolean;
}

export const AVPT_DEFAULTS: AvptParams = {
  swingLen: 10,
  maxPbPerAnchor: 2,
  minImpulseAtr: 1.4,
  filterMode: "vol_climax",
  customMinEr: 26,
  customBandSig: 1,
  targetMode: "hybrid",
  slBufferAtr: 0.2,
  useBeRatchet: true,
  allowShorts: true,
};

export const AVPT_KEYS = {
  avwap: "avpt_avwap",
  bandTop: "avpt_band_top",
  bandBot: "avpt_band_bot",
  stop: "avpt_stop",
  entry: "avpt_entry",
  tp1: "avpt_tp1",
} as const;

type Plan = {
  dir: 1 | -1;
  entryBar: number;
  entry: number;
  initSl: number;
  activeSl: number;
  risk: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1R: number;
  tp2R: number;
  tp3R: number;
  qual: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  status: number;
};

type Eng = {
  id: number;
  name: string;
  bandSigma: number;
  outerSigma: number;
  minErPct: number;
  minQual: number;
  slScale: number;
  minRiskAtr: number;
  minRelAct: number;
  total: number;
  wins: number;
  losses: number;
  tp1: number;
  tp2: number;
  tp3: number;
  cumR: number;
  lastDir: number;
  lastQual: number;
  lastText: string;
  active: Plan | null;
  bullIn: boolean;
  bullPbLow: number;
  bullUsed: number;
  bearIn: boolean;
  bearPbHigh: number;
  bearUsed: number;
  bullTake: boolean;
  bearTake: boolean;
};

const PROFILE_SEED: Omit<Eng, "total" | "wins" | "losses" | "tp1" | "tp2" | "tp3" | "cumR" | "lastDir" | "lastQual" | "lastText" | "active" | "bullIn" | "bullPbLow" | "bullUsed" | "bearIn" | "bearPbHigh" | "bearUsed" | "bullTake" | "bearTake">[] = [
  { id: 0, name: "Balanced", bandSigma: 1, outerSigma: 2, minErPct: 26, minQual: 52, slScale: 1, minRiskAtr: 0.35, minRelAct: 0 },
  { id: 1, name: "Conservative", bandSigma: 0.8, outerSigma: 1.75, minErPct: 35, minQual: 60, slScale: 1.15, minRiskAtr: 0.35, minRelAct: 0 },
  { id: 2, name: "Aggressive", bandSigma: 1.25, outerSigma: 2.3, minErPct: 18, minQual: 44, slScale: 0.85, minRiskAtr: 0.3, minRelAct: 0 },
  { id: 3, name: "Shallow", bandSigma: 0.65, outerSigma: 1.6, minErPct: 30, minQual: 55, slScale: 0.9, minRiskAtr: 0.3, minRelAct: 0 },
  { id: 4, name: "Deep Value", bandSigma: 1.45, outerSigma: 2.5, minErPct: 22, minQual: 48, slScale: 1.25, minRiskAtr: 0.4, minRelAct: 0 },
  { id: 5, name: "Vol Climax", bandSigma: 1, outerSigma: 2, minErPct: 24, minQual: 58, slScale: 0.95, minRiskAtr: 0.32, minRelAct: 1.25 },
];

const FILTER_IDS: Record<AvptFilterMode, number> = {
  auto: -1,
  balanced: 0,
  conservative: 1,
  aggressive: 2,
  shallow: 3,
  deep: 4,
  vol_climax: 5,
  custom: 6,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function freshEng(seed: (typeof PROFILE_SEED)[number] | Eng): Eng {
  return {
    ...seed,
    total: 0,
    wins: 0,
    losses: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    cumR: 0,
    lastDir: 0,
    lastQual: 0,
    lastText: "NONE",
    active: null,
    bullIn: false,
    bullPbLow: NaN,
    bullUsed: 0,
    bearIn: false,
    bearPbHigh: NaN,
    bearUsed: 0,
    bullTake: false,
    bearTake: false,
  };
}

function pivotHigh(h: number[], left: number, right: number, i: number): number | null {
  const center = i - right;
  if (center - left < 0) return null;
  const v = h[center];
  for (let k = center - left; k <= center + right; k++) if (k !== center && h[k] >= v) return null;
  return v;
}

function pivotLow(l: number[], left: number, right: number, i: number): number | null {
  const center = i - right;
  if (center - left < 0) return null;
  const v = l[center];
  for (let k = center - left; k <= center + right; k++) if (k !== center && l[k] <= v) return null;
  return v;
}

function closePlan(eng: Eng, plan: Plan, status: number, r: number, win: boolean) {
  plan.status = status;
  eng.total += 1;
  eng.cumR += r;
  if (win) eng.wins += 1;
  else eng.losses += 1;
  eng.active = null;
}

function resolve(eng: Eng, i: number, h: number[], l: number[], c: number[], useBe: boolean) {
  const plan = eng.active;
  if (!plan || plan.status !== 0 || i <= plan.entryBar) return;
  const d = plan.dir;
  if (d === 1) {
    if (l[i] <= plan.activeSl) {
      if (plan.tp1Hit) {
        const banked = plan.tp2Hit ? 0.5 * (plan.tp1R + plan.tp2R) : 0.5 * plan.tp1R;
        closePlan(eng, plan, 2, banked, true);
      } else closePlan(eng, plan, -1, -1, false);
      return;
    }
    if (!plan.tp1Hit && h[i] >= plan.tp1) {
      plan.tp1Hit = true;
      eng.tp1 += 1;
      if (useBe) plan.activeSl = plan.entry;
    }
    if (!plan.tp2Hit && h[i] >= plan.tp2) {
      plan.tp2Hit = true;
      eng.tp2 += 1;
    }
    if (!plan.tp3Hit && h[i] >= plan.tp3) {
      plan.tp3Hit = true;
      eng.tp3 += 1;
      closePlan(eng, plan, 1, plan.tp3R, true);
      return;
    }
    if (i - plan.entryBar >= 60) {
      if (plan.tp1Hit) closePlan(eng, plan, 2, plan.tp1R, true);
      else {
        const exp = (c[i] - plan.entry) / Math.max(plan.risk, 1e-12);
        closePlan(eng, plan, 3, exp, exp >= 0);
      }
    }
  } else {
    if (h[i] >= plan.activeSl) {
      if (plan.tp1Hit) {
        const banked = plan.tp2Hit ? 0.5 * (plan.tp1R + plan.tp2R) : 0.5 * plan.tp1R;
        closePlan(eng, plan, 2, banked, true);
      } else closePlan(eng, plan, -1, -1, false);
      return;
    }
    if (!plan.tp1Hit && l[i] <= plan.tp1) {
      plan.tp1Hit = true;
      eng.tp1 += 1;
      if (useBe) plan.activeSl = plan.entry;
    }
    if (!plan.tp2Hit && l[i] <= plan.tp2) {
      plan.tp2Hit = true;
      eng.tp2 += 1;
    }
    if (!plan.tp3Hit && l[i] <= plan.tp3) {
      plan.tp3Hit = true;
      eng.tp3 += 1;
      closePlan(eng, plan, 1, plan.tp3R, true);
      return;
    }
    if (i - plan.entryBar >= 60) {
      if (plan.tp1Hit) closePlan(eng, plan, 2, plan.tp1R, true);
      else {
        const exp = (plan.entry - c[i]) / Math.max(plan.risk, 1e-12);
        closePlan(eng, plan, 3, exp, exp >= 0);
      }
    }
  }
}

function spawn(
  eng: Eng,
  i: number,
  dir: 1 | -1,
  entry: number,
  sl: number,
  risk: number,
  tp1: number,
  tp2: number,
  tp3: number,
  tp2R: number,
  tp3R: number,
  qual: number,
  c: number[],
) {
  if (eng.active && eng.active.status === 0) {
    const prev = eng.active;
    if (prev.tp1Hit) closePlan(eng, prev, 2, prev.tp1R, true);
    else {
      const flip = prev.dir === 1 ? (c[i] - prev.entry) / Math.max(prev.risk, 1e-12) : (prev.entry - c[i]) / Math.max(prev.risk, 1e-12);
      closePlan(eng, prev, 3, flip, flip >= 0);
    }
  }
  eng.active = {
    dir,
    entryBar: i,
    entry,
    initSl: sl,
    activeSl: sl,
    risk,
    tp1,
    tp2,
    tp3,
    tp1R: 1,
    tp2R,
    tp3R,
    qual,
    tp1Hit: false,
    tp2Hit: false,
    tp3Hit: false,
    status: 0,
  };
  if (dir === 1) {
    eng.bullIn = false;
    eng.bullUsed += 1;
  } else {
    eng.bearIn = false;
    eng.bearUsed += 1;
  }
}

export interface AvptReplay {
  candles: Candle[];
  lastClosed: number;
  selected: Eng;
  bias: number;
  er: number | null;
  avwap: number | null;
  signal: "long" | "short" | null;
  quality: number | null;
  pending: {
    side: "long" | "short";
    entry: number;
    stop: number;
    tp1: number;
    tp2: number;
    tp3: number;
    qual: number;
  } | null;
  winRate: number;
  cumNetR: number;
  atr: number | null;
}

export function replayAvpt(candles: Candle[], params: AvptParams, intervalMs: number, nowMs = Date.now()): AvptReplay {
  const n = candles.length;
  const o = candles.map((x) => x.open);
  const h = candles.map((x) => x.high);
  const l = candles.map((x) => x.low);
  const c = candles.map((x) => x.close);
  const v = candles.map((x) => x.volume ?? 0);
  const a = atr(candles, 14);

  const engines: Eng[] = PROFILE_SEED.map(freshEng);
  engines.push(
    freshEng({
      id: 6,
      name: "Custom",
      bandSigma: params.customBandSig,
      outerSigma: params.customBandSig + 1,
      minErPct: params.customMinEr,
      minQual: 50,
      slScale: 1,
      minRiskAtr: 0.35,
      minRelAct: 0,
    }),
  );

  let bullOn = false;
  let bearOn = false;
  let bullBar = -1;
  let bearBar = -1;
  let bullPx = NaN;
  let bearPx = NaN;
  let bullSumWp = 0;
  let bullSumWp2 = 0;
  let bullSumW = 0;
  let bearSumWp = 0;
  let bearSumWp2 = 0;
  let bearSumW = 0;
  let bullAvwap = NaN;
  let bearAvwap = NaN;
  let bullStd = 0;
  let bearStd = 0;
  let bullImpHi = NaN;
  let bearImpLo = NaN;
  let bullArmed = false;
  let bearArmed = false;
  let bias = 0;

  const avwapLine: (number | null)[] = Array(n).fill(null);
  const bandTop: (number | null)[] = Array(n).fill(null);
  const bandBot: (number | null)[] = Array(n).fill(null);
  const stopLine: (number | null)[] = Array(n).fill(null);
  const entryLine: (number | null)[] = Array(n).fill(null);
  const tp1Line: (number | null)[] = Array(n).fill(null);
  const longSig = Array(n).fill(false);
  const shortSig = Array(n).fill(false);
  const erLine: (number | null)[] = Array(n).fill(null);
  const selectedIds = Array(n).fill(0);

  let lastClosed = n - 1;
  while (lastClosed >= 0 && candles[lastClosed].time + intervalMs > nowMs) lastClosed--;

  const swing = params.swingLen;
  const maxPb = params.maxPbPerAnchor;
  const mintick = 1e-8;

  const volSma = (i: number) => {
    if (i < 19) return NaN;
    let s = 0;
    for (let k = i - 19; k <= i; k++) s += v[k];
    return s / 20;
  };

  const selectId = () => {
    const fixed = FILTER_IDS[params.filterMode];
    if (fixed >= 0) return fixed;
    let bestWr = -1;
    let bestR = -1e9;
    let bestId = 0;
    for (const e of engines.slice(0, 6)) {
      if (e.total >= 3) {
        const wr = (100 * e.wins) / e.total;
        if (wr > bestWr || (wr === bestWr && e.cumR > bestR)) {
          bestWr = wr;
          bestR = e.cumR;
          bestId = e.id;
        }
      }
    }
    if (bestWr < 0) {
      for (const e of engines.slice(0, 6)) {
        if (e.total > 0) {
          const wr = (100 * e.wins) / e.total;
          if (wr > bestWr || (wr === bestWr && e.cumR > bestR)) {
            bestWr = wr;
            bestR = e.cumR;
            bestId = e.id;
          }
        }
      }
    }
    return bestWr >= 0 ? bestId : 0;
  };

  for (let i = 0; i <= Math.max(lastClosed, 0); i++) {
    const safeAtr = Number.isFinite(a[i]) && (a[i] as number) > 0 ? (a[i] as number) : Math.max(h[i] - l[i], mintick * 10);
    const barSpan = Math.max(h[i] - l[i], mintick);
    const vs = volSma(i);
    const hasVol = v[i] > 0 && Number.isFinite(vs) && vs > 0;
    const relAct = hasVol ? v[i] / vs : barSpan / Math.max(safeAtr, mintick);
    const actNorm = clamp(relAct / 2, 0, 1);
    const barW = hasVol ? Math.max(v[i], 1e-6) : Math.max(relAct, 0.1);
    const hlc3 = (h[i] + l[i] + c[i]) / 3;

    let erPct = 0;
    if (i >= 10) {
      const net = Math.abs(c[i] - c[i - 10]);
      let path = 0;
      for (let j = i - 9; j <= i; j++) path += Math.abs(c[j] - c[j - 1]);
      erPct = path > 0 ? clamp((net / path) * 100, 0, 100) : 0;
    }
    erLine[i] = erPct;
    const erNorm = clamp(erPct / 55, 0, 1);
    const bullQual = Math.round(clamp((0.4 * clamp((c[i] - l[i]) / barSpan, 0, 1) + 0.35 * erNorm + 0.25 * actNorm) * 100 * (c[i] > o[i] ? 1 : 0.85), 0, 100) * 10) / 10;
    const bearQual = Math.round(clamp((0.4 * clamp((h[i] - c[i]) / barSpan, 0, 1) + 0.35 * erNorm + 0.25 * actNorm) * 100 * (c[i] < o[i] ? 1 : 0.85), 0, 100) * 10) / 10;
    const five = i >= 5 ? (c[i] - c[i - 5]) / Math.max(safeAtr, mintick) : 0;
    const bearCrash = five < -3.6 && c[i] < o[i];
    const bullCrash = five > 3.6 && c[i] > o[i];
    const prevHigh = i ? h[i - 1] : h[i];
    const prevLow = i ? l[i - 1] : l[i];

    for (const eng of engines) {
      eng.bullTake = false;
      eng.bearTake = false;
      resolve(eng, i, h, l, c, params.useBeRatchet);
    }

    if (bullOn) {
      bullSumWp += barW * hlc3;
      bullSumWp2 += barW * hlc3 * hlc3;
      bullSumW += barW;
      bullAvwap = bullSumWp / Math.max(bullSumW, 1e-9);
      bullStd = Math.max(Math.sqrt(Math.max(0, bullSumWp2 / Math.max(bullSumW, 1e-9) - bullAvwap * bullAvwap)), safeAtr * 0.25);
      if (!Number.isFinite(bullImpHi) || h[i] >= bullImpHi) bullImpHi = h[i];
      if (!bullArmed && bullImpHi - bullPx >= params.minImpulseAtr * safeAtr) bullArmed = true;
      if (c[i] < bullPx || c[i] < bullAvwap - 2.6 * bullStd) {
        bullOn = false;
        bullArmed = false;
        for (const eng of engines) eng.bullIn = false;
      }
    }
    if (bearOn) {
      bearSumWp += barW * hlc3;
      bearSumWp2 += barW * hlc3 * hlc3;
      bearSumW += barW;
      bearAvwap = bearSumWp / Math.max(bearSumW, 1e-9);
      bearStd = Math.max(Math.sqrt(Math.max(0, bearSumWp2 / Math.max(bearSumW, 1e-9) - bearAvwap * bearAvwap)), safeAtr * 0.25);
      if (!Number.isFinite(bearImpLo) || l[i] <= bearImpLo) bearImpLo = l[i];
      if (!bearArmed && bearPx - bearImpLo >= params.minImpulseAtr * safeAtr) bearArmed = true;
      if (c[i] > bearPx || c[i] > bearAvwap + 2.6 * bearStd) {
        bearOn = false;
        bearArmed = false;
        for (const eng of engines) eng.bearIn = false;
      }
    }

    const pl = pivotLow(l, swing, swing, i);
    const ph = pivotHigh(h, swing, swing, i);
    const pBar = i - swing;
    const bal = engines[0];

    if (pl != null && pBar >= 0) {
      const replace =
        !bullOn || pl < bullPx || bal.bullUsed >= maxPb || (bullArmed && pl > bullPx && h[i] - pl >= params.minImpulseAtr * safeAtr);
      if (replace && c[i] > pl) {
        let sWp = 0;
        let sWp2 = 0;
        let sW = 0;
        let mxHi = h[i];
        for (let k = pBar; k <= i; k++) {
          const spanK = Math.max(h[k] - l[k], mintick);
          const vsK = volSma(k);
          const hasVk = v[k] > 0 && Number.isFinite(vsK) && vsK > 0;
          const wk = hasVk ? Math.max(v[k], 1e-6) : Math.max(spanK / Math.max(safeAtr, mintick), 0.1);
          const pk = (h[k] + l[k] + c[k]) / 3;
          sWp += wk * pk;
          sWp2 += wk * pk * pk;
          sW += wk;
          if (h[k] >= mxHi) mxHi = h[k];
        }
        bullOn = true;
        bullBar = pBar;
        bullPx = pl;
        bullSumWp = sWp;
        bullSumWp2 = sWp2;
        bullSumW = sW;
        bullAvwap = sWp / Math.max(sW, 1e-9);
        bullStd = Math.max(Math.sqrt(Math.max(0, sWp2 / Math.max(sW, 1e-9) - bullAvwap * bullAvwap)), safeAtr * 0.25);
        bullImpHi = mxHi;
        bullArmed = mxHi - pl >= params.minImpulseAtr * safeAtr;
        for (const eng of engines) {
          eng.bullIn = false;
          eng.bullPbLow = NaN;
          eng.bullUsed = 0;
        }
      }
    }

    if (ph != null && pBar >= 0) {
      const replace =
        !bearOn || ph > bearPx || bal.bearUsed >= maxPb || (bearArmed && ph < bearPx && ph - l[i] >= params.minImpulseAtr * safeAtr);
      if (replace && c[i] < ph) {
        let sWp = 0;
        let sWp2 = 0;
        let sW = 0;
        let mnLo = l[i];
        for (let k = pBar; k <= i; k++) {
          const spanK = Math.max(h[k] - l[k], mintick);
          const vsK = volSma(k);
          const hasVk = v[k] > 0 && Number.isFinite(vsK) && vsK > 0;
          const wk = hasVk ? Math.max(v[k], 1e-6) : Math.max(spanK / Math.max(safeAtr, mintick), 0.1);
          const pk = (h[k] + l[k] + c[k]) / 3;
          sWp += wk * pk;
          sWp2 += wk * pk * pk;
          sW += wk;
          if (l[k] <= mnLo) mnLo = l[k];
        }
        bearOn = true;
        bearBar = pBar;
        bearPx = ph;
        bearSumWp = sWp;
        bearSumWp2 = sWp2;
        bearSumW = sW;
        bearAvwap = sWp / Math.max(sW, 1e-9);
        bearStd = Math.max(Math.sqrt(Math.max(0, sWp2 / Math.max(sW, 1e-9) - bearAvwap * bearAvwap)), safeAtr * 0.25);
        bearImpLo = mnLo;
        bearArmed = ph - mnLo >= params.minImpulseAtr * safeAtr;
        for (const eng of engines) {
          eng.bearIn = false;
          eng.bearPbHigh = NaN;
          eng.bearUsed = 0;
        }
      }
    }

    if (bullOn && bullArmed && !(bearOn && bearArmed)) bias = 1;
    else if (bearOn && bearArmed && !(bullOn && bullArmed)) bias = -1;
    else if (bullOn && bullArmed && bearOn && bearArmed) bias = bullBar >= bearBar ? 1 : -1;
    else if (bullOn) bias = 1;
    else if (bearOn) bias = -1;
    else bias = 0;

    const cust = engines[6];
    cust.bandSigma = params.customBandSig;
    cust.outerSigma = params.customBandSig + 1;
    cust.minErPct = params.customMinEr;

    for (const eng of engines) {
      const openDir = eng.active && eng.active.status === 0 ? eng.active.dir : -99;
      if (bullOn && bullArmed && eng.bullUsed < maxPb && Number.isFinite(bullAvwap)) {
        const upper = bullAvwap + eng.bandSigma * bullStd;
        const lowerDef = bullAvwap - eng.outerSigma * bullStd;
        if (l[i] <= upper && c[i] >= lowerDef && c[i] > bullPx && h[i] < bullImpHi) {
          if (!eng.bullIn) {
            eng.bullIn = true;
            eng.bullPbLow = l[i];
          } else if (l[i] < (Number.isFinite(eng.bullPbLow) ? eng.bullPbLow : l[i])) eng.bullPbLow = l[i];
        } else if (c[i] < lowerDef) eng.bullIn = false;

        const reclaim = eng.bullIn && c[i] > bullAvwap && c[i] > o[i] && c[i] >= prevHigh - 0.2 * safeAtr;
        if (reclaim && openDir !== 1) {
          const impLeg = Math.max(bullImpHi - bullPx, safeAtr * 0.5);
          const pbLow = Number.isFinite(eng.bullPbLow) ? eng.bullPbLow : l[i];
          const pbDepth = (bullImpHi - pbLow) / impLeg;
          const ok =
            erPct >= eng.minErPct && bullQual >= eng.minQual && relAct >= eng.minRelAct && pbDepth >= 0.12 && pbDepth <= 0.85 && !bearCrash;
          if (ok) {
            eng.bullTake = true;
            eng.lastDir = 1;
            eng.lastQual = bullQual;
            eng.lastText = `BUY (AVWAP · ${bullQual.toFixed(0)}%)`;
          } else {
            eng.bullIn = false;
            eng.lastText = `SKIP (CHOP · ${erPct.toFixed(0)}%)`;
          }
        }
      }

      if (params.allowShorts && bearOn && bearArmed && eng.bearUsed < maxPb && Number.isFinite(bearAvwap) && !eng.bullTake) {
        const lower = bearAvwap - eng.bandSigma * bearStd;
        const upperDef = bearAvwap + eng.outerSigma * bearStd;
        if (h[i] >= lower && c[i] <= upperDef && c[i] < bearPx && l[i] > bearImpLo) {
          if (!eng.bearIn) {
            eng.bearIn = true;
            eng.bearPbHigh = h[i];
          } else if (h[i] > (Number.isFinite(eng.bearPbHigh) ? eng.bearPbHigh : h[i])) eng.bearPbHigh = h[i];
        } else if (c[i] > upperDef) eng.bearIn = false;

        const reclaim = eng.bearIn && c[i] < bearAvwap && c[i] < o[i] && c[i] <= prevLow + 0.2 * safeAtr;
        if (reclaim && openDir !== -1) {
          const impLeg = Math.max(bearPx - bearImpLo, safeAtr * 0.5);
          const pbHi = Number.isFinite(eng.bearPbHigh) ? eng.bearPbHigh : h[i];
          const pbDepth = (pbHi - bearImpLo) / impLeg;
          const ok =
            erPct >= eng.minErPct && bearQual >= eng.minQual && relAct >= eng.minRelAct && pbDepth >= 0.12 && pbDepth <= 0.85 && !bullCrash;
          if (ok) {
            eng.bearTake = true;
            eng.lastDir = -1;
            eng.lastQual = bearQual;
            eng.lastText = `SELL (AVWAP · ${bearQual.toFixed(0)}%)`;
          } else {
            eng.bearIn = false;
            eng.lastText = `SKIP (CHOP · ${erPct.toFixed(0)}%)`;
          }
        }
      }

      if (eng.bullTake || eng.bearTake) {
        const sDir: 1 | -1 = eng.bullTake ? 1 : -1;
        const entryP = c[i];
        const effSl = params.slBufferAtr * eng.slScale;
        const rawSl =
          sDir === 1
            ? Math.min(Number.isFinite(eng.bullPbLow) ? eng.bullPbLow : l[i], bullAvwap - eng.bandSigma * bullStd) - effSl * safeAtr
            : Math.max(Number.isFinite(eng.bearPbHigh) ? eng.bearPbHigh : h[i], bearAvwap + eng.bandSigma * bearStd) + effSl * safeAtr;
        const risk = clamp(Math.abs(entryP - rawSl), safeAtr * eng.minRiskAtr, safeAtr * 3);
        const finalSl = sDir === 1 ? entryP - risk : entryP + risk;
        let tp1 = entryP + sDir * risk;
        let tp2 = entryP + sDir * 2 * risk;
        let tp3 = entryP + sDir * 3 * risk;
        let tp2R = 2;
        let tp3R = 3;
        if (params.targetMode === "hybrid") {
          if (sDir === 1 && Number.isFinite(bullImpHi)) {
            const distR = (bullImpHi - entryP) / risk;
            if (distR >= 1.3 && distR <= 2.4) {
              tp2 = bullImpHi;
              tp2R = Math.round(distR * 10) / 10;
            } else if (distR > 2.4 && distR <= 4.5) {
              tp3 = bullImpHi;
              tp3R = Math.round(distR * 10) / 10;
            }
          } else if (sDir === -1 && Number.isFinite(bearImpLo)) {
            const distR = (entryP - bearImpLo) / risk;
            if (distR >= 1.3 && distR <= 2.4) {
              tp2 = bearImpLo;
              tp2R = Math.round(distR * 10) / 10;
            } else if (distR > 2.4 && distR <= 4.5) {
              tp3 = bearImpLo;
              tp3R = Math.round(distR * 10) / 10;
            }
          }
        }
        spawn(eng, i, sDir, entryP, finalSl, risk, tp1, tp2, tp3, tp2R, tp3R, sDir === 1 ? bullQual : bearQual, c);
      }
    }

    const sid = selectId();
    selectedIds[i] = sid;
    const active = engines[sid];
    if (active.bullTake) longSig[i] = true;
    if (active.bearTake) shortSig[i] = true;
    const liveAv = bias === 1 ? bullAvwap : bias === -1 ? bearAvwap : NaN;
    const liveSg = bias === 1 ? bullStd : bias === -1 ? bearStd : NaN;
    avwapLine[i] = Number.isFinite(liveAv) ? liveAv : null;
    if (Number.isFinite(liveAv) && Number.isFinite(liveSg)) {
      bandTop[i] = liveAv + active.bandSigma * liveSg;
      bandBot[i] = liveAv - active.bandSigma * liveSg;
    }
    if (active.active && active.active.status === 0) {
      stopLine[i] = active.active.activeSl;
      entryLine[i] = active.active.entry;
      tp1Line[i] = active.active.tp1;
    }
  }

  const ref = lastClosed >= 0 ? lastClosed : n - 1;
  const selected = engines[selectedIds[ref] ?? 0];
  const sig = longSig[ref] ? "long" : shortSig[ref] ? "short" : null;
  let pending: AvptReplay["pending"] = null;
  if (sig && selected.active && selected.active.entryBar === ref) {
    const pl = selected.active;
    pending = {
      side: sig,
      entry: pl.entry,
      stop: pl.initSl,
      tp1: pl.tp1,
      tp2: pl.tp2,
      tp3: pl.tp3,
      qual: pl.qual,
    };
  }

  const decorated = candles.map((candle, i) => ({
    ...candle,
    [AVPT_KEYS.avwap]: avwapLine[i],
    [AVPT_KEYS.bandTop]: bandTop[i],
    [AVPT_KEYS.bandBot]: bandBot[i],
    [AVPT_KEYS.stop]: stopLine[i],
    [AVPT_KEYS.entry]: entryLine[i],
    [AVPT_KEYS.tp1]: tp1Line[i],
  })) as Candle[];

  return {
    candles: decorated,
    lastClosed,
    selected,
    bias,
    er: erLine[ref],
    avwap: avwapLine[ref],
    signal: selected.active && selected.active.status === 0 ? (selected.active.dir === 1 ? "long" : "short") : sig,
    quality: selected.lastQual || null,
    pending,
    winRate: selected.total > 0 ? (100 * selected.wins) / selected.total : 0,
    cumNetR: selected.cumR,
    atr: a[ref] ?? null,
  };
}
