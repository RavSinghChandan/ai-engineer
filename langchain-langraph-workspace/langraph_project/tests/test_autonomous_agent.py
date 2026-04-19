"""Tests — Step 11: Autonomous Banking AI Agent.

These tests validate intent classification and workflow routing without
making real LLM / OpenAI calls (the LLM path is integration-tested separately).
We mock the sub-graph execute functions to isolate the orchestrator logic.
"""

import pytest
from unittest.mock import patch, MagicMock

from app.graphs.autonomous_agent import (
    classify_intent,
    plan_workflow,
    route_after_execution,
    synthesize_response,
    handle_failure,
)
from app.schemas.autonomous import AutonomousAgentState


def _state(**kwargs) -> AutonomousAgentState:
    base: AutonomousAgentState = {
        "query": "",
        "session_id": "test-session",
        "context": {},
        "execution_steps": [],
        "sources": [],
        "used_fallback": False,
    }
    base.update(kwargs)
    return base


# ── classify_intent ────────────────────────────────────────────────────────────

def test_classify_loan_intent():
    result = classify_intent(_state(query="Am I eligible for a home loan?"))
    assert result["intent"] == "loan"


def test_classify_account_intent():
    result = classify_intent(_state(query="What is my account balance?"))
    assert result["intent"] == "account"


def test_classify_compliance_intent():
    result = classify_intent(_state(query="What are the KYC requirements?"))
    assert result["intent"] == "compliance"


def test_classify_fraud_intent():
    result = classify_intent(_state(query="This transaction looks suspicious"))
    assert result["intent"] == "transaction"


def test_classify_unknown_intent():
    result = classify_intent(_state(query="Hello there, how are you?"))
    assert result["intent"] == "unknown"


def test_classify_adds_execution_step():
    result = classify_intent(_state(query="loan inquiry"))
    assert len(result["execution_steps"]) == 1
    assert "classify_intent" in result["execution_steps"][0]


# ── plan_workflow ──────────────────────────────────────────────────────────────

def test_plan_workflow_uses_known_intent():
    result = plan_workflow(_state(query="loan", intent="loan"))
    assert result["selected_workflow"] == "loan"


def test_plan_workflow_uses_account_intent():
    result = plan_workflow(_state(query="balance", intent="account"))
    assert result["selected_workflow"] == "account"


# ── route_after_execution ──────────────────────────────────────────────────────

def test_route_success():
    state = _state(workflow_result={"answer": "OK"})
    assert route_after_execution(state) == "enrich_with_rag"


def test_route_failure_on_error():
    state = _state(workflow_result=None, error="LLM down")
    assert route_after_execution(state) == "handle_failure"


def test_route_failure_on_none_result():
    state = _state(workflow_result=None)
    assert route_after_execution(state) == "handle_failure"


# ── handle_failure ─────────────────────────────────────────────────────────────

def test_handle_failure_produces_answer():
    result = handle_failure(_state(query="any query", error="timeout"))
    assert result["final_answer"]
    assert result["used_fallback"] is True


# ── synthesize_response ────────────────────────────────────────────────────────

def test_synthesize_response_uses_workflow_answer():
    state = _state(workflow_result={"answer": "You are eligible.", "sources": ["KYC.pdf"]})
    result = synthesize_response(state)
    assert result["final_answer"] == "You are eligible."
    assert "KYC.pdf" in result["sources"]


def test_synthesize_response_fallback_message_when_empty():
    state = _state(workflow_result={})
    result = synthesize_response(state)
    assert result["final_answer"]  # non-empty fallback text


# ── Integration: run_autonomous_agent (mocked sub-graphs) ─────────────────────

@patch("app.graphs.loan_eligibility.run_loan_eligibility")
def test_autonomous_routes_to_loan(mock_loan):
    mock_loan.return_value = {
        "decision": "approved",
        "eligible_amount": 15000,
        "interest_rate": 8.5,
        "loan_term_months": 36,
        "rejection_reason": None,
    }
    from app.graphs.autonomous_agent import run_autonomous_agent
    result = run_autonomous_agent(
        query="check my loan eligibility",
        session_id="test",
        context={"annual_income": 60000, "credit_score": 720, "requested_amount": 15000},
    )
    assert result["workflow_used"] == "loan"
    assert "answer" in result


@patch("app.graphs.compliance_rag.run_compliance_rag")
def test_autonomous_routes_to_compliance(mock_rag):
    mock_rag.return_value = {
        "answer": "KYC requires ID and address proof.",
        "sources": ["kyc_policy.txt"],
    }
    from app.graphs.autonomous_agent import run_autonomous_agent
    result = run_autonomous_agent(query="What are the KYC requirements?", session_id="test")
    assert result["workflow_used"] == "compliance"
    assert result["answer"]
