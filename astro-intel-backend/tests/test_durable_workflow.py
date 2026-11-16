"""
Tests for the durable workflow — task states, checkpoints, retry limits, idempotency
keys and crash recovery.
Run: pytest tests/test_durable_workflow.py -v

The crash tests start tests/workflow_worker.py as a separate process, kill it with
SIGKILL inside a step, then start a new process that resumes the task — the same thing
that happens when the server dies and comes back.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("SQLITE_DB_PATH", _tmp.name)

import pytest
from langgraph.graph import END, StateGraph

import database
from graph.pipeline import PIPELINE_STEPS
from guardrails.security import SecurityError
from workflow import runner, store
from workflow.checkpointer import CHECKPOINTS, DbCheckpointSaver

BACKEND = Path(__file__).resolve().parent.parent
WORKER = BACKEND / "tests" / "workflow_worker.py"
STEP_NAMES = [name for name, _ in PIPELINE_STEPS]
LEASE = 1.0


@pytest.fixture(autouse=True)
def fresh_tables():
    database.init_db()
    with database._tx() as conn:
        for table in (store.TASKS, store.STEPS, store.EFFECTS, CHECKPOINTS,
                      "workflow_checkpoint_blobs", "workflow_checkpoint_writes"):
            conn.execute(f"DELETE FROM {table}")
    yield
    runner.use_steps(None)
    del runner.DELIVERY_EFFECTS[1:]


def _stubs(calls, fail=None):
    def make(name):
        def step(state):
            calls.append(name)
            if fail and name in fail:
                raise fail[name]
            return state
        return step
    return [(name, make(name)) for name in STEP_NAMES]


# ── Checkpointer ─────────────────────────────────────────────────────────────

def test_checkpointer_persists_every_step_and_resumes_a_new_saver():
    def add(key):
        def node(state):
            return {**state, key: True}
        return node

    builder = StateGraph(dict)
    builder.add_node("a", add("a"))
    builder.add_node("b", add("b"))
    builder.set_entry_point("a")
    builder.add_edge("a", "b")
    builder.add_edge("b", END)
    config = {"configurable": {"thread_id": "t-1"}}

    builder.compile(checkpointer=DbCheckpointSaver(), interrupt_before=["b"]).invoke({"x": 1}, config)

    # a different saver object = what a restarted process sees
    graph = builder.compile(checkpointer=DbCheckpointSaver(), interrupt_before=["b"])
    snapshot = graph.get_state(config)
    assert snapshot.values == {"x": 1, "a": True}
    assert snapshot.next == ("b",)
    assert graph.invoke(None, config) == {"x": 1, "a": True, "b": True}
    assert len(list(DbCheckpointSaver().list(config))) == DbCheckpointSaver().count("t-1") >= 3


def test_checkpointer_list_filters_and_limits():
    saver = DbCheckpointSaver()
    builder = StateGraph(dict)
    builder.add_node("a", lambda s: s)
    builder.set_entry_point("a")
    builder.add_edge("a", END)
    config = {"configurable": {"thread_id": "t-2"}}
    builder.compile(checkpointer=saver).invoke({"x": 1}, config)

    everything = list(saver.list(config))
    assert [c.metadata["step"] for c in everything] == sorted(
        (c.metadata["step"] for c in everything), reverse=True)
    assert len(list(saver.list(config, limit=1))) == 1
    assert [c.metadata["source"] for c in saver.list(config, filter={"source": "input"})] == ["input"]
    assert list(saver.list(config, before=everything[-1].config)) == []
    saver.delete_thread("t-2")
    assert saver.get_tuple(config) is None


# ── Task states + idempotency keys ───────────────────────────────────────────

def test_a_task_runs_through_every_state_to_completed():
    calls = []
    runner.use_steps(_stubs(calls))
    task, created = runner.submit({"user_question": "q"}, idempotency_key="k-1")
    assert created and task["status"] == store.PENDING

    done = runner.run_task(task["task_id"])

    assert done["status"] == store.COMPLETED
    assert calls == STEP_NAMES
    status = runner.status(task["task_id"])
    assert [s["step"] for s in status["steps"]] == STEP_NAMES + ["deliver"]
    assert all(s["status"] == store.COMPLETED and s["attempts"] == 1 for s in status["steps"])
    assert status["effects"] == [f"{task['task_id']}:save_session"]
    assert status["checkpoints"] >= len(STEP_NAMES) + 2
    assert status["result"]["delivered"]["save_session"] == {"session_id": task["task_id"]}


def test_same_idempotency_key_returns_the_same_task_and_never_runs_twice():
    calls = []
    runner.use_steps(_stubs(calls))
    first, created_first = runner.submit({"user_question": "q"}, idempotency_key="same")
    runner.run_task(first["task_id"])
    again, created_again = runner.submit({"user_question": "q"}, idempotency_key="same")
    runner.run_task(again["task_id"])

    assert created_first and not created_again
    assert again["task_id"] == first["task_id"]
    assert calls == STEP_NAMES


def test_idempotency_key_is_scoped_per_tenant():
    a, _ = runner.submit({"q": 1}, idempotency_key="k", tenant_id="tenant-a")
    b, created = runner.submit({"q": 1}, idempotency_key="k", tenant_id="tenant-b")
    assert created and a["task_id"] != b["task_id"]


def test_reusing_a_key_with_a_different_body_is_a_conflict():
    runner.submit({"user_question": "q1"}, idempotency_key="k-2")
    with pytest.raises(store.IdempotencyConflict):
        runner.submit({"user_question": "q2"}, idempotency_key="k-2")


def test_only_one_worker_can_claim_a_task():
    task, _ = runner.submit({"q": 1})
    assert store.claim(task["task_id"], "w1", 60)
    assert not store.claim(task["task_id"], "w2", 60)
    assert not store.heartbeat(task["task_id"], "w2", "x", 60)


def test_expired_lease_lets_another_worker_take_over():
    task, _ = runner.submit({"q": 1})
    assert store.claim(task["task_id"], "w1", 0.01)
    time.sleep(0.05)
    assert store.claim(task["task_id"], "w2", 60)
    assert not store.mark_completed(task["task_id"], "w1", {})  # the old worker is fenced off


def test_approval_pauses_then_completes():
    calls = []
    runner.use_steps(_stubs(calls))
    task, _ = runner.submit({"q": 1}, require_approval=True)

    waiting = runner.run_task(task["task_id"])
    assert waiting["status"] == store.WAITING_FOR_APPROVAL
    assert store.effects(task["task_id"]) == []        # nothing delivered before approval
    assert runner.run_task(task["task_id"])["status"] == store.WAITING_FOR_APPROVAL  # not claimable

    done = runner.approve(task["task_id"], "admin@test")
    assert done["status"] == store.COMPLETED
    assert done["approved_by"] == "admin@test"
    assert calls == STEP_NAMES                         # nothing before the gate re-ran
    assert runner.approve(task["task_id"], "admin@test") is None


def test_rejection_fails_the_task_without_delivering():
    runner.use_steps(_stubs([]))
    task, _ = runner.submit({"q": 1}, require_approval=True)
    runner.run_task(task["task_id"])

    rejected = runner.reject(task["task_id"], "admin@test", "wrong birth time")
    assert rejected["status"] == store.FAILED
    assert "wrong birth time" in rejected["error"]
    assert store.effects(task["task_id"]) == []


# ── Retry limits ─────────────────────────────────────────────────────────────

def test_transient_error_retries_from_the_failed_step_then_completes(monkeypatch):
    monkeypatch.setattr(runner, "RETRY_BACKOFF_SECONDS", 0)
    calls = []
    errors = {"meta_agent": TimeoutError("LLM timed out")}
    runner.use_steps(_stubs(calls, fail=errors))
    task, _ = runner.submit({"q": 1})

    first = runner.run_task(task["task_id"])
    assert first["status"] == store.PENDING and "LLM timed out" in first["error"]

    errors.clear()
    assert runner.recover() == [task["task_id"]]
    assert store.get_task(task["task_id"])["status"] == store.COMPLETED
    upto = STEP_NAMES.index("meta_agent")
    assert calls == STEP_NAMES[:upto + 1] + STEP_NAMES[upto:]   # only meta_agent ran twice


def test_task_fails_after_max_attempts(monkeypatch):
    monkeypatch.setattr(runner, "RETRY_BACKOFF_SECONDS", 0)
    runner.use_steps(_stubs([], fail={"remedy_agent": RuntimeError("boom")}))
    task, _ = runner.submit({"q": 1})

    runner.run_task(task["task_id"])
    runner.recover()
    runner.recover()

    final = store.get_task(task["task_id"])
    assert final["status"] == store.FAILED
    assert final["attempts"] == runner.TASK_MAX_ATTEMPTS
    assert final["error"].startswith("retry limit reached")
    assert runner.recover() == []


def test_step_retry_limit_fails_the_task(monkeypatch):
    monkeypatch.setattr(runner, "STEP_MAX_ATTEMPTS", 1)
    monkeypatch.setattr(runner, "RETRY_BACKOFF_SECONDS", 0)
    runner.use_steps(_stubs([], fail={"meta_agent": RuntimeError("x")}))
    task, _ = runner.submit({"q": 1})
    runner.run_task(task["task_id"])
    runner.recover()

    final = store.get_task(task["task_id"])
    assert final["status"] == store.FAILED
    assert "RetryLimitExceeded" in final["error"]


def test_security_error_is_not_retried():
    runner.use_steps(_stubs([], fail={"security_check": SecurityError("injection")}))
    task, _ = runner.submit({"q": 1})
    final = runner.run_task(task["task_id"])
    assert final["status"] == store.FAILED and final["attempts"] == 1


def test_run_once_never_repeats_a_side_effect():
    count = []
    for _ in range(3):
        assert store.run_once("t:email", "t", lambda: count.append(1) or {"n": len(count)}) == {"n": 1}
    assert count == [1]


# ── Crash recovery (real process kills) ──────────────────────────────────────

def _worker(tmp_path, *args, **env):
    run_env = {**os.environ, "SQLITE_DB_PATH": str(tmp_path / "wf.db"),
               "CALLS_FILE": str(tmp_path / "calls.log"),
               "CRASH_ONCE_FILE": str(tmp_path / "crashed"),
               "WORKFLOW_LEASE_SECONDS": str(LEASE), "WORKFLOW_RETRY_BACKOFF_SECONDS": "0",
               **env}
    proc = subprocess.run([sys.executable, str(WORKER), *args], cwd=BACKEND, env=run_env,
                          capture_output=True, text=True, timeout=120)
    out = proc.stdout.strip().splitlines()
    return proc.returncode, (json.loads(out[-1]) if proc.returncode == 0 and out else None)


def _calls(tmp_path):
    return (tmp_path / "calls.log").read_text().split()


def _task(tmp_path, task_id):
    import sqlite3
    conn = sqlite3.connect(tmp_path / "wf.db")
    conn.row_factory = sqlite3.Row
    task = dict(conn.execute("SELECT * FROM workflow_tasks WHERE task_id=?", (task_id,)).fetchone())
    task["steps"] = {r["step"]: dict(r) for r in conn.execute(
        "SELECT * FROM workflow_steps WHERE task_id=?", (task_id,))}
    task["effects"] = [r[0] for r in conn.execute(
        "SELECT effect_key FROM workflow_effects WHERE task_id=?", (task_id,))]
    conn.close()
    return task


def test_crash_mid_pipeline_resumes_without_repeating_completed_steps(tmp_path):
    _, sub = _worker(tmp_path, "submit", "crash-1")
    task_id = sub["task_id"]

    code, _ = _worker(tmp_path, "run", task_id, CRASH_IN="domain_agents")
    assert code == -9                                   # killed inside domain_agents
    crashed = _task(tmp_path, task_id)
    assert crashed["status"] == store.RUNNING and crashed["current_step"] == "domain_agents"

    time.sleep(LEASE + 0.3)                             # the dead worker's lease runs out
    code, out = _worker(tmp_path, "recover", CRASH_IN="domain_agents")
    assert code == 0 and out["resumed"] == [task_id]

    final = _task(tmp_path, task_id)
    assert final["status"] == store.COMPLETED and final["attempts"] == 2
    calls = _calls(tmp_path)
    for step in STEP_NAMES:
        expected = 2 if step == "domain_agents" else 1  # only the interrupted step re-ran
        assert calls.count(f"step:{step}") == expected, step
        assert final["steps"][step]["attempts"] == expected
    assert calls.count("effect:notify") == 1


def test_crash_after_side_effects_does_not_repeat_them(tmp_path):
    _, sub = _worker(tmp_path, "submit", "crash-2")
    task_id = sub["task_id"]

    code, _ = _worker(tmp_path, "run", task_id, CRASH_IN="after_notify")
    assert code == -9
    assert _calls(tmp_path).count("effect:notify") == 1
    assert _task(tmp_path, task_id)["current_step"] == "deliver"

    time.sleep(LEASE + 0.3)
    _worker(tmp_path, "recover", CRASH_IN="after_notify")

    final = _task(tmp_path, task_id)
    assert final["status"] == store.COMPLETED
    assert final["steps"]["deliver"]["attempts"] == 2   # deliver re-ran …
    calls = _calls(tmp_path)
    assert calls.count("effect:notify") == 1            # … but did not notify again
    assert all(calls.count(f"step:{s}") == 1 for s in STEP_NAMES)
    assert sorted(final["effects"]) == sorted(
        f"{task_id}:{e}" for e in ("save_session", "notify", "crash_point"))


def test_approval_survives_a_restart(tmp_path):
    _, sub = _worker(tmp_path, "submit", "crash-3", "approval")
    task_id = sub["task_id"]
    _, out = _worker(tmp_path, "run", task_id)
    assert out["status"] == store.WAITING_FOR_APPROVAL

    # a new process — nothing in memory — approves and finishes the task
    _, out = _worker(tmp_path, "approve", task_id)
    assert out["status"] == store.COMPLETED
    calls = _calls(tmp_path)
    assert all(calls.count(f"step:{s}") == 1 for s in STEP_NAMES)
    assert calls.count("effect:notify") == 1


def test_a_step_that_crashes_every_time_ends_in_failed(tmp_path):
    _, sub = _worker(tmp_path, "submit", "crash-4")
    task_id = sub["task_id"]

    code, _ = _worker(tmp_path, "run", task_id, CRASH_ALWAYS="meta_agent")
    assert code == -9
    for _ in range(runner.TASK_MAX_ATTEMPTS - 1):
        time.sleep(LEASE + 0.3)
        code, _ = _worker(tmp_path, "recover", CRASH_ALWAYS="meta_agent")
        assert code == -9
    time.sleep(LEASE + 0.3)
    code, out = _worker(tmp_path, "recover", CRASH_ALWAYS="meta_agent")

    final = _task(tmp_path, task_id)
    assert code == 0 and out["resumed"] == []
    assert final["status"] == store.FAILED and final["attempts"] == runner.TASK_MAX_ATTEMPTS
    assert _calls(tmp_path).count("step:question_agent") == 1


# ── HTTP API ─────────────────────────────────────────────────────────────────

def test_api_idempotency_key_approval_and_tenant_scoping(monkeypatch):
    from fastapi.testclient import TestClient
    import auth.store as auth_store
    from auth.models import Role
    from main import app

    monkeypatch.setattr(runner, "start", runner.run_task)   # run inline, not in a thread
    runner.use_steps(_stubs([]))
    auth_store.clear_for_tests()
    tenant = auth_store.create_tenant("Workflow Tenant")
    key = auth_store.create_api_key(tenant.tenant_id, Role.ADMIN, "wf").key
    other = auth_store.create_api_key(auth_store.create_tenant("Other").tenant_id, Role.ADMIN, "o").key
    client = TestClient(app)
    body = {"user_profile": {"full_name": "Asha Rao", "date_of_birth": "1994-03-12",
                             "time_of_birth": "06:30", "place_of_birth": "Pune"},
            "user_question": "Will I change jobs this year?", "selected_modules": ["numerology"]}
    headers = {"X-API-Key": key, "Idempotency-Key": "api-1"}

    first = client.post("/api/v1/workflow/tasks?require_approval=true", json=body, headers=headers)
    again = client.post("/api/v1/workflow/tasks?require_approval=true", json=body, headers=headers)
    assert first.status_code == 202 and again.status_code == 200
    task_id = first.json()["task_id"]
    assert again.json()["task_id"] == task_id and again.json()["created"] is False

    changed = client.post("/api/v1/workflow/tasks?require_approval=true",
                          json={**body, "user_question": "Something else?"}, headers=headers)
    assert changed.status_code == 409

    url = f"/api/v1/workflow/tasks/{task_id}"
    assert client.get(url, headers={"X-API-Key": key}).json()["status"] == store.WAITING_FOR_APPROVAL
    assert client.get(url, headers={"X-API-Key": other}).status_code == 404
    assert client.post(f"{url}/approve", headers={"X-API-Key": other}).status_code == 404

    done = client.post(f"{url}/approve", headers={"X-API-Key": key}).json()
    assert done["status"] == store.COMPLETED
    assert done["effects"] == [f"{task_id}:save_session"]
    assert client.post(f"{url}/approve", headers={"X-API-Key": key}).status_code == 409
