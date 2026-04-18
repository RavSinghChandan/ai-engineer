import logging
from fastapi import APIRouter, HTTPException
from app.schemas.conversation import ConversationRequest, ConversationResponse, ChatMessage
from app.graphs.conversation_agent import run_conversation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversation", tags=["Conversation"])


@router.post(
    "/chat",
    response_model=ConversationResponse,
    summary="Multi-turn banking chat",
    description=(
        "Stateful conversational assistant backed by **LangGraph MemorySaver** checkpoints.\n\n"
        "**How memory works:**\n"
        "- Same `session_id` → conversation continues (full history replayed automatically)\n"
        "- New `session_id` → fresh conversation starts\n"
        "- `account_id` → previous topics are injected as context on new sessions (long-term profile)\n\n"
        "**Graph:** `load_context → detect_intent → respond → save_context`\n\n"
        "**Intents detected:** balance · transaction · loan · compliance · account · fraud · general"
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Turn 1 — start session": {
                            "summary": "First message in a new session",
                            "value": {"session_id": "sess-001", "message": "What are the KYC requirements for opening an account?", "account_id": "ACC-1001"},
                        },
                        "Turn 2 — continue session": {
                            "summary": "Follow-up (same session_id — LLM remembers Turn 1)",
                            "value": {"session_id": "sess-001", "message": "And what about AML rules?"},
                        },
                        "New session": {
                            "summary": "Different session_id = fresh start",
                            "value": {"session_id": "sess-002", "message": "Can I get a personal loan?", "account_id": "ACC-1001"},
                        },
                    }
                }
            }
        }
    },
)
async def chat(request: ConversationRequest) -> ConversationResponse:
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


@router.delete(
    "/chat/{session_id}",
    status_code=204,
    summary="Clear a conversation session",
    description="Deletes the MemorySaver checkpoint for the given `session_id`. Use on logout or to start fresh.",
)
async def clear_session(session_id: str) -> None:
    from app.memory.store import get_checkpointer
    try:
        get_checkpointer().storage.pop(session_id, None)
    except Exception:
        pass
