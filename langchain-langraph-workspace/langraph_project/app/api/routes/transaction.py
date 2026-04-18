import logging
from fastapi import APIRouter, HTTPException
from app.schemas.transaction import (
    RouteTransactionRequest, RouteTransactionResponse,
    RoutingDecision, TransactionPriority,
)
from app.graphs.transaction_router import run_transaction_router

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.post(
    "/route",
    response_model=RouteTransactionResponse,
    summary="Route a transaction",
    description=(
        "Runs the transaction through a **LangGraph conditional-edge graph** "
        "(`classify_transaction → [6 routing nodes] → assign_priority`).\n\n"
        "**Routing decisions:**\n"
        "- `payment` → `payment_processor`\n"
        "- `loan` → `loan_engine`\n"
        "- `fraud_check` → `fraud_engine` *(flags for human review)*\n"
        "- `compliance` → `compliance_assistant`\n"
        "- `account_lookup` → `account_agent`\n"
        "- unknown → `human_review`\n\n"
        "**Priority logic:** HIGH for fraud / amount > $50k, MEDIUM for loans/payments, LOW otherwise."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Payment": {
                            "summary": "Route a payment",
                            "value": {"transaction_id": "txn-001", "transaction_type": "payment", "amount": 1200, "account_id": "ACC-1001"},
                        },
                        "Fraud Check (high value)": {
                            "summary": "High-value fraud check → HIGH priority + human review",
                            "value": {"transaction_id": "txn-002", "transaction_type": "fraud_check", "amount": 75000, "account_id": "ACC-1002"},
                        },
                        "Compliance Query": {
                            "summary": "Compliance question",
                            "value": {"transaction_id": "txn-003", "transaction_type": "compliance", "account_id": "ACC-1003"},
                        },
                    }
                }
            }
        }
    },
)
async def route_transaction(request: RouteTransactionRequest) -> RouteTransactionResponse:
    try:
        result = run_transaction_router(request.model_dump())
    except Exception as exc:
        logger.exception("Transaction routing failed for %s", request.transaction_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return RouteTransactionResponse(
        transaction_id=result["transaction_id"],
        routing_decision=result.get("routing_decision") or RoutingDecision.HUMAN_REVIEW,
        priority=result.get("priority") or TransactionPriority.LOW,
        requires_human_review=result.get("requires_human_review", False),
        metadata=result.get("metadata", {}),
    )
