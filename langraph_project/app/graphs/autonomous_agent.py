"""
Step 11 — Autonomous Banking AI Agent

The master orchestrator that ties all previous steps together.

Graph flow:
  classify_intent
       │
       ▼
  plan_workflow      (LLM selects the best sub-graph / tool)
       │
       ▼
  execute_workflow   (delegates to the right specialist graph)
       │
       ▼ (conditional)
  enrich_with_rag ──▶ synthesize_response ──▶ END
  handle_failure  ──▶ synthesize_response ──▶ END
       ↑                    │
       └────────────────────┘

Capabilities delivered by this agent:
  ✓ Understands natural-language banking queries
  ✓ Autonomously selects the right workflow (loan, account, compliance, ...)
  ✓ Delegates to tool-calling sub-agents (Steps 4, 5)
  ✓ Uses RAG for compliance/policy questions (Step 5)
  ✓ Persists conversation memory across turns (Step 6)
  ✓ Escalates complex loans to multi-agent committee (Step 7)
  ✓ Resilient — falls back gracefully on LLM failures (Step 8)
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from app.schemas.autonomous import AutonomousAgentState
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Intent keyword map (fast, no LLM cost) ────────────────────────────────────
INTENT_WORKFLOW_MAP: dict[str, str] = {
    # loan keywords
    "loan": "loan",
    "mortgage": "loan",
    "borrow": "loan",
    "credit": "loan",
    "emi": "loan",
    "eligible": "loan",
    "eligibility": "loan",
    # account keywords
    "account": "account",
    "balance": "account",
    "statement": "account",
    "transfer": "account",
    "spent": "account",
    # compliance keywords
    "kyc": "compliance",
    "aml": "compliance",
    "gdpr": "compliance",
    "pci": "compliance",
    "regulation": "compliance",
    "policy": "compliance",
    "compliance": "compliance",
    "regulatory": "compliance",
    # fraud keywords
    "fraud": "transaction",
    "suspicious": "transaction",
    "unauthorized": "transaction",
    "dispute": "transaction",
    # committee keywords
    "committee": "committee",
    "approval board": "committee",
    "senior review": "committee",
    # resilience demo keywords
    "resilience": "resilience",
    "fallback": "resilience",
    "circuit": "resilience",
}

PLANNER_SYSTEM = """You are a banking AI orchestrator. Your job is to select the best workflow for a user query.

Available workflows:
- loan       → loan eligibility check, interest rates, repayment terms
- account    → account balance, transaction history, account details
- compliance → KYC, AML, GDPR, PCI-DSS policy questions
- transaction→ transaction routing, fraud detection, payment classification
- conversation→ general banking chat, product questions, multi-turn dialogue
- committee  → high-value complex loan requiring multi-agent committee review
- resilience → resilience pattern demo

Respond with EXACTLY one word — the workflow name. No explanation."""


# ── Nodes ──────────────────────────────────────────────────────────────────────

def classify_intent(state: AutonomousAgentState) -> AutonomousAgentState:
    """Fast keyword-based intent classification — no LLM."""
    query = state.get("query", "").lower()
    steps = state.get("execution_steps", [])

    for keyword, workflow in INTENT_WORKFLOW_MAP.items():
        if keyword in query:
            logger.info("[Autonomous] Keyword match: '%s' → %s", keyword, workflow)
            return {
                "intent": workflow,
                "execution_steps": steps + [f"classify_intent → {workflow} (keyword: {keyword})"],
            }

    # Unknown — let LLM decide
    return {
        "intent": "unknown",
        "execution_steps": steps + ["classify_intent → unknown (no keyword match)"],
    }


def plan_workflow(state: AutonomousAgentState) -> AutonomousAgentState:
    """LLM selects a workflow when keyword classification yields 'unknown'."""
    intent = state.get("intent", "unknown")
    steps = state.get("execution_steps", [])

    if intent != "unknown":
        return {
            "selected_workflow": intent,
            "execution_steps": steps + [f"plan_workflow → confirmed {intent}"],
        }

    # Fallback to LLM planning
    try:
        llm = ChatOpenAI(model=settings.openai_model, temperature=0, api_key=settings.openai_api_key)
        messages = [
            SystemMessage(content=PLANNER_SYSTEM),
            HumanMessage(content=state["query"]),
        ]
        response = llm.invoke(messages)
        chosen = response.content.strip().lower()
        valid = {"loan", "account", "compliance", "transaction", "conversation", "committee", "resilience"}
        workflow = chosen if chosen in valid else "conversation"
        logger.info("[Autonomous] LLM selected workflow: %s", workflow)
        return {
            "selected_workflow": workflow,
            "execution_steps": steps + [f"plan_workflow → LLM selected {workflow}"],
        }
    except Exception as exc:
        logger.error("[Autonomous] LLM planner failed: %s", exc)
        return {
            "selected_workflow": "conversation",
            "execution_steps": steps + ["plan_workflow → fallback to conversation"],
            "error": str(exc),
        }


def execute_workflow(state: AutonomousAgentState) -> AutonomousAgentState:
    """Dispatch to the appropriate specialist sub-graph."""
    workflow = state.get("selected_workflow", "conversation")
    query = state.get("query", "")
    context = state.get("context", {})
    account_id = state.get("account_id")
    session_id = state.get("session_id", "default")
    steps = state.get("execution_steps", [])

    logger.info("[Autonomous] Executing workflow: %s", workflow)

    try:
        result: dict = {}

        if workflow == "loan":
            from app.graphs.loan_eligibility import run_loan_eligibility
            payload = {
                "applicant_id": context.get("applicant_id", "autonomous-agent"),
                "loan_type": context.get("loan_type", "personal"),
                "requested_amount": context.get("requested_amount", 10000),
                "annual_income": context.get("annual_income", 60000),
                "credit_score": context.get("credit_score", 700),
                "employment_years": context.get("employment_years", 3),
                "existing_debt": context.get("existing_debt", 0),
            }
            raw = run_loan_eligibility(payload)
            result = {
                "answer": (
                    f"Loan eligibility result: **{raw.get('decision', '').upper()}**. "
                    + (f"Eligible amount: ${raw.get('eligible_amount', 0):,.0f} at {raw.get('interest_rate', 0):.2f}% for {raw.get('loan_term_months', 0)} months." if raw.get("decision") == "approved" else f"Reason: {raw.get('rejection_reason', 'N/A')}")
                ),
                "raw": raw,
            }

        elif workflow == "account":
            from app.graphs.account_agent import run_account_agent
            aid = account_id or context.get("account_id", "ACC-DEMO-001")
            raw = run_account_agent(account_id=aid, query=query)
            result = {"answer": raw.get("answer", ""), "tools_used": raw.get("tools_used", [])}

        elif workflow == "compliance":
            from app.graphs.compliance_rag import run_compliance_rag
            raw = run_compliance_rag(query=query, category=context.get("category"))
            result = {
                "answer": raw.get("answer", ""),
                "sources": raw.get("sources", []),
            }

        elif workflow == "transaction":
            from app.graphs.transaction_router import run_transaction_router
            import uuid
            payload = {
                "transaction_id": context.get("transaction_id", str(uuid.uuid4())),
                "transaction_type": context.get("transaction_type", "fraud_check"),
                "amount": context.get("amount", 0),
                "account_id": account_id or "DEMO",
                "metadata": {},
            }
            raw = run_transaction_router(payload)
            result = {
                "answer": (
                    f"Transaction routed to **{raw.get('routing_decision', 'N/A')}** "
                    f"with priority **{raw.get('priority', 'N/A')}**."
                    + (" Human review required." if raw.get("requires_human_review") else "")
                ),
                "raw": raw,
            }

        elif workflow == "committee":
            from app.graphs.loan_committee import run_loan_committee
            payload = {
                "application_id": context.get("application_id", "auto-app-001"),
                "applicant_name": context.get("applicant_name", "Autonomous Agent"),
                "requested_amount": context.get("requested_amount", 500000),
                "annual_income": context.get("annual_income", 120000),
                "credit_score": context.get("credit_score", 720),
                "employment_years": context.get("employment_years", 5),
                "existing_debt": context.get("existing_debt", 0),
                "loan_type": context.get("loan_type", "business"),
                "collateral_value": context.get("collateral_value", 300000),
            }
            raw = run_loan_committee(payload)
            result = {
                "answer": (
                    f"Loan committee verdict: **{raw.get('final_verdict', 'N/A').upper()}**. "
                    + (f"Amount: ${raw.get('recommended_amount', 0):,.0f} at {raw.get('interest_rate', 0):.2f}%." if raw.get("final_verdict") == "approved" else "")
                ),
                "raw": raw,
            }

        elif workflow == "resilience":
            from app.graphs.resilient_agent import run_resilient_agent
            raw = run_resilient_agent(query=query, intent=context.get("intent"))
            result = {
                "answer": raw.get("response", ""),
                "circuit_state": raw.get("circuit_state"),
                "used_fallback": raw.get("used_fallback", False),
            }

        else:
            # conversation — always available, handles general queries
            from app.graphs.conversation_agent import run_conversation
            raw = run_conversation(
                session_id=session_id,
                message=query,
                account_id=account_id,
            )
            result = {"answer": raw.get("reply", ""), "intent": raw.get("intent")}

        return {
            "workflow_result": result,
            "used_fallback": result.get("used_fallback", False),
            "execution_steps": steps + [f"execute_workflow → {workflow} ✓"],
        }

    except Exception as exc:
        logger.exception("[Autonomous] Workflow %s failed: %s", workflow, exc)
        return {
            "workflow_result": None,
            "error": str(exc),
            "execution_steps": steps + [f"execute_workflow → {workflow} FAILED: {exc}"],
        }


def enrich_with_rag(state: AutonomousAgentState) -> AutonomousAgentState:
    """
    For compliance workflows, augment the answer with additional RAG context.
    Skip for all other workflow types — this is a no-op guard.
    """
    workflow = state.get("selected_workflow")
    steps = state.get("execution_steps", [])

    if workflow != "compliance":
        return {"execution_steps": steps + ["enrich_with_rag → skipped (non-compliance)"]}

    # Already RAG-powered — just tag the step
    return {"execution_steps": steps + ["enrich_with_rag → compliance RAG already applied"]}


def handle_failure(state: AutonomousAgentState) -> AutonomousAgentState:
    """Produce a safe, professional fallback answer when a workflow crashes."""
    error = state.get("error", "unknown error")
    query = state.get("query", "")
    steps = state.get("execution_steps", [])

    fallback = (
        "I'm sorry, I encountered a technical issue while processing your request. "
        "Please try again, or contact support if the problem persists. "
        f"(Query: '{query[:80]}...')" if len(query) > 80 else f"(Query: '{query}')"
    )

    logger.warning("[Autonomous] Serving fallback | error=%s", error)
    return {
        "final_answer": fallback,
        "used_fallback": True,
        "execution_steps": steps + [f"handle_failure → served fallback (error: {error[:60]})"],
    }


def synthesize_response(state: AutonomousAgentState) -> AutonomousAgentState:
    """Compose the final unified answer from workflow result + RAG augmentation."""
    result = state.get("workflow_result") or {}
    steps = state.get("execution_steps", [])

    answer = result.get("answer") or state.get("final_answer") or (
        "I processed your request but could not generate a specific response. "
        "Please provide more details."
    )

    sources = result.get("sources", [])

    return {
        "final_answer": answer,
        "sources": sources,
        "execution_steps": steps + ["synthesize_response → done"],
    }


# ── Conditional edges ──────────────────────────────────────────────────────────

def route_after_execution(
    state: AutonomousAgentState,
) -> Literal["enrich_with_rag", "handle_failure"]:
    if state.get("error") or state.get("workflow_result") is None:
        return "handle_failure"
    return "enrich_with_rag"


# ── Graph assembly ──────────────────────────────────────────────────────────────

def build_autonomous_agent():
    graph = StateGraph(AutonomousAgentState)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("plan_workflow", plan_workflow)
    graph.add_node("execute_workflow", execute_workflow)
    graph.add_node("enrich_with_rag", enrich_with_rag)
    graph.add_node("handle_failure", handle_failure)
    graph.add_node("synthesize_response", synthesize_response)

    graph.set_entry_point("classify_intent")
    graph.add_edge("classify_intent", "plan_workflow")
    graph.add_edge("plan_workflow", "execute_workflow")

    graph.add_conditional_edges(
        "execute_workflow",
        route_after_execution,
        {
            "enrich_with_rag": "enrich_with_rag",
            "handle_failure": "handle_failure",
        },
    )

    graph.add_edge("enrich_with_rag", "synthesize_response")
    graph.add_edge("handle_failure", "synthesize_response")
    graph.add_edge("synthesize_response", END)

    return graph.compile()


autonomous_agent_graph = build_autonomous_agent()


def run_autonomous_agent(
    query: str,
    session_id: str = "default",
    account_id: Optional[str] = None,
    context: Optional[dict] = None,
) -> dict:
    result = autonomous_agent_graph.invoke(
        {
            "query": query,
            "session_id": session_id,
            "account_id": account_id,
            "context": context or {},
            "execution_steps": [],
            "sources": [],
            "used_fallback": False,
        }
    )
    return {
        "answer": result.get("final_answer", ""),
        "workflow_used": result.get("selected_workflow", "unknown"),
        "sources": result.get("sources", []),
        "used_fallback": result.get("used_fallback", False),
        "execution_steps": result.get("execution_steps", []),
    }
