import logging

from fastapi import APIRouter, HTTPException

from app.schemas.loan import LoanEligibilityRequest, LoanEligibilityResponse
from app.graphs.loan_eligibility import run_loan_eligibility

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loans", tags=["Loans"])


@router.post("/eligibility", response_model=LoanEligibilityResponse)
async def check_loan_eligibility(request: LoanEligibilityRequest) -> LoanEligibilityResponse:
    """
    Runs the applicant through the multi-step LangGraph loan eligibility workflow.
    """
    try:
        result = run_loan_eligibility(request.model_dump())
    except Exception as exc:
        logger.exception("Loan eligibility workflow failed for %s", request.applicant_id)
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
