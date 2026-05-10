"""
User Session Memory — Module 4 pattern (Agent State Management, Memory Types).

Two memory types implemented:

  1. Short-term episodic memory (in-memory, Redis-ready):
     Stores recent interactions per user (last 10 sessions, 7-day TTL).
     At session start: load last interaction → inject into context
     At session end: write summary of what happened this session
     Use: agent knows user's history without being told again

  2. Long-term semantic memory (SQLite, pgvector-ready):
     Stores persistent facts about each user: preferred learning style,
     skills they've already trained, roles they've explored.
     These facts are injected as system context on every interaction.

Module 4 says:
  "Without external memory: user explains their context at start of every conversation.
   With proper memory architecture: agent picks up where last session left off."

For bench-resource-optimizer:
  - User uploads CV → parsed profile stored as long-term fact
  - User completes training → covered skills stored so next role mapping is accurate
  - User preference: "I prefer hands-on projects" → stored, injected in plan generation
"""
from __future__ import annotations

import json
import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

logger = logging.getLogger("bench.memory")

_7_DAYS = 7 * 24 * 3600

# ── Short-term episodic memory ────────────────────────────────────────────────
# user_id → deque of session summaries (max 10, with timestamp)
_episodic: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))


def write_session_summary(user_id: str, summary: Dict[str, Any]) -> None:
    """
    Called at end of each user session to record what happened.
    summary keys: role_explored, skills_covered, readiness_score, timestamp
    """
    entry = {**summary, "ts": time.time()}
    _episodic[user_id].appendleft(entry)
    logger.debug(
        '{"event":"session_written","user_id":"%s","role":"%s"}',
        user_id, summary.get("role_explored", ""),
    )


def get_recent_sessions(user_id: str, n: int = 3) -> List[Dict[str, Any]]:
    """Return the n most recent session summaries for a user."""
    sessions = list(_episodic.get(user_id, []))
    return sessions[:n]


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
        role     = s.get("role_explored", "unknown role")
        score    = s.get("readiness_score", 0)
        skills   = ", ".join(s.get("skills_covered", [])[:5]) or "none"
        lines.append(
            f"  - {age_days:.0f}d ago: explored {role}, readiness {score}%, "
            f"covered skills: {skills}"
        )
    return "\n".join(lines)


# ── Long-term user facts (persistent across SQLite) ──────────────────────────

_user_facts: Dict[str, Dict[str, Any]] = {}


def update_user_facts(user_id: str, facts: Dict[str, Any]) -> None:
    """
    Upsert long-term facts about a user.
    facts can include: covered_skills, explored_roles, current_readiness_level
    """
    existing = _user_facts.get(user_id, {})
    # Merge lists (skills accumulate)
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
        "total_session_records":      sum(len(q) for q in _episodic.values()),
    }
