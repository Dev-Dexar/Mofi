from __future__ import annotations
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    SUPABASE_URL: str = Field(default="")
    SUPABASE_SERVICE_KEY: str = Field(default="")
    NOWPAYMENTS_API_KEY: str = Field(default="")
    NOWPAYMENTS_IPN_SECRET: str = Field(default="")
    # Payouts need a dashboard login (JWT) on top of the API key; 2FA secret lets payouts verify themselves.
    NOWPAYMENTS_EMAIL: str = Field(default="")
    NOWPAYMENTS_PASSWORD: str = Field(default="")
    NOWPAYMENTS_2FA_SECRET: str = Field(default="")
    # Use the NOWPayments sandbox (its own account and keys) instead of the live gateway. Development and testing only.
    NOWPAYMENTS_SANDBOX: bool = Field(default=False)
    APP_BASE_URL: str = Field(default="http://localhost:5173")
    # Public URL of THIS backend, used for gateway webhooks. Falls back to APP_BASE_URL (+ /api proxy).
    API_PUBLIC_URL: str = Field(default="")
    # Browser origins allowed to call the API (comma separated). APP_BASE_URL and the local dev server are always allowed.
    CORS_ORIGINS: str = Field(default="")
    # How much the server writes to its log: DEBUG (everything, for tracking a problem down), INFO (normal), WARNING or ERROR.
    LOG_LEVEL: str = Field(default="INFO")
    # The interactive /docs and /openapi.json pages. Off unless asked for: they map every endpoint for an attacker.
    ENABLE_DOCS: bool = Field(default=False)
    # Where rate-limit counters live. Empty = this process only. For several instances use Redis, e.g. redis://host:6379
    RATE_LIMIT_STORAGE_URI: str = Field(default="")
    # What NOWPayments charges to convert USDT into another coin (custody conversion), in percent, e.g. "0.5". It is not published in the
    # API and is set per account, so read it off the NOWPayments dashboard. Empty = withdrawals in BTC/ETH/GRAM/SOL are switched off
    # (USDT withdrawals need no conversion and are unaffected). Whatever it really is, the user gets what the conversion actually returned.
    WITHDRAW_CONVERSION_FEE_PCT: str = Field(default="")
    # Extra room, in percent, added on top of the live network-fee estimate, because the real fee is only fixed when the payout is processed.
    WITHDRAW_FEE_BUFFER_PCT: str = Field(default="10")
    # How far short of the quoted coin amount a conversion may come back, in percent, before the payout waits for a person instead of
    # sending less than the user was shown (a very volatile coin, or a conversion fee much higher than WITHDRAW_CONVERSION_FEE_PCT).
    WITHDRAW_MAX_SLIPPAGE_PCT: str = Field(default="3")
    # The coin deposits are settled in on NOWPayments (the "Primary balance" there). A deposit settled in anything else is logged loudly.
    SETTLEMENT_COIN: str = Field(default="usdtbsc")
    PORT: int = Field(default=8000)
    # Behind a reverse proxy the client IP is the first X-Forwarded-For entry. Leave off when the API is reached directly, or the header can be forged.
    TRUST_PROXY_HEADERS: bool = Field(default=False)

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]
        local = ["http://localhost:5173", "http://127.0.0.1:5173"]
        return list(dict.fromkeys([self.APP_BASE_URL.rstrip("/"), *local, *extra]))

    @property
    def webhook_url(self) -> str | None:
        """Where the gateway should call back, or None when that address could never be reached."""
        base = (self.API_PUBLIC_URL or self.APP_BASE_URL).rstrip("/")
        if any(h in base for h in ("localhost", "127.0.0.1", "0.0.0.0")):
            return None
        return f"{base}/api/webhook/nowpayments" if not self.API_PUBLIC_URL else f"{base}/webhook/nowpayments"

settings = Settings()
