"""
Strateo strategies whose chart rules were not the backtest.

Pehle inka backtest EMA-crossover engine par chalta tha (fixed point SL/target, fees nahi).
Isliye MACD aur EMA Crossover ek jaisa signal de dete the. Yahan har strategy ka signal
wahi hai jo strategy page ka live rule kehta hai — sirf band candle par — aur stop ATR
ka hissa hai, target us risk ka multiple (ya mean). Fees, slippage aur long funding
`trend_rider` ke hi rates hain, taaki backtest aur 24/7 bot ek replay chalayein.

Entry: signal band candle `k` par, fill agli candle ke open par.
"""
import math

import numpy as np

import trend_rider
from trend_rider import FEE_RATE, FUNDING_PER_8H, SLIPPAGE, _stats, atr, ema

# Keys the bot and backtest both read. Unknown query params are ignored.
_FLOAT_KEYS = (
    "stop_atr", "target_r", "trail_atr", "atr_mult", "adx_min", "adx_thresh",
    "pullback_pct", "vol_mult", "bb_std", "risk_pct", "tp1_r", "tp1_frac",
)
_INT_KEYS = (
    "fast", "slow", "signal", "ema9", "ema21", "ema50", "ema_period", "atr_period",
    "adx_period", "volume_lookback", "ema_fast", "ema_mid", "ema_slow", "rsi_period",
    "overbought", "oversold", "rsi_overbought", "rsi_oversold", "pivot_span", "lookback",
    "rsi_thresh", "bb_period",
    "mid_period", "max_bars", "max_age",
)
_BOOL_KEYS = ("allow_shorts", "require_rsi", "exit_mid")


def sma(values, period):
    out = np.full(len(values), np.nan)
    period = int(period)
    if period <= 0 or len(values) < period:
        return out
    csum = np.cumsum(values)
    out[period - 1] = csum[period - 1] / period
    if period < len(values):
        out[period:] = (csum[period:] - csum[:-period]) / period
    return out


def rsi_rolling(values, period):
    """Frontend `indicators.rsi` — rolling mean, Wilder nahi."""
    n = len(values)
    out = np.full(n, np.nan)
    period = int(period)
    if period <= 0 or n <= period:
        return out
    delta = np.diff(values)
    gains = np.clip(delta, 0, None)
    losses = np.clip(-delta, 0, None)
    for i in range(period, n):
        # delta[j] is the move into bar j+1. Window of `period` deltas ending at i-1.
        g = gains[i - period:i].mean()
        l = losses[i - period:i].mean()
        if l == 0 and g == 0:
            continue
        if l == 0:
            out[i] = 100.0
        else:
            out[i] = 100.0 - 100.0 / (1.0 + g / l)
    return out


def macd_lines(values, fast, slow, signal):
    line = ema(values, int(fast)) - ema(values, int(slow))
    sig = ema(line, int(signal))
    return line, sig


def adx_wilder(high, low, close, period):
    """Frontend `indicators.adx` — Wilder DM / TR, phir DX ka Wilder."""
    n = len(close)
    out = np.full(n, np.nan)
    period = int(period)
    if n < period * 2:
        return out
    tr = np.empty(n)
    plus = np.zeros(n)
    minus = np.zeros(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        up = high[i] - high[i - 1]
        down = low[i - 1] - low[i]
        plus[i] = up if up > down and up > 0 else 0.0
        minus[i] = down if down > up and down > 0 else 0.0
        pc = close[i - 1]
        tr[i] = max(high[i] - low[i], abs(high[i] - pc), abs(low[i] - pc))

    def wilder(arr):
        sm = np.full(n, np.nan)
        if n < period:
            return sm
        sm[period - 1] = arr[:period].sum() / period
        for i in range(period, n):
            sm[i] = (sm[i - 1] * (period - 1) + arr[i]) / period
        return sm

    sm_tr, sm_p, sm_m = wilder(tr), wilder(plus), wilder(minus)
    dx = np.full(n, np.nan)
    for i in range(n):
        if not (math.isfinite(sm_tr[i]) and sm_tr[i] > 0 and math.isfinite(sm_p[i]) and math.isfinite(sm_m[i])):
            continue
        pdi = 100.0 * sm_p[i] / sm_tr[i]
        mdi = 100.0 * sm_m[i] / sm_tr[i]
        denom = pdi + mdi
        dx[i] = 0.0 if denom == 0 else 100.0 * abs(pdi - mdi) / denom
    valid = np.flatnonzero(np.isfinite(dx))
    if len(valid) < period:
        return out
    first = int(valid[0])
    chunk = np.nan_to_num(dx[first:], nan=0.0)
    sm = np.full(len(chunk), np.nan)
    sm[period - 1] = chunk[:period].mean()
    for i in range(period, len(chunk)):
        sm[i] = (sm[i - 1] * (period - 1) + chunk[i]) / period
    out[first:] = sm
    return out


def vwap_utc(high, low, close, volume, times):
    out = np.full(len(close), np.nan)
    if volume is None or times is None:
        return out
    cum_pv = 0.0
    cum_v = 0.0
    day = None
    for i in range(len(close)):
        d = int(times[i] // 86_400_000)
        if d != day:
            day = d
            cum_pv = 0.0
            cum_v = 0.0
        vol = float(volume[i])
        typical = (high[i] + low[i] + close[i]) / 3.0
        cum_pv += typical * vol
        cum_v += vol
        if cum_v > 0:
            out[i] = cum_pv / cum_v
    return out


def _vol_spike(volume, i, lookback, mult):
    """Current bar vs the previous `lookback` bars — frontend `averageVolume`."""
    if volume is None:
        return True
    lookback = int(lookback)
    if i < lookback or lookback <= 0:
        return False
    avg = float(volume[i - lookback:i].mean())
    return avg > 0 and float(volume[i]) > mult * avg


def _cross_up(fast, slow):
    prev_f, prev_s = np.roll(fast, 1), np.roll(slow, 1)
    sig = (fast > slow) & (prev_f <= prev_s)
    sig[0] = False
    return sig & np.isfinite(fast) & np.isfinite(slow)


def _cross_down(fast, slow):
    prev_f, prev_s = np.roll(fast, 1), np.roll(slow, 1)
    sig = (fast < slow) & (prev_f >= prev_s)
    sig[0] = False
    return sig & np.isfinite(fast) & np.isfinite(slow)


def _edge(mask):
    prev = np.roll(mask, 1)
    prev[0] = False
    return mask & ~prev


def _blank(n):
    return np.zeros(n, dtype=bool), np.zeros(n, dtype=bool)


def _stops(close, atr_line, stop_atr):
    stop_long = close - stop_atr * atr_line
    stop_short = close + stop_atr * atr_line
    return stop_long, stop_short


def _pack(long, short, atr_line, stop_atr, tp_long=None, tp_short=None):
    n = len(long)
    sl, ss = _stops(np.zeros(n), atr_line, stop_atr) if False else (None, None)
    # Stops are filled by the simulator from ATR; absolute targets only when given.
    return {
        "long": long,
        "short": short,
        "atr": atr_line,
        "tp_long": tp_long if tp_long is not None else np.full(n, np.nan),
        "tp_short": tp_short if tp_short is not None else np.full(n, np.nan),
    }


# ── Signal builders (closed bar = the bar itself) ──────────────────────────

def _ema_cross(o, h, l, c, v, times, p):
    fast, slow = ema(c, int(p["fast"])), ema(c, int(p["slow"]))
    return _pack(_cross_up(fast, slow), _cross_down(fast, slow), atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _macd(o, h, l, c, v, times, p):
    line, sig = macd_lines(c, p["fast"], p["slow"], p["signal"])
    return _pack(_cross_up(line, sig), _cross_down(line, sig), atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _rsi_divergence(o, h, l, c, v, times, p):
    period = int(p["rsi_period"])
    span = max(1, int(p["pivot_span"]))
    ob, os_ = float(p["overbought"]), float(p["oversold"])
    series = rsi_rolling(c, period)
    n = len(c)
    long, short = _blank(n)
    # RSI leaving the zone — one bar, same as the live "left oversold / overbought" headline.
    prev = np.roll(series, 1)
    long |= np.isfinite(series) & np.isfinite(prev) & (prev <= os_) & (series > os_)
    short |= np.isfinite(series) & np.isfinite(prev) & (prev >= ob) & (series < ob)
    # Divergence confirms `span` bars after the newer pivot (both sides must exist).
    highs, lows = [], []
    for j in range(span, n - span):
        window_h = h[j - span:j + span + 1]
        window_l = l[j - span:j + span + 1]
        if h[j] >= window_h.max() and math.isfinite(series[j]):
            highs.append(j)
        if l[j] <= window_l.min() and math.isfinite(series[j]):
            lows.append(j)
    for pivots, bear in ((highs, True), (lows, False)):
        for a, b in zip(pivots, pivots[1:]):
            confirm = b + span
            if confirm >= n or not math.isfinite(series[a]) or not math.isfinite(series[b]):
                continue
            if bear and h[b] > h[a] and series[b] < series[a]:
                short[confirm] = True
            if not bear and l[b] < l[a] and series[b] > series[a]:
                long[confirm] = True
    long[0] = False
    short[0] = False
    return _pack(long, short, atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _custom_ema(o, h, l, c, v, times, p):
    f, m, s = ema(c, int(p["ema9"])), ema(c, int(p["ema21"])), ema(c, int(p["ema50"]))
    above = (f > s) & (m > s)
    below = (f < s) & (m < s)
    return _pack(_edge(above), _edge(below), atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _atr_channel(o, h, l, c, v, times, p):
    mid = ema(c, int(p["ema_period"]))
    a = atr(h, l, c, int(p["atr_period"]))
    adx_line = adx_wilder(h, l, c, int(p["adx_period"]))
    mult = float(p["atr_mult"])
    upper, lower = mid + a * mult, mid - a * mult
    prev_c, prev_u, prev_l = np.roll(c, 1), np.roll(upper, 1), np.roll(lower, 1)
    trend = np.isfinite(adx_line) & (adx_line >= float(p["adx_min"]))
    look = int(p["volume_lookback"])
    vol = np.array([_vol_spike(v, i, look, 1.0) for i in range(len(c))])
    ok = trend & vol & np.isfinite(upper) & np.isfinite(lower)
    long = ok & (prev_c <= prev_u) & (c > upper)
    short = ok & (prev_c >= prev_l) & (c < lower)
    long[0] = False
    short[0] = False
    return _pack(long, short, a, p["stop_atr"])


def _vwap(o, h, l, c, v, times, p):
    vw = vwap_utc(h, l, c, v, times)
    fast, slow = ema(c, int(p["ema_fast"])), ema(c, int(p["ema_slow"]))
    rsi_line = rsi_rolling(c, int(p["rsi_period"]))
    prev_c, prev_v = np.roll(c, 1), np.roll(vw, 1)
    look = int(p["volume_lookback"])
    vol = np.array([_vol_spike(v, i, look, 1.0) for i in range(len(c))])
    reclaim_up = np.isfinite(vw) & np.isfinite(prev_v) & (prev_c <= prev_v) & (c > vw)
    reclaim_dn = np.isfinite(vw) & np.isfinite(prev_v) & (prev_c >= prev_v) & (c < vw)
    bull, bear = fast > slow, fast < slow
    if p.get("require_rsi"):
        rsi_long = np.isfinite(rsi_line) & (rsi_line < float(p["rsi_overbought"]))
        rsi_short = np.isfinite(rsi_line) & (rsi_line > float(p["rsi_oversold"]))
    else:
        rsi_long = rsi_short = np.ones(len(c), dtype=bool)
    long = reclaim_up & bull & vol & rsi_long
    short = reclaim_dn & bear & vol & rsi_short
    long[0] = short[0] = False
    return _pack(long, short, atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _ema_pullback(o, h, l, c, v, times, p):
    f = ema(c, int(p["ema_fast"]))
    m = ema(c, int(p["ema_mid"]))
    s = ema(c, int(p["ema_slow"]))
    adx_line = adx_wilder(h, l, c, int(p["adx_period"]))
    band = float(p["pullback_pct"]) / 100.0
    trend = np.isfinite(adx_line) & (adx_line >= float(p["adx_min"]))
    bull = (f > m) & (m > s)
    bear = (f < m) & (m < s)
    prev_c = np.roll(c, 1)
    near = (np.abs(c - m) <= m * band) | (np.abs(l - m) <= m * band) | (np.abs(h - m) <= m * band)
    bounce_long = near & (c >= m) & (prev_c < m * (1 + band))
    bounce_short = near & (c <= m) & (prev_c > m * (1 - band))
    long = trend & bull & bounce_long & np.isfinite(m)
    short = trend & bear & bounce_short & np.isfinite(m)
    long[0] = short[0] = False
    return _pack(long, short, atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _donchian(o, h, l, c, v, times, p):
    look = int(p["lookback"])
    prior_high = np.full(len(c), np.nan)
    if look < len(c):
        for i in range(look, len(c)):
            prior_high[i] = h[i - look:i].max()
    e200 = ema(c, 200)
    a = atr(h, l, c, int(p["atr_period"]))
    body = (c - o) > 0.5 * np.maximum(h - l, 1e-12)
    vol = np.array([_vol_spike(v, i, 20, 1.5) for i in range(len(c))])
    long = (c > prior_high) & vol & body & (c > e200) & np.isfinite(prior_high)
    long[0] = False
    short = np.zeros(len(c), dtype=bool)
    return _pack(long, short, a, p["stop_atr"])


def _btc_eth_breakout(o, h, l, c, v, times, p):
    """20-candle close breakout. No volume, body, or EMA filter.

    Long: close above the prior N highs. Short: close below the prior N lows.
    Stop is ATR beyond that close (simulator). Target is target_r (2R–3R).
    """
    look = max(2, int(p["lookback"]))
    prior_high = np.full(len(c), np.nan)
    prior_low = np.full(len(c), np.nan)
    if look < len(c):
        for i in range(look, len(c)):
            prior_high[i] = h[i - look:i].max()
            prior_low[i] = l[i - look:i].min()
    a = atr(h, l, c, int(p["atr_period"]))
    finite = np.isfinite(a) & (a > 0)
    long = (c > prior_high) & np.isfinite(prior_high) & finite
    short = (c < prior_low) & np.isfinite(prior_low) & finite
    long[0] = short[0] = False
    return _pack(long, short, a, p["stop_atr"])


def _btc_eth_rsi_pullback(o, h, l, c, v, times, p):
    """RSI reclaim with EMA 200 trend filter. Not RSI alone.

    Long: price above EMA 200, RSI crosses back above oversold (default 30).
    Short: price below EMA 200, RSI crosses back below overbought (default 70).
    Stop ATR × (1–1.5). Target target_r (1.5R–2R).
    """
    period = max(2, int(p.get("rsi_period") or 14))
    os_ = float(p.get("oversold") if p.get("oversold") is not None else 30)
    ob = float(p.get("overbought") if p.get("overbought") is not None else 70)
    series = rsi_rolling(c, period)
    e200 = ema(c, 200)
    a = atr(h, l, c, int(p["atr_period"]))
    level_os = np.full(len(c), os_)
    level_ob = np.full(len(c), ob)
    long = _cross_up(series, level_os) & (c > e200) & np.isfinite(e200) & np.isfinite(a) & (a > 0)
    short = _cross_down(series, level_ob) & (c < e200) & np.isfinite(e200) & np.isfinite(a) & (a > 0)
    long[0] = short[0] = False
    return _pack(long, short, a, p["stop_atr"])


def _ema_adx(o, h, l, c, v, times, p):
    fast, slow = ema(c, int(p["fast"])), ema(c, int(p["slow"]))
    e200 = ema(c, 200)
    adx_line = adx_wilder(h, l, c, 14)
    long = _cross_up(fast, slow) & (adx_line > float(p["adx_thresh"])) & (c > e200)
    return _pack(long, np.zeros(len(c), dtype=bool), atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _rsi_reversion(o, h, l, c, v, times, p):
    series = rsi_rolling(c, 14)
    e200 = ema(c, 200)
    mid = sma(c, int(p["mid_period"]))
    a = atr(h, l, c, int(p["atr_period"]))
    vol = np.array([_vol_spike(v, i, 20, float(p["vol_mult"])) for i in range(len(c))])
    raw = np.isfinite(series) & (series < float(p["rsi_thresh"])) & (c > e200) & vol
    long = _edge(raw)
    tp = np.where(long, mid, np.nan)
    return _pack(long, np.zeros(len(c), dtype=bool), a, p["stop_atr"], tp_long=tp)


def _bollinger(o, h, l, c, v, times, p):
    period = int(p["bb_period"])
    mid = sma(c, period)
    # Population-style rolling std matching a simple window (frontend has no BB; this is the live rule).
    sd = np.full(len(c), np.nan)
    for i in range(period - 1, len(c)):
        sd[i] = c[i - period + 1:i + 1].std(ddof=0)
    lower = mid - float(p["bb_std"]) * sd
    series = rsi_rolling(c, 14)
    e200 = ema(c, 200)
    raw = np.isfinite(lower) & (c < lower) & np.isfinite(series) & (series < float(p["oversold"])) & (c > e200)
    long = _edge(raw)
    tp = np.where(long, mid, np.nan)
    return _pack(long, np.zeros(len(c), dtype=bool), atr(h, l, c, int(p["atr_period"])), p["stop_atr"], tp_long=tp)


def _basket(o, h, l, c, v, times, p):
    """Live rule: one symbol, EMA 20 cross above EMA 50, price above EMA 200. Long only."""
    fast, slow = ema(c, int(p["fast"])), ema(c, int(p["slow"]))
    e200 = ema(c, 200)
    long = _cross_up(fast, slow) & (c > e200)
    return _pack(long, np.zeros(len(c), dtype=bool), atr(h, l, c, int(p["atr_period"])), p["stop_atr"])


def _base(**over):
    p = {
        "stop_atr": 1.5,
        "target_r": 2.0,
        "trail_atr": 0.0,
        "atr_period": 14,
        "risk_pct": 1.0,
        "max_leverage": 3.0,
        "allow_shorts": True,
        "max_bars": 0,
        "exit_mid": False,
        "mid_period": 20,
        "tp1_r": 2.0,
        "tp1_frac": 1.0,
        "min_bars": 80,
    }
    p.update(over)
    return p


class NativeEngine:
    """`trend_rider.simulate` jaisa return — bot ka `plan()` isi par chalta hai."""

    level_targets = True

    def __init__(self, strategy, name, defaults, signal_fn, meta):
        self.STRATEGY = strategy
        self.name = name
        self.DEFAULTS = defaults
        self._signal = signal_fn
        self.META_KEYS = meta

    def min_bars(self, p):
        return int(p.get("min_bars") or self.DEFAULTS.get("min_bars") or 80)

    def indicators(self, o, h, l, c, p, times=None, confirm=None, volume=None):
        merged = dict(self.DEFAULTS)
        merged.update(p or {})
        o, h, l, c = (np.asarray(x, dtype=float) for x in (o, h, l, c))
        vol = None if volume is None else np.asarray(volume, dtype=float)
        ind = self._signal(o, h, l, c, vol, None if times is None else np.asarray(times), merged)
        if not merged.get("allow_shorts", True):
            ind["short"] = np.zeros(len(c), dtype=bool)
        # Both sides on one bar — long wins so the two arrays stay exclusive.
        both = ind["long"] & ind["short"]
        ind["short"] = ind["short"] & ~both
        ind["atr"] = np.asarray(ind["atr"], dtype=float)
        return ind

    def simulate(self, times, o, h, l, c, params=None, capital=1000.0, start_index=0, bar_hours=4.0,
                 volume=None, confirm=None):
        p = dict(self.DEFAULTS)
        p.update(params or {})
        o, h, l, c = (np.asarray(x, dtype=float) for x in (o, h, l, c))
        times = np.asarray(times)
        ind = self.indicators(o, h, l, c, p, times=times, volume=volume, confirm=confirm)
        risk = float(p["risk_pct"]) / 100.0
        fund_per_bar = FUNDING_PER_8H * float(bar_hours) / 8.0
        stop_atr = float(p["stop_atr"])
        target_r = float(p.get("target_r") or 0)
        trail_atr = float(p.get("trail_atr") or 0)
        max_bars = int(p.get("max_bars") or 0)
        lev = float(p.get("max_leverage") or 3)

        eq = float(capital)
        trades, curve = [], []
        pos = None
        fees_paid = funding_paid = 0.0
        bars_in_market = 0
        start = max(int(start_index), 1)

        def close_pos(i, raw_px, status):
            nonlocal eq, pos, fees_paid
            d = pos["dir"]
            px = raw_px * (1 - SLIPPAGE) if d > 0 else raw_px * (1 + SLIPPAGE)
            gross = d * pos["qty"] * (px - pos["entry"])
            fee = FEE_RATE * pos["qty"] * px
            eq += gross - fee
            fees_paid += fee
            pos["pnl"] += gross - fee
            trades.append(_trade_row(pos, times[i], px, status))
            pos = None

        for i in range(start, len(c)):
            k = i - 1
            if pos is not None and pos["entry_time"] != int(times[i]):
                d = pos["dir"]
                opposite = (d > 0 and ind["short"][k]) or (d < 0 and ind["long"][k])
                gapped = (d > 0 and o[i] <= pos["stop"]) or (d < 0 and o[i] >= pos["stop"])
                if gapped:
                    close_pos(i, o[i], _stop_status(pos))
                elif opposite:
                    close_pos(i, o[i], "SIGNAL_EXIT")

            if pos is None and k >= start - 1 and (ind["long"][k] or ind["short"][k]):
                d = 1 if ind["long"][k] else -1
                atr_k = float(ind["atr"][k]) if math.isfinite(ind["atr"][k]) else float("nan")
                if math.isfinite(atr_k) and atr_k > 0:
                    stop = float(c[k] - d * stop_atr * atr_k)
                    entry = float(o[i] * (1 + d * SLIPPAGE))
                    dist = d * (entry - stop)
                    if dist > 0 and math.isfinite(dist) and eq > 0:
                        qty = min(eq * risk / dist, eq * lev / entry)
                        if qty > 0 and math.isfinite(qty):
                            fee = FEE_RATE * qty * entry
                            eq -= fee
                            fees_paid += fee
                            tp_arr = ind["tp_long"] if d > 0 else ind["tp_short"]
                            if target_r > 0:
                                target = entry + d * target_r * dist
                            elif math.isfinite(tp_arr[k]) and d * (float(tp_arr[k]) - entry) > 0:
                                target = float(tp_arr[k])
                            else:
                                target = None
                            pos = {
                                "dir": d, "entry": entry, "stop": stop, "init_stop": stop,
                                "qty": qty, "qty0": qty, "risk_amt": qty * dist,
                                "entry_time": int(times[i]), "pnl": -fee, "bars": 0,
                                "target": target, "entry_index": i,
                            }

            if pos is not None:
                d = pos["dir"]
                pos["bars"] += 1
                bars_in_market += 1
                if d > 0:
                    f = fund_per_bar * pos["qty"] * c[i]
                    eq -= f
                    funding_paid += f
                    pos["pnl"] -= f
                just_opened = pos["entry_index"] == i
                if not just_opened and ((d > 0 and o[i] <= pos["stop"]) or (d < 0 and o[i] >= pos["stop"])):
                    close_pos(i, o[i], _stop_status(pos))
                elif (d > 0 and l[i] <= pos["stop"]) or (d < 0 and h[i] >= pos["stop"]):
                    close_pos(i, pos["stop"], _stop_status(pos))
                elif pos is not None and pos["target"] is not None and (
                        (d > 0 and h[i] >= pos["target"]) or (d < 0 and l[i] <= pos["target"])):
                    kind = "MID_EXIT" if p.get("exit_mid") else "TARGET_HIT"
                    close_pos(i, pos["target"], kind)
                elif pos is not None:
                    if max_bars and pos["bars"] >= max_bars:
                        close_pos(i, c[i], "TIME_EXIT")
                    elif trail_atr > 0 and math.isfinite(ind["atr"][i]):
                        tv = float(c[i] - d * trail_atr * ind["atr"][i])
                        if math.isfinite(tv):
                            pos["stop"] = max(pos["stop"], tv) if d > 0 else min(pos["stop"], tv)

            mtm = pos["dir"] * pos["qty"] * (c[i] - pos["entry"]) if pos is not None else 0.0
            curve.append((int(times[i]), eq + mtm))

        open_position = None
        if pos is not None:
            d = pos["dir"]
            mtm_pnl = pos["pnl"] + d * pos["qty"] * (c[-1] - pos["entry"])
            open_position = {
                "side": "buy" if d > 0 else "sell",
                "entry_time": pos["entry_time"],
                "entry_price": pos["entry"],
                "stop_loss": pos["stop"],
                "initial_stop": pos["init_stop"],
                "quantity": pos["qty"],
                "initial_quantity": pos["qty0"],
                "tp1_price": pos["target"],
                "tp1_done": False,
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


def _trade_row(pos, exit_time, exit_px, status):
    d = pos["dir"]
    return {
        "side": "buy" if d > 0 else "sell",
        "entry_time": pos["entry_time"],
        "exit_time": int(exit_time),
        "entry_price": round(pos["entry"], 6),
        "exit_price": round(float(exit_px), 6),
        "stop_loss": round(pos["init_stop"], 6),
        "target": None if pos["target"] is None else round(pos["target"], 6),
        "quantity": pos["qty0"],
        "tp1_hit": status in ("TARGET_HIT", "MID_EXIT"),
        "pnl": round(pos["pnl"], 4),
        "pnl_points": round(d * (float(exit_px) - pos["entry"]), 6),
        "r_multiple": round(pos["pnl"] / pos["risk_amt"], 3) if pos["risk_amt"] > 0 else 0.0,
        "bars_held": pos["bars"],
        "status": status,
    }


def _engine(strategy, name, signal_fn, defaults, meta):
    return NativeEngine(strategy, name, defaults, signal_fn, meta)


_RISK_META = ("stop_atr", "target_r", "trail_atr", "allow_shorts", "max_bars")

ENGINES = {
    "ema-crossover": _engine(
        "ema-crossover", "EMA Crossover", _ema_cross,
        _base(fast=9, slow=21, min_bars=30),
        ("fast", "slow", *_RISK_META)),
    "macd": _engine(
        "macd", "MACD", _macd,
        _base(fast=12, slow=26, signal=9, min_bars=40),
        ("fast", "slow", "signal", *_RISK_META)),
    "rsi-divergence": _engine(
        "rsi-divergence", "RSI Divergence", _rsi_divergence,
        _base(rsi_period=14, overbought=70, oversold=30, pivot_span=3, min_bars=40),
        ("rsi_period", "overbought", "oversold", "pivot_span", *_RISK_META)),
    "custom-ema": _engine(
        "custom-ema", "Custom EMA", _custom_ema,
        _base(ema9=9, ema21=21, ema50=50, min_bars=60),
        ("ema9", "ema21", "ema50", *_RISK_META)),
    "atr-channel-pro": _engine(
        "atr-channel-pro", "ATR Channel", _atr_channel,
        _base(ema_period=21, atr_mult=2.0, adx_period=14, adx_min=22.0, volume_lookback=20, min_bars=50),
        ("ema_period", "atr_mult", "adx_period", "adx_min", "volume_lookback", *_RISK_META)),
    "vwap-reclaim-pro": _engine(
        "vwap-reclaim-pro", "VWAP Reclaim", _vwap,
        _base(ema_fast=9, ema_slow=21, volume_lookback=20, rsi_period=14, require_rsi=True,
              rsi_overbought=70, rsi_oversold=30, min_bars=40),
        ("ema_fast", "ema_slow", "volume_lookback", "rsi_period", "require_rsi", *_RISK_META)),
    "ema-pullback-pro": _engine(
        "ema-pullback-pro", "EMA Pullback", _ema_pullback,
        _base(ema_fast=9, ema_mid=21, ema_slow=50, pullback_pct=0.25, adx_period=14, adx_min=25.0,
              rsi_period=14, min_bars=60),
        ("ema_fast", "ema_mid", "ema_slow", "pullback_pct", "adx_min", *_RISK_META)),
    "btc-eth-breakout": _engine(
        "btc-eth-breakout", "BTC/ETH Breakout", _btc_eth_breakout,
        _base(lookback=20, stop_atr=1.5, target_r=2.0, trail_atr=0.0, allow_shorts=True,
              max_bars=0, min_bars=40),
        ("lookback", "stop_atr", "target_r", "allow_shorts")),
    "btc-eth-rsi-pullback": _engine(
        "btc-eth-rsi-pullback", "BTC/ETH RSI Pullback", _btc_eth_rsi_pullback,
        _base(rsi_period=14, oversold=30, overbought=70, stop_atr=1.5, target_r=2.0,
              trail_atr=0.0, allow_shorts=True, max_bars=0, min_bars=220),
        ("rsi_period", "oversold", "overbought", "stop_atr", "target_r", "allow_shorts")),
    "donchian-breakout-20k": _engine(
        "donchian-breakout-20k", "Donchian Breakout", _donchian,
        _base(lookback=20, stop_atr=2.0, target_r=0.0, trail_atr=3.0, allow_shorts=False,
              max_bars=60, tp1_r=0.0, tp1_frac=0.0, min_bars=220),
        ("lookback", "trail_atr", "stop_atr", "allow_shorts", "max_bars")),
    "ema-adx-10k": _engine(
        "ema-adx-10k", "EMA + ADX", _ema_adx,
        _base(fast=20, slow=50, adx_thresh=25.0, stop_atr=2.0, target_r=0.0, trail_atr=2.0,
              allow_shorts=False, max_bars=72, tp1_r=0.0, tp1_frac=0.0, min_bars=220),
        ("fast", "slow", "adx_thresh", "trail_atr", "stop_atr", "max_bars")),
    "rsi-reversion-3k": _engine(
        "rsi-reversion-3k", "RSI Reversion", _rsi_reversion,
        _base(rsi_thresh=25, vol_mult=1.5, stop_atr=1.5, target_r=0.0, exit_mid=True,
              allow_shorts=False, max_bars=48, tp1_r=0.0, tp1_frac=1.0, min_bars=220),
        ("rsi_thresh", "vol_mult", "stop_atr", "mid_period", "max_bars")),
    "bollinger-rsi-5k": _engine(
        "bollinger-rsi-5k", "Bollinger + RSI", _bollinger,
        _base(bb_period=20, bb_std=2.0, oversold=30, stop_atr=1.5, target_r=0.0, exit_mid=True,
              allow_shorts=False, max_bars=48, tp1_r=0.0, tp1_frac=1.0, min_bars=220),
        ("bb_period", "bb_std", "oversold", "stop_atr", "max_bars")),
    "crypto-portfolio-50k": _engine(
        "crypto-portfolio-50k", "Multi-Asset Basket", _basket,
        _base(fast=20, slow=50, stop_atr=2.0, target_r=0.0, trail_atr=2.0, allow_shorts=False,
              max_bars=72, risk_pct=0.7, tp1_r=0.0, tp1_frac=0.0, min_bars=220),
        ("fast", "slow", "stop_atr", "trail_atr", "max_bars")),
}


def settings(strategy, source):
    """Backtest query aur bot deploy dono ke liye. Galti par ValueError."""
    eng = ENGINES[strategy]
    p = dict(eng.DEFAULTS)
    try:
        capital = float(source.get("capital", 1000))
        risk_pct = float(source.get("risk_pct", p.get("risk_pct", 1)))
    except (TypeError, ValueError):
        raise ValueError(f"{eng.name} parameters must be numbers.")
    p["risk_pct"] = risk_pct
    for key in _FLOAT_KEYS + _INT_KEYS + _BOOL_KEYS:
        if key not in p or key not in source or source.get(key) in (None, ""):
            continue
        raw = source.get(key)
        try:
            if key in _BOOL_KEYS:
                p[key] = raw if isinstance(raw, bool) else str(raw).lower() == "true"
            elif key in _INT_KEYS:
                p[key] = int(float(raw))
            else:
                p[key] = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{eng.name}: '{key}' must be a number.")
    if capital <= 0 or not (0 < risk_pct <= 5):
        raise ValueError("Capital must be greater than 0 and risk between 0 and 5%.")
    if not (0.5 <= float(p["stop_atr"]) <= 6):
        raise ValueError("Stop ATR multiple must be between 0.5 and 6.")
    if float(p.get("target_r") or 0) < 0 or float(p.get("target_r") or 0) > 8:
        raise ValueError("Target R must be between 0 and 8 (0 = no fixed target).")
    # Bot watches tp1 for a full exit when there is a fixed target or a mean target.
    if float(p.get("target_r") or 0) > 0:
        p["tp1_r"] = float(p["target_r"])
        p["tp1_frac"] = 1.0
    elif p.get("exit_mid"):
        p["tp1_r"] = 0.0
        p["tp1_frac"] = 1.0
    else:
        p["tp1_r"] = 0.0
        p["tp1_frac"] = 0.0
    return capital, risk_pct, p
