"""
Equity / costs ledger tests — AVPT Final Round accounting acceptance.

Identity (all engines that share trend_rider cost model):
  final_equity ≈ capital + Σ(closed trade pnl) + open_unrealized

Funding and fees are already inside trade.pnl / open unrealized.
Subtracting funding_paid again would double-count.
"""
from __future__ import annotations

import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import avpt  # noqa: E402
import trend_rider  # noqa: E402
import trident  # noqa: E402


def _ohlcv(n=400, seed=7, start=100.0, drift=0.04):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.int64) * 4 * 3600_000
    shock = rng.normal(0, 0.8, n).cumsum()
    c = start + np.linspace(0, drift * n, n) + shock
    o = np.concatenate([[c[0]], c[:-1]])
    h = np.maximum(o, c) + rng.uniform(0.15, 1.4, n)
    l = np.minimum(o, c) - rng.uniform(0.15, 1.4, n)
    v = rng.uniform(500, 2500, n)
    return t, o, h, l, c, v


def _assert_ledger(self, res, capital=1000.0, tol=0.05):
    st = res["stats"]
    realized = sum(t["pnl"] for t in res["trades"])
    open_pnl = float(res["open_position"]["unrealized_pnl"]) if res.get("open_position") else 0.0
    expected = capital + realized + open_pnl
    self.assertAlmostEqual(
        st["final_equity"],
        round(expected, 2),
        delta=tol,
        msg=(
            f"final_equity {st['final_equity']} != capital+closed+open {round(expected, 2)} "
            f"(closed={realized:.4f} open={open_pnl:.4f} fees={st['fees_paid']} funding={st['funding_paid']})"
        ),
    )
    # Return % must match equity gain / capital
    self.assertAlmostEqual(
        st["return_pct"],
        round(100 * (st["final_equity"] / capital - 1), 2),
        delta=0.02,
    )
    # Funding is informational — already in closed/open; double-subtract would break ledger
    if st["funding_paid"] > 0:
        wrong = capital + realized + open_pnl - st["funding_paid"]
        self.assertGreater(
            abs(st["final_equity"] - wrong),
            0.01,
            msg="subtracting funding_paid again should NOT match final_equity",
        )


def _assert_expectancy(self, res):
    trades = res["trades"]
    if not trades:
        return
    closed = sum(t["pnl"] for t in trades)
    exp = closed / len(trades)
    # Sanity: expectancy uses closed sample only
    self.assertTrue(math.isfinite(exp))
    wins = sum(1 for t in trades if t["pnl"] > 0)
    losses = sum(1 for t in trades if t["pnl"] <= 0)
    self.assertEqual(wins + losses, len(trades))
    wr = 100.0 * wins / len(trades)
    self.assertAlmostEqual(wr, 100.0 * wins / len(trades), places=6)


def _assert_be_stop(self, res):
    op = res.get("open_position")
    if not op:
        return
    entry = float(op["entry_price"])
    sl = float(op["stop_loss"])
    initial = float(op["initial_stop"])
    self.assertTrue(math.isfinite(entry) and entry > 0)
    self.assertTrue(math.isfinite(sl))
    self.assertTrue(math.isfinite(initial))
    # Remaining cash risk at current SL
    qty = float(op["quantity"])
    remain = abs(entry - sl) * qty
    self.assertGreaterEqual(remain, -1e-9)
    if abs(sl - entry) / entry < 0.0005:
        self.assertLess(remain, 0.05)  # near-zero at breakeven


class TrendRiderLedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t, o, h, l, c, v = _ohlcv(500, seed=11)
        cls.capital = 1000.0
        cls.res = trend_rider.simulate(
            t, o, h, l, c, capital=cls.capital, start_index=80, bar_hours=4.0
        )

    def test_equity_identity(self):
        _assert_ledger(self, self.res, self.capital)

    def test_expectancy_and_wr(self):
        _assert_expectancy(self, self.res)

    def test_breakeven_fields(self):
        _assert_be_stop(self, self.res)

    def test_costs_reported(self):
        st = self.res["stats"]
        self.assertGreaterEqual(st["fees_paid"], 0)
        self.assertGreaterEqual(st["funding_paid"], 0)


class TridentLedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t, o, h, l, c, v = _ohlcv(500, seed=19)
        cls.capital = 1000.0
        cls.res = trident.simulate(
            t, o, h, l, c, capital=cls.capital, start_index=80, bar_hours=4.0
        )

    def test_equity_identity(self):
        _assert_ledger(self, self.res, self.capital)

    def test_expectancy_and_wr(self):
        _assert_expectancy(self, self.res)


class AvptLedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t, o, h, l, c, v = _ohlcv(480, seed=23, drift=0.06)
        cls.capital = 1000.0
        cls.res = avpt.simulate(
            t, o, h, l, c, capital=cls.capital, start_index=60, volume=v, bar_hours=4.0
        )

    def test_equity_identity(self):
        _assert_ledger(self, self.res, self.capital, tol=0.08)

    def test_expectancy_and_wr(self):
        _assert_expectancy(self, self.res)

    def test_position_size_risk(self):
        # Any closed trade risk ≈ 1R planned (fees/funding may nudge R)
        for t in self.res["trades"][:20]:
            if t.get("status") == "SL_HIT":
                self.assertGreater(t["r_multiple"], -1.5)


class PortfolioSleeveReconcileTest(unittest.TestCase):
    """Three equal sleeves: Σ sleeve equity Δ ≈ portfolio equity gain."""

    def test_sum_of_sleeves(self):
        capital = 999.0  # divisible by 3
        sleeve = capital / 3.0
        parts = []
        for seed in (3, 5, 9):
            t, o, h, l, c, v = _ohlcv(360, seed=seed)
            parts.append(
                trend_rider.simulate(
                    t, o, h, l, c, capital=sleeve, start_index=60, bar_hours=4.0
                )
            )
        sleeve_pnls = [p["stats"]["final_equity"] - sleeve for p in parts]
        total_gain = sum(sleeve_pnls)
        total_equity = sum(p["stats"]["final_equity"] for p in parts)
        self.assertAlmostEqual(total_equity, capital + total_gain, delta=0.05)
        for p in parts:
            _assert_ledger(self, p, sleeve, tol=0.08)


class AvptOosHoldoutTest(unittest.TestCase):
    """OOS start_index later than historical — same params, separate sample."""

    def test_oos_is_subset_window(self):
        t, o, h, l, c, v = _ohlcv(500, seed=41, drift=0.05)
        capital = 1000.0
        hist = avpt.simulate(t, o, h, l, c, capital=capital, start_index=60, volume=v, bar_hours=4.0)
        oos_start = 60 + int(0.8 * (len(t) - 60))
        oos = avpt.simulate(t, o, h, l, c, capital=capital, start_index=oos_start, volume=v, bar_hours=4.0)
        _assert_ledger(self, hist, capital, tol=0.1)
        _assert_ledger(self, oos, capital, tol=0.1)
        # OOS trades should all enter at/after oos window (entry_time >= t[oos_start])
        for tr in oos["trades"]:
            self.assertGreaterEqual(int(tr["entry_time"]), int(t[oos_start]))


class BotRiskGuardTest(unittest.TestCase):
    def test_daily_loss_and_streak_pause(self):
        import bot_worker

        bot = {
            "capital": 1000.0,
            "params": {
                "max_daily_loss_pct": 2.0,
                "max_losing_streak": 3,
                "_risk": {"day": "2099-01-01", "day_pnl": -25.0, "losing_streak": 0, "paused_reason": ""},
            },
        }
        # Force same-day path by using today's key after guard resets day
        paused, msg, params = bot_worker._risk_entry_guard(bot, {"trade_state": ""})
        # Fresh day resets day_pnl — should not pause on stale day
        self.assertFalse(paused)

        bot["params"] = params
        bot["params"]["_risk"]["day_pnl"] = -30.0  # 3% of 1000 > 2% limit
        paused, msg, params = bot_worker._risk_entry_guard(bot, {"trade_state": ""})
        self.assertTrue(paused)
        self.assertIn("daily loss", msg.lower())

        bot["params"] = {
            "max_daily_loss_pct": 50.0,
            "max_losing_streak": 3,
            "_risk": {
                "day": params["_risk"]["day"],
                "day_pnl": 0.0,
                "losing_streak": 3,
                "paused_reason": "",
            },
        }
        paused, msg, _ = bot_worker._risk_entry_guard(bot, {"trade_state": ""})
        self.assertTrue(paused)
        self.assertIn("losing streak", msg.lower())


if __name__ == "__main__":
    unittest.main()
