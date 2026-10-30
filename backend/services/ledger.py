from __future__ import annotations
from decimal import Decimal
from typing import Any
from core.database import db


class LedgerService:
    """Thin wrappers over the database functions. All money movement happens inside Postgres."""

    @staticmethod
    def process_confirmed_deposit(
        payment_id: str,
        actually_paid: Any,
        gateway_status: str,
        payin_hash: str | None = None,
        payload: dict[str, Any] | None = None,
        credit_usdt: Decimal | float | str | None = None,
    ) -> dict[str, Any]:
        try:
            valid_paid = float(actually_paid) if actually_paid not in (None, "") else 0.0
        except (ValueError, TypeError):
            valid_paid = 0.0

        params: dict[str, Any] = {
            "p_payment_id": payment_id,
            "p_actually_paid": str(actually_paid) if valid_paid > 0 else None,
            "p_gateway_status": gateway_status,
            "p_payin_hash": payin_hash,
            "p_payload": payload or {},
        }
        if credit_usdt is not None:
            params["p_credit_usdt"] = str(credit_usdt)

        res = db.rpc("process_confirmed_deposit", params).execute()
        return res.data

    @staticmethod
    def expire_unpaid_deposits(window_seconds: int, deposit_id: str | None = None) -> int:
        """Deposits still unpaid `window_seconds` after they were started become expired, and their History row failed. Returns how many."""
        params: dict[str, Any] = {"p_window": f"{window_seconds} seconds"}
        if deposit_id:
            params["p_deposit_id"] = deposit_id
        res = db.rpc("expire_unpaid_deposits", params).execute()
        return int(res.data or 0)

    @staticmethod
    def process_reinvest_earnings(user_id: str, amount: Decimal | None = None) -> dict[str, Any]:
        """Moves withdrawable earnings (returns first, then referral commission) into locked principal as a new part. No amount means all of it."""
        res = db.rpc("process_reinvest_earnings", {
            "p_user_id": user_id,
            "p_amount": None if amount is None else str(amount),
        }).execute()
        return res.data

    @staticmethod
    def process_withdrawal(
        user_id: str, amount: Decimal, network: str, address: str, meta: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        res = db.rpc("process_withdraw_request", {
            "p_user_id": user_id,
            "p_amount": str(amount),
            "p_network": network,
            "p_address": address,
            "p_meta": meta or {},
        }).execute()
        return res.data

    @staticmethod
    def mark_withdrawal_sent(withdrawal_id: str, payout_id: str | None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        res = db.rpc("mark_withdrawal_sent", {
            "p_withdrawal_id": withdrawal_id, "p_payout_id": payout_id, "p_payload": payload or {},
        }).execute()
        return res.data

    @staticmethod
    def complete_withdrawal(withdrawal_id: str, tx_hash: str | None = None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        res = db.rpc("complete_withdrawal", {
            "p_withdrawal_id": withdrawal_id, "p_tx_hash": tx_hash, "p_payload": payload or {},
        }).execute()
        return res.data

    @staticmethod
    def fail_withdrawal(withdrawal_id: str, reason: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        res = db.rpc("fail_withdrawal", {
            "p_withdrawal_id": withdrawal_id, "p_reason": reason, "p_payload": payload or {},
        }).execute()
        return res.data

    @staticmethod
    def run_daily_returns(
        run_date: str | None = None, triggered_by: str = "scheduler", admin_id: str | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"p_triggered_by": triggered_by}
        if run_date:
            params["p_run_date"] = run_date
        if admin_id:
            params["p_admin_id"] = admin_id
        res = db.rpc("run_daily_returns", params).execute()
        return res.data

    @staticmethod
    def get_referral_summary(user_id: str) -> dict[str, Any]:
        res = db.rpc("get_referral_summary", {"p_user_id": user_id}).execute()
        return res.data or {}

    @staticmethod
    def get_admin_stats() -> dict[str, Any]:
        res = db.rpc("get_admin_stats").execute()
        return res.data or {}

    @staticmethod
    def reconcile_wallets() -> list[dict[str, Any]]:
        """Every place a balance disagrees with its ledger, principal parts or payouts. Empty means the books balance."""
        res = db.rpc("reconcile_wallets").execute()
        return res.data or []


ledger_service = LedgerService()
