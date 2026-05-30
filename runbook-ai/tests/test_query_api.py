"""Tests for Phase 3 query API endpoints."""
import json
import os
import tempfile
import pytest
from unittest.mock import patch

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
from database.runbooks_store import save_runbook
from database.graph_store import build_and_save_graph

init_db()


def _seed():
    state = {
        "title": "Database Connection Pool Exhausted",
        "description": "Fix database connection pool exhaustion causing timeouts",
        "category": "database",
        "severity": "P1",
        "tags": ["database", "postgres", "connections"],
        "prerequisites": ["DB admin access"],
        "estimated_duration_minutes": 10,
        "steps": [
            {"step_number": 1, "title": "Check connections", "description": "List active connections", "commands": ["SELECT count(*) FROM pg_stat_activity;"], "expected_output": "Connection count", "depends_on": [], "is_optional": False, "timeout_seconds": 10},
            {"step_number": 2, "title": "Kill idle connections", "description": "Terminate idle connections", "commands": ["SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' AND state_change < NOW() - INTERVAL '10 minutes';"], "expected_output": "Connections terminated", "depends_on": [1], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 3, "title": "Restart pool", "description": "Restart connection pooler", "commands": ["systemctl restart pgbouncer"], "expected_output": "PgBouncer restarted", "depends_on": [2], "is_optional": False, "timeout_seconds": 30},
        ],
        "rollback_steps": [],
    }
    rb_id = save_runbook(state, "db.pdf", total_pages=1)
    build_and_save_graph(rb_id)
    return rb_id


RB_ID = _seed()

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

MOCK_CLASSIFY = json.dumps({
    "keywords": ["database", "connections", "timeout"],
    "category": "database",
    "severity": "P1",
    "symptoms": ["connection timeouts"],
    "affected_component": "postgres",
    "search_terms": ["database", "connections"],
})

MOCK_TRIAGE = "Check active DB connections immediately. Terminate idle sessions and restart PgBouncer. Estimated resolution: 10 minutes."


# ── POST /query ───────────────────────────────────────────────────

def test_query_full_pipeline():
    with patch("agents.incident_classifier_agent.call_llm", return_value=MOCK_CLASSIFY):
        with patch("agents.response_composer_agent.call_llm", return_value=MOCK_TRIAGE):
            resp = client.post("/query", json={
                "incident": "Database is throwing connection pool exhausted errors and all queries are timing out"
            })

    assert resp.status_code == 200
    data = resp.json()
    assert data["classification"]["category"] == "database"
    assert data["selected_runbook_id"] == RB_ID
    assert data["match_confidence"] == "HIGH"
    assert data["response"]["total_steps"] == 3
    assert data["response"]["source"] == "database"


def test_query_commands_are_exact():
    with patch("agents.incident_classifier_agent.call_llm", return_value=MOCK_CLASSIFY):
        with patch("agents.response_composer_agent.call_llm", return_value=MOCK_TRIAGE):
            resp = client.post("/query", json={
                "incident": "Database connection pool is exhausted, queries failing"
            })

    data = resp.json()
    step1 = data["response"]["steps"][0]
    assert step1["commands"] == ["SELECT count(*) FROM pg_stat_activity;"]


def test_query_execution_order_correct():
    with patch("agents.incident_classifier_agent.call_llm", return_value=MOCK_CLASSIFY):
        with patch("agents.response_composer_agent.call_llm", return_value=MOCK_TRIAGE):
            resp = client.post("/query", json={
                "incident": "DB connection pool exhausted causing timeouts across all services"
            })

    data = resp.json()
    order = [s["step_number"] for s in data["response"]["steps"]]
    assert order == sorted(order)


def test_query_too_short_rejected():
    resp = client.post("/query", json={"incident": "db down"})
    assert resp.status_code == 422  # Pydantic min_length validation


def test_query_pinned_runbook():
    with patch("agents.response_composer_agent.call_llm", return_value=MOCK_TRIAGE):
        resp = client.post("/query", json={
            "incident": "Database connection pool exhausted causing all queries to fail",
            "runbook_id": RB_ID,
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["match_strategy"] == "pinned"
    assert data["selected_runbook_id"] == RB_ID


def test_query_pinned_nonexistent_runbook():
    resp = client.post("/query", json={
        "incident": "Some database incident occurring right now",
        "runbook_id": 99999,
    })
    assert resp.status_code == 404


def test_query_no_matching_runbook():
    mock_classify = json.dumps({
        "keywords": ["xyzunknown"],
        "category": "other",
        "severity": "P4",
        "symptoms": [],
        "affected_component": "",
        "search_terms": ["xyzunknownservice99"],
    })
    with patch("agents.incident_classifier_agent.call_llm", return_value=mock_classify):
        resp = client.post("/query", json={
            "incident": "xyzunknownservice is behaving strangely with no known runbook"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_runbook_id"] is None
    assert "suggestions" in data["response"]


# ── POST /query/classify ──────────────────────────────────────────

def test_classify_endpoint():
    with patch("agents.incident_classifier_agent.call_llm", return_value=MOCK_CLASSIFY):
        resp = client.post("/query/classify", json={
            "incident": "Database connection pool is exhausted"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["classification"]["category"] == "database"
    assert data["classification"]["severity"] == "P1"


# ── POST /query/match ─────────────────────────────────────────────

def test_match_endpoint():
    with patch("agents.incident_classifier_agent.call_llm", return_value=MOCK_CLASSIFY):
        resp = client.post("/query/match", json={
            "incident": "Database is throwing connection errors"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert "matched_runbooks" in data
    assert data["total_matches"] >= 1


# ── POST /query/runbook/{id} ──────────────────────────────────────

def test_query_specific_runbook():
    with patch("agents.response_composer_agent.call_llm", return_value=MOCK_TRIAGE):
        resp = client.post(f"/query/runbook/{RB_ID}", json={
            "incident": "Database connections are exhausted"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["runbook_id"] == RB_ID
    assert data["response"]["total_steps"] == 3


def test_query_specific_runbook_not_found():
    resp = client.post("/query/runbook/99999", json={
        "incident": "Some incident requiring a specific runbook response"
    })
    assert resp.status_code == 404
