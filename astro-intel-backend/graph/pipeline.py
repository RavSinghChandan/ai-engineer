"""
LangGraph StateGraph — 360° Astro Intelligence Pipeline

Flow (multi-tenant episodic memory + security gate):

  persona_injection       ← Node -1: per-tenant episodic recall → formats persona_context string
      ↓
  security_check          ← Node 0: Layer 1 input validation + Layer 4 audit setup
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

Persona injection (Node -1):
  Reads chandan_preferences (set by routers/analysis.py per-tenant before invoking the graph).
  Calls format_for_prompt() → produces a formatted persona_context string.
  Stores it as state["persona_context"].
  All subsequent agents receive persona_context via build_prompt(persona_context=...) so
  the tenant's correction history and tone rules are prepended to every LLM system prompt.

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


# ── Node -1: Tenant Persona Injection ──────────────────────────────────────
def persona_injection_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    First node in the graph — runs before security_check and all domain agents.

    Reads `chandan_preferences` (set by routers/analysis.py using
    build_tenant_context(tenant_id=ctx.tenant_id) before graph invocation).
    Formats it into a ready-to-use persona_context string via format_for_prompt().
    Stores as state["persona_context"] so every subsequent agent can call
    build_prompt(persona_context=state["persona_context"], ...) to prepend
    the tenant's correction history and tone rules to its LLM system prompt.

    Non-blocking: if chandan_preferences is absent or format_for_prompt fails,
    persona_context is set to "" and the pipeline continues unaffected.
    """
    try:
        from memory.persona import format_for_prompt
        prefs = state.get("chandan_preferences")
        if prefs and isinstance(prefs, dict):
            tenant_id = prefs.get("tenant_id", "unknown")
            persona_context = format_for_prompt(prefs)
            corrections_count = len(prefs.get("past_corrections", []))
            state["persona_context"] = persona_context
            state.setdefault("agent_log", []).append(
                f"[PersonaInjection] tenant={tenant_id} | "
                f"corrections_recalled={corrections_count} | "
                f"persona_chars={len(persona_context)}"
            )
        else:
            state["persona_context"] = ""
            state.setdefault("agent_log", []).append(
                "[PersonaInjection] No tenant preferences found — using bare system prompts."
            )
    except Exception as exc:
        state["persona_context"] = ""
        state.setdefault("agent_log", []).append(
            f"[PersonaInjection] ERROR: {exc} — pipeline continues without persona context."
        )
    return state


# ── Parallel domain fan-out ─────────────────────────────────────────────────
def domain_agents_parallel(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all selected domain agents in TRUE parallel using ThreadPoolExecutor.
    Each agent gets its own deep-copy of state (read-only input).
    Results (memory updates + agent_log entries) are merged back safely.
    One failure never kills the others — graceful degradation stays intact.
    """
    selected = set(state.get("selected_modules", ["numerology"]))
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
        "persona_context",  # tenant persona context from persona_injection_node
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

    # Node -1: persona injection — runs first, before security or any domain agent
    builder.add_node("persona_injection",     persona_injection_node)
    # Node 0: security gate — validates input before any agent sees it
    builder.add_node("security_check",        run_security_check)
    builder.add_node("question_agent",        safe_node(question_agent_node,     "question_agent"))
    builder.add_node("domain_agents",         safe_node(domain_agents_parallel,  "domain_agents"))
    builder.add_node("meta_agent",            safe_node(meta_agent_node,         "meta_agent"))
    builder.add_node("hallucination_check",   run_hallucination_check)
    builder.add_node("remedy_agent",          safe_node(remedy_agent_node,       "remedy_agent"))
    builder.add_node("admin_review_agent",    safe_node(admin_review_agent_node, "admin_review_agent"))
    builder.add_node("grammar_agent",         safe_node(grammar_agent_node,      "grammar_agent"))

    builder.set_entry_point("persona_injection")
    builder.add_edge("persona_injection",    "security_check")
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
