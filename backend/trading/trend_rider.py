"""
Trend Rider 4H — 30-candle channel breakout, EMA 200 regime, ATR stop, channel trailing stop.

Research (Binance 1h data 2019-2026 resampled to 4h, BTC/ETH/SOL/BNB/XRP, Delta fees + GST,
slippage aur long funding ke saath) mein ye rules har coin par profitable rahe — 2019-22 par
choose kiye, 2023-26 par bina chhede test kiye. Short-term mean reversion aur fixed-point
SL/target wale setups wahi test fees ke baad loss mein gaye, isliye yahan nahi hain.

Rules (sirf band candles par):
  LONG  : close > pichhli `channel` candles ka highest high  AND close > EMA(slow)
  SHORT : close < pichhli `channel` candles ka lowest low    AND close < EMA(slow) AND EMA(fast) < EMA(slow)
  Entry : agli candle ke open par
  Stop  : signal close -/+ stop_atr x ATR(14); har candle close par stop ko pichhli
          `exit_channel` candles ke low (long) / high (short) tak khiskao — kabhi peeche nahi
  Size  : stop lagne par equity ka risk_pct% hi jaaye, max_leverage tak cap

Frontend (`frontend/src/lib/trendRider.ts`) yahi replay chalata hai — live signal aur
backtest ek hi rule par rehne chahiye, isliye dono files saath badalni hain.
"""
import math

import numpy as np

# Delta India taker 0.05% + 18% GST, har side.
FEE_RATE = 0.0005 * 1.18
SLIPPAGE = 0.0002
# Perp longs bull market mein funding dete hain (~0.01% / 8h baseline). Shorts ko milne wala
# funding conservative hokar nahi gina.
FUNDING_PER_8H = 0.0001

DEFAULTS = {
    "channel": 30,
    "exit_channel": 15,
    "stop_atr": 2.0,
    "atr_period": 14,
    "ema_fast": 50,
    "ema_slow": 200,
    "risk_pct": 1.0,
    "max_leverage": 3.0,
    "allow_shorts": True,
}

# EMA 200 ko settle hone ke liye backtest window se pehle itni candles chahiye — 600 par
# seed ka asar ~0.3% reh jaata hai, isliye chart (jo 1000+ candles laata hai) aur backtest
# ke signal mel khaate hain.
WARMUP_BARS = 600


def ema(values, period):
    """pandas `ewm(span=period, adjust=False)` — frontend `indicators.ema` ka mirror."""
    out = np.empty(len(values))
    if not len(values):
        return out
    alpha = 2.0 / (period + 1)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = values[i] * alpha + out[i - 1] * (1 - alpha)
    return out


def atr(high, low, close, period):
    """Wilder ATR, pehle `period` TR ka simple average se seed — frontend `indicators.atr` ka mirror."""
    n = len(close)
    out = np.full(n, np.nan)
    if n < period:
        return out
    tr = np.empty(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        pc = close[i - 1]
        tr[i] = max(high[i] - low[i], abs(high[i] - pc), abs(low[i] - pc))
    smoothed = tr[:period].mean()
    out[period - 1] = smoothed
    for i in range(period, n):
        smoothed = (smoothed * (period - 1) + tr[i]) / period
        out[i] = smoothed
    return out


def _rolling_prev_max(values, window):
    """i par: values[i-window .. i-1] ka max (current candle shaamil nahi)."""
    n = len(values)
    out = np.full(n, np.nan)
    for i in range(window, n):
        out[i] = values[i - window:i].max()
    return out


def _rolling_prev_min(values, window):
    n = len(values)
    out = np.full(n, np.nan)
    for i in range(window, n):
        out[i] = values[i - window:i].min()
    return out


def _rolling_min(values, window):
    """i par: values[i-window+1 .. i] ka min (current candle shaamil)."""
    n = len(values)
    out = np.full(n, np.nan)
    for i in range(window - 1, n):
        out[i] = values[i - window + 1:i + 1].min()
    return out


def _rolling_max(values, window):
    n = len(values)
    out = np.full(n, np.nan)
    for i in range(window - 1, n):
        out[i] = values[i - window + 1:i + 1].max()
    return out


def indicators(o, h, l, c, p):
    a = atr(h, l, c, p["atr_period"])
    e_fast = ema(c, p["ema_fast"])
    e_slow = ema(c, p["ema_slow"])
    upper = _rolling_prev_max(h, p["channel"])
    lower = _rolling_prev_min(l, p["channel"])
    trail_long = _rolling_min(l, p["exit_channel"])
    trail_short = _rolling_max(h, p["exit_channel"])
    ok = np.isfinite(a) & np.isfinite(upper) & np.isfinite(lower)
    long_sig = ok & (c > upper) & (c > e_slow)
    short_sig = ok & (c < lower) & (c < e_slow) & (e_fast < e_slow)
    if not p["allow_shorts"]:
        short_sig[:] = False
    return {
        "atr": a, "ema_fast": e_fast, "ema_slow": e_slow, "upper": upper, "lower": lower,
        "trail_long": trail_long, "trail_short": trail_short, "long": long_sig, "short": short_sig,
    }


def simulate(times, o, h, l, c, params=None, capital=1000.0, start_index=0, bar_hours=4.0):
    """
    times: ms timestamps (candle open), sirf BAND candles.
    start_index: is index se pehle ki candles sirf indicator warmup ke liye hain.
    Returns dict: trades, equity (list of [time, equity]), position (open trade ya None), stats.
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
        # ---- entry: pichhli band candle ka signal, is candle ke open par ----
        k = i - 1
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
                pos = {"dir": d, "entry": entry, "stop": stop, "init_stop": stop, "qty": qty,
                       "risk_amt": qty * dist, "entry_time": int(times[i]), "pnl": -fee, "bars": 0}

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
            else:
                # candle close par trailing stop update — agli candle se lagu
                tv = ind["trail_long"][i] if d > 0 else ind["trail_short"][i]
                if math.isfinite(tv):
                    pos["stop"] = max(pos["stop"], tv) if d > 0 else min(pos["stop"], tv)

        mtm = pos["dir"] * pos["qty"] * (c[i] - pos["entry"]) if pos is not None else 0.0
        curve.append((int(times[i]), eq + mtm))

    open_position = None
    if pos is not None:
        # Abhi bhi chalu trade — mark-to-market dikhate hain, band nahi maante.
        d = pos["dir"]
        mtm_pnl = pos["pnl"] + d * pos["qty"] * (c[-1] - pos["entry"])
        open_position = {
            "side": "buy" if d > 0 else "sell",
            "entry_time": pos["entry_time"],
            "entry_price": pos["entry"],
            "stop_loss": pos["stop"],
            "initial_stop": pos["init_stop"],
            "quantity": pos["qty"],
            "unrealized_pnl": mtm_pnl,
            "mark_price": float(c[-1]),
        }

    return {
        "trades": trades,
        "equity": curve,
        "open_position": open_position,
        "stats": _stats(trades, curve, capital, fees_paid, funding_paid, bars_in_market, c, start),
        "params": p,
    }


def _stop_status(pos):
    d = pos["dir"]
    moved = (pos["stop"] > pos["init_stop"]) if d > 0 else (pos["stop"] < pos["init_stop"])
    return "TRAILING_STOP" if moved else "SL_HIT"


def _trade_dict(pos, exit_time, exit_px, status):
    d = pos["dir"]
    return {
        "side": "buy" if d > 0 else "sell",
        "entry_time": pos["entry_time"],
        "exit_time": int(exit_time),
        "entry_price": round(pos["entry"], 4),
        "exit_price": round(exit_px, 4),
        "stop_loss": round(pos["init_stop"], 4),
        "target": None,
        "quantity": pos["qty"],
        "pnl": round(pos["pnl"], 4),
        "pnl_points": round(d * (exit_px - pos["entry"]), 4),
        "r_multiple": round(pos["pnl"] / pos["risk_amt"], 3) if pos["risk_amt"] > 0 else 0.0,
        "bars_held": pos["bars"],
        "status": status,
    }


def _stats(trades, curve, capital, fees_paid, funding_paid, bars_in_market, c, start):
    pnl = np.array([t["pnl"] for t in trades]) if trades else np.array([])
    gains = float(pnl[pnl > 0].sum()) if len(pnl) else 0.0
    losses = float(-pnl[pnl < 0].sum()) if len(pnl) else 0.0
    eqs = np.array([v for _, v in curve]) if curve else np.array([capital])
    peak = np.maximum.accumulate(np.concatenate([[capital], eqs]))
    dd = float(((peak[1:] - eqs) / peak[1:]).max()) if len(eqs) else 0.0
    final = float(eqs[-1]) if len(eqs) else float(capital)
    first_close = float(c[start - 1]) if start >= 1 else float(c[0])
    bars = max(len(curve), 1)
    if losses > 0:
        pf = round(gains / losses, 2)
    else:
        pf = None if gains == 0 else 999.0
    return {
        "final_equity": round(final, 2),
        "return_pct": round(100 * (final / capital - 1), 2),
        "max_drawdown_pct": round(100 * dd, 2),
        "profit_factor": pf,
        "avg_r": round(float(np.mean([t["r_multiple"] for t in trades])), 3) if trades else 0.0,
        "best_r": round(max(t["r_multiple"] for t in trades), 2) if trades else 0.0,
        "worst_r": round(min(t["r_multiple"] for t in trades), 2) if trades else 0.0,
        "fees_paid": round(fees_paid, 2),
        "funding_paid": round(funding_paid, 2),
        "exposure_pct": round(100 * bars_in_market / bars, 1),
        "buy_hold_pct": round(100 * (float(c[-1]) / first_close - 1), 2) if first_close else 0.0,
    }


def downsample(curve, max_points=400):
    if len(curve) <= max_points:
        return curve
    step = len(curve) / max_points
    out = [curve[int(i * step)] for i in range(max_points)]
    out[-1] = curve[-1]
    return out
