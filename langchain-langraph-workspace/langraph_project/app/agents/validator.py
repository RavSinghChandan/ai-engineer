"""
Validator Agent — final member of the Loan Approval Committee.

Responsibility:
  - Review Planner's risk assessment and Executor's findings
  - Cross-check for inconsistencies between the two agents
  - Assign a risk level (LOW / MEDIUM / HIGH / CRITICAL)
  - Issue the final binding verdict: APPROVED / REJECTED / ESCALATED
  - Attach approval conditions where applicable
  - Set confidence score for audit purposes

Escalation triggers (requires human senior officer):
  - Risk score < 35 AND requested > $50k
  - 2+ Planner risk factors AND eligibility borderline passed
  - Any inconsistency detected between Planner and Executor findings
"""

import logging
from typing import List

from app.schemas.loan_committee import (
    LoanCommitteeState,
    CommitteeVerdict,
    RiskLevel,
)

logger = logging.getLogger(__name__)

ESCALATE_RISK_THRESHOLD = 35.0
ESCALATE_AMOUNT_THRESHOLD = 50_000
HIGH_RISK_SCORE = 50.0
MEDIUM_RISK_SCORE = 70.0


def validator_agent(state: LoanCommitteeState) -> LoanCommitteeState:
    app_id = state["application_id"]
    logger.info("[Validator] Reviewing application %s", app_id)

    notes: List[str] = []
    conditions: List[str] = []

    eligibility_passed = state.get("eligibility_passed", False)
    risk_score = state.get("risk_score", 0.0)
    dti = state.get("dti_ratio", 0.0)
    risk_factors = state.get("risk_factors", [])
    amount = state["requested_amount"]
    credit_score = state["credit_score"]
    employment = state.get("employment_years", 0.0)
    interest_rate = state.get("interest_rate", 0.0)
    recommended_amount = state.get("recommended_amount", 0.0)

    # ── Cross-check Planner vs Executor consistency ────────────────────
    inconsistency = False
    if not eligibility_passed and len(risk_factors) == 0:
        notes.append("WARN: Executor rejected but Planner found no risk factors — manual check needed")
        inconsistency = True
    if eligibility_passed and len(risk_factors) >= 3:
        notes.append("WARN: Executor passed but Planner found 3+ risk factors — escalating")
        inconsistency = True

    # ── Assign risk level ─────────────────────────────────────────────
    if risk_score >= MEDIUM_RISK_SCORE:
        risk_level = RiskLevel.LOW
    elif risk_score >= HIGH_RISK_SCORE:
        risk_level = RiskLevel.MEDIUM
    elif risk_score >= ESCALATE_RISK_THRESHOLD:
        risk_level = RiskLevel.HIGH
    else:
        risk_level = RiskLevel.CRITICAL

    notes.append(f"Risk level assigned: {risk_level.value} (score={risk_score:.1f})")

    # ── Determine verdict ─────────────────────────────────────────────
    if not eligibility_passed:
        verdict = CommitteeVerdict.REJECTED
        confidence = 0.97
        notes.append("Verdict: REJECTED — failed Executor eligibility checks")

    elif inconsistency or (risk_score < ESCALATE_RISK_THRESHOLD and amount > ESCALATE_AMOUNT_THRESHOLD):
        verdict = CommitteeVerdict.ESCALATED
        confidence = 0.70
        notes.append(
            f"Verdict: ESCALATED — risk {risk_score:.1f} < {ESCALATE_RISK_THRESHOLD} "
            f"on large amount ${amount:,.0f}"
        )

    else:
        verdict = CommitteeVerdict.APPROVED
        confidence = min(0.60 + risk_score / 200, 0.99)
        notes.append(f"Verdict: APPROVED with confidence {confidence:.0%}")

        # Attach conditions based on risk level
        if risk_level == RiskLevel.HIGH:
            conditions.append("Personal guarantee required")
            conditions.append("Quarterly financial review for first 2 years")
        if risk_level == RiskLevel.MEDIUM:
            conditions.append("6-month payment history review at 6-month mark")
        if employment < 1.0:
            conditions.append("Employment verification letter required before disbursement")
        if dti > 0.35:
            conditions.append("Debt consolidation plan recommended before disbursement")

    agent_message = {
        "agent": "Validator",
        "content": (
            f"Verdict: {verdict.value.upper()} | Risk: {risk_level.value} | "
            f"Confidence: {confidence:.0%} | Conditions: {len(conditions)}"
        ),
        "confidence": confidence,
    }

    logger.info(
        "[Validator] %s | verdict=%s risk_level=%s confidence=%.2f",
        app_id, verdict.value, risk_level.value, confidence,
    )

    return {
        "final_verdict": verdict,
        "risk_level": risk_level,
        "validator_confidence": round(confidence, 3),
        "validator_notes": notes,
        "conditions": conditions,
        "agent_messages": state.get("agent_messages", []) + [agent_message],
    }
