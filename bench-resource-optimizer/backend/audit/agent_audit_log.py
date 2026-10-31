"""
agent_audit_log — durable, queryable record of what each agent did, for whom.

One row per agent action:

    agent_id        which agent acted            ("cv_parser_agent", "role_mapping_agent", ...)
    user_id         which bench user it was for  (empty until the user is known, e.g. before upload)
    tool_name       what the agent ran           (the agent function, "permission_check", ...)
    resource_id     what it acted on             (a role, a data resource such as "cv_text")
    action          what it did                  ("invoke", "read", "write", ...)
    status          how it ended                 ("success", "error", "allow", "deny", ...)
    correlation_id  the request id of RequestLoggingMiddleware (X-Request-Id), shared by all
                    rows written for one API request
    timestamp       epoch seconds
    duration_ms     how long the action took (0 when not timed)

Rows are written from two places:
  · `agent_run(...)` around every agent call in main.py
  · fde.permissions listener — every agent permission decision

Writes use the standard sqlite3 module so they also work from synchronous code
(the permission listener, agents run in executor threads); one short insert into
the WAL database. Writing an audit row must never break the request it describes:
failures are logged and swallowed.
"""
from __future__ import annotations

import contextvars
import logging
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass, replace
from typing import Any, Dict, Iterator, List, Optional

import db as _db

log = logging.getLogger("bench.audit")

TABLE = "agent_audit_log"

DDL = (
    f"""
    CREATE TABLE IF NOT EXISTS {TABLE} (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id        TEXT NOT NULL,
        user_id         TEXT NOT NULL DEFAULT '',
        tool_name       TEXT NOT NULL DEFAULT '',
        resource_id     TEXT NOT NULL DEFAULT '',
        action          TEXT NOT NULL,
        status          TEXT NOT NULL,
        correlation_id  TEXT NOT NULL DEFAULT '',
        timestamp       REAL NOT NULL,
        duration_ms     REAL NOT NULL DEFAULT 0
    )
    """,
    f"CREATE INDEX IF NOT EXISTS idx_agent_audit_ts ON {TABLE}(timestamp)",
    f"CREATE INDEX IF NOT EXISTS idx_agent_audit_correlation ON {TABLE}(correlation_id)",
    f"CREATE INDEX IF NOT EXISTS idx_agent_audit_user ON {TABLE}(user_id)",
)

_COLUMNS = ("agent_id", "user_id", "tool_name", "resource_id", "action",
            "status", "correlation_id", "timestamp", "duration_ms")


# ── Request context ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AuditContext:
    correlation_id: str = ""
    user_id: str = ""
    resource_id: str = ""


_current: contextvars.ContextVar[AuditContext] = contextvars.ContextVar(
    "agent_audit_context", default=AuditContext())


def current_context() -> AuditContext:
    return _current.get()


@contextmanager
def request_context(correlation_id: str) -> Iterator[AuditContext]:
    """Start a fresh context for one request (used by RequestLoggingMiddleware)."""
    token = _current.set(AuditContext(correlation_id=correlation_id))
    try:
        yield _current.get()
    finally:
        _current.reset(token)


def set_subject(*, user_id: Optional[str] = None, resource_id: Optional[str] = None) -> None:
    """Record which user / resource the rest of this request is about."""
    changes = {k: v for k, v in (("user_id", user_id), ("resource_id", resource_id)) if v is not None}
    _current.set(replace(_current.get(), **changes))


# ── Write / read ─────────────────────────────────────────────────────────────

def record(agent_id: str, action: str, status: str, *, tool_name: str = "",
           resource_id: Optional[str] = None, duration_ms: float = 0.0,
           user_id: Optional[str] = None, correlation_id: Optional[str] = None) -> None:
    """Write one audit row. Unset fields come from the current context. Never raises."""
    ctx = _current.get()
    row = (
        agent_id,
        ctx.user_id if user_id is None else user_id,
        tool_name,
        ctx.resource_id if resource_id is None else resource_id,
        action,
        status,
        ctx.correlation_id if correlation_id is None else correlation_id,
        time.time(),
        round(float(duration_ms), 3),
    )
    sql = f"INSERT INTO {TABLE} ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' * len(_COLUMNS))})"
    try:
        with sqlite3.connect(_db.DB_PATH, timeout=5) as conn:
            conn.execute(sql, row)
    except Exception as exc:  # noqa: BLE001 — auditing must not fail the request
        log.warning("agent_audit_log write failed for %s/%s: %s", agent_id, action, exc)


@contextmanager
def agent_run(agent_id: str, tool_name: str, *, resource_id: Optional[str] = None) -> Iterator[None]:
    """Record one agent call: "success", or "error" when the block raises (re-raised)."""
    t0 = time.perf_counter()
    try:
        yield
    except BaseException:
        record(agent_id, "invoke", "error", tool_name=tool_name, resource_id=resource_id,
               duration_ms=(time.perf_counter() - t0) * 1000)
        raise
    record(agent_id, "invoke", "success", tool_name=tool_name, resource_id=resource_id,
           duration_ms=(time.perf_counter() - t0) * 1000)


def record_permission(agent: str, action: str, resource: str, decision: str) -> None:
    """fde.permissions listener: one row per agent permission decision ("allow"/"deny"/...)."""
    record(agent, action, decision, tool_name="permission_check", resource_id=resource)


def query(*, correlation_id: str = "", agent_id: str = "", user_id: str = "",
          status: str = "", limit: int = 100) -> List[Dict[str, Any]]:
    """Newest rows first, optionally filtered."""
    clauses, params = [], []
    for column, value in (("correlation_id", correlation_id), ("agent_id", agent_id),
                          ("user_id", user_id), ("status", status)):
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit = max(1, min(int(limit), 1000))
    sql = (f"SELECT id, {', '.join(_COLUMNS)} FROM {TABLE} {where} "
           f"ORDER BY timestamp DESC, id DESC LIMIT {limit}")
    with sqlite3.connect(_db.DB_PATH, timeout=5) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]
