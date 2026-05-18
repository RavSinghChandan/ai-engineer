"""
Persistent session store — survives server restarts.

Replaces the in-memory _sessions dict in routers/analysis.py.

Strategy:
  - Write-through: every session write goes to both in-memory dict AND database.
  - Read: check memory first (fast path), fall back to database on miss (covers restart).
  - TTL: sessions expire after 24 hours (enough for admin review workflows).
  - Expired sessions are cleaned up lazily on read + a sweep on startup.

Works with both SQLite (local) and PostgreSQL (cloud) via database.py.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional

import database as _db

log = logging.getLogger("session_store")

_SESSION_TTL = 24 * 60 * 60   # 24 hours in seconds
_PH = "%s" if _db._USE_PG else "?"  # SQL placeholder

# In-memory hot cache — avoids DB round-trip on same-process reads
_mem: Dict[str, Dict[str, Any]] = {}


# ── Write ─────────────────────────────────────────────────────────────────────

def save(session_id: str, state: Dict[str, Any], tenant_id: str = "") -> None:
    """Write session to memory + database. Called after every pipeline run."""
    _mem[session_id] = state
    now = time.time()
    expires_at = now + _SESSION_TTL
    try:
        state_json = json.dumps(state, default=str)
    except Exception as exc:
        log.warning("[SessionStore] Could not serialise state for %s: %s", session_id, exc)
        return

    try:
        with _db._tx() as conn:
            if _db._USE_PG:
                conn.cursor().execute(
                    f"""
                    INSERT INTO sessions (session_id, tenant_id, state_json, created_at, updated_at, expires_at)
                    VALUES ({_PH},{_PH},{_PH},{_PH},{_PH},{_PH})
                    ON CONFLICT (session_id) DO UPDATE
                      SET state_json = EXCLUDED.state_json,
                          updated_at = EXCLUDED.updated_at,
                          expires_at = EXCLUDED.expires_at
                    """,
                    (session_id, tenant_id, state_json, now, now, expires_at),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO sessions (session_id, tenant_id, state_json, created_at, updated_at, expires_at)
                    VALUES (?,?,?,?,?,?)
                    ON CONFLICT(session_id) DO UPDATE
                      SET state_json = excluded.state_json,
                          updated_at = excluded.updated_at,
                          expires_at = excluded.expires_at
                    """,
                    (session_id, tenant_id, state_json, now, now, expires_at),
                )
    except Exception as exc:
        log.error("[SessionStore] DB write failed for %s: %s", session_id, exc)


def update(session_id: str, key: str, value: Any, tenant_id: str = "") -> None:
    """Update a single top-level key in an existing session (e.g. final_report)."""
    state = get(session_id)
    if state is None:
        log.warning("[SessionStore] update() called on unknown session %s", session_id)
        return
    state[key] = value
    save(session_id, state, tenant_id=tenant_id)


# ── Read ──────────────────────────────────────────────────────────────────────

def get(session_id: str) -> Optional[Dict[str, Any]]:
    """Return session state or None. Checks memory first, then DB."""
    # Hot path — same process
    if session_id in _mem:
        return _mem[session_id]

    # Cold path — DB (after restart or multi-worker)
    try:
        with _db._tx() as conn:
            now = time.time()
            if _db._USE_PG:
                cur = conn.cursor()
                cur.execute(
                    f"SELECT state_json FROM sessions WHERE session_id = {_PH} AND expires_at > {_PH}",
                    (session_id, now),
                )
                row = cur.fetchone()
            else:
                cur = conn.execute(
                    "SELECT state_json FROM sessions WHERE session_id = ? AND expires_at > ?",
                    (session_id, now),
                )
                row = cur.fetchone()

        if row:
            state = json.loads(row[0])
            _mem[session_id] = state   # warm up memory cache
            return state
    except Exception as exc:
        log.error("[SessionStore] DB read failed for %s: %s", session_id, exc)

    return None


# ── Cleanup ───────────────────────────────────────────────────────────────────

def sweep_expired() -> int:
    """Delete expired sessions from DB. Called on startup. Returns count deleted."""
    try:
        with _db._tx() as conn:
            now = time.time()
            if _db._USE_PG:
                cur = conn.cursor()
                cur.execute(f"DELETE FROM sessions WHERE expires_at <= {_PH}", (now,))
                deleted = cur.rowcount
            else:
                cur = conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
                deleted = cur.rowcount
        # Also clear memory entries for expired sessions
        _mem.clear()
        log.info("[SessionStore] Swept %d expired session(s)", deleted)
        return deleted
    except Exception as exc:
        log.error("[SessionStore] Sweep failed: %s", exc)
        return 0
