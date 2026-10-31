"""
Tests for agent_audit_log — the durable record of every agent action.
Run: pytest tests/test_agent_audit_log.py -v
"""
from __future__ import annotations

import asyncio
import os
import tempfile
import time

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("SQLITE_DB_PATH", _tmp.name)

import pytest

import database
import audit.agent_audit_log as agent_audit
from fde import permissions as fde_perm
from guardrails.config import GuardrailsConfig, NodeGuardrailConfig
from guardrails.core import safe_node

REQUIRED_COLUMNS = {"agent_id", "user_id", "tool_name", "resource_id", "action",
                    "timestamp", "status", "correlation_id"}


@pytest.fixture(autouse=True)
def fresh_table():
    database.init_db()
    with database._tx() as conn:
        conn.execute(f"DELETE FROM {agent_audit.TABLE}")
    yield


def _run(coro):
    # A private loop: asyncio.run() would clear the thread's event loop, which main.py needs at import
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _rows(**filters):
    return agent_audit.query(tenant_id=filters.pop("tenant_id", None), **filters)


# ── Schema ───────────────────────────────────────────────────────────────────

def test_table_has_the_required_columns():
    with database._tx() as conn:
        columns = {r[1] for r in conn.execute(f"PRAGMA table_info({agent_audit.TABLE})").fetchall()}
    assert REQUIRED_COLUMNS <= columns


def test_init_table_is_idempotent():
    agent_audit.init_table()
    agent_audit.init_table()
    agent_audit.record("a", "invoke", "success")
    assert len(_rows()) == 1


# ── record() and the request context ─────────────────────────────────────────

def test_record_fills_the_fields_from_the_context():
    with agent_audit.audit_context(correlation_id="corr-1", user_id="u1", tenant_id="t1",
                                   resource_id="session-1"):
        agent_audit.record("meta_agent", "invoke", "success", tool_name="meta_agent_node",
                           duration_ms=12.3456)
    (row,) = _rows()
    assert row["agent_id"] == "meta_agent"
    assert row["user_id"] == "u1"
    assert row["tenant_id"] == "t1"
    assert row["tool_name"] == "meta_agent_node"
    assert row["resource_id"] == "session-1"
    assert row["action"] == "invoke"
    assert row["status"] == "success"
    assert row["correlation_id"] == "corr-1"
    assert row["duration_ms"] == 12.346
    assert abs(row["timestamp"] - time.time()) < 5


def test_explicit_fields_override_the_context():
    with agent_audit.audit_context(user_id="u1", tenant_id="t1", resource_id="session-1"):
        agent_audit.record("astrology_agent", "read", "allow", resource_id="birth_profile")
    (row,) = _rows()
    assert row["resource_id"] == "birth_profile"
    assert row["user_id"] == "u1"


def test_context_generates_a_correlation_id_and_is_reset_after_the_block():
    with agent_audit.audit_context(user_id="u1") as ctx:
        assert len(ctx.correlation_id) == 32
    assert agent_audit.current_context() == agent_audit.AuditContext()
    agent_audit.record("a", "invoke", "success")
    (row,) = _rows()
    assert row["user_id"] == "" and row["correlation_id"] == ""


def test_record_never_raises(monkeypatch):
    def broken_tx():
        raise RuntimeError("database is down")
    monkeypatch.setattr(database, "_tx", broken_tx)
    agent_audit.record("a", "invoke", "success")  # must not raise


# ── safe_node writes one row per agent execution ─────────────────────────────

def _relaxed(name):
    return GuardrailsConfig(node_overrides={name: NodeGuardrailConfig(strict_mode=False, max_retries=0,
                                                             timeout_seconds=5)})


def _strict(name):
    return GuardrailsConfig(node_overrides={name: NodeGuardrailConfig(strict_mode=True, max_retries=0,
                                                             timeout_seconds=5)})


def ok_node(state):
    return {**state, "done": True}


def failing_node(state):
    raise RuntimeError("model unavailable")


def test_safe_node_records_a_successful_run():
    node = safe_node(ok_node, "test_agent", _relaxed("test_agent"))
    with agent_audit.audit_context(correlation_id="c1", user_id="u1", tenant_id="t1",
                                   resource_id="s1"):
        node({"agent_log": []})
    (row,) = _rows()
    assert (row["agent_id"], row["tool_name"], row["action"], row["status"]) == \
        ("test_agent", "ok_node", "invoke", "success")
    assert (row["user_id"], row["tenant_id"], row["resource_id"], row["correlation_id"]) == \
        ("u1", "t1", "s1", "c1")
    assert row["duration_ms"] >= 0


def test_safe_node_records_a_fallback():
    node = safe_node(failing_node, "test_agent", _relaxed("test_agent"))
    node({"agent_log": []})
    (row,) = _rows()
    assert row["status"] == "fallback"
    assert row["tool_name"] == "failing_node"


def test_safe_node_records_an_error_before_raising():
    node = safe_node(failing_node, "test_agent", _strict("test_agent"))
    with pytest.raises(RuntimeError):
        node({"agent_log": []})
    (row,) = _rows()
    assert row["status"] == "error"


def test_a_previous_guardrail_warning_is_not_counted_as_a_fallback():
    node = safe_node(ok_node, "test_agent", _relaxed("test_agent"))
    node({"agent_log": [], "guardrail_warnings": [{"node": "earlier", "reason": "x"}]})
    (row,) = _rows()
    assert row["status"] == "success"


# ── Agent permission decisions ───────────────────────────────────────────────

def test_permission_decisions_are_recorded():
    fde_perm.add_listener(agent_audit.record_permission)
    with agent_audit.audit_context(correlation_id="c2", user_id="u2", tenant_id="t2",
                                   resource_id="s2"):
        fde_perm.authorize("question_agent", "read", "user_question")
        with pytest.raises(fde_perm.PermissionDenied):
            fde_perm.authorize("question_agent", "write", "final_report")
    rows = sorted(_rows(), key=lambda r: r["id"])
    assert [(r["agent_id"], r["action"], r["resource_id"], r["status"], r["tool_name"]) for r in rows] == [
        ("question_agent", "read", "user_question", "allow", "permission_check"),
        ("question_agent", "write", "final_report", "deny", "permission_check"),
    ]
    assert {r["correlation_id"] for r in rows} == {"c2"}


def test_add_listener_registers_a_listener_once():
    fde_perm.add_listener(agent_audit.record_permission)
    fde_perm.add_listener(agent_audit.record_permission)
    assert fde_perm._listeners.count(agent_audit.record_permission) == 1


# ── The context reaches the pipeline thread ──────────────────────────────────

def test_bind_carries_the_context_into_run_in_executor():
    async def run():
        with agent_audit.audit_context(correlation_id="c3", user_id="u3", tenant_id="t3",
                                       resource_id="s3"):
            fn = agent_audit.bind(lambda: agent_audit.record("x", "invoke", "success"))
        await asyncio.get_running_loop().run_in_executor(None, fn)
    _run(run())
    (row,) = _rows()
    assert (row["user_id"], row["tenant_id"], row["resource_id"], row["correlation_id"]) == \
        ("u3", "t3", "s3", "c3")


def test_context_reaches_safe_nodes_inside_a_langgraph_pipeline():
    from typing import TypedDict
    from langgraph.graph import END, StateGraph

    class State(TypedDict, total=False):
        agent_log: list
        steps: list

    def first(state):
        return {"steps": state.get("steps", []) + ["first"]}

    def second(state):
        return {"steps": state.get("steps", []) + ["second"]}

    builder = StateGraph(State)
    builder.add_node("first_agent", safe_node(first, "first_agent", _relaxed("first_agent")))
    builder.add_node("second_agent", safe_node(second, "second_agent", _relaxed("second_agent")))
    builder.set_entry_point("first_agent")
    builder.add_edge("first_agent", "second_agent")
    builder.add_edge("second_agent", END)
    graph = builder.compile()

    async def run():
        with agent_audit.audit_context(correlation_id="c4", user_id="u4", tenant_id="t4",
                                       resource_id="s4"):
            fn = agent_audit.bind(graph.invoke)
        return await asyncio.get_running_loop().run_in_executor(None, fn, {"agent_log": []})

    assert _run(run())["steps"] == ["first", "second"]
    rows = sorted(_rows(correlation_id="c4"), key=lambda r: r["id"])
    assert [r["agent_id"] for r in rows] == ["first_agent", "second_agent"]
    assert {(r["user_id"], r["tenant_id"], r["resource_id"], r["status"]) for r in rows} == \
        {("u4", "t4", "s4", "success")}


# ── Reading ──────────────────────────────────────────────────────────────────

def test_query_is_scoped_to_a_tenant_and_filters():
    for tenant, corr, agent in [("t1", "a", "meta_agent"), ("t1", "b", "remedy_agent"),
                                ("t2", "c", "meta_agent")]:
        agent_audit.record(agent, "invoke", "success", tenant_id=tenant, correlation_id=corr)
    assert {r["correlation_id"] for r in _rows(tenant_id="t1")} == {"a", "b"}
    assert {r["correlation_id"] for r in _rows(tenant_id="t2")} == {"c"}
    assert [r["correlation_id"] for r in _rows(tenant_id="t1", agent_id="remedy_agent")] == ["b"]
    assert len(_rows()) == 3  # tenant_id=None: every tenant
    assert _rows(tenant_id="") == []  # an empty tenant is a tenant, not "all"


def test_query_returns_newest_first_and_respects_the_limit():
    for i in range(5):
        agent_audit.record(f"agent_{i}", "invoke", "success", tenant_id="t1")
    rows = agent_audit.query(tenant_id="t1", limit=2)
    assert [r["agent_id"] for r in rows] == ["agent_4", "agent_3"]


# ── GET /api/v1/metrics/agent-audit ──────────────────────────────────────────

def _insert_key(tenant_id, key, role):
    with database._tx() as conn:
        conn.execute("INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) "
                     "VALUES (?,?,1,?)", (tenant_id, tenant_id, time.time()))
        conn.execute("INSERT OR IGNORE INTO api_keys (key, tenant_id, role, description, is_active, "
                     "created_at) VALUES (?,?,?,?,1,?)", (key, tenant_id, role, "test", time.time()))


@pytest.fixture()
def client():
    import auth.store as store
    from fastapi.testclient import TestClient
    from main import app
    store.clear_for_tests()
    _insert_key("tenant_master", "sk-audit-superadmin", "superadmin")
    _insert_key("tenant_audit_a", "sk-audit-admin-a", "admin")
    _insert_key("tenant_audit_a", "sk-audit-user-a", "user")
    yield TestClient(app, raise_server_exceptions=False)
    store.clear_for_tests()


def test_endpoint_requires_an_admin(client):
    assert client.get("/api/v1/metrics/agent-audit").status_code == 401
    resp = client.get("/api/v1/metrics/agent-audit", headers={"X-API-Key": "sk-audit-user-a"})
    assert resp.status_code == 403


def test_admin_sees_only_their_tenant(client):
    agent_audit.record("meta_agent", "invoke", "success", tenant_id="tenant_audit_a", correlation_id="mine")
    agent_audit.record("meta_agent", "invoke", "success", tenant_id="tenant_other", correlation_id="theirs")
    resp = client.get("/api/v1/metrics/agent-audit?tenant_id=tenant_other",
                      headers={"X-API-Key": "sk-audit-admin-a"})
    assert resp.status_code == 200
    assert [r["correlation_id"] for r in resp.json()["rows"]] == ["mine"]


def test_superadmin_can_read_any_tenant(client):
    agent_audit.record("meta_agent", "invoke", "success", tenant_id="tenant_audit_a", correlation_id="a")
    agent_audit.record("meta_agent", "invoke", "success", tenant_id="tenant_other", correlation_id="b")
    headers = {"X-API-Key": "sk-audit-superadmin"}
    every = client.get("/api/v1/metrics/agent-audit", headers=headers).json()
    assert {r["correlation_id"] for r in every["rows"]} == {"a", "b"}
    other = client.get("/api/v1/metrics/agent-audit?tenant_id=tenant_other", headers=headers).json()
    assert [r["correlation_id"] for r in other["rows"]] == ["b"]
