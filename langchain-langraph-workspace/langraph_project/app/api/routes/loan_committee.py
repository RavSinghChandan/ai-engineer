import logging

from fastapi import APIRouter, HTTPException

from app.schemas.loan_committee import LoanCommitteeRequest, LoanCommitteeResponse
from app.graphs.loan_committee import run_loan_committee

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/committee", tags=["Loan Committee"])


@router.post("/evaluate", response_model=LoanCommitteeResponse)
async def evaluate_loan(request: LoanCommitteeRequest) -> LoanCommitteeResponse:
    """
    Routes the loan application through the three-agent committee:
    Planner → Executor → Validator.
    Returns the binding verdict with full audit trail.
    """
    try:
        result = run_loan_committee(request.model_dump())
    except Exception as exc:
        logger.exception("Committee evaluation failed | app=%s", request.application_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return LoanCommitteeResponse(
        application_id=result["application_id"],
        applicant_name=result["applicant_name"],
        final_verdict=result["final_verdict"],
        risk_level=result["risk_level"],
        recommended_amount=result.get("recommended_amount"),
        interest_rate=result.get("interest_rate"),
        conditions=result.get("conditions", []),
        validator_confidence=result.get("validator_confidence", 0.0),
        evaluation_plan=result.get("evaluation_plan", []),
        executor_notes=result.get("executor_notes", []),
        validator_notes=result.get("validator_notes", []),
        agent_messages=result.get("agent_messages", []),
    )
