"""
LangGraph StateGraph — 360° Astro Intelligence Pipeline

Flow (with security gate — Module 2):

  security_check          ← NEW: Layer 1 input validation + Layer 4 audit setup
      ↓
  question_agent
      ↓
  [numerology || astrology || palmistry || tarot || vastu]  ← parallel fan-out
      ↓
  meta_agent
      ↓
  hallucination_check     ← Layer 2/3 hallucination detection (Module 1)
      ↓
  remedy_agent
      ↓
  admin_review_agent
      ↓
  grammar_agent           ← grammar correction on all insight bullets
      ↓
  END

Security layers active across the pipeline:
  Layer 1 — security_check node: validates user_question + birth_profile fields
             before any agent sees the input. Raises SecurityError on injection.
  Layer 2 — SECURITY_HEADER/FOOTER constants injected into every agent system prompt
             (see agents/agent_prompts.py and agents/prompt_config.py).
  Layer 3 — validate_output() called per-LLM-call inside domain agents that make
             real LLM calls (simplify_agent, report_agent). Also runs in
             hallucination_check node (output leak detection).
  Layer 4 — audit_llm_call() logs every LLM call with request_id, input_hash,
             output_len, and cost to the security audit logger.
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
    grammar_agent_node,
)
from guardrails import safe_node, run_hallucination_check, run_security_check
from guardrails.production import degradation_tracker


# ── Parallel domain fan-out ─────────────────────────────────────────────────
def domain_agents_parallel(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all selected domain agents sequentially in one node.
    Each agent is wrapped in a try/except so one failure never
    kills the others — the failed domain contributes a LOW confidence
    placeholder (graceful degradation pattern).
    """
    selected = set(state.get("selected_modules", ["numerology","astrology","palmistry","tarot","vastu"]))
    agent_map = {
        "numerology": numerology_agent_node,
        "astrology":  astrology_agent_node,
        "palmistry":  palmistry_agent_node,
        "tarot":      tarot_agent_node,
        "vastu":      vastu_agent_node,
    }

    for domain, agent_fn in agent_map.items():
        if domain not in selected:
            continue
        try:
            state = agent_fn(state)
        except Exception as exc:
            # Domain failed — inject LOW confidence placeholder, keep pipeline alive
            state.setdefault("memory", {})[domain] = {
                "_degraded": True,
                "_reason":   str(exc),
                "confidence": "low",
                "question_wise_analysis": [],
            }
            state.setdefault("agent_log", []).append(
                f"[DomainLayer] {domain} FAILED — degraded placeholder injected. Reason: {exc}"
            )
            state.setdefault("errors", []).append(f"{domain}: {exc}")

    state.setdefault("agent_log", []).append("[DomainLayer] All selected domain agents completed.")

    # G5: Record degradation snapshot for this run
    session_id = state.get("session_id", "unknown")
    degradation_tracker.record_run(session_id, state.get("memory", {}))

    return state


# ── Build the graph ─────────────────────────────────────────────────────────
def build_graph() -> Any:
    builder = StateGraph(dict)

    # Security gate is the new entry point — runs before any agent sees user input
    builder.add_node("security_check",        run_security_check)
    builder.add_node("question_agent",        safe_node(question_agent_node,     "question_agent"))
    builder.add_node("domain_agents",         safe_node(domain_agents_parallel,  "domain_agents"))
    builder.add_node("meta_agent",            safe_node(meta_agent_node,         "meta_agent"))
    builder.add_node("hallucination_check",   run_hallucination_check)
    builder.add_node("remedy_agent",          safe_node(remedy_agent_node,       "remedy_agent"))
    builder.add_node("admin_review_agent",    safe_node(admin_review_agent_node, "admin_review_agent"))
    builder.add_node("grammar_agent",         safe_node(grammar_agent_node,      "grammar_agent"))

    builder.set_entry_point("security_check")
    builder.add_edge("security_check",       "question_agent")
    builder.add_edge("question_agent",       "domain_agents")
    builder.add_edge("domain_agents",        "meta_agent")
    builder.add_edge("meta_agent",           "hallucination_check")
    builder.add_edge("hallucination_check",  "remedy_agent")
    builder.add_edge("remedy_agent",         "admin_review_agent")
    builder.add_edge("admin_review_agent",   "grammar_agent")
    builder.add_edge("grammar_agent",        END)

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
