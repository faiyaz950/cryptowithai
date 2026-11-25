"""Native Strateo engines — signal identity, ATR stops, fees. No network."""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import account_guard  # noqa: E402
import native_signals as ns  # noqa: E402


def _series(n=240, seed=3):
    rng = np.random.default_rng(seed)
    steps = rng.normal(0.0004, 0.01, n)
    close = 100 * np.exp(np.cumsum(steps))
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) * (1 + rng.uniform(0, 0.004, n))
    low = np.minimum(open_, close) * (1 - rng.uniform(0, 0.004, n))
    volume = rng.uniform(10, 50, n)
    times = np.arange(n, dtype=np.int64) * 3_600_000 + 1_700_000_000_000
    return times, open_, high, low, close, volume


class NativeSignalTests(unittest.TestCase):
    def test_ema_and_macd_are_not_the_same_trade(self):
        data = _series()
        ema = ns.ENGINES["ema-crossover"].simulate(*data[:5], volume=data[5], capital=1000, start_index=40)
        macd = ns.ENGINES["macd"].simulate(*data[:5], volume=data[5], capital=1000, start_index=40)
        ema_times = [t["entry_time"] for t in ema["trades"]]
        macd_times = [t["entry_time"] for t in macd["trades"]]
        self.assertTrue(ema_times or macd_times)
        self.assertNotEqual(ema_times, macd_times)

    def test_stop_is_atr_not_fixed_points(self):
        data = _series()
        res = ns.ENGINES["ema-crossover"].simulate(*data[:5], volume=data[5], capital=1000, start_index=40,
                                                   params={"stop_atr": 1.5, "target_r": 2})
        self.assertGreater(len(res["trades"]), 0)
        trade = res["trades"][0]
        dist = abs(trade["entry_price"] - trade["stop_loss"])
        # BTC-sized fixed 400pt stop cannot appear on a ~100 price series.
        self.assertLess(dist, 20)
        self.assertGreater(dist, 0)
        if trade["target"]:
            reward = abs(trade["target"] - trade["entry_price"])
            self.assertAlmostEqual(reward / dist, 2.0, delta=0.15)

    def test_fees_reduce_a_round_trip(self):
        data = _series()
        res = ns.ENGINES["ema-crossover"].simulate(*data[:5], volume=data[5], capital=1000, start_index=40)
        self.assertGreater(len(res["trades"]), 0)
        trade = res["trades"][0]
        sign = 1 if trade["side"] == "buy" else -1
        gross = sign * (trade["exit_price"] - trade["entry_price"]) * trade["quantity"]
        self.assertLess(trade["pnl"], gross)
        self.assertGreater(res["stats"]["fees_paid"], 0)

    def test_btc_eth_breakout_is_a_20_bar_close_through_both_sides(self):
        n = 80
        close = np.full(n, 100.0)
        open_ = np.full(n, 100.0)
        high = np.full(n, 101.0)
        low = np.full(n, 99.0)
        # Inside the prior 20-bar range — no trade.
        close[30] = 100.4
        high[30] = 100.8
        low[30] = 99.6
        # Close above the prior 20 highs (those highs are 101).
        open_[40] = 100.5
        close[40] = 104.0
        high[40] = 104.5
        low[40] = 100.2
        # Next bar runs far enough for a 2R target off an ATR stop.
        for i in range(41, 60):
            open_[i] = 104.0 + (i - 41) * 3.0
            close[i] = open_[i] + 0.2
            high[i] = close[i] + 1.0
            low[i] = open_[i] - 0.3
        volume = np.full(n, 20.0)
        times = np.arange(n, dtype=np.int64) * 3_600_000
        eng = ns.ENGINES["btc-eth-breakout"]
        ind = eng.indicators(open_, high, low, close, {"lookback": 20, "stop_atr": 1.5, "allow_shorts": True}, volume=volume)
        self.assertFalse(bool(ind["long"][30] or ind["short"][30]))
        self.assertTrue(bool(ind["long"][40]))
        self.assertFalse(bool(ind["short"][40]))
        # A close that only ties the prior high is not a breakout.
        tied = close.copy()
        tied[40] = 101.0
        ind_tie = eng.indicators(open_, high, low, tied, {"lookback": 20}, volume=volume)
        self.assertFalse(bool(ind_tie["long"][40]))

        res = eng.simulate(
            times, open_, high, low, close, volume=volume, capital=1000, start_index=25,
            params={"lookback": 20, "stop_atr": 1.5, "target_r": 2, "allow_shorts": True},
        )
        self.assertGreater(len(res["trades"]), 0)
        trade = res["trades"][0]
        self.assertEqual(trade["side"], "buy")
        dist = trade["entry_price"] - trade["stop_loss"]
        self.assertGreater(dist, 0)
        self.assertAlmostEqual(trade["target"] - trade["entry_price"], 2 * dist, delta=dist * 0.05)

        # Close under the prior 20 lows.
        close2 = np.full(n, 100.0)
        open2 = np.full(n, 100.0)
        high2 = np.full(n, 101.0)
        low2 = np.full(n, 99.0)
        open2[40] = 99.5
        close2[40] = 96.0
        high2[40] = 99.8
        low2[40] = 95.5
        ind_short = eng.indicators(open2, high2, low2, close2, {"lookback": 20, "allow_shorts": True}, volume=volume)
        self.assertTrue(bool(ind_short["short"][40]))
        self.assertFalse(bool(ind_short["long"][40]))
        blocked = eng.indicators(open2, high2, low2, close2, {"lookback": 20, "allow_shorts": False}, volume=volume)
        self.assertFalse(bool(blocked["short"][40]))

    def test_btc_eth_rsi_pullback_needs_ema_and_reclaim(self):
        n = 260
        # Slow grind up so EMA 200 sits below price, then an RSI dip and reclaim.
        close = np.linspace(90, 120, n)
        close[230:238] = np.linspace(118, 108, 8)  # selloff → RSI oversold
        close[238:245] = np.linspace(108.5, 114, 7)  # bounce → RSI crosses back above 30
        open_ = np.r_[close[0], close[:-1]]
        high = np.maximum(open_, close) + 0.3
        low = np.minimum(open_, close) - 0.3
        volume = np.full(n, 20.0)
        times = np.arange(n, dtype=np.int64) * 3_600_000
        eng = ns.ENGINES["btc-eth-rsi-pullback"]
        ind = eng.indicators(
            open_, high, low, close,
            {"rsi_period": 14, "oversold": 30, "overbought": 70, "stop_atr": 1.5, "allow_shorts": True},
            volume=volume,
        )
        self.assertTrue(bool(ind["long"].any()), "expected at least one long reclaim above EMA 200")
        # Below EMA 200 path: force price under a flat EMA region with RSI reject.
        close2 = np.linspace(120, 90, n)
        close2[230:238] = np.linspace(92, 102, 8)
        close2[238:245] = np.linspace(101.5, 95, 7)
        open2 = np.r_[close2[0], close2[:-1]]
        high2 = np.maximum(open2, close2) + 0.3
        low2 = np.minimum(open2, close2) - 0.3
        ind_s = eng.indicators(
            open2, high2, low2, close2,
            {"rsi_period": 14, "oversold": 30, "overbought": 70, "allow_shorts": True},
            volume=volume,
        )
        self.assertTrue(bool(ind_s["short"].any()), "expected at least one short reject below EMA 200")
        blocked = eng.indicators(
            open2, high2, low2, close2,
            {"rsi_period": 14, "allow_shorts": False},
            volume=volume,
        )
        self.assertFalse(bool(blocked["short"].any()))

        # Target is 2R off ATR stop.
        long_i = int(np.flatnonzero(ind["long"])[0])
        res = eng.simulate(
            times, open_, high, low, close, volume=volume, capital=1000,
            start_index=max(220, long_i - 5),
            params={"rsi_period": 14, "oversold": 30, "stop_atr": 1.5, "target_r": 2, "allow_shorts": True},
        )
        self.assertTrue(res["trades"] or res["open_position"])
        trade = res["trades"][0] if res["trades"] else None
        if trade and trade["target"]:
            dist = abs(trade["entry_price"] - trade["stop_loss"])
            self.assertGreater(dist, 0)
            self.assertAlmostEqual(abs(trade["target"] - trade["entry_price"]) / dist, 2.0, delta=0.2)

    def test_macd_scalp_percent_stop_target_and_size(self):
        """MACD1.py: same MACD cross, stop/target % of the signal close, 9% of equity per trade."""
        times, o, h, l, c, v = _series(400, seed=5)
        eng = ns.ENGINES["macd-scalp"]
        _, _, p = ns.settings("macd-scalp", {"capital": 1000})
        ind = eng.indicators(o, h, l, c, p)
        plain = ns.ENGINES["macd"].indicators(o, h, l, c, {})
        np.testing.assert_array_equal(ind["long"], plain["long"])
        np.testing.assert_array_equal(ind["short"], plain["short"])

        res = eng.simulate(times, o, h, l, c, volume=v, params=p, capital=1000, start_index=40, bar_hours=1.0)
        trades = res["trades"]
        self.assertGreater(len(trades), 5)
        for t in trades:
            k = int(np.searchsorted(times, t["entry_time"])) - 1
            d = 1 if t["side"] == "buy" else -1
            self.assertAlmostEqual(t["stop_loss"], c[k] * (1 - d * 0.0005), places=5)
            self.assertAlmostEqual(t["target"], c[k] * (1 + d * 0.002), places=5)
        first = trades[0]
        self.assertAlmostEqual(first["quantity"] * first["entry_price"], 1000 * 0.09, places=3)

    def test_macd_scalp_opposite_cross_reverses(self):
        times, o, h, l, c, v = _series(400, seed=5)
        _, _, p = ns.settings("macd-scalp", {"capital": 1000, "stop_pct": 10, "target_pct": 0})
        trades = ns.ENGINES["macd-scalp"].simulate(times, o, h, l, c, params=p, capital=1000,
                                                    start_index=40, bar_hours=1.0)["trades"]
        self.assertIsNone(trades[0]["target"])
        flips = [(a, b) for a, b in zip(trades, trades[1:]) if a["status"] == "SIGNAL_EXIT"]
        self.assertGreater(len(flips), 3)
        for a, b in flips:
            # Old trade closes on the next open and the other side opens on that same open.
            self.assertEqual(a["exit_time"], b["entry_time"])
            self.assertNotEqual(a["side"], b["side"])

    def test_macd_scalp_settings(self):
        _, _, p = ns.settings("macd-scalp", {"capital": 1000})
        self.assertEqual((p["tp1_r"], p["tp1_frac"]), (0.0, 1.0))  # bot exits the whole trade at the % target
        _, _, no_target = ns.settings("macd-scalp", {"capital": 1000, "target_pct": 0})
        self.assertEqual(no_target["tp1_frac"], 0.0)
        for bad in ({"stop_pct": 0}, {"stop_pct": 11}, {"target_pct": 25}, {"size_pct": 0.5}, {"size_pct": 400}):
            with self.assertRaises(ValueError):
                ns.settings("macd-scalp", {"capital": 1000, **bad})
        # Other engines ignore the percent keys.
        _, _, plain = ns.settings("macd", {"capital": 1000, "stop_pct": 0.05, "size_pct": 9})
        self.assertNotIn("stop_pct", plain)
        self.assertNotIn("size_pct", plain)

    def test_donchian_does_not_short(self):
        data = _series(400, seed=1)
        res = ns.ENGINES["donchian-breakout-20k"].simulate(
            *data[:5], volume=data[5], capital=1000, start_index=220,
        )
        self.assertTrue(all(t["side"] == "buy" for t in res["trades"]))

    def test_mean_reversion_target_is_the_mean_not_a_point_offset(self):
        n = 260
        close = np.linspace(80, 120, n)
        close[230:240] = np.linspace(118, 108, 10)
        open_ = np.r_[close[0], close[:-1]]
        high = np.maximum(open_, close) + 0.4
        low = np.minimum(open_, close) - 0.4
        volume = np.full(n, 10.0)
        volume[239] = 80
        times = np.arange(n, dtype=np.int64) * 900_000
        res = ns.ENGINES["rsi-reversion-3k"].simulate(
            times, open_, high, low, close, volume=volume, capital=1000, start_index=210,
        )
        self.assertTrue(res["trades"] or res["open_position"])
        held = res["trades"][0] if res["trades"] else None
        if held and held["target"]:
            self.assertGreater(held["target"], held["stop_loss"])
            self.assertLess(abs(held["target"] - held["entry_price"]), 15)


class DemoWalletTests(unittest.TestCase):
    def test_fill_pnl_respects_long_and_short(self):
        import bot_worker as bw
        self.assertAlmostEqual(bw._fill_pnl("long", 100, 2, 110), 20)
        self.assertAlmostEqual(bw._fill_pnl("short", 100, 2, 90), 20)
        self.assertAlmostEqual(bw._fill_pnl("buy", 100, 1, None, stop=95), -5)

    def test_settle_demo_wallet_credits_on_full_close(self):
        import bot_worker as bw
        bot = {"capital": 2000, "equity": 2000, "params": {}}
        prev = {"entry_price": 100, "quantity": 1, "side": "long", "stop_loss": 95}
        state = {"trade_state": "closed", "entry_price": 100, "quantity": 1, "side": "long", "stop_loss": 95}
        events = ["Stop hit — 1 band kiya @ ~108"]
        params, out_events, patch = bw.settle_demo_wallet(bot, "open", prev, state, events, {})
        self.assertIn("equity", patch)
        self.assertAlmostEqual(patch["equity"], 2008)
        self.assertTrue(any("Demo wallet" in str(e) for e in out_events))
        self.assertAlmostEqual(params["_risk"]["day_pnl"], 8)

    def test_settle_demo_wallet_partial_tp1(self):
        import bot_worker as bw
        bot = {"capital": 1000, "equity": 1000, "params": {}}
        prev = {"entry_price": 50, "quantity": 4, "side": "long", "stop_loss": 45}
        state = {"trade_state": "open", "entry_price": 50, "quantity": 2, "side": "long", "stop_loss": 45}
        events = ["Pehla profit: 2 @ ~55 book"]
        _, _, patch = bw.settle_demo_wallet(bot, "open", prev, state, events, {})
        self.assertAlmostEqual(patch["equity"], 1010)


class AccountGuardTests(unittest.TestCase):
    def test_kill_switch_blocks_entries(self):
        blocked, msg = account_guard.entry_block({"kill_switch": True}, [], "2026-11-12")
        self.assertTrue(blocked)
        self.assertIn("Kill switch", msg)

    def test_open_position_cap(self):
        bots = [{"trade_state": "open", "capital": 1000}] * 2
        blocked, _ = account_guard.entry_block({"max_open_positions": 2}, bots, "2026-11-12")
        self.assertTrue(blocked)
        clear, _ = account_guard.entry_block({"max_open_positions": 3}, bots, "2026-11-12")
        self.assertFalse(clear)

    def test_daily_loss_and_exposure(self):
        bots = [{
            "trade_state": "open",
            "capital": 1000,
            "quantity": 2,
            "entry_price": 1000,
            "params": {"_risk": {"day": "2026-11-12", "day_pnl": -60}},
        }]
        loss, _ = account_guard.entry_block({"max_daily_loss_pct": 5, "max_exposure_pct": 500}, bots, "2026-11-12")
        self.assertTrue(loss)
        small = [{
            "trade_state": "open",
            "capital": 1000,
            "quantity": 3,
            "entry_price": 1000,
            "params": {"_risk": {"day": "2026-11-12", "day_pnl": -1}},
        }]
        exposed, msg = account_guard.entry_block({"max_daily_loss_pct": 5, "max_exposure_pct": 200}, small, "2026-11-12")
        self.assertTrue(exposed)
        self.assertIn("exposure", msg)


if __name__ == "__main__":
    unittest.main()
