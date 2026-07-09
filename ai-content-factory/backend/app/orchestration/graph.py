"""LangGraph production pipeline.

Generated-script path:
  trend → research → knowledge → script → review ──(revise)──► script
                                                └──(approved)─► seo → …
Creator-script path (job carries its own script — research/review bypassed):
  script_intake → seo → …
Shared tail:
  seo → voice → avatar → thumbnail → video → metadata → END

Node ids carry a `_node` suffix because LangGraph forbids a node name
that equals a state key (each agent writes a state key of its own name).
"""
from collections.abc import Awaitable, Callable
from typing import Any

from langgraph.graph import END, StateGraph

from app.domain.enums import AgentName
from app.orchestration.state import PipelineState

NodeFn = Callable[[PipelineState], Awaitable[dict[str, Any]]]

PIPELINE_SEQUENCE: list[AgentName] = [
    AgentName.TREND,
    AgentName.RESEARCH,
    AgentName.KNOWLEDGE,
    AgentName.SCRIPT,
    AgentName.REVIEW,
    AgentName.SCRIPT_INTAKE,
    AgentName.SEO,
    AgentName.VOICE,
    AgentName.AVATAR,
    AgentName.THUMBNAIL,
    AgentName.VIDEO,
    AgentName.METADATA,
]


def _node_id(agent: AgentName) -> str:
    return f"{agent.value}_node"


def _review_router(state: PipelineState) -> str:
    review = state.get("review") or {}
    return _node_id(AgentName.SEO) if review.get("approved") else _node_id(AgentName.SCRIPT)


def _entry_router(state: PipelineState) -> str:
    """Creator-provided script skips research/writing/review entirely."""
    if (state.get("user_script_text") or "").strip():
        return _node_id(AgentName.SCRIPT_INTAKE)
    return _node_id(AgentName.TREND)


def build_pipeline_graph(node_factory: Callable[[AgentName], NodeFn]):
    """Build the graph with runner-provided node wrappers (persistence + events)."""
    graph = StateGraph(PipelineState)
    for agent_name in PIPELINE_SEQUENCE:
        graph.add_node(_node_id(agent_name), node_factory(agent_name))

    graph.set_conditional_entry_point(
        _entry_router,
        {
            _node_id(AgentName.TREND): _node_id(AgentName.TREND),
            _node_id(AgentName.SCRIPT_INTAKE): _node_id(AgentName.SCRIPT_INTAKE),
        },
    )
    linear_edges = [
        (AgentName.TREND, AgentName.RESEARCH),
        (AgentName.RESEARCH, AgentName.KNOWLEDGE),
        (AgentName.KNOWLEDGE, AgentName.SCRIPT),
        (AgentName.SCRIPT, AgentName.REVIEW),
        (AgentName.SCRIPT_INTAKE, AgentName.SEO),
        (AgentName.SEO, AgentName.VOICE),
        (AgentName.VOICE, AgentName.AVATAR),
        (AgentName.AVATAR, AgentName.THUMBNAIL),
        (AgentName.THUMBNAIL, AgentName.VIDEO),
        (AgentName.VIDEO, AgentName.METADATA),
    ]
    for source, target in linear_edges:
        graph.add_edge(_node_id(source), _node_id(target))
    graph.add_conditional_edges(
        _node_id(AgentName.REVIEW),
        _review_router,
        {_node_id(AgentName.SEO): _node_id(AgentName.SEO), _node_id(AgentName.SCRIPT): _node_id(AgentName.SCRIPT)},
    )
    graph.add_edge(_node_id(AgentName.METADATA), END)
    return graph.compile()
