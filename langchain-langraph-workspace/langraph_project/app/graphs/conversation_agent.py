"""
Step 6 — Conversational Banking Assistant with Memory

Graph flow (compiled WITH MemorySaver checkpointer):

  load_context
       │
       ▼
  detect_intent         (classify what the user wants)
       │
       ▼
  respond               (LLM with full history + profile context)
       │
       ▼
  save_context          (persist topic to long-term profile)
       │
       ▼
      END

LangGraph's MemorySaver checkpointer replays the full message list on
every invocation using thread_id = session_id, giving the LLM complete
multi-turn context without any manual history management.
"""

import logging
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from app.schemas.conversation import ConversationState
from app.memory.store import (
    get_checkpointer,
    get_user_profile,
    append_topic,
    update_user_profile,
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT_TEMPLATE = """You are a helpful, professional banking assistant for Bank of America.
You have full memory of this conversation — refer to earlier messages naturally when relevant.

{profile_context}
{account_context}

Capabilities:
- Answer questions about accounts, balances, transactions
- Explain banking products (loans, savings, credit cards)
- Guide compliance and policy queries
- Assist with general banking procedures

Always be concise, accurate, and professional. Never fabricate account data.
If the customer asks something requiring live data, acknowledge you'd need to look it up."""

INTENT_KEYWORDS = {
    "balance": ["balance", "how much", "funds", "available"],
    "transaction": ["transaction", "payment", "transfer", "history", "spent", "charged"],
    "loan": ["loan", "mortgage", "borrow", "credit", "interest rate", "emi"],
    "compliance": ["kyc", "aml", "gdpr", "regulation", "policy", "compliance", "law"],
    "account": ["account", "open", "close", "type", "details", "statement"],
    "fraud": ["fraud", "suspicious", "stolen", "unauthorized", "dispute", "block"],
}


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def load_context(state: ConversationState) -> ConversationState:
    """Inject user profile + account context as the system message on turn 1."""
    account_id = state.get("account_id")
    messages = state.get("messages", [])

    # Only inject system message on the very first turn
    has_system = any(isinstance(m, SystemMessage) for m in messages)
    if has_system:
        return {}

    profile = get_user_profile(account_id) if account_id else {}

    profile_lines = []
    if profile.get("name"):
        profile_lines.append(f"Customer name: {profile['name']}")
    if profile.get("last_topics"):
        profile_lines.append(f"Previous topics discussed: {', '.join(profile['last_topics'][-3:])}")

    profile_context = "\n".join(profile_lines) if profile_lines else ""
    account_context = f"Linked account: {account_id}" if account_id else ""

    system_msg = SystemMessage(
        content=SYSTEM_PROMPT_TEMPLATE.format(
            profile_context=profile_context,
            account_context=account_context,
        )
    )

    logger.info("Session %s — injecting system context (turn 1)", state.get("session_id"))
    return {"messages": [system_msg], "user_profile": profile}


def detect_intent(state: ConversationState) -> ConversationState:
    """Lightweight keyword-based intent detection — no LLM cost."""
    messages = state.get("messages", [])
    last_human = next(
        (m for m in reversed(messages) if isinstance(m, HumanMessage)), None
    )
    if not last_human:
        return {"current_intent": "general"}

    text = last_human.content.lower()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            logger.info("Intent detected: %s", intent)
            return {"current_intent": intent}

    return {"current_intent": "general"}


def respond(state: ConversationState) -> ConversationState:
    """LLM call — receives FULL message history via MemorySaver checkpoint."""
    llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.3,
        api_key=settings.openai_api_key,
    )

    messages = state.get("messages", [])
    logger.info(
        "Responding | session=%s intent=%s history_len=%d",
        state.get("session_id"), state.get("current_intent"), len(messages),
    )

    response = llm.invoke(messages)
    return {"messages": [response]}


def save_context(state: ConversationState) -> ConversationState:
    """Persist detected intent as a topic in the long-term user profile."""
    account_id = state.get("account_id")
    intent = state.get("current_intent", "general")

    if account_id and intent != "general":
        append_topic(account_id, intent)

    return {}


# ---------------------------------------------------------------------------
# Graph assembly — compiled WITH MemorySaver for persistent sessions
# ---------------------------------------------------------------------------

def build_conversation_graph():
    graph = StateGraph(ConversationState)

    graph.add_node("load_context", load_context)
    graph.add_node("detect_intent", detect_intent)
    graph.add_node("respond", respond)
    graph.add_node("save_context", save_context)

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "detect_intent")
    graph.add_edge("detect_intent", "respond")
    graph.add_edge("respond", "save_context")
    graph.add_edge("save_context", END)

    # Compile WITH checkpointer — this is what enables multi-turn memory
    return graph.compile(checkpointer=get_checkpointer())


conversation_graph = build_conversation_graph()


def run_conversation(
    session_id: str,
    message: str,
    account_id: Optional[str] = None,
) -> dict:
    """
    Each call resumes the existing session via thread_id.
    LangGraph replays the full checkpoint and appends the new turn.
    """
    config = {"configurable": {"thread_id": session_id}}

    result = conversation_graph.invoke(
        {
            "session_id": session_id,
            "account_id": account_id,
            "messages": [HumanMessage(content=message)],
        },
        config=config,
    )

    messages = result.get("messages", [])

    # Extract plain history for API response
    history = []
    for m in messages:
        if isinstance(m, HumanMessage):
            history.append({"role": "user", "content": m.content})
        elif hasattr(m, "content") and not isinstance(m, SystemMessage):
            history.append({"role": "assistant", "content": m.content})

    last_assistant = next(
        (m for m in reversed(messages) if not isinstance(m, (HumanMessage, SystemMessage))),
        None,
    )
    reply = last_assistant.content if last_assistant else "I'm sorry, I couldn't process that."

    turn_count = sum(1 for m in messages if isinstance(m, HumanMessage))

    return {
        "reply": reply,
        "intent": result.get("current_intent", "general"),
        "turn_count": turn_count,
        "history": history,
    }
