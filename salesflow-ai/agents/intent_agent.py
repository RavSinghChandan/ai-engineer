import json
from graph.state import SalesFlowState
from utils.llm import call_llm

INTENTS = ["INQUIRY", "INTEREST", "OBJECTION", "SPAM", "HOT_LEAD", "ALREADY_CUSTOMER", "OTHER"]

SYSTEM_PROMPT = """You are a sales intent classifier. Given a social media message, classify it into exactly one intent.

Intents:
- INQUIRY: Asking about product/service (price, features, availability)
- INTEREST: Showing interest ("I want this", "How do I buy?", "DM me")
- OBJECTION: Raising concerns ("too expensive", "does it really work?")
- SPAM: Irrelevant, promotional, or abusive message
- HOT_LEAD: Ready to buy right now ("take my money", "where do I pay")
- ALREADY_CUSTOMER: Existing customer with support/feedback query
- OTHER: Cannot classify into any above

Respond with JSON only: {"intent": "<INTENT>", "confidence": 0.0-1.0, "reasoning": "<one sentence>"}"""


def intent_agent(state: SalesFlowState) -> SalesFlowState:
    """Classify the intent of the incoming message using LLM."""
    message = state.get("message_text", "")

    prompt = f"Message: {message}"
    response = call_llm(SYSTEM_PROMPT, prompt)

    try:
        parsed = json.loads(response)
        intent = parsed.get("intent", "OTHER")
        confidence = float(parsed.get("confidence", 0.5))
        reasoning = parsed.get("reasoning", "")
    except (json.JSONDecodeError, ValueError):
        intent = "OTHER"
        confidence = 0.0
        reasoning = "parse error"

    if intent not in INTENTS:
        intent = "OTHER"

    state["intent"] = intent
    state["intent_confidence"] = confidence
    state["intent_reasoning"] = reasoning
    state["agent_log"] = state.get("agent_log", []) + [
        f"intent_agent: {intent} ({confidence:.2f}) — {reasoning}"
    ]

    return state
