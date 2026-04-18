"""
Executor Agent — second member of the Loan Approval Committee.

Responsibility:
  - Execute the Planner's required checks
  - Run the full loan eligibility calculation (reuses Step 3 logic)
  - Produce concrete numbers: DTI, risk score, interest rate, approved amount
  - Attach notes explaining each finding for the Validator
"""

import logging
from typing import List

from app.schemas.loan_committee import LoanCommitteeState

logger = logging.getLogger(__name__)

# ── Replicated business rules from Step 3 (single source in production would
#    be a shared service, here inlined for module independence) ────────────

MAX_DTI = 0.43
CREDIT_THRESHOLDS = {
    "home": 680, "business": 660, "auto": 620, "personal": 600
}
MAX_LOAN_MULTIPLES = {
    "home": 5.0, "business": 3.0, "auto": 1.5, "personal": 1.0
}
BASE_RATES = {
    "home": 6.5, "business": 8.0, "auto": 7.0, "personal": 9.5
}


def _compute_dti(annual_income: float, existing_debt: float, requested_amount: float) -> float:
    monthly_income = annual_income / 12
    estimated_payment = requested_amount * 0.01
    return (existing_debt / 12 + estimated_payment) / monthly_income


def _compute_risk_score(credit_score: int, dti: float, employment_years: float) -> float:
    credit_component = (credit_score - 300) / 550 * 50
    dti_component = max(0, (1 - dti / MAX_DTI)) * 30
    employment_component = min(employment_years / 5, 1) * 20
    return round(credit_component + dti_component + employment_component, 2)


def _compute_interest_rate(loan_type: str, credit_score: int, risk_score: float) -> float:
    base = BASE_RATES.get(loan_type, 9.5)
    credit_adj = (750 - credit_score) / 100 * 0.5
    risk_adj = (70 - risk_score) / 100 * 1.0
    return round(max(3.0, min(base + credit_adj + risk_adj, 25.0)), 2)


def executor_agent(state: LoanCommitteeState) -> LoanCommitteeState:
    app_id = state["application_id"]
    logger.info("[Executor] Running checks for %s", app_id)

    notes: List[str] = []
    loan_type = state["loan_type"]
    credit_score = state["credit_score"]
    amount = state["requested_amount"]
    income = state["annual_income"]
    existing_debt = state.get("existing_debt", 0.0)
    employment = state.get("employment_years", 0.0)

    eligibility_passed = True

    # ── Check 1: Credit score ──────────────────────────────────────────
    threshold = CREDIT_THRESHOLDS.get(loan_type, 600)
    if credit_score < threshold:
        eligibility_passed = False
        notes.append(
            f"FAIL credit_score_check: score {credit_score} < minimum {threshold} for {loan_type} loan"
        )
    else:
        notes.append(f"PASS credit_score_check: {credit_score} >= {threshold}")

    # ── Check 2: DTI ──────────────────────────────────────────────────
    dti = round(_compute_dti(income, existing_debt, amount), 4)
    if dti > MAX_DTI:
        eligibility_passed = False
        notes.append(f"FAIL dti_check: DTI {dti:.1%} > max {MAX_DTI:.0%}")
    else:
        notes.append(f"PASS dti_check: DTI {dti:.1%} within limit")

    # ── Check 3: Income multiple ──────────────────────────────────────
    max_multiple = MAX_LOAN_MULTIPLES.get(loan_type, 1.0)
    max_allowed = income * max_multiple
    if amount > max_allowed:
        eligibility_passed = False
        notes.append(
            f"FAIL income_verification: ${amount:,.0f} > max ${max_allowed:,.0f} ({max_multiple}x income)"
        )
    else:
        notes.append(f"PASS income_verification: ${amount:,.0f} within ${max_allowed:,.0f}")

    # ── Compute scores and terms ─────────────────────────────────────
    risk_score = _compute_risk_score(credit_score, dti, employment)
    interest_rate = _compute_interest_rate(loan_type, credit_score, risk_score)
    recommended_amount = amount if eligibility_passed else 0.0

    notes.append(f"Risk score: {risk_score:.1f}/100")
    notes.append(f"Recommended rate: {interest_rate:.2f}%")

    confidence = 0.95 if eligibility_passed else 0.98  # high confidence on rejections
    agent_message = {
        "agent": "Executor",
        "content": (
            f"Eligibility: {'PASSED' if eligibility_passed else 'FAILED'}. "
            f"DTI: {dti:.1%}. Risk: {risk_score:.1f}. Rate: {interest_rate:.2f}%."
        ),
        "confidence": confidence,
    }

    logger.info(
        "[Executor] %s | eligible=%s dti=%.3f risk=%.1f rate=%.2f%%",
        app_id, eligibility_passed, dti, risk_score, interest_rate,
    )

    return {
        "eligibility_passed": eligibility_passed,
        "dti_ratio": dti,
        "risk_score": risk_score,
        "interest_rate": interest_rate,
        "recommended_amount": recommended_amount,
        "executor_notes": notes,
        "agent_messages": state.get("agent_messages", []) + [agent_message],
    }
