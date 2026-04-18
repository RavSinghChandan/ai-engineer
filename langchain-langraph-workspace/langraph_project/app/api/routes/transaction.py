import logging

from fastapi import APIRouter, HTTPException

from app.schemas.transaction import (
    RouteTransactionRequest,
    RouteTransactionResponse,
    RoutingDecision,
    TransactionPriority,
)
from app.graphs.transaction_router import run_transaction_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.post("/route", response_model=RouteTransactionResponse)
async def route_transaction(request: RouteTransactionRequest) -> RouteTransactionResponse:
    """
    Accepts a transaction and returns a routing decision via LangGraph.
    """
    try:
        result = run_transaction_router(request.model_dump())
    except Exception as exc:
        logger.exception("Transaction routing failed for %s", request.transaction_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    routing_decision = result.get("routing_decision") or RoutingDecision.HUMAN_REVIEW
    priority = result.get("priority") or TransactionPriority.LOW

    return RouteTransactionResponse(
        transaction_id=result["transaction_id"],
        routing_decision=routing_decision,
        priority=priority,
        requires_human_review=result.get("requires_human_review", False),
        metadata=result.get("metadata", {}),
    )
