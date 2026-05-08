"""
Step 3 — Loan Eligibility Stateful Workflow

State persists and accumulates across every node:

  validate_input
       │
       ▼ (pass / fail)
  check_credit_score  ──(fail)──▶  reject_application
       │                                  │
       ▼ (pass)                           ▼
  check_income  ──────(fail)──────▶  reject_application
       │                                  │
       ▼ (pass)                           ▼
  calculate_risk_score                   END
       │
       ▼
  calculate_loan_terms
       │
       ▼
  make_final_decision
       │
       ▼
      END
"""

import logging
from typing import Literal

from langgraph.graph import StateGraph, END

from app.schemas.loan import LoanDecision, LoanState, LoanType

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Business rule constants
# ---------------------------------------------------------------------------

CREDIT_THRESHOLDS = {
    LoanType.HOME: 680,
    LoanType.BUSINESS: 660,
    LoanType.AUTO: 620,
    LoanType.PERSONAL: 600,
}

MAX_DTI = 0.43          # Maximum debt-to-income ratio (43% — standard banking rule)
MAX_LOAN_MULTIPLES = {  # Max loan as multiple of annual income
    LoanType.HOME: 5.0,
    LoanType.BUSINESS: 3.0,
    LoanType.AUTO: 1.5,
    LoanType.PERSONAL: 1.0,
}

BASE_RATES = {          # Base interest rate per loan type
    LoanType.HOME: 6.5,
    LoanType.BUSINESS: 8.0,
    LoanType.AUTO: 7.0,
    LoanType.PERSONAL: 9.5,
}

LOAN_TERMS = {
    LoanType.HOME: 360,
    LoanType.BUSINESS: 84,
    LoanType.AUTO: 60,
    LoanType.PERSONAL: 36,
}


# ---------------------------------------------------------------------------
# Node 1 — Input validation
# ---------------------------------------------------------------------------

def validate_input(state: LoanState) -> LoanState:
    logger.info("Validating input for applicant %s", state["applicant_id"])

    errors = []
    if state["requested_amount"] <= 0:
        errors.append("Requested amount must be positive")
    if state["annual_income"] <= 0:
        errors.append("Annual income must be positive")
    if not (300 <= state["credit_score"] <= 850):
        errors.append("Credit score must be between 300 and 850")
    if state.get("employment_years", 0) < 0:
        errors.append("Employment years cannot be negative")

    if errors:
        logger.warning("Validation failed: %s", errors)
        return {"validation_passed": False, "error": "; ".join(errors)}

    return {"validation_passed": True}


# ---------------------------------------------------------------------------
# Node 2 — Credit score check
# ---------------------------------------------------------------------------

def check_credit_score(state: LoanState) -> LoanState:
    score = state["credit_score"]
    loan_type = state.get("loan_type", LoanType.PERSONAL)
    threshold = CREDIT_THRESHOLDS.get(loan_type, 600)

    logger.info("Credit check | applicant=%s score=%d threshold=%d", state["applicant_id"], score, threshold)

    if score < threshold:
        return {
            "decision": LoanDecision.REJECTED,
            "rejection_reason": f"Credit score {score} below minimum {threshold} for {loan_type} loan",
        }
    return {}


# ---------------------------------------------------------------------------
# Node 3 — Income & DTI check
# ---------------------------------------------------------------------------

def check_income(state: LoanState) -> LoanState:
    annual_income = state["annual_income"]
    requested_amount = state["requested_amount"]
    existing_debt = state.get("existing_debt", 0.0)
    loan_type = state.get("loan_type", LoanType.PERSONAL)

    monthly_income = annual_income / 12
    estimated_monthly_payment = requested_amount * 0.01  # rough 1% of principal
    dti = (existing_debt / 12 + estimated_monthly_payment) / monthly_income

    max_multiple = MAX_LOAN_MULTIPLES.get(loan_type, 1.0)
    max_allowed = annual_income * max_multiple

    logger.info(
        "Income check | applicant=%s dti=%.2f max_dti=%.2f requested=%s max_allowed=%s",
        state["applicant_id"], dti, MAX_DTI, requested_amount, max_allowed,
    )

    if dti > MAX_DTI:
        return {
            "debt_to_income_ratio": round(dti, 4),
            "decision": LoanDecision.REJECTED,
            "rejection_reason": f"Debt-to-income ratio {dti:.1%} exceeds maximum {MAX_DTI:.0%}",
        }

    if requested_amount > max_allowed:
        return {
            "debt_to_income_ratio": round(dti, 4),
            "decision": LoanDecision.REJECTED,
            "rejection_reason": (
                f"Requested amount ${requested_amount:,.0f} exceeds max "
                f"${max_allowed:,.0f} ({max_multiple}x income) for {loan_type} loan"
            ),
        }

    return {"debt_to_income_ratio": round(dti, 4)}


# ---------------------------------------------------------------------------
# Node 4 — Risk scoring
# ---------------------------------------------------------------------------

def calculate_risk_score(state: LoanState) -> LoanState:
    credit_score = state["credit_score"]
    dti = state.get("debt_to_income_ratio", 0.0)
    employment_years = state.get("employment_years", 0.0)

    # Normalised 0-100 (lower = riskier)
    credit_component = (credit_score - 300) / 550 * 50      # 0-50 pts
    dti_component = max(0, (1 - dti / MAX_DTI)) * 30        # 0-30 pts
    employment_component = min(employment_years / 5, 1) * 20 # 0-20 pts

    risk_score = round(credit_component + dti_component + employment_component, 2)
    logger.info("Risk score for %s → %.2f", state["applicant_id"], risk_score)
    return {"risk_score": risk_score}


# ---------------------------------------------------------------------------
# Node 5 — Loan term calculation
# ---------------------------------------------------------------------------

def calculate_loan_terms(state: LoanState) -> LoanState:
    loan_type = state.get("loan_type", LoanType.PERSONAL)
    credit_score = state["credit_score"]
    risk_score = state.get("risk_score", 50.0)
    requested_amount = state["requested_amount"]

    base_rate = BASE_RATES.get(loan_type, 9.5)

    # Risk-adjusted rate: excellent credit lowers rate, poor risk raises it
    credit_adjustment = (750 - credit_score) / 100 * 0.5
    risk_adjustment = (70 - risk_score) / 100 * 1.0
    final_rate = round(base_rate + credit_adjustment + risk_adjustment, 2)
    final_rate = max(3.0, min(final_rate, 25.0))  # clamp to realistic range

    term_months = LOAN_TERMS.get(loan_type, 36)
    eligible_amount = requested_amount  # full amount approved at this stage

    logger.info(
        "Loan terms | applicant=%s rate=%.2f%% term=%dm amount=$%.0f",
        state["applicant_id"], final_rate, term_months, eligible_amount,
    )
    return {
        "interest_rate": final_rate,
        "loan_term_months": term_months,
        "eligible_amount": eligible_amount,
    }


# ---------------------------------------------------------------------------
# Node 6 — Final decision
# ---------------------------------------------------------------------------

def make_final_decision(state: LoanState) -> LoanState:
    risk_score = state.get("risk_score", 0.0)

    if risk_score < 30:
        decision = LoanDecision.PENDING_REVIEW
        logger.warning("Applicant %s flagged for manual review (risk=%.1f)", state["applicant_id"], risk_score)
    else:
        decision = LoanDecision.APPROVED
        logger.info("Applicant %s APPROVED (risk=%.1f)", state["applicant_id"], risk_score)

    return {"decision": decision}


# ---------------------------------------------------------------------------
# Node — Rejection (terminal for failed paths)
# ---------------------------------------------------------------------------

def reject_application(state: LoanState) -> LoanState:
    logger.info("Application rejected | applicant=%s reason=%s", state["applicant_id"], state.get("rejection_reason"))
    return {"decision": LoanDecision.REJECTED}


# ---------------------------------------------------------------------------
# Conditional edges
# ---------------------------------------------------------------------------

def after_validation(state: LoanState) -> Literal["check_credit_score", "reject_application"]:
    if not state.get("validation_passed", False):
        return "reject_application"
    return "check_credit_score"


def after_credit_check(state: LoanState) -> Literal["check_income", "reject_application"]:
    if state.get("decision") == LoanDecision.REJECTED:
        return "reject_application"
    return "check_income"


def after_income_check(state: LoanState) -> Literal["calculate_risk_score", "reject_application"]:
    if state.get("decision") == LoanDecision.REJECTED:
        return "reject_application"
    return "calculate_risk_score"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_loan_eligibility_graph():
    graph = StateGraph(LoanState)

    graph.add_node("validate_input", validate_input)
    graph.add_node("check_credit_score", check_credit_score)
    graph.add_node("check_income", check_income)
    graph.add_node("calculate_risk_score", calculate_risk_score)
    graph.add_node("calculate_loan_terms", calculate_loan_terms)
    graph.add_node("make_final_decision", make_final_decision)
    graph.add_node("reject_application", reject_application)

    graph.set_entry_point("validate_input")

    graph.add_conditional_edges("validate_input", after_validation, {
        "check_credit_score": "check_credit_score",
        "reject_application": "reject_application",
    })

    graph.add_conditional_edges("check_credit_score", after_credit_check, {
        "check_income": "check_income",
        "reject_application": "reject_application",
    })

    graph.add_conditional_edges("check_income", after_income_check, {
        "calculate_risk_score": "calculate_risk_score",
        "reject_application": "reject_application",
    })

    graph.add_edge("calculate_risk_score", "calculate_loan_terms")
    graph.add_edge("calculate_loan_terms", "make_final_decision")
    graph.add_edge("make_final_decision", END)
    graph.add_edge("reject_application", END)

    return graph.compile()


loan_eligibility_graph = build_loan_eligibility_graph()


def run_loan_eligibility(request_data: dict) -> dict:
    result = loan_eligibility_graph.invoke(request_data)
    return result
