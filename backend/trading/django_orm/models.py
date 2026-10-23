from django.db import models
from django.utils import timezone


class AppLogin(models.Model):
    username = models.CharField(max_length=128)
    password = models.TextField()
    login_type = models.CharField(max_length=32, db_index=True)
    ip_address = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "app_logins"
        ordering = ["-created_at"]


class BrokerLogin(models.Model):
    broker = models.CharField(max_length=64, db_index=True)
    api_key = models.TextField()
    secret_key = models.TextField()
    ip_address = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "broker_logins"
        ordering = ["-created_at"]


class DemoOrder(models.Model):
    # Pehle demo orders kisi user se jude nahi the, isliye `/api/orders` sabko
    # sabke orders dikha deta tha. Purani rows ke liye null allowed hai.
    user = models.ForeignKey(
        "UserAccount",
        on_delete=models.CASCADE,
        related_name="demo_orders",
        null=True,
        blank=True,
        db_index=True,
    )
    order_id = models.CharField(max_length=64, unique=True)
    symbol = models.CharField(max_length=32)
    side = models.CharField(max_length=16)
    order_type = models.CharField(max_length=16)
    quantity = models.DecimalField(max_digits=28, decimal_places=8)
    # Spot pairs (PEPE/USDT, ADA/BTC) ka bhaav 0.0000004 jaisa hota hai — 8 decimal par wo kat jaata.
    price = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    status = models.CharField(max_length=32)
    # Order ke saath diya Target/SL — fill hote hi position par lag jaata hai.
    stop_loss = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    take_profit = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "demo_orders"
        ordering = ["-created_at"]


class PaperBracket(models.Model):
    """Khuli paper position ka Target/SL. Ek symbol par ek position, isliye ek hi row."""

    user = models.ForeignKey("UserAccount", on_delete=models.CASCADE, related_name="paper_brackets")
    symbol = models.CharField(max_length=32)
    stop_loss = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    take_profit = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "paper_brackets"
        constraints = [
            models.UniqueConstraint(fields=["user", "symbol"], name="uniq_paper_bracket"),
        ]


class StrategyBot(models.Model):
    """
    Server par chalne wala strategy bot (abhi sirf Trend Rider). Browser band ho tab bhi
    worker (`bot_worker.py`) har band candle par strategy ki position ko account se milata hai.

    Trade ki pehchaan `entry_time` hai (entry candle ka open, ms). Ek entry_time par order
    ek hi baar lagta hai, worker chahe kitni baar chale — isi se reconcile idempotent hai.
    """

    user = models.ForeignKey("UserAccount", on_delete=models.CASCADE, related_name="strategy_bots")
    strategy = models.CharField(max_length=32, default="trend-rider")
    symbol = models.CharField(max_length=32)
    timeframe = models.CharField(max_length=8, default="4h")
    capital = models.DecimalField(max_digits=18, decimal_places=2)
    risk_pct = models.DecimalField(max_digits=6, decimal_places=3)
    # channel, exit_channel, stop_atr, allow_shorts — backtest wale hi naam.
    params = models.JSONField(default=dict)
    # Live tabhi jab user ne is bot ke liye khud chuna ho — aur server ka LIVE_ORDERS_ENABLED bhi on ho.
    mode = models.CharField(max_length=8, default="paper")
    exchange_account_id = models.BigIntegerField(null=True, blank=True)
    # running | paused (naya trade nahi, chalu trade manage hota hai) | stopped
    status = models.CharField(max_length=16, default="running", db_index=True)
    # Strategy ka replay yahin se shuru hota hai — backtest ka "same period" yahi hai.
    started_at = models.DateTimeField()

    # ── Abhi wala trade (reconcile state) ──
    entry_time = models.BigIntegerField(null=True, blank=True)
    # "" | entering | open | closed | skipped
    trade_state = models.CharField(max_length=16, blank=True, default="")
    side = models.CharField(max_length=8, blank=True, default="")
    quantity = models.DecimalField(max_digits=28, decimal_places=10, null=True, blank=True)
    entry_price = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    stop_loss = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    # Live mode mein exchange par pada stop order.
    stop_order_id = models.CharField(max_length=64, blank=True, default="")
    # Steady: pehle profit ka level aur kya wo hissa book ho chuka (har nayi entry par reset).
    tp1_price = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    tp1_done = models.BooleanField(default=False)

    # Aakhri band candle (open time, ms) jiske baad poora reconcile chala.
    last_bar_time = models.BigIntegerField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    # [{at, text}] — sabse naya aakhir mein, chhota rakha jaata hai.
    events = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "strategy_bots"
        ordering = ["-created_at"]


class UserAccount(models.Model):
    username = models.CharField(max_length=32, unique=True, db_index=True)
    password_hash = models.TextField()
    full_name = models.CharField(max_length=50, blank=True, default="")
    email = models.CharField(max_length=180, blank=True, default="")
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # TradingView alert isi token wale URL par aata hai — token hi uski
    # pehchan hai, isliye ise password jaisa hi samjha jaata hai.
    tv_token = models.CharField(max_length=64, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_accounts"


class UserSession(models.Model):
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name="sessions")
    token = models.CharField(max_length=96, unique=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    ip_address = models.CharField(max_length=64, blank=True, default="")
    user_agent = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_sessions"
        ordering = ["-created_at"]


class ExchangeAccount(models.Model):
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name="exchange_accounts")
    exchange = models.CharField(max_length=32, db_index=True)
    api_key_encrypted = models.TextField()
    secret_key_encrypted = models.TextField()
    api_key_fingerprint = models.CharField(max_length=128, db_index=True)
    label = models.CharField(max_length=64, default="Primary")
    key_hint = models.CharField(max_length=32, blank=True, default="")
    is_active = models.BooleanField(default=True)
    can_trade = models.BooleanField(default=False)
    can_withdraw = models.BooleanField(default=False)
    permissions_verified = models.BooleanField(default=False)
    # Live trading har account par band paida hota hai. Key jud jaane ka
    # matlab ye nahi ki desk uske paise se order laga sakta hai — wo alag,
    # soch-samajh kar diya gaya permission hai.
    live_trading_enabled = models.BooleanField(default=False)
    # Ek order ki upper limit (quote currency mein). Khaali = sirf server ki
    # apni default limit lagti hai.
    max_order_notional = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    last_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exchange_accounts"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["exchange", "api_key_fingerprint"],
                name="uniq_exchange_fingerprint",
            )
        ]


class ByokOrder(models.Model):
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name="byok_orders")
    exchange_account_id = models.BigIntegerField(db_index=True)
    order_id = models.CharField(max_length=128, db_index=True)
    symbol = models.CharField(max_length=32)
    side = models.CharField(max_length=8)
    order_type = models.CharField(max_length=16)
    quantity = models.DecimalField(max_digits=28, decimal_places=8)
    price = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    status = models.CharField(max_length=32)
    # Order kahan se aaya: desk, tradingview, ya api. Baad mein "ye trade
    # kisne lagaya" ka jawab isi se milta hai.
    source = models.CharField(max_length=24, default="manual", db_index=True)
    exchange_response = models.TextField(blank=True, default="")
    created_at = models.DateTimeField()

    class Meta:
        db_table = "byok_orders"
        ordering = ["-created_at"]


class EmailChangeOtp(models.Model):
    user = models.ForeignKey(UserAccount, on_delete=models.CASCADE, related_name="email_otps")
    new_email = models.CharField(max_length=180, db_index=True)
    otp_code = models.CharField(max_length=8)
    expires_at = models.DateTimeField(db_index=True)
    consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_change_otps"
        ordering = ["-created_at"]
