from __future__ import annotations
import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from decimal import ROUND_DOWN, Decimal
from typing import Any
import httpx
from core.config import settings

logger = logging.getLogger("mofi.nowpayments")

NOWPAYMENTS_BASE_URL = "https://api.nowpayments.io/v1"
NOWPAYMENTS_SANDBOX_URL = "https://api-sandbox.nowpayments.io/v1"  # test payments, no real money (separate account and keys)

# The only coins we take and pay out, in the order they are shown. Everything else is refused.
# (code, symbol, name, network label)
SUPPORTED_COINS: list[tuple[str, str, str, str]] = [
    ("usdtbsc", "USDT", "Tether", "BEP-20 (BNB Chain)"),
    ("btc", "BTC", "Bitcoin", "Bitcoin"),
    ("eth", "ETH", "Ethereum", "Ethereum"),
    # Toncoin was renamed Gram (ticker GRAM) in June 2026; the code stays "ton" until the gateway says otherwise
    ("ton", "GRAM", "Gram", "TON"),
    ("sol", "SOL", "Solana", "Solana"),
]
SUPPORTED_CODES = {c[0] for c in SUPPORTED_COINS}

# Withdrawals use the same coins. The balance is in USDT; the payout is converted to the chosen coin.
WITHDRAW_NETWORKS = {code: f"{sym} ({net})" if sym == "USDT" else sym for code, sym, _name, net in SUPPORTED_COINS}

# Decimal places each coin is paid with (rounded down, never up). NOWPayments takes at most 6 decimals in a payout amount.
PAYOUT_DECIMALS = {"usdtbsc": 2, "btc": 6, "eth": 6, "ton": 6, "sol": 6}

STABLE = "usdtbsc"  # the coin the balance is kept in on NOWPayments


# Answers that mean the gateway did NOT do what was asked (bad request, refused, not allowed, not found, invalid, rate-limited). Any other
# failure (a timeout, a 5xx, a 408/409 or a proxy's own error) might have come after it did, so it is "unknown" and never refunded.
NOT_DONE_STATUSES = {400, 401, 403, 404, 422, 429}


class GatewayError(Exception):
    """The gateway refused or could not be reached. `retryable` = we do not know if it took effect."""

    def __init__(self, message: str, status: int | None = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.retryable = retryable


@dataclass
class PayoutResult:
    outcome: str  # accepted | rejected | unknown
    payout_id: str | None = None
    message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversionResult:
    outcome: str  # finished | pending | rejected | unknown
    conversion_id: str | None = None
    to_amount: Decimal | None = None  # what the conversion really returned, in the new coin
    message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def _error_text(response: httpx.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict):
            return str(body.get("message") or body.get("error") or body)[:300]
    except Exception:
        pass
    return (response.text or f"HTTP {response.status_code}")[:300]


class NowPaymentsService:
    def __init__(self) -> None:
        self.base_url = NOWPAYMENTS_SANDBOX_URL if settings.NOWPAYMENTS_SANDBOX else NOWPAYMENTS_BASE_URL
        self._coins_cache: tuple[float, set[str]] | None = None
        self._jwt: tuple[float, str] | None = None

    @property
    def api_key(self) -> str:
        return settings.NOWPAYMENTS_API_KEY

    def _headers(self, jwt: str | None = None) -> dict[str, str]:
        h = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        if jwt:
            h["Authorization"] = f"Bearer {jwt}"
        return h

    # ------------------------------------------------------------------ currencies
    async def enabled_codes(self) -> set[str]:
        """Coins enabled on our NOWPayments account (cached 10 minutes)."""
        if self._coins_cache and time.monotonic() - self._coins_cache[0] < 600:
            return self._coins_cache[1]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{self.base_url}/merchant/coins", headers=self._headers())
            if r.status_code == 200:
                codes = {str(c).lower() for c in r.json().get("selectedCurrencies", [])}
                if codes:
                    self._coins_cache = (time.monotonic(), codes)
                    return codes
            logger.warning("merchant/coins returned %s: %s", r.status_code, _error_text(r))
        except Exception as e:
            logger.warning("merchant/coins failed: %s", e)
        # Graceful fallback so gateway blips do not block users from seeing available coins
        if self._coins_cache:
            return self._coins_cache[1]
        return SUPPORTED_CODES

    async def list_currencies(self) -> list[dict[str, str]]:
        enabled = await self.enabled_codes()
        return [
            {"code": code, "symbol": sym, "name": name, "network": net}
            for code, sym, name, net in SUPPORTED_COINS
            if code in enabled
        ]

    # ------------------------------------------------------------------ deposits
    async def create_payment(
        self, amount: Decimal, pay_currency: str, user_id: str, order_id: str
    ) -> dict[str, Any]:
        """
        One payment in `pay_currency`, priced in USD. Fixed rate + fee paid by the user, so the amount
        the user sends already includes the network/exchange fee and we credit the full USD price.
        """
        payload: dict[str, Any] = {
            "price_amount": float(amount),
            "price_currency": "usd",
            "pay_currency": pay_currency,
            "order_id": order_id,
            "order_description": f"MoFi Life deposit {order_id}",
            "is_fixed_rate": True,
            "is_fee_paid_by_user": True,
        }
        if settings.webhook_url:
            payload["ipn_callback_url"] = settings.webhook_url

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(f"{self.base_url}/payment", headers=self._headers(), json=payload)
        except Exception as e:
            raise GatewayError("Payment gateway is unreachable. Please try again shortly.", retryable=True) from e

        if response.status_code in (200, 201):
            return response.json()

        detail = _error_text(response)
        logger.error("create_payment failed (%s): %s", response.status_code, detail)
        raise GatewayError(
            f"Could not create the payment: {detail}",
            status=response.status_code,
            retryable=response.status_code >= 500,
        )

    async def get_payment_status(self, payment_id: str) -> dict[str, Any] | None:
        """Live status from the gateway, or None if it cannot be read right now."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{self.base_url}/payment/{payment_id}", headers=self._headers())
            if r.status_code == 200:
                return r.json()
            logger.warning("payment status %s -> %s", payment_id, r.status_code)
        except Exception as e:
            logger.warning("payment status %s failed: %s", payment_id, e)
        return None

    # ------------------------------------------------------------------ prices and fees
    async def estimate(self, amount: Decimal, currency_from: str, currency_to: str) -> Decimal:
        """What `amount` of `currency_from` is worth in `currency_to` right now (NOWPayments' own estimate, before any fee)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{self.base_url}/estimate",
                    headers=self._headers(),
                    params={"amount": format(amount, "f"), "currency_from": currency_from, "currency_to": currency_to},
                )
            if r.status_code == 200 and r.json().get("estimated_amount") is not None:
                return Decimal(str(r.json()["estimated_amount"]))
            logger.warning("estimate %s->%s -> %s %s", currency_from, currency_to, r.status_code, _error_text(r))
        except Exception as e:
            logger.warning("estimate %s->%s failed: %s", currency_from, currency_to, e)
        raise GatewayError("Could not get a price right now. Please try again shortly.", retryable=True)

    async def estimate_payout(self, usdt_amount: Decimal, coin: str) -> Decimal:
        """How much of `coin` `usdt_amount` USDT buys right now, rounded down to what a payout can carry."""
        places = Decimal(1).scaleb(-PAYOUT_DECIMALS[coin])
        if coin == STABLE:
            return usdt_amount.quantize(places, rounding=ROUND_DOWN)
        return (await self.estimate(usdt_amount, STABLE, coin)).quantize(places, rounding=ROUND_DOWN)

    async def payout_fee(self, coin: str, amount: Decimal) -> Decimal:
        """NOWPayments' estimate of the network fee for paying `amount` of `coin` out, in that coin. The real fee is fixed when the payout is processed."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{self.base_url}/payout/fee",
                    headers=self._headers(),
                    params={"currency": coin.upper(), "amount": format(amount, "f")},
                )
            if r.status_code == 200 and r.json().get("fee") is not None:
                return Decimal(str(r.json()["fee"]))
            logger.warning("payout fee %s -> %s %s", coin, r.status_code, _error_text(r))
        except Exception as e:
            logger.warning("payout fee %s failed: %s", coin, e)
        raise GatewayError("Could not get the network fee right now. Please try again shortly.", retryable=True)

    async def payout_minimum(self, coin: str) -> Decimal | None:
        """The smallest amount of `coin` a payout can carry, or None if it cannot be read (then the gateway's own check applies)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{self.base_url}/payout-withdrawal/min-amount/{coin.lower()}", headers=self._headers())
            if r.status_code == 200 and r.json().get("result") is not None:
                return Decimal(str(r.json()["result"]))
        except Exception as e:
            logger.warning("payout minimum %s failed: %s", coin, e)
        return None

    async def validate_address(self, coin: str, address: str) -> str | None:
        """None when NOWPayments accepts the address for that coin, else a message for the user. A gateway that cannot be reached accepts it (the payout itself still checks)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    f"{self.base_url}/payout/validate-address",
                    headers=self._headers(),
                    json={"address": address, "currency": coin.lower(), "extra_id": None},
                )
            if r.status_code == 200:
                return None
            if r.status_code == 400:
                return "That address is not valid for this coin."
            logger.warning("validate-address %s -> %s %s", coin, r.status_code, _error_text(r))
        except Exception as e:
            logger.warning("validate-address failed: %s", e)
        return None

    # ------------------------------------------------------------------ custody login, conversions
    async def _login(self, client: httpx.AsyncClient) -> str:
        if self._jwt and time.monotonic() - self._jwt[0] < 240:
            return self._jwt[1]
        r = await client.post(
            f"{self.base_url}/auth",
            headers={"Content-Type": "application/json"},
            json={"email": settings.NOWPAYMENTS_EMAIL, "password": settings.NOWPAYMENTS_PASSWORD},
        )
        if r.status_code != 200 or not r.json().get("token"):
            raise GatewayError(f"Payout login failed: {_error_text(r)}", status=r.status_code)
        token = r.json()["token"]
        self._jwt = (time.monotonic(), token)
        return token

    @property
    def payouts_configured(self) -> bool:
        return bool(settings.NOWPAYMENTS_EMAIL and settings.NOWPAYMENTS_PASSWORD)

    async def create_conversion(self, usdt_amount: Decimal, coin: str) -> ConversionResult:
        """Converts `usdt_amount` USDT into `coin` inside the custody account. There is no idempotency key, so an unclear outcome is
        reported as such and never retried here."""
        if not self.payouts_configured:
            return ConversionResult("rejected", message="Payouts are not configured on the server yet.")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                try:
                    jwt = await self._login(client)
                except GatewayError as e:
                    return ConversionResult("rejected", message=e.message)
                r = await client.post(
                    f"{self.base_url}/conversion",
                    headers={"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"},
                    json={"amount": float(usdt_amount), "from_currency": STABLE, "to_currency": coin},
                )
            if r.status_code in (200, 201):
                return _conversion_from(r.json().get("result") or {})
            text = _error_text(r)
            logger.error("conversion %s -> %s %s", coin, r.status_code, text)
            return ConversionResult("rejected" if r.status_code in NOT_DONE_STATUSES else "unknown", message=text)
        except Exception as e:
            logger.exception("conversion to %s outcome unknown", coin)
            return ConversionResult("unknown", message=str(e))

    async def get_conversion(self, conversion_id: str) -> ConversionResult:
        """The conversion's state now, or 'unknown' if it cannot be read."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                jwt = await self._login(client)
                r = await client.get(f"{self.base_url}/conversion/{conversion_id}", headers={"Authorization": f"Bearer {jwt}"})
            if r.status_code == 200:
                return _conversion_from(r.json().get("result") or {})
            logger.warning("conversion %s status -> %s %s", conversion_id, r.status_code, _error_text(r))
        except Exception as e:
            logger.warning("conversion %s status failed: %s", conversion_id, e)
        return ConversionResult("unknown", conversion_id=conversion_id)

    # ------------------------------------------------------------------ payouts
    async def create_payout(self, withdrawal_id: str, address: str, amount: Decimal, network: str) -> PayoutResult:
        # `amount` is in the payout coin (`network` is the coin code), already converted from USDT
        """
        Sends the coin out automatically (no admin approval). `unique_external_id` = our withdrawal id, so a
        retry can never pay twice. Outcome tells the caller whether it is safe to refund:
          accepted -> gateway has it;  rejected -> definitely not sent;  unknown -> may have been sent.
        """
        if not self.payouts_configured:
            return PayoutResult("rejected", message="Payouts are not configured on the server yet.")

        item: dict[str, Any] = {
            "address": address,
            "currency": network,
            "amount": "__AMOUNT__",
            "unique_external_id": withdrawal_id,
        }
        body: dict[str, Any] = {"withdrawals": [item]}
        if settings.webhook_url:
            body["ipn_callback_url"] = settings.webhook_url
            item["ipn_callback_url"] = settings.webhook_url
        # the amount goes out exactly as the decimal we worked out (a float could print as 1e-05 or 0.30000000000000004)
        raw = json.dumps(body).replace('"__AMOUNT__"', format(amount, "f"))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                try:
                    jwt = await self._login(client)
                except GatewayError as e:
                    return PayoutResult("rejected", message=e.message)
                r = await client.post(f"{self.base_url}/payout", headers=self._headers(jwt), content=raw)
                if r.status_code not in (200, 201):
                    text = _error_text(r)
                    logger.error("payout %s -> %s %s", withdrawal_id, r.status_code, text)
                    outcome = "rejected" if r.status_code in NOT_DONE_STATUSES else "unknown"
                    return PayoutResult(outcome, message=text)

                data = r.json()
                batch_id = str(data.get("id") or "")
                items = data.get("withdrawals") or []
                payout_id = str((items[0].get("id") if items else None) or batch_id or "")

                if settings.NOWPAYMENTS_2FA_SECRET and batch_id:
                    await self._verify_payout(client, jwt, batch_id)
                return PayoutResult("accepted", payout_id=payout_id or None, raw=data)
        except Exception as e:
            logger.exception("payout %s outcome unknown", withdrawal_id)
            return PayoutResult("unknown", message=str(e))

    async def _verify_payout(self, client: httpx.AsyncClient, jwt: str, batch_id: str) -> None:
        """The payout only goes out once verified (10 tries allowed; an unverified one is rejected by the gateway after an hour, and
        the webhook then refunds it). A code is good for its 30-second window, so a failed try waits for the next one."""
        import pyotp
        totp = pyotp.TOTP(settings.NOWPAYMENTS_2FA_SECRET)
        for attempt in range(3):
            r = await client.post(
                f"{self.base_url}/payout/{batch_id}/verify",
                headers=self._headers(jwt),
                json={"verification_code": totp.now()},
            )
            if r.status_code in (200, 201):
                return
            logger.error("payout verify %s try %s -> %s %s", batch_id, attempt + 1, r.status_code, _error_text(r))
            await asyncio.sleep(5)

    # ------------------------------------------------------------------ balance
    async def get_balance(self) -> dict[str, Any]:
        """The custody balance per coin: GET /balance -> {coin: {amount, pendingAmount}}."""
        if not self.payouts_configured:
            return {"configured": False, "balances": {}, "message": "Payout credentials not set"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(f"{self.base_url}/balance", headers=self._headers())
            if r.status_code == 200 and isinstance(r.json(), dict):
                return {"configured": True, "balances": r.json(), "status": "ok"}
            return {"configured": True, "balances": {}, "error": _error_text(r)}
        except Exception as e:
            logger.warning("get_balance failed: %s", e)
            return {"configured": True, "balances": {}, "error": str(e)}

    async def check_sufficient_balance(self, coin: str, amount: Decimal) -> tuple[bool, str]:
        """Is there at least `amount` of `coin` available in custody? With payouts not configured at all (development) there is nothing to
        check. Configured but unreadable counts as NOT enough: better to ask the user to retry than to debit them for a payout that fails."""
        if not self.payouts_configured:
            return True, ""
        info = await self.get_balance()
        balances = info.get("balances") or {}
        if not balances:
            return False, f"balance unreadable: {info.get('error') or 'empty'}"
        entry = balances.get(coin.lower()) or balances.get(coin.upper())
        if isinstance(entry, dict):
            avail = Decimal(str(entry.get("amount") or 0))
        elif isinstance(entry, (int, float, str)):
            avail = Decimal(str(entry))
        else:
            avail = Decimal(0)
        if avail < amount:
            return False, f"custody balance low: available {avail} {coin.upper()}, required {amount}"
        return True, ""


def _conversion_from(result: dict[str, Any]) -> ConversionResult:
    status = str(result.get("status") or "").upper()
    outcome = {"FINISHED": "finished", "REJECTED": "rejected", "WAITING": "pending", "PROCESSING": "pending"}.get(status)
    if outcome is None:
        logger.error("conversion %s has a status this code does not know: %r (left as it is; check NOWPayments)", result.get("id"), status)
        outcome = "unknown"
    to_amount = result.get("to_amount")
    return ConversionResult(
        outcome,
        conversion_id=str(result.get("id") or "") or None,
        to_amount=Decimal(str(to_amount)) if to_amount is not None else None,
        message=status or None,
        raw=result,
    )


nowpayments_service = NowPaymentsService()
