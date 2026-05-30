"""Tests for Phase 4 — multi-runbook reasoning, conflict detection, compound incidents."""
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


def _make_rb(title, category, severity, steps, rollback=None):
    state = {
        "title": title,
        "description": f"Runbook: {title}",
        "category": category,
        "severity": severity,
        "tags": [category],
        "prerequisites": [],
        "estimated_duration_minutes": 10,
        "steps": steps,
        "rollback_steps": rollback or [],
    }
    rb_id = save_runbook(state, f"{title}.pdf", total_pages=1)
    build_and_save_graph(rb_id)
    return rb_id


def _step(n, cmd, deps=None):
    return {
        "step_number": n, "title": f"Step {n}", "description": "",
        "commands": [cmd], "expected_output": "", "depends_on": deps or [],
        "is_optional": False, "timeout_seconds": 30,
    }


# Seed two runbooks that conflict on scaling
K8S_RB = _make_rb(
    "K8s Scale Down", "kubernetes", "P2",
    [_step(1, "kubectl get pods -n app"), _step(2, "kubectl scale deployment/myapp --replicas=0", [1])],
    rollback=[_step(1, "kubectl scale deployment/myapp --replicas=3")],
)

DB_RB = _make_rb(
    "Database Recovery", "database", "P1",
    [_step(1, "SELECT count(*) FROM pg_stat_activity;"), _step(2, "systemctl restart postgresql", [1])],
    rollback=[_step(1, "systemctl stop postgresql")],
)

NET_RB = _make_rb(
    "Network Fix", "networking", "P2",
    [_step(1, "ip link set eth0 up"), _step(2, "ping -c 3 8.8.8.8", [1])],
)

CONFLICT_RB = _make_rb(
    "K8s Scale Up", "kubernetes", "P3",
    [_step(1, "kubectl scale deployment/myapp --replicas=3")],
)

from fastapi.testclient import TestClient
from main import app
client = TestClient(app)


# ── conflict_detector_agent ───────────────────────────────────────

from agents.conflict_detector_agent import detect_conflicts


def test_detect_scale_conflict():
    conflicts = detect_conflicts([K8S_RB, CONFLICT_RB])
    assert len(conflicts) >= 1
    types = [c["conflict_type"] for c in conflicts]
    assert "scale" in types


def test_detect_no_conflict_different_domains():
    conflicts = detect_conflicts([DB_RB, NET_RB])
    assert conflicts == []


def test_detect_requires_two_runbooks():
    conflicts = detect_conflicts([K8S_RB])
    assert conflicts == []


def test_conflict_has_required_fields():
    conflicts = detect_conflicts([K8S_RB, CONFLICT_RB])
    c = conflicts[0]
    assert "conflict_type" in c
    assert "severity" in c
    assert "description" in c
    assert "runbook_a" in c
    assert "runbook_b" in c
    assert "recommendation" in c


def test_conflict_severity_high_for_scale():
    conflicts = detect_conflicts([K8S_RB, CONFLICT_RB])
    scale_conflicts = [c for c in conflicts if c["conflict_type"] == "scale"]
    assert all(c["severity"] == "HIGH" for c in scale_conflicts)


def test_service_conflict_detected():
    rb_stop = _make_rb("Stop PG", "database", "P2", [_step(1, "systemctl stop postgresql")])
    rb_start = _make_rb("Start PG", "database", "P2", [_step(1, "systemctl start postgresql")])
    conflicts = detect_conflicts([rb_stop, rb_start])
    assert any(c["conflict_type"] == "service_control" for c in conflicts)


# ── compound_incident_agent ───────────────────────────────────────

from agents.compound_incident_agent import analyze_compound_incident


def test_compound_returns_sub_incidents():
    mock_resp = json.dumps({
        "is_compound": True,
        "sub_incidents": [
            {"domain": "networking", "description": "Network down", "severity": "P1", "search_terms": ["network"], "execution_order": 1},
            {"domain": "kubernetes", "description": "Pods crashing", "severity": "P2", "search_terms": ["pods"], "execution_order": 2},
        ],
        "reasoning": "Network failure is causing K8s pod connectivity issues",
    })
    with patch("agents.compound_incident_agent.call_llm", return_value=mock_resp):
        result = analyze_compound_incident("Network is down and K8s pods are crashing")

    assert result["is_compound"] is True
    assert result["total_domains"] == 2
    assert result["sub_incidents"][0]["domain"] == "networking"
    assert result["sub_incidents"][1]["domain"] == "kubernetes"


def test_compound_ordered_by_execution_order():
    mock_resp = json.dumps({
        "is_compound": True,
        "sub_incidents": [
            {"domain": "kubernetes", "description": "K8s issue", "severity": "P2", "search_terms": ["k8s"], "execution_order": 2},
            {"domain": "networking", "description": "Network issue", "severity": "P1", "search_terms": ["network"], "execution_order": 1},
        ],
        "reasoning": "Fix network first",
    })
    with patch("agents.compound_incident_agent.call_llm", return_value=mock_resp):
        result = analyze_compound_incident("Network down, K8s broken")

    orders = [s["execution_order"] for s in result["sub_incidents"]]
    assert orders == sorted(orders)


def test_compound_json_error_fallback():
    with patch("agents.compound_incident_agent.call_llm", return_value="bad json"):
        result = analyze_compound_incident("Something is broken")

    assert result["is_compound"] is False
    assert result["total_domains"] == 1
    assert result["sub_incidents"][0]["domain"] == "other"


# ── multi_runbook_merger_agent ────────────────────────────────────

from agents.multi_runbook_merger_agent import merge_runbooks


def test_merge_two_runbooks():
    result = merge_runbooks([DB_RB, NET_RB])
    assert result["total_runbooks"] == 2
    assert result["total_steps"] == 4


def test_merge_domain_priority_order():
    # DB (database=3) should come after NET (networking=2)
    result = merge_runbooks([DB_RB, NET_RB])
    categories = [s["runbook_category"] for s in result["composite_steps"]]
    net_indices = [i for i, c in enumerate(categories) if c == "networking"]
    db_indices = [i for i, c in enumerate(categories) if c == "database"]
    assert max(net_indices) < min(db_indices)


def test_merge_global_steps_sequential():
    result = merge_runbooks([DB_RB, NET_RB])
    global_steps = [s["global_step"] for s in result["composite_steps"]]
    assert global_steps == list(range(1, len(global_steps) + 1))


def test_merge_conflict_detected():
    result = merge_runbooks([K8S_RB, CONFLICT_RB])
    assert result["has_conflicts"] is True
    assert result["conflict_count"] >= 1


def test_merge_parallel_opportunities():
    result = merge_runbooks([DB_RB, NET_RB])
    assert "parallel_opportunities" in result
    if result["parallel_opportunities"]:
        opp = result["parallel_opportunities"][0]
        assert opp["safe_to_parallelize"] is True


def test_merge_includes_rollback():
    result = merge_runbooks([K8S_RB, DB_RB])
    assert "rollback_sequence" in result
    assert len(result["rollback_sequence"]) >= 1


def test_merge_includes_execution_strategy():
    result = merge_runbooks([DB_RB, NET_RB])
    assert isinstance(result["execution_strategy"], str)
    assert len(result["execution_strategy"]) > 0


# ── multi-runbook API ─────────────────────────────────────────────

def test_merge_endpoint():
    resp = client.post("/multi/merge", json={"runbook_ids": [DB_RB, NET_RB]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_runbooks"] == 2
    assert data["total_steps"] == 4


def test_merge_missing_runbook():
    resp = client.post("/multi/merge", json={"runbook_ids": [DB_RB, 99999]})
    assert resp.status_code == 404


def test_merge_single_id_rejected():
    resp = client.post("/multi/merge", json={"runbook_ids": [DB_RB]})
    assert resp.status_code == 422


def test_conflicts_endpoint_safe():
    resp = client.post("/multi/conflicts", json={"runbook_ids": [DB_RB, NET_RB]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe_to_run_together"] is True
    assert data["total_conflicts"] == 0


def test_conflicts_endpoint_unsafe():
    resp = client.post("/multi/conflicts", json={"runbook_ids": [K8S_RB, CONFLICT_RB]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe_to_run_together"] is False
    assert data["total_conflicts"] >= 1


def test_compound_endpoint():
    mock_decomp = json.dumps({
        "is_compound": True,
        "sub_incidents": [
            {"domain": "database", "description": "DB down", "severity": "P1", "search_terms": ["database"], "execution_order": 1},
            {"domain": "networking", "description": "Network issue", "severity": "P2", "search_terms": ["network"], "execution_order": 2},
        ],
        "reasoning": "DB failure causing network cascades",
    })
    with patch("agents.compound_incident_agent.call_llm", return_value=mock_decomp):
        resp = client.post("/multi/compound", json={
            "incident": "Database is down and all network connections are dropping across the cluster"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_compound"] is True
    assert data["total_domains"] == 2


def test_similar_runbooks_endpoint():
    resp = client.get(f"/multi/runbooks/{K8S_RB}/similar")
    assert resp.status_code == 200
    data = resp.json()
    assert data["runbook_id"] == K8S_RB
    assert "similar_runbooks" in data


def test_similar_runbooks_not_found():
    resp = client.get("/multi/runbooks/99999/similar")
    assert resp.status_code == 404
