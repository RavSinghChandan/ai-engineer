"""
workflow.store — durable task state, per-step attempts and the side-effect ledger.

    workflow_tasks    one row per workflow run
        status            PENDING → RUNNING → (WAITING_FOR_APPROVAL → RUNNING →) COMPLETED | FAILED
        idempotency_key   unique per tenant: the same key always maps to the same task
        attempts          how many times a worker claimed the task (a crash counts)
        lease_expires_at  a RUNNING task whose lease ran out lost its worker and is reclaimed

    workflow_steps    one row per (task, step): how often the step started and whether it finished
    workflow_effects  one row per external side effect, keyed by an idempotency key, so a
                      step that re-runs after a crash does not repeat what it already did

Every transition is a single conditional UPDATE, so two workers can never both own a task.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

import database as _db

TASKS = "workflow_tasks"
STEPS = "workflow_steps"
EFFECTS = "workflow_effects"

PENDING = "PENDING"
RUNNING = "RUNNING"
WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
COMPLETED = "COMPLETED"
FAILED = "FAILED"
STATUSES = (PENDING, RUNNING, WAITING_FOR_APPROVAL, COMPLETED, FAILED)
TERMINAL = (COMPLETED, FAILED)


def _ddl() -> str:
    real = "DOUBLE PRECISION" if _db._USE_PG else "REAL"
    return f"""
CREATE TABLE IF NOT EXISTS {TASKS} (
    task_id           TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL DEFAULT '',
    idempotency_key   TEXT NOT NULL,
    request_hash      TEXT NOT NULL,
    status            TEXT NOT NULL,
    payload           TEXT NOT NULL,
    require_approval  INTEGER NOT NULL DEFAULT 0,
    current_step      TEXT NOT NULL DEFAULT '',
    attempts          INTEGER NOT NULL DEFAULT 0,
    max_attempts      INTEGER NOT NULL,
    worker_id         TEXT NOT NULL DEFAULT '',
    lease_expires_at  {real} NOT NULL DEFAULT 0,
    next_run_at       {real} NOT NULL DEFAULT 0,
    error             TEXT NOT NULL DEFAULT '',
    result            TEXT NOT NULL DEFAULT '',
    approved_by       TEXT NOT NULL DEFAULT '',
    created_at        {real} NOT NULL,
    updated_at        {real} NOT NULL,
    UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON {TASKS}(status, next_run_at);
CREATE TABLE IF NOT EXISTS {STEPS} (
    task_id       TEXT NOT NULL,
    step          TEXT NOT NULL,
    status        TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    started_at    {real} NOT NULL,
    finished_at   {real} NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, step)
);
CREATE TABLE IF NOT EXISTS {EFFECTS} (
    effect_key    TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL,
    result        TEXT NOT NULL,
    created_at    {real} NOT NULL
);
"""


def init_tables() -> None:
    """Idempotent — safe to call on every startup."""
    with _db._tx() as conn:
        if _db._USE_PG:
            conn.cursor().execute(_ddl())
        else:
            conn.executescript(_ddl())


class IdempotencyConflict(Exception):
    """The idempotency key was already used with a different request body."""


def request_hash(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _row(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    task = dict(row)
    task["payload"] = json.loads(task["payload"])
    task["result"] = json.loads(task["result"]) if task["result"] else None
    task["require_approval"] = bool(task["require_approval"])
    return task


# ── Tasks ────────────────────────────────────────────────────────────────────

def create_task(payload: Dict[str, Any], *, idempotency_key: str = "", tenant_id: str = "",
                require_approval: bool = False, max_attempts: int = 3) -> tuple:
    """Return (task, created). A repeated idempotency key returns the original task."""
    key = idempotency_key or uuid.uuid4().hex
    digest = request_hash({"payload": payload, "require_approval": require_approval})
    now = time.time()
    task_id = uuid.uuid4().hex
    with _db._tx() as conn:
        cur = conn.execute(
            f"INSERT OR IGNORE INTO {TASKS} (task_id, tenant_id, idempotency_key, request_hash, "
            f"status, payload, require_approval, max_attempts, created_at, updated_at) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (task_id, tenant_id, key, digest, PENDING, json.dumps(payload, default=str),
             int(require_approval), max_attempts, now, now),
        )
        created = cur.rowcount == 1
    task = get_by_key(tenant_id, key)
    if not created and task["request_hash"] != digest:
        raise IdempotencyConflict(f"idempotency key {key!r} was used with a different request")
    return task, created


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    with _db._tx() as conn:
        return _row(conn.execute(f"SELECT * FROM {TASKS} WHERE task_id=?", (task_id,)).fetchone())


def get_by_key(tenant_id: str, idempotency_key: str) -> Optional[Dict[str, Any]]:
    with _db._tx() as conn:
        return _row(conn.execute(
            f"SELECT * FROM {TASKS} WHERE tenant_id=? AND idempotency_key=?",
            (tenant_id, idempotency_key)).fetchone())


def claim(task_id: str, worker_id: str, lease_seconds: float) -> bool:
    """Take ownership of a runnable task: PENDING and due, or RUNNING with an expired lease."""
    now = time.time()
    with _db._tx() as conn:
        cur = conn.execute(
            f"UPDATE {TASKS} SET status=?, worker_id=?, lease_expires_at=?, attempts=attempts+1, "
            f"updated_at=? WHERE task_id=? AND attempts < max_attempts AND "
            f"((status=? AND next_run_at<=?) OR (status=? AND lease_expires_at<?))",
            (RUNNING, worker_id, now + lease_seconds, now, task_id, PENDING, now, RUNNING, now),
        )
        return cur.rowcount == 1


def claim_for_resume(task_id: str, worker_id: str, lease_seconds: float, approved_by: str) -> bool:
    """WAITING_FOR_APPROVAL → RUNNING once a human decided. Does not use up an attempt."""
    now = time.time()
    with _db._tx() as conn:
        cur = conn.execute(
            f"UPDATE {TASKS} SET status=?, worker_id=?, lease_expires_at=?, approved_by=?, "
            f"updated_at=? WHERE task_id=? AND status=?",
            (RUNNING, worker_id, now + lease_seconds, approved_by, now, task_id,
             WAITING_FOR_APPROVAL),
        )
        return cur.rowcount == 1


def _owned_update(task_id: str, worker_id: str, sets: str, params: tuple) -> bool:
    with _db._tx() as conn:
        cur = conn.execute(
            f"UPDATE {TASKS} SET {sets}, updated_at=? WHERE task_id=? AND status=? AND worker_id=?",
            (*params, time.time(), task_id, RUNNING, worker_id),
        )
        return cur.rowcount == 1


def heartbeat(task_id: str, worker_id: str, step: str, lease_seconds: float) -> bool:
    """Extend the lease and record the step in progress. False = this worker lost the task."""
    return _owned_update(task_id, worker_id, "current_step=?, lease_expires_at=?",
                         (step, time.time() + lease_seconds))


def mark_waiting(task_id: str, worker_id: str) -> bool:
    return _owned_update(task_id, worker_id, "status=?, worker_id='', lease_expires_at=0",
                         (WAITING_FOR_APPROVAL,))


def mark_completed(task_id: str, worker_id: str, result: Dict[str, Any]) -> bool:
    return _owned_update(task_id, worker_id,
                         "status=?, current_step='', worker_id='', lease_expires_at=0, result=?",
                         (COMPLETED, json.dumps(result, default=str)))


def mark_failed(task_id: str, worker_id: str, error: str) -> bool:
    return _owned_update(task_id, worker_id, "status=?, worker_id='', lease_expires_at=0, error=?",
                         (FAILED, error))


def mark_retry(task_id: str, worker_id: str, error: str, delay_seconds: float) -> bool:
    return _owned_update(task_id, worker_id,
                         "status=?, worker_id='', lease_expires_at=0, error=?, next_run_at=?",
                         (PENDING, error, time.time() + delay_seconds))


def fail_exhausted() -> List[str]:
    """Orphaned or pending tasks that already used every attempt → FAILED. Returns their ids."""
    now = time.time()
    with _db._tx() as conn:
        rows = conn.execute(
            f"SELECT task_id FROM {TASKS} WHERE attempts >= max_attempts AND "
            f"(status=? OR (status=? AND lease_expires_at<?))",
            (PENDING, RUNNING, now)).fetchall()
        ids = [r[0] for r in rows]
        for task_id in ids:
            conn.execute(
                f"UPDATE {TASKS} SET status=?, worker_id='', lease_expires_at=0, error=?, "
                f"updated_at=? WHERE task_id=?",
                (FAILED, "retry limit reached: worker stopped during every attempt", now, task_id))
    return ids


def runnable_ids() -> List[str]:
    """Tasks a worker may claim now: due PENDING tasks and RUNNING tasks with a dead lease."""
    now = time.time()
    with _db._tx() as conn:
        rows = conn.execute(
            f"SELECT task_id FROM {TASKS} WHERE attempts < max_attempts AND "
            f"((status=? AND next_run_at<=?) OR (status=? AND lease_expires_at<?)) "
            f"ORDER BY created_at",
            (PENDING, now, RUNNING, now)).fetchall()
    return [r[0] for r in rows]


# ── Steps ────────────────────────────────────────────────────────────────────

def start_step(task_id: str, step: str) -> int:
    """Record that a step started; returns how many times it has started in total."""
    now = time.time()
    with _db._tx() as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO {STEPS} (task_id, step, status, attempts, started_at) "
            f"VALUES (?, ?, ?, 0, ?)", (task_id, step, RUNNING, now))
        conn.execute(
            f"UPDATE {STEPS} SET status=?, attempts=attempts+1, started_at=? "
            f"WHERE task_id=? AND step=?", (RUNNING, now, task_id, step))
        return conn.execute(f"SELECT attempts FROM {STEPS} WHERE task_id=? AND step=?",
                            (task_id, step)).fetchone()[0]


def finish_step(task_id: str, step: str, status: str = COMPLETED) -> None:
    with _db._tx() as conn:
        conn.execute(f"UPDATE {STEPS} SET status=?, finished_at=? WHERE task_id=? AND step=?",
                     (status, time.time(), task_id, step))


def steps(task_id: str) -> List[Dict[str, Any]]:
    with _db._tx() as conn:
        rows = conn.execute(
            f"SELECT step, status, attempts, started_at, finished_at FROM {STEPS} "
            f"WHERE task_id=? ORDER BY started_at", (task_id,)).fetchall()
    return [dict(r) for r in rows]


# ── Side effects ─────────────────────────────────────────────────────────────

def run_once(effect_key: str, task_id: str, fn: Callable[[], Any]) -> Any:
    """Run fn() at most once per effect_key; later calls return the stored result.

    A crash between fn() finishing and the ledger row committing would run fn() again,
    so effects should also be safe to repeat (for example keyed by the same session id).
    """
    with _db._tx() as conn:
        row = conn.execute(f"SELECT result FROM {EFFECTS} WHERE effect_key=?",
                           (effect_key,)).fetchone()
    if row is not None:
        return json.loads(row[0])
    result = fn()
    with _db._tx() as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO {EFFECTS} (effect_key, task_id, result, created_at) "
            f"VALUES (?, ?, ?, ?)", (effect_key, task_id, json.dumps(result, default=str),
                                     time.time()))
    return result


def effects(task_id: str) -> List[str]:
    with _db._tx() as conn:
        rows = conn.execute(f"SELECT effect_key FROM {EFFECTS} WHERE task_id=? ORDER BY created_at",
                            (task_id,)).fetchall()
    return [r[0] for r in rows]
