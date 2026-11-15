"""
Tests for the ToolCredentialBroker and the external AuditService.
Run: pytest tests/test_credential_broker_and_audit.py -v
"""
from __future__ import annotations

import json
import os
import tempfile
from unittest.mock import MagicMock, patch

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("SQLITE_DB_PATH", _tmp.name)

import pytest

import database
import policy
from audit import audit_context, audit_service
from audit import record as audit_record
from credentials import (CredentialError, SecretNotConfigured, ToolCredentialBroker, get_broker,
                         set_broker)
from fde import counters
from policy import decision_log
from policy.guard import DefaultAgentPolicyGuard

LLM_ARGS = {"model": "deepseek-chat", "temperature": 0.3, "max_tokens": 400, "prompt_chars": 1200}


class Secrets:
    def __init__(self, values=None):
        self.values = {"DEEPSEEK_API_KEY": "sk-test"} if values is None else values

    def get(self, name):
        return self.values.get(name, "")


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


@pytest.fixture(autouse=True)
def sink():
    s = audit_service.MemorySink()
    audit_service.set_sink(s)
    yield s
    audit_service.set_sink(None)


@pytest.fixture
def broker():
    b = ToolCredentialBroker(source=Secrets(), clock=Clock())
    orig = get_broker()
    set_broker(b)
    yield b
    set_broker(orig)


def _credential_records(sink, action=None):
    return [r for r in sink.records if r["source"] == "credential" and (action is None or r["action"] == action)]


# ── ToolCredentialBroker ─────────────────────────────────────────────────────

def test_issue_and_use_yields_the_secret_once(broker, sink):
    cred = broker.issue("holistic_agent", "llm.chat", session_id="s1")
    assert not hasattr(cred, "secret") and "sk-test" not in repr(cred)
    with broker.use(cred, "llm.chat") as key:
        assert key == "sk-test"
    assert broker.live_count() == 0
    with pytest.raises(CredentialError, match="unknown_or_revoked"):
        with broker.use(cred, "llm.chat"):
            pass
    issued, used = _credential_records(sink, "issue"), _credential_records(sink, "use")
    assert [(r["agent_id"], r["tool_name"], r["session_id"], r["status"]) for r in issued] == \
        [("holistic_agent", "llm.chat", "s1", "success")]
    assert [r["status"] for r in used] == ["success", "deny"]
    assert used[1]["detail"]["reason"] == "unknown_or_revoked"
    assert all("sk-test" not in json.dumps(r) for r in sink.records)


def test_max_uses_allows_several_calls_then_refuses(broker):
    cred = broker.issue("holistic_agent", "llm.chat", max_uses=2)
    for _ in range(2):
        with broker.use(cred, "llm.chat"):
            pass
    with pytest.raises(CredentialError):
        with broker.use(cred, "llm.chat"):
            pass


def test_credential_for_one_tool_cannot_unlock_another(broker):
    b = ToolCredentialBroker(source=Secrets({"DEEPSEEK_API_KEY": "a", "MAIL_KEY": "b"}),
                             tool_secrets={"llm.chat": "DEEPSEEK_API_KEY", "email.send": "MAIL_KEY"})
    cred = b.issue("holistic_agent", "llm.chat")
    with pytest.raises(CredentialError, match="wrong_tool"):
        with b.use(cred, "email.send"):
            pass
    with b.use(cred, "llm.chat") as key:   # the refusal didn't burn the handle
        assert key == "a"


def test_expired_credential_is_refused(broker):
    cred = broker.issue("holistic_agent", "llm.chat", ttl_seconds=5)
    broker._clock.t += 5
    with pytest.raises(CredentialError, match="expired"):
        with broker.use(cred, "llm.chat"):
            pass
    assert broker.live_count() == 0


def test_forged_handle_with_a_real_id_is_refused(broker):
    cred = broker.issue("holistic_agent", "llm.chat", session_id="s1")
    forged = type(cred)(cred.credential_id, "report_agent", cred.tool_name, cred.session_id,
                        cred.expires_at + 3600, cred.max_uses)
    with pytest.raises(CredentialError, match="unknown_or_revoked"):
        with broker.use(forged, "llm.chat"):
            pass


@pytest.mark.parametrize("agent,tool,reason", [
    ("", "llm.chat", "no_agent"),
    ("holistic_agent", "shell.exec", "tool_has_no_credential"),
])
def test_issue_refuses_without_agent_or_for_a_tool_with_no_credential(broker, sink, agent, tool, reason):
    with pytest.raises(CredentialError, match=reason):
        broker.issue(agent, tool)
    [rec] = _credential_records(sink, "issue")
    assert rec["status"] == "deny" and rec["detail"]["reason"] == reason


def test_revoke_session_kills_live_credentials_and_new_issues(broker, sink):
    mine = broker.issue("holistic_agent", "llm.chat", session_id="s1")
    other = broker.issue("holistic_agent", "llm.chat", session_id="s2")
    assert broker.revoke_session("s1", reason="test") == 1
    with pytest.raises(CredentialError):
        with broker.use(mine, "llm.chat"):
            pass
    with pytest.raises(CredentialError, match="session_revoked"):
        broker.issue("holistic_agent", "llm.chat", session_id="s1")
    with broker.use(other, "llm.chat"):
        pass
    [rev] = _credential_records(sink, "revoke_session")
    assert rev["session_id"] == "s1" and rev["detail"] == {"revoked": 1, "reason": "test"}


def test_missing_secret_is_a_runtime_error_like_before():
    b = ToolCredentialBroker(source=Secrets({}))
    assert not b.has_secret("llm.chat") and not b.has_secret("nope")
    cred = b.issue("holistic_agent", "llm.chat")
    with pytest.raises(SecretNotConfigured) as exc:
        with b.use(cred, "llm.chat"):
            pass
    assert isinstance(exc.value, RuntimeError) and "DEEPSEEK_API_KEY" in str(exc.value)


def test_deepseek_call_gets_its_key_from_the_broker(broker, sink):
    import utils.deepseek_client as dc
    assert not hasattr(dc, "_KEY")
    resp = MagicMock()
    resp.read.return_value = json.dumps({"choices": [{"message": {"content": "ok"}}], "usage": {}}).encode()
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    with audit_context(resource_id="sess-9"), patch("urllib.request.urlopen", return_value=resp) as op:
        assert dc.call(system="s", user="u", agent_id="holistic_agent") == "ok"
    assert op.call_args[0][0].get_header("Authorization") == "Bearer sk-test"
    assert [(r["action"], r["status"], r["agent_id"], r["session_id"]) for r in _credential_records(sink)] == \
        [("issue", "success", "holistic_agent", "sess-9"), ("use", "success", "holistic_agent", "sess-9")]
    assert broker.live_count() == 0


def test_policy_suspension_revokes_the_sessions_credentials(broker):
    database.init_db()
    with database._tx() as conn:
        conn.execute(f"DROP TABLE IF EXISTS {decision_log.TABLE}")
    decision_log._ready = False
    policy.set_guard(DefaultAgentPolicyGuard())
    try:
        cred = broker.issue("holistic_agent", "llm.chat", session_id="sess-bad")
        with audit_context(resource_id="sess-bad"):
            for _ in range(3):
                policy.get_guard().evaluate("holistic_agent", "llm.chat", {**LLM_ARGS, "max_tokens": 99_999})
        with pytest.raises(CredentialError):
            with broker.use(cred, "llm.chat"):
                pass
    finally:
        policy.set_guard(DefaultAgentPolicyGuard())


# ── AuditService ─────────────────────────────────────────────────────────────

def test_emit_fills_who_and_where_from_the_audit_context(sink):
    with audit_context(correlation_id="c1", user_id="u1", tenant_id="t1", resource_id="s1"):
        audit_service.emit("agent", "invoke", "success", agent_id="meta_agent")
    [r] = sink.records
    assert (r["source"], r["agent_id"], r["user_id"], r["tenant_id"], r["session_id"], r["correlation_id"]) == \
        ("agent", "meta_agent", "u1", "t1", "s1", "c1")


def test_agent_audit_log_and_policy_decisions_reach_the_external_sink(sink):
    database.init_db()
    with audit_context(user_id="u1", tenant_id="t1", resource_id="s1"):
        audit_record("meta_agent", "invoke", "success", tool_name="meta_node")
        DefaultAgentPolicyGuard().evaluate("holistic_agent", "llm.chat", LLM_ARGS)
    sources = [(r["source"], r["agent_id"], r["status"]) for r in sink.records]
    assert ("agent", "meta_agent", "success") in sources
    assert ("policy", "holistic_agent", "allow") in sources


def test_emit_never_raises_and_counts_a_failing_sink():
    class Broken:
        def write(self, record):
            raise OSError("disk full")
    audit_service.set_sink(Broken())
    before = counters.snapshot().get("audit_external_failures", 0)
    audit_service.emit("agent", "invoke", "success")
    assert counters.snapshot()["audit_external_failures"] == before + 1


def test_jsonl_chain_verifies_and_survives_a_restart(tmp_path):
    path = str(tmp_path / "records.jsonl")
    audit_service.set_sink(audit_service.JsonlSink(path))
    for i in range(3):
        audit_service.emit("agent", "invoke", "success", agent_id=f"a{i}")
    audit_service.set_sink(audit_service.JsonlSink(path))   # a new process opening the same file
    audit_service.emit("agent", "invoke", "success", agent_id="a3")
    assert audit_service.verify_jsonl(path) == {"ok": True, "records": 4, "broken_at": None}
    lines = open(path).read().splitlines()
    assert json.loads(lines[3])["prev_hash"] == json.loads(lines[2])["record_hash"]


def test_jsonl_detects_an_edited_and_a_deleted_record(tmp_path):
    path = str(tmp_path / "records.jsonl")
    audit_service.set_sink(audit_service.JsonlSink(path))
    for i in range(3):
        audit_service.emit("policy", "decision", "deny", agent_id=f"a{i}")
    lines = open(path).read().splitlines()

    edited = json.loads(lines[1])
    edited["status"] = "allow"
    open(path, "w").write("\n".join([lines[0], json.dumps(edited), lines[2]]) + "\n")
    assert audit_service.verify_jsonl(path) == {"ok": False, "records": 2, "broken_at": 2}

    open(path, "w").write("\n".join([lines[0], lines[2]]) + "\n")
    assert audit_service.verify_jsonl(path)["broken_at"] == 2


def test_http_sink_posts_in_the_background_and_counts_drops():
    posted = []
    done = __import__("threading").Event()

    def fake_urlopen(req, timeout):
        posted.append(json.loads(req.data))
        done.set()
        return MagicMock(__enter__=lambda s: s, __exit__=MagicMock(return_value=False))

    with patch("audit.audit_service.urllib.request.urlopen", side_effect=fake_urlopen):
        audit_service.set_sink(audit_service.HttpSink("http://collector.local/records"))
        audit_service.emit("credential", "use", "success", agent_id="holistic_agent")
        assert done.wait(5)
    assert posted[0]["agent_id"] == "holistic_agent"

    full = audit_service.HttpSink.__new__(audit_service.HttpSink)
    full._q = __import__("queue").Queue(maxsize=1)
    full._q.put({})
    before = counters.snapshot().get("audit_external_dropped", 0)
    full.write({"x": 1})
    assert counters.snapshot()["audit_external_dropped"] == before + 1


def test_sink_is_chosen_from_the_environment(tmp_path):
    with patch.dict(os.environ, {"AUDIT_SINK": "none"}):
        assert isinstance(audit_service._sink_from_env(), audit_service.NullSink)
    with patch.dict(os.environ, {"AUDIT_SINK": "http", "AUDIT_SINK_URL": ""}):
        assert isinstance(audit_service._sink_from_env(), audit_service.JsonlSink)
    with patch.dict(os.environ, {"AUDIT_SINK": "jsonl", "AUDIT_EXTERNAL_PATH": str(tmp_path / "x.jsonl")}):
        s = audit_service._sink_from_env()
        assert isinstance(s, audit_service.JsonlSink) and s.path.endswith("x.jsonl")


def _write_many(path, n, tag):
    sink = audit_service.JsonlSink(path)
    for i in range(n):
        sink.write({"source": "agent", "action": "invoke", "status": "success", "agent_id": f"{tag}-{i}"})


def test_jsonl_chain_stays_intact_with_several_processes_writing(tmp_path):
    import multiprocessing as mp
    path = str(tmp_path / "records.jsonl")
    ctx = mp.get_context("spawn")
    procs = [ctx.Process(target=_write_many, args=(path, 50, f"p{p}")) for p in range(4)]
    for p in procs:
        p.start()
    for p in procs:
        p.join(60)
        assert p.exitcode == 0
    assert audit_service.verify_jsonl(path) == {"ok": True, "records": 200, "broken_at": None}


def test_tail_hash_reads_a_last_line_longer_than_one_chunk(tmp_path):
    path = str(tmp_path / "records.jsonl")
    sink = audit_service.JsonlSink(path)
    sink.write({"detail": {"blob": "x" * 10_000}})
    sink.write({"detail": {"blob": "y" * 10_000}})
    assert audit_service.verify_jsonl(path)["ok"]
