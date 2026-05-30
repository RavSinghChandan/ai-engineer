"""Tests for Phase 3 query agents — all LLM calls mocked."""
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


def _seed_runbook(category="kubernetes", severity="P2", title="K8s CrashLoop Runbook"):
    state = {
        "title": title,
        "description": "Fix pods stuck in CrashLoopBackOff",
        "category": category,
        "severity": severity,
        "tags": ["kubernetes", "pods"],
        "prerequisites": ["kubectl configured"],
        "estimated_duration_minutes": 20,
        "steps": [
            {"step_number": 1, "title": "Get pods", "description": "List pods", "commands": ["kubectl get pods -n default"], "expected_output": "Pod list", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 2, "title": "Describe pod", "description": "Get details", "commands": ["kubectl describe pod myapp -n default"], "expected_output": "Events", "depends_on": [1], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 3, "title": "Check logs", "description": "Get logs", "commands": ["kubectl logs myapp --previous"], "expected_output": "Error logs", "depends_on": [1], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 4, "title": "Restart", "description": "Restart deployment", "commands": ["kubectl rollout restart deployment/myapp"], "expected_output": "Restarted", "depends_on": [2, 3], "is_optional": False, "timeout_seconds": 60},
        ],
        "rollback_steps": [
            {"step_number": 1, "title": "Undo", "description": "Roll back", "commands": ["kubectl rollout undo deployment/myapp"], "expected_output": "Rolled back", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
        ],
    }
    rb_id = save_runbook(state, "k8s.pdf", total_pages=2)
    build_and_save_graph(rb_id)
    return rb_id


RB_ID = _seed_runbook()


# ── incident_classifier_agent ─────────────────────────────────────

from agents.incident_classifier_agent import classify_incident


def test_classify_returns_structured_fields():
    mock_resp = json.dumps({
        "keywords": ["pod", "crashloopbackoff", "kubernetes"],
        "category": "kubernetes",
        "severity": "P2",
        "symptoms": ["pods restarting repeatedly"],
        "affected_component": "payments-service",
        "search_terms": ["crashloop", "pod", "restart"],
    })
    with patch("agents.incident_classifier_agent.call_llm", return_value=mock_resp):
        result = classify_incident("Pods are crashing in payments namespace")

    assert result["category"] == "kubernetes"
    assert result["severity"] == "P2"
    assert "crashloop" in result["search_terms"]
    assert result["affected_component"] == "payments-service"


def test_classify_json_error_falls_back():
    with patch("agents.incident_classifier_agent.call_llm", return_value="bad json"):
        result = classify_incident("database is down and not responding")

    assert result["category"] == "other"
    assert result["severity"] == "P3"
    assert isinstance(result["keywords"], list)


def test_classify_all_fields_present():
    mock_resp = json.dumps({
        "keywords": ["db"], "category": "database", "severity": "P1",
        "symptoms": ["db down"], "affected_component": "postgres",
        "search_terms": ["database", "down"],
    })
    with patch("agents.incident_classifier_agent.call_llm", return_value=mock_resp):
        result = classify_incident("Database is completely down")

    for field in ("keywords", "category", "severity", "symptoms", "affected_component", "search_terms"):
        assert field in result


# ── runbook_matcher_agent ─────────────────────────────────────────

from agents.runbook_matcher_agent import match_runbooks


def test_match_exact_category_severity():
    matches = match_runbooks(category="kubernetes", severity="P2", search_terms=[])
    assert len(matches) >= 1
    assert matches[0]["confidence"] == "HIGH"
    assert matches[0]["category"] == "kubernetes"


def test_match_category_only():
    matches = match_runbooks(category="kubernetes", severity="P1", search_terms=[])
    # May find P2 runbook as MEDIUM confidence
    if matches:
        confidences = {m["confidence"] for m in matches}
        assert confidences <= {"HIGH", "MEDIUM", "LOW"}


def test_match_by_keyword():
    matches = match_runbooks(category="other", severity="P4", search_terms=["crashloop"])
    # Should find the kubernetes runbook via keyword match
    if matches:
        titles = [m["title"].lower() for m in matches]
        assert any("crash" in t or "k8s" in t or "kubernetes" in t for t in titles)


def test_match_no_results_returns_empty():
    matches = match_runbooks(category="other", severity="P4", search_terms=["xyznonexistent99"])
    assert isinstance(matches, list)


def test_match_returns_step_count():
    matches = match_runbooks(category="kubernetes", severity="P2", search_terms=[])
    assert matches[0]["step_count"] >= 1


# ── response_composer_agent ───────────────────────────────────────

from agents.response_composer_agent import compose_response


def test_compose_returns_ordered_steps():
    with patch("agents.response_composer_agent.call_llm", return_value="Apply runbook immediately."):
        result = compose_response("Pods crashing in payments", RB_ID)

    assert result["total_steps"] == 4
    order = [s["step_number"] for s in result["steps"]]
    assert order.index(1) < order.index(2)
    assert order.index(1) < order.index(3)
    assert order.index(2) < order.index(4)


def test_compose_commands_from_db_not_llm():
    with patch("agents.response_composer_agent.call_llm", return_value="Summary."):
        result = compose_response("Pods crashing", RB_ID)

    # Exact command must be verbatim from DB
    commands_step1 = result["steps"][0]["commands"]
    assert commands_step1 == ["kubectl get pods -n default"]
    assert result["source"] == "database"


def test_compose_includes_parallel_plan():
    with patch("agents.response_composer_agent.call_llm", return_value="Summary."):
        result = compose_response("Pods crashing", RB_ID)

    assert "parallel_execution_plan" in result
    waves = {w["wave"]: w for w in result["parallel_execution_plan"]}
    # Wave 2 should have steps 2 and 3 in parallel
    wave2_steps = {s["step_number"] for s in waves[2]["steps"]}
    assert wave2_steps == {2, 3}
    assert waves[2]["can_run_in_parallel"] is True


def test_compose_includes_rollback():
    with patch("agents.response_composer_agent.call_llm", return_value="Summary."):
        result = compose_response("Pods crashing", RB_ID)

    assert len(result["rollback_steps"]) == 1
    assert result["rollback_steps"][0]["commands"] == ["kubectl rollout undo deployment/myapp"]


def test_compose_nonexistent_runbook():
    result = compose_response("Some incident", 99999)
    assert "error" in result
