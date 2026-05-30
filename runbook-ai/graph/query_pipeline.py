"""
RAGless incident query pipeline — LangGraph orchestration.

Flow:
  classify_incident → match_runbooks → compose_response

No vectors anywhere. Every step is:
  - classify: LLM → structured JSON
  - match: SQL queries on category/severity/keywords
  - compose: graph traversal for order + DB lookup for commands
"""
from langgraph.graph import StateGraph, END
from graph.query_state import QueryState
from agents.incident_classifier_agent import classify_incident
from agents.runbook_matcher_agent import match_runbooks
from agents.response_composer_agent import compose_response


def _classify_node(state: QueryState) -> QueryState:
    classification = classify_incident(state["incident_text"])
    state["category"] = classification["category"]
    state["severity"] = classification["severity"]
    state["keywords"] = classification["keywords"]
    state["symptoms"] = classification["symptoms"]
    state["affected_component"] = classification["affected_component"]
    state["search_terms"] = classification["search_terms"]
    state["agent_log"] = state.get("agent_log", []) + [
        f"classify: category={classification['category']} severity={classification['severity']}"
    ]
    return state


def _match_node(state: QueryState) -> QueryState:
    matches = match_runbooks(
        category=state.get("category", "other"),
        severity=state.get("severity", "P3"),
        search_terms=state.get("search_terms", []),
        limit=5,
    )
    state["matched_runbooks"] = matches
    state["selected_runbook_id"] = matches[0]["id"] if matches else None
    state["match_confidence"] = matches[0]["confidence"] if matches else "NONE"
    state["agent_log"] = state.get("agent_log", []) + [
        f"match: found {len(matches)} runbooks, "
        f"selected={state['selected_runbook_id']} confidence={state['match_confidence']}"
    ]
    return state


def _compose_node(state: QueryState) -> QueryState:
    runbook_id = state.get("selected_runbook_id")
    if not runbook_id:
        state["response"] = {
            "error": "No matching runbook found",
            "suggestions": [
                "Upload a relevant runbook PDF via POST /ingest/upload",
                "Try rephrasing the incident description",
                "Check available runbooks at GET /runbooks",
            ],
        }
        state["agent_log"] = state.get("agent_log", []) + ["compose: no runbook matched"]
        return state

    response = compose_response(state["incident_text"], runbook_id)
    state["response"] = response
    state["agent_log"] = state.get("agent_log", []) + [
        f"compose: response built, {response.get('total_steps', 0)} steps"
    ]
    return state


def _should_compose(state: QueryState) -> str:
    if state.get("query_error"):
        return "end"
    return "compose"


def build_query_pipeline():
    graph = StateGraph(QueryState)

    graph.add_node("classify", _classify_node)
    graph.add_node("match", _match_node)
    graph.add_node("compose", _compose_node)

    graph.set_entry_point("classify")
    graph.add_edge("classify", "match")
    graph.add_conditional_edges(
        "match",
        _should_compose,
        {"compose": "compose", "end": END},
    )
    graph.add_edge("compose", END)

    return graph.compile()


query_pipeline = build_query_pipeline()
