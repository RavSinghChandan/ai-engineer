"""
policy_decision_log — the immutable record of every AgentPolicyGuard decision.

Immutable in two ways:
  · Append-only. Database triggers reject every UPDATE and DELETE (and TRUNCATE
    on PostgreSQL); this module has no function that changes a row.
  · Tamper-evident. Each row stores the hash of the previous row and its own
    hash over its content (a hash chain). Editing or removing a row in the
    database file, around the triggers, breaks the chain, and verify_chain()
    reports the first row that no longer matches.

One row per decision:

    decision_id     uuid of the decision
    timestamp       epoch seconds
    agent_id        agent that asked             ("holistic_agent", ...)
    tool_name       tool it asked for            ("llm.chat", "report.generate")
    arguments       JSON of the arguments the guard saw (long strings are cut)
    outcome         "allow" | "deny" | "require_approval" | "suspend" | "approval_granted"
    reasons         JSON list of why            (["max_tokens_above_max"], ...)
    checks          JSON object of the five checks and their results
    session_id      analysis session the call belonged to ("" when unknown)
    user_id, tenant_id, correlation_id   from the agent_audit_log request context
    prev_hash       row_hash of the previous row ("" for the first row)
    row_hash        sha256 over prev_hash and this row's content

The table is created on first use, so no change to database.init_db() is needed.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

import database as _db

TABLE = "policy_decision_log"

_CONTENT = ("decision_id", "timestamp", "agent_id", "tool_name", "arguments", "outcome",
            "reasons", "checks", "session_id", "user_id", "tenant_id", "correlation_id")
_COLUMNS = _CONTENT + ("prev_hash", "row_hash")

_DDL_SQLITE = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id     TEXT NOT NULL UNIQUE,
    timestamp       REAL NOT NULL,
    agent_id        TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    arguments       TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    reasons         TEXT NOT NULL,
    checks          TEXT NOT NULL,
    session_id      TEXT NOT NULL DEFAULT '',
    user_id         TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    correlation_id  TEXT NOT NULL DEFAULT '',
    prev_hash       TEXT NOT NULL,
    row_hash        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policy_log_session ON {TABLE}(session_id, outcome);
CREATE INDEX IF NOT EXISTS idx_policy_log_tenant_ts ON {TABLE}(tenant_id, timestamp);
CREATE TRIGGER IF NOT EXISTS {TABLE}_no_update BEFORE UPDATE ON {TABLE}
BEGIN SELECT RAISE(ABORT, '{TABLE} is append-only'); END;
CREATE TRIGGER IF NOT EXISTS {TABLE}_no_delete BEFORE DELETE ON {TABLE}
BEGIN SELECT RAISE(ABORT, '{TABLE} is append-only'); END;
"""

_DDL_PG = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id              BIGSERIAL PRIMARY KEY,
    decision_id     TEXT NOT NULL UNIQUE,
    timestamp       DOUBLE PRECISION NOT NULL,
    agent_id        TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    arguments       TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    reasons         TEXT NOT NULL,
    checks          TEXT NOT NULL,
    session_id      TEXT NOT NULL DEFAULT '',
    user_id         TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    correlation_id  TEXT NOT NULL DEFAULT '',
    prev_hash       TEXT NOT NULL,
    row_hash        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policy_log_session ON {TABLE}(session_id, outcome);
CREATE INDEX IF NOT EXISTS idx_policy_log_tenant_ts ON {TABLE}(tenant_id, timestamp);
CREATE OR REPLACE FUNCTION {TABLE}_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '{TABLE} is append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS {TABLE}_no_change ON {TABLE};
CREATE TRIGGER {TABLE}_no_change BEFORE UPDATE OR DELETE ON {TABLE}
    FOR EACH ROW EXECUTE FUNCTION {TABLE}_append_only();
DROP TRIGGER IF EXISTS {TABLE}_no_truncate ON {TABLE};
CREATE TRIGGER {TABLE}_no_truncate BEFORE TRUNCATE ON {TABLE}
    FOR EACH STATEMENT EXECUTE FUNCTION {TABLE}_append_only();
"""

_MAX_ARG_CHARS = 200
_lock = threading.Lock()
_ready = False


def init_table() -> None:
    """Idempotent — safe to call on every startup."""
    global _ready
    with _db._tx() as conn:
        if _db._USE_PG:
            conn.cursor().execute(_DDL_PG)
        else:
            conn.executescript(_DDL_SQLITE)
    _ready = True


def _ensure_table() -> None:
    if not _ready:
        init_table()


def _with_table(fn: Callable[[], Any]) -> Any:
    """Run fn; if the table is missing (e.g. the database was replaced), create it and retry once."""
    _ensure_table()
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — sqlite3 and psycopg2 raise different types
        if "no such table" not in str(exc) and "does not exist" not in str(exc):
            raise
        init_table()
        return fn()


def _dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _short_arguments(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    """Arguments as the log keeps them: long strings are cut, so no prompt text is stored."""
    out: Dict[str, Any] = {}
    for key, value in arguments.items():
        if isinstance(value, str) and len(value) > _MAX_ARG_CHARS:
            value = value[:_MAX_ARG_CHARS] + f"…(+{len(value) - _MAX_ARG_CHARS} chars)"
        out[str(key)] = value
    return out


def row_hash(prev_hash: str, content: Mapping[str, Any]) -> str:
    payload = prev_hash + "|" + _dumps({k: content[k] for k in _CONTENT})
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append(*, decision_id: str, agent_id: str, tool_name: str, arguments: Mapping[str, Any],
           outcome: str, reasons: Sequence[str], checks: Mapping[str, bool], session_id: str = "",
           user_id: str = "", tenant_id: str = "", correlation_id: str = "",
           timestamp: Optional[float] = None) -> Dict[str, Any]:
    """Append one decision and return the stored row. Raises if it can't be stored."""
    content: Dict[str, Any] = {
        "decision_id": decision_id,
        "timestamp": round(time.time() if timestamp is None else timestamp, 6),
        "agent_id": agent_id,
        "tool_name": tool_name,
        "arguments": _dumps(_short_arguments(arguments)),
        "outcome": outcome,
        "reasons": _dumps(list(reasons)),
        "checks": _dumps(dict(checks)),
        "session_id": session_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "correlation_id": correlation_id,
    }
    placeholders = ", ".join(["%s" if _db._USE_PG else "?"] * len(_COLUMNS))
    sql = f"INSERT INTO {TABLE} ({', '.join(_COLUMNS)}) VALUES ({placeholders})"
    def _insert() -> Dict[str, Any]:
        # Reading the last hash and inserting must not interleave with another writer:
        # a lock for this process, and a write lock on the table for other processes.
        with _lock, _db._tx() as conn:
            if _db._USE_PG:
                conn.cursor().execute(f"LOCK TABLE {TABLE} IN SHARE ROW EXCLUSIVE MODE")
            else:
                conn.execute("BEGIN IMMEDIATE")
            last = conn.execute(f"SELECT row_hash FROM {TABLE} ORDER BY id DESC LIMIT 1").fetchone()
            prev = last[0] if last else ""
            stored = {**content, "prev_hash": prev, "row_hash": row_hash(prev, content)}
            values = tuple(stored[c] for c in _COLUMNS)
            if _db._USE_PG:
                conn.cursor().execute(sql, values)
            else:
                conn.execute(sql, values)
        return stored

    return _with_table(_insert)


def _decode(row: Mapping[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    for key in ("arguments", "reasons", "checks"):
        out[key] = json.loads(out[key])
    return out


def query(*, tenant_id: Optional[str], session_id: str = "", agent_id: str = "",
          tool_name: str = "", outcome: str = "", limit: int = 100) -> List[Dict[str, Any]]:
    """Newest rows first. tenant_id=None reads every tenant (superadmin only)."""
    clauses, params = [], []
    for column, value in (("tenant_id", tenant_id), ("session_id", session_id), ("agent_id", agent_id),
                          ("tool_name", tool_name), ("outcome", outcome)):
        if value is None or (value == "" and column != "tenant_id"):
            continue
        clauses.append(f"{column} = {'%s' if _db._USE_PG else '?'}")
        params.append(value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit = max(1, min(int(limit), 1000))
    sql = f"SELECT id, {', '.join(_COLUMNS)} FROM {TABLE} {where} ORDER BY id DESC LIMIT {limit}"

    def _select() -> List[Any]:
        with _db._tx() as conn:
            return conn.execute(sql, tuple(params)).fetchall()

    return [_decode(r) for r in _with_table(_select)]


def has_outcome(session_id: str, outcome: str, *, agent_id: str = "", tool_name: str = "") -> bool:
    """True when the session has at least one row with this outcome (any tenant)."""
    return bool(query(tenant_id=None, session_id=session_id, outcome=outcome,
                      agent_id=agent_id, tool_name=tool_name, limit=1))


def verify_chain() -> Dict[str, Any]:
    """Recompute the hash chain over every row, oldest first."""
    def _select() -> List[Any]:
        with _db._tx() as conn:
            return conn.execute(f"SELECT id, {', '.join(_COLUMNS)} FROM {TABLE} ORDER BY id").fetchall()

    rows = _with_table(_select)
    prev = ""
    for row in rows:
        r = dict(row)
        if r["prev_hash"] != prev or r["row_hash"] != row_hash(prev, r):
            return {"ok": False, "rows": len(rows), "first_bad_id": r["id"]}
        prev = r["row_hash"]
    return {"ok": True, "rows": len(rows), "first_bad_id": None}
