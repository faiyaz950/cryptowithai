"""
Trend Rider bot — strategy ki "abhi kya position honi chahiye" ko account se milana.

Bot aur backtest ek hi replay par chalte hain: `plan()` deploy waali candle se
`trend_rider.simulate` chalata hai, to bot ke trades usi period ke `/api/backtest?strategy=trend-rider`
trade log jaise hone chahiye — wahi entry candle, wahi stop, wahi exit candle. Farak sirf
fill price ka hai.

Yahan sirf faisla hai, I/O nahi: candles aur order client bahar se aate hain (`bot_worker.py`),
isliye reconcile nakli client ke saath test hota hai (`tests/test_trend_rider_bot.py`).

Niyam (purane browser hook `usePaperAutoTrader` jaise hi):
  - Entry sirf entry candle ke andar. Candle nikal gayi to wo signal chhod do — late entry
    backtest se alag trade hota.
  - Har band candle par stop strategy ke trailing stop par.
  - Strategy flat ho gayi (ya doosra trade le chuki) to purana trade band.
  - Ek entry_time par ek hi baar entry — reconcile kitni baar bhi chale.

Order client ka interface (paper aur live dono yahi dete hain, quantity hamesha coin mein):
  position()                         -> {"side": "long"|"short", "qty": float} | None
  mark()                             -> float | None
  round_qty(qty)                     -> qty, exchange ke step tak neeche round
  enter(side, qty, stop, tag)        -> {"qty", "price", "stop_id"}   (stop ke saath entry)
  protect(side, qty, stop, stop_id)  -> stop_id                       (stop lagao / khiskao)
  close(side, qty, stop_id, tag)     -> {"price"}                     (position band, stop hatao)
  cancel_stop(stop_id)
Fail hone par `OrderError`.
"""
import math
from datetime import datetime, timezone

import numpy as np

import trend_rider

STATE_KEYS = ("entry_time", "trade_state", "side", "quantity", "entry_price", "stop_loss", "stop_order_id",
              "tp1_price", "tp1_done")


class OrderError(Exception):
    """Order nahi laga ya account ki haalat pata nahi chali — message user ko dikhane layak."""


class EntryAborted(OrderError):
    """Entry lagi par stop nahi laga, isliye turant band ki — is signal par dobara try nahi."""


class _ClaimLost(Exception):
    """Is entry_time ka haq kisi aur run ne le liya — hamara state purana hai, likhna nahi."""


def _fmt_px(v):
    return "—" if v is None else f"{v:,.6g}"


def _fmt_qty(v):
    return f"{v:.6g}"


def _fmt_when(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%d %b %H:%M UTC")


def _dir(side):
    return 1 if side == "long" else -1


def plan(times, o, h, l, c, *, params, capital, start_time_ms, bar_ms, now_ms):
    """
    Strategy abhi kya chahti hai.

    times: candle open time (ms), purane pehle. Chalu (adhoori) candle shaamil ho sakti hai —
    signal sirf band candles par banta hai, chalu candle sirf late entry ki jaanch ke liye hai.
    start_time_ms: bot kab deploy hua. Replay usi candle se shuru hota hai jo us waqt chal
    rahi thi; pehle ki candles sirf EMA warmup hain.

    Returns:
      position: replay mein chalu trade {side, entry_time, entry_price, stop, initial_stop} | None
      pending:  aakhri band candle par signal — entry chalu candle mein {side, entry_time, stop} | None
      forming:  chalu candle {time, open, high, low} | None
      equity:   replay ki equity (backtest jaisa compounding size isi se)
      last_closed: aakhri band candle ka open time
      stale:    exchange ne abhi aakhri band candle nahi di — thodi der baad dobara
      error:    itni history hi nahi ki EMA settle ho
    """
    p = dict(trend_rider.DEFAULTS)
    p.update(params or {})
    times = np.asarray(times, dtype=np.int64)
    o, h, l, c = (np.asarray(x, dtype=float) for x in (o, h, l, c))
    n = int(np.searchsorted(times, now_ms - bar_ms, side="right"))
    steady = bool(p.get("tp1_r")) and 0 < float(p.get("tp1_frac") or 0) < 1
    out = {"position": None, "pending": None, "forming": None, "equity": float(capital),
           "trades": [], "last_closed": None, "stale": False, "error": None,
           # Steady: pehla profit kitne R par aur kitna hissa (0 = Steady band).
           "tp1_r": float(p["tp1_r"]) if steady else 0.0,
           "tp1_frac": float(p["tp1_frac"]) if steady else 0.0}

    if n < len(times) and times[n] <= now_ms:
        out["forming"] = {"time": int(times[n]), "open": float(o[n]), "high": float(h[n]), "low": float(l[n])}
    min_bars = p["ema_slow"] + 10
    if n < min_bars + 1:
        out["error"] = f"Sirf {n} band candles mili — EMA {p['ema_slow']} ke liye kam se kam {min_bars + 1} chahiye."
        return out

    tc, oc, hc, lc, cc = times[:n], o[:n], h[:n], l[:n], c[:n]
    out["last_closed"] = int(tc[-1])
    out["stale"] = int(tc[-1]) < (now_ms // bar_ms) * bar_ms - bar_ms

    # Deploy ke waqt chal rahi candle (ya uske baad ki pehli) — backtest ka start_index yahi hai.
    start_index = max(int(np.searchsorted(tc, start_time_ms - bar_ms, side="right")), min_bars)
    res = trend_rider.simulate(tc, oc, hc, lc, cc, params=p, capital=capital,
                               start_index=start_index, bar_hours=bar_ms / 3_600_000)
    out["trades"] = res["trades"]
    if res["equity"]:
        out["equity"] = float(res["equity"][-1][1])

    pos = res["open_position"]
    if pos:
        out["position"] = {
            "side": "long" if pos["side"] == "buy" else "short",
            "entry_time": int(pos["entry_time"]),
            "entry_price": float(pos["entry_price"]),
            "stop": float(pos["stop_loss"]),
            "initial_stop": float(pos["initial_stop"]),
            "tp1_price": float(pos["tp1_price"]) if pos.get("tp1_price") is not None else None,
            "tp1_done": bool(pos.get("tp1_done")),
        }
        return out

    # simulate jaisa hi gate: signal candle replay ke andar (ya theek pehle) ki ho.
    k = n - 1
    if k >= max(start_index, 1) - 1:
        ind = trend_rider.indicators(oc, hc, lc, cc, p)
        if ind["long"][k] or ind["short"][k]:
            d = 1 if ind["long"][k] else -1
            stop = float(cc[k] - d * p["stop_atr"] * ind["atr"][k])
            entry_time = int(tc[k]) + bar_ms
            tp1 = None
            forming = out["forming"]
            if steady and forming and forming["time"] == entry_time:
                # simulate jaisa: entry candle ka open + slippage se tp1.
                tp1 = _tp1_level(forming["open"] * (1 + d * trend_rider.SLIPPAGE), stop, out["tp1_r"])
            out["pending"] = {
                "side": "long" if d > 0 else "short",
                "entry_time": entry_time,
                "stop": stop,
                "tp1_price": tp1,
            }
    return out


def _tp1_level(fill, stop, tp1_r):
    """Entry se tp1_r x risk aage — `trend_rider.simulate` ka tp1."""
    return fill + tp1_r * (fill - stop)


def _breakeven(side, entry):
    """Steady ke baad ka stop: entry + dono taraf ki fees/slippage — `simulate` jaisa."""
    return entry * (1 + _dir(side) * 2 * (trend_rider.FEE_RATE + trend_rider.SLIPPAGE))


def entry_quantity(equity, risk_pct, side, price, stop, max_leverage=None):
    """`trend_rider.simulate` jaisa size — slippage ke baad stop tak ka risk equity ka risk_pct%."""
    lev = trend_rider.DEFAULTS["max_leverage"] if max_leverage is None else max_leverage
    d = _dir(side)
    entry = price * (1 + d * trend_rider.SLIPPAGE)
    dist = d * (entry - stop)
    if not (equity > 0 and entry > 0 and dist > 0 and math.isfinite(dist)):
        return 0.0
    return min(equity * risk_pct / 100.0 / dist, equity * lev / entry)


def check_closed(state, client):
    """
    Candles ke beech wali tick — stop ne position band kar di ho to trade 'closed'.
    Returns (state, events).
    """
    s = {k: state.get(k) for k in STATE_KEYS}
    if s["trade_state"] != "open":
        return s, []
    pos = client.position()
    if pos and pos["side"] == s["side"]:
        return s, []
    s.update(trade_state="closed", stop_order_id="")
    return s, [f"Stop lag gaya — {s['side'].upper()} band (stop {_fmt_px(s['stop_loss'])})"]


def reconcile(state, plan_, client, *, now_ms, bar_ms, risk_pct, allow_entries=True, claim=None, tag="bot"):
    """
    Account ko strategy ke `plan()` se milao. Idempotent: wahi plan dobara do to kuch nahi badalta.

    state: bot ke trade fields (STATE_KEYS).
    claim(entry_time, fields) -> bool: order se pehle entry_time ka haq DB mein lo. False = koi aur
      le chuka, order mat lagao. Na do to hamesha True.
    allow_entries: False (bot paused) — chalu trade manage hota hai, naya nahi khulta.

    Returns (state, events, ok). ok=False — kuch adhoora raha, thodi der baad dobara chalao.
    state None — koi aur run is bot par kaam kar chuka; DB mein kuch mat likho.
    """
    s = {k: state.get(k) for k in STATE_KEYS}
    s["trade_state"] = s["trade_state"] or ""
    s["stop_order_id"] = s["stop_order_id"] or ""
    s["tp1_done"] = bool(s["tp1_done"])
    events = []
    ctx = {"client": client, "now_ms": now_ms, "bar_ms": bar_ms, "risk_pct": risk_pct,
           "allow_entries": allow_entries, "claim": claim, "tag": tag, "plan": plan_,
           "tp1_frac": float(plan_.get("tp1_frac") or 0.0)}
    desired = plan_.get("position") or plan_.get("pending")
    try:
        if desired and s["entry_time"] == desired["entry_time"]:
            if s["trade_state"] == "open":
                _manage(s, desired, ctx, events)
            elif s["trade_state"] == "entering":
                _resume_entry(s, desired, ctx, events)
            return s, events, s["trade_state"] != "entering"

        if s["trade_state"] in ("open", "entering"):
            why = "Strategy ka stop lag gaya" if not desired else "Strategy naye trade par hai — purana trade band"
            _flatten(s, ctx, events, why)
        if not desired:
            return s, events, True

        if desired is not plan_.get("pending") or now_ms >= desired["entry_time"] + bar_ms:
            _skip(s, desired, events, f"{desired['side'].upper()} ki entry candle ({_fmt_when(desired['entry_time'])}) "
                                      "nikal chuki — late entry nahi, agle signal ka intezaar")
        elif not allow_entries:
            _skip(s, desired, events, f"Bot paused hai — {desired['side'].upper()} signal chhoda")
        else:
            _enter(s, desired, ctx, events, claimed=False)
        return s, events, s["trade_state"] != "entering"
    except _ClaimLost:
        return None, events, True
    except OrderError as exc:
        events.append(f"Error: {exc}")
        return s, events, False


def close_trade(state, client, *, why, now_ms, tag="bot"):
    """Bot stop par chalu trade band — (state, events). Fail par OrderError."""
    s = {k: state.get(k) for k in STATE_KEYS}
    events = []
    if s["trade_state"] in ("open", "entering"):
        _flatten(s, {"client": client, "now_ms": now_ms, "tag": tag}, events, why)
    return s, events


def _skip(s, desired, events, why):
    s.update(entry_time=desired["entry_time"], trade_state="skipped", side=desired["side"], quantity=None,
             entry_price=None, stop_loss=desired["stop"], stop_order_id="", tp1_price=None, tp1_done=False)
    events.append(why)


def _enter(s, desired, ctx, events, *, claimed):
    client = ctx["client"]
    side, stop = desired["side"], desired["stop"]
    d = _dir(side)
    forming = ctx["plan"].get("forming")
    if forming and forming["time"] == desired["entry_time"]:
        # Entry candle ne stop pehle hi chhoo liya — backtest wahin band kar chuka hota.
        if (forming["low"] if d > 0 else forming["high"]) * d <= stop * d:
            _skip(s, desired, events, "Entry candle stop chhoo chuki — entry skip (backtest us candle mein hi band hota)")
            return
    mark = client.mark()
    if not mark:
        raise OrderError("Abhi ka bhaav nahi mila — entry agli tick par")
    if d * (mark * (1 + d * trend_rider.SLIPPAGE) - stop) <= 0:
        _skip(s, desired, events, f"Price {_fmt_px(mark)} stop {_fmt_px(stop)} ke paar hai — entry skip")
        return
    qty = client.round_qty(entry_quantity(ctx["plan"]["equity"], ctx["risk_pct"], side, mark, stop))
    if qty <= 0:
        _skip(s, desired, events, "Quantity 0 bani — capital/risk badhao (ya contract size se chhota order)")
        return

    tp1_r = ctx["plan"].get("tp1_r") or 0.0
    tp1 = desired.get("tp1_price")
    if tp1_r and tp1 is None:
        # Entry candle ka open plan mein nahi tha — abhi ke bhaav se wahi formula.
        tp1 = _tp1_level(mark * (1 + d * trend_rider.SLIPPAGE), stop, tp1_r)
    s.update(entry_time=desired["entry_time"], trade_state="entering", side=side, quantity=qty,
             entry_price=None, stop_loss=stop, stop_order_id="", tp1_price=tp1, tp1_done=False)
    if not claimed and ctx["claim"] is not None:
        fields = {k: s[k] for k in STATE_KEYS if k != "entry_time"}
        if not ctx["claim"](desired["entry_time"], fields):
            raise _ClaimLost()
    try:
        res = client.enter(side, qty, stop, f"{ctx['tag']}-{desired['entry_time'] // 60000}")
    except EntryAborted as exc:
        _skip(s, desired, events, f"Entry band ki: {exc}")
        return
    s.update(trade_state="open", quantity=res.get("qty") or qty, entry_price=res.get("price"),
             stop_order_id=res.get("stop_id") or "")
    events.append(f"{side.upper()} {_fmt_qty(s['quantity'])} @ ~{_fmt_px(s['entry_price'])}, stop {_fmt_px(stop)}")


def _resume_entry(s, desired, ctx, events):
    """Pichhli entry adhoori rahi (fail / crash). Pehle dekho order lag to nahi chuka."""
    client = ctx["client"]
    pos = client.position()
    if pos and pos["side"] == s["side"]:
        qty = min(pos["qty"], s["quantity"]) if s["quantity"] else pos["qty"]
        s.update(trade_state="open", quantity=qty)
        if s.get("tp1_price") is None and desired.get("tp1_price") is not None:
            s["tp1_price"] = desired["tp1_price"]
        s["stop_order_id"] = client.protect(s["side"], qty, desired["stop"], s["stop_order_id"] or None) or ""
        s["stop_loss"] = desired["stop"]
        events.append(f"Pichhli entry lag chuki thi — {s['side'].upper()} {_fmt_qty(qty)} sambhali, stop {_fmt_px(desired['stop'])}")
        return
    in_candle = desired is ctx["plan"].get("pending") and ctx["now_ms"] < desired["entry_time"] + ctx["bar_ms"]
    if in_candle and ctx["allow_entries"]:
        _enter(s, desired, ctx, events, claimed=True)
        return
    _skip(s, desired, events, "Entry nahi lag saki aur entry candle nikal gayi — ye signal chhoda")


def _manage(s, desired, ctx, events):
    """Chalu trade: stop wahi rakho jo strategy kehti hai."""
    client = ctx["client"]
    pos = client.position()
    if not pos or pos["side"] != s["side"]:
        if s["stop_order_id"]:
            client.cancel_stop(s["stop_order_id"])
        s.update(trade_state="closed", stop_order_id="")
        events.append(f"Position band mili — stop {_fmt_px(s['stop_loss'])} lag chuka (ya haath se band hui)")
        return
    if desired.get("tp1_done") and not s["tp1_done"]:
        # Candles ke beech wali tick chook gayi — candle band hone par hissa book karo.
        _take_first_profit(s, client, ctx["tp1_frac"], events, ctx["tag"])
        if s["trade_state"] != "open":
            return
    if desired.get("tp1_price") is not None:
        s["tp1_price"] = desired["tp1_price"]
    new, old = desired["stop"], s["stop_loss"]
    d = _dir(s["side"])
    if s["tp1_done"] and old is not None:
        # Hissa book hone ke baad stop kabhi dheela nahi — bot ka breakeven backtest se thoda alag ho sakta hai.
        new = max(new, old) if d > 0 else min(new, old)
    mark = client.mark()
    if mark and d * (mark - new) <= 0:
        # Naya stop abhi ke bhaav ke paar — backtest agli candle ke open par (gap) nikalta.
        _flatten(s, ctx, events, f"Price {_fmt_px(mark)} naye stop {_fmt_px(new)} ke paar")
        return
    qty = min(pos["qty"], s["quantity"]) if s["quantity"] else pos["qty"]
    s["stop_order_id"] = client.protect(s["side"], qty, new, s["stop_order_id"] or None) or ""
    if old is None or abs(new - old) > 1e-9 * max(1.0, abs(new)):
        events.append(f"Stop trail {_fmt_px(old)} → {_fmt_px(new)}")
    s["stop_loss"] = new


def _flatten(s, ctx, events, why):
    client = ctx["client"]
    pos = client.position()
    if pos and pos["side"] == s["side"] and pos["qty"] > 0:
        qty = min(pos["qty"], s["quantity"]) if s["quantity"] else pos["qty"]
        res = client.close(s["side"], qty, s["stop_order_id"] or None, f"{ctx['tag']}-x{ctx['now_ms'] // 60000}")
        events.append(f"{why} — {_fmt_qty(qty)} band kiya @ ~{_fmt_px(res.get('price'))}")
    else:
        if s["stop_order_id"]:
            client.cancel_stop(s["stop_order_id"])
        events.append(f"{why} — position pehle hi band thi (stop lag chuka)")
    s.update(trade_state="closed", stop_order_id="")


def check_first_profit(state, client, *, tp1_frac, tag="bot"):
    """
    Candles ke beech wali tick (Steady) — price pehle profit ke level tak pahuncha to hissa
    abhi book karo aur stop entry par. Backtest ise candle ke andar tp1 par bharta hai; tick
    usi ke paas bharti hai. Returns (state, events). Order fail par OrderError.
    """
    s = {k: state.get(k) for k in STATE_KEYS}
    s["tp1_done"] = bool(s["tp1_done"])
    if s["trade_state"] != "open" or s["tp1_done"] or s["tp1_price"] is None or not tp1_frac:
        return s, []
    mark = client.mark()
    if not mark or _dir(s["side"]) * (mark - s["tp1_price"]) < 0:
        return s, []
    events = []
    _take_first_profit(s, client, tp1_frac, events, tag)
    return s, events


def _take_first_profit(s, client, tp1_frac, events, tag):
    side = s["side"]
    pos = client.position()
    if not pos or pos["side"] != side:
        if s["stop_order_id"]:
            client.cancel_stop(s["stop_order_id"])
        s.update(trade_state="closed", stop_order_id="")
        events.append(f"Position band mili — stop {_fmt_px(s['stop_loss'])} lag chuka (ya haath se band hui)")
        return
    qty = min(pos["qty"], s["quantity"]) if s["quantity"] else pos["qty"]
    d = _dir(side)
    be = _breakeven(side, s["entry_price"] or client.mark())
    old = s["stop_loss"]
    new_stop = be if old is None else (max(old, be) if d > 0 else min(old, be))
    part = client.round_qty(qty * tp1_frac)
    if part <= 0 or part >= qty:
        # Position itni chhoti ki hissa nahi banta (jaise 1 contract) — poori rakho, stop entry par.
        s["stop_order_id"] = client.protect(side, qty, new_stop, s["stop_order_id"] or None) or ""
        s.update(tp1_done=True, stop_loss=new_stop)
        events.append(f"Pehla profit level {_fmt_px(s['tp1_price'])} aaya — size chhota, hissa nahi bana; "
                      f"stop entry {_fmt_px(new_stop)} par")
        return
    res = client.reduce(side, part, qty - part, new_stop, s["stop_order_id"] or None,
                        f"{tag}-p{int(s['entry_time'] or 0) // 60000}")
    s.update(tp1_done=True, quantity=qty - part, stop_loss=new_stop,
             stop_order_id=res.get("stop_id") or s["stop_order_id"] or "")
    events.append(f"Pehla profit: {_fmt_qty(part)} @ ~{_fmt_px(res.get('price'))} book, "
                  f"stop entry {_fmt_px(new_stop)} par")
