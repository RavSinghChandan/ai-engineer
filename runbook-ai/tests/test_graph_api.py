"""Tests for the graph API endpoints."""
import os
import tempfile
import pytest

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
from database.runbooks_store import save_runbook
from database.graph_store import build_and_save_graph

init_db()

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _create_runbook_with_graph():
    state = {
        "title": "K8s CrashLoop Runbook",
        "description": "Fix CrashLoopBackOff",
        "category": "kubernetes",
        "severity": "P2",
        "tags": ["k8s"],
        "prerequisites": [],
        "estimated_duration_minutes": 15,
        "steps": [
            {"step_number": 1, "title": "Get pods", "description": "", "commands": ["kubectl get pods"], "expected_output": "", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 2, "title": "Describe pod", "description": "", "commands": ["kubectl describe pod myapp"], "expected_output": "", "depends_on": [1], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 3, "title": "Get logs", "description": "", "commands": ["kubectl logs myapp --previous"], "expected_output": "", "depends_on": [1], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 4, "title": "Restart", "description": "", "commands": ["kubectl rollout restart deployment/myapp"], "expected_output": "", "depends_on": [2, 3], "is_optional": False, "timeout_seconds": 60},
        ],
        "rollback_steps": [],
    }
    runbook_id = save_runbook(state, "k8s.pdf", total_pages=2)
    build_and_save_graph(runbook_id)
    return runbook_id


RB_ID = _create_runbook_with_graph()


def test_get_graph():
    resp = client.get(f"/runbooks/{RB_ID}/graph")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_steps"] == 4
    assert data["total_edges"] == 4
    assert data["is_dag"] is True
    assert data["cycle_detected"] is False


def test_get_graph_topology():
    resp = client.get(f"/runbooks/{RB_ID}/graph/topology")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) == 4


def test_execution_order():
    resp = client.get(f"/runbooks/{RB_ID}/graph/execution-order")
    assert resp.status_code == 200
    data = resp.json()
    order = data["execution_order"]

    # Step 1 must come before 2 and 3; both before 4
    assert order.index(1) < order.index(2)
    assert order.index(1) < order.index(3)
    assert order.index(2) < order.index(4)
    assert order.index(3) < order.index(4)
    assert data["total"] == 4


def test_parallel_plan():
    resp = client.get(f"/runbooks/{RB_ID}/graph/parallel-plan")
    assert resp.status_code == 200
    data = resp.json()

    waves = {w["wave"]: w for w in data["plan"]}
    # Wave 1: step 1 alone
    assert waves[1]["steps"][0]["step_number"] == 1
    # Wave 2: steps 2 and 3 in parallel
    wave2_steps = {s["step_number"] for s in waves[2]["steps"]}
    assert wave2_steps == {2, 3}
    assert waves[2]["can_run_in_parallel"] is True
    # Wave 3: step 4
    assert waves[3]["steps"][0]["step_number"] == 4


def test_failure_impact_root_step():
    resp = client.get(f"/runbooks/{RB_ID}/graph/impact/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["blocked_steps_count"] == 3
    blocked_ids = {s["step_number"] for s in data["blocked_steps"]}
    assert blocked_ids == {2, 3, 4}


def test_failure_impact_leaf_step():
    resp = client.get(f"/runbooks/{RB_ID}/graph/impact/4")
    assert resp.status_code == 200
    data = resp.json()
    assert data["blocked_steps_count"] == 0


def test_failure_impact_unknown_step():
    resp = client.get(f"/runbooks/{RB_ID}/graph/impact/999")
    assert resp.status_code == 404


def test_rebuild_graph():
    resp = client.post(f"/runbooks/{RB_ID}/graph/rebuild")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_steps"] == 4
    assert data["is_dag"] is True


def test_graph_not_found():
    resp = client.get("/runbooks/99999/graph")
    assert resp.status_code == 404


def test_critical_path_in_graph():
    resp = client.get(f"/runbooks/{RB_ID}/graph")
    assert resp.status_code == 200
    data = resp.json()
    # Critical path must start at 1 and end at 4
    assert data["critical_path"][0] == 1
    assert data["critical_path"][-1] == 4
