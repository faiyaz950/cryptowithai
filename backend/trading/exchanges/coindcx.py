"""
CoinDCX adapter.

Signing (docs se, "Authentication"):
    body      = {... , "timestamp": <ms>}  -> compact JSON
    signature = HMAC_SHA256(body_json, secret) -> hex
    headers   = X-AUTH-APIKEY, X-AUTH-SIGNATURE, Content-Type: application/json

Dhyan: **saari** authenticated calls POST hain, aur signature usi exact JSON
string par banta hai jo bheji jaati hai — isliye body ek hi baar serialize
karke wahi string dono jagah use hoti hai. Dobara dump karne par separators
badal jaate aur signature fail ho jaata.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

import requests

from .base import ExchangeAdapter, fnum
from .market import coindcx_spot_markets, coindcx_spot_price, split_spot_key

# json.dumps 0.00001 ko "1e-05" likhta hai — exchange quantity mein ye nahi leta.
_SCI_NUMBER = re.compile(r'(?<=[:\[,])(-?\d+(?:\.\d+)?[eE]-?\d+)(?=[,\]}])')

BASE_URL = "https://api.coindcx.com"
TIMEOUT = 15
# Positions/orders paginated hain; desk ko sirf khuli cheezein dikhani hain.
PAGE_SIZE = "50"
MARGIN_CURRENCIES = ["INR", "USDT"]


class CoinDCXAdapter(ExchangeAdapter):
    id = "coindcx"
    name = "CoinDCX"
    region = "India"
    tagline = "INR + USDT futures · spot"
    key_url = "https://coindcx.com/api-dashboard"

    def _post(self, path: str, body: Optional[Dict[str, Any]] = None):
        payload = dict(body or {})
        payload["timestamp"] = int(time.time() * 1000)
        json_body = json.dumps(payload, separators=(",", ":"))
        json_body = _SCI_NUMBER.sub(lambda m: format(Decimal(m.group(1)), "f"), json_body)
        signature = hmac.new(
            self.secret_key.encode("utf-8"), json_body.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        try:
            res = requests.post(
                f"{BASE_URL}{path}",
                data=json_body,
                timeout=TIMEOUT,
                headers={
                    "Content-Type": "application/json",
                    "X-AUTH-APIKEY": self.api_key,
                    "X-AUTH-SIGNATURE": signature,
                },
            )
        except Exception as exc:
            return self.fail("network", str(exc))

        if res.status_code == 200:
            try:
                self.clear_error()
                return res.json()
            except Exception:
                return self.fail(None, res.text)

        # CoinDCX reason ko HTTP code + message se batata hai.
        text = (res.text or "")[:400]
        lowered = text.lower()
        if res.status_code == 401:
            if "signature" in lowered:
                reason = "signature_mismatch"
            elif "expire" in lowered or "timestamp" in lowered:
                reason = "expired_signature"
            else:
                reason = "invalid_api_key"
        elif res.status_code == 403:
            reason = "ip_not_whitelisted" if "ip" in lowered else "unauthorized"
        elif res.status_code == 429:
            reason = "rate_limited"
        else:
            reason = None
            # Order ki galti (balance kam, price range ke bahar) JSON ke
            # "message" mein aati hai — wahi user ko dikhana kaam ka hai.
            try:
                msg = (res.json() or {}).get("message")
            except Exception:
                msg = None
            if msg:
                text = f"CoinDCX: {msg}"
        return self.fail(reason, text)

    # ── interface ──────────────────────────────────────────

    def verify(self) -> Dict[str, Any]:
        """
        Balances hi sabse seedha private call hai. CoinDCX key ki permissions
        API se nahi milti, isliye trading ko "verified" nahi kehte — wahi
        rawaiya jo Delta par hai.
        """
        data = self._post("/exchange/v1/users/balances")
        if data is None:
            return {
                "success": False,
                "can_trade": False,
                "can_withdraw": False,
                "permissions_verified": False,
                "reason": self.last_reason,
                "client_ip": self.last_client_ip,
                "error": self.error_message(),
            }
        return {
            "success": True,
            "can_trade": True,
            "can_withdraw": False,
            "permissions_verified": True,
        }

    def balances(self) -> Optional[List[Dict[str, Any]]]:
        data = self._post("/exchange/v1/users/balances")
        if data is None:
            return None
        out = []
        for r in data if isinstance(data, list) else []:
            if not isinstance(r, dict):
                continue
            balance = fnum(r.get("balance"))
            locked = fnum(r.get("locked_balance"))
            # CoinDCX "balance" free amount hai aur locked alag; desk total
            # aur available dono dikhata hai.
            row = self.balance_row(r.get("currency"), balance + locked, balance)
            if row:
                out.append(row)
        return out

    def positions(self) -> Optional[List[Dict[str, Any]]]:
        data = self._post("/exchange/v1/derivatives/futures/positions", {
            "page": "1",
            "size": PAGE_SIZE,
            "margin_currency_short_name": MARGIN_CURRENCIES,
        })
        if data is None:
            return None
        out = []
        for p in data if isinstance(data, list) else []:
            if not isinstance(p, dict):
                continue
            size = fnum(p.get("active_pos"))
            if not size:
                continue
            out.append(self.position_row(
                # "B-ETH_USDT" -> "ETH_USDT"; prefix contract type hai, symbol nahi.
                symbol=str(p.get("pair") or "").split("-", 1)[-1],
                side="long" if size > 0 else "short",
                size=size,
                entry_price=p.get("avg_price"),
                mark_price=p.get("mark_price"),
                margin=p.get("locked_margin"),
                liquidation_price=p.get("liquidation_price"),
            ))
        return out

    def open_orders(self) -> Optional[List[Dict[str, Any]]]:
        data = self._post("/exchange/v1/derivatives/futures/orders", {
            "status": "open",
            "page": "1",
            "size": PAGE_SIZE,
            "margin_currency_short_name": MARGIN_CURRENCIES,
        })
        if data is None:
            return None
        out = []
        for o in data if isinstance(data, list) else []:
            if not isinstance(o, dict):
                continue
            out.append(self.order_row(
                id=o.get("id"),
                symbol=str(o.get("pair") or "").split("-", 1)[-1],
                side=o.get("side"),
                order_type=o.get("order_type"),
                size=o.get("total_quantity"),
                unfilled_size=o.get("remaining_quantity"),
                price=o.get("price"),
                state=o.get("status"),
                created_at=o.get("created_at"),
            ))
        return out

    # ── spot orders ────────────────────────────────────────
    #
    # Desk se CoinDCX par sirf spot order lagta hai ("BTCINR@coindcx-spot").
    # Futures symbol yahan aaye to contract_info None deta hai aur order
    # wahin ruk jaata hai — warna "BTCUSDT" perp ka order galti se spot par
    # chala jaata.

    @staticmethod
    def _spot(symbol: str) -> Optional[Dict[str, Any]]:
        sym, spot = split_spot_key(symbol)
        meta = coindcx_spot_markets().get(sym) if spot else None
        return {**meta, "market": sym} if meta else None

    def contract_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        meta = self._spot(symbol)
        if not meta:
            return None
        return {
            "contract_value": 1.0,
            "unit": meta["base"],
            "tick_size": 10 ** -meta.get("price_precision", 0),
            "spot": True,
            "meta": meta,
        }

    def mark_price(self, symbol: str) -> Optional[float]:
        meta = self._spot(symbol)
        return coindcx_spot_price(meta["market"]) if meta else None

    def place_order(self, **kw) -> Optional[Dict[str, Any]]:
        meta = self._spot(kw.get("symbol") or "")
        if not meta:
            return self.fail("order_not_supported")
        order_type = str(kw.get("order_type") or "limit").lower()
        qty = round(float(kw.get("contracts") or 0), int(meta.get("qty_precision") or 0))
        body: Dict[str, Any] = {
            "side": str(kw.get("side") or "").lower(),
            "order_type": f"{order_type}_order",
            "market": meta["market"],
            "total_quantity": qty,
        }
        if order_type == "limit":
            body["price_per_unit"] = round(float(kw.get("price") or 0), int(meta.get("price_precision") or 0))
        if kw.get("client_order_id"):
            body["client_order_id"] = str(kw["client_order_id"])[:36]
        data = self._post("/exchange/v1/orders/create", body)
        if data is None:
            return None
        rows = data.get("orders") if isinstance(data, dict) else None
        o = rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None
        if not o or not o.get("id"):
            return self.fail(None, json.dumps(data)[:400])
        return self.order_result(
            order_id=o.get("id"),
            symbol=meta["market"],
            side=o.get("side") or body["side"],
            order_type=order_type,
            size=o.get("total_quantity") or qty,
            price=o.get("price_per_unit") or o.get("avg_price"),
            state=o.get("status") or "open",
        )

    def cancel_order(self, order_id):
        data = self._post("/exchange/v1/orders/cancel", {"id": str(order_id)})
        if data is None:
            return None
        return {"order_id": str(order_id), "state": "cancelled"}

    def profile(self) -> Dict[str, Any]:
        data = self._post("/exchange/v1/users/info")
        rows = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
        info = rows[0] if rows and isinstance(rows[0], dict) else {}
        if not info:
            return {}
        name = " ".join(x for x in [info.get("first_name"), info.get("last_name")] if x).strip()
        return {
            "account_name": name,
            "exchange_email": (info.get("email") or "").lower(),
            "exchange_phone": info.get("mobile_number") or "",
            "exchange_username": info.get("coindcx_id") or "",
            "has_profile_data": True,
        }
