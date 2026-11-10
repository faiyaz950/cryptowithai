"""
Anchored VWAP Pullback & Target Zones (AVPT) — PhenLabs Pine v6 ka closed-bar port.

Source: https://www.tradingview.com/script/CcLBQ0PP-Anchored-VWAP-Pullback-Target-Zones-PhenLabs/
License: MPL-2.0 (© PhenLabs)

State machine: structural swing → AVWAP ±σ value band → Kaufman-ER + quality reclaim →
ENTRY / SL / TP1–TP3 (BE ratchet after TP1). Saat filter profiles parallel; Auto-Optimize
TP1+ win rate se winner chunta hai.

Fees / slippage / funding `trend_rider` jaisi — equity backtest ek hi taraazu par.
Frontend mirror: `frontend/src/lib/avpt.ts`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from trend_rider import (
    FEE_RATE,
    FUNDING_PER_8H,
    SLIPPAGE,
    WARMUP_BARS,
    _stats,
    _trade_dict,
    atr as wilder_atr,
)

STRATEGY = "avpt-pullback"

DEFAULTS = {
    "swing_len": 10,
    "max_pb_per_anchor": 2,
    "min_impulse_atr": 1.40,
    "filter_mode": "vol_climax",  # auto | balanced | conservative | aggressive | shallow | deep | vol_climax | custom
    "custom_min_er": 26.0,
    "custom_band_sig": 1.0,
    "target_mode": "hybrid",  # hybrid | r_multiples
    "sl_buffer_atr": 0.20,
    "use_be_ratchet": True,
    "allow_shorts": True,
    "risk_pct": 1.0,
    "max_leverage": 3.0,
    "atr_period": 14,
}

# id, name, band_σ, outer_σ, min_er%, min_qual, sl_scale, min_risk_atr, min_rel_act
PROFILES = [
    (0, "Balanced", 1.00, 2.00, 26.0, 52.0, 1.00, 0.35, 0.00),
    (1, "Conservative", 0.80, 1.75, 35.0, 60.0, 1.15, 0.35, 0.00),
    (2, "Aggressive", 1.25, 2.30, 18.0, 44.0, 0.85, 0.30, 0.00),
    (3, "Shallow", 0.65, 1.60, 30.0, 55.0, 0.90, 0.30, 0.00),
    (4, "Deep Value", 1.45, 2.50, 22.0, 48.0, 1.25, 0.40, 0.00),
    (5, "Vol Climax", 1.00, 2.00, 24.0, 58.0, 0.95, 0.32, 1.25),
]

FILTER_IDS = {
    "auto": -1,
    "balanced": 0,
    "conservative": 1,
    "aggressive": 2,
    "shallow": 3,
    "deep": 4,
    "vol_climax": 5,
    "custom": 6,
}

__all__ = [
    "DEFAULTS",
    "PROFILES",
    "STRATEGY",
    "WARMUP_BARS",
    "indicators",
    "min_bars",
    "run",
    "simulate",
]


def min_bars(p=None):
    swing = int((p or DEFAULTS).get("swing_len", 10))
    return max(80, swing * 4 + 30)


def _clamp(v, lo, hi):
    return min(max(v, lo), hi)


def _sma(x, length):
    n = len(x)
    out = np.full(n, np.nan)
    if length <= 0 or n < length:
        return out
    csum = np.cumsum(np.nan_to_num(x, nan=0.0))
    out[length - 1 :] = (csum[length - 1 :] - np.concatenate([[0.0], csum[:-length]])) / length
    return out


@dataclass
class Plan:
    prof_id: int
    direction: int
    entry_bar: int
    entry: float
    init_sl: float
    active_sl: float
    risk: float
    tp1: float
    tp2: float
    tp3: float
    tp1_r: float = 1.0
    tp2_r: float = 2.0
    tp3_r: float = 3.0
    tp_is_mag: bool = False
    qual_pct: float = 0.0
    tp1_hit: bool = False
    tp2_hit: bool = False
    tp3_hit: bool = False
    sl_hit: bool = False
    be_hit: bool = False
    status: int = 0  # 0 active, 1 tp3, 2 partial, -1 loss, 3 expired/flip
    end_bar: int = -1
    realized_r: float = 0.0


@dataclass
class Engine:
    id: int
    name: str
    band_sigma: float
    outer_sigma: float
    min_er_pct: float
    min_qual: float
    sl_scale: float
    min_risk_atr: float
    min_rel_act: float
    total_trades: int = 0
    win_trades: int = 0
    loss_trades: int = 0
    tp1_count: int = 0
    tp2_count: int = 0
    tp3_count: int = 0
    cum_net_r: float = 0.0
    last_sig_dir: int = 0
    last_sig_qual: float = 0.0
    last_sig_text: str = "NONE"
    active: Optional[Plan] = None
    bull_in_zone: bool = False
    bull_pb_low: float = float("nan")
    bull_pb_used: int = 0
    bear_in_zone: bool = False
    bear_pb_high: float = float("nan")
    bear_pb_used: int = 0
    bar_bull_take: bool = False
    bar_bear_take: bool = False
    closed_plans: List[Plan] = field(default_factory=list)


def _new_engines(p):
    engines = []
    for row in PROFILES:
        engines.append(Engine(*row))
    engines.append(
        Engine(
            6,
            "Custom",
            float(p["custom_band_sig"]),
            float(p["custom_band_sig"]) + 1.0,
            float(p["custom_min_er"]),
            50.0,
            1.0,
            0.35,
            0.0,
        )
    )
    return engines


def _pivot_high(h, left, right, i):
    """Confirmed pivot high at i-right (needs left+right lookaround)."""
    center = i - right
    if center - left < 0 or center < 0:
        return None
    v = h[center]
    for k in range(center - left, center + right + 1):
        if k != center and h[k] >= v:
            return None
    return float(v)


def _pivot_low(l, left, right, i):
    center = i - right
    if center - left < 0 or center < 0:
        return None
    v = l[center]
    for k in range(center - left, center + right + 1):
        if k != center and l[k] <= v:
            return None
    return float(v)


def _close_plan(eng: Engine, plan: Plan, status: int, realized_r: float, bar: int, win: bool):
    plan.status = status
    plan.end_bar = bar
    plan.realized_r = realized_r
    eng.total_trades += 1
    eng.cum_net_r += realized_r
    if win:
        eng.win_trades += 1
    else:
        eng.loss_trades += 1
    eng.closed_plans.append(plan)
    eng.active = None


def _resolve_active(eng: Engine, i, o, h, l, c, use_be):
    plan = eng.active
    if plan is None or plan.status != 0 or i <= plan.entry_bar:
        return
    d = plan.direction
    if d == 1:
        if l[i] <= plan.active_sl:
            if plan.tp1_hit:
                plan.be_hit = True
                banked = 0.5 * (plan.tp1_r + plan.tp2_r) if plan.tp2_hit else 0.5 * plan.tp1_r
                _close_plan(eng, plan, 2, banked, i, True)
            else:
                plan.sl_hit = True
                _close_plan(eng, plan, -1, -1.0, i, False)
            return
        if not plan.tp1_hit and h[i] >= plan.tp1:
            plan.tp1_hit = True
            eng.tp1_count += 1
            if use_be:
                plan.active_sl = plan.entry
        if not plan.tp2_hit and h[i] >= plan.tp2:
            plan.tp2_hit = True
            eng.tp2_count += 1
        if not plan.tp3_hit and h[i] >= plan.tp3:
            plan.tp3_hit = True
            eng.tp3_count += 1
            _close_plan(eng, plan, 1, plan.tp3_r, i, True)
            return
        if (i - plan.entry_bar) >= 60:
            if plan.tp1_hit:
                _close_plan(eng, plan, 2, plan.tp1_r, i, True)
            else:
                exp_r = (c[i] - plan.entry) / max(plan.risk, 1e-12)
                _close_plan(eng, plan, 3, exp_r, i, exp_r >= 0)
    else:
        if h[i] >= plan.active_sl:
            if plan.tp1_hit:
                plan.be_hit = True
                banked = 0.5 * (plan.tp1_r + plan.tp2_r) if plan.tp2_hit else 0.5 * plan.tp1_r
                _close_plan(eng, plan, 2, banked, i, True)
            else:
                plan.sl_hit = True
                _close_plan(eng, plan, -1, -1.0, i, False)
            return
        if not plan.tp1_hit and l[i] <= plan.tp1:
            plan.tp1_hit = True
            eng.tp1_count += 1
            if use_be:
                plan.active_sl = plan.entry
        if not plan.tp2_hit and l[i] <= plan.tp2:
            plan.tp2_hit = True
            eng.tp2_count += 1
        if not plan.tp3_hit and l[i] <= plan.tp3:
            plan.tp3_hit = True
            eng.tp3_count += 1
            _close_plan(eng, plan, 1, plan.tp3_r, i, True)
            return
        if (i - plan.entry_bar) >= 60:
            if plan.tp1_hit:
                _close_plan(eng, plan, 2, plan.tp1_r, i, True)
            else:
                exp_r = (plan.entry - c[i]) / max(plan.risk, 1e-12)
                _close_plan(eng, plan, 3, exp_r, i, exp_r >= 0)


def _spawn(eng: Engine, i, direction, entry, final_sl, risk, tp1, tp2, tp3, tp2_r, tp3_r, is_mag, qual, c):
    if eng.active is not None and eng.active.status == 0:
        prev = eng.active
        if prev.tp1_hit:
            _close_plan(eng, prev, 2, prev.tp1_r, i, True)
        else:
            flip_r = (c[i] - prev.entry) / max(prev.risk, 1e-12) if prev.direction == 1 else (prev.entry - c[i]) / max(prev.risk, 1e-12)
            _close_plan(eng, prev, 3, flip_r, i, flip_r >= 0)
    eng.active = Plan(
        prof_id=eng.id,
        direction=direction,
        entry_bar=i,
        entry=entry,
        init_sl=final_sl,
        active_sl=final_sl,
        risk=risk,
        tp1=tp1,
        tp2=tp2,
        tp3=tp3,
        tp2_r=tp2_r,
        tp3_r=tp3_r,
        tp_is_mag=is_mag,
        qual_pct=qual,
    )
    if direction == 1:
        eng.bull_in_zone = False
        eng.bull_pb_used += 1
    else:
        eng.bear_in_zone = False
        eng.bear_pb_used += 1


def run(o, h, l, c, v=None, params=None, times=None):
    """
    Full closed-bar AVPT state machine. Returns engines, selected profile, live AVWAP lines,
    and per-bar signal from the selected (or auto) engine.
    """
    p = {**DEFAULTS, **(params or {})}
    o = np.asarray(o, dtype=float)
    h = np.asarray(h, dtype=float)
    l = np.asarray(l, dtype=float)
    c = np.asarray(c, dtype=float)
    n = len(c)
    if v is None:
        v = np.zeros(n)
    else:
        v = np.asarray(v, dtype=float)

    swing = int(p["swing_len"])
    max_pb = int(p["max_pb_per_anchor"])
    min_imp = float(p["min_impulse_atr"])
    sl_buf = float(p["sl_buffer_atr"])
    use_be = bool(p["use_be_ratchet"])
    hybrid = str(p["target_mode"]).lower() == "hybrid"
    allow_shorts = bool(p["allow_shorts"])
    mintick = 1e-8

    atr14 = wilder_atr(h, l, c, int(p["atr_period"]))
    vol_sma = _sma(v, 20)
    engines = _new_engines(p)

    # Shared anchors
    bull_on = bear_on = False
    bull_bar = bear_bar = -1
    bull_px = bear_px = float("nan")
    bull_sum_wp = bull_sum_wp2 = bull_sum_w = 0.0
    bear_sum_wp = bear_sum_wp2 = bear_sum_w = 0.0
    bull_avwap = bear_avwap = float("nan")
    bull_std = bear_std = 0.0
    bull_imp_hi = bear_imp_lo = float("nan")
    bull_armed = bear_armed = False
    bias = 0

    long_sig = np.zeros(n, dtype=bool)
    short_sig = np.zeros(n, dtype=bool)
    avwap_line = np.full(n, np.nan)
    band_top = np.full(n, np.nan)
    band_bot = np.full(n, np.nan)
    er_line = np.full(n, np.nan)
    selected_ids = np.zeros(n, dtype=int)
    stop_line = np.full(n, np.nan)
    entry_line = np.full(n, np.nan)
    tp1_line = np.full(n, np.nan)

    def select_engine():
        mode = str(p["filter_mode"]).lower()
        fixed = FILTER_IDS.get(mode, -1)
        if fixed >= 0:
            return fixed
        best_wr, best_r, best_id = -1.0, -1e9, 0
        for e in engines[:6]:
            if e.total_trades >= 3:
                wr = 100.0 * e.win_trades / e.total_trades
                if wr > best_wr or (wr == best_wr and e.cum_net_r > best_r):
                    best_wr, best_r, best_id = wr, e.cum_net_r, e.id
        if best_wr < 0:
            for e in engines[:3]:
                if e.total_trades > 0:
                    wr = 100.0 * e.win_trades / e.total_trades
                    if wr > best_wr or (wr == best_wr and e.cum_net_r > best_r):
                        best_wr, best_r, best_id = wr, e.cum_net_r, e.id
        if best_wr < 0:
            for e in engines[:6]:
                if e.total_trades > 0:
                    wr = 100.0 * e.win_trades / e.total_trades
                    if wr > best_wr or (wr == best_wr and e.cum_net_r > best_r):
                        best_wr, best_r, best_id = wr, e.cum_net_r, e.id
        return best_id if best_wr >= 0 else 0

    for i in range(n):
        safe_atr = atr14[i] if math.isfinite(atr14[i]) and atr14[i] > 0 else max(h[i] - l[i], mintick * 10)
        bar_span = max(h[i] - l[i], mintick)
        has_vol = math.isfinite(v[i]) and v[i] > 0 and math.isfinite(vol_sma[i]) and vol_sma[i] > 0
        rel_act = (v[i] / vol_sma[i]) if has_vol else (bar_span / max(safe_atr, mintick))
        act_norm = _clamp(rel_act / 2.0, 0.0, 1.0)
        bar_w = max(v[i], 1e-6) if has_vol else max(rel_act, 0.1)
        hlc3 = (h[i] + l[i] + c[i]) / 3.0

        # Kaufman ER (10)
        er_len = 10
        if i >= er_len:
            net = abs(c[i] - c[i - er_len])
            path = sum(abs(c[j] - c[j - 1]) for j in range(i - er_len + 1, i + 1))
            er_pct = _clamp((net / path) * 100.0, 0.0, 100.0) if path > 0 else 0.0
        else:
            er_pct = 0.0
        er_line[i] = er_pct
        er_norm = _clamp(er_pct / 55.0, 0.0, 1.0)
        bull_close_share = _clamp((c[i] - l[i]) / bar_span, 0.0, 1.0)
        bear_close_share = _clamp((h[i] - c[i]) / bar_span, 0.0, 1.0)
        bull_qual = round(
            _clamp((0.40 * bull_close_share + 0.35 * er_norm + 0.25 * act_norm) * 100.0 * (1.0 if c[i] > o[i] else 0.85), 0, 100),
            1,
        )
        bear_qual = round(
            _clamp((0.40 * bear_close_share + 0.35 * er_norm + 0.25 * act_norm) * 100.0 * (1.0 if c[i] < o[i] else 0.85), 0, 100),
            1,
        )

        five = (c[i] - c[i - 5]) / max(safe_atr, mintick) if i >= 5 else 0.0
        bear_crash = five < -3.6 and c[i] < o[i]
        bull_crash = five > 3.6 and c[i] > o[i]
        prev_high = h[i - 1] if i else h[i]
        prev_low = l[i - 1] if i else l[i]

        for eng in engines:
            eng.bar_bull_take = False
            eng.bar_bear_take = False
            _resolve_active(eng, i, o, h, l, c, use_be)

        # Update AVWAPs
        if bull_on:
            bull_sum_wp += bar_w * hlc3
            bull_sum_wp2 += bar_w * hlc3 * hlc3
            bull_sum_w += bar_w
            bull_avwap = bull_sum_wp / max(bull_sum_w, 1e-9)
            bvar = max(0.0, (bull_sum_wp2 / max(bull_sum_w, 1e-9)) - bull_avwap * bull_avwap)
            bull_std = max(math.sqrt(bvar), safe_atr * 0.25)
            if not math.isfinite(bull_imp_hi) or h[i] >= bull_imp_hi:
                bull_imp_hi = h[i]
            if not bull_armed and (bull_imp_hi - bull_px) >= min_imp * safe_atr:
                bull_armed = True
            if c[i] < bull_px or c[i] < (bull_avwap - 2.60 * bull_std):
                bull_on = bull_armed = False
                for eng in engines:
                    eng.bull_in_zone = False

        if bear_on:
            bear_sum_wp += bar_w * hlc3
            bear_sum_wp2 += bar_w * hlc3 * hlc3
            bear_sum_w += bar_w
            bear_avwap = bear_sum_wp / max(bear_sum_w, 1e-9)
            svar = max(0.0, (bear_sum_wp2 / max(bear_sum_w, 1e-9)) - bear_avwap * bear_avwap)
            bear_std = max(math.sqrt(svar), safe_atr * 0.25)
            if not math.isfinite(bear_imp_lo) or l[i] <= bear_imp_lo:
                bear_imp_lo = l[i]
            if not bear_armed and (bear_px - bear_imp_lo) >= min_imp * safe_atr:
                bear_armed = True
            if c[i] > bear_px or c[i] > (bear_avwap + 2.60 * bear_std):
                bear_on = bear_armed = False
                for eng in engines:
                    eng.bear_in_zone = False

        # New pivots (confirmed at i with swingLen right bars)
        pl = _pivot_low(l, swing, swing, i)
        ph = _pivot_high(h, swing, swing, i)
        p_bar = i - swing
        bal = engines[0]

        if pl is not None and p_bar >= 0:
            replace = (
                not bull_on
                or pl < bull_px
                or bal.bull_pb_used >= max_pb
                or (bull_armed and pl > bull_px and (h[i] - pl) >= min_imp * safe_atr)
            )
            if replace and c[i] > pl:
                s_wp = s_wp2 = s_w = 0.0
                mx_hi = h[i]
                for k in range(p_bar, i + 1):
                    span_k = max(h[k] - l[k], mintick)
                    has_vk = math.isfinite(v[k]) and v[k] > 0 and math.isfinite(vol_sma[k]) and vol_sma[k] > 0
                    wk = max(v[k], 1e-6) if has_vk else max(span_k / max(safe_atr, mintick), 0.1)
                    pk = (h[k] + l[k] + c[k]) / 3.0
                    s_wp += wk * pk
                    s_wp2 += wk * pk * pk
                    s_w += wk
                    if h[k] >= mx_hi:
                        mx_hi = h[k]
                bull_on = True
                bull_bar = p_bar
                bull_px = pl
                bull_sum_wp, bull_sum_wp2, bull_sum_w = s_wp, s_wp2, s_w
                bull_avwap = s_wp / max(s_w, 1e-9)
                vb = max(0.0, (s_wp2 / max(s_w, 1e-9)) - bull_avwap * bull_avwap)
                bull_std = max(math.sqrt(vb), safe_atr * 0.25)
                bull_imp_hi = mx_hi
                bull_armed = (mx_hi - pl) >= min_imp * safe_atr
                for eng in engines:
                    eng.bull_in_zone = False
                    eng.bull_pb_low = float("nan")
                    eng.bull_pb_used = 0

        if ph is not None and p_bar >= 0:
            replace = (
                not bear_on
                or ph > bear_px
                or bal.bear_pb_used >= max_pb
                or (bear_armed and ph < bear_px and (ph - l[i]) >= min_imp * safe_atr)
            )
            if replace and c[i] < ph:
                s_wp = s_wp2 = s_w = 0.0
                mn_lo = l[i]
                for k in range(p_bar, i + 1):
                    span_k = max(h[k] - l[k], mintick)
                    has_vk = math.isfinite(v[k]) and v[k] > 0 and math.isfinite(vol_sma[k]) and vol_sma[k] > 0
                    wk = max(v[k], 1e-6) if has_vk else max(span_k / max(safe_atr, mintick), 0.1)
                    pk = (h[k] + l[k] + c[k]) / 3.0
                    s_wp += wk * pk
                    s_wp2 += wk * pk * pk
                    s_w += wk
                    if l[k] <= mn_lo:
                        mn_lo = l[k]
                bear_on = True
                bear_bar = p_bar
                bear_px = ph
                bear_sum_wp, bear_sum_wp2, bear_sum_w = s_wp, s_wp2, s_w
                bear_avwap = s_wp / max(s_w, 1e-9)
                vs = max(0.0, (s_wp2 / max(s_w, 1e-9)) - bear_avwap * bear_avwap)
                bear_std = max(math.sqrt(vs), safe_atr * 0.25)
                bear_imp_lo = mn_lo
                bear_armed = (ph - mn_lo) >= min_imp * safe_atr
                for eng in engines:
                    eng.bear_in_zone = False
                    eng.bear_pb_high = float("nan")
                    eng.bear_pb_used = 0

        if bull_on and bull_armed and not (bear_on and bear_armed):
            bias = 1
        elif bear_on and bear_armed and not (bull_on and bull_armed):
            bias = -1
        elif bull_on and bull_armed and bear_on and bear_armed:
            bias = 1 if bull_bar >= bear_bar else -1
        elif bull_on:
            bias = 1
        elif bear_on:
            bias = -1
        else:
            bias = 0

        # Sync custom thresholds each bar
        cust = engines[6]
        cust.band_sigma = float(p["custom_band_sig"])
        cust.outer_sigma = float(p["custom_band_sig"]) + 1.0
        cust.min_er_pct = float(p["custom_min_er"])

        for eng in engines:
            open_dir = eng.active.direction if eng.active is not None and eng.active.status == 0 else -99

            if bull_on and bull_armed and eng.bull_pb_used < max_pb and math.isfinite(bull_avwap):
                upper = bull_avwap + eng.band_sigma * bull_std
                lower_def = bull_avwap - eng.outer_sigma * bull_std
                if l[i] <= upper and c[i] >= lower_def and c[i] > bull_px and h[i] < bull_imp_hi:
                    if not eng.bull_in_zone:
                        eng.bull_in_zone = True
                        eng.bull_pb_low = l[i]
                    elif l[i] < (eng.bull_pb_low if math.isfinite(eng.bull_pb_low) else l[i]):
                        eng.bull_pb_low = l[i]
                elif c[i] < lower_def:
                    eng.bull_in_zone = False

                reclaim = eng.bull_in_zone and c[i] > bull_avwap and c[i] > o[i] and c[i] >= (prev_high - 0.20 * safe_atr)
                if reclaim and open_dir != 1:
                    imp_leg = max(bull_imp_hi - bull_px, safe_atr * 0.5)
                    pb_low = eng.bull_pb_low if math.isfinite(eng.bull_pb_low) else l[i]
                    pb_depth = (bull_imp_hi - pb_low) / imp_leg
                    ok = (
                        er_pct >= eng.min_er_pct
                        and bull_qual >= eng.min_qual
                        and rel_act >= eng.min_rel_act
                        and 0.12 <= pb_depth <= 0.85
                        and not bear_crash
                    )
                    if ok:
                        eng.bar_bull_take = True
                        eng.last_sig_dir = 1
                        eng.last_sig_qual = bull_qual
                        eng.last_sig_text = f"BUY (AVWAP · {bull_qual:.0f}%)"
                    else:
                        eng.bull_in_zone = False
                        eng.last_sig_text = f"SKIP (CHOP · {er_pct:.0f}%)"

            if allow_shorts and bear_on and bear_armed and eng.bear_pb_used < max_pb and math.isfinite(bear_avwap) and not eng.bar_bull_take:
                lower = bear_avwap - eng.band_sigma * bear_std
                upper_def = bear_avwap + eng.outer_sigma * bear_std
                if h[i] >= lower and c[i] <= upper_def and c[i] < bear_px and l[i] > bear_imp_lo:
                    if not eng.bear_in_zone:
                        eng.bear_in_zone = True
                        eng.bear_pb_high = h[i]
                    elif h[i] > (eng.bear_pb_high if math.isfinite(eng.bear_pb_high) else h[i]):
                        eng.bear_pb_high = h[i]
                elif c[i] > upper_def:
                    eng.bear_in_zone = False

                reclaim = eng.bear_in_zone and c[i] < bear_avwap and c[i] < o[i] and c[i] <= (prev_low + 0.20 * safe_atr)
                if reclaim and open_dir != -1:
                    imp_leg = max(bear_px - bear_imp_lo, safe_atr * 0.5)
                    pb_hi = eng.bear_pb_high if math.isfinite(eng.bear_pb_high) else h[i]
                    pb_depth = (pb_hi - bear_imp_lo) / imp_leg
                    ok = (
                        er_pct >= eng.min_er_pct
                        and bear_qual >= eng.min_qual
                        and rel_act >= eng.min_rel_act
                        and 0.12 <= pb_depth <= 0.85
                        and not bull_crash
                    )
                    if ok:
                        eng.bar_bear_take = True
                        eng.last_sig_dir = -1
                        eng.last_sig_qual = bear_qual
                        eng.last_sig_text = f"SELL (AVWAP · {bear_qual:.0f}%)"
                    else:
                        eng.bear_in_zone = False
                        eng.last_sig_text = f"SKIP (CHOP · {er_pct:.0f}%)"

            if eng.bar_bull_take or eng.bar_bear_take:
                s_dir = 1 if eng.bar_bull_take else -1
                entry_p = c[i]
                eff_sl = sl_buf * eng.sl_scale
                if s_dir == 1:
                    pb = eng.bull_pb_low if math.isfinite(eng.bull_pb_low) else l[i]
                    raw_sl = min(pb, bull_avwap - eng.band_sigma * bull_std) - eff_sl * safe_atr
                else:
                    pb = eng.bear_pb_high if math.isfinite(eng.bear_pb_high) else h[i]
                    raw_sl = max(pb, bear_avwap + eng.band_sigma * bear_std) + eff_sl * safe_atr
                risk = _clamp(abs(entry_p - raw_sl), safe_atr * eng.min_risk_atr, safe_atr * 3.0)
                final_sl = entry_p - risk if s_dir == 1 else entry_p + risk
                tp1 = entry_p + s_dir * 1.0 * risk
                tp2 = entry_p + s_dir * 2.0 * risk
                tp3 = entry_p + s_dir * 3.0 * risk
                tp2_r, tp3_r, is_mag = 2.0, 3.0, False
                if hybrid:
                    if s_dir == 1 and math.isfinite(bull_imp_hi):
                        dist_r = (bull_imp_hi - entry_p) / risk
                        if 1.3 <= dist_r <= 2.4:
                            tp2, tp2_r, is_mag = bull_imp_hi, round(dist_r, 1), True
                        elif 2.4 < dist_r <= 4.5:
                            tp3, tp3_r, is_mag = bull_imp_hi, round(dist_r, 1), True
                    elif s_dir == -1 and math.isfinite(bear_imp_lo):
                        dist_r = (entry_p - bear_imp_lo) / risk
                        if 1.3 <= dist_r <= 2.4:
                            tp2, tp2_r, is_mag = bear_imp_lo, round(dist_r, 1), True
                        elif 2.4 < dist_r <= 4.5:
                            tp3, tp3_r, is_mag = bear_imp_lo, round(dist_r, 1), True
                qual = bull_qual if s_dir == 1 else bear_qual
                _spawn(eng, i, s_dir, entry_p, final_sl, risk, tp1, tp2, tp3, tp2_r, tp3_r, is_mag, qual, c)

        sid = select_engine()
        selected_ids[i] = sid
        active = engines[sid]
        if active.bar_bull_take:
            long_sig[i] = True
        if active.bar_bear_take:
            short_sig[i] = True

        live_av = bull_avwap if bias == 1 else bear_avwap if bias == -1 else float("nan")
        live_sg = bull_std if bias == 1 else bear_std if bias == -1 else float("nan")
        avwap_line[i] = live_av
        if math.isfinite(live_av) and math.isfinite(live_sg):
            band_top[i] = live_av + active.band_sigma * live_sg
            band_bot[i] = live_av - active.band_sigma * live_sg
        if active.active is not None and active.active.status == 0:
            stop_line[i] = active.active.active_sl
            entry_line[i] = active.active.entry
            tp1_line[i] = active.active.tp1

    sel = int(selected_ids[-1]) if n else 0
    return {
        "engines": engines,
        "selected": sel,
        "selected_engine": engines[sel],
        "long": long_sig,
        "short": short_sig,
        "avwap": avwap_line,
        "band_top": band_top,
        "band_bot": band_bot,
        "er": er_line,
        "stop": stop_line,
        "entry": entry_line,
        "tp1": tp1_line,
        "atr": atr14,
        "params": p,
    }


def _status_label(plan: Plan) -> str:
    if plan.status == 1:
        return "TP3"
    if plan.status == 2:
        return "BE_WIN" if plan.be_hit else "TP1_WIN"
    if plan.status == -1:
        return "SL_HIT"
    if plan.status == 3:
        return "EXPIRED"
    return "OPEN"


def indicators(o, h, l, c, p, times=None, confirm=None, volume=None):
    """
    Bot `plan()` ke liye — Trident/Trend Rider jaisa long/short/atr.
    Signal reclaim wali BAND candle par; fill agli candle ke open par (`simulate`).
    """
    result = run(o, h, l, c, v=volume, params=p, times=times)
    return {
        "atr": result["atr"],
        "long": result["long"],
        "short": result["short"],
        "stop": result["stop"],
        "tp1": result["tp1"],
        "run": result,
    }


def simulate(times, o, h, l, c, params=None, capital=1000.0, start_index=0, bar_hours=4.0, volume=None, confirm=None):
    """
    Equity backtest on the Auto / selected profile's trade plans.
    Signal = reclaim close (PhenLabs); fill = next bar open (bot / Trident jaisa, late-fill honest).
    Stop / TP3 / BE / expire. `confirm` unused (interface parity with trend_rider / trident).
    """
    p = {**DEFAULTS, **(params or {})}
    o, h, l, c = (np.asarray(x, dtype=float) for x in (o, h, l, c))
    n = len(c)
    result = run(o, h, l, c, v=volume, params=p, times=times)
    eng = result["selected_engine"]
    risk_frac = p["risk_pct"] / 100.0
    fund_per_bar = FUNDING_PER_8H * bar_hours / 8.0
    start = max(int(start_index), 1)

    # Replay selected engine's closed plans that entered inside the window, plus open.
    plans = [pl for pl in eng.closed_plans if pl.entry_bar >= start]
    if eng.active is not None and eng.active.entry_bar >= start:
        plans = plans + [eng.active]

    eq = float(capital)
    trades = []
    curve = []
    fees_paid = 0.0
    funding_paid = 0.0
    bars_in_market = 0
    pos = None

    def open_from(plan: Plan, i):
        nonlocal eq, fees_paid, pos
        d = plan.direction
        # Next-open fill — reclaim close sirf levels (SL/TP) ke liye plan mein hai.
        raw = float(o[i])
        px = raw * (1 + d * SLIPPAGE)
        dist = abs(px - plan.init_sl)
        if dist <= 0 or not math.isfinite(dist):
            return
        qty = min(eq * risk_frac / dist, eq * p["max_leverage"] / px)
        fee = FEE_RATE * qty * px
        eq -= fee
        fees_paid += fee
        pos = {
            "dir": d,
            "entry": px,
            "stop": plan.init_sl,
            "init_stop": plan.init_sl,
            "qty": qty,
            "qty0": qty,
            "risk_amt": qty * dist,
            "entry_time": int(times[i]),
            "pnl": -fee,
            "bars": 0,
            "tp1": plan.tp1,
            "tp1_done": False,
            "plan": plan,
        }

    def close_pos(i, raw_px, status):
        nonlocal eq, pos, fees_paid
        d = pos["dir"]
        px = raw_px * (1 - SLIPPAGE) if d > 0 else raw_px * (1 + SLIPPAGE)
        gross = d * pos["qty"] * (px - pos["entry"])
        fee = FEE_RATE * pos["qty"] * px
        eq += gross - fee
        fees_paid += fee
        pos["pnl"] += gross - fee
        trades.append(_trade_dict(pos, times[i], px, status))
        pos = None

    # Signal bar → fill on the NEXT bar open (bot entry candle).
    entries = {}
    for pl in plans:
        fill_i = pl.entry_bar + 1
        if fill_i < n:
            entries[fill_i] = pl

    for i in range(start, n):
        # Manage open position with plan rules (mirror PhenLabs exits)
        if pos is not None:
            plan = pos["plan"]
            d = pos["dir"]
            pos["bars"] += 1
            bars_in_market += 1
            if d > 0:
                f = fund_per_bar * pos["qty"] * c[i]
                eq -= f
                funding_paid += f
                pos["pnl"] -= f

            if i > plan.entry_bar:
                if d > 0:
                    if l[i] <= pos["stop"]:
                        close_pos(i, pos["stop"], "BE_HIT" if pos["tp1_done"] else "SL_HIT")
                    else:
                        if not pos["tp1_done"] and h[i] >= plan.tp1:
                            pos["tp1_done"] = True
                            if p["use_be_ratchet"]:
                                pos["stop"] = pos["entry"]
                        if h[i] >= plan.tp3:
                            close_pos(i, plan.tp3, "TP3")
                        elif (i - plan.entry_bar) >= 60:
                            close_pos(i, c[i], "EXPIRED")
                else:
                    if h[i] >= pos["stop"]:
                        close_pos(i, pos["stop"], "BE_HIT" if pos["tp1_done"] else "SL_HIT")
                    else:
                        if not pos["tp1_done"] and l[i] <= plan.tp1:
                            pos["tp1_done"] = True
                            if p["use_be_ratchet"]:
                                pos["stop"] = pos["entry"]
                        if l[i] <= plan.tp3:
                            close_pos(i, plan.tp3, "TP3")
                        elif (i - plan.entry_bar) >= 60:
                            close_pos(i, c[i], "EXPIRED")

        if pos is None and i in entries:
            open_from(entries[i], i)

        mtm = pos["dir"] * pos["qty"] * (c[i] - pos["entry"]) if pos is not None else 0.0
        curve.append((int(times[i]), eq + mtm))

    open_position = None
    if pos is not None:
        d = pos["dir"]
        open_position = {
            "side": "buy" if d > 0 else "sell",
            "entry_time": pos["entry_time"],
            "entry_price": pos["entry"],
            "stop_loss": pos["stop"],
            "initial_stop": pos["init_stop"],
            "quantity": pos["qty"],
            "initial_quantity": pos["qty0"],
            "tp1_price": pos["tp1"],
            "tp1_done": pos["tp1_done"],
            "unrealized_pnl": pos["pnl"] + d * pos["qty"] * (c[-1] - pos["entry"]),
            "mark_price": float(c[-1]),
        }

    phen = {
        "profile": eng.name,
        "profile_id": eng.id,
        "tp1_win_rate": round(100.0 * eng.win_trades / eng.total_trades, 2) if eng.total_trades else 0.0,
        "wins": eng.win_trades,
        "losses": eng.loss_trades,
        "total": eng.total_trades,
        "cum_net_r": round(eng.cum_net_r, 2),
        "tp1_hits": eng.tp1_count,
        "tp2_hits": eng.tp2_count,
        "tp3_hits": eng.tp3_count,
        "profiles": [
            {
                "id": e.id,
                "name": e.name,
                "trades": e.total_trades,
                "wins": e.win_trades,
                "losses": e.loss_trades,
                "win_rate": round(100.0 * e.win_trades / e.total_trades, 2) if e.total_trades else 0.0,
                "cum_net_r": round(e.cum_net_r, 2),
                "tp1": e.tp1_count,
                "tp2": e.tp2_count,
                "tp3": e.tp3_count,
            }
            for e in result["engines"]
        ],
    }

    return {
        "trades": trades,
        "equity": curve,
        "open_position": open_position,
        "stats": _stats(trades, curve, capital, fees_paid, funding_paid, bars_in_market, c, start),
        "params": p,
        "phenlabs": phen,
        "run": result,
    }
