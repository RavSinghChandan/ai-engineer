from graph.state import SalesFlowState
from utils.llm import call_llm

SYSTEM_PROMPT = """You are a warm, professional sales assistant for a social media brand.
Your job is to reply to a customer message in a way that:
1. Feels human and friendly — never robotic
2. Answers their question using the provided product context
3. Gently nudges them toward the next step (inquiry → interest → purchase)
4. Is SHORT — max 3 sentences for comments, max 5 sentences for DMs
5. Never make up prices or promises not in the product context

Funnel stages: NEW_LEAD → ENGAGED → INTERESTED → NEGOTIATING → CONVERTED → CLOSED_WON

Always end with a soft call-to-action appropriate for the current funnel stage."""

STAGE_CTA = {
    "NEW_LEAD":    "Ask them to DM you for more details.",
    "ENGAGED":     "Share a key benefit and invite them to check the link in bio.",
    "INTERESTED":  "Offer to answer any questions and share pricing.",
    "NEGOTIATING": "Acknowledge their concern and offer a solution or discount.",
    "CONVERTED":   "Thank them and guide them through the next step.",
    "CLOSED_WON":  "Thank them for their purchase and offer post-sale support.",
    "CLOSED_LOST": "Be gracious and leave the door open for the future.",
}


def response_agent(state: SalesFlowState) -> SalesFlowState:
    """Generate a reply to the incoming message."""
    intent = state.get("intent", "OTHER")

    if intent == "SPAM":
        state["draft_reply"] = ""
        state["agent_log"] = state.get("agent_log", []) + ["response_agent: skipped (SPAM)"]
        return state

    stage = state.get("funnel_stage", "NEW_LEAD")
    history = state.get("conversation_history", [])
    history_text = "\n".join(
        f"[{h['role']}]: {h['content']}" for h in history[-5:]
    ) if history else "No prior conversation."

    user_message = f"""Customer message: {state.get('message_text', '')}

Intent: {intent}
Funnel stage: {stage}
CTA guidance: {STAGE_CTA.get(stage, '')}

Product context:
{state.get('rag_context', 'No context available.')}

Recent conversation:
{history_text}

Write the reply now:"""

    reply = call_llm(SYSTEM_PROMPT, user_message)
    state["draft_reply"] = reply.strip()
    state["agent_log"] = state.get("agent_log", []) + [
        f"response_agent: draft generated ({len(reply)} chars)"
    ]

    return state
