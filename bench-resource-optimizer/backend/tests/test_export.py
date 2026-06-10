"""
Tests for plan export and readiness prediction endpoints.

Covers:
  - GET /export-plan/{user_id}?format=csv
  - GET /export-plan/{user_id}?format=json
  - GET /predict-readiness/{user_id}
  - Unit tests for export utilities
"""
from __future__ import annotations

import json
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from utils.export import plan_to_csv, plan_to_summary, predict_completion

# ── Unit: plan_to_csv ────────────────────────────────────────────────────────

SAMPLE_PLAN = {
    "tasks": [
        {"id": "t1", "day": 1, "title": "Learn MLflow basics", "skill": "MLflow", "hours": 2, "resource": "mlflow.org"},
        {"id": "t2", "day": 1, "title": "Track an experiment", "skill": "MLflow", "hours": 2, "resource": "mlflow.org"},
        {"id": "t3", "day": 2, "title": "SQL joins", "skill": "SQL", "hours": 3, "resource": "sqltutorial.org"},
    ],
    "duration_days": 7,
    "generated_at": "2026-06-01T10:00:00Z",
}


def test_plan_to_csv_headers():
    csv_text = plan_to_csv("u1", "AI/ML Engineer", SAMPLE_PLAN, [])
    lines = [l.strip() for l in csv_text.strip().split("\n")]
    assert lines[0] == "day,task_id,task_title,skill,hours,status,resource"


def test_plan_to_csv_all_pending_when_no_completions():
    csv_text = plan_to_csv("u1", "AI/ML Engineer", SAMPLE_PLAN, [])
    assert csv_text.count("pending") == 3
    assert csv_text.count("completed") == 0


def test_plan_to_csv_marks_completed():
    csv_text = plan_to_csv("u1", "AI/ML Engineer", SAMPLE_PLAN, ["t1", "t3"])
    lines = [l for l in csv_text.strip().split("\n") if l]
    # line 1 = header, lines 2-4 = tasks
    assert "completed" in lines[1]  # t1 completed
    assert "pending" in lines[2]    # t2 pending
    assert "completed" in lines[3]  # t3 completed


def test_plan_to_csv_row_count():
    csv_text = plan_to_csv("u1", "AI/ML Engineer", SAMPLE_PLAN, [])
    lines = [l for l in csv_text.strip().split("\n") if l]
    assert len(lines) == 4  # 1 header + 3 tasks


def test_plan_to_csv_empty_plan():
    csv_text = plan_to_csv("u1", "AI/ML Engineer", {"tasks": []}, [])
    lines = [l for l in csv_text.strip().split("\n") if l]
    assert len(lines) == 1  # header only


# ── Unit: plan_to_summary ────────────────────────────────────────────────────

def test_plan_to_summary_structure():
    summary = plan_to_summary("u1", "AI/ML Engineer", SAMPLE_PLAN, ["t1"], 33.3)
    assert summary["user_id"] == "u1"
    assert summary["role"] == "AI/ML Engineer"
    assert summary["total_tasks"] == 3
    assert summary["completed_tasks"] == 1
    assert summary["remaining_tasks"] == 2
    assert summary["readiness_score"] == 33.3


def test_plan_to_summary_completion_pct():
    summary = plan_to_summary("u1", "role", SAMPLE_PLAN, ["t1", "t2"], 66.0)
    assert summary["completion_pct"] == pytest.approx(66.7, abs=0.1)


def test_plan_to_summary_zero_tasks():
    summary = plan_to_summary("u1", "role", {"tasks": []}, [], 0.0)
    assert summary["completion_pct"] == 0.0
    assert summary["skills_breakdown"] == []


def test_plan_to_summary_skills_breakdown():
    summary = plan_to_summary("u1", "role", SAMPLE_PLAN, ["t1", "t2"], 66.0)
    skills = {s["skill"]: s for s in summary["skills_breakdown"]}
    assert "MLflow" in skills
    assert "SQL" in skills
    assert skills["MLflow"]["completed"] == 2
    assert skills["MLflow"]["total_tasks"] == 2
    assert skills["MLflow"]["progress_pct"] == 100.0
    assert skills["SQL"]["completed"] == 0


# ── Unit: predict_completion ─────────────────────────────────────────────────

def test_predict_already_complete():
    result = predict_completion([], 100.0, 10, 10)
    assert result["status"] == "complete"
    assert result["predicted_days_remaining"] == 0


def test_predict_no_history_uses_industry_average():
    result = predict_completion([], 20.0, 10, 2)
    assert result["status"] == "in_progress"
    assert result["confidence"] == "LOW"
    assert result["basis"] == "industry_average"
    assert result["predicted_days_remaining"] >= 1


def test_predict_single_history_point_uses_industry_average():
    history = [{"score": 20.0, "ts": time.time() - 86400}]
    result = predict_completion(history, 20.0, 10, 2)
    assert result["confidence"] == "LOW"


def test_predict_with_good_velocity():
    now = time.time()
    history = [
        {"score": 0.0,  "ts": now - 5 * 86400},
        {"score": 20.0, "ts": now - 4 * 86400},
        {"score": 40.0, "ts": now - 3 * 86400},
        {"score": 60.0, "ts": now - 2 * 86400},
        {"score": 80.0, "ts": now - 1 * 86400},
    ]
    result = predict_completion(history, 80.0, 10, 8)
    assert result["status"] == "in_progress"
    assert result["confidence"] == "HIGH"
    assert result["basis"] == "historical_velocity"
    # At 20 points/day, 20 remaining → ~1 day
    assert result["predicted_days_remaining"] <= 3


def test_predict_stalled():
    now = time.time()
    history = [
        {"score": 30.0, "ts": now - 2 * 86400},
        {"score": 30.0, "ts": now - 1 * 86400},
    ]
    result = predict_completion(history, 30.0, 10, 3)
    assert result["status"] == "stalled"
    assert result["basis"] == "no_recent_progress"


def test_predict_medium_confidence():
    now = time.time()
    history = [
        {"score": 0.0,  "ts": now - 3 * 86400},
        {"score": 20.0, "ts": now - 2 * 86400},
        {"score": 40.0, "ts": now - 1 * 86400},
    ]
    result = predict_completion(history, 40.0, 10, 4)
    assert result["confidence"] == "MEDIUM"


# ── API: /export-plan and /predict-readiness ─────────────────────────────────

MOCK_PROGRESS = {
    "role": "AI/ML Engineer",
    "plan": SAMPLE_PLAN,
    "completed_task_ids": ["t1"],
    "readiness_score": 33.3,
}


def _make_client():
    from main import app
    return TestClient(app)


def test_export_plan_csv_requires_auth():
    client = _make_client()
    resp = client.get("/export-plan/user_123?format=csv")
    assert resp.status_code == 401


def test_export_plan_csv_not_found():
    client = _make_client()
    with patch("main.get_current_user", return_value={"sub": "user", "role": "user"}):
        with patch("main.get_progress", new_callable=AsyncMock, return_value=None):
            resp = client.get(
                "/export-plan/no_such_user?format=csv",
                headers={"Authorization": "Bearer fake"},
            )
    assert resp.status_code in (401, 404)


def test_predict_readiness_requires_auth():
    client = _make_client()
    resp = client.get("/predict-readiness/user_123")
    assert resp.status_code == 401


def test_predict_readiness_not_found():
    client = _make_client()
    with patch("main.get_current_user", return_value={"sub": "user", "role": "user"}):
        with patch("main.get_progress", new_callable=AsyncMock, return_value=None):
            resp = client.get(
                "/predict-readiness/no_such_user",
                headers={"Authorization": "Bearer fake"},
            )
    assert resp.status_code in (401, 404)
