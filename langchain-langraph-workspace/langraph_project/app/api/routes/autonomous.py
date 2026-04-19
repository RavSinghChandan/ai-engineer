"""
Step 11 — Autonomous Banking AI Agent Route

POST /api/v1/autonomous/query

Single endpoint that routes any natural-language banking query through the
master orchestrator graph, which auto-selects the right workflow and returns
a unified response with full execution traceability.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.autonomous import AutonomousRequest, AutonomousResponse
from app.graphs.autonomous_agent import run_autonomous_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/autonomous", tags=["Autonomous Agent"])


@router.post(
    "/query",
    response_model=AutonomousResponse,
    summary="Autonomous Banking AI Agent",
    description=(
        "**Step 11 — Master Orchestrator.**\n\n"
        "Send any natural-language banking query. The agent will:\n\n"
        "1. **Classify intent** (keyword + LLM fallback)\n"
        "2. **Select workflow** — loan, account, compliance, transaction, "
        "committee, resilience, or conversation\n"
        "3. **Execute the specialist sub-graph** for that domain\n"
        "4. **Augment with RAG** for compliance queries\n"
        "5. **Fallback gracefully** if any sub-graph fails\n\n"
        "The `execution_steps` field in the response provides a full audit trail.\n\n"
        "**Tip:** Supply `context` with structured data (credit_score, annual_income, etc.) "
        "to get precise loan/committee verdicts instead of demo defaults."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Loan query": {
                            "summary": "Check loan eligibility",
                            "value": {
                                "query": "Am I eligible for a home loan?",
                                "session_id": "sess-001",
                                "context": {
                                    "loan_type": "home",
                                    "requested_amount": 400000,
                                    "annual_income": 120000,
                                    "credit_score": 740,
                                    "employment_years": 7,
                                    "existing_debt": 5000,
                                },
                            },
                        },
                        "Account query": {
                            "summary": "Account balance inquiry",
                            "value": {
                                "query": "What is my account balance and recent transactions?",
                                "session_id": "sess-002",
                                "account_id": "ACC-001",
                            },
                        },
                        "Compliance query": {
                            "summary": "KYC policy question",
                            "value": {
                                "query": "What are the KYC documentation requirements for business accounts?",
                                "session_id": "sess-003",
                            },
                        },
                        "Transaction routing": {
                            "summary": "Route a fraud-check transaction",
                            "value": {
                                "query": "Check this suspicious transaction for fraud",
                                "session_id": "sess-004",
                                "context": {
                                    "transaction_type": "fraud_check",
                                    "amount": 75000,
                                },
                            },
                        },
                        "General conversation": {
                            "summary": "General banking question",
                            "value": {
                                "query": "What savings account options do you offer?",
                                "session_id": "sess-005",
                            },
                        },
                    }
                }
            }
        }
    },
)
async def autonomous_query(request: AutonomousRequest) -> AutonomousResponse:
    try:
        result = run_autonomous_agent(
            query=request.query,
            session_id=request.session_id,
            account_id=request.account_id,
            context=request.context,
        )
        logger.info(
            "[Autonomous] Query handled | workflow=%s fallback=%s steps=%d",
            result["workflow_used"], result["used_fallback"], len(result["execution_steps"]),
        )
        return AutonomousResponse(
            query=request.query,
            answer=result["answer"],
            workflow_used=result["workflow_used"],
            sources=result["sources"],
            used_fallback=result["used_fallback"],
            execution_steps=result["execution_steps"],
            session_id=request.session_id,
        )
    except Exception as exc:
        logger.exception("[Autonomous] Unhandled error for query: %s", request.query)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
