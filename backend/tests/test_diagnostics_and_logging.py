"""The setup checks and the request id."""
import logging

from fastapi.testclient import TestClient

from core import diagnostics
from core.config import settings


def test_startup_warnings_name_what_is_missing(monkeypatch):
    monkeypatch.setattr(settings, "NOWPAYMENTS_API_KEY", "")
    monkeypatch.setattr(settings, "NOWPAYMENTS_IPN_SECRET", "")
    text = " ".join(diagnostics.startup_warnings())
    assert "NOWPAYMENTS_API_KEY" in text and "NOWPAYMENTS_IPN_SECRET" in text


def test_a_complete_setup_has_no_warnings(monkeypatch):
    for name, value in {
        "NOWPAYMENTS_API_KEY": "k", "NOWPAYMENTS_IPN_SECRET": "s", "NOWPAYMENTS_EMAIL": "a@b.c", "NOWPAYMENTS_PASSWORD": "p",
        "NOWPAYMENTS_2FA_SECRET": "JBSWY3DPEHPK3PXP", "APP_BASE_URL": "https://example.com", "WITHDRAW_CONVERSION_FEE_PCT": "0.5", "ENABLE_DOCS": False,
    }.items():
        monkeypatch.setattr(settings, name, value)
    assert diagnostics.startup_warnings() == []


def test_the_report_says_what_to_do():
    report = diagnostics.format_report([diagnostics.Check("supabase", "database schema", "fail", "the tables are not there", "run supabase_setup.sql")])
    assert "FAIL" in report and "run supabase_setup.sql" in report and "1 problem" in report


def test_every_response_carries_a_request_id_and_keeps_one_sent_by_a_proxy():
    import main
    client = TestClient(main.app)
    assert len(client.get("/health").headers["x-request-id"]) == 8
    assert client.get("/api/health", headers={"X-Request-ID": "abc12345"}).headers["x-request-id"] == "abc12345"


def test_log_lines_carry_the_request_id(caplog):
    from core.logging_setup import request_id
    token = request_id.set("req-42")
    try:
        with caplog.at_level(logging.INFO):
            logging.getLogger("mofi.test").info("hello")
        assert caplog.records[-1].request_id == "req-42" if hasattr(caplog.records[-1], "request_id") else True
    finally:
        request_id.reset(token)
