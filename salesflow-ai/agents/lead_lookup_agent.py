from graph.state import SalesFlowState
from database.leads_store import get_lead_by_sender, create_lead
from database.interactions_store import get_recent_interactions


def lead_lookup_agent(state: SalesFlowState) -> SalesFlowState:
    """Look up or create a lead record; load conversation history."""
    sender_id = state["sender_id"]
    platform = state["platform"]

    lead = get_lead_by_sender(sender_id, platform)
    if lead is None:
        lead = create_lead(
            sender_id=sender_id,
            platform=platform,
            sender_name=state.get("sender_name", ""),
        )
        state["is_new_lead"] = True
    else:
        state["is_new_lead"] = False

    state["lead_id"] = lead["id"]
    state["funnel_stage"] = lead["funnel_stage"]
    state["conversation_history"] = get_recent_interactions(lead["id"], limit=10)
    state["agent_log"] = state.get("agent_log", []) + [
        f"lead_lookup_agent: lead_id={lead['id']} stage={lead['funnel_stage']} new={state['is_new_lead']}"
    ]

    return state
