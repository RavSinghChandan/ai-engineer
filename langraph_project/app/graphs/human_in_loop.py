"""
Step 10 — Human-in-the-Loop Loan Approval

Graph flow:
  analyze_request
       │
       ▼
  [INTERRUPT — execution pauses here, waiting for officer input]
  human_review   (officer decision injected via API)
       │
       ▼ (conditional on human_decision)
  finalize_approval ──▶ END
  reject_by_human   ──▶ END

The graph is compiled with interrupt_before=["human_review"].
On first invoke: graph runs analyze_request, then STOPS.
On second invoke (with human_decision + human_approver in state): resumes at human_review.

Use submit_for_review()      → starts the graph (returns PENDING_HUMAN_REVIEW)
Use resume_with_decision()   → resumes and finalises the graph
"""

import logging
from typing import Literal, Optional
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger(__name__)


# ── State ──────────────────────────────────────────────────────────────────────

class HILState(TypedDict, total=False):
    application_id: str
    loan_amount: float
    applicant_name: str
    risk_level: str               # LOW | MEDIUM | HIGH
    officer_notes: str
    human_decision: Optional[str] # "approved" | "rejected"
    human_approver: Optional[str]
    final_status: Optional[str]
    conditions: list


# ── Nodes ──────────────────────────────────────────────────────────────────────

def analyze_request(state: HILState) -> HILState:
    """Risk-classify the application before sending to human review."""
    amount = state.get("loan_amount", 0)
    if amount > 500_000:
        risk_level = "HIGH"
    elif amount > 100_000:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    logger.info(
        "[HIL] Pre-classified | app=%s risk=%s amount=$%.0f",
        state["application_id"], risk_level, amount,
    )
    return {"risk_level": risk_level}


def human_review(state: HILState) -> HILState:
    """
    This node is NEVER called directly — the graph is interrupted before it.
    When resumed the officer's decision is already in the state.
    """
    logger.info(
        "[HIL] Officer review complete | decision=%s approver=%s",
        state.get("human_decision"), state.get("human_approver"),
    )
    return {}


def finalize_approval(state: HILState) -> HILState:
    logger.info("[HIL] APPROVED | app=%s by=%s", state["application_id"], state.get("human_approver"))
    conditions = []
    risk = state.get("risk_level", "LOW")
    if risk == "HIGH":
        conditions += ["Co-signer documentation required", "Quarterly financial review required"]
    elif risk == "MEDIUM":
        conditions += ["Proof of income verification required"]
    return {"final_status": "APPROVED", "conditions": conditions}


def reject_by_human(state: HILState) -> HILState:
    logger.info(
        "[HIL] REJECTED | app=%s by=%s notes=%s",
        state["application_id"], state.get("human_approver"), state.get("officer_notes"),
    )
    return {"final_status": "REJECTED", "conditions": []}


# ── Conditional edge ────────────────────────────────────────────────────────────

def route_decision(
    state: HILState,
) -> Literal["finalize_approval", "reject_by_human"]:
    if state.get("human_decision") == "approved":
        return "finalize_approval"
    return "reject_by_human"


# ── Graph assembly ──────────────────────────────────────────────────────────────

_hitl_checkpointer = MemorySaver()


def build_hitl_graph():
    graph = StateGraph(HILState)

    graph.add_node("analyze_request", analyze_request)
    graph.add_node("human_review", human_review)
    graph.add_node("finalize_approval", finalize_approval)
    graph.add_node("reject_by_human", reject_by_human)

    graph.set_entry_point("analyze_request")
    graph.add_edge("analyze_request", "human_review")

    graph.add_conditional_edges(
        "human_review",
        route_decision,
        {
            "finalize_approval": "finalize_approval",
            "reject_by_human": "reject_by_human",
        },
    )

    graph.add_edge("finalize_approval", END)
    graph.add_edge("reject_by_human", END)

    # interrupt_before stops execution just before human_review, waiting for human input
    return graph.compile(
        checkpointer=_hitl_checkpointer,
        interrupt_before=["human_review"],
    )


hitl_graph = build_hitl_graph()


# ── Public API ─────────────────────────────────────────────────────────────────

def submit_for_review(
    application_id: str,
    loan_amount: float,
    applicant_name: str,
) -> dict:
    """
    Start the HIL workflow.
    Graph runs analyze_request then PAUSES — returns status=PENDING_HUMAN_REVIEW.
    """
    config = {"configurable": {"thread_id": application_id}}
    result = hitl_graph.invoke(
        {
            "application_id": application_id,
            "loan_amount": loan_amount,
            "applicant_name": applicant_name,
        },
        config=config,
    )
    return {
        "status": "PENDING_HUMAN_REVIEW",
        "risk_level": result.get("risk_level", "UNKNOWN"),
    }


def resume_with_decision(
    application_id: str,
    decision: str,
    approver: str,
    notes: str = "",
) -> dict:
    """
    Resume the paused HIL workflow with the officer's decision.

    LangGraph interrupt resume protocol (0.1.x):
      1. update_state() — inject the human's decision into the checkpointed state
      2. invoke(None, config) — resume execution from the interrupt point
    """
    config = {"configurable": {"thread_id": application_id}}

    # Step 1 — write decision into the paused checkpoint
    hitl_graph.update_state(
        config,
        {
            "human_decision": decision,
            "human_approver": approver,
            "officer_notes": notes,
        },
    )

    # Step 2 — resume; passing None means "continue from checkpoint"
    result = hitl_graph.invoke(None, config=config)

    return {
        "application_id": application_id,
        "final_status": result.get("final_status", "UNKNOWN"),
        "conditions": result.get("conditions", []),
        "approver": approver,
        "notes": notes,
        "risk_level": result.get("risk_level", "UNKNOWN"),
    }
