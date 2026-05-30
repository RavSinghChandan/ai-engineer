import re
from graph.state import SalesFlowState

BLOCKED_PATTERNS = [
    r"\b(guaranteed|100%\s*guaranteed|lifetime\s*guarantee)\b",
    r"\b(free\s*forever|always\s*free)\b",
    r"₹\s*0\b",
    r"\b(click\s*here|buy\s*now\s*at\s*[₹$]\d+)\b",
]

MAX_REPLY_LENGTH = 500


def guardrail_agent(state: SalesFlowState) -> SalesFlowState:
    """Safety check the draft reply before sending."""
    reply = state.get("draft_reply", "")

    if not reply:
        state["reply_approved"] = False
        state["guardrail_reason"] = "empty reply"
        state["agent_log"] = state.get("agent_log", []) + ["guardrail_agent: blocked — empty reply"]
        return state

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, reply, re.IGNORECASE):
            state["reply_approved"] = False
            state["guardrail_reason"] = f"blocked pattern: {pattern}"
            state["draft_reply"] = _sanitize(reply)
            state["agent_log"] = state.get("agent_log", []) + [
                f"guardrail_agent: pattern blocked — {pattern}"
            ]
            return state

    if len(reply) > MAX_REPLY_LENGTH:
        state["draft_reply"] = reply[:MAX_REPLY_LENGTH].rsplit(" ", 1)[0] + "…"

    state["reply_approved"] = True
    state["guardrail_reason"] = ""
    state["agent_log"] = state.get("agent_log", []) + ["guardrail_agent: approved"]

    return state


def _sanitize(text: str) -> str:
    for pattern in BLOCKED_PATTERNS:
        text = re.sub(pattern, "[offer details in DM]", text, flags=re.IGNORECASE)
    return text
