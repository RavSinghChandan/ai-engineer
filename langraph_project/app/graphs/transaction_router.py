"""
Step 2 — Transaction Routing Graph

Graph flow:
  classify_transaction
        ↓
  [conditional edge] ─── route_to_payment
                     ─── route_to_loan
                     ─── route_to_fraud
                     ─── route_to_compliance
                     ─── route_to_account
                     ─── flag_for_human_review
        ↓
  assign_priority
        ↓
  END
"""

import logging
from typing import Literal, Optional
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, END

from app.schemas.transaction import (
    TransactionType,
    TransactionPriority,
    RoutingDecision,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Typed state — LangGraph merges node return dicts into this schema
# ---------------------------------------------------------------------------

class TransactionGraphState(TypedDict, total=False):
    transaction_id: str
    transaction_type: TransactionType
    amount: Optional[float]
    account_id: Optional[str]
    priority: Optional[TransactionPriority]
    routing_decision: Optional[RoutingDecision]
    requires_human_review: bool
    error: Optional[str]
    metadata: dict


# ---------------------------------------------------------------------------
# Node functions — receive full accumulated state, return partial updates
# ---------------------------------------------------------------------------

def classify_transaction(state: TransactionGraphState) -> TransactionGraphState:
    tx_type = state.get("transaction_type")
    logger.info("Classifying transaction %s | type=%s", state["transaction_id"], tx_type)

    if tx_type not in TransactionType.__members__.values():
        return {"transaction_type": TransactionType.UNKNOWN, "error": f"Unknown type: {tx_type}"}

    return {"transaction_type": TransactionType(tx_type)}


def route_to_payment(state: TransactionGraphState) -> TransactionGraphState:
    logger.info("Routing %s → PAYMENT_PROCESSOR", state["transaction_id"])
    return {"routing_decision": RoutingDecision.PAYMENT_PROCESSOR}


def route_to_loan(state: TransactionGraphState) -> TransactionGraphState:
    logger.info("Routing %s → LOAN_ENGINE", state["transaction_id"])
    return {"routing_decision": RoutingDecision.LOAN_ENGINE}


def route_to_fraud(state: TransactionGraphState) -> TransactionGraphState:
    logger.info("Routing %s → FRAUD_ENGINE", state["transaction_id"])
    return {"routing_decision": RoutingDecision.FRAUD_ENGINE, "requires_human_review": True}


def route_to_compliance(state: TransactionGraphState) -> TransactionGraphState:
    logger.info("Routing %s → COMPLIANCE_ASSISTANT", state["transaction_id"])
    return {"routing_decision": RoutingDecision.COMPLIANCE_ASSISTANT}


def route_to_account(state: TransactionGraphState) -> TransactionGraphState:
    logger.info("Routing %s → ACCOUNT_AGENT", state["transaction_id"])
    return {"routing_decision": RoutingDecision.ACCOUNT_AGENT}


def flag_for_human_review(state: TransactionGraphState) -> TransactionGraphState:
    logger.warning("Routing %s → HUMAN_REVIEW (unknown type)", state["transaction_id"])
    return {
        "routing_decision": RoutingDecision.HUMAN_REVIEW,
        "requires_human_review": True,
    }


def assign_priority(state: TransactionGraphState) -> TransactionGraphState:
    tx_type = state.get("transaction_type")
    amount = state.get("amount") or 0.0

    if tx_type == TransactionType.FRAUD_CHECK or amount > 50_000:
        priority = TransactionPriority.HIGH
    elif tx_type in (TransactionType.LOAN, TransactionType.PAYMENT) or amount > 5_000:
        priority = TransactionPriority.MEDIUM
    else:
        priority = TransactionPriority.LOW

    logger.info("Priority for %s → %s", state["transaction_id"], priority)
    return {"priority": priority}


# ---------------------------------------------------------------------------
# Conditional edge
# ---------------------------------------------------------------------------

RouteKey = Literal["payment", "loan", "fraud", "compliance", "account", "human_review"]


def decide_route(state: TransactionGraphState) -> RouteKey:
    tx_type = state.get("transaction_type")
    routing_map = {
        TransactionType.PAYMENT: "payment",
        TransactionType.LOAN: "loan",
        TransactionType.FRAUD_CHECK: "fraud",
        TransactionType.COMPLIANCE: "compliance",
        TransactionType.ACCOUNT_LOOKUP: "account",
    }
    return routing_map.get(tx_type, "human_review")


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_transaction_router():
    graph = StateGraph(TransactionGraphState)

    graph.add_node("classify_transaction", classify_transaction)
    graph.add_node("route_to_payment", route_to_payment)
    graph.add_node("route_to_loan", route_to_loan)
    graph.add_node("route_to_fraud", route_to_fraud)
    graph.add_node("route_to_compliance", route_to_compliance)
    graph.add_node("route_to_account", route_to_account)
    graph.add_node("flag_for_human_review", flag_for_human_review)
    graph.add_node("assign_priority", assign_priority)

    graph.set_entry_point("classify_transaction")

    graph.add_conditional_edges(
        "classify_transaction",
        decide_route,
        {
            "payment": "route_to_payment",
            "loan": "route_to_loan",
            "fraud": "route_to_fraud",
            "compliance": "route_to_compliance",
            "account": "route_to_account",
            "human_review": "flag_for_human_review",
        },
    )

    for node in (
        "route_to_payment",
        "route_to_loan",
        "route_to_fraud",
        "route_to_compliance",
        "route_to_account",
        "flag_for_human_review",
    ):
        graph.add_edge(node, "assign_priority")

    graph.add_edge("assign_priority", END)

    return graph.compile()


# Singleton — compiled once, reused across requests
transaction_router_graph = build_transaction_router()


def run_transaction_router(request_data: dict) -> dict:
    result = transaction_router_graph.invoke(request_data)
    return result
