"""Tests — Step 10: JWT Auth, RBAC, Human-in-the-Loop."""

import pytest
from jose import jwt

from app.config import get_settings
from app.security.jwt_handler import create_access_token, decode_access_token
from app.security.rbac import authenticate_user, Role, ROLE_HIERARCHY
from app.graphs.human_in_loop import submit_for_review, resume_with_decision

settings = get_settings()


# ── JWT Handler ────────────────────────────────────────────────────────────────

def test_create_and_decode_token():
    token = create_access_token({"sub": "admin", "role": "admin"})
    payload = decode_access_token(token)
    assert payload["sub"] == "admin"
    assert payload["role"] == "admin"


def test_token_contains_expiry():
    token = create_access_token({"sub": "customer"})
    payload = decode_access_token(token)
    assert "exp" in payload


# ── RBAC ──────────────────────────────────────────────────────────────────────

def test_authenticate_valid_user():
    user = authenticate_user("admin", "admin123")
    assert user is not None
    assert user["role"] == Role.ADMIN


def test_authenticate_invalid_password():
    user = authenticate_user("admin", "wrongpassword")
    assert user is None


def test_authenticate_nonexistent_user():
    user = authenticate_user("ghost", "nopass")
    assert user is None


def test_role_hierarchy_ordering():
    assert ROLE_HIERARCHY[Role.ADMIN] > ROLE_HIERARCHY[Role.OFFICER]
    assert ROLE_HIERARCHY[Role.OFFICER] > ROLE_HIERARCHY[Role.CUSTOMER]


def test_all_demo_users_authenticate():
    credentials = [("admin", "admin123"), ("officer", "officer123"), ("customer", "customer123")]
    for username, password in credentials:
        user = authenticate_user(username, password)
        assert user is not None, f"Failed for {username}"


# ── Human-in-the-Loop ─────────────────────────────────────────────────────────

def test_hitl_submit_returns_pending():
    result = submit_for_review(
        application_id="HITL-TEST-001",
        loan_amount=200000,
        applicant_name="Test Applicant",
    )
    assert result["status"] == "PENDING_HUMAN_REVIEW"
    assert result["risk_level"] == "MEDIUM"


def test_hitl_high_risk_classification():
    result = submit_for_review(
        application_id="HITL-TEST-HIGH",
        loan_amount=750000,
        applicant_name="High Risk Applicant",
    )
    assert result["risk_level"] == "HIGH"


def test_hitl_low_risk_classification():
    result = submit_for_review(
        application_id="HITL-TEST-LOW",
        loan_amount=50000,
        applicant_name="Low Risk Applicant",
    )
    assert result["risk_level"] == "LOW"


def test_hitl_approve_decision():
    app_id = "HITL-APPROVE-001"
    submit_for_review(app_id, loan_amount=150000, applicant_name="Jane Doe")
    result = resume_with_decision(app_id, decision="approved", approver="officer")
    assert result["final_status"] == "APPROVED"
    assert result["approver"] == "officer"


def test_hitl_reject_decision():
    app_id = "HITL-REJECT-001"
    submit_for_review(app_id, loan_amount=150000, applicant_name="John Doe")
    result = resume_with_decision(app_id, decision="rejected", approver="officer", notes="Insufficient docs")
    assert result["final_status"] == "REJECTED"
    assert result["notes"] == "Insufficient docs"


def test_hitl_approved_high_risk_has_conditions():
    app_id = "HITL-COND-001"
    submit_for_review(app_id, loan_amount=600000, applicant_name="Big Borrower")
    result = resume_with_decision(app_id, decision="approved", approver="senior-officer")
    assert result["final_status"] == "APPROVED"
    assert len(result["conditions"]) > 0
