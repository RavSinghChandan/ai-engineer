import logging

from fastapi import APIRouter, HTTPException

from app.schemas.conversation import (
    ConversationRequest,
    ConversationResponse,
    ChatMessage,
)
from app.graphs.conversation_agent import run_conversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["Conversation"])


@router.post("/chat", response_model=ConversationResponse)
async def chat(request: ConversationRequest) -> ConversationResponse:
    """
    Multi-turn banking assistant. Each call with the same session_id
    continues the existing conversation — full history is maintained via
    LangGraph MemorySaver checkpointing.
    """
    try:
        result = run_conversation(
            session_id=request.session_id,
            message=request.message,
            account_id=request.account_id,
        )
    except Exception as exc:
        logger.exception("Conversation failed | session=%s", request.session_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ConversationResponse(
        session_id=request.session_id,
        reply=result["reply"],
        intent=result.get("intent"),
        turn_count=result["turn_count"],
        history=[ChatMessage(**m) for m in result["history"]],
    )


@router.delete("/chat/{session_id}", status_code=204)
async def clear_session(session_id: str) -> None:
    """
    Clears the in-memory checkpoint for a session (logout / new conversation).
    In production this would delete the DB row.
    """
    from app.memory.store import get_checkpointer
    checkpointer = get_checkpointer()
    # MemorySaver stores by thread_id; delete by overwriting with empty state
    try:
        checkpointer.storage.pop(session_id, None)
    except Exception:
        pass  # safe no-op if session doesn't exist
