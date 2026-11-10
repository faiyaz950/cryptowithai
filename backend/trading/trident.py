"""
Trident Momentum 4H — teen alag samay (5, 15, 30 din) ka momentum ek hi taraf ho tabhi trade.

Trend Rider "naya high bana?" (channel breakout) dekhti hai. Trident poochti hai "price 5 din,
15 din aur 30 din pehle se upar hai ya neeche?" — teeno "upar" bolein to LONG, teeno "neeche"
(aur pakka bear market) to SHORT. Trade tab tak chalta hai jab tak teen mein se do horizon palat
na jaayein; koi trailing stop nahi, sirf ek initial ATR stop (crash se bachav).

Research (Binance 4h 2020–24 par chuna; Delta Oct 2024–25 aur Oct 2025–26 par bina chhede test):
trailing stop lagane se kamai kam hui — momentum ka toota hona hi sahi exit nikla. Horizon 30/90/180
candle (lambe wala ~30 din) har grid row mein sabse behtar column tha; 5/15/30 din isliye.

Rules (sirf band candles par):
  score  : teen horizon ka sign(close - close[n candle pehle]) ka average, -1 .. +1
  LONG   : score +1 bana (pichhli candle par +1 nahi tha)
  SHORT  : score -1 bana AND EMA(fast) < EMA(slow)        (allow_shorts)
  Entry  : agli candle ke open par
  Stop   : signal close -/+ stop_atr x ATR(14), poore trade mein wahi (trail nahi)
  Exit   : band candle par score <= 0 (long) / >= 0 (short) — agli candle ke open par
  Size   : stop lagne par equity ka risk_pct% hi jaaye, max_leverage tak cap

Fees, slippage, funding aur sizing `trend_rider` jaisi — dono ka backtest ek hi taraazu par.
Frontend (`frontend/src/lib/trident.ts`) yahi replay chalata hai; dono files saath badlo.
"""
import math

import numpy as np

from trend_rider import (
    FEE_RATE,
    FUNDING_PER_8H,
    SLIPPAGE,
    WARMUP_BARS,
    _stats,
    _stop_status,
    _trade_dict,
    atr,
    ema,
)

STRATEGY = "trident-momentum"

DEFAULTS = {
    # Teen horizon candles mein (4h par 5, 15, 30 din).
    "h1": 30,
    "h2": 90,
    "h3": 180,
    "stop_atr": 2.5,
    "atr_period": 14,
    # Short sirf pakke bear market mein (Trend Rider jaisa regime).
    "ema_fast": 50,
    "ema_slow": 200,
    "risk_pct": 1.0,
    "max_leverage": 3.0,
    "allow_shorts": True,
}

__all__ = ["DEFAULTS", "STRATEGY", "WARMUP_BARS", "horizons", "indicators", "min_bars", "simulate"]


def horizons(p):
    return [int(p["h1"]), int(p["h2"]), int(p["h3"])]


def min_bars(p):
    """Itni band candles ke baad hi score aur EMA slow bharose layak."""
    return max(max(horizons(p)), p["ema_slow"]) + 10


def momentum_score(c, looks):
    """Har candle par sign(close - close[i-n]) ka average; history kam ho to NaN."""
    c = np.asarray(c, dtype=float)
    n = len(c)
    total = np.zeros(n)
    ok = np.ones(n, dtype=bool)
    for k in looks:
        prev = np.full(n, np.nan)
        if k < n:
            prev[k:] = c[:-k]
        ok &= np.isfinite(prev)
        total += np.sign(np.nan_to_num(c - prev))
    out = total / len(looks)
    out[~ok] = np.nan
    return out


def indicators(o, h, l, c, p, times=None, confirm=None):
    """`trend_rider.indicators` jaisa dict (long/short/atr) — bot ka plan dono par ek hi tarah chalta hai."""
    a = atr(h, l, c, p["atr_period"])
    e_fast = ema(c, p["ema_fast"])
    e_slow = ema(c, p["ema_slow"])
    score = momentum_score(c, horizons(p))
    prev = np.concatenate([[np.nan], score[:-1]])
    ok = np.isfinite(a) & np.isfinite(score)
    full_up = ok & (score >= 1.0)
    full_dn = ok & (score <= -1.0)
    # Sirf jis candle par teeno pehli baar ek taraf hue — wahi entry. Stop ke baad dobara entry
    # tabhi jab momentum toot kar phir se bane.
    long_sig = full_up & ~(prev >= 1.0)
    short_sig = full_dn & ~(prev <= -1.0) & (e_fast < e_slow)
    if not p["allow_shorts"]:
        short_sig[:] = False
    return {
        "atr": a, "ema_fast": e_fast, "ema_slow": e_slow, "score": score,
        "long": long_sig, "short": short_sig,
        # Teen mein se do horizon palte — trade band.
        "exit_long": np.isfinite(score) & (score <= 0.0),
        "exit_short": np.isfinite(score) & (score >= 0.0),
    }


def simulate(times, o, h, l, c, params=None, capital=1000.0, start_index=0, bar_hours=4.0, confirm=None):
    """
    `trend_rider.simulate` jaisa interface aur output (trades, equity, open_position, stats, params).
    Exit do tarah: stop (SL_HIT) ya momentum toota (MOMENTUM_EXIT, agli candle ke open par).
    `confirm` sirf interface ke liye — Trident BTC filter nahi lagati.
    """
    p = dict(DEFAULTS)
    p.update(params or {})
    o, h, l, c = (np.asarray(x, dtype=float) for x in (o, h, l, c))
    n = len(c)
    ind = indicators(o, h, l, c, p)
    risk = p["risk_pct"] / 100.0
    fund_per_bar = FUNDING_PER_8H * bar_hours / 8.0

    eq = float(capital)
    trades = []
    curve = []
    pos = None
    fees_paid = 0.0
    funding_paid = 0.0
    bars_in_market = 0

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

    start = max(int(start_index), 1)
    for i in range(start, n):
        k = i - 1
        # ---- momentum exit: pichhli band candle par toota, is candle ke open par band ----
        if pos is not None and (ind["exit_long"][k] if pos["dir"] > 0 else ind["exit_short"][k]):
            close_pos(i, o[i], "MOMENTUM_EXIT")

        # ---- entry: pichhli band candle ka signal, is candle ke open par ----
        if pos is None and k >= start - 1 and (ind["long"][k] or ind["short"][k]):
            d = 1 if ind["long"][k] else -1
            stop = c[k] - d * p["stop_atr"] * ind["atr"][k]
            entry = o[i] * (1 + d * SLIPPAGE)
            dist = d * (entry - stop)
            if dist > 0 and math.isfinite(dist):
                qty = min(eq * risk / dist, eq * p["max_leverage"] / entry)
                fee = FEE_RATE * qty * entry
                eq -= fee
                fees_paid += fee
                pos = {"dir": d, "entry": entry, "stop": stop, "init_stop": stop, "qty": qty, "qty0": qty,
                       "risk_amt": qty * dist, "entry_time": int(times[i]), "pnl": -fee, "bars": 0,
                       "tp1": None, "tp1_done": False}

        if pos is not None:
            d = pos["dir"]
            pos["bars"] += 1
            bars_in_market += 1
            if d > 0:
                f = fund_per_bar * pos["qty"] * c[i]
                eq -= f
                funding_paid += f
                pos["pnl"] -= f
            if (d > 0 and o[i] <= pos["stop"]) or (d < 0 and o[i] >= pos["stop"]):
                close_pos(i, o[i], _stop_status(pos))          # gap stop ke paar khula
            elif (d > 0 and l[i] <= pos["stop"]) or (d < 0 and h[i] >= pos["stop"]):
                close_pos(i, pos["stop"], _stop_status(pos))

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
            "tp1_price": None,
            "tp1_done": False,
            "unrealized_pnl": pos["pnl"] + d * pos["qty"] * (c[-1] - pos["entry"]),
            "mark_price": float(c[-1]),
        }

    return {
        "trades": trades,
        "equity": curve,
        "open_position": open_position,
        "stats": _stats(trades, curve, capital, fees_paid, funding_paid, bars_in_market, c, start),
        "params": p,
    }
