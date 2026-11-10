"""
5 capital-based crypto strategies + risk manager + backtester (long-only spot, ccxt data).
pip install ccxt pandas numpy
Run:  python crypto_strategies.py backtest 3000     (3000/5000/10000/20000/50000)
      python crypto_strategies.py signal 5000       (latest signal, paper only)
Exchange change karne ke liye EXCHANGE badlo (binance, delta, coindcx via ccxt).
NOTE: Backtest ke baad hi live jao. Profit guaranteed nahi.
"""
import sys
import warnings
import numpy as np
import pandas as pd
import ccxt

warnings.filterwarnings("ignore")

EXCHANGE = "binance"
FEE = 0.001          # 0.1% per side
SLIPPAGE = 0.0005    # 0.05%
DAILY_LOSS_LIMIT = 0.03
MAX_DRAWDOWN = 0.15


# ---------------- Indicators ----------------
def ema(s, n): return s.ewm(span=n, adjust=False).mean()

def rsi(c, n=14):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))

def atr(df, n=14):
    pc = df.close.shift()
    tr = pd.concat([df.high - df.low, (df.high - pc).abs(), (df.low - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/n, adjust=False).mean()

def adx(df, n=14):
    up, dn = df.high.diff(), -df.low.diff()
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    ndm = np.where((dn > up) & (dn > 0), dn, 0.0)
    a = atr(df, n)
    pdi = 100 * pd.Series(pdm, index=df.index).ewm(alpha=1/n, adjust=False).mean() / a
    ndi = 100 * pd.Series(ndm, index=df.index).ewm(alpha=1/n, adjust=False).mean() / a
    dx = 100 * (pdi - ndi).abs() / (pdi + ndi).replace(0, np.nan)
    return dx.ewm(alpha=1/n, adjust=False).mean()


# ---------------- Strategies ----------------
# prepare(df) -> df with indicators + boolean 'entry' column
# Har strategy ka config: sl_atr, tp ('mid' ya None), trail_atr, max_bars, risk

def s_rsi_reversion(df):            # Rs 3,000
    df["rsi"], df["atr"] = rsi(df.close), atr(df)
    df["ema200"], df["mid"] = ema(df.close, 200), df.close.rolling(20).mean()
    df["entry"] = (df.rsi < 25) & (df.close > df.ema200) & (df.volume > 1.5 * df.volume.rolling(20).mean())
    return df

def s_bollinger_rsi(df):            # Rs 5,000
    df["rsi"], df["atr"] = rsi(df.close), atr(df)
    ma, sd = df.close.rolling(20).mean(), df.close.rolling(20).std()
    df["mid"], lower = ma, ma - 2 * sd
    df["ema200"] = ema(df.close, 200)  # ~ 1h EMA50 on 15m data
    calm = df.atr < 2 * df.atr.rolling(50).mean()   # crash candle skip
    df["entry"] = (df.close < lower) & (df.rsi < 30) & (df.close > df.ema200) & calm
    return df

def s_ema_adx(df):                  # Rs 10,000
    df["atr"], df["adx"] = atr(df), adx(df)
    e20, e50 = ema(df.close, 20), ema(df.close, 50)
    df["ema200"] = ema(df.close, 200)  # ~ 4h EMA50 on 1h data
    cross = (e20 > e50) & (e20.shift() <= e50.shift())
    df["entry"] = cross & (df.adx > 25) & (df.close > df.ema200)
    return df

def s_donchian(df):                 # Rs 20,000
    df["atr"] = atr(df)
    hh = df.high.rolling(20).max().shift()
    vol_ok = df.volume > 1.5 * df.volume.rolling(20).mean()
    # false-breakout filter: close breakout ke upar + candle body strong
    strong = (df.close - df.open) > 0.5 * (df.high - df.low)
    df["entry"] = (df.close > hh) & vol_ok & strong
    return df

def s_portfolio(df):                # Rs 50,000 (RSI-reversion + EMA/ADX mix)
    a = s_rsi_reversion(df.copy())
    b = s_ema_adx(df.copy())
    df["atr"] = a["atr"]
    df["adx"] = b["adx"]
    df["rsi"] = a["rsi"]
    df["mid"] = a["mid"]
    df["ema200"] = a["ema200"]
    df["entry_rsi"] = a["entry"]
    df["entry_trend"] = b["entry"]
    df["entry"] = a["entry"] | b["entry"]
    return df

CONFIGS = {
    3000:  dict(name="RSI Reversion",  fn=s_rsi_reversion, tf="15m", sl_atr=1.5, tp="mid", trail=None, max_bars=48, risk=0.01,  lev=1),
    5000:  dict(name="Bollinger+RSI",  fn=s_bollinger_rsi, tf="15m", sl_atr=1.5, tp="mid", trail=None, max_bars=48, risk=0.01,  lev=1),
    10000: dict(name="EMA+ADX",        fn=s_ema_adx,       tf="1h",  sl_atr=2.0, tp=None,  trail=2.0,  max_bars=72, risk=0.01,  lev=1),
    20000: dict(name="Donchian",       fn=s_donchian,      tf="4h",  sl_atr=2.0, tp=None,  trail=3.0,  max_bars=60, risk=0.01,  lev=1),
    50000: dict(name="Portfolio",      fn=s_portfolio,     tf="1h",  sl_atr=2.0, tp=None,  trail=2.5,  max_bars=72, risk=0.007, lev=1,
                symbols=["BTC/USDT", "ETH/USDT", "SOL/USDT"]),
}


# ---------------- Data ----------------
def fetch(symbol, tf, limit=5000):
    ex = getattr(ccxt, EXCHANGE)({"enableRateLimit": True})
    rows, since = [], None
    ms = ex.parse_timeframe(tf) * 1000
    since = ex.milliseconds() - limit * ms
    while len(rows) < limit:
        b = ex.fetch_ohlcv(symbol, tf, since=since, limit=1000)
        if not b: break
        rows += b
        since = b[-1][0] + ms
        if len(b) < 1000: break
    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
    df.index = pd.to_datetime(df.ts, unit="ms")
    return df.drop(columns="ts")[~df.index.duplicated()]


# ---------------- Backtest with risk manager ----------------
def backtest(df, cfg, capital, btc_ok=None):
    df = cfg["fn"](df.copy()).dropna()
    eq, peak = capital, capital
    trades, pos, losses = [], None, 0
    day, day_start, halted = None, capital, False
    curve = []
    
    for i in range(1, len(df)):
        r, t = df.iloc[i], df.index[i]
        prev_bar = df.iloc[i - 1]
        
        if t.date() != day:
            day, day_start = t.date(), eq
            
        # ---- exit ----
        if pos:
            pos["bars"] += 1
            # Trailing stop update from previous closed bar's high (realistic, no lookahead)
            if pos.get("trail"):
                pos["sl"] = max(pos["sl"], prev_bar.high - pos["trail"] * pos["atr"])
            
            exit_p = None
            # 1. Stop loss check (pessimistic check first)
            if r.low <= pos["sl"]:
                exit_p = pos["sl"]
            # 2. Take profit check
            elif pos.get("tp") == "mid" and r.high >= prev_bar["mid"]:
                exit_p = prev_bar["mid"]
            # 3. Max bars time exit
            elif pos["bars"] >= cfg["max_bars"]:
                exit_p = r.close
                
            if exit_p is not None:
                exit_p *= (1 - SLIPPAGE)
                pnl = pos["qty"] * (exit_p - pos["entry"]) - FEE * pos["qty"] * (exit_p + pos["entry"])
                eq += pnl
                losses = losses + 1 if pnl < 0 else 0
                trades.append(pnl)
                pos = None
                
        curve.append(eq)
        peak = max(peak, eq)
        if eq < peak * (1 - MAX_DRAWDOWN): halted = True           # bot pause
        if (eq - day_start) / day_start < -DAILY_LOSS_LIMIT: continue  # aaj ka trading band
        
        # ---- entry (signal pichli candle ka, fill current open) ----
        if halted or pos or not prev_bar.entry: continue
        if btc_ok is not None and not btc_ok.get(df.index[i - 1], False): continue
        
        entry = r.open * (1 + SLIPPAGE)
        sl = entry - cfg["sl_atr"] * prev_bar.atr
        risk_amt = eq * cfg["risk"] * (0.5 if losses >= 3 else 1)   # 3 loss ke baad half size
        qty = min(risk_amt / max(entry - sl, 1e-8), eq * cfg["lev"] / entry)
        
        # fees filter: expected move fees se 3x hona chahiye
        if (entry - sl) / entry < 3 * 2 * FEE: continue

        # Strategy-specific exit params (Portfolio support)
        tp_rule = cfg.get("tp")
        trail_rule = cfg.get("trail")
        if cfg["name"] == "Portfolio":
            if prev_bar.get("entry_rsi", False) and not prev_bar.get("entry_trend", False):
                tp_rule = "mid"
                trail_rule = None
            else:
                tp_rule = None
                trail_rule = cfg.get("trail")

        pos = dict(entry=entry, sl=sl, qty=qty, atr=prev_bar.atr, bars=0, tp=tp_rule, trail=trail_rule)

    # Close remaining open position at backtest end
    if pos:
        exit_p = df.iloc[-1].close * (1 - SLIPPAGE)
        pnl = pos["qty"] * (exit_p - pos["entry"]) - FEE * pos["qty"] * (exit_p + pos["entry"])
        eq += pnl
        trades.append(pnl)
        curve[-1] = eq

    return trades, curve


def report(name, trades, curve, capital):
    if not trades:
        print(f"{name}: koi trade nahi"); return
    t = np.array(trades)
    wins, loss = t[t > 0].sum(), -t[t < 0].sum()
    c = np.array(curve) if curve else np.array([capital])
    dd = ((np.maximum.accumulate(c) - c) / np.maximum.accumulate(c)).max() if len(c) > 0 else 0
    ret = 100 * (c[-1] - capital) / capital
    win_rate = 100 * (t > 0).mean()
    pf = (wins / loss) if loss > 0 else (float('inf') if wins > 0 else 0.0)
    print(f"{name:30} | Trades: {len(t):3} | Win%: {win_rate:5.1f}% | PF: {pf:5.2f} | Return: {ret:+6.2f}% | MaxDD: {100*dd:5.2f}%")


def run(capital, mode):
    cfg = CONFIGS[capital]
    symbols = cfg.get("symbols", ["BTC/USDT"])
    btc_series = None
    if len(symbols) > 1:  # BTC trend filter
        b = fetch("BTC/USDT", cfg["tf"])
        btc_series = (b.close > ema(b.close, 200))
    share = capital / len(symbols)
    
    print(f"\n{'='*75}")
    print(f"Running {mode.upper()} for Capital: Rs {capital:,} ({cfg['name']}) on {cfg['tf']}")
    print(f"{'='*75}")
    
    for s in symbols:
        df = fetch(s, cfg["tf"])
        btc_ok_map = None
        if btc_series is not None:
            btc_ok_map = btc_series.reindex(df.index, method="ffill").fillna(False).to_dict()
            
        if mode == "backtest":
            tr, cv = backtest(df, cfg, share, btc_ok_map)
            report(f"[{cfg['name']}] {s}", tr, cv, share)
        else:
            d_df = cfg["fn"](df.copy()).dropna()
            d = d_df.iloc[-2]   # last closed candle
            ok = btc_ok_map.get(d.name, True) if btc_ok_map else True
            if d.entry and ok:
                sl = d.close - cfg["sl_atr"] * d.atr
                print(f"BUY SIGNAL {s} price~{d.close:.2f} SL={sl:.2f}")
            else:
                print(f"{s}: no signal")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "backtest"
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
    run(cap, mode)
