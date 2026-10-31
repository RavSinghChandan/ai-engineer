"""
Tests for agent_audit_log — the durable record of every agent action.
No LLM calls; every test writes to its own temporary SQLite file.
"""
from __future__ import annotations

import asyncio
import sqlite3
import time
from unittest.mock import AsyncMock, patch

import pytest

import db
import audit.agent_audit_log as agent_audit
from fde import permissions as fde_perm
from tests.conftest import SAMPLE_PLAN, make_admin_headers, make_auth_headers

REQUIRED_COLUMNS = {"agent_id", "user_id", "tool_name", "resource_id", "action",
                    "timestamp", "status", "correlation_id"}


@pytest.fixture(autouse=True)
def audit_db(tmp_path, monkeypatch):
    path = tmp_path / "bench.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    with sqlite3.connect(path) as conn:
        for statement in agent_audit.DDL:
            conn.execute(statement)
    yield path


# ── Schema ───────────────────────────────────────────────────────────────────

def test_init_db_creates_the_table_with_the_required_columns(tmp_path, monkeypatch):
    path = tmp_path / "fresh.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    asyncio.new_event_loop().run_until_complete(db.init_db())
    with sqlite3.connect(path) as conn:
        columns = {r[1] for r in conn.execute(f"PRAGMA table_info({agent_audit.TABLE})")}
    assert REQUIRED_COLUMNS <= columns


# ── record() and the request context ─────────────────────────────────────────

def test_record_fills_the_fields_from_the_context():
    with agent_audit.request_context("req-1"):
        agent_audit.set_subject(user_id="usr_1", resource_id="Senior Python Developer")
        agent_audit.record("role_mapping_agent", "invoke", "success", tool_name="map_role",
                           duration_ms=3.14159)
    (row,) = agent_audit.query()
    assert row["agent_id"] == "role_mapping_agent"
    assert row["user_id"] == "usr_1"
    assert row["tool_name"] == "map_role"
    assert row["resource_id"] == "Senior Python Developer"
    assert row["action"] == "invoke"
    assert row["status"] == "success"
    assert row["correlation_id"] == "req-1"
    assert row["duration_ms"] == 3.142
    assert abs(row["timestamp"] - time.time()) < 5


def test_request_context_is_reset_after_the_request():
    with agent_audit.request_context("req-2"):
        agent_audit.set_subject(user_id="usr_2")
    assert agent_audit.current_context() == agent_audit.AuditContext()


def test_set_subject_only_changes_the_given_fields():
    with agent_audit.request_context("req-3"):
        agent_audit.set_subject(user_id="usr_3")
        agent_audit.set_subject(resource_id="cv_text")
        ctx = agent_audit.current_context()
    assert (ctx.correlation_id, ctx.user_id, ctx.resource_id) == ("req-3", "usr_3", "cv_text")


def test_record_never_raises(monkeypatch, tmp_path):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "missing-dir" / "bench.db")
    agent_audit.record("cv_parser_agent", "invoke", "success")  # must not raise


# ── agent_run ────────────────────────────────────────────────────────────────

def test_agent_run_records_success():
    with agent_audit.request_context("req-4"):
        with agent_audit.agent_run("planning_agent", "generate_plan", resource_id="Data Engineer"):
            pass
    (row,) = agent_audit.query()
    assert (row["agent_id"], row["tool_name"], row["action"], row["status"], row["resource_id"]) == \
        ("planning_agent", "generate_plan", "invoke", "success", "Data Engineer")
    assert row["duration_ms"] >= 0


def test_agent_run_records_an_error_and_re_raises():
    with pytest.raises(RuntimeError):
        with agent_audit.agent_run("cv_parser_agent", "parse_cv"):
            raise RuntimeError("LLM unavailable")
    (row,) = agent_audit.query()
    assert row["status"] == "error"


def test_agent_run_works_around_awaited_calls():
    async def call_agent():
        with agent_audit.agent_run("llm_judge", "run_llm_judge"):
            await asyncio.sleep(0)
    asyncio.new_event_loop().run_until_complete(call_agent())
    assert [r["status"] for r in agent_audit.query()] == ["success"]


# ── Agent permission decisions ───────────────────────────────────────────────

def test_permission_decisions_are_recorded():
    fde_perm.add_listener(agent_audit.record_permission)
    with agent_audit.request_context("req-5"):
        agent_audit.set_subject(user_id="usr_5")
        fde_perm.authorize("role_mapping_agent", "read", "user_profile")
        with pytest.raises(fde_perm.PermissionDenied):
            fde_perm.authorize("role_mapping_agent", "write", "role_catalog")
    rows = sorted(agent_audit.query(), key=lambda r: r["id"])
    assert [(r["agent_id"], r["action"], r["resource_id"], r["status"], r["tool_name"]) for r in rows] == [
        ("role_mapping_agent", "read", "user_profile", "allow", "permission_check"),
        ("role_mapping_agent", "write", "role_catalog", "deny", "permission_check"),
    ]
    assert {(r["user_id"], r["correlation_id"]) for r in rows} == {("usr_5", "req-5")}


# ── Reading ──────────────────────────────────────────────────────────────────

def test_query_filters_and_returns_newest_first():
    for i, (user, status) in enumerate([("a", "success"), ("b", "error"), ("a", "error")]):
        agent_audit.record(f"agent_{i}", "invoke", status, user_id=user, correlation_id=f"c{i}")
    assert [r["agent_id"] for r in agent_audit.query()] == ["agent_2", "agent_1", "agent_0"]
    assert [r["agent_id"] for r in agent_audit.query(user_id="a")] == ["agent_2", "agent_0"]
    assert [r["agent_id"] for r in agent_audit.query(status="error", user_id="a")] == ["agent_2"]
    assert [r["agent_id"] for r in agent_audit.query(correlation_id="c1")] == ["agent_1"]
    assert len(agent_audit.query(limit=1)) == 1


# ── Through the API ──────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from tests.test_api import _make_client
    c, patches = _make_client()
    yield c
    for p in patches:
        try:
            p.stop()
        except RuntimeError:
            pass


def test_a_request_writes_correlated_rows(client):
    progress = {"role": "Senior Python Developer", "plan": SAMPLE_PLAN, "completed_task_ids": []}
    with patch("main.get_progress", new=AsyncMock(return_value=progress)), \
            patch("main.update_completed_tasks", new=AsyncMock(return_value=True)), \
            patch("main.save_readiness_score", new=AsyncMock()), \
            patch("main.update_user_facts"), \
            patch("main.write_session_summary"):
        resp = client.post("/update-progress", headers=make_auth_headers(),
                           json={"user_id": "usr_audit", "completed_task_ids": ["d1t1"]})
    assert resp.status_code == 200
    request_id = resp.headers["X-Request-Id"]

    rows = sorted(agent_audit.query(correlation_id=request_id), key=lambda r: r["id"])
    assert [(r["agent_id"], r["tool_name"], r["action"], r["resource_id"], r["status"]) for r in rows] == [
        ("tracking_agent", "permission_check", "write", "progress", "allow"),
        ("tracking_agent", "calculate_readiness", "invoke", "Senior Python Developer", "success"),
        ("tracking_agent", "permission_check", "write", "readiness_score", "allow"),
    ]
    assert {r["user_id"] for r in rows} == {"usr_audit"}


def test_admin_endpoint_requires_an_admin(client):
    assert client.get("/admin/agent-audit").status_code in (401, 403)
    assert client.get("/admin/agent-audit", headers=make_auth_headers()).status_code == 403


def test_admin_endpoint_lists_and_filters(client):
    agent_audit.record("cv_parser_agent", "invoke", "success", correlation_id="keep", user_id="u1")
    agent_audit.record("planning_agent", "invoke", "error", correlation_id="other", user_id="u2")
    resp = client.get("/admin/agent-audit?correlation_id=keep", headers=make_admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["rows"][0]["agent_id"] == "cv_parser_agent"
