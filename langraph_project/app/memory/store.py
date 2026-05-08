"""
Memory store — two layers:

Short-term (per-session):
  LangGraph MemorySaver checkpoint — stores the full message list keyed by
  (thread_id = session_id). The graph automatically replays and appends
  messages on every turn, giving the LLM full conversation history.

Long-term (per-user / per-account):
  In-process dict keyed by account_id. Stores persistent profile data:
  customer name, last N topics, preferences. In production replace with
  Redis or a PostgreSQL table.
"""

import logging
from typing import Optional
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger(__name__)

# Short-term: LangGraph checkpoint saver (one per application)
_checkpointer = MemorySaver()


def get_checkpointer() -> MemorySaver:
    return _checkpointer


# Long-term: user profile store
_user_profiles: dict[str, dict] = {}


def get_user_profile(account_id: str) -> dict:
    return _user_profiles.get(account_id, {})


def update_user_profile(account_id: str, updates: dict) -> None:
    profile = _user_profiles.setdefault(account_id, {})
    profile.update(updates)

    # Keep last_topics capped at 10
    if "last_topics" in updates:
        profile["last_topics"] = profile.get("last_topics", [])[-10:]

    logger.debug("Updated profile for %s: %s", account_id, profile)


def append_topic(account_id: str, topic: str) -> None:
    profile = _user_profiles.setdefault(account_id, {})
    topics = profile.get("last_topics", [])
    if topic not in topics[-3:]:     # avoid duplicate recent topics
        topics.append(topic)
    profile["last_topics"] = topics[-10:]


def get_session_turn_count(session_id: str) -> int:
    """Count how many messages exist in the checkpoint for this session."""
    try:
        snap = _checkpointer.get({"configurable": {"thread_id": session_id}})
        if snap and snap.values.get("messages"):
            msgs = snap.values["messages"]
            return sum(1 for m in msgs if getattr(m, "type", "") == "human")
    except Exception:
        pass
    return 0
