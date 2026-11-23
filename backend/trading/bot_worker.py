"""
Strategy bots ka server-side executor — browser band ho tab bhi chalta hai.

`start(api)` (backend/main.py ke startup se) ek daemon thread chalata hai. Har TICK_SECONDS par:
  1. Paper bots: `_settle_paper_limits` — paper stop (bracket) abhi ke bhaav par check. Paper
     engine waise lazy hai (account dekhne par hi settle hota); bot ka stop us waqt lagna chahiye
     jab price wahan pahunche, na ki jab koi page khole.
  2. Har candle band hone ke CLOSE_DELAY_SECONDS baad: 600-bar warmup + deploy se ab tak ki band
     candles laao, `trend_rider_bot.plan` se strategy ki position nikaalo, aur
     `trend_rider_bot.reconcile` se account ko usse milao. Kuch adhoora rahe (order fail, exchange
     down) to RETRY_SECONDS baad dobara.

Live: entry/exit `submit_order(mode="live")` se, aur stop exchange par stop-market order — worker
mar bhi jaaye to position exchange ke stop se bachi rehti hai. Live tabhi jab server ka
LIVE_ORDERS_ENABLED, account ka live toggle aur bot ka apna live opt-in — teeno on hon. Inme se
koi band ho to live bot kuch nahi karta (paper par chup-chaap nahi girta).

Ek hi process maana gaya hai (Dockerfile ek uvicorn worker chalata hai). Do process chal jaayein
to bhi entry `claim_bot_entry` se ek hi baar lagti hai.
"""
import math
import os
import threading
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from django.db import close_old_connections

import account_guard
import trend_rider
import trend_rider_bot
from django_orm import (
    claim_bot_entry,
    fetch_paper_brackets,
    fetch_user_demo_orders_oldest_first,
    get_exchange_account_for_user,
    get_strategy_bot,
    get_user_account_by_id,
    list_active_strategy_bots,
    set_paper_bracket,
    update_strategy_bot,
)
from trend_rider_bot import EntryAborted, OrderError

TICK_SECONDS = float(os.getenv("BOT_TICK_SECONDS", "20"))
# Candle band hote hi exchange use turant nahi deta — thoda ruk kar laao.
CLOSE_DELAY_SECONDS = 20
RETRY_SECONDS = 60
CANDLE_TTL_SECONDS = 30
# ByokOrder.source — orders list mein dikhe ki ye bot ne lagaya.
ORDER_SOURCE = "strategy_bot"

_api = None
_thread = None
_stop = threading.Event()
_locks = {}
_locks_guard = threading.Lock()
_retry_at = {}
_candles = {}
_candles_lock = threading.Lock()
_heartbeat = {"at": None, "error": "", "bots": 0}


def bot_lock(bot_id):
    """Ek bot par ek waqt mein ek hi kaam — worker ki tick aur API ka stop aapas mein na takrayein."""
    with _locks_guard:
        return _locks.setdefault(bot_id, threading.Lock())


def start(api):
    """`api` = backend_api module (order, paper engine, live switch sab wahin hain)."""
    global _api, _thread
    _api = api
    if os.getenv("BOT_WORKER", "1").strip().lower() in ("0", "false", "no", "off"):
        print("ℹ️ Strategy bot worker band hai (BOT_WORKER=0)")
        return
    if os.getenv("VERCEL"):
        # Serverless function request ke baad ruk jaata hai — wahan background thread nahi chalta.
        print("ℹ️ Vercel par strategy bot worker nahi chalta — long-running server (VPS/Render) chahiye")
        return
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="strategy-bots", daemon=True)
    _thread.start()


def stop():
    _stop.set()


def is_running():
    return bool(_thread and _thread.is_alive())


def _loop():
    print(f"🤖 Strategy bot worker chalu — har {TICK_SECONDS:g}s")
    while not _stop.is_set():
        try:
            tick()
        except Exception:
            traceback.print_exc()
        _stop.wait(TICK_SECONDS)


def heartbeat():
    return {
        "running": is_running(),
        "last_tick_at": _heartbeat.get("at"),
        "last_error": _heartbeat.get("error") or "",
        "bots": _heartbeat.get("bots") or 0,
    }


def tick(now=None):
    api = _api
    if api is None or not api.DB_READY:
        return
    now = time.time() if now is None else now
    # Lambi chalne wali thread par Django khud purane connection nahi hatata (wo request ke
    # signals par hota hai) — Postgres connection toot jaaye to har tick fail hoti rehti.
    close_old_connections()
    account_guard.begin_tick()
    rows = list_active_strategy_bots()
    _heartbeat["at"] = datetime.now(timezone.utc).isoformat()
    _heartbeat["bots"] = len(rows)
    _heartbeat["error"] = ""
    try:
        _tick_rows(api, rows, now)
    except Exception as exc:
        _heartbeat["error"] = str(exc)[:400]
        raise
    finally:
        account_guard.finish_tick()


def _tick_rows(api, rows, now):
    for row in rows:
        lock = bot_lock(row["id"])
        if not lock.acquire(blocking=False):
            continue
        try:
            bot = get_strategy_bot(row["id"])
            if bot and bot["status"] in ("running", "paused"):
                run_bot(api, bot, now)
        except Exception as exc:
            traceback.print_exc()
            _retry_at[row["id"]] = now + RETRY_SECONDS
            update_strategy_bot(row["id"], last_error=f"Worker error: {exc}"[:400])
        finally:
            lock.release()


def run_bot(api, bot, now):
    bar_ms = api._TF_MINUTES[bot["timeframe"]] * 60_000
    now_ms = int(now * 1000)
    state = {k: bot[k] for k in trend_rider_bot.STATE_KEYS}
    last_closed = (now_ms // bar_ms) * bar_ms - bar_ms
    bar_due = (bot["last_bar_time"] or 0) < last_closed and now_ms >= last_closed + bar_ms + CLOSE_DELAY_SECONDS * 1000
    # Restart ke baad bhi adhoora kaam (entering / pichhli error) turant uthao.
    needs_retry = bool(bot["last_error"]) or state["trade_state"] == "entering"
    retry_due = needs_retry and now >= _retry_at.get(bot["id"], 0)
    # Candles ke beech sirf paper ka khula trade dekhna hai (live ka stop exchange par khud chalta hai).
    watch_stop = bot["mode"] != "live" and state["trade_state"] == "open"
    # Steady: pehla profit candle ke andar bharna hai — paper aur live dono par tick se.
    watch_tp1 = state["trade_state"] == "open" and state["tp1_price"] is not None and not state["tp1_done"]
    if account_guard.flatten_requested(bot["user_id"]):
        _flatten_for_guard(api, bot, state, now)
        return
    if not (bar_due or retry_due or watch_stop or watch_tp1):
        return

    client, blocked = make_client(api, bot)
    if blocked:
        if bot["last_error"] != blocked:
            update_strategy_bot(bot["id"], last_error=blocked, events=[blocked])
        return
    client.sync()
    if not (bar_due or retry_due):
        events = []
        prev = dict(state)
        s = state
        if watch_stop:
            # Paper stop ne position band ki ho to abhi dikhao, agli candle tak nahi.
            s, events = trend_rider_bot.check_closed(s, client)
        if watch_tp1 and s["trade_state"] == "open":
            try:
                s, more = trend_rider_bot.check_first_profit(
                    s, client, tp1_frac=float(bot["params"].get("tp1_frac") or 0.0), tag=f"cm{bot['id']}")
            except OrderError as exc:
                _fail(bot, now, f"Pehla profit book nahi hua: {exc}")
                more = []
            events += more
        if events:
            _, events, wallet = settle_demo_wallet(
                bot, prev.get("trade_state"), trade_snap(prev), s, events, dict(bot.get("params") or {}))
            update_strategy_bot(bot["id"], events=events, **s, **wallet)
        return

    packed = _candles_for(api, bot, now_ms, bar_ms, last_closed)
    if packed is None:
        _fail(bot, now, "Delta se candles nahi mili — thodi der baad dobara")
        return
    candles, volume = packed
    btc = None
    if bot["params"].get("btc_confirm") and not str(bot["symbol"]).upper().startswith("BTC"):
        # Pro: alt ka signal BTC ke regime se pakka hota hai — wahi window BTC ki bhi.
        btc_packed = _candles_for(api, dict(bot, symbol="BTCUSDT"), now_ms, bar_ms, last_closed)
        if btc_packed is None:
            _fail(bot, now, "BTC ki candles nahi mili (Pro confirmation) — thodi der baad dobara")
            return
        btc_candles = btc_packed[0]
        btc = (btc_candles[0], btc_candles[4])
    plan = trend_rider_bot.plan(
        *candles,
        volume=volume,
        btc=btc,
        # Trident / AVPT apna replay engine; Trend Rider / Steady / Pro ek hi engine par.
        strategy=bot["strategy"],
        # risk_pct replay ki equity (aur isliye size) badalta hai — backtest bhi params mein bhejta hai.
        params={**bot["params"], "risk_pct": bot["risk_pct"]},
        # Size from the live demo wallet (starts = capital, moves with closed fills).
        capital=_wallet(bot),
        start_time_ms=_iso_ms(bot["started_at"]),
        bar_ms=bar_ms,
        now_ms=now_ms,
    )
    if plan["error"]:
        # Nayi listing — history agli candle se pehle nahi badhegi, har minute mat maango.
        _fail(bot, now, plan["error"], retry_in=bar_ms / 1000)
        return
    if plan["stale"]:
        _fail(bot, now, "Exchange ne abhi aakhri band candle nahi di — thodi der baad dobara")
        return

    allow_entries = bot["status"] == "running"
    risk_pause, risk_msg, params_out = _risk_entry_guard(bot, state)
    if risk_pause:
        allow_entries = False
    try:
        acct_pause, acct_msg = account_guard.decide_entries(bot["user_id"])
    except Exception:
        acct_pause, acct_msg = False, ""
    if acct_pause:
        allow_entries = False
        risk_msg = acct_msg or risk_msg

    prev_trade = state.get("trade_state")
    prev_snap = trade_snap(state)
    state, events, ok = trend_rider_bot.reconcile(
        state, plan, client,
        now_ms=now_ms,
        bar_ms=bar_ms,
        risk_pct=bot["risk_pct"],
        allow_entries=allow_entries,
        claim=lambda entry_time, fields: claim_bot_entry(bot["id"], entry_time, **fields),
        tag=f"cm{bot['id']}",
    )
    if state is None:
        return
    # Update risk counters + demo wallet when size closes (full exit or TP1 slice).
    params_out, events, wallet = settle_demo_wallet(bot, prev_trade, prev_snap, state, events, params_out)
    if risk_msg and risk_pause:
        # Surface once per tick window without spamming forever.
        last_texts = [e.get("text") if isinstance(e, dict) else str(e) for e in (bot.get("events") or [])[-3:]]
        if risk_msg not in last_texts and not any(risk_msg in str(x) for x in last_texts):
            events = list(events) + [risk_msg]
    error = "" if ok else (events[-1] if events else "Adhoora raha — dobara try hoga")
    if ok:
        _retry_at.pop(bot["id"], None)
    else:
        _retry_at[bot["id"]] = now + RETRY_SECONDS
    update_kwargs = dict(
        events=events,
        last_bar_time=plan["last_closed"],
        last_run_at=datetime.fromtimestamp(now, tz=timezone.utc),
        last_error=error[:400] if isinstance(error, str) else str(error)[:400],
        **state,
        **wallet,
    )
    update_strategy_bot(bot["id"], **update_kwargs)


def _risk_entry_guard(bot, state):
    """
    Backend-enforced deploy safety. Pauses NEW entries only — open positions stay managed.
    Bot OFF ≠ positions closed (that is a separate Stop & flatten action).
    """
    params = dict(bot.get("params") or {})
    risk = dict(params.get("_risk") or {})
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if risk.get("day") != day:
        risk = {"day": day, "day_pnl": 0.0, "losing_streak": int(risk.get("losing_streak") or 0), "paused_reason": ""}
        params["_risk"] = risk

    max_daily = float(params.get("max_daily_loss_pct") or 0)
    max_streak = int(params.get("max_losing_streak") or 0)
    capital = float(bot.get("capital") or 0)
    day_pnl = float(risk.get("day_pnl") or 0)
    streak = int(risk.get("losing_streak") or 0)
    # max_positions: one open trade per bot is already enforced by reconcile + one-bot-per-symbol.

    if max_daily > 0 and capital > 0 and day_pnl <= -(capital * max_daily / 100.0):
        msg = f"Risk guard: max daily loss {max_daily:g}% hit (day P&L ${day_pnl:.2f}) — new entries paused"
        risk["paused_reason"] = msg
        params["_risk"] = risk
        return True, msg, params

    if max_streak > 0 and streak >= max_streak:
        msg = f"Risk guard: max losing streak {max_streak} — new entries paused"
        risk["paused_reason"] = msg
        params["_risk"] = risk
        return True, msg, params

    if risk.get("paused_reason"):
        risk["paused_reason"] = ""
        params["_risk"] = risk
    return False, "", params


def _wallet(bot):
    """Demo amount left after closed fills — falls back to starting capital."""
    if bot.get("equity") is not None:
        return float(bot["equity"])
    return float(bot.get("capital") or 0)


def _side_sign(side):
    s = (side or "").lower()
    if s in ("long", "buy"):
        return 1
    if s in ("short", "sell"):
        return -1
    return 0


def _exit_price_from_events(events):
    for ev in reversed(list(events or [])):
        text = ev if isinstance(ev, str) else str(ev)
        if "@ ~" not in text:
            continue
        try:
            return float(text.split("@ ~")[-1].split()[0].replace(",", ""))
        except (TypeError, ValueError, IndexError):
            continue
    return None


def _fill_pnl(side, entry, qty, exit_px, stop=0.0):
    """Realized $ for a closed size. Prefers fill price; stop is the fallback."""
    sign = _side_sign(side)
    if not (sign and entry and qty):
        return 0.0
    if exit_px:
        return (exit_px - entry) * qty * sign
    if stop:
        return (stop - entry) * qty * sign
    return 0.0


def _risk_on_close(bot, prev_trade, state, params, events, prev_snap=None):
    """When size closes (full or TP1 slice), update day P&L / streak and return (params, equity_delta)."""
    if params is None:
        params = dict(bot.get("params") or {})
    snap = prev_snap or {}
    prev_qty = float(snap.get("quantity") or 0)
    new_qty = float(state.get("quantity") or 0) if state.get("trade_state") == "open" else 0.0
    closed_qty = 0.0
    if prev_trade == "open" and state.get("trade_state") == "closed":
        closed_qty = prev_qty or float(state.get("quantity") or 0)
    elif prev_trade == "open" and state.get("trade_state") == "open" and prev_qty > new_qty + 1e-12:
        # Steady / native TP1 — only the trimmed size realizes.
        closed_qty = prev_qty - new_qty
    if closed_qty <= 0:
        return params, 0.0

    risk = dict(params.get("_risk") or {})
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if risk.get("day") != day:
        risk = {"day": day, "day_pnl": 0.0, "losing_streak": 0, "paused_reason": ""}
    entry = float(snap.get("entry_price") or state.get("entry_price") or 0)
    side = snap.get("side") or state.get("side") or ""
    exit_px = _exit_price_from_events(events)
    stop = float(snap.get("stop_loss") or state.get("stop_loss") or 0)
    pnl = _fill_pnl(side, entry, closed_qty, exit_px, stop)
    risk["day_pnl"] = float(risk.get("day_pnl") or 0) + pnl
    if state.get("trade_state") == "closed":
        if pnl < 0:
            risk["losing_streak"] = int(risk.get("losing_streak") or 0) + 1
        elif pnl > 0:
            risk["losing_streak"] = 0
    params["_risk"] = risk
    return params, pnl


def settle_demo_wallet(bot, prev_trade, prev_snap, state, events, params=None):
    """
    Credit/debit the per-bot demo wallet after a fill. Returns
    (params, events, {equity?} patch). Safe to call when nothing closed.
    """
    params, delta = _risk_on_close(bot, prev_trade, state, params, events, prev_snap)
    patch = {}
    if params is not None:
        patch["params"] = params
    if abs(delta) > 1e-12:
        before = _wallet(bot)
        after = round(before + delta, 2)
        events = list(events or []) + [f"Demo wallet ${before:,.2f} → ${after:,.2f} ({delta:+.2f})"]
        patch["equity"] = after
    return params, events, patch


def trade_snap(bot_or_state):
    return {
        "entry_price": bot_or_state.get("entry_price"),
        "quantity": bot_or_state.get("quantity"),
        "side": bot_or_state.get("side"),
        "stop_loss": bot_or_state.get("stop_loss"),
    }


def close_bot_trade(api, bot, why):
    """API ka "stop + band karo" — chalu trade abhi market par band. Fail par OrderError."""
    client, blocked = make_client(api, bot)
    if blocked:
        raise OrderError(blocked)
    client.sync()
    state = {k: bot[k] for k in trend_rider_bot.STATE_KEYS}
    s, events = trend_rider_bot.close_trade(state, client, why=why, now_ms=int(time.time() * 1000),
                                            tag=f"cm{bot['id']}")
    return s, events


def _flatten_for_guard(api, bot, state, now):
    """Kill-switch flatten: close this bot's position, then let finish_tick clear the flag."""
    if state.get("trade_state") not in ("open", "entering"):
        account_guard.note_flatten(bot["user_id"], True)
        return
    prev_trade = state.get("trade_state")
    prev_snap = trade_snap(state)
    try:
        s, events = close_bot_trade(api, bot, "Account flatten")
    except OrderError as exc:
        account_guard.note_flatten(bot["user_id"], False)
        _fail(bot, now, f"Flatten failed: {exc}")
        return
    account_guard.note_flatten(bot["user_id"], True)
    # entering → closed may not realize if no fill; open → closed credits the wallet.
    _, events, wallet = settle_demo_wallet(
        bot, "open" if prev_trade == "open" else prev_trade, prev_snap, s, events, dict(bot.get("params") or {}))
    update_strategy_bot(bot["id"], events=events, last_error="", **s, **wallet)


def _fail(bot, now, message, retry_in=RETRY_SECONDS):
    _retry_at[bot["id"]] = now + retry_in
    update_strategy_bot(bot["id"], last_error=message[:400])


def _iso_ms(value):
    return int(datetime.fromisoformat(value).timestamp() * 1000)


def _candles_for(api, bot, now_ms, bar_ms, last_closed):
    """
    Warmup (600 candles) + deploy se ab tak — wahi `get_historical_data_batch` jo backtest
    use karta hai, taaki bot aur backtest ek hi data dekhein. Ek symbol ke kai bots ek fetch baantte hain.
    """
    days = (math.ceil(trend_rider.WARMUP_BARS * bar_ms / 86_400_000)
            + math.ceil(max(0, now_ms - _iso_ms(bot["started_at"])) / 86_400_000) + 2)
    key = (bot["symbol"], bot["timeframe"], last_closed)
    with _candles_lock:
        hit = _candles.get(key)
        if hit and time.time() - hit[0] < CANDLE_TTL_SECONDS and hit[1] >= days:
            return hit[2]
    hist = api.client.get_historical_data_batch(symbol=bot["symbol"], interval=bot["timeframe"], days=days,
                                                exchange_name="delta")
    if not hist or "dataframe" not in hist or len(hist["dataframe"]) == 0:
        return None
    df = hist["dataframe"].sort_values("Open Time").drop_duplicates(subset=["Open Time"]).reset_index(drop=True)
    times = np.array([int(pd.Timestamp(t).timestamp() * 1000) for t in df["Open Time"]], dtype=np.int64)
    data = (times, df["Open"].to_numpy(float), df["High"].to_numpy(float), df["Low"].to_numpy(float),
            df["Close"].to_numpy(float))
    volume = df["Volume"].to_numpy(float) if "Volume" in df.columns else None
    packed = (data, volume)
    with _candles_lock:
        for k in [k for k in _candles if k[2] < last_closed]:
            _candles.pop(k, None)
        _candles[key] = (time.time(), days, packed)
    return packed


def make_client(api, bot):
    """(client, None) ya (None, kyun ruka hai). Live ke teeno switch yahin jaanche jaate hain."""
    if bot["mode"] != "live":
        return PaperClient(api, bot["user_id"], bot["symbol"]), None
    if not api.LIVE_ORDERS_ENABLED:
        return None, ("Live bot ruka hai: server par LIVE_ORDERS_ENABLED band hai. Khuli position ka stop "
                      "exchange par laga hai, par trail nahi ho raha.")
    account = (get_exchange_account_for_user(bot["exchange_account_id"], bot["user_id"])
               if bot["exchange_account_id"] else None)
    if not account or not account.get("is_active"):
        return None, "Live bot ruka hai: exchange account nahi mila ya band hai."
    if not account.get("live_trading_enabled"):
        return None, "Live bot ruka hai: is account par live trading band hai (Exchanges page)."
    try:
        return LiveClient(api, get_user_account_by_id(bot["user_id"]), account, bot["symbol"]), None
    except OrderError as exc:
        return None, f"Live bot ruka hai: {exc}"


class PaperClient:
    """Wahi paper engine jo desk chalata hai — position, SL bracket aur P&L sab paper account mein."""

    mode = "paper"

    def __init__(self, api, user_id, symbol):
        self.api = api
        self.user_id = user_id
        self.symbol = symbol

    def sync(self):
        self.api._settle_paper_limits(self.user_id)

    def position(self):
        filled = [o for o in fetch_user_demo_orders_oldest_first(self.user_id) if o["status"] == "filled"]
        q = self.api._paper_book(filled)[0].get(self.symbol, {}).get("qty", 0.0)
        if abs(q) < 1e-12:
            return None
        return {"side": "long" if q > 0 else "short", "qty": abs(q)}

    def mark(self):
        return self.api._paper_price(self.symbol)

    def round_qty(self, qty):
        return math.floor(qty * 1e6) / 1e6

    def enter(self, side, qty, stop, tag):
        order = self._order("buy" if side == "long" else "sell", qty, stop_loss=stop)
        return {"qty": qty, "price": order["price"], "stop_id": None}

    def protect(self, side, qty, stop, stop_id):
        current = fetch_paper_brackets(self.user_id).get(self.symbol) or {}
        sl = current.get("stop_loss")
        if sl is None or abs(sl - stop) > 1e-9 * abs(stop):
            set_paper_bracket(self.user_id, self.symbol, stop_loss=stop, take_profit=current.get("take_profit"))
        return None

    def close(self, side, qty, stop_id, tag):
        qty = self._open_qty(side, qty)
        if qty <= 0:
            return {"price": None}
        order = self._order("sell" if side == "long" else "buy", qty)
        return {"price": order["price"]}

    def reduce(self, side, qty, remaining, stop, stop_id, tag):
        """Steady: hissa band, baaki position ka stop (bracket) naye level par."""
        open_qty = self._open_qty(side, qty + remaining)
        if open_qty <= 0:
            return {"price": None, "stop_id": None}
        qty = min(qty, open_qty)
        order = self._order("sell" if side == "long" else "buy", qty)
        self.protect(side, open_qty - qty, stop, None)
        return {"price": order["price"], "stop_id": None}

    def _open_qty(self, side, qty):
        """
        Paper mein reduce-only nahi hota — stop abhi-abhi laga ho to bot ka "band karo" order
        ulti position khol deta. Isliye pehle settle, phir sirf utna jitna usi side mein khula hai.
        """
        self.sync()
        pos = self.position()
        if not pos or pos["side"] != side:
            return 0.0
        return min(qty, pos["qty"])

    def cancel_stop(self, stop_id):
        # Paper bracket position flat hote hi `_after_paper_fill` / settle khud hata deta hai.
        pass

    def _order(self, side, qty, stop_loss=None):
        try:
            order, _ = self.api.place_paper_order(self.user_id, {
                "symbol": self.symbol,
                "side": side,
                "order_type": "market",
                "quantity": qty,
                "stop_loss": stop_loss,
            })
        except self.api.PaperOrderRejected as rej:
            raise OrderError(rej.message)
        return order


class LiveClient:
    """
    Delta par asli orders. Entry/exit `submit_order(mode="live")` se (wahi guards jo desk par
    lagte hain), stop adapter ke stop order se — exchange par pada rehta hai.
    """

    mode = "live"

    def __init__(self, api, user, account, symbol):
        if account.get("exchange") != "delta":
            raise OrderError("Live bot abhi sirf Delta Exchange par chalta hai.")
        self.api = api
        self.user = user
        self.account = account
        self.symbol = symbol
        self.adapter = api.get_adapter(account["exchange"], api.decrypt_secret(account["api_key_encrypted"]),
                                       api.decrypt_secret(account["secret_key_encrypted"]))
        info = self.adapter.contract_info(symbol) if self.adapter else None
        if not info or not info.get("contract_value"):
            raise OrderError(f"{symbol} ka contract size nahi mila")
        self.product = info["symbol"]
        self.cv = float(info["contract_value"])
        self.tick = float(info.get("tick_size") or 0.0)

    def sync(self):
        pass

    def _contracts(self, qty):
        return int(round(qty / self.cv))

    def _price(self, px):
        if not self.tick:
            return round(px, 8)
        return round(round(px / self.tick) * self.tick, 10)

    def position(self):
        rows = self.adapter.positions()
        if rows is None:
            # "Pata nahi" ko "flat" nahi maante — warna bot dobara entry le leta.
            raise OrderError(f"Exchange position nahi padh paaye: {self.adapter.error_message()}")
        for r in rows:
            if r["symbol"] == self.product and r["size"]:
                return {"side": r["side"], "qty": r["size"] * self.cv}
        return None

    def mark(self):
        return self.adapter.mark_price(self.symbol)

    def round_qty(self, qty):
        return round(math.floor(qty / self.cv + 1e-9) * self.cv, 10)

    def enter(self, side, qty, stop, tag):
        res = self._market("buy" if side == "long" else "sell", qty, False, f"{tag}e")
        try:
            stop_id = self._place_stop(side, qty, stop, f"{tag}s")
        except OrderError as exc:
            # Stop ke bina position kabhi nahi chhodte.
            try:
                self._market("sell" if side == "long" else "buy", qty, True, f"{tag}u")
            except OrderError as exc2:
                raise OrderError(f"Stop nahi laga ({exc}) aur position band bhi nahi hui ({exc2}) — "
                                 "exchange par turant khud dekho")
            raise EntryAborted(f"exchange par stop nahi laga ({exc}), isliye position turant band ki")
        return {"qty": qty, "price": res.get("reference_price"), "stop_id": stop_id}

    def protect(self, side, qty, stop, stop_id):
        price = self._price(stop)
        if stop_id:
            order = self.adapter.get_order(stop_id)
            if order is None:
                # Haalat pata nahi — doosra stop lagane ke bajaye agli baar dekho.
                raise OrderError(f"Stop order ki haalat nahi mili: {self.adapter.error_message()}")
            if order["state"] in ("open", "pending"):
                if order["stop_price"] and abs(order["stop_price"] - price) <= max(self.tick, 1e-12) / 2:
                    return stop_id
                if self.adapter.edit_stop_order(stop_id, self.product, price) is None:
                    raise OrderError(f"Stop {price} par nahi khiska: {self.adapter.error_message()}")
                return stop_id
        # Stop exchange par nahi hai (crash, ya haath se cancel) — naya lagao.
        return self._place_stop(side, qty, stop, "cms")

    def close(self, side, qty, stop_id, tag):
        res = self._market("sell" if side == "long" else "buy", qty, True, f"{tag}c")
        # Pehle position band, phir stop hatao — beech mein crash ho to bacha reduce-only stop
        # kuch khol nahi sakta, jabki ulta karne par position bina stop reh jaati.
        if stop_id:
            self.cancel_stop(stop_id)
        return {"price": res.get("reference_price")}

    def reduce(self, side, qty, remaining, stop, stop_id, tag):
        """
        Steady: hissa reduce-only market se band. Phir baaki size ka naya stop pehle lagao, purana
        baad mein hatao — beech mein position kabhi bina stop nahi rehti.
        """
        res = self._market("sell" if side == "long" else "buy", qty, True, f"{tag}r")
        try:
            new_id = self._place_stop(side, remaining, stop, f"{tag}s")
        except OrderError as exc:
            # Naya nahi laga — purana (reduce-only, bada) hi rakho, bas price khiskao.
            print(f"⚠️ Bot ka chhota stop nahi laga ({exc}) — purana stop hi khiska rahe hain")
            return {"price": res.get("reference_price"), "stop_id": self.protect(side, remaining, stop, stop_id)}
        if stop_id:
            self.cancel_stop(stop_id)
        return {"price": res.get("reference_price"), "stop_id": new_id}

    def cancel_stop(self, stop_id):
        if stop_id and self.adapter.cancel_stop_order(stop_id, self.product) is None:
            print(f"⚠️ Bot stop {stop_id} cancel nahi hua: {self.adapter.error_message()}")

    def _place_stop(self, side, qty, stop, tag):
        r = self.adapter.place_stop_order(
            symbol=self.symbol,
            side="sell" if side == "long" else "buy",
            contracts=self._contracts(qty),
            stop_price=self._price(stop),
            client_order_id=_order_id(tag),
        )
        if r is None:
            raise OrderError(f"Exchange par stop nahi laga: {self.adapter.error_message()}")
        return r["order_id"]

    def _market(self, side, qty, reduce_only, tag):
        payload = {
            "symbol": self.symbol,
            "side": side,
            "order_type": "market",
            "size": self._contracts(qty),
            "size_unit": "contracts",
            "reduce_only": reduce_only,
            "client_order_id": _order_id(tag),
        }
        try:
            res = self.api.submit_order(user=self.user, account=self.account, payload=payload,
                                        source=ORDER_SOURCE, mode="live")
        except self.api.OrderRejected as rej:
            raise OrderError(rej.message)
        if res.get("mode") != "live":
            raise OrderError("LIVE_ORDERS_ENABLED band hai — order exchange par nahi gaya.")
        return res


def _order_id(tag):
    """
    Har call ka apna client_order_id. `_make_request` ke andar ke retry same body bhejte hain,
    to Delta wahan duplicate nahi banata; agli tick ka retry naya id leta hai (pehle position check hoti hai).
    """
    return f"{tag}{int(time.time() * 1000) % 10_000_000}"[:64]
