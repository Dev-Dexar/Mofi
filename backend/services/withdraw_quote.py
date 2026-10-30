"""
What a withdrawal costs and what the user gets, worked out in one place so the preview and the real payout can never disagree.

The balance is in USDT and the payout is made in the coin the user picked. Every cost of getting it there is the user's:

    debited from the balance      amount                       (what the user typed)
    network fee      (USDT)       NOWPayments' live estimate for paying that coin out (GET /payout/fee), turned into USDT at the
                                  live price, plus a buffer (the real fee is only fixed when the payout is processed)
    conversion fee   (USDT)       what NOWPayments charges to turn USDT into the coin (percent from WITHDRAW_CONVERSION_FEE_PCT);
                                  none for USDT, which needs no conversion
    receive          (coin)       (amount - both fees) at the live price, rounded down

When the payout is really made, the USDT left after the network fee is converted and the user is sent exactly what the conversion
returned, so the conversion fee is always the user's, whatever the quote assumed. If the payout fails the whole `amount` is refunded.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import ROUND_UP, Decimal, InvalidOperation

from core.config import settings
from services.nowpayments import PAYOUT_DECIMALS, STABLE, SUPPORTED_CODES, nowpayments_service

logger = logging.getLogger("mofi.withdraw")

CENT = Decimal("0.01")


class QuoteError(Exception):
    """The amount cannot be quoted (too small to cover the fees, or no price): the message is fit for the user."""

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True)
class WithdrawQuote:
    amount: Decimal  # taken from the balance
    network_fee: Decimal  # USDT
    conversion_fee: Decimal  # USDT
    fee: Decimal  # network_fee + conversion_fee
    net: Decimal  # amount - fee: what the user gets, in USDT terms
    receive: Decimal  # what arrives, in the chosen coin
    convert_usdt: Decimal  # the USDT to convert into the coin when paying out (amount - network_fee); 0 for USDT


def percent_setting(raw: str, name: str) -> Decimal | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        pct = Decimal(raw)
        if pct.is_finite() and 0 <= pct < 100:
            return pct
    except InvalidOperation:
        pass
    logger.error("%s=%r is not a percentage between 0 and 100", name, raw)
    return None


def conversion_fee_pct() -> Decimal | None:
    return percent_setting(settings.WITHDRAW_CONVERSION_FEE_PCT, "WITHDRAW_CONVERSION_FEE_PCT")


def coin_enabled(coin: str) -> bool:
    """USDT always; the other coins only once the conversion fee is known."""
    return coin == STABLE or conversion_fee_pct() is not None


def _ceil_cent(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_UP)


async def network_fee_usdt(coin: str, amount: Decimal) -> Decimal:
    """The network fee for paying `amount` USDT out as `coin`, in USDT, buffered, rounded up to the cent."""
    buffer_pct = percent_setting(settings.WITHDRAW_FEE_BUFFER_PCT, "WITHDRAW_FEE_BUFFER_PCT") or Decimal(0)
    # the fee depends on the size of the payout, so ask with the coin amount this payout is roughly worth
    coin_amount = await nowpayments_service.estimate_payout(amount, coin)
    fee_coin = await nowpayments_service.payout_fee(coin, coin_amount)
    fee_usdt = fee_coin if coin == STABLE else await nowpayments_service.estimate(fee_coin, coin, STABLE)
    return _ceil_cent(fee_usdt * (1 + buffer_pct / 100))


async def quote_withdrawal(amount: Decimal, coin: str) -> WithdrawQuote:
    if coin not in SUPPORTED_CODES:
        raise QuoteError("Unsupported coin")
    pct = conversion_fee_pct()
    if coin != STABLE and pct is None:
        raise QuoteError("Withdrawals in this coin are not available yet. Please choose USDT.")
    try:
        network_fee = await network_fee_usdt(coin, amount)
        convert_usdt = amount - network_fee
        conversion_fee = _ceil_cent(convert_usdt * pct / 100) if (coin != STABLE and pct is not None and convert_usdt > 0) else Decimal(0)
        net = convert_usdt - conversion_fee
        if net <= 0:
            fee = network_fee + conversion_fee
            raise QuoteError(f"That is too small to cover the {fee} USDT in fees. Try a larger amount.")
        receive = await nowpayments_service.estimate_payout(net, coin)
    except QuoteError:
        raise
    except Exception as e:  # GatewayError: no price right now
        raise QuoteError(getattr(e, "message", None) or "Could not get a price right now. Please try again.", retryable=True)
    if receive <= 0:
        raise QuoteError("That amount is too small to send in this coin.")
    minimum = await nowpayments_service.payout_minimum(coin)
    if minimum is not None and receive < minimum:
        raise QuoteError("That amount is below the smallest payout this coin allows. Try a larger amount.")
    return WithdrawQuote(
        amount=amount,
        network_fee=network_fee,
        conversion_fee=conversion_fee,
        fee=network_fee + conversion_fee,
        net=net,
        receive=receive,
        convert_usdt=convert_usdt if coin != STABLE else Decimal(0),
    )


def payout_places(coin: str) -> Decimal:
    return Decimal(1).scaleb(-PAYOUT_DECIMALS[coin])
