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
import copy
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    Run all selected domain agents in TRUE parallel using ThreadPoolExecutor.
    Each agent gets its own deep-copy of state (read-only input).
    Results (memory updates + agent_log entries) are merged back safely.
    One failure never kills the others — graceful degradation stays intact.
    """
    selected = set(state.get("selected_modules", ["numerology","astrology","palmistry","tarot","vastu"]))
    agent_map = {
        "numerology": numerology_agent_node,
        "astrology":  astrology_agent_node,
        "palmistry":  palmistry_agent_node,
        "tarot":      tarot_agent_node,
        "vastu":      vastu_agent_node,
    }

    active = {d: fn for d, fn in agent_map.items() if d in selected}
    if not active:
        return state

    def _run_agent(domain: str, agent_fn, state_snapshot: Dict) -> Dict:
        try:
            return agent_fn(state_snapshot)
        except Exception as exc:
            state_snapshot.setdefault("memory", {})[domain] = {
                "_degraded": True,
                "_reason":   str(exc),
                "confidence": "low",
                "question_wise_analysis": [],
            }
            state_snapshot.setdefault("agent_log", []).append(
                f"[DomainLayer] {domain} FAILED — degraded placeholder injected. Reason: {exc}"
            )
            state_snapshot.setdefault("errors", []).append(f"{domain}: {exc}")
            return state_snapshot

    # Build a minimal read-only snapshot: only fields each domain agent reads.
    # Avoids deepcopy of the entire growing state (memory, agent_log, etc.)
    # which adds 20-50ms overhead as state grows across pipeline nodes.
    _INPUT_FIELDS = (
        "user_profile", "user_question", "questions", "selected_modules",
        "module_inputs", "geocode", "normalized_questions", "focus_context",
    )
    _base_snapshot = {k: state.get(k) for k in _INPUT_FIELDS}
    _base_snapshot["memory"] = {}
    _base_snapshot["agent_log"] = []
    _base_snapshot["errors"] = []

    futures = {}
    with ThreadPoolExecutor(max_workers=len(active)) as pool:
        for domain, agent_fn in active.items():
            snapshot = dict(_base_snapshot)          # shallow copy — safe because agents only write memory[domain]
            snapshot["memory"] = {}                  # isolated write target per domain
            futures[pool.submit(_run_agent, domain, agent_fn, snapshot)] = domain

        for future in as_completed(futures):
            domain = futures[future]
            try:
                result = future.result()
                # Merge only the domain-specific memory key + new log entries
                mem = result.get("memory", {})
                if domain in mem:
                    state.setdefault("memory", {})[domain] = mem[domain]
                for entry in result.get("agent_log", []):
                    if entry not in state.get("agent_log", []):
                        state.setdefault("agent_log", []).append(entry)
                for err in result.get("errors", []):
                    state.setdefault("errors", []).append(err)
            except Exception as exc:
                state.setdefault("agent_log", []).append(
                    f"[DomainLayer] {domain} future raised: {exc}"
                )

    state.setdefault("agent_log", []).append("[DomainLayer] All selected domain agents completed (parallel).")

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
