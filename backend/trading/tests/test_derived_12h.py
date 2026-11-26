"""12h candles jo Delta khud nahi deta — teen 4h jod kar banti hain (Metals Rider inhi par chalta hai)."""
import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fetch_trading_data import aggregate_candles  # noqa: E402
from exchanges.market import MarketSource  # noqa: E402

H4 = 4 * 3_600_000
DAY0 = 1_767_225_600_000  # 2026-01-01 00:00 UTC


def four_hour_rows(start_ms, count):
    return [
        {"time": start_ms + i * H4, "open": 100 + i, "high": 110 + i, "low": 90 + i, "close": 101 + i, "volume": 1.0}
        for i in range(count)
    ]


class AggregateCandlesTest(unittest.TestCase):
    def test_joins_three_4h_into_utc_12h(self):
        rows = four_hour_rows(DAY0, 6)
        df = pd.DataFrame({
            "Open Time": pd.to_datetime([r["time"] for r in rows], unit="ms"),
            "Open": [r["open"] for r in rows], "High": [r["high"] for r in rows],
            "Low": [r["low"] for r in rows], "Close": [r["close"] for r in rows],
            "Volume": [r["volume"] for r in rows],
        })
        out = aggregate_candles(df.iloc[::-1], 720)  # order ulta ho tab bhi
        self.assertEqual(list(out["Open Time"].dt.hour), [0, 12])
        first = out.iloc[0]
        self.assertEqual((first.Open, first.High, first.Low, first.Close, first.Volume), (100, 112, 90, 103, 3.0))

    def test_drops_partial_oldest_bucket(self):
        rows = four_hour_rows(DAY0 + H4, 5)  # 04:00 se shuru — 00:00 wali bucket aadhi hai
        df = pd.DataFrame({
            "Open Time": pd.to_datetime([r["time"] for r in rows], unit="ms"),
            "Open": 1.0, "High": 2.0, "Low": 0.5, "Close": 1.5, "Volume": 1.0,
        })
        out = aggregate_candles(df, 720)
        self.assertEqual(len(out), 1)
        self.assertEqual(out["Open Time"].iloc[0], pd.Timestamp(DAY0 + 3 * H4, unit="ms"))

    def test_empty_passthrough(self):
        self.assertTrue(aggregate_candles(pd.DataFrame(), 720).empty)


class FakeSource(MarketSource):
    id = "fake"
    INTERVALS = {"4h": "4h"}
    DERIVED = {**MarketSource.DERIVED, "12h": "4h"}
    ROWS = four_hour_rows(DAY0, 12)

    @classmethod
    def candles(cls, ui_symbol, interval, limit, end_ms=None):
        rows = [r for r in cls.ROWS if end_ms is None or r["time"] <= end_ms]
        return rows[-limit:] or None


class DerivedChartTest(unittest.TestCase):
    def test_12h_listed_and_built_from_4h(self):
        self.assertIn("12h", FakeSource.intervals())
        out = FakeSource.fetch("PAXGUSDT", "12h", 10)
        self.assertEqual([c["time"] for c in out], [DAY0 + k * 3 * H4 for k in range(4)])
        self.assertEqual(out[0]["high"], 112)
        self.assertEqual(out[0]["close"], 103)


if __name__ == "__main__":
    unittest.main()
