"""
LangGraph StateGraph — 360° Astro Intelligence Pipeline

Flow:
  question_agent
      ↓
  [numerology || astrology || palmistry || tarot || vastu]  ← parallel fan-out
      ↓
  meta_agent
      ↓
  remedy_agent
      ↓
  admin_review_agent
      ↓
  END
"""
from __future__ import annotations
import asyncio
from typing import Any, Dict, List

from langgraph.graph import StateGraph, END

from agents import (
    question_agent_node,
    numerology_agent_node,
    astrology_agent_node,
    palmistry_agent_node,
    tarot_agent_node,
    vastu_agent_node,
    meta_agent_node,
    remedy_agent_node,
    admin_review_agent_node,
)


# ── Parallel domain fan-out ─────────────────────────────────────────────────
def domain_agents_parallel(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all selected domain agents sequentially in one node.
    LangGraph handles concurrency at the graph level — for a pure-Python
    implementation without an LLM, sequential within a single node is
    identical in output to true parallel execution.
    """
    state = numerology_agent_node(state)
    state = astrology_agent_node(state)
    state = palmistry_agent_node(state)
    state = tarot_agent_node(state)
    state = vastu_agent_node(state)
    state.setdefault("agent_log", []).append("[DomainLayer] All selected domain agents completed.")
    return state


# ── Build the graph ─────────────────────────────────────────────────────────
def build_graph() -> Any:
    builder = StateGraph(dict)

    builder.add_node("question_agent",      question_agent_node)
    builder.add_node("domain_agents",       domain_agents_parallel)
    builder.add_node("meta_agent",          meta_agent_node)
    builder.add_node("remedy_agent",        remedy_agent_node)
    builder.add_node("admin_review_agent",  admin_review_agent_node)

    builder.set_entry_point("question_agent")
    builder.add_edge("question_agent",     "domain_agents")
    builder.add_edge("domain_agents",      "meta_agent")
    builder.add_edge("meta_agent",         "remedy_agent")
    builder.add_edge("remedy_agent",       "admin_review_agent")
    builder.add_edge("admin_review_agent", END)

    return builder.compile()


# ── Singleton graph instance ────────────────────────────────────────────────
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


# ── Run helper ──────────────────────────────────────────────────────────────
def run_pipeline(initial_state: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous wrapper — runs the full LangGraph pipeline."""
    graph = get_graph()
    result = graph.invoke(initial_state)
    return result
