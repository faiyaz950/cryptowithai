"""
Trend Rider bot ke reconcile ke tests — nakli order client ke saath, koi network/DB nahi.

Chalao (backend/trading se):  ../venv/bin/python -m unittest discover -s tests -v
"""
import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import trend_rider  # noqa: E402
import trend_rider_bot as bot  # noqa: E402
from trend_rider_bot import OrderError  # noqa: E402

BAR = 4 * 3_600_000
T0 = 1_700_006_400_000  # 4h boundary (UTC)


class FakeClient:
    """Exchange jaisa nakli client: ek position, ek stop, har call ka record."""

    def __init__(self, mark=100.0, position=None):
        self.mark_price = mark
        self.pos = dict(position) if position else None
        self.stop = None
        self.calls = []
        self.fail_enter = None

    def position(self):
        return dict(self.pos) if self.pos else None

    def mark(self):
        return self.mark_price

    def round_qty(self, qty):
        return math.floor(qty * 1e6) / 1e6

    def enter(self, side, qty, stop, tag):
        self.calls.append(("enter", side, qty, stop))
        if self.fail_enter:
            raise self.fail_enter
        self.pos = {"side": side, "qty": qty}
        self.stop = stop
        return {"qty": qty, "price": self.mark_price, "stop_id": "S1"}

    def protect(self, side, qty, stop, stop_id):
        self.calls.append(("protect", stop))
        self.stop = stop
        return stop_id or "S2"

    def close(self, side, qty, stop_id, tag):
        self.calls.append(("close", side, qty))
        self.pos = None
        self.stop = None
        return {"price": self.mark_price}

    def cancel_stop(self, stop_id):
        self.calls.append(("cancel", stop_id))

    def reduce(self, side, qty, remaining, stop, stop_id, tag):
        self.calls.append(("reduce", side, qty, remaining, stop))
        self.pos = {"side": side, "qty": remaining}
        self.stop = stop
        return {"price": self.mark_price, "stop_id": stop_id or "S3"}

    def kinds(self):
        return [c[0] for c in self.calls]


def empty_state():
    return {k: None for k in bot.STATE_KEYS}


def open_state(entry_time, side="long", qty=1.0, stop=95.0, tp1_price=None, tp1_done=False):
    return {"entry_time": entry_time, "trade_state": "open", "side": side, "quantity": qty,
            "entry_price": 100.0, "stop_loss": stop, "stop_order_id": "S1",
            "tp1_price": tp1_price, "tp1_done": tp1_done}


def make_plan(position=None, pending=None, forming=None, equity=1000.0, tp1_r=0.0, tp1_frac=0.0):
    return {"position": position, "pending": pending, "forming": forming, "equity": equity,
            "trades": [], "last_closed": None, "stale": False, "error": None,
            "tp1_r": tp1_r, "tp1_frac": tp1_frac}


def run(state, plan, client, now_ms, **kw):
    return bot.reconcile(state, plan, client, now_ms=now_ms, bar_ms=BAR, risk_pct=1.0, **kw)


class ReconcileTest(unittest.TestCase):
    entry_t = T0 + 10 * BAR

    def test_fresh_entry_once(self):
        client = FakeClient(mark=100.0)
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, events, ok = run(empty_state(), plan, client, self.entry_t + 30_000)
        self.assertTrue(ok)
        self.assertEqual(s["trade_state"], "open")
        self.assertEqual(s["entry_time"], self.entry_t)
        self.assertEqual(client.kinds(), ["enter"])
        expected = math.floor(bot.entry_quantity(1000.0, 1.0, "long", 100.0, 95.0) * 1e6) / 1e6
        self.assertAlmostEqual(client.calls[0][2], expected)
        self.assertEqual(client.calls[0][3], 95.0)
        # Wahi plan dobara — koi nayi entry nahi (idempotent).
        s2, _, _ = run(s, plan, client, self.entry_t + 60_000)
        self.assertEqual(client.kinds().count("enter"), 1)
        self.assertEqual(s2["trade_state"], "open")

    def test_short_entry_sizing_matches_simulate(self):
        client = FakeClient(mark=200.0)
        plan = make_plan(pending={"side": "short", "entry_time": self.entry_t, "stop": 210.0}, equity=5000.0)
        run(empty_state(), plan, client, self.entry_t + 30_000)
        entry = 200.0 * (1 - trend_rider.SLIPPAGE)
        want = min(5000 * 0.01 / (210.0 - entry), 5000 * 3 / entry)
        self.assertAlmostEqual(client.calls[0][2], math.floor(want * 1e6) / 1e6)

    def test_missed_entry_candle_is_skipped(self):
        # Worker entry candle ke dauraan band tha — replay mein trade khul chuka.
        client = FakeClient()
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 96.0, "initial_stop": 95.0})
        s, events, ok = run(empty_state(), plan, client, self.entry_t + BAR + 30_000)
        self.assertTrue(ok)
        self.assertEqual(client.calls, [])
        self.assertEqual(s["trade_state"], "skipped")
        self.assertEqual(s["entry_time"], self.entry_t)
        self.assertIn("late entry nahi", events[0])
        # Agli candle par bhi dobara koshish nahi.
        run(s, plan, client, self.entry_t + 2 * BAR + 30_000)
        self.assertEqual(client.calls, [])

    def test_pending_after_candle_end_is_skipped(self):
        client = FakeClient()
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, _, _ = run(empty_state(), plan, client, self.entry_t + BAR)
        self.assertEqual(client.calls, [])
        self.assertEqual(s["trade_state"], "skipped")

    def test_entry_skipped_when_price_beyond_stop(self):
        client = FakeClient(mark=94.0)
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, _, _ = run(empty_state(), plan, client, self.entry_t + 30_000)
        self.assertEqual(client.calls, [])
        self.assertEqual(s["trade_state"], "skipped")

    def test_entry_skipped_when_entry_candle_already_hit_stop(self):
        client = FakeClient(mark=100.0)
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0},
                         forming={"time": self.entry_t, "open": 99.0, "high": 101.0, "low": 94.5})
        s, _, _ = run(empty_state(), plan, client, self.entry_t + 2 * 3_600_000)
        self.assertEqual(client.calls, [])
        self.assertEqual(s["trade_state"], "skipped")

    def test_stop_trail(self):
        client = FakeClient(mark=104.0, position={"side": "long", "qty": 1.0})
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 97.5, "initial_stop": 95.0})
        s, events, ok = run(open_state(self.entry_t), plan, client, self.entry_t + 3 * BAR + 30_000)
        self.assertTrue(ok)
        self.assertEqual(client.calls, [("protect", 97.5)])
        self.assertEqual(s["stop_loss"], 97.5)
        self.assertEqual(s["trade_state"], "open")
        self.assertTrue(any("Stop trail" in e for e in events))
        # Stop wahi hai to sirf protect (exchange par stop maujood hai, ye pakka karna), log nahi.
        _, events2, _ = run(s, plan, client, self.entry_t + 3 * BAR + 60_000)
        self.assertFalse(any("Stop trail" in e for e in events2))

    def test_gap_beyond_new_stop_exits(self):
        client = FakeClient(mark=97.0, position={"side": "long", "qty": 1.0})
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 97.5, "initial_stop": 95.0})
        s, _, _ = run(open_state(self.entry_t), plan, client, self.entry_t + 3 * BAR + 30_000)
        self.assertEqual(client.kinds(), ["close"])
        self.assertEqual(s["trade_state"], "closed")

    def test_strategy_exit_flattens(self):
        client = FakeClient(mark=98.0, position={"side": "long", "qty": 1.0})
        s, events, ok = run(open_state(self.entry_t), make_plan(), client, self.entry_t + 5 * BAR + 30_000)
        self.assertTrue(ok)
        self.assertEqual(client.calls, [("close", "long", 1.0)])
        self.assertEqual(s["trade_state"], "closed")
        self.assertEqual(s["stop_order_id"], "")

    def test_already_stopped_paper_position(self):
        # Paper bracket ne stop pehle hi chala diya — account flat, bot abhi "open" samajh raha.
        client = FakeClient(position=None)
        s, events, ok = run(open_state(self.entry_t), make_plan(), client, self.entry_t + 5 * BAR + 30_000)
        self.assertTrue(ok)
        self.assertNotIn("close", client.kinds())
        self.assertNotIn("enter", client.kinds())
        self.assertEqual(s["trade_state"], "closed")
        self.assertIn("pehle hi band", events[0])

    def test_already_stopped_while_strategy_still_long(self):
        # Paper mark stop ke paar gaya par candle ka low nahi — strategy abhi bhi isi trade mein.
        client = FakeClient(position=None)
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 96.0, "initial_stop": 95.0})
        s, _, _ = run(open_state(self.entry_t), plan, client, self.entry_t + 2 * BAR + 30_000)
        self.assertEqual(s["trade_state"], "closed")
        s2, _, _ = run(s, plan, client, self.entry_t + 3 * BAR + 30_000)
        self.assertEqual(s2["trade_state"], "closed")
        self.assertNotIn("enter", client.kinds())  # usi entry_time par dobara entry kabhi nahi

    def test_check_closed_between_candles(self):
        client = FakeClient(position=None)
        s, events = bot.check_closed(open_state(self.entry_t), client)
        self.assertEqual(s["trade_state"], "closed")
        self.assertEqual(len(events), 1)
        client2 = FakeClient(position={"side": "long", "qty": 1.0})
        s2, events2 = bot.check_closed(open_state(self.entry_t), client2)
        self.assertEqual(s2["trade_state"], "open")
        self.assertEqual(events2, [])

    def test_new_signal_closes_old_trade_first(self):
        client = FakeClient(mark=100.0, position={"side": "short", "qty": 2.0})
        new_t = self.entry_t + 6 * BAR
        plan = make_plan(pending={"side": "long", "entry_time": new_t, "stop": 95.0})
        s, _, _ = run(open_state(self.entry_t, side="short", qty=2.0, stop=105.0), plan, client, new_t + 30_000)
        self.assertEqual(client.kinds(), ["close", "enter"])
        self.assertEqual(s["entry_time"], new_t)
        self.assertEqual(s["side"], "long")

    def test_failed_entry_retries_inside_candle_only(self):
        client = FakeClient(mark=100.0)
        client.fail_enter = OrderError("exchange busy")
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, events, ok = run(empty_state(), plan, client, self.entry_t + 30_000)
        self.assertFalse(ok)
        self.assertEqual(s["trade_state"], "entering")
        client.fail_enter = None
        s2, _, ok2 = run(s, plan, client, self.entry_t + 90_000)
        self.assertTrue(ok2)
        self.assertEqual(s2["trade_state"], "open")
        self.assertEqual(client.kinds().count("enter"), 2)
        # Candle nikal gayi aur entry kabhi nahi lagi — skip, aur koshish nahi.
        client3 = FakeClient(mark=100.0)
        s3, _, _ = run(s, plan, client3, self.entry_t + BAR + 1)
        self.assertEqual(client3.kinds(), [])
        self.assertEqual(s3["trade_state"], "skipped")

    def test_crash_after_fill_adopts_position_without_second_entry(self):
        # Order lag gaya tha par state "entering" hi save hua (crash / timeout).
        client = FakeClient(mark=100.0, position={"side": "long", "qty": 1.5})
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        state = dict(empty_state(), entry_time=self.entry_t, trade_state="entering", side="long",
                     quantity=1.5, stop_loss=95.0, stop_order_id="")
        s, _, ok = run(state, plan, client, self.entry_t + 120_000)
        self.assertTrue(ok)
        self.assertEqual(client.calls, [("protect", 95.0)])
        self.assertEqual(s["trade_state"], "open")

    def test_lost_claim_places_no_order(self):
        client = FakeClient(mark=100.0)
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, _, ok = run(empty_state(), plan, client, self.entry_t + 30_000, claim=lambda t, f: False)
        self.assertIsNone(s)
        self.assertEqual(client.calls, [])

    def test_paused_skips_new_entries_but_trails_open_trade(self):
        client = FakeClient(mark=100.0)
        plan = make_plan(pending={"side": "long", "entry_time": self.entry_t, "stop": 95.0})
        s, _, _ = run(empty_state(), plan, client, self.entry_t + 30_000, allow_entries=False)
        self.assertEqual(client.calls, [])
        self.assertEqual(s["trade_state"], "skipped")
        client2 = FakeClient(mark=104.0, position={"side": "long", "qty": 1.0})
        plan2 = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                    "stop": 98.0, "initial_stop": 95.0})
        s2, _, _ = run(open_state(self.entry_t), plan2, client2, self.entry_t + 2 * BAR, allow_entries=False)
        self.assertEqual(client2.calls, [("protect", 98.0)])
        self.assertEqual(s2["stop_loss"], 98.0)


def synthetic_candles(n=2000, seed=7):
    """Trend aur range dono wala random walk, kabhi-kabhi gap ke saath — breakouts aur stops dono milein."""
    rng = np.random.default_rng(seed)
    times = T0 + np.arange(n, dtype=np.int64) * BAR
    o = np.empty(n)
    h = np.empty(n)
    l = np.empty(n)
    c = np.empty(n)
    price = 100.0
    drift = 0.0
    for i in range(n):
        if i % 150 == 0:
            drift = rng.choice([0.004, -0.004, 0.0, 0.002, -0.002])
        gap = rng.normal(0, 0.03) if rng.random() < 0.02 else 0.0
        o[i] = price * (1 + gap)
        c[i] = o[i] * (1 + drift + rng.normal(0, 0.012))
        h[i] = max(o[i], c[i]) * (1 + abs(rng.normal(0, 0.006)))
        l[i] = min(o[i], c[i]) * (1 - abs(rng.normal(0, 0.006)))
        price = c[i]
    return times, o, h, l, c


class SteadyTest(unittest.TestCase):
    """Steady: pehla profit (tp1) par hissa book, stop entry par — ek hi baar."""
    entry_t = T0 + 10 * BAR
    be = bot._breakeven("long", 100.0)

    def test_tick_books_first_profit_once(self):
        client = FakeClient(mark=106.0, position={"side": "long", "qty": 1.0})
        state = open_state(self.entry_t, tp1_price=105.0)
        s, events = bot.check_first_profit(state, client, tp1_frac=0.25)
        self.assertEqual(client.kinds(), ["reduce"])
        _, side, part, remaining, stop = client.calls[0]
        self.assertAlmostEqual(part, 0.25)
        self.assertAlmostEqual(remaining, 0.75)
        self.assertAlmostEqual(stop, self.be)
        self.assertTrue(s["tp1_done"])
        self.assertAlmostEqual(s["quantity"], 0.75)
        self.assertAlmostEqual(s["stop_loss"], self.be)
        self.assertIn("Pehla profit", events[0])
        # Agli tick — dobara book nahi.
        s2, events2 = bot.check_first_profit(s, client, tp1_frac=0.25)
        self.assertEqual(client.kinds(), ["reduce"])
        self.assertEqual(events2, [])

    def test_tick_waits_below_first_profit(self):
        client = FakeClient(mark=104.0, position={"side": "long", "qty": 1.0})
        s, events = bot.check_first_profit(open_state(self.entry_t, tp1_price=105.0), client, tp1_frac=0.25)
        self.assertEqual(client.calls, [])
        self.assertFalse(s["tp1_done"])

    def test_short_first_profit(self):
        client = FakeClient(mark=94.0, position={"side": "short", "qty": 2.0})
        state = open_state(self.entry_t, side="short", qty=2.0, stop=105.0, tp1_price=95.0)
        s, _ = bot.check_first_profit(state, client, tp1_frac=0.25)
        self.assertAlmostEqual(client.calls[0][2], 0.5)
        self.assertAlmostEqual(s["stop_loss"], bot._breakeven("short", 100.0))
        self.assertLess(s["stop_loss"], 105.0)

    def test_candle_close_catches_missed_first_profit(self):
        client = FakeClient(mark=103.0, position={"side": "long", "qty": 1.0})
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 100.25, "initial_stop": 95.0, "tp1_price": 105.0, "tp1_done": True},
                         tp1_r=1.0, tp1_frac=0.25)
        s, events, ok = run(open_state(self.entry_t, tp1_price=105.0), plan, client, self.entry_t + 2 * BAR + 30_000)
        self.assertTrue(ok)
        self.assertEqual(client.kinds().count("reduce"), 1)
        self.assertTrue(s["tp1_done"])
        self.assertAlmostEqual(s["stop_loss"], max(100.25, self.be))
        run(s, plan, client, self.entry_t + 3 * BAR + 30_000)
        self.assertEqual(client.kinds().count("reduce"), 1)

    def test_stop_never_loosens_after_first_profit(self):
        client = FakeClient(mark=103.0, position={"side": "long", "qty": 0.75})
        state = open_state(self.entry_t, qty=0.75, stop=100.4, tp1_price=105.0, tp1_done=True)
        plan = make_plan(position={"side": "long", "entry_time": self.entry_t, "entry_price": 100.0,
                                   "stop": 100.2, "initial_stop": 95.0, "tp1_price": 105.0, "tp1_done": True},
                         tp1_r=1.0, tp1_frac=0.25)
        s, _, _ = run(state, plan, client, self.entry_t + 2 * BAR + 30_000)
        self.assertAlmostEqual(s["stop_loss"], 100.4)
        self.assertEqual(client.calls[-1], ("protect", 100.4))

    def test_stopped_before_first_profit_tick(self):
        client = FakeClient(mark=106.0, position=None)
        s, events = bot.check_first_profit(open_state(self.entry_t, tp1_price=105.0), client, tp1_frac=0.25)
        self.assertEqual(s["trade_state"], "closed")
        self.assertNotIn("reduce", client.kinds())

    def test_too_small_to_split_moves_stop_only(self):
        client = FakeClient(mark=106.0, position={"side": "long", "qty": 0.000003})
        s, events = bot.check_first_profit(open_state(self.entry_t, qty=0.000003, tp1_price=105.0), client,
                                           tp1_frac=0.25)
        self.assertEqual(client.kinds(), ["protect"])
        self.assertTrue(s["tp1_done"])
        self.assertAlmostEqual(s["stop_loss"], self.be)

    def test_new_entry_resets_first_profit(self):
        client = FakeClient(mark=100.0)
        state = dict(open_state(self.entry_t, tp1_price=105.0, tp1_done=True), trade_state="closed")
        new_t = self.entry_t + 5 * BAR
        plan = make_plan(pending={"side": "long", "entry_time": new_t, "stop": 95.0, "tp1_price": 105.1},
                         tp1_r=1.0, tp1_frac=0.25)
        s, _, ok = run(state, plan, client, new_t + 30_000)
        self.assertTrue(ok)
        self.assertEqual(s["trade_state"], "open")
        self.assertFalse(s["tp1_done"])
        self.assertAlmostEqual(s["tp1_price"], 105.1)


class ExchangeSim(FakeClient):
    """
    Walk-forward ke liye exchange: stop exchange par pada rehta hai aur har candle ke
    range se trigger hota hai (gap par open par). Trades ka log rakhta hai.
    """

    def __init__(self):
        super().__init__()
        self.trades = []
        self.open_trade = None

    def enter(self, side, qty, stop, tag):
        res = super().enter(side, qty, stop, tag)
        self.open_trade = {"side": side, "entry_time": self.now_bar, "qty": qty, "init_stop": stop, "tp1": False}
        return res

    def reduce(self, side, qty, remaining, stop, stop_id, tag):
        self.open_trade["tp1"] = True
        return super().reduce(side, qty, remaining, stop, stop_id, tag)

    def close(self, side, qty, stop_id, tag):
        self._exit(self.now_bar, self.mark_price, "strategy")
        return super().close(side, qty, stop_id, tag)

    def _exit(self, bar_time, price, why):
        t = dict(self.open_trade, exit_time=bar_time, exit_raw=price, why=why)
        self.trades.append(t)
        self.open_trade = None

    def run_bar(self, bar_time, o, h, l):
        """Ek poori candle exchange par — stop laga hai to trigger check."""
        if not self.pos or self.stop is None:
            return
        d = 1 if self.pos["side"] == "long" else -1
        if d * o <= d * self.stop:
            px = o
        elif (l if d > 0 else h) * d <= self.stop * d:
            px = self.stop
        else:
            return
        self._exit(bar_time, px, "stop")
        self.pos = None
        self.stop = None


def walk_forward(times, o, h, l, c, start_i, skip_bars=(), extra=None):
    """Har candle khulne ke 30s baad worker ki tarah plan + reconcile. `skip_bars`: worker band tha.
    Steady (`extra` mein tp1) par candle ke beech wali tick bhi: stop na laga ho aur price tp1 chhoo
    le to wahin hissa book — backtest jaisa (stop pehle, phir tp1)."""
    params = dict(trend_rider.DEFAULTS, **(extra or {}))
    ex = ExchangeSim()
    state = empty_state()
    start_time = int(times[start_i]) + 3_600_000  # deploy candle ke beech mein
    for i in range(start_i, len(times)):
        if i > start_i:
            ex.run_bar(int(times[i - 1]), o[i - 1], h[i - 1], l[i - 1])
            tp1 = state.get("tp1_price")
            if (ex.pos and state.get("trade_state") == "open" and tp1 is not None and not state.get("tp1_done")
                    and (h[i - 1] >= tp1 if state["side"] == "long" else l[i - 1] <= tp1)):
                ex.mark_price = tp1
                state, _ = bot.check_first_profit(state, ex, tp1_frac=params["tp1_frac"])
        if i in skip_bars:
            continue
        now = int(times[i]) + 30_000
        # Chalu candle ke 30s — abhi sirf open hi bana hai.
        ft, fo, fh, fl, fc = (np.append(times[:i], times[i]), np.append(o[:i], o[i]), np.append(h[:i], o[i]),
                              np.append(l[:i], o[i]), np.append(c[:i], o[i]))
        p = bot.plan(ft, fo, fh, fl, fc, params=params, capital=1000.0, start_time_ms=start_time,
                     bar_ms=BAR, now_ms=now)
        assert p["error"] is None and not p["stale"]
        ex.mark_price = o[i]
        ex.now_bar = int(times[i])
        state, _, ok = bot.reconcile(state, p, ex, now_ms=now, bar_ms=BAR, risk_pct=params["risk_pct"])
        assert ok
    return ex


class BacktestParityTest(unittest.TestCase):
    """Bot ke trades `trend_rider.simulate` (yaani /api/backtest) ke trade log jaise hone chahiye."""

    @classmethod
    def setUpClass(cls):
        cls.data = synthetic_candles()
        times = cls.data[0]
        cls.start_i = 700
        cls.ex = walk_forward(*cls.data, cls.start_i)
        # Backtest same period par: deploy waali candle se, bina chalu (aakhri) candle ke.
        t, o, h, l, c = (x[:-1] for x in cls.data)
        cls.sim = trend_rider.simulate(t, o, h, l, c, capital=1000.0, start_index=cls.start_i, bar_hours=4.0)
        cls.times = times

    def test_enough_trades_to_mean_something(self):
        self.assertGreaterEqual(len(self.sim["trades"]), 8)

    def test_same_trades_as_backtest(self):
        sim = self.sim["trades"]
        self.assertEqual(len(self.ex.trades), len(sim))
        for s, b in zip(sim, self.ex.trades):
            self.assertEqual(b["side"], "long" if s["side"] == "buy" else "short")
            self.assertEqual(b["entry_time"], s["entry_time"])
            self.assertEqual(b["exit_time"], s["exit_time"])
            self.assertAlmostEqual(b["init_stop"], s["stop_loss"], places=3)
            # Size bhi backtest jaisa (compounding equity se), bas 1e-6 tak round.
            self.assertAlmostEqual(b["qty"], s["quantity"], delta=2e-6)
            d = 1 if b["side"] == "long" else -1
            self.assertAlmostEqual(b["exit_raw"] * (1 - d * trend_rider.SLIPPAGE), s["exit_price"], places=3)

    def test_open_position_matches(self):
        pos = self.sim["open_position"]
        if pos is None:
            self.assertIsNone(self.ex.open_trade)
        else:
            self.assertEqual(self.ex.open_trade["entry_time"], pos["entry_time"])
            self.assertAlmostEqual(self.ex.stop, pos["stop_loss"], places=6)

    def test_missed_entry_drops_only_that_trade(self):
        sim = self.sim["trades"]
        victim = sim[len(sim) // 2]
        bar = int(np.searchsorted(self.times, victim["entry_time"]))
        ex = walk_forward(*self.data, self.start_i, skip_bars={bar})
        want = [(t["entry_time"], t["exit_time"]) for t in sim if t is not victim]
        got = [(t["entry_time"], t["exit_time"]) for t in ex.trades]
        self.assertEqual(got[:len(want)], want)


class SteadyParityTest(unittest.TestCase):
    """Steady bot: wahi trades, wahi pehla-profit, wahi exits jo `simulate(tp1_r=1, tp1_frac=0.25)`."""
    extra = {"tp1_r": 1.0, "tp1_frac": 0.25}

    @classmethod
    def setUpClass(cls):
        cls.data = synthetic_candles()
        cls.start_i = 700
        cls.ex = walk_forward(*cls.data, cls.start_i, extra=cls.extra)
        t, o, h, l, c = (x[:-1] for x in cls.data)
        cls.sim = trend_rider.simulate(t, o, h, l, c, params=cls.extra, capital=1000.0,
                                       start_index=cls.start_i, bar_hours=4.0)

    def test_first_profit_happens_often_enough(self):
        hits = sum(1 for t in self.sim["trades"] if t["tp1_hit"])
        self.assertGreaterEqual(hits, 4)

    def test_same_trades_and_first_profits_as_backtest(self):
        sim = self.sim["trades"]
        self.assertEqual(len(self.ex.trades), len(sim))
        for s, b in zip(sim, self.ex.trades):
            self.assertEqual(b["entry_time"], s["entry_time"])
            self.assertEqual(b["exit_time"], s["exit_time"])
            self.assertEqual(b["tp1"], s["tp1_hit"])
            self.assertAlmostEqual(b["qty"], s["quantity"], delta=2e-6)
            d = 1 if b["side"] == "long" else -1
            self.assertAlmostEqual(b["exit_raw"] * (1 - d * trend_rider.SLIPPAGE), s["exit_price"], places=3)

    def test_open_position_matches(self):
        pos = self.sim["open_position"]
        if pos is None:
            self.assertIsNone(self.ex.open_trade)
        else:
            self.assertEqual(self.ex.open_trade["entry_time"], pos["entry_time"])
            self.assertEqual(self.ex.open_trade["tp1"], pos["tp1_done"])
            self.assertAlmostEqual(self.ex.stop, pos["stop_loss"], places=6)


if __name__ == "__main__":
    unittest.main()
