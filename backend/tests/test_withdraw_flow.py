"""The payout steps after a withdrawal is debited: one claim, refunds only when the gateway definitely did not do it, nothing lost."""
import asyncio
from decimal import Decimal as D

import pytest

from services import withdraw_flow as wf
from services.nowpayments import ConversionResult, PayoutResult, nowpayments_service
from tests.conftest import FakeDB


class FakeLedger:
    def __init__(self, db):
        self.db, self.fail_refunds, self.refunded, self.sent = db, False, [], []

    def fail_withdrawal(self, wid, reason, payload):
        if self.fail_refunds:
            raise RuntimeError("database down")
        self._set(wid, status="failed")
        self.refunded.append(wid)

    def mark_withdrawal_sent(self, wid, payout_id, raw):
        self._set(wid, status="sending", payout_id=payout_id)
        self.sent.append(wid)

    def _set(self, wid, **kw):
        for r in self.db.rows("withdrawals"):
            if r["id"] == wid:
                r.update(kw)


def withdrawal(**kw):
    row = dict(id="w1", status="processing", network="btc", address="addr", conversion_id=None, payout_requested_at=None,
               payout_amount="0.001", error=None, payout_id=None, created_at="2000-01-01", updated_at="2000-01-01")
    row.update(kw)
    return row


@pytest.fixture
def env(monkeypatch):
    db = FakeDB()
    ledger = FakeLedger(db)
    gateway = {"outcome": "accepted", "calls": 0}

    async def create_payout(wid, address, amount, coin):
        gateway["calls"] += 1
        await asyncio.sleep(0.01)
        return PayoutResult(gateway["outcome"], payout_id="p1", message="refused", raw={})

    async def no_sleep(_s):
        return None

    monkeypatch.setattr(wf, "db", db)
    monkeypatch.setattr(wf, "ledger_service", ledger)
    monkeypatch.setattr(nowpayments_service, "create_payout", create_payout)
    monkeypatch.setattr(wf.asyncio, "sleep", no_sleep)
    return db, ledger, gateway


def run(coro):
    return asyncio.run(coro)


def test_two_callers_make_one_payout(env):
    db, _ledger, gateway = env
    db.rows("withdrawals").append(withdrawal(network="usdtbsc"))

    async def both():
        return await asyncio.gather(wf.send_payout("w1", "a", "usdtbsc", D("5")), wf.send_payout("w1", "a", "usdtbsc", D("5")))

    states = sorted(r["state"] for r in run(both()))
    assert states == ["processing", "sending"]
    assert gateway["calls"] == 1


def test_a_rejected_payout_is_refunded_once(env):
    db, ledger, gateway = env
    db.rows("withdrawals").append(withdrawal())
    gateway["outcome"] = "rejected"
    assert run(wf.send_payout("w1", "a", "btc", D("0.001")))["state"] == "refunded"
    assert ledger.refunded == ["w1"]


def test_an_unclear_payout_is_never_refunded(env):
    db, ledger, gateway = env
    db.rows("withdrawals").append(withdrawal())
    gateway["outcome"] = "unknown"
    assert run(wf.send_payout("w1", "a", "btc", D("0.001")))["state"] == "processing"
    assert ledger.refunded == []


def test_a_refund_that_keeps_failing_is_flagged_for_a_person(env):
    db, ledger, gateway = env
    db.rows("withdrawals").append(withdrawal())
    gateway["outcome"], ledger.fail_refunds = "rejected", True
    assert run(wf.send_payout("w1", "a", "btc", D("0.001")))["state"] == "processing"
    assert db.rows("withdrawals")[0]["error"].startswith("Needs review")


def test_a_conversion_close_to_the_quote_pays_what_it_returned(env):
    db, ledger, _gw = env
    row = withdrawal(conversion_id="c1")
    db.rows("withdrawals").append(row)
    conv = ConversionResult("finished", conversion_id="c1", to_amount=D("0.00099"))
    assert run(wf.settle_conversion(row, conv))["state"] == "sending"
    assert db.rows("withdrawals")[0]["payout_amount"] == "0.000990"


def test_a_conversion_far_short_of_the_quote_waits_for_a_person(env):
    db, _ledger, gateway = env
    row = withdrawal(conversion_id="c1")
    db.rows("withdrawals").append(row)
    conv = ConversionResult("finished", conversion_id="c1", to_amount=D("0.0008"))
    assert run(wf.settle_conversion(row, conv))["state"] == "processing"
    assert gateway["calls"] == 0
    assert "short" in db.rows("withdrawals")[0]["error"]
    assert run(wf.resume_waiting_conversions()) == 0  # a flagged row is left alone


def test_the_sweeper(env):
    db, ledger, _gw = env
    db.rows("withdrawals").extend([
        withdrawal(id="usdt", network="usdtbsc"),
        withdrawal(id="coin", network="btc"),
        withdrawal(id="asked", network="btc", payout_requested_at="2000-01-01"),
    ])
    assert run(wf.sweep_stranded_withdrawals()) == 3
    by_id = {r["id"]: r for r in db.rows("withdrawals")}
    assert by_id["usdt"]["status"] == "failed" and ledger.refunded == ["usdt"]  # nothing was sent: refunded
    assert by_id["coin"]["error"] and by_id["asked"]["error"]  # may have been done at the gateway: a person decides
    assert by_id["coin"]["status"] == by_id["asked"]["status"] == "processing"
