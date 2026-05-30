from typing import Any
from graph.state import SalesFlowState


def intake_agent(state: SalesFlowState) -> SalesFlowState:
    """Normalize raw platform message into a canonical format."""
    raw = state["raw_message"]

    state["platform"] = raw.get("platform", "instagram")
    state["sender_id"] = str(raw.get("sender_id", ""))
    state["sender_name"] = raw.get("sender_name", "")
    state["message_text"] = raw.get("message_text", "").strip()
    state["message_type"] = raw.get("message_type", "comment")  # comment | dm
    state["timestamp"] = raw.get("timestamp", "")
    state["media_id"] = raw.get("media_id", "")
    state["agent_log"] = state.get("agent_log", []) + ["intake_agent: normalized message"]

    return state
