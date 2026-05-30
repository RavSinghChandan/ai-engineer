from graph.state import SalesFlowState
from database.leads_store import update_lead_stage
from database.interactions_store import log_interaction

STAGE_TRANSITIONS = {
    "NEW_LEAD":    {"INQUIRY": "ENGAGED",     "INTEREST": "INTERESTED", "HOT_LEAD": "NEGOTIATING"},
    "ENGAGED":     {"INTEREST": "INTERESTED", "HOT_LEAD": "NEGOTIATING", "OBJECTION": "ENGAGED"},
    "INTERESTED":  {"HOT_LEAD": "NEGOTIATING","OBJECTION": "INTERESTED"},
    "NEGOTIATING": {"HOT_LEAD": "CONVERTED",  "OBJECTION": "NEGOTIATING"},
    "CONVERTED":   {"ALREADY_CUSTOMER": "CLOSED_WON"},
    "CLOSED_WON":  {},
    "CLOSED_LOST": {},
}


def crm_update_agent(state: SalesFlowState) -> SalesFlowState:
    """Update lead funnel stage and log the interaction."""
    lead_id = state.get("lead_id")
    intent = state.get("intent", "OTHER")
    current_stage = state.get("funnel_stage", "NEW_LEAD")

    # Determine next stage
    transitions = STAGE_TRANSITIONS.get(current_stage, {})
    next_stage = transitions.get(intent, current_stage)

    if next_stage != current_stage:
        update_lead_stage(lead_id, next_stage)
        state["funnel_stage"] = next_stage

    # Log inbound message
    log_interaction(
        lead_id=lead_id,
        role="customer",
        content=state.get("message_text", ""),
        intent=intent,
        platform=state.get("platform", ""),
        message_type=state.get("message_type", ""),
    )

    # Log outbound reply
    if state.get("sent") and state.get("draft_reply"):
        log_interaction(
            lead_id=lead_id,
            role="agent",
            content=state.get("draft_reply", ""),
            intent="REPLY",
            platform=state.get("platform", ""),
            message_type=state.get("message_type", ""),
        )

    state["agent_log"] = state.get("agent_log", []) + [
        f"crm_update_agent: {current_stage} → {next_stage}"
    ]

    return state
