from langgraph.graph import StateGraph, END
from graph.state import ExtractionState
from agents.classify_agent import classify_agent
from agents.steps_agent import steps_agent
from agents.validate_agent import validate_agent


def _has_error(state: ExtractionState) -> str:
    if state.get("extraction_error") and not state.get("steps"):
        return "end"
    return "steps"


def build_extraction_pipeline() -> StateGraph:
    graph = StateGraph(ExtractionState)

    graph.add_node("classify", classify_agent)
    graph.add_node("steps", steps_agent)
    graph.add_node("validate", validate_agent)

    graph.set_entry_point("classify")

    graph.add_conditional_edges(
        "classify",
        _has_error,
        {"steps": "steps", "end": END},
    )

    graph.add_edge("steps", "validate")
    graph.add_edge("validate", END)

    return graph.compile()


extraction_pipeline = build_extraction_pipeline()
