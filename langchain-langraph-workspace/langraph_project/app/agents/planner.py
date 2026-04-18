"""
Planner Agent — first member of the Loan Approval Committee.

Responsibility:
  - Read the raw application
  - Identify risk factors upfront
  - Produce a structured evaluation plan for the Executor
  - Flag required checks based on loan type and amount

Runs deterministically (no LLM) for speed and cost efficiency.
For large/complex loans the plan triggers deeper checks in Executor.
"""

import logging
from app.schemas.loan_committee import LoanCommitteeState, RiskLevel

logger = logging.getLogger(__name__)

LARGE_LOAN_THRESHOLD = 100_000
HIGH_RISK_SCORE_THRESHOLD = 660
LOW_EMPLOYMENT_YEARS = 1.0


def planner_agent(state: LoanCommitteeState) -> LoanCommitteeState:
    app_id = state["application_id"]
    logger.info("[Planner] Evaluating application %s", app_id)

    risk_factors: list[str] = []
    required_checks: list[str] = ["credit_score_check", "dti_check", "income_verification"]
    evaluation_plan: list[str] = []

    # ── Risk factor identification ──────────────────────────────────────
    credit_score = state["credit_score"]
    amount = state["requested_amount"]
    income = state["annual_income"]
    employment = state["employment_years"]
    existing_debt = state.get("existing_debt", 0.0)
    loan_type = state["loan_type"]

    if credit_score < HIGH_RISK_SCORE_THRESHOLD:
        risk_factors.append(f"Below-average credit score: {credit_score}")

    if amount > LARGE_LOAN_THRESHOLD:
        risk_factors.append(f"Large loan request: ${amount:,.0f}")
        required_checks.append("collateral_assessment")
        required_checks.append("business_plan_review")

    if employment < LOW_EMPLOYMENT_YEARS:
        risk_factors.append(f"Short employment history: {employment} years")
        required_checks.append("employment_verification")

    if existing_debt > income * 0.3:
        risk_factors.append(f"High existing debt: ${existing_debt:,.0f} vs income ${income:,.0f}")

    if loan_type in ("business", "home"):
        required_checks.append("property_or_business_valuation")

    # ── Build evaluation plan ────────────────────────────────────────────
    evaluation_plan.append("1. Verify applicant identity and income documentation")
    evaluation_plan.append(f"2. Run credit bureau check (score: {credit_score})")
    evaluation_plan.append("3. Calculate debt-to-income ratio and stress test")
    if amount > LARGE_LOAN_THRESHOLD:
        evaluation_plan.append("4. Assess collateral / guarantor requirements")
        evaluation_plan.append("5. Request 3-year financial statements")
    evaluation_plan.append(
        f"{'4' if amount <= LARGE_LOAN_THRESHOLD else '6'}. "
        "Score overall risk and recommend loan terms"
    )
    evaluation_plan.append(
        f"{'5' if amount <= LARGE_LOAN_THRESHOLD else '7'}. "
        "Validator committee final sign-off"
    )

    agent_message = {
        "agent": "Planner",
        "content": (
            f"Identified {len(risk_factors)} risk factor(s). "
            f"Required checks: {', '.join(required_checks)}. "
            f"Plan has {len(evaluation_plan)} steps."
        ),
        "confidence": 1.0,
    }

    logger.info("[Planner] %s | risks=%s checks=%s", app_id, risk_factors, required_checks)

    return {
        "evaluation_plan": evaluation_plan,
        "risk_factors": risk_factors,
        "required_checks": required_checks,
        "agent_messages": state.get("agent_messages", []) + [agent_message],
    }
