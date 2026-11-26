#!/usr/bin/env python3
"""AVPT accuracy smoke — BTC/ETH/SOL 4h, last 365d (+warmup). Network required."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import time
import urllib.request

import avpt
import numpy as np

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
TIMEFRAME = "4h"
DAYS = 365
CAPITAL = 1000.0
BASE = "https://data-api.binance.vision/api/v3/klines"


def load(symbol):
    """Binance public spot klines (no API key)."""
    end = int(time.time() * 1000)
    start_ms = end - (DAYS + 40) * 86400_000
    step = 4 * 3600_000
    out = []
    cur = start_ms
    while cur < end:
        url = f"{BASE}?symbol={symbol}&interval={TIMEFRAME}&startTime={cur}&limit=1000"
        req = urllib.request.Request(url, headers={"User-Agent": "avpt-accuracy/1"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.loads(resp.read())
        if not batch:
            break
        out.extend(batch)
        cur = batch[-1][0] + step
        if len(batch) < 1000:
            break
        time.sleep(0.05)
    seen, rows = set(), []
    for k in out:
        if k[0] in seen:
            continue
        seen.add(k[0])
        rows.append(k)
    times = np.array([int(k[0]) for k in rows], dtype=np.int64)
    o = np.array([float(k[1]) for k in rows])
    h = np.array([float(k[2]) for k in rows])
    l = np.array([float(k[3]) for k in rows])
    c = np.array([float(k[4]) for k in rows])
    v = np.array([float(k[5]) for k in rows])
    return times, o, h, l, c, v


def main():
    print(f"AVPT accuracy · {TIMEFRAME} · {DAYS}d · Auto-Optimize · capital ${CAPITAL:.0f}/coin\n")
    rows = []
    for sym in SYMBOLS:
        times, o, h, l, c, v = load(sym)
        tf_min = 240
        window = int(DAYS * 1440 / tf_min)
        start = max(len(c) - window, avpt.min_bars())
        res = avpt.simulate(
            times,
            o,
            h,
            l,
            c,
            params={"filter_mode": "auto", "risk_pct": 1.0},
            capital=CAPITAL,
            start_index=start,
            bar_hours=4.0,
            volume=v,
        )
        ph = res["phenlabs"]
        st = res["stats"]
        print(f"=== {sym} ===")
        print(f"  Winner profile : {ph['profile']}")
        print(f"  TP1+ win rate  : {ph['tp1_win_rate']}%  ({ph['wins']}W / {ph['losses']}L · {ph['total']} trades)")
        print(f"  Cum net R      : {ph['cum_net_r']:+.1f}R")
        print(f"  TP hits        : TP1={ph['tp1_hits']}  TP2={ph['tp2_hits']}  TP3={ph['tp3_hits']}")
        print(f"  Equity P&L     : {st.get('return_pct', 'n/a')}%  "
              f"PF={st.get('profit_factor')}  MaxDD={st.get('max_drawdown_pct')}%")
        print(f"  Closed fills   : {len(res['trades'])}")
        print("  All profiles:")
        for p in ph["profiles"]:
            if p["trades"]:
                print(f"    [{p['id']}] {p['name']:<14}  WR {p['win_rate']:>5.1f}%  "
                      f"{p['wins']}W/{p['losses']}L  netR {p['cum_net_r']:+.1f}  n={p['trades']}")
        print()
        rows.append((sym, ph, st, len(res["trades"])))

    if rows:
        avg_wr = sum(r[1]["tp1_win_rate"] for r in rows) / len(rows)
        print(f"Average Auto-Optimize TP1+ win rate across {len(rows)} coins: {avg_wr:.1f}%")


if __name__ == "__main__":
    main()
