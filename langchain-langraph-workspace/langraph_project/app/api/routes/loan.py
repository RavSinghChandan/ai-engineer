import logging
from fastapi import APIRouter, HTTPException
from app.schemas.loan import LoanEligibilityRequest, LoanEligibilityResponse
from app.graphs.loan_eligibility import run_loan_eligibility

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/loans", tags=["Loans"])


@router.post(
    "/eligibility",
    response_model=LoanEligibilityResponse,
    summary="Check loan eligibility",
    description=(
        "Runs the applicant through a **6-node stateful LangGraph workflow**.\n\n"
        "**Pipeline:** `validate_input → check_credit_score → check_income → "
        "calculate_risk_score → calculate_loan_terms → make_final_decision`\n\n"
        "Any gate failure short-circuits directly to `reject_application`.\n\n"
        "**Business rules:**\n"
        "- Min credit score: 680 (home), 660 (business), 620 (auto), 600 (personal)\n"
        "- Max DTI: 43%\n"
        "- Max loan: 1× income (personal), 5× income (home)\n"
        "- Risk score < 30 → PENDING_REVIEW (human sign-off required)"
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Approved — strong applicant": {
                            "summary": "High score, low DTI → APPROVED",
                            "value": {"applicant_id": "app-001", "loan_type": "personal", "requested_amount": 20000, "annual_income": 80000, "credit_score": 750, "employment_years": 6, "existing_debt": 500},
                        },
                        "Rejected — low credit": {
                            "summary": "Score 620 < 680 minimum for home loan → REJECTED",
                            "value": {"applicant_id": "app-002", "loan_type": "home", "requested_amount": 300000, "annual_income": 90000, "credit_score": 620, "employment_years": 5, "existing_debt": 0},
                        },
                        "Rejected — high DTI": {
                            "summary": "DTI 77% > 43% maximum → REJECTED",
                            "value": {"applicant_id": "app-003", "loan_type": "personal", "requested_amount": 50000, "annual_income": 40000, "credit_score": 700, "employment_years": 3, "existing_debt": 25000},
                        },
                    }
                }
            }
        }
    },
)
async def check_loan_eligibility(request: LoanEligibilityRequest) -> LoanEligibilityResponse:
    try:
        result = run_loan_eligibility(request.model_dump())
    except Exception as exc:
        logger.exception("Loan eligibility failed for %s", request.applicant_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return LoanEligibilityResponse(
        applicant_id=result["applicant_id"],
        decision=result["decision"],
        eligible_amount=result.get("eligible_amount"),
        interest_rate=result.get("interest_rate"),
        loan_term_months=result.get("loan_term_months"),
        debt_to_income_ratio=result.get("debt_to_income_ratio"),
        risk_score=result.get("risk_score"),
        rejection_reason=result.get("rejection_reason"),
    )
