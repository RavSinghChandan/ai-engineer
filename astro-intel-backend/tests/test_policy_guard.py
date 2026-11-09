"""
Tests for the AgentPolicyGuard and its immutable policy_decision_log.
Run: pytest tests/test_policy_guard.py -v
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import time
from unittest.mock import patch

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("SQLITE_DB_PATH", _tmp.name)

import pytest

import database
import audit.agent_audit_log as agent_audit
import policy
from policy import decision_log
from policy.guard import DefaultAgentPolicyGuard, check_arguments

LLM_ARGS = {"model": "deepseek-chat", "temperature": 0.3, "max_tokens": 400, "prompt_chars": 1200}
REPORT_ARGS = {"approved_count": 3, "rejected_count": 1, "brand_name": "Rav"}


@pytest.fixture(autouse=True)
def fresh_log():
    database.init_db()
    # The app never drops this table; tests do, because the triggers forbid DELETE.
    with database._tx() as conn:
        conn.execute(f"DROP TABLE IF EXISTS {decision_log.TABLE}")
    decision_log._ready = False
    policy.set_guard(DefaultAgentPolicyGuard())
    yield
    policy.set_guard(DefaultAgentPolicyGuard())


def _evaluate(agent, tool, args, session="sess-1"):
    with agent_audit.audit_context(user_id="u1", tenant_id="t1", resource_id=session):
        return policy.get_guard().evaluate(agent, tool, args)


def _rows(**filters):
    return decision_log.query(tenant_id=None, **filters)


# ── The five checks ──────────────────────────────────────────────────────────

def test_allowed_call_passes_all_checks_and_is_logged():
    d = _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    assert d.outcome == policy.ALLOW and d.allowed
    assert dict(d.checks) == {"session_suspended": False, "agent_authorized": True,
                              "tool_permitted": True, "arguments_within_bounds": True,
                              "approval_required": False}
    [row] = _rows()
    assert row["decision_id"] == d.decision_id
    assert (row["agent_id"], row["tool_name"], row["outcome"]) == ("holistic_agent", "llm.chat", "allow")
    assert (row["session_id"], row["user_id"], row["tenant_id"]) == ("sess-1", "u1", "t1")
    assert row["arguments"] == LLM_ARGS


def test_unknown_agent_is_denied():
    d = _evaluate("rogue_agent", "llm.chat", LLM_ARGS)
    assert d.outcome == policy.DENY
    assert d.reasons == ("unknown_agent",)
    assert d.checks["agent_authorized"] is False


def test_tool_not_granted_to_the_agent_is_denied():
    d = _evaluate("holistic_agent", "email.send", {})
    assert d.outcome == policy.DENY
    assert d.checks["agent_authorized"] and not d.checks["tool_permitted"]
    assert d.reasons == ("tool_not_permitted",)


@pytest.mark.parametrize("change, reason", [
    ({"max_tokens": 5000}, "max_tokens_above_max"),
    ({"max_tokens": 0}, "max_tokens_below_min"),
    ({"temperature": 1.5}, "temperature_above_max"),
    ({"model": "gpt-4o"}, "model_not_allowed"),
    ({"prompt_chars": 500_000}, "prompt_chars_above_max"),
    ({"max_tokens": "400"}, "max_tokens_not_int"),
    ({"max_tokens": True}, "max_tokens_not_int"),
    ({"tools": ["shell"]}, "unexpected_argument:tools"),
])
def test_arguments_outside_the_boundaries_are_denied(change, reason):
    d = _evaluate("grammar_agent", "llm.chat", {**LLM_ARGS, **change})
    assert d.outcome == policy.DENY
    assert reason in d.reasons
    assert d.checks["arguments_within_bounds"] is False


def test_missing_required_argument_is_denied():
    args = dict(LLM_ARGS)
    del args["model"]
    d = _evaluate("holistic_agent", "llm.chat", args)
    assert d.outcome == policy.DENY and d.reasons == ("missing_argument:model",)
    optional = {"arguments": {"note": {"type": "str", "required": False}}}
    assert check_arguments(optional, {}) == []


def test_approval_gated_tool_needs_a_human_first():
    d = _evaluate("report_agent", "report.generate", REPORT_ARGS)
    assert d.outcome == policy.REQUIRE_APPROVAL
    assert d.checks["approval_required"] is True
    assert d.reasons == ("human_approval_required",)

    with agent_audit.audit_context(tenant_id="t1", resource_id="sess-1"):
        policy.get_guard().grant_approval("sess-1", "report_agent", "report.generate", approver="admin@x")
    assert _evaluate("report_agent", "report.generate", REPORT_ARGS).outcome == policy.ALLOW
    # The approval is for that session only
    assert _evaluate("report_agent", "report.generate", REPORT_ARGS, session="sess-2").outcome \
        == policy.REQUIRE_APPROVAL
    granted = _rows(outcome="approval_granted")
    assert granted[0]["reasons"] == ["approved_by:admin@x"]


def test_approval_survives_a_restart():
    policy.get_guard().grant_approval("sess-1", "report_agent", "report.generate", approver="admin")
    policy.set_guard(DefaultAgentPolicyGuard())  # a new process: nothing in memory
    assert _evaluate("report_agent", "report.generate", REPORT_ARGS).outcome == policy.ALLOW


# ── Suspension ───────────────────────────────────────────────────────────────

def test_session_is_suspended_after_repeated_denials():
    outcomes = [_evaluate("grammar_agent", "llm.chat", {**LLM_ARGS, "max_tokens": 9999}).outcome
                for _ in range(3)]
    assert outcomes == [policy.DENY, policy.DENY, policy.SUSPEND]
    # Every later call in the session is refused, even a valid one
    d = _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    assert d.outcome == policy.DENY and d.reasons == ("session_suspended",)
    assert d.checks["session_suspended"] is True
    # Other sessions are not affected
    assert _evaluate("holistic_agent", "llm.chat", LLM_ARGS, session="other").allowed


def test_high_risk_tool_from_another_agent_suspends_at_once():
    d = _evaluate("grammar_agent", "report.generate", REPORT_ARGS)
    assert d.outcome == policy.SUSPEND
    assert "high_risk_tool" in d.reasons and "suspended_high_risk_attempt" in d.reasons


def test_suspension_survives_a_restart():
    _evaluate("grammar_agent", "report.generate", REPORT_ARGS)
    policy.set_guard(DefaultAgentPolicyGuard())
    assert _evaluate("holistic_agent", "llm.chat", LLM_ARGS).reasons == ("session_suspended",)


def test_calls_without_a_session_are_checked_but_never_suspended():
    guard = policy.get_guard()
    outcomes = [guard.evaluate("grammar_agent", "llm.chat", {**LLM_ARGS, "max_tokens": 9999}).outcome
                for _ in range(5)]
    assert outcomes == [policy.DENY] * 5
    assert len(_rows()) == 5


# ── enforce() ────────────────────────────────────────────────────────────────

def test_enforce_raises_the_matching_violation():
    with agent_audit.audit_context(resource_id="sess-e"):
        assert policy.enforce("holistic_agent", "llm.chat", LLM_ARGS).allowed
        with pytest.raises(policy.ToolCallDenied):
            policy.enforce("rogue_agent", "llm.chat", LLM_ARGS)
        with pytest.raises(policy.ApprovalRequired):
            policy.enforce("report_agent", "report.generate", REPORT_ARGS)
        with pytest.raises(policy.SessionSuspended):
            policy.enforce("grammar_agent", "report.generate", REPORT_ARGS)
    assert issubclass(policy.PolicyViolation, PermissionError)


def test_a_custom_guard_can_replace_the_default():
    class AllowNothing:
        def evaluate(self, agent_id, tool_name, arguments):
            return policy.PolicyDecision(policy.DENY, agent_id, tool_name, ("custom",))

    policy.set_guard(AllowNothing())
    with pytest.raises(policy.ToolCallDenied, match="custom"):
        policy.enforce("holistic_agent", "llm.chat", LLM_ARGS)


def test_decision_is_immutable():
    d = _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    with pytest.raises(Exception):
        d.outcome = policy.DENY
    with pytest.raises(TypeError):
        d.checks["agent_authorized"] = False


def test_unrecorded_decision_is_refused():
    with patch.object(decision_log, "append", side_effect=sqlite3.OperationalError("disk full")):
        d = _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    assert d.outcome == policy.DENY
    assert d.reasons == ("audit_log_unavailable",)


# ── The immutable log ────────────────────────────────────────────────────────

def test_log_rejects_update_and_delete():
    _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    for sql in (f"UPDATE {decision_log.TABLE} SET outcome = 'allow'",
                f"DELETE FROM {decision_log.TABLE}"):
        with pytest.raises(sqlite3.DatabaseError, match="append-only"):
            with database._tx() as conn:
                conn.execute(sql)
    assert len(_rows()) == 1


def test_hash_chain_links_every_row():
    for _ in range(3):
        _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    rows = list(reversed(_rows()))
    assert rows[0]["prev_hash"] == ""
    assert [r["prev_hash"] for r in rows[1:]] == [r["row_hash"] for r in rows[:-1]]
    assert decision_log.verify_chain() == {"ok": True, "rows": 3, "first_bad_id": None}


def test_tampering_around_the_triggers_is_detected():
    for _ in range(3):
        _evaluate("grammar_agent", "llm.chat", LLM_ARGS)
    middle = sorted(r["id"] for r in _rows())[1]
    # Someone with the database file drops the trigger and rewrites a "deny" as "allow"
    with database._tx() as conn:
        conn.execute(f"DROP TRIGGER {decision_log.TABLE}_no_update")
        conn.execute(f"UPDATE {decision_log.TABLE} SET outcome = 'deny' WHERE id = ?", (middle,))
    assert decision_log.verify_chain() == {"ok": False, "rows": 3, "first_bad_id": middle}


def test_log_recreates_its_table_when_the_database_is_replaced():
    _evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    with database._tx() as conn:
        conn.execute(f"DROP TABLE {decision_log.TABLE}")  # _ready is still True
    assert _evaluate("holistic_agent", "llm.chat", LLM_ARGS).allowed
    assert len(_rows()) == 1


def test_long_strings_are_cut_in_the_log():
    policy.get_guard().evaluate("holistic_agent", "llm.chat", {**LLM_ARGS, "model": "x" * 1000})
    [row] = _rows()
    assert len(row["arguments"]["model"]) < 250


# ── Wired into the LLM client ────────────────────────────────────────────────

def test_llm_client_refuses_an_unnamed_caller_before_any_request():
    from utils import deepseek_client
    with patch("urllib.request.urlopen") as http:
        with pytest.raises(policy.ToolCallDenied):
            deepseek_client.call(system="s", user="u")
        with pytest.raises(policy.ToolCallDenied):
            deepseek_client.call(system="s", user="u", max_tokens=50_000, agent_id="holistic_agent")
    http.assert_not_called()
    assert [r["reasons"] for r in reversed(_rows())] == [["unknown_agent"], ["max_tokens_above_max"]]


def test_every_llm_call_site_names_a_known_agent():
    """Each ds_call in the code passes agent_id, and that agent may call llm.chat."""
    import pathlib
    import re
    from policy.config import TOOL_POLICY
    root = pathlib.Path(__file__).resolve().parents[1]
    sources = [p for d in ("agents", "routers", "numerology_rag") for p in (root / d).glob("*.py")]
    found = set()
    for path in sources:
        text = path.read_text()
        calls = len(re.findall(r"ds_call[,(]", text))
        named = re.findall(r'agent_id="(\w+)"', text) if calls else []
        assert len(named) >= calls, f"{path.name}: {calls} LLM calls, {len(named)} named"
        found.update(named)
    assert found and all("llm.chat" in TOOL_POLICY[a]["tools"] for a in found)


def test_agent_name_and_session_reach_a_worker_thread():
    from numerology_rag import hybrid_engine
    seen = []

    def fake_call(**kwargs):
        seen.append((kwargs.get("agent_id"), agent_audit.current_context().resource_id))
        return ""

    with patch("utils.deepseek_client.call", side_effect=fake_call), \
            agent_audit.audit_context(resource_id="sess-thread"):
        hybrid_engine.hybrid_numerology_answer(
            "Rav Kumar", "1990-05-15", 7, 3, 5, 8, "vedic", "career",
            "How is my career?", "static answer")
    assert seen == [("numerology_agent", "sess-thread")]


# ── API ──────────────────────────────────────────────────────────────────────

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
    _insert_key("tenant_master", "sk-policy-superadmin", "superadmin")
    _insert_key("tenant_policy_a", "sk-policy-admin-a", "admin")
    _insert_key("tenant_policy_a", "sk-policy-user-a", "user")
    yield TestClient(app, raise_server_exceptions=False)
    store.clear_for_tests()


def test_decisions_endpoint_is_admin_only_and_tenant_scoped(client):
    with agent_audit.audit_context(tenant_id="tenant_policy_a", resource_id="mine"):
        policy.get_guard().evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    with agent_audit.audit_context(tenant_id="tenant_other", resource_id="theirs"):
        policy.get_guard().evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    assert client.get("/api/v1/metrics/policy-decisions").status_code == 401
    assert client.get("/api/v1/metrics/policy-decisions",
                      headers={"X-API-Key": "sk-policy-user-a"}).status_code == 403
    resp = client.get("/api/v1/metrics/policy-decisions?tenant_id=tenant_other",
                      headers={"X-API-Key": "sk-policy-admin-a"})
    assert resp.status_code == 200
    assert [r["session_id"] for r in resp.json()["rows"]] == ["mine"]


def test_verify_endpoint_is_superadmin_only(client):
    policy.get_guard().evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    assert client.get("/api/v1/metrics/policy-decisions/verify",
                      headers={"X-API-Key": "sk-policy-admin-a"}).status_code == 403
    resp = client.get("/api/v1/metrics/policy-decisions/verify",
                      headers={"X-API-Key": "sk-policy-superadmin"})
    assert resp.json() == {"ok": True, "rows": 1, "first_bad_id": None}


def test_approve_endpoint_records_the_approval_and_the_guarded_call(client):
    with patch("routers.analysis.session_store.get",
               return_value={"admin_review": {"questions": []}, "user_profile": {}, "remedies": {}}), \
            patch("routers.analysis.final_report_agent", return_value={"sections": []}), \
            patch("routers.analysis.correct_report", side_effect=lambda r, use_llm: r), \
            patch("routers.analysis.ragas_evaluate", side_effect=RuntimeError("skip")):
        resp = client.post("/api/v1/analysis/approve",
                           headers={"X-API-Key": "sk-policy-admin-a"},
                           json={"session_id": "sess-api", "approved_insight_ids": ["a", "b"],
                                 "rejected_insight_ids": []})
    assert resp.status_code == 200, resp.text
    rows = list(reversed(_rows(session_id="sess-api")))
    assert [(r["agent_id"], r["tool_name"], r["outcome"]) for r in rows] == [
        ("report_agent", "report.generate", "approval_granted"),
        ("report_agent", "report.generate", "allow"),
    ]
    assert rows[1]["arguments"]["approved_count"] == 2
    assert rows[1]["tenant_id"] == "tenant_policy_a"
