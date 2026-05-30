from graph.state import SalesFlowState
from platforms.instagram.client import reply_to_comment, send_dm


def send_agent(state: SalesFlowState) -> SalesFlowState:
    """Send the approved reply via the appropriate platform channel."""
    if not state.get("reply_approved", False):
        state["sent"] = False
        state["send_error"] = state.get("guardrail_reason", "not approved")
        state["agent_log"] = state.get("agent_log", []) + ["send_agent: skipped — not approved"]
        return state

    reply = state.get("draft_reply", "")
    message_type = state.get("message_type", "comment")
    sender_id = state.get("sender_id", "")
    media_id = state.get("media_id", "")

    try:
        if message_type == "dm":
            send_dm(sender_id, reply)
        else:
            reply_to_comment(media_id, sender_id, reply)
        state["sent"] = True
        state["send_error"] = ""
        state["agent_log"] = state.get("agent_log", []) + [
            f"send_agent: sent via {message_type}"
        ]
    except Exception as exc:
        state["sent"] = False
        state["send_error"] = str(exc)
        state["agent_log"] = state.get("agent_log", []) + [
            f"send_agent: failed — {exc}"
        ]

    return state
