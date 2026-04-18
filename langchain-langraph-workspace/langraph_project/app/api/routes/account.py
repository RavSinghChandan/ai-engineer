import logging
from fastapi import APIRouter, HTTPException
from app.schemas.account import AccountQueryRequest, AccountQueryResponse
from app.graphs.account_agent import run_account_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post(
    "/query",
    response_model=AccountQueryResponse,
    summary="Natural-language account query",
    description=(
        "Ask any question about a bank account in plain English. "
        "A **ReAct LangGraph agent** autonomously decides which tools to call:\n\n"
        "- `get_account_details(account_id)` — owner, type, status, balance, branch\n"
        "- `get_transactions(account_id, limit)` — recent transaction history\n\n"
        "The agent loops (tool call → result → next decision) until it has enough "
        "information to produce a final answer.\n\n"
        "**Available test accounts:** `ACC-1001` (Alice, active), "
        "`ACC-1002` (Bob, savings), `ACC-1003` (Carol, frozen)"
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Balance query": {
                            "summary": "What is my current balance?",
                            "value": {"account_id": "ACC-1001", "query": "What is my current balance?"},
                        },
                        "Transaction history": {
                            "summary": "Show last 3 transactions",
                            "value": {"account_id": "ACC-1001", "query": "Show me my last 3 transactions"},
                        },
                        "Full account summary": {
                            "summary": "Account status + recent activity",
                            "value": {"account_id": "ACC-1002", "query": "What is my account status and recent activity?"},
                        },
                    }
                }
            }
        }
    },
)
async def query_account(request: AccountQueryRequest) -> AccountQueryResponse:
    try:
        result = run_account_agent(account_id=request.account_id, query=request.query)
    except Exception as exc:
        logger.exception("Account agent failed for %s", request.account_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AccountQueryResponse(
        account_id=request.account_id,
        query=request.query,
        answer=result["answer"],
        tools_used=result["tools_used"],
    )
