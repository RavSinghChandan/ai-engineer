import os
import tempfile
import pytest

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
from database.runbooks_store import (
    save_runbook, get_runbook, list_runbooks,
    create_ingest_job, update_ingest_job, get_ingest_job,
)


@pytest.fixture(autouse=True)
def setup():
    init_db()


def _sample_state():
    return {
        "title": "Kubernetes CrashLoopBackOff Runbook",
        "description": "Fix pods stuck in CrashLoopBackOff",
        "category": "kubernetes",
        "severity": "P2",
        "tags": ["kubernetes", "pods"],
        "prerequisites": ["kubectl installed"],
        "estimated_duration_minutes": 20,
        "steps": [
            {
                "step_number": 1,
                "title": "Get pod status",
                "description": "List pods",
                "commands": ["kubectl get pods -n default"],
                "expected_output": "List of pods",
                "depends_on": [],
                "is_optional": False,
                "timeout_seconds": 30,
            },
            {
                "step_number": 2,
                "title": "Describe pod",
                "description": "Get details",
                "commands": ["kubectl describe pod myapp -n default"],
                "expected_output": "Pod events shown",
                "depends_on": [1],
                "is_optional": False,
                "timeout_seconds": 30,
            },
        ],
        "rollback_steps": [
            {
                "step_number": 1,
                "title": "Undo deployment",
                "description": "Roll back",
                "commands": ["kubectl rollout undo deployment/myapp"],
                "expected_output": "Rolled back",
                "depends_on": [],
                "is_optional": False,
                "timeout_seconds": 60,
            }
        ],
    }


def test_save_and_retrieve_runbook():
    state = _sample_state()
    runbook_id = save_runbook(state, "k8s.pdf", total_pages=3)
    assert runbook_id > 0

    runbook = get_runbook(runbook_id)
    assert runbook["title"] == "Kubernetes CrashLoopBackOff Runbook"
    assert runbook["category"] == "kubernetes"
    assert runbook["severity"] == "P2"
    assert len(runbook["steps"]) == 2
    assert len(runbook["rollback_steps"]) == 1


def test_steps_order_preserved():
    runbook_id = save_runbook(_sample_state(), "test.pdf", 1)
    runbook = get_runbook(runbook_id)
    numbers = [s["step_number"] for s in runbook["steps"]]
    assert numbers == sorted(numbers)


def test_commands_preserved_exactly():
    runbook_id = save_runbook(_sample_state(), "test.pdf", 1)
    runbook = get_runbook(runbook_id)
    assert runbook["steps"][0]["commands"] == ["kubectl get pods -n default"]


def test_depends_on_preserved():
    runbook_id = save_runbook(_sample_state(), "test.pdf", 1)
    runbook = get_runbook(runbook_id)
    assert runbook["steps"][1]["depends_on"] == [1]


def test_tags_preserved():
    runbook_id = save_runbook(_sample_state(), "test.pdf", 1)
    runbook = get_runbook(runbook_id)
    assert "kubernetes" in runbook["tags"]


def test_list_runbooks():
    save_runbook(_sample_state(), "rb1.pdf", 1)
    save_runbook(_sample_state(), "rb2.pdf", 2)
    result = list_runbooks()
    assert len(result) >= 2


def test_list_runbooks_filter_category():
    save_runbook(_sample_state(), "k8s.pdf", 1)
    result = list_runbooks(category="kubernetes")
    assert all(r["category"] == "kubernetes" for r in result)


def test_get_nonexistent_runbook():
    assert get_runbook(99999) is None


def test_ingest_job_lifecycle():
    job_id = create_ingest_job("test.pdf")
    assert job_id > 0

    job = get_ingest_job(job_id)
    assert job["status"] == "pending"
    assert job["filename"] == "test.pdf"

    update_ingest_job(job_id, status="processing")
    job = get_ingest_job(job_id)
    assert job["status"] == "processing"

    update_ingest_job(job_id, status="completed", runbook_id=1, agent_log=["done"])
    job = get_ingest_job(job_id)
    assert job["status"] == "completed"
    assert job["runbook_id"] == 1
    assert job["agent_log"] == ["done"]


def test_ingest_job_failure():
    job_id = create_ingest_job("bad.pdf")
    update_ingest_job(job_id, status="failed", error="parse error")
    job = get_ingest_job(job_id)
    assert job["status"] == "failed"
    assert job["error"] == "parse error"


def test_get_nonexistent_job():
    assert get_ingest_job(99999) is None
