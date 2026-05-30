from langgraph.graph import StateGraph, END
from graph.state import SalesFlowState
from agents.intake_agent import intake_agent
from agents.intent_agent import intent_agent
from agents.lead_lookup_agent import lead_lookup_agent
from agents.rag_context_agent import rag_context_agent
from agents.response_agent import response_agent
from agents.guardrail_agent import guardrail_agent
from agents.send_agent import send_agent
from agents.crm_update_agent import crm_update_agent


def _should_send(state: SalesFlowState) -> str:
    """Route: skip sending for SPAM, proceed otherwise."""
    if state.get("intent") == "SPAM":
        return "crm_update"
    return "guardrail"


def build_pipeline() -> StateGraph:
    graph = StateGraph(SalesFlowState)

    graph.add_node("intake", intake_agent)
    graph.add_node("intent", intent_agent)
    graph.add_node("lead_lookup", lead_lookup_agent)
    graph.add_node("rag_context", rag_context_agent)
    graph.add_node("response", response_agent)
    graph.add_node("guardrail", guardrail_agent)
    graph.add_node("send", send_agent)
    graph.add_node("crm_update", crm_update_agent)

    graph.set_entry_point("intake")
    graph.add_edge("intake", "intent")
    graph.add_edge("intent", "lead_lookup")
    graph.add_edge("lead_lookup", "rag_context")
    graph.add_edge("rag_context", "response")

    graph.add_conditional_edges(
        "response",
        _should_send,
        {"guardrail": "guardrail", "crm_update": "crm_update"},
    )

    graph.add_edge("guardrail", "send")
    graph.add_edge("send", "crm_update")
    graph.add_edge("crm_update", END)

    return graph.compile()


pipeline = build_pipeline()
