import logging
from fastapi import APIRouter, HTTPException
from app.schemas.loan_committee import LoanCommitteeRequest, LoanCommitteeResponse
from app.graphs.loan_committee import run_loan_committee

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/committee", tags=["Loan Committee"])


@router.post(
    "/evaluate",
    response_model=LoanCommitteeResponse,
    summary="Evaluate a loan via 3-agent committee",
    description=(
        "Runs the application through a **multi-agent LangGraph pipeline**:\n\n"
        "1. **Planner** — identifies risk factors, builds evaluation plan, lists required checks\n"
        "2. **Executor** — runs credit/DTI/income checks, computes risk score and interest rate\n"
        "3. **Validator** — cross-checks both agents, assigns risk level, issues binding verdict\n\n"
        "**Verdicts:** `approved` · `rejected` · `escalated` (requires senior officer review)\n\n"
        "**Escalation triggers:** risk score < 35 on large loans, or inconsistency between agents.\n\n"
        "Returns full audit trail (`agent_messages`) with each agent's reasoning and confidence."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Strong applicant — APPROVED": {
                            "summary": "Score 750, low DTI → APPROVED (low risk, 99% confidence)",
                            "value": {"application_id": "APP-001", "applicant_name": "Alice Johnson", "loan_type": "personal", "requested_amount": 20000, "annual_income": 80000, "credit_score": 750, "employment_years": 6, "existing_debt": 500},
                        },
                        "Low credit — REJECTED": {
                            "summary": "Score 620 < 680 home minimum → REJECTED",
                            "value": {"application_id": "APP-002", "applicant_name": "Bob Smith", "loan_type": "home", "requested_amount": 300000, "annual_income": 90000, "credit_score": 620, "employment_years": 5, "existing_debt": 0},
                        },
                        "Large business + high DTI — ESCALATED": {
                            "summary": "High risk, large amount → ESCALATED for senior review",
                            "value": {"application_id": "APP-003", "applicant_name": "Carol Lee", "loan_type": "business", "requested_amount": 150000, "annual_income": 60000, "credit_score": 640, "employment_years": 0.5, "existing_debt": 20000},
                        },
                    }
                }
            }
        }
    },
)
async def evaluate_loan(request: LoanCommitteeRequest) -> LoanCommitteeResponse:
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
