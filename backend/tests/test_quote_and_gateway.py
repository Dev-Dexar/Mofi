"""What a withdrawal costs, and how gateway answers are read."""
import asyncio
from decimal import Decimal as D

import pytest

from core.config import settings
from services import nowpayments as npm
from services import withdraw_quote as wq
from services.nowpayments import nowpayments_service as svc

PRICE = {"btc": D("100000"), "eth": D("4000")}  # USDT per coin


@pytest.fixture(autouse=True)
def gateway(monkeypatch):
    async def estimate(amount, a, b):
        return amount / PRICE[b] if a == "usdtbsc" else amount * PRICE[a]

    async def payout_fee(coin, amount):
        return {"usdtbsc": D("0.8"), "btc": D("0.00002"), "eth": D("0.0004")}[coin]

    async def minimum(_coin):
        return D("0.00001")

    monkeypatch.setattr(svc, "estimate", estimate)
    monkeypatch.setattr(svc, "payout_fee", payout_fee)
    monkeypatch.setattr(svc, "payout_minimum", minimum)
    monkeypatch.setattr(settings, "WITHDRAW_CONVERSION_FEE_PCT", "0.5")
    monkeypatch.setattr(settings, "WITHDRAW_FEE_BUFFER_PCT", "10")


def quote(amount, coin):
    return asyncio.run(wq.quote_withdrawal(D(amount), coin))


def test_usdt_pays_only_the_network_fee():
    q = quote("100", "usdtbsc")
    assert (q.network_fee, q.conversion_fee, q.net, q.receive) == (D("0.88"), D("0"), D("99.12"), D("99.12"))


def test_a_coin_pays_network_and_conversion_fee_and_receives_the_rest():
    q = quote("100", "btc")
    assert q.network_fee == D("2.20")  # 0.00002 BTC at 100000 + 10% buffer
    assert q.conversion_fee == D("0.49")  # 0.5% of what is converted (100 - 2.20)
    assert q.fee == q.network_fee + q.conversion_fee and q.net == D("100") - q.fee
    assert q.receive == D("0.000973") and q.convert_usdt == D("97.80")


def test_a_payout_never_has_more_than_six_decimals():
    assert all(places <= 6 for places in npm.PAYOUT_DECIMALS.values() if places != 2) and npm.PAYOUT_DECIMALS["btc"] == 6


def test_too_small_to_cover_the_fees_is_refused():
    with pytest.raises(wq.QuoteError):
        quote("2", "btc")


def test_coins_other_than_usdt_are_off_until_the_conversion_fee_is_known(monkeypatch):
    monkeypatch.setattr(settings, "WITHDRAW_CONVERSION_FEE_PCT", "")
    with pytest.raises(wq.QuoteError):
        quote("100", "btc")
    assert quote("100", "usdtbsc").receive > 0


def test_only_clear_refusals_count_as_not_done():
    assert {400, 401, 403, 404, 422, 429} == npm.NOT_DONE_STATUSES
    assert 500 not in npm.NOT_DONE_STATUSES and 409 not in npm.NOT_DONE_STATUSES


def test_conversion_statuses():
    f = npm._conversion_from
    assert f({"status": "FINISHED", "to_amount": 1}).outcome == "finished"
    assert f({"status": "PROCESSING"}).outcome == "pending"
    assert f({"status": "REJECTED"}).outcome == "rejected"
    assert f({"status": "SOMETHING_NEW"}).outcome == "unknown"
