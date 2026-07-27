"""
LangGraph StateGraph — 360° Holistic Life Report pipeline.

A SEPARATE, parallel pipeline from the question-driven one in pipeline.py.
It never touches that graph. Flow:

    persona_injection -> holistic_security -> holistic_agent
        -> hallucination_check -> grammar -> END

Reuses the existing persona, guardrail, and grammar infrastructure. The only
difference from the Q&A security gate is that this flow has NO user question,
so it validates the birth profile alone (validate_user_question would reject
an empty question).
"""
from __future__ import annotations

from typing import Any, Dict

from langgraph.graph import StateGraph, END

from graph.pipeline import persona_injection_node
from guardrails import safe_node, run_hallucination_check
from guardrails.security import validate_birth_profile, SecurityError
from guardrails.config import GuardrailsConfig, NodeGuardrailConfig
from agents.holistic_agent import holistic_agent_node

# The holistic agent makes 14 chapters x (RAG + story) LLM calls, so it needs a
# far longer budget than the default 30s single-agent limit — and it must NOT
# retry (retrying 14 LLM calls tripled the load and still timed out). It already
# guards each chapter internally, so relaxed mode is safe here.
_HOLISTIC_GUARDRAILS = GuardrailsConfig(
    global_strict=False,
    default_node=NodeGuardrailConfig(
        strict_mode=False,
        max_retries=0,
        timeout_seconds=300.0,
        allow_empty_output=True,
    ),
)


def holistic_security_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Question-free security gate: validate the birth profile only."""
    profile = state.get("user_profile", {}) or {}
    try:
        if isinstance(profile, dict):
            validate_birth_profile(profile)
        state.setdefault("agent_log", []).append(
            {"agent": "holistic_security", "status": "passed"}
        )
    except SecurityError:
        state.setdefault("agent_log", []).append(
            {"agent": "holistic_security", "status": "blocked"}
        )
        raise
    return state


def holistic_grammar_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Polish chapter prose with the deterministic fixer. Never blocks delivery."""
    try:
        from agents.grammar_agent import _deterministic_fix
        for ch in state.get("holistic_chapters", []) or []:
            story = ch.get("story", "")
            if story:
                ch["story"] = _deterministic_fix(story)
        state.setdefault("agent_log", []).append(
            {"agent": "holistic_grammar", "status": "ok"}
        )
    except Exception:
        pass  # never block report delivery on grammar failure
    return state


def build_holistic_graph() -> Any:
    builder = StateGraph(dict)

    builder.add_node("persona_injection",   persona_injection_node)
    builder.add_node("holistic_security",   holistic_security_node)
    builder.add_node("holistic_agent",      safe_node(holistic_agent_node, "holistic_agent", _HOLISTIC_GUARDRAILS))
    builder.add_node("hallucination_check", run_hallucination_check)
    builder.add_node("grammar",             holistic_grammar_node)

    builder.set_entry_point("persona_injection")
    builder.add_edge("persona_injection",   "holistic_security")
    builder.add_edge("holistic_security",   "holistic_agent")
    builder.add_edge("holistic_agent",      "hallucination_check")
    builder.add_edge("hallucination_check", "grammar")
    builder.add_edge("grammar",             END)

    return builder.compile()


_holistic_graph = None


def get_holistic_graph():
    global _holistic_graph
    if _holistic_graph is None:
        _holistic_graph = build_holistic_graph()
    return _holistic_graph


def run_holistic_pipeline(initial_state: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous wrapper — runs the holistic pipeline."""
    graph = get_holistic_graph()
    return graph.invoke(initial_state)
