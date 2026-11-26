"""
Account-level safety for server bots.

Per-bot daily loss still lives on the bot. This layer sits above it:
kill switch, one-shot flatten, max open positions, account daily loss, gross exposure.
New entries pause. Open positions stay managed unless flatten is requested.

Telegram fires when TELEGRAM_BOT_TOKEN is set and the user saved a chat id
(or TELEGRAM_CHAT_ID is set for the whole server). Email fires when SMTP is
configured and the account has an email. Neither is required for the switch itself.
"""
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULTS = {
    "kill_switch": False,
    "flatten": False,
    "max_daily_loss_pct": 5.0,
    "max_open_positions": 5,
    "max_exposure_pct": 200.0,
    "telegram_chat_id": "",
    "alerts": [],
}

_cache = {}
_flatten_ok = {}


def begin_tick():
    _cache.clear()
    _flatten_ok.clear()


def finish_tick():
    """Clear flatten only when every open bot for that user actually closed."""
    from django_orm import list_strategy_bots

    for user_id, ok in list(_flatten_ok.items()):
        if not ok:
            continue
        still_open = any(
            b.get("trade_state") in ("open", "entering")
            for b in list_strategy_bots(user_id, include_stopped=False)
        )
        if still_open:
            continue
        _save_fields(user_id, flatten=False)
        push_alert(user_id, "Flatten finished — open bot positions are closed. New entries stay paused while the kill switch is on.")
    _flatten_ok.clear()


def flatten_requested(user_id):
    return bool(_guard(user_id).get("flatten"))


def note_flatten(user_id, ok):
    prev = _flatten_ok.get(user_id, True)
    _flatten_ok[user_id] = prev and bool(ok)


def entry_block(guard, bots, today):
    """Pure check. Returns (blocked, message)."""
    g = {**DEFAULTS, **(guard or {})}
    if g.get("kill_switch"):
        return True, "Kill switch is on — new entries are paused"
    max_pos = int(g.get("max_open_positions") or 0)
    open_n = sum(1 for b in bots if b.get("trade_state") == "open")
    if max_pos and open_n >= max_pos:
        return True, f"Account limit: {open_n} open positions (max {max_pos})"
    capital = sum(float(b.get("capital") or 0) for b in bots)
    day_pnl = 0.0
    exposure = 0.0
    for b in bots:
        risk = ((b.get("params") or {}).get("_risk") or {})
        if risk.get("day") == today:
            day_pnl += float(risk.get("day_pnl") or 0)
        if b.get("trade_state") == "open" and b.get("quantity") and b.get("entry_price"):
            exposure += abs(float(b["quantity"]) * float(b["entry_price"]))
    max_daily = float(g.get("max_daily_loss_pct") or 0)
    if capital > 0 and max_daily and day_pnl <= -(capital * max_daily / 100.0):
        return True, f"Account daily loss limit {max_daily:g}% hit (day P&L ${day_pnl:.2f})"
    max_exp = float(g.get("max_exposure_pct") or 0)
    if capital > 0 and max_exp and exposure > capital * max_exp / 100.0:
        return True, f"Account exposure limit {max_exp:g}% hit"
    return False, ""


def decide_entries(user_id):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    blocked, msg = entry_block(_guard(user_id), _bots(user_id), today)
    if blocked and msg:
        push_alert(user_id, msg)
    return blocked, msg


def view(user_id):
    g = _guard(user_id)
    return {
        "kill_switch": bool(g.get("kill_switch")),
        "flatten": bool(g.get("flatten")),
        "max_daily_loss_pct": float(g.get("max_daily_loss_pct") or DEFAULTS["max_daily_loss_pct"]),
        "max_open_positions": int(g.get("max_open_positions") or DEFAULTS["max_open_positions"]),
        "max_exposure_pct": float(g.get("max_exposure_pct") or DEFAULTS["max_exposure_pct"]),
        "telegram_chat_id": g.get("telegram_chat_id") or "",
        "telegram_configured": bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip()),
        "email_configured": bool(os.getenv("SMTP_HOST", "").strip()),
        "alerts": list(g.get("alerts") or [])[-20:],
    }


def update(user_id, fields):
    clean = {}
    if "kill_switch" in fields:
        clean["kill_switch"] = bool(fields["kill_switch"])
    if "flatten" in fields:
        clean["flatten"] = bool(fields["flatten"])
    if "max_daily_loss_pct" in fields:
        value = float(fields["max_daily_loss_pct"])
        if not (0.1 <= value <= 50):
            raise ValueError("max_daily_loss_pct must be between 0.1 and 50.")
        clean["max_daily_loss_pct"] = value
    if "max_open_positions" in fields:
        value = int(fields["max_open_positions"])
        if not (1 <= value <= 20):
            raise ValueError("max_open_positions must be between 1 and 20.")
        clean["max_open_positions"] = value
    if "max_exposure_pct" in fields:
        value = float(fields["max_exposure_pct"])
        if not (10 <= value <= 500):
            raise ValueError("max_exposure_pct must be between 10 and 500.")
        clean["max_exposure_pct"] = value
    if "telegram_chat_id" in fields:
        chat = str(fields["telegram_chat_id"] or "").strip()
        if chat and not chat.lstrip("-").isdigit():
            raise ValueError("Telegram chat id must be a number.")
        clean["telegram_chat_id"] = chat[:32]
    if not clean:
        return view(user_id)
    _save_fields(user_id, **clean)
    if clean.get("kill_switch"):
        push_alert(user_id, "Kill switch turned on — bots will not open new trades.")
    if clean.get("flatten"):
        push_alert(user_id, "Flatten requested — the worker will close open bot positions.")
    return view(user_id)


def push_alert(user_id, text):
    text = str(text or "").strip()
    if not text:
        return
    g = _guard(user_id)
    alerts = list(g.get("alerts") or [])
    if alerts and alerts[-1].get("text") == text:
        return
    alerts.append({"at": datetime.now(timezone.utc).isoformat(), "text": text[:400]})
    alerts = alerts[-40:]
    _save_fields(user_id, alerts=alerts)
    _deliver(user_id, g, text)


def _deliver(user_id, guard, text):
    chat = (guard.get("telegram_chat_id") or os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if token and chat:
        try:
            body = json.dumps({"chat_id": chat, "text": f"Strateo: {text}"}).encode()
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{token}/sendMessage",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5).read()
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", os.getenv("SMTP_USERNAME", "")).strip()
    if not host or not sender:
        return
    try:
        from django_orm import get_user_account_by_id
        user = get_user_account_by_id(user_id) or {}
        to = (user.get("email") or "").strip()
        if not to:
            return
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["Subject"] = "Strateo alert"
        msg["From"] = sender
        msg["To"] = to
        msg.set_content(text)
        port = int(os.getenv("SMTP_PORT", "587"))
        user_name = os.getenv("SMTP_USERNAME", "").strip()
        password = os.getenv("SMTP_PASSWORD", "")
        if os.getenv("SMTP_USE_TLS", "true").lower() == "true":
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls(context=ssl.create_default_context())
                if user_name:
                    server.login(user_name, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context()) as server:
                if user_name:
                    server.login(user_name, password)
                server.send_message(msg)
    except Exception:
        return


def _guard(user_id):
    if user_id in _cache:
        return _cache[user_id]
    from django_orm import _ensure_django
    _ensure_django()
    from django_orm.models import AccountGuard
    row = AccountGuard.objects.filter(user_id=user_id).first()
    if row is None:
        data = dict(DEFAULTS)
    else:
        data = {
            "kill_switch": bool(row.kill_switch),
            "flatten": bool(row.flatten),
            "max_daily_loss_pct": float(row.max_daily_loss_pct),
            "max_open_positions": int(row.max_open_positions),
            "max_exposure_pct": float(row.max_exposure_pct),
            "telegram_chat_id": row.telegram_chat_id or "",
            "alerts": list(row.alerts or []),
        }
    _cache[user_id] = data
    return data


def _bots(user_id):
    from django_orm import list_strategy_bots
    return list_strategy_bots(user_id, include_stopped=False)


def _save_fields(user_id, **fields):
    from django_orm import _ensure_django
    _ensure_django()
    from django_orm.models import AccountGuard
    row, _created = AccountGuard.objects.get_or_create(user_id=user_id)
    for key, value in fields.items():
        setattr(row, key, value)
    row.save()
    _cache.pop(user_id, None)
