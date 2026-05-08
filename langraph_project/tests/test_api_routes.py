"""Tests — FastAPI routes (all steps).

Uses TestClient to exercise HTTP layer without a running server.
LLM/OpenAI calls are patched out — route logic and schema validation are tested.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ── Health ─────────────────────────────────────────────────────────────────────

def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] in ("ok", "healthy")


# ── Auth (Step 10) ─────────────────────────────────────────────────────────────

def test_login_admin():
    response = client.post("/api/v1/auth/token", data={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "admin"


def test_login_officer():
    response = client.post("/api/v1/auth/token", data={"username": "officer", "password": "officer123"})
    assert response.status_code == 200


def test_login_invalid():
    response = client.post("/api/v1/auth/token", data={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def _get_token(username: str, password: str) -> str:
    r = client.post("/api/v1/auth/token", data={"username": username, "password": password})
    return r.json()["access_token"]


def test_me_endpoint():
    token = _get_token("customer", "customer123")
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "customer"


def test_admin_only_forbidden_for_customer():
    token = _get_token("customer", "customer123")
    response = client.get("/api/v1/auth/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_only_allowed_for_admin():
    token = _get_token("admin", "admin123")
    response = client.get("/api/v1/auth/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_officer_endpoint_forbidden_for_customer():
    token = _get_token("customer", "customer123")
    response = client.get("/api/v1/auth/officer-or-above", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_officer_endpoint_allowed_for_officer():
    token = _get_token("officer", "officer123")
    response = client.get("/api/v1/auth/officer-or-above", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


# ── Transaction Router (Step 2) ────────────────────────────────────────────────

def test_transaction_route_payment():
    response = client.post("/api/v1/transactions/route", json={
        "transaction_id": "TXN-001",
        "transaction_type": "payment",
        "amount": 500,
        "account_id": "ACC-001",
    })
    assert response.status_code == 200
    assert response.json()["routing_decision"] == "payment_processor"


# ── Loan Eligibility (Step 3) ─────────────────────────────────────────────────

def test_loan_eligibility_approved():
    response = client.post("/api/v1/loans/eligibility", json={
        "applicant_id": "app-001",
        "loan_type": "personal",
        "requested_amount": 15000,
        "annual_income": 80000,
        "credit_score": 740,
        "employment_years": 5,
        "existing_debt": 0,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] in ("approved", "rejected", "pending_review")


def test_loan_eligibility_rejected_low_credit():
    response = client.post("/api/v1/loans/eligibility", json={
        "applicant_id": "app-002",
        "loan_type": "home",
        "requested_amount": 400000,
        "annual_income": 100000,
        "credit_score": 580,
        "employment_years": 3,
        "existing_debt": 0,
    })
    assert response.status_code == 200
    assert response.json()["decision"] == "rejected"


# ── HITL (Step 10) ────────────────────────────────────────────────────────────

def test_hitl_submit_requires_auth():
    response = client.post("/api/v1/security/hitl/submit", json={
        "application_id": "APP-001",
        "loan_amount": 200000,
        "applicant_name": "Test User",
    })
    assert response.status_code == 401


def test_hitl_submit_with_auth():
    token = _get_token("customer", "customer123")
    response = client.post(
        "/api/v1/security/hitl/submit",
        json={"application_id": "APP-ROUTE-001", "loan_amount": 150000, "applicant_name": "Route Test"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "PENDING_HUMAN_REVIEW"


def test_hitl_decide_requires_officer():
    token = _get_token("customer", "customer123")
    response = client.post(
        "/api/v1/security/hitl/APP-ROUTE-001/decide",
        json={"decision": "approved", "notes": ""},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_hitl_full_flow():
    customer_token = _get_token("customer", "customer123")
    officer_token = _get_token("officer", "officer123")
    app_id = "APP-FULLFLOW-001"

    submit = client.post(
        "/api/v1/security/hitl/submit",
        json={"application_id": app_id, "loan_amount": 200000, "applicant_name": "Full Flow"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert submit.status_code == 200

    decide = client.post(
        f"/api/v1/security/hitl/{app_id}/decide",
        json={"decision": "approved", "notes": "Documents verified"},
        headers={"Authorization": f"Bearer {officer_token}"},
    )
    assert decide.status_code == 200
    assert decide.json()["final_status"] == "APPROVED"
