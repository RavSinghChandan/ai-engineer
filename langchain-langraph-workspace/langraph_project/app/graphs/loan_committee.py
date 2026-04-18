"""
Step 7 — Multi-Agent Loan Approval Committee

Graph flow:
  planner_agent
       │
       ▼
  executor_agent
       │
       ▼
  validator_agent
       │
       ▼ (conditional on final_verdict)
  approved_handler ──▶ END
  rejected_handler ──▶ END
  escalation_handler ─▶ END

Three autonomous agents share a single typed state dict.
Each agent reads the full accumulated state and writes only its own fields.
The Validator has final binding authority — its verdict cannot be overridden.
"""

import logging
from typing import Literal

from langgraph.graph import StateGraph, END

from app.schemas.loan_committee import LoanCommitteeState, CommitteeVerdict
from app.agents.planner import planner_agent
from app.agents.executor import executor_agent
from app.agents.validator import validator_agent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Terminal handler nodes — produce structured audit log entries
# ---------------------------------------------------------------------------

def approved_handler(state: LoanCommitteeState) -> LoanCommitteeState:
    logger.info(
        "[Committee] APPROVED | app=%s amount=$%.0f rate=%.2f%% conditions=%d",
        state["application_id"],
        state.get("recommended_amount", 0),
        state.get("interest_rate", 0),
        len(state.get("conditions", [])),
    )
    return {}


def rejected_handler(state: LoanCommitteeState) -> LoanCommitteeState:
    logger.info(
        "[Committee] REJECTED | app=%s",
        state["application_id"],
    )
    return {}


def escalation_handler(state: LoanCommitteeState) -> LoanCommitteeState:
    logger.warning(
        "[Committee] ESCALATED → senior officer review | app=%s risk=%.1f",
        state["application_id"],
        state.get("risk_score", 0),
    )
    return {}


# ---------------------------------------------------------------------------
# Conditional edge — routes based on Validator's final verdict
# ---------------------------------------------------------------------------

def route_verdict(
    state: LoanCommitteeState,
) -> Literal["approved_handler", "rejected_handler", "escalation_handler"]:
    verdict = state.get("final_verdict")
    if verdict == CommitteeVerdict.APPROVED:
        return "approved_handler"
    if verdict == CommitteeVerdict.REJECTED:
        return "rejected_handler"
    return "escalation_handler"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_loan_committee_graph():
    graph = StateGraph(LoanCommitteeState)

    # Agent nodes
    graph.add_node("planner_agent", planner_agent)
    graph.add_node("executor_agent", executor_agent)
    graph.add_node("validator_agent", validator_agent)

    # Terminal handler nodes
    graph.add_node("approved_handler", approved_handler)
    graph.add_node("rejected_handler", rejected_handler)
    graph.add_node("escalation_handler", escalation_handler)

    # Linear pipeline: Planner → Executor → Validator
    graph.set_entry_point("planner_agent")
    graph.add_edge("planner_agent", "executor_agent")
    graph.add_edge("executor_agent", "validator_agent")

    # Conditional split on verdict
    graph.add_conditional_edges(
        "validator_agent",
        route_verdict,
        {
            "approved_handler": "approved_handler",
            "rejected_handler": "rejected_handler",
            "escalation_handler": "escalation_handler",
        },
    )

    graph.add_edge("approved_handler", END)
    graph.add_edge("rejected_handler", END)
    graph.add_edge("escalation_handler", END)

    return graph.compile()


loan_committee_graph = build_loan_committee_graph()


def run_loan_committee(request_data: dict) -> dict:
    result = loan_committee_graph.invoke(request_data)
    return result
