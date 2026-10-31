"""
agent_audit_log — durable, queryable record of what each agent did, for whom.

One row per agent action:

    agent_id        which agent acted            ("question_agent", "meta_agent", ...)
    user_id         who the request was for      (user id, e-mail or "api-key")
    tenant_id       tenant of that user          (rows are always read per tenant)
    tool_name       what the agent ran           (the node function, "permission_check", ...)
    resource_id     what it acted on             (the analysis session, a data resource)
    action          what it did                  ("invoke", "read", "write", ...)
    status          how it ended                 ("success", "fallback", "error", "allow", "deny")
    correlation_id  ties together every row written for one API request
    timestamp       epoch seconds
    duration_ms     how long the action took (0 when not timed)

Rows are written from two places:
  · guardrails.core.safe_node   — every agent node execution
  · fde.permissions.check       — every agent permission decision

Who the request is for is not part of the LangGraph state, so the router binds it
once per request with `audit_context(...)`, and `bind(...)` carries it into the
executor thread that runs the pipeline (run_in_executor does not copy context
variables on its own).

Writing an audit row must never break the request it describes: failures are
logged and swallowed.
"""
from __future__ import annotations

import contextvars
import logging
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterator, List, Optional

import database as _db

log = logging.getLogger("astrointel.audit")

TABLE = "agent_audit_log"

_DDL_SQLITE = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    tool_name       TEXT NOT NULL DEFAULT '',
    resource_id     TEXT NOT NULL DEFAULT '',
    action          TEXT NOT NULL,
    status          TEXT NOT NULL,
    correlation_id  TEXT NOT NULL DEFAULT '',
    timestamp       REAL NOT NULL,
    duration_ms     REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_tenant_ts   ON {TABLE}(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_audit_correlation ON {TABLE}(correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_agent       ON {TABLE}(agent_id);
"""

_DDL_PG = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    tool_name       TEXT NOT NULL DEFAULT '',
    resource_id     TEXT NOT NULL DEFAULT '',
    action          TEXT NOT NULL,
    status          TEXT NOT NULL,
    correlation_id  TEXT NOT NULL DEFAULT '',
    timestamp       DOUBLE PRECISION NOT NULL,
    duration_ms     DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_tenant_ts   ON {TABLE}(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_audit_correlation ON {TABLE}(correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_agent       ON {TABLE}(agent_id);
"""

_COLUMNS = ("agent_id", "user_id", "tenant_id", "tool_name", "resource_id",
            "action", "status", "correlation_id", "timestamp", "duration_ms")


def init_table() -> None:
    """Idempotent — safe to call on every startup."""
    with _db._tx() as conn:
        if _db._USE_PG:
            conn.cursor().execute(_DDL_PG)
        else:
            conn.executescript(_DDL_SQLITE)


# ── Request context ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AuditContext:
    correlation_id: str = ""
    user_id: str = ""
    tenant_id: str = ""
    resource_id: str = ""


_current: contextvars.ContextVar[AuditContext] = contextvars.ContextVar(
    "agent_audit_context", default=AuditContext())


def new_correlation_id() -> str:
    return uuid.uuid4().hex


def current_context() -> AuditContext:
    return _current.get()


@contextmanager
def audit_context(*, correlation_id: str = "", user_id: str = "", tenant_id: str = "",
                  resource_id: str = "") -> Iterator[AuditContext]:
    """Bind who/what the current request is about, for every row written inside the block."""
    ctx = AuditContext(correlation_id or new_correlation_id(), user_id, tenant_id, resource_id)
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


def bind(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Return `fn` wrapped so it runs with the current audit context, in any thread."""
    ctx = contextvars.copy_context()

    def _run(*args: Any, **kwargs: Any) -> Any:
        return ctx.run(fn, *args, **kwargs)

    return _run


# ── Write / read ─────────────────────────────────────────────────────────────

def record(agent_id: str, action: str, status: str, *, tool_name: str = "",
           resource_id: Optional[str] = None, duration_ms: float = 0.0,
           user_id: Optional[str] = None, tenant_id: Optional[str] = None,
           correlation_id: Optional[str] = None) -> None:
    """Write one audit row. Unset fields come from the current audit context. Never raises."""
    ctx = _current.get()
    row = (
        agent_id,
        ctx.user_id if user_id is None else user_id,
        ctx.tenant_id if tenant_id is None else tenant_id,
        tool_name,
        ctx.resource_id if resource_id is None else resource_id,
        action,
        status,
        ctx.correlation_id if correlation_id is None else correlation_id,
        time.time(),
        round(float(duration_ms), 3),
    )
    placeholders = ", ".join(["%s" if _db._USE_PG else "?"] * len(_COLUMNS))
    sql = f"INSERT INTO {TABLE} ({', '.join(_COLUMNS)}) VALUES ({placeholders})"
    try:
        with _db._tx() as conn:
            if _db._USE_PG:
                conn.cursor().execute(sql, row)
            else:
                conn.execute(sql, row)
    except Exception as exc:  # noqa: BLE001 — auditing must not fail the request
        log.warning("agent_audit_log write failed for %s/%s: %s", agent_id, action, exc)


def record_permission(agent: str, action: str, resource: str, decision: str) -> None:
    """fde.permissions listener: one row per agent permission decision ("allow"/"deny"/...)."""
    record(agent, action, decision, tool_name="permission_check", resource_id=resource)


def query(*, tenant_id: Optional[str], correlation_id: str = "", agent_id: str = "",
          resource_id: str = "", status: str = "", limit: int = 100) -> List[Dict[str, Any]]:
    """Newest rows first. tenant_id=None reads every tenant (superadmin only)."""
    clauses, params = [], []
    for column, value in (("tenant_id", tenant_id), ("correlation_id", correlation_id),
                          ("agent_id", agent_id), ("resource_id", resource_id), ("status", status)):
        if value is None or (value == "" and column != "tenant_id"):
            continue
        clauses.append(f"{column} = {'%s' if _db._USE_PG else '?'}")
        params.append(value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit = max(1, min(int(limit), 1000))
    sql = f"SELECT id, {', '.join(_COLUMNS)} FROM {TABLE} {where} ORDER BY timestamp DESC, id DESC LIMIT {limit}"
    with _db._tx() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [dict(r) for r in rows]
