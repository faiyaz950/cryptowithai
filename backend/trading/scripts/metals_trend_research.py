"""
Metals Trend Rider — gold (XAUUSD) aur silver (XAGUSD) ka research backtest, dobara chalane layak.

Ye wahi test hai jisse `mt5/MetalsTrendRider.mq5` ke rules chune gaye — Trend Rider ke
rules, bas 12h candles par:

  LONG  : band candle ka close > pichhli 30 candles ka highest high  AND close > EMA(200)
  SHORT : close < pichhli 30 candles ka lowest low AND close < EMA(200) AND EMA(50) < EMA(200)
  Entry : agli candle ke open par
  Stop  : entry -/+ 2 x ATR(14) (Wilder); har candle close par stop pichhli 15 candles ke
          low (long) / high (short) tak khisakta hai — kabhi peeche nahi
  Exit  : stop, ya ulta signal (tab position palat jaati hai)
  Size  : stop lagne par equity ka 1% jaaye, notional max 5x equity

12h kyun, 4h kyun nahi: PAXG (Bybit, 2022 se) par 4h wale rules 2022-06..2024-06 ki choppy
market mein har setting par haare — MT5 jaise kam kharche par bhi. Timeframe bada karte gaye
to dono periods mein profitable combos badhte gaye (4h 39% -> 8h 72% -> 12h 100% -> 1d 97%,
MT5 cost par). 12h par exchange fees + funding ke saath bhi 36/36 combos dono periods mein
profit mein rahe. Section 2 yahi dikhata hai.

Kharcha:
  * MT5 CFD : gold 0.01%/side (intraday) / 0.02% (daily ETF), silver 0.04% / 0.08%.
              Long swap = us saal ki US rate + 2.5% markup, short 1.5%/saal (credit kabhi nahi).
  * Exchange: Delta taker 0.05% + 18% GST + 0.02% slippage = ~0.079%/side, long funding
              0.01%/8h (~11%/saal), shorts ko funding milna nahi gina — `trend_rider.py` jaisa.

Data (sab public, bina key):
  * daily : Yahoo GLD / SLV ETF, 2006 -> aaj — IS 2007-03..2016, OOS 2017..aaj
  * 1h    : Yahoo GC=F / SI=F futures (~730 din) -> New York close par aligned 12h (MT5 jaisa)
  * 4h    : Bybit PAXGUSDT perp, Mar 2022 -> aaj — IS 2022-06..2024-06, OOS 2024-07..aaj

Chalao:  backend/venv/bin/python backend/trading/scripts/metals_trend_research.py
"""
import argparse
import csv
import itertools
import json
import os
import sys
import tempfile
import time
import urllib.request
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

YEAR_SEC = 365.25 * 86400
# Saal ki average US policy rate (%) — CFD long swap ~ rate + broker markup.
FED = {2004: 1.4, 2005: 3.2, 2006: 5.0, 2007: 5.0, 2008: 1.9, 2009: 0.2, 2010: 0.2, 2011: 0.1, 2012: 0.1,
       2013: 0.1, 2014: 0.1, 2015: 0.1, 2016: 0.4, 2017: 1.0, 2018: 1.8, 2019: 2.2, 2020: 0.4, 2021: 0.1,
       2022: 1.7, 2023: 5.0, 2024: 5.1, 2025: 4.2, 2026: 3.6}
SWAP_MARKUP = 0.025
SWAP_SHORT = 0.015
# Exchange (Delta) — backend `trend_rider.py` ke FEE_RATE + SLIPPAGE + FUNDING_PER_8H.
EXCH_COST = 0.0005 * 1.18 + 0.0002
EXCH_LONG_FUNDING = 0.0001 * 3 * 365.25

FINAL = dict(N=30, M=15, k=2.0, shorts=True)
GRID = list(itertools.product([20, 30, 55], [10, 15, 20], [2.0, 3.0], [True, False]))
DAILY = {"GOLD": ("GLD", 0.0002), "SILVER": ("SLV", 0.0008)}
INTRADAY = {"XAUUSD": ("GC=F", 0.0001), "XAGUSD": ("SI=F", 0.0004)}
IS_START, SPLIT = "2007-03-01", "2017-01-01"
PAXG_IS, PAXG_SPLIT = "2022-06-23", "2024-07-01"


# ---------------------------------------------------------------- data
def fetch_yahoo(symbol, interval, cache_dir):
    path = os.path.join(cache_dir, f"{symbol.replace('=', '_')}_{interval}.csv")
    if os.path.exists(path):
        return path
    extra = "period1=0&period2=9999999999" if interval == "1d" else "range=730d"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&{extra}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    r = json.load(urllib.request.urlopen(req, timeout=60))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ts", "o", "h", "l", "c"])
        for i, t in enumerate(r["timestamp"]):
            row = [q[k][i] for k in ("open", "high", "low", "close")]
            if None not in row:
                w.writerow([t] + row)
    return path


def fetch_bybit_4h(symbol, cache_dir):
    """Bybit linear perp ki poori 4h history (public kline API, 1000 candles/page)."""
    path = os.path.join(cache_dir, f"bybit_{symbol}_240.csv")
    if os.path.exists(path):
        return path
    rows, end = {}, None
    for _ in range(60):
        url = f"https://api.bybit.com/v5/market/kline?category=linear&symbol={symbol}&interval=240&limit=1000"
        if end:
            url += f"&end={end}"
        page = json.load(urllib.request.urlopen(url, timeout=30))["result"]["list"]
        if not page:
            break
        for k in page:
            rows[int(k[0])] = k
        end = min(int(k[0]) for k in page) - 1
        if len(page) < 1000:
            break
        time.sleep(0.2)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ts", "o", "h", "l", "c"])
        for t in sorted(rows):
            w.writerow([t // 1000] + rows[t][1:5])
    return path


def load(path):
    d = pd.read_csv(path)
    d["dt"] = pd.to_datetime(d.ts, unit="s")
    return d


def resample(d, rule):
    g = d.set_index("dt").resample(rule).agg({"o": "first", "h": "max", "l": "min", "c": "last", "ts": "first"})
    return g.dropna().reset_index()


def to_server_time(d):
    """Yahoo 1h -> server time (New York + 7h, jaise GMT+2/+3 MT5 broker), jhoothi wick kaat kar."""
    d = d.copy()
    med = (d.h - d.l).rolling(50, min_periods=10).median().bfill()
    d["h"] = np.minimum(d.h, np.maximum(d.o, d.c) + 6 * med)
    d["l"] = np.maximum(d.l, np.minimum(d.o, d.c) - 6 * med)
    ny = d.dt.dt.tz_localize("UTC").dt.tz_convert("America/New_York").dt.tz_localize(None)
    d["dt"] = ny + pd.Timedelta(hours=7)
    return d


# ---------------------------------------------------------------- indicators
def ema(x, n):
    return pd.Series(x).ewm(span=n, adjust=False).mean().values


def atr(h, l, c, n=14):
    pc = np.r_[c[0], c[:-1]]
    tr = np.maximum(h - l, np.maximum(abs(h - pc), abs(l - pc)))
    return pd.Series(tr).ewm(alpha=1.0 / n, adjust=False).mean().values


def donchian_signals(d, N=30, M=15, k=2.0, shorts=True, regime=200, fast=50):
    h, l, c = (d[x].values.astype(float) for x in "hlc")
    a = atr(h, l, c, 14)
    up = pd.Series(h).shift(1).rolling(N).max().values
    dn = pd.Series(l).shift(1).rolling(N).min().values
    es, ef = ema(c, regime), ema(c, fast)
    le = (c > up) & (c > es)
    se = (c < dn) & (c < es) & (ef < es) if shorts else np.zeros(len(c), bool)
    return dict(long_entry=le, short_entry=se, stop_dist=k * a,
                trail_long=pd.Series(l).rolling(M).min().values,
                trail_short=pd.Series(h).rolling(M).max().values)


# ---------------------------------------------------------------- simulator
def simulate(d, sig, cost_side, start, risk_pct=1.0, max_lev=5.0, capital=10000.0,
             long_swap=None, short_swap=SWAP_SHORT):
    """long_swap None = MT5 swap (US rate + markup); warna fixed salana rate (exchange funding)."""
    o, h, l, c = (d[x].values.astype(float) for x in "ohlc")
    t = d.ts.values.astype(float)
    n = len(c)
    i0 = int(np.searchsorted(d.dt.values, np.datetime64(pd.Timestamp(start))))
    LE, SE, SD, TL, TS = (sig[x] for x in ("long_entry", "short_entry", "stop_dist", "trail_long", "trail_short"))
    if long_swap is None:
        years = pd.to_datetime(t, unit="s").year.values
        long_rate = np.array([FED.get(y, 3.0) / 100 + SWAP_MARKUP for y in years])
    else:
        long_rate = np.full(n, long_swap)

    eq, pos, qty, entry, stop, swap_acc = capital, 0, 0.0, 0.0, 0.0, 0.0
    pending, pend_sd, exit_pending = 0, 0.0, False
    trades, curve = [], np.full(n, np.nan)

    def close(px):
        nonlocal eq, pos, qty, swap_acc
        pnl = pos * (px - entry) * qty - px * qty * cost_side
        eq += pnl
        trades.append(pnl - entry * qty * cost_side - swap_acc)
        pos, qty, swap_acc = 0, 0.0, 0.0

    for i in range(i0, n):
        if exit_pending and pos:
            close(o[i])
        exit_pending = False
        if pending and not pos and pend_sd > 0 and eq > 0:
            entry = o[i]
            qty = min(eq * risk_pct / 100.0 / pend_sd, eq * max_lev / entry)
            pos, stop = pending, entry - pending * pend_sd
            eq -= entry * qty * cost_side
        pending = 0
        if pos == 1 and (o[i] <= stop or l[i] <= stop):
            close(min(o[i], stop))
        elif pos == -1 and (o[i] >= stop or h[i] >= stop):
            close(max(o[i], stop))
        if pos and i + 1 < n:
            sw = c[i] * qty * (long_rate[i] if pos == 1 else short_swap) * (t[i + 1] - t[i]) / YEAR_SEC
            eq -= sw
            swap_acc += sw
        if pos == 1:
            stop = max(stop, TL[i]) if not np.isnan(TL[i]) else stop
            exit_pending = bool(SE[i])
        elif pos == -1:
            stop = min(stop, TS[i]) if not np.isnan(TS[i]) else stop
            exit_pending = bool(LE[i])
        if (not pos or exit_pending) and i + 1 < n and not np.isnan(SD[i]):
            if LE[i]:
                pending, pend_sd = 1, SD[i]
            elif SE[i]:
                pending, pend_sd = -1, SD[i]
        curve[i] = eq + (pos * (c[i] - entry) * qty if pos else 0.0)
    if pos:
        close(c[n - 1])
        curve[n - 1] = eq
    return stats(np.array(trades), pd.Series(curve[i0:], index=d.dt.values[i0:]), capital, c[i0:])


def stats(trades, curve, capital, c):
    daily = curve.resample("1D").last().dropna()
    r = daily.pct_change().dropna()
    yrs = max((curve.index[-1] - curve.index[0]).days / 365.25, 1e-9)
    final = curve.iloc[-1]
    loss = -trades[trades < 0].sum()
    return {
        "ret%": (final / capital - 1) * 100,
        "cagr%": ((final / capital) ** (1 / yrs) - 1) * 100 if final > 0 else -100.0,
        "dd%": float((1 - curve / curve.cummax()).max() * 100),
        "sharpe": r.mean() / r.std() * np.sqrt(252) if r.std() > 0 else 0.0,
        "trades": len(trades),
        "win%": (trades > 0).mean() * 100 if len(trades) else 0.0,
        "pf": trades[trades > 0].sum() / loss if loss > 0 else float("inf"),
        "bh%": (c[-1] / c[0] - 1) * 100,
        "curve": curve,
    }


def line(tag, s):
    return (f"{tag:34s} ret {s['ret%']:6.1f}%  CAGR {s['cagr%']:5.1f}%  maxDD {s['dd%']:5.1f}%  "
            f"Sharpe {s['sharpe']:.2f}  trades {s['trades']:3d}  win {s['win%']:4.1f}%  PF {s['pf']:.2f}  "
            f"(buy&hold {s['bh%']:6.1f}%)")


def window(d, start, end, p, **cost):
    dd = d[d.dt < pd.Timestamp(end)].reset_index(drop=True)
    return simulate(dd, donchian_signals(dd, **p), start=start, **cost)


# ---------------------------------------------------------------- reports
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(tempfile.gettempdir(), "metals_trend_data"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    daily = {m: load(fetch_yahoo(sym, "1d", args.cache)) for m, (sym, _) in DAILY.items()}
    server = {m: to_server_time(load(fetch_yahoo(sym, "1h", args.cache))) for m, (sym, _) in INTRADAY.items()}
    paxg4 = load(fetch_bybit_4h("PAXGUSDT", args.cache))
    mt5_gold = dict(cost_side=INTRADAY["XAUUSD"][1])
    exch = dict(cost_side=EXCH_COST, long_swap=EXCH_LONG_FUNDING, short_swap=0.0)

    print("=== 1) Daily, 20 saal (GLD/SLV) — har combo IS 2007-16 aur OOS 2017-aaj, MT5 kharche")
    ok = 0
    for N, M, k, sh in GRID:
        p, good, cells = dict(N=N, M=M, k=k, shorts=sh), True, []
        for m, (_, cost) in DAILY.items():
            s_is = window(daily[m], IS_START, SPLIT, p, cost_side=cost)
            s_oos = window(daily[m], SPLIT, "2100-01-01", p, cost_side=cost)
            good &= s_is["ret%"] > 0 and s_oos["ret%"] > 0
            cells.append(f"{m[:2]} IS {s_is['ret%']:5.1f}% OOS {s_oos['ret%']:5.1f}%")
        ok += good
        print(f"  N{N:<3d} M{M:<3d} k{k:<4} shorts={str(sh):5s} | " + " | ".join(cells))
    print(f"  -> {ok}/{len(GRID)} combos dono metals par dono halves mein profitable\n")

    print(f"=== 2) Timeframe: PAXG (Bybit) — {len(GRID)} combos mein kitne IS {PAXG_IS[:7]}..{PAXG_SPLIT[:7]}"
          " AUR OOS dono mein profitable")
    for rule in ("4h", "8h", "12h", "1D"):
        g = paxg4 if rule == "4h" else resample(paxg4, rule)
        cells = []
        for tag, cost in (("MT5 cost", mt5_gold), ("exchange fee+funding", exch)):
            res = np.array([[window(g, PAXG_IS, PAXG_SPLIT, dict(N=N, M=M, k=k, shorts=sh), **cost)["ret%"],
                             window(g, PAXG_SPLIT, "2100-01-01", dict(N=N, M=M, k=k, shorts=sh), **cost)["ret%"]]
                            for N, M, k, sh in GRID])
            both = ((res[:, 0] > 0) & (res[:, 1] > 0)).mean() * 100
            cells.append(f"{tag}: {both:5.1f}% (IS median {np.median(res[:, 0]):5.1f}%, OOS {np.median(res[:, 1]):5.1f}%)")
        print(f"  {rule:4s} | " + " | ".join(cells))

    print("\n=== 3) 12h grid — PAXG IS/OOS (exchange fee+funding) aur Yahoo GC=F / SI=F 12h (MT5 cost)")
    paxg12 = resample(paxg4, "12h")
    gc12, si12 = resample(server["XAUUSD"], "12h"), resample(server["XAGUSD"], "12h")
    for N, M, k, sh in GRID:
        p = dict(N=N, M=M, k=k, shorts=sh)
        a = window(paxg12, PAXG_IS, PAXG_SPLIT, p, **exch)["ret%"]
        b = window(paxg12, PAXG_SPLIT, "2100-01-01", p, **exch)["ret%"]
        g = window(gc12, gc12.dt.iloc[260], "2100-01-01", p, **mt5_gold)["ret%"]
        s = window(si12, si12.dt.iloc[260], "2100-01-01", p, cost_side=INTRADAY["XAGUSD"][1])["ret%"]
        print(f"  N{N:<3d} M{M:<3d} k{k:<4} shorts={str(sh):5s} | PAXG IS {a:5.1f}% OOS {b:5.1f}% | GC {g:5.1f}% | SI {s:5.1f}%")

    print(f"\n=== 4) Final rules {FINAL} — 12h, 1% risk")
    for tag, (a, b) in (("IS", (PAXG_IS, PAXG_SPLIT)), ("OOS", (PAXG_SPLIT, "2100-01-01")), ("poora", (PAXG_IS, "2100-01-01"))):
        print(line(f"PAXG 12h exchange {tag}", window(paxg12, a, b, FINAL, **exch)))
        print(line(f"PAXG 12h MT5 cost {tag}", window(paxg12, a, b, FINAL, **mt5_gold)))
    s4 = window(paxg4, PAXG_IS, PAXG_SPLIT, FINAL, **exch)
    print(line("PAXG 4h exchange IS (tulna)", s4))
    for m, g12 in (("XAUUSD", gc12), ("XAGUSD", si12)):
        st = g12.dt.iloc[260]
        cost = INTRADAY[m][1]
        print(line(f"{m} H12 MT5 cost", window(g12, st, "2100-01-01", FINAL, cost_side=cost)))
        print(line(f"{m} H12 3x cost", window(g12, st, "2100-01-01", FINAL, cost_side=cost * 3)))
    for m, (_, cost) in DAILY.items():
        print(line(f"{m} D1 2007-aaj", window(daily[m], IS_START, "2100-01-01", FINAL, cost_side=cost)))


if __name__ == "__main__":
    sys.exit(main())
