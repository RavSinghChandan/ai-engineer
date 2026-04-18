"""
Step 8 — Resilient Banking Agent

Demonstrates all four resilience patterns inside a LangGraph graph:

  check_circuit_breaker
         │
         ▼ (open / closed)
  call_llm_with_retry  ◀──────────────────┐
         │                                │
         ▼ (conditional)                  │
  handle_success  ──────────────────────▶ END
  handle_failure  ──── retry? ────────────┘
         │
         ▼ (no more retries)
  serve_fallback ────────────────────────▶ END

In production: replace the stub LLM call with any node that touches
an external service (OpenAI, payment gateway, core banking API).
"""

import logging
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

from app.resilience.llm_factory import get_resilient_llm
from app.resilience.circuit_breaker import (
    openai_breaker,
    CircuitOpenError,
    CircuitState,
    get_all_breaker_statuses,
)
from app.resilience.retry import llm_retry
from app.resilience.timeout import call_with_timeout, DEFAULT_LLM_TIMEOUT

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a resilient banking assistant. "
    "Answer concisely. If asked about resilience patterns, explain briefly."
)


# ── State ──────────────────────────────────────────────────────────────────

class ResilientAgentState(TypedDict, total=False):
    query: str
    intent: Optional[str]
    response: Optional[str]
    circuit_state: str
    attempt_count: int
    used_fallback: bool
    error: Optional[str]
    breaker_statuses: list


# ── Nodes ──────────────────────────────────────────────────────────────────

def check_circuit_breaker(state: ResilientAgentState) -> ResilientAgentState:
    """Fast-path check — reads circuit state without making any I/O call."""
    cb_state = openai_breaker.state
    logger.info("[Resilience] Circuit breaker state: %s", cb_state.value)
    return {
        "circuit_state": cb_state.value,
        "attempt_count": 0,
        "used_fallback": False,
        "breaker_statuses": get_all_breaker_statuses(),
    }


def call_llm_with_retry(state: ResilientAgentState) -> ResilientAgentState:
    """
    LLM call protected by:
      1. Circuit breaker (checked in previous node)
      2. Retry (tenacity — 3 attempts, exponential backoff)
      3. Fallback chain (gpt-4o-mini → gpt-3.5-turbo → rule-based)
      4. Timeout (30s hard ceiling)
    """
    if state.get("circuit_state") == CircuitState.OPEN.value:
        logger.warning("[Resilience] Circuit OPEN — skipping LLM call")
        return {
            "used_fallback": True,
            "error": "circuit_open",
            "attempt_count": 0,
        }

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=state["query"]),
    ]

    llm = get_resilient_llm(temperature=0.2, intent=state.get("intent"))

    try:
        response: AIMessage = call_with_timeout(
            llm.invoke,
            messages,
            timeout=DEFAULT_LLM_TIMEOUT,
            fallback=AIMessage(content="Request timed out. Please try again."),
        )
        return {
            "response": response.content,
            "attempt_count": state.get("attempt_count", 0) + 1,
            "used_fallback": False,
            "error": None,
        }
    except Exception as exc:
        logger.error("[Resilience] LLM call failed: %s", exc)
        return {
            "error": str(exc),
            "attempt_count": state.get("attempt_count", 0) + 1,
        }


def serve_fallback(state: ResilientAgentState) -> ResilientAgentState:
    """Terminal fallback — always returns a safe banking response."""
    from app.resilience.fallback import RULE_BASED_RESPONSES
    intent = state.get("intent", "default")
    response = RULE_BASED_RESPONSES.get(intent, RULE_BASED_RESPONSES["default"])
    logger.warning("[Resilience] Serving rule-based fallback | error=%s", state.get("error"))
    return {"response": response, "used_fallback": True}


def handle_success(state: ResilientAgentState) -> ResilientAgentState:
    logger.info("[Resilience] Request succeeded | attempts=%d", state.get("attempt_count", 1))
    return {}


# ── Conditional edges ──────────────────────────────────────────────────────

def route_after_llm(state: ResilientAgentState) -> Literal["handle_success", "serve_fallback"]:
    if state.get("response") and not state.get("error"):
        return "handle_success"
    return "serve_fallback"


# ── Graph assembly ──────────────────────────────────────────────────────────

def build_resilient_agent():
    graph = StateGraph(ResilientAgentState)

    graph.add_node("check_circuit_breaker", check_circuit_breaker)
    graph.add_node("call_llm_with_retry", call_llm_with_retry)
    graph.add_node("serve_fallback", serve_fallback)
    graph.add_node("handle_success", handle_success)

    graph.set_entry_point("check_circuit_breaker")
    graph.add_edge("check_circuit_breaker", "call_llm_with_retry")

    graph.add_conditional_edges(
        "call_llm_with_retry",
        route_after_llm,
        {
            "handle_success": "handle_success",
            "serve_fallback": "serve_fallback",
        },
    )

    graph.add_edge("handle_success", END)
    graph.add_edge("serve_fallback", END)

    return graph.compile()


resilient_agent_graph = build_resilient_agent()


def run_resilient_agent(query: str, intent: Optional[str] = None) -> dict:
    result = resilient_agent_graph.invoke({"query": query, "intent": intent})
    return {
        "response": result.get("response", ""),
        "circuit_state": result.get("circuit_state", "unknown"),
        "used_fallback": result.get("used_fallback", False),
        "attempt_count": result.get("attempt_count", 0),
        "breaker_statuses": result.get("breaker_statuses", []),
    }
