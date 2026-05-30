"""Tests for extraction agents — all LLM calls are mocked."""
import json
from unittest.mock import patch
from agents.classify_agent import classify_agent
from agents.steps_agent import steps_agent
from agents.validate_agent import validate_agent


SAMPLE_RUNBOOK_TEXT = """
Kubernetes Pod CrashLoopBackOff Troubleshooting Runbook

Prerequisites: kubectl configured, cluster access

Step 1: Get pod status
Run: kubectl get pods -n <namespace>
Expected: List of pods with status

Step 2: Describe the failing pod
Run: kubectl describe pod <pod-name> -n <namespace>
Expected: Events section shows error reason

Step 3: Check pod logs
Run: kubectl logs <pod-name> -n <namespace> --previous
Expected: Application error logs

Step 4: Fix and redeploy
Run: kubectl rollout restart deployment/<deployment-name> -n <namespace>
Expected: Pods restart successfully

Rollback:
kubectl rollout undo deployment/<deployment-name> -n <namespace>
"""


def _base_state(text=SAMPLE_RUNBOOK_TEXT):
    return {
        "filename": "k8s-crashloop.pdf",
        "raw_text": text,
        "agent_log": [],
    }


# ── classify_agent ──────────────────────────────────────────────

def test_classify_agent_valid_response():
    mock_resp = json.dumps({
        "title": "K8s CrashLoopBackOff Runbook",
        "description": "Diagnose and fix pods stuck in CrashLoopBackOff",
        "category": "kubernetes",
        "severity": "P2",
        "tags": ["kubernetes", "pods", "crashloop"],
        "estimated_duration_minutes": 20,
    })
    with patch("agents.classify_agent.call_llm", return_value=mock_resp):
        result = classify_agent(_base_state())

    assert result["title"] == "K8s CrashLoopBackOff Runbook"
    assert result["category"] == "kubernetes"
    assert result["severity"] == "P2"
    assert "kubernetes" in result["tags"]
    assert result["estimated_duration_minutes"] == 20


def test_classify_agent_json_error_uses_defaults():
    with patch("agents.classify_agent.call_llm", return_value="not json"):
        result = classify_agent(_base_state())

    assert result["category"] == "other"
    assert result["severity"] == "P3"
    assert "extraction_error" in result


def test_classify_agent_logs_appended():
    mock_resp = json.dumps({
        "title": "Test", "description": "test", "category": "networking",
        "severity": "P1", "tags": [], "estimated_duration_minutes": 5,
    })
    with patch("agents.classify_agent.call_llm", return_value=mock_resp):
        result = classify_agent(_base_state())

    assert any("classify_agent" in e for e in result["agent_log"])


# ── steps_agent ─────────────────────────────────────────────────

def test_steps_agent_extracts_steps():
    mock_resp = json.dumps({
        "steps": [
            {
                "step_number": 1,
                "title": "Get pod status",
                "description": "List all pods",
                "commands": ["kubectl get pods -n default"],
                "expected_output": "List of pods",
                "depends_on": [],
                "is_optional": False,
                "timeout_seconds": 30,
            },
            {
                "step_number": 2,
                "title": "Describe pod",
                "description": "Get pod details",
                "commands": ["kubectl describe pod myapp -n default"],
                "expected_output": "Pod events",
                "depends_on": [1],
                "is_optional": False,
                "timeout_seconds": 30,
            },
        ],
        "prerequisites": ["kubectl installed", "cluster access"],
        "rollback_steps": [],
    })
    state = {**_base_state(), "title": "K8s Runbook"}
    with patch("agents.steps_agent.call_llm", return_value=mock_resp):
        result = steps_agent(state)

    assert len(result["steps"]) == 2
    assert result["steps"][0]["commands"] == ["kubectl get pods -n default"]
    assert result["steps"][1]["depends_on"] == [1]
    assert len(result["prerequisites"]) == 2


def test_steps_agent_sorts_by_step_number():
    mock_resp = json.dumps({
        "steps": [
            {"step_number": 3, "title": "C", "description": "", "commands": [], "expected_output": "", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 1, "title": "A", "description": "", "commands": [], "expected_output": "", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
            {"step_number": 2, "title": "B", "description": "", "commands": [], "expected_output": "", "depends_on": [], "is_optional": False, "timeout_seconds": 30},
        ],
        "prerequisites": [],
        "rollback_steps": [],
    })
    state = {**_base_state(), "title": "Test"}
    with patch("agents.steps_agent.call_llm", return_value=mock_resp):
        result = steps_agent(state)

    assert [s["step_number"] for s in result["steps"]] == [1, 2, 3]


def test_steps_agent_json_error_returns_empty():
    state = {**_base_state(), "title": "Test"}
    with patch("agents.steps_agent.call_llm", return_value="not json"):
        result = steps_agent(state)

    assert result["steps"] == []
    assert "extraction_error" in result


# ── validate_agent ───────────────────────────────────────────────

def test_validate_removes_future_dependencies():
    state = {
        "title": "Test Runbook",
        "steps": [
            {"step_number": 1, "title": "A", "commands": ["cmd1"], "depends_on": [3], "is_optional": False, "timeout_seconds": 30, "description": "", "expected_output": ""},
            {"step_number": 2, "title": "B", "commands": ["cmd2"], "depends_on": [], "is_optional": False, "timeout_seconds": 30, "description": "", "expected_output": ""},
        ],
        "agent_log": [],
    }
    result = validate_agent(state)
    assert result["steps"][0]["depends_on"] == []


def test_validate_removes_empty_commands():
    state = {
        "title": "Test",
        "steps": [
            {"step_number": 1, "title": "A", "commands": ["cmd1", "", "  "], "depends_on": [], "is_optional": False, "timeout_seconds": 30, "description": "", "expected_output": ""},
        ],
        "agent_log": [],
    }
    result = validate_agent(state)
    assert result["steps"][0]["commands"] == ["cmd1"]


def test_validate_no_steps_sets_error():
    state = {"title": "Test", "steps": [], "agent_log": []}
    result = validate_agent(state)
    assert "extraction_error" in result


def test_validate_logs_appended():
    state = {"title": "T", "steps": [{"step_number": 1, "title": "A", "commands": ["x"], "depends_on": [], "is_optional": False, "timeout_seconds": 10, "description": "", "expected_output": ""}], "agent_log": []}
    result = validate_agent(state)
    assert any("validate_agent" in e for e in result["agent_log"])
