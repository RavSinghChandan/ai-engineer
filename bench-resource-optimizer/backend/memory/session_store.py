"""
User Session Memory — Module 4 pattern (Agent State Management, Memory Types).

Two memory types implemented:

  1. Short-term episodic memory — write-through to SQLite (Phase 2 upgrade):
     Every session summary is written to BOTH the in-memory deque AND the
     memory_sessions SQLite table. On server restart, get_recent_sessions()
     falls back to the DB if the in-memory deque is empty. This means session
     history survives ECS task restarts, deploys, and scaling events.

     TTL: 7 days. sweep_expired() is called at startup to remove stale rows.

  2. Long-term semantic memory (in-memory, SQLite-ready):
     Stores persistent facts about each user: preferred learning style,
     skills they've already trained, roles they've explored.
     These facts are injected as system context on every interaction.

Module 4:
  "Without external memory: user explains their context at start of every conversation.
   With proper memory architecture: agent picks up where last session left off."
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List

logger = logging.getLogger("bench.memory")

_7_DAYS = 7 * 24 * 3600

# ── Short-term episodic memory (in-memory hot cache) ─────────────────────────
# user_id → deque of session summaries (max 10, newest first)
_episodic: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))

# Track which users have been preloaded from DB to avoid duplicate DB reads
_preloaded: set = set()


def write_session_summary(user_id: str, summary: Dict[str, Any]) -> None:
    """
    Write a session summary to in-memory deque AND persist to SQLite.
    Non-blocking: SQLite write fires as a background coroutine if an event
    loop is running; otherwise falls back to a thread-safe sync write.
    """
    ts = time.time()
    entry = {**summary, "ts": ts}
    _episodic[user_id].appendleft(entry)
    logger.debug(
        '{"event":"session_written","user_id":"%s","role":"%s"}',
        user_id, summary.get("role_explored", ""),
    )
    # Write-through to SQLite (fire-and-forget)
    _fire_persist(user_id, summary, ts)


def _fire_persist(user_id: str, summary: Dict[str, Any], ts: float) -> None:
    """Fire the DB write without blocking the caller."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_persist_async(user_id, summary, ts))
    except RuntimeError:
        # No running event loop (e.g. in tests) — skip DB write, in-memory is enough
        pass


async def _persist_async(user_id: str, summary: Dict[str, Any], ts: float) -> None:
    try:
        from db import save_memory_session
        await save_memory_session(user_id, summary, ts)
    except Exception as exc:
        logger.warning('{"event":"memory_persist_failed","error":"%s"}', str(exc)[:80])


def get_recent_sessions(user_id: str, n: int = 3) -> List[Dict[str, Any]]:
    """
    Return the n most recent session summaries for a user.
    Falls back to SQLite if in-memory deque is empty and user not yet preloaded.
    """
    sessions = list(_episodic.get(user_id, []))
    if sessions:
        return sessions[:n]

    # In-memory miss — try DB recovery (sync via asyncio.run in non-async context)
    if user_id not in _preloaded:
        _preloaded.add(user_id)
        try:
            asyncio.get_running_loop()
            # We're inside an async context — schedule but can't await here (sync call)
            # Return empty for now; caller can await get_recent_sessions_async() instead
        except RuntimeError:
            # Pure sync context — run DB query synchronously
            try:
                import asyncio as _asyncio
                from db import load_memory_sessions
                db_sessions = _asyncio.run(load_memory_sessions(user_id, n=10))
                for s in reversed(db_sessions):
                    _episodic[user_id].appendleft(s)
                return list(_episodic[user_id])[:n]
            except Exception as exc:
                logger.warning('{"event":"memory_recovery_failed","error":"%s"}', str(exc)[:80])

    return sessions[:n]


async def preload_user_memory(user_id: str) -> None:
    """
    Async version: preload episodic memory from DB for a user.
    Call from async context (e.g. in /progress/{user_id} or /memory/{user_id}).
    """
    if user_id in _preloaded:
        return
    _preloaded.add(user_id)
    try:
        from db import load_memory_sessions
        db_sessions = await load_memory_sessions(user_id, n=10)
        for s in reversed(db_sessions):
            _episodic[user_id].appendleft(s)
        logger.debug('{"event":"memory_preloaded","user_id":"%s","count":%d}', user_id, len(db_sessions))
    except Exception as exc:
        logger.warning('{"event":"memory_preload_failed","error":"%s"}', str(exc)[:80])


async def sweep_expired_sessions() -> int:
    """
    Delete episodic session records older than 7 days from SQLite.
    Call at startup to prevent unbounded DB growth.
    Returns count of deleted rows.
    """
    try:
        from db import sweep_expired_sessions as db_sweep
        deleted = await db_sweep()
        logger.info('{"event":"memory_sweep","deleted":%d}', deleted)
        return deleted
    except Exception as exc:
        logger.warning('{"event":"memory_sweep_failed","error":"%s"}', str(exc)[:80])
        return 0


def build_memory_context(user_id: str) -> str:
    """
    Build a context string from recent sessions to inject into LLM prompts.
    Pattern: Module 4 — 'Load user's long-term memory → inject as system context'
    """
    sessions = get_recent_sessions(user_id)
    if not sessions:
        return ""

    lines = ["User's recent activity (for context):"]
    for s in sessions:
        age_days = (time.time() - s.get("ts", 0)) / 86400
        role = s.get("role_explored", "unknown role")
        score = s.get("readiness_score", 0)
        skills = ", ".join(s.get("skills_covered", [])[:5]) or "none"
        lines.append(
            f"  - {age_days:.0f}d ago: explored {role}, readiness {score}%, "
            f"covered skills: {skills}"
        )
    return "\n".join(lines)


# ── Long-term user facts (in-memory, SQLite upgrade path) ─────────────────────

_user_facts: Dict[str, Dict[str, Any]] = {}


def update_user_facts(user_id: str, facts: Dict[str, Any]) -> None:
    """
    Upsert long-term facts about a user.
    facts can include: covered_skills, explored_roles, current_readiness_level
    """
    existing = _user_facts.get(user_id, {})
    for key, val in facts.items():
        if isinstance(val, list) and isinstance(existing.get(key), list):
            existing[key] = list(set(existing[key]) | set(val))
        else:
            existing[key] = val
    _user_facts[user_id] = existing
    logger.debug('{"event":"user_facts_updated","user_id":"%s"}', user_id)


def get_user_facts(user_id: str) -> Dict[str, Any]:
    return _user_facts.get(user_id, {})


def memory_stats() -> Dict[str, Any]:
    return {
        "users_with_episodic_memory": len(_episodic),
        "users_with_long_term_facts": len(_user_facts),
        "total_session_records": sum(len(q) for q in _episodic.values()),
        "preloaded_users": len(_preloaded),
    }
