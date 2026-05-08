"""Tests — Step 2: Transaction Routing Graph."""

import pytest
from app.graphs.transaction_router import run_transaction_router
from app.schemas.transaction import TransactionType, TransactionPriority, RoutingDecision


def _make(tx_type: str, amount: float = 1000.0) -> dict:
    return {
        "transaction_id": "TXN-TEST-001",
        "transaction_type": tx_type,
        "amount": amount,
        "account_id": "ACC-001",
        "metadata": {},
    }


def test_payment_routing():
    result = run_transaction_router(_make("payment", amount=1000))
    assert result["routing_decision"] == RoutingDecision.PAYMENT_PROCESSOR
    assert result.get("requires_human_review") is not True


def test_loan_routing():
    result = run_transaction_router(_make("loan", amount=50000))
    assert result["routing_decision"] == RoutingDecision.LOAN_ENGINE


def test_fraud_routing():
    result = run_transaction_router(_make("fraud_check", amount=5000))
    assert result["routing_decision"] == RoutingDecision.FRAUD_ENGINE
    assert result["requires_human_review"] is True


def test_compliance_routing():
    result = run_transaction_router(_make("compliance"))
    assert result["routing_decision"] == RoutingDecision.COMPLIANCE_ASSISTANT


def test_account_routing():
    result = run_transaction_router(_make("account_lookup"))
    assert result["routing_decision"] == RoutingDecision.ACCOUNT_AGENT


def test_unknown_type_human_review():
    result = run_transaction_router(_make("unknown_type"))
    assert result["routing_decision"] == RoutingDecision.HUMAN_REVIEW
    assert result["requires_human_review"] is True


def test_high_amount_priority():
    result = run_transaction_router(_make("payment", amount=100_000))
    assert result["priority"] == TransactionPriority.HIGH


def test_low_amount_priority():
    # account_lookup + low amount → LOW priority (PAYMENT type is always MEDIUM by design)
    result = run_transaction_router(_make("account_lookup", amount=100))
    assert result["priority"] == TransactionPriority.LOW
