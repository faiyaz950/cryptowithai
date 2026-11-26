"""
Trident Momentum ke tests — rules, backtest aur bot ka backtest se mel. Koi network/DB nahi.

Chalao (backend/trading se):  ../venv/bin/python -m unittest discover -s tests -v
"""
import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import trend_rider  # noqa: E402
import trend_rider_bot as bot  # noqa: E402
import trident  # noqa: E402
from test_trend_rider_bot import BAR, T0, ExchangeSim, FakeClient, empty_state, open_state, synthetic_candles  # noqa: E402

SMALL = {"h1": 2, "h2": 4, "h3": 6, "ema_fast": 3, "ema_slow": 5, "atr_period": 3}


def bars_from_closes(closes):
    """Close se seedhi candles: open = pichhla close, high/low thoda bahar."""
    c = np.asarray(closes, dtype=float)
    o = np.concatenate([[c[0]], c[:-1]])
    h = np.maximum(o, c) * 1.001
    l = np.minimum(o, c) * 0.999
    t = T0 + np.arange(len(c), dtype=np.int64) * BAR
    return t, o, h, l, c


class ScoreTest(unittest.TestCase):
    def test_score_is_average_of_three_votes(self):
        c = np.array([10, 11, 12, 13, 14, 12, 15.0])
        s = trident.momentum_score(c, [1, 2, 4])
        self.assertTrue(np.isnan(s[:4]).all())   # 4-candle horizon abhi bhara nahi
        self.assertAlmostEqual(s[4], 1.0)         # 14 > 13, 12, 10
        self.assertAlmostEqual(s[5], -1 / 3)      # 12 < 14, 12 < 13, 12 > 11
        self.assertAlmostEqual(s[6], 1.0)         # 15 > 12, 14, 12

    def test_equal_close_is_a_zero_vote(self):
        s = trident.momentum_score(np.array([5.0, 5.0, 6.0]), [1, 2])
        self.assertTrue(np.isnan(s[1]))
        self.assertAlmostEqual(s[2], 1.0)
        s2 = trident.momentum_score(np.array([5.0, 6.0, 6.0]), [1, 2])
        self.assertAlmostEqual(s2[2], 0.5)        # 6 = 6 (0), 6 > 5 (+1)


class SignalTest(unittest.TestCase):
    def _ind(self, closes, **extra):
        t, o, h, l, c = bars_from_closes(closes)
        return trident.indicators(o, h, l, c, {**trident.DEFAULTS, **SMALL, **extra})

    def test_long_only_on_the_bar_consensus_forms(self):
        closes = [10, 10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 16]
        ind = self._ind(closes)
        longs = list(np.flatnonzero(ind["long"]))
        # Pehli candle jahan teeno horizon upar: i=7 (11 > 10 har horizon pe). Uske baad bhi
        # score +1 rehta hai par naya signal nahi.
        self.assertEqual(longs, [7])
        self.assertFalse(ind["short"].any())

    def test_exit_when_two_of_three_flip(self):
        closes = [10, 10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 15, 14, 13]
        ind = self._ind(closes)
        # i=13: 15 vs 15 / 13 / 11 -> 0, +1, +1 = 2/3, abhi bhi long.
        self.assertAlmostEqual(ind["score"][13], 2 / 3)
        self.assertFalse(ind["exit_long"][13])
        # i=14: 14 vs 16 / 14 / 12 -> −1, 0, +1 = 0 — majority ab "upar" nahi, exit.
        self.assertAlmostEqual(ind["score"][14], 0.0)
        self.assertTrue(ind["exit_long"][14])
        self.assertFalse(ind["exit_long"][8:14].any())

    def test_short_needs_bear_regime_and_toggle(self):
        down = [20, 20, 20, 20, 20, 20, 20, 19, 18, 17, 16, 15, 14]
        ind = self._ind(down)
        self.assertEqual(list(np.flatnonzero(ind["short"])), [7])
        self.assertTrue(ind["ema_fast"][7] < ind["ema_slow"][7])
        self.assertFalse(self._ind(down, allow_shorts=False)["short"].any())
        # Regime ulta (fast EMA slow se upar) ho to teeno neeche hon tab bhi short nahi.
        inverted = self._ind(down, ema_fast=5, ema_slow=3)
        self.assertLessEqual(inverted["score"][7], -1.0)
        self.assertFalse(inverted["short"].any())


class SimulateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = synthetic_candles()
        cls.start = 700
        cls.res = trident.simulate(*cls.data, capital=1000.0, start_index=cls.start, bar_hours=4.0)
        cls.ind = trident.indicators(*cls.data[1:], dict(trident.DEFAULTS))

    def test_enough_trades_of_both_exit_kinds(self):
        statuses = [t["status"] for t in self.res["trades"]]
        self.assertGreaterEqual(len(statuses), 8)
        self.assertIn("MOMENTUM_EXIT", statuses)
        self.assertIn("SL_HIT", statuses)
        # Stop trail nahi hota — TRAILING_STOP kabhi nahi.
        self.assertNotIn("TRAILING_STOP", statuses)

    def test_entries_follow_fresh_consensus(self):
        times = self.data[0]
        for t in self.res["trades"]:
            k = int(np.searchsorted(times, t["entry_time"])) - 1
            self.assertTrue(self.ind["long"][k] if t["side"] == "buy" else self.ind["short"][k])
            atr_k = self.ind["atr"][k]
            d = 1 if t["side"] == "buy" else -1
            self.assertAlmostEqual(t["stop_loss"], round(self.data[4][k] - d * 2.5 * atr_k, 4), places=3)

    def test_momentum_exit_is_next_open_after_flip(self):
        times, o = self.data[0], self.data[1]
        for t in self.res["trades"]:
            if t["status"] != "MOMENTUM_EXIT":
                continue
            i = int(np.searchsorted(times, t["exit_time"]))
            d = 1 if t["side"] == "buy" else -1
            self.assertLessEqual(d * self.ind["score"][i - 1], 0.0)
            self.assertAlmostEqual(t["exit_price"], round(o[i] * (1 - d * trend_rider.SLIPPAGE), 4), places=3)

    def test_losses_capped_near_one_r(self):
        # Stop par (gap ke bina) ~1R hi jaata hai — fees, slippage aur funding thoda upar le jaate hain.
        # Gap stop ke paar khule to open par nikalte hain, wahan 1R se zyada ho sakta hai.
        checked = 0
        for t in self.res["trades"]:
            if t["status"] != "SL_HIT":
                continue
            d = 1 if t["side"] == "buy" else -1
            at_stop = abs(t["exit_price"] - t["stop_loss"] * (1 - d * trend_rider.SLIPPAGE)) < 1e-3
            if at_stop:
                checked += 1
                self.assertGreater(t["r_multiple"], -1.3)
        self.assertGreater(checked, 0)

    def test_costs_are_charged(self):
        st = self.res["stats"]
        self.assertGreater(st["fees_paid"], 0)
        self.assertGreater(st["funding_paid"], 0)
        realized = sum(t["pnl"] for t in self.res["trades"])
        open_pnl = self.res["open_position"]["unrealized_pnl"] if self.res["open_position"] else 0.0
        self.assertAlmostEqual(st["final_equity"], round(1000.0 + realized + open_pnl, 2), delta=0.02)

    def test_no_lookahead(self):
        # Aage ki candles hata do — tab tak band hue trades bilkul wahi rehne chahiye.
        cut = 1500
        part = trident.simulate(*(x[:cut] for x in self.data), capital=1000.0, start_index=self.start, bar_hours=4.0)
        cut_time = self.data[0][cut - 1]
        full = [t for t in self.res["trades"] if t["exit_time"] <= cut_time]
        self.assertEqual(part["trades"], full)


def walk_forward(times, o, h, l, c, start_i, params=None, skip_bars=()):
    """Har candle khulne ke 30s baad worker ki tarah plan + reconcile (strategy = Trident)."""
    p = dict(trident.DEFAULTS, **(params or {}))
    ex = ExchangeSim()
    state = empty_state()
    start_time = int(times[start_i]) + 3_600_000
    for i in range(start_i, len(times)):
        if i > start_i:
            ex.run_bar(int(times[i - 1]), o[i - 1], h[i - 1], l[i - 1])
        if i in skip_bars:
            continue
        now = int(times[i]) + 30_000
        ft, fo, fh, fl, fc = (np.append(times[:i], times[i]), np.append(o[:i], o[i]), np.append(h[:i], o[i]),
                              np.append(l[:i], o[i]), np.append(c[:i], o[i]))
        pl = bot.plan(ft, fo, fh, fl, fc, params=p, capital=1000.0, start_time_ms=start_time,
                      bar_ms=BAR, now_ms=now, strategy=trident.STRATEGY)
        assert pl["error"] is None and not pl["stale"]
        ex.mark_price = o[i]
        ex.now_bar = int(times[i])
        state, _, ok = bot.reconcile(state, pl, ex, now_ms=now, bar_ms=BAR, risk_pct=p["risk_pct"])
        assert ok
    return ex


class BotParityTest(unittest.TestCase):
    """Paper/live bot ke trades `trident.simulate` (yaani /api/backtest?strategy=trident-momentum) jaise."""

    @classmethod
    def setUpClass(cls):
        cls.data = synthetic_candles(seed=3)
        cls.start_i = 700
        cls.ex = walk_forward(*cls.data, cls.start_i)
        t, o, h, l, c = (x[:-1] for x in cls.data)
        cls.sim = trident.simulate(t, o, h, l, c, capital=1000.0, start_index=cls.start_i, bar_hours=4.0)

    def test_enough_trades_to_mean_something(self):
        self.assertGreaterEqual(len(self.sim["trades"]), 8)
        self.assertGreaterEqual(sum(1 for t in self.sim["trades"] if t["status"] == "MOMENTUM_EXIT"), 3)

    def test_same_trades_as_backtest(self):
        sim = self.sim["trades"]
        self.assertEqual(len(self.ex.trades), len(sim))
        for s, b in zip(sim, self.ex.trades):
            self.assertEqual(b["side"], "long" if s["side"] == "buy" else "short")
            self.assertEqual(b["entry_time"], s["entry_time"])
            self.assertEqual(b["exit_time"], s["exit_time"])
            self.assertEqual(b["why"], "strategy" if s["status"] == "MOMENTUM_EXIT" else "stop")
            self.assertAlmostEqual(b["init_stop"], s["stop_loss"], places=3)
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


class PlanTest(unittest.TestCase):
    def test_momentum_break_means_flat_now(self):
        times, o, h, l, c = synthetic_candles(seed=3)
        res = trident.simulate(times, o, h, l, c, capital=1000.0, start_index=700, bar_hours=4.0)
        t = next(t for t in res["trades"] if t["status"] == "MOMENTUM_EXIT")
        i = int(np.searchsorted(times, t["exit_time"]))  # exit candle; i-1 par momentum toota
        now = int(times[i]) - 60_000                      # i-1 abhi-abhi band, i shuru nahi hui
        pl = bot.plan(times[:i], o[:i], h[:i], l[:i], c[:i], params={}, capital=1000.0,
                      start_time_ms=int(times[700]), bar_ms=BAR, now_ms=now + BAR, strategy=trident.STRATEGY)
        self.assertIsNone(pl["position"])
        self.assertIn("Momentum toot gaya", pl["flat_reason"])
        # Bot ka khula trade isi plan par band hota hai — wahi message ke saath.
        client = FakeClient(mark=float(c[i - 1]), position={"side": "long" if t["side"] == "buy" else "short", "qty": 1.0})
        state = open_state(t["entry_time"], side="long" if t["side"] == "buy" else "short")
        s, events, ok = bot.reconcile(state, pl, client, now_ms=now + BAR, bar_ms=BAR, risk_pct=1.0)
        self.assertTrue(ok)
        self.assertEqual(client.kinds(), ["close"])
        self.assertEqual(s["trade_state"], "closed")
        self.assertIn("Momentum toot gaya", events[0])

    def test_trend_rider_plan_unchanged_by_default(self):
        times, o, h, l, c = synthetic_candles()
        now = int(times[-1]) + 30_000
        a = bot.plan(times, o, h, l, c, params={}, capital=1000.0, start_time_ms=int(times[700]), bar_ms=BAR, now_ms=now)
        b = bot.plan(times, o, h, l, c, params={}, capital=1000.0, start_time_ms=int(times[700]), bar_ms=BAR, now_ms=now,
                     strategy="trend-rider-pro")
        self.assertEqual(a["trades"], b["trades"])
        self.assertNotIn("flat_reason", a)
        ref = trend_rider.simulate(*(x[:-1] for x in (times, o, h, l, c)), capital=1000.0, start_index=700, bar_hours=4.0)
        self.assertEqual(a["trades"], ref["trades"])

    def test_not_enough_history(self):
        times, o, h, l, c = synthetic_candles(n=150)
        pl = bot.plan(times, o, h, l, c, params={}, capital=1000.0, start_time_ms=int(times[0]), bar_ms=BAR,
                      now_ms=int(times[-1]) + 30_000, strategy=trident.STRATEGY)
        self.assertIsNotNone(pl["error"])
        self.assertTrue(math.isfinite(pl["equity"]))


if __name__ == "__main__":
    unittest.main()
