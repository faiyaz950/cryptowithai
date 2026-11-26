"""
Server bot ka paper order demo wallet se naapa jaata hai, desk ke $10k paper cash se nahi.

Pehle $100k wale bot ka ~$30k order "Insufficient paper balance ... available $10,176" se reject
hota tha (bot size wallet se nikalta tha, check paper account se hota tha).
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import backend_api as api  # noqa: E402


def _filled(side, qty, price, symbol="BTCUSD"):
    return {
        "order_id": f"o-{side}-{qty}",
        "symbol": symbol,
        "side": side,
        "order_type": "market",
        "quantity": qty,
        "price": price,
        "status": "filled",
        "timestamp": "2026-11-26T10:00:00",
    }


class BotPaperWalletTest(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.object(api, "_paper_fx", lambda symbol: 1.0),
            mock.patch.object(api, "_spot_meta", lambda key: None),
            mock.patch.object(api, "_paper_prices_for", lambda symbols: {}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_desk_order_still_limited_by_paper_cash(self):
        # ~$30k order, desk paper account has $10k.
        reason = api._paper_fill_check([], "BTCUSD", "sell", 0.5, 60_000.0)
        self.assertIsNotNone(reason)
        self.assertIn("Insufficient paper balance", reason)

    def test_bot_order_uses_demo_wallet(self):
        reason = api._paper_fill_check([], "BTCUSD", "sell", 0.5, 60_000.0, buying_power=100_000.0)
        self.assertIsNone(reason)

    def test_bot_order_bigger_than_wallet_is_rejected(self):
        reason = api._paper_fill_check([], "BTCUSD", "sell", 2.0, 60_000.0, buying_power=100_000.0)
        self.assertIsNotNone(reason)
        self.assertIn("Insufficient demo wallet", reason)

    def test_existing_same_side_position_uses_up_wallet(self):
        orders = [_filled("sell", 1.0, 60_000.0)]
        # $60k already short; $50k more would exceed the $100k wallet.
        reason = api._paper_fill_check(orders, "BTCUSD", "sell", 0.9, 60_000.0, buying_power=100_000.0)
        self.assertIsNotNone(reason)

    def test_closing_order_needs_no_wallet(self):
        orders = [_filled("sell", 1.0, 60_000.0)]
        reason = api._paper_fill_check(orders, "BTCUSD", "buy", 1.0, 60_000.0, buying_power=1.0)
        self.assertIsNone(reason)

    def test_http_body_cannot_set_buying_power(self):
        # buying_power is a python-only argument; the request body key is ignored.
        with mock.patch.object(api, "_paper_fill_check", return_value="blocked") as check:
            with mock.patch.object(api, "_paper_price", return_value=60_000.0), \
                 mock.patch.object(api, "_settle_paper_limits", return_value=[]):
                with self.assertRaises(api.PaperOrderRejected):
                    api.place_paper_order(
                        1,
                        {"symbol": "BTCUSD", "side": "sell", "quantity": 0.5, "buying_power": 10**9},
                    )
        self.assertIsNone(check.call_args.kwargs.get("buying_power"))


if __name__ == "__main__":
    unittest.main()
