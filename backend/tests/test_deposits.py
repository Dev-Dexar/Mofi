"""Deposits are credited for exactly what was asked or more, once, and only for a payment the gateway reports in full."""
import pytest

from services import deposits as dp
from tests.conftest import FakeDB


@pytest.fixture
def env(monkeypatch):
    db = FakeDB()
    db.rows("deposits").append({"id": "d1", "payment_id": None, "order_id": "DEP-1", "status": "waiting"})
    credits = []

    class Ledger:
        def process_confirmed_deposit(self, **kw):
            credits.append(kw["gateway_status"])
            db.rows("deposits")[0]["status"] = "finished"
            return {"status": "success"}

    monkeypatch.setattr(dp, "db", db)
    monkeypatch.setattr(dp, "ledger_service", Ledger())
    return db, credits


PAID = {"payment_id": 111, "order_id": "DEP-1", "pay_amount": 0.5, "actually_paid": 0.5, "price_amount": 30,
        "outcome_currency": "usdtbsc", "outcome_amount": 29.9}


def test_exact_and_over_payments_are_credited(env):
    db, credits = env
    dp.apply_gateway_update({**PAID, "payment_status": "finished"})
    assert credits == ["finished"]
    db.rows("deposits")[0]["status"] = "waiting"
    dp.apply_gateway_update({**PAID, "actually_paid": 0.6, "payment_status": "finished"})
    assert credits == ["finished", "finished"]


@pytest.mark.parametrize("paid", [0.4999, 0.499, 0.1])
def test_any_underpayment_is_held(env, paid):
    db, credits = env
    dp.apply_gateway_update({**PAID, "actually_paid": paid, "payment_status": "finished"})
    assert credits == [] and db.rows("deposits")[0]["status"] == "partially_paid"


def test_a_finished_report_without_amounts_is_held(env):
    db, credits = env
    dp.apply_gateway_update({"payment_id": 111, "order_id": "DEP-1", "payment_status": "finished"})
    assert credits == [] and db.rows("deposits")[0]["status"] == "partially_paid"


def test_a_late_status_cannot_reopen_a_credited_deposit(env):
    db, credits = env
    dp.apply_gateway_update({**PAID, "payment_status": "finished"})
    dp.apply_gateway_update({**PAID, "payment_status": "confirming"})
    assert db.rows("deposits")[0]["status"] == "finished"


def test_a_payment_whose_id_was_never_stored_is_found_by_its_order_id(env):
    db, _credits = env
    dp.apply_gateway_update({**PAID, "payment_status": "waiting"})
    assert db.rows("deposits")[0]["payment_id"] == "111"
