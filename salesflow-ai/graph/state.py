from typing import Any, TypedDict


class SalesFlowState(TypedDict, total=False):
    # Raw input
    raw_message: dict[str, Any]

    # Normalized by intake_agent
    platform: str
    sender_id: str
    sender_name: str
    message_text: str
    message_type: str          # comment | dm
    timestamp: str
    media_id: str

    # Intent classification
    intent: str
    intent_confidence: float
    intent_reasoning: str

    # Lead / CRM
    lead_id: int
    is_new_lead: bool
    funnel_stage: str
    conversation_history: list[dict]

    # RAG
    rag_context: str

    # Response
    draft_reply: str

    # Guardrail
    reply_approved: bool
    guardrail_reason: str

    # Send
    sent: bool
    send_error: str

    # Pipeline trace
    agent_log: list[str]
