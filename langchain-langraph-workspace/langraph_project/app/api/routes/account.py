import logging

from fastapi import APIRouter, HTTPException

from app.schemas.account import AccountQueryRequest, AccountQueryResponse
from app.graphs.account_agent import run_account_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post("/query", response_model=AccountQueryResponse)
async def query_account(request: AccountQueryRequest) -> AccountQueryResponse:
    """
    Natural-language query against a bank account.
    The LangGraph agent decides which tools to call (account details,
    transactions, or both) and synthesises a final answer.
    """
    try:
        result = run_account_agent(
            account_id=request.account_id,
            query=request.query,
        )
    except Exception as exc:
        logger.exception("Account agent failed for %s", request.account_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AccountQueryResponse(
        account_id=request.account_id,
        query=request.query,
        answer=result["answer"],
        tools_used=result["tools_used"],
    )
