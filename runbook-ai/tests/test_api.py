import io
import os
import json
import tempfile
import pytest
from unittest.mock import patch

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
init_db()

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "RunbookAI"
    assert data["phase"] == 2


def test_get_runbooks_empty():
    resp = client.get("/runbooks")
    assert resp.status_code == 200
    assert "runbooks" in resp.json()


def test_get_runbooks_stats():
    resp = client.get("/runbooks/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_runbooks" in data
    assert "by_category" in data
    assert "by_severity" in data


def test_get_runbook_not_found():
    resp = client.get("/runbooks/99999")
    assert resp.status_code == 404


def test_get_runbooks_invalid_category():
    resp = client.get("/runbooks?category=invalid_category")
    assert resp.status_code == 400


def test_get_runbooks_invalid_severity():
    resp = client.get("/runbooks?severity=P9")
    assert resp.status_code == 400


def test_upload_non_pdf_rejected():
    resp = client.post(
        "/ingest/upload",
        files={"file": ("test.txt", b"hello world", "text/plain")},
    )
    assert resp.status_code == 400
    assert "PDF" in resp.json()["detail"]


def test_upload_pdf_returns_job_id():
    mock_classify = json.dumps({
        "title": "Test Runbook", "description": "Test",
        "category": "kubernetes", "severity": "P2",
        "tags": ["k8s"], "estimated_duration_minutes": 10,
    })
    mock_steps = json.dumps({
        "steps": [{
            "step_number": 1, "title": "Check pods",
            "description": "List all pods",
            "commands": ["kubectl get pods"],
            "expected_output": "Pod list",
            "depends_on": [], "is_optional": False, "timeout_seconds": 30,
        }],
        "prerequisites": ["kubectl installed"],
        "rollback_steps": [],
    })

    # Minimal valid PDF bytes
    minimal_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n9\n%%EOF"

    with patch("agents.classify_agent.call_llm", return_value=mock_classify):
        with patch("agents.steps_agent.call_llm", return_value=mock_steps):
            resp = client.post(
                "/ingest/upload",
                files={"file": ("runbook.pdf", minimal_pdf, "application/pdf")},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert data["status"] == "pending"


def test_get_job_status():
    from database.runbooks_store import create_ingest_job
    job_id = create_ingest_job("status_test.pdf")
    resp = client.get(f"/ingest/job/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_get_job_not_found():
    resp = client.get("/ingest/job/99999")
    assert resp.status_code == 404


def test_runbooks_filter_by_category():
    resp = client.get("/runbooks?category=kubernetes")
    assert resp.status_code == 200


def test_runbooks_filter_by_severity():
    resp = client.get("/runbooks?severity=P1")
    assert resp.status_code == 200


def test_runbooks_pagination():
    resp = client.get("/runbooks?limit=5&offset=0")
    assert resp.status_code == 200
