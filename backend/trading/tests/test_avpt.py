"""AVPT engine smoke tests — no network."""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import avpt  # noqa: E402


def _bars(n=120, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.int64) * 4 * 3600_000
    # Mild trend + noise so pivots / pullbacks can form.
    base = 100 + np.linspace(0, 20, n) + np.sin(np.linspace(0, 18, n)) * 2.5
    noise = rng.normal(0, 0.4, n)
    c = base + noise
    o = np.concatenate([[c[0]], c[:-1]])
    h = np.maximum(o, c) + rng.uniform(0.2, 1.2, n)
    l = np.minimum(o, c) - rng.uniform(0.2, 1.2, n)
    v = rng.uniform(800, 2000, n)
    return t, o, h, l, c, v


class AvptSmokeTest(unittest.TestCase):
    def test_run_returns_seven_engines(self):
        t, o, h, l, c, v = _bars()
        r = avpt.run(o, h, l, c, v=v)
        self.assertEqual(len(r["engines"]), 7)
        self.assertEqual(len(r["long"]), len(c))
        self.assertIn(r["selected"], range(7))

    def test_simulate_shape(self):
        t, o, h, l, c, v = _bars(180)
        res = avpt.simulate(t, o, h, l, c, capital=1000, start_index=40, volume=v)
        self.assertIn("trades", res)
        self.assertIn("stats", res)
        self.assertIn("phenlabs", res)
        self.assertEqual(len(res["phenlabs"]["profiles"]), 7)
        self.assertGreaterEqual(res["stats"]["final_equity"], 0)

    def test_filter_mode_balanced(self):
        t, o, h, l, c, v = _bars(150)
        res = avpt.simulate(t, o, h, l, c, params={"filter_mode": "balanced"}, start_index=30, volume=v)
        self.assertEqual(res["phenlabs"]["profile_id"], 0)


if __name__ == "__main__":
    unittest.main()
