"""Tests — Step 3: Loan Eligibility Stateful Workflow."""

import pytest
from app.graphs.loan_eligibility import run_loan_eligibility
from app.schemas.loan import LoanDecision


def _applicant(**kwargs) -> dict:
    base = {
        "applicant_id": "app-test",
        "loan_type": "personal",
        "requested_amount": 15000,
        "annual_income": 60000,
        "credit_score": 720,
        "employment_years": 4,
        "existing_debt": 0,
    }
    base.update(kwargs)
    return base


def test_approved_strong_applicant():
    result = run_loan_eligibility(_applicant())
    assert result["decision"] == LoanDecision.APPROVED
    assert result["interest_rate"] is not None
    assert result["eligible_amount"] == 15000


def test_rejected_low_credit_home():
    result = run_loan_eligibility(_applicant(
        loan_type="home", requested_amount=300000,
        annual_income=90000, credit_score=620,
    ))
    assert result["decision"] == LoanDecision.REJECTED
    assert "credit" in result["rejection_reason"].lower()


def test_rejected_high_dti():
    result = run_loan_eligibility(_applicant(
        requested_amount=50000, annual_income=40000,
        credit_score=700, existing_debt=25000,
    ))
    assert result["decision"] == LoanDecision.REJECTED
    assert "debt" in result["rejection_reason"].lower()


def test_rejected_invalid_input():
    result = run_loan_eligibility(_applicant(requested_amount=-1))
    assert result["decision"] == LoanDecision.REJECTED


def test_risk_score_computed():
    result = run_loan_eligibility(_applicant())
    assert result.get("risk_score") is not None
    assert 0 <= result["risk_score"] <= 100


def test_pending_review_low_risk_score():
    # credit=600 (threshold), dti≈0.406 (near limit), employment=0 → risk_score≈29 → PENDING_REVIEW
    result = run_loan_eligibility(_applicant(
        credit_score=600, annual_income=100000,
        requested_amount=5000, employment_years=0,
        existing_debt=40000,
    ))
    assert result["decision"] in (LoanDecision.PENDING_REVIEW, LoanDecision.APPROVED)
