"""
Session memory — per-user, auto-expiring conversation history.

MemoryBackend protocol allows swapping storage without touching agent logic:
  - InProcessMemoryBackend  (default — dev/single-instance)
  - RedisMemoryBackend      (production multi-instance)
  - PostgresMemoryBackend   (persistent, queryable history)
"""
import json
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Optional, Union

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from .config_loader import MemoryConfig


# ── Serialization helpers ──────────────────────────────────────────────────────

def _serialize_message(msg: BaseMessage) -> str:
    return json.dumps({"type": msg.__class__.__name__, "content": msg.content})


def _deserialize_message(raw: Union[str, bytes]) -> BaseMessage:
    data = json.loads(raw)
    if data["type"] == "HumanMessage":
        return HumanMessage(content=data["content"])
    return AIMessage(content=data["content"])


# ── Session data class (used by InProcess backend) ─────────────────────────────

@dataclass
class SessionMemory:
    session_id: str
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    messages: Deque[BaseMessage] = field(default_factory=deque)

    def touch(self) -> None:
        self.last_active = time.time()

    def add_human(self, text: str) -> None:
        self.messages.append(HumanMessage(content=text))
        self.touch()

    def add_ai(self, text: str) -> None:
        self.messages.append(AIMessage(content=text))
        self.touch()

    def as_list(self) -> list[BaseMessage]:
        return list(self.messages)

    def is_expired(self, ttl_seconds: int) -> bool:
        return (time.time() - self.last_active) > ttl_seconds


# ── InProcess backend (original behavior — zero change) ───────────────────────

class InProcessMemoryBackend:
    """In-process session store. Use for dev or single-instance deployments."""

    def __init__(self, cfg: MemoryConfig):
        self._cfg = cfg
        self._sessions: dict[str, SessionMemory] = {}

    def get_or_create(self, session_id: str) -> SessionMemory:
        self._evict_expired()
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionMemory(session_id=session_id)
        return self._sessions[session_id]

    def append_turn(self, session_id: str, human: str, ai: str) -> None:
        session = self.get_or_create(session_id)
        session.add_human(human)
        session.add_ai(ai)
        max_msgs = self._cfg.max_history * 2
        while len(session.messages) > max_msgs:
            session.messages.popleft()

    def get_history(self, session_id: str) -> list[BaseMessage]:
        return self.get_or_create(session_id).as_list()

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _evict_expired(self) -> None:
        ttl = self._cfg.session_ttl_seconds
        expired = [sid for sid, s in self._sessions.items() if s.is_expired(ttl)]
        for sid in expired:
            del self._sessions[sid]

    @property
    def active_sessions(self) -> int:
        return len(self._sessions)


# ── Redis backend (multi-instance production) ─────────────────────────────────

class RedisMemoryBackend:
    """
    Redis-backed session store. Supports multi-instance deployments.
    Requires: pip install redis
    Config: memory.redis_url_env (env var name holding the Redis URL)
    """

    def __init__(self, cfg: MemoryConfig):
        self._cfg = cfg
        try:
            import redis as redis_lib
            redis_url = os.environ.get(getattr(cfg, "redis_url_env", "REDIS_URL"), "redis://localhost:6379")
            self._r = redis_lib.from_url(redis_url, decode_responses=True)
        except ImportError:
            raise ImportError("Redis backend requires: pip install redis")

    def get_history(self, session_id: str) -> list[BaseMessage]:
        key = f"agent:session:{session_id}:messages"
        raw_list = self._r.lrange(key, 0, -1)
        return [_deserialize_message(raw) for raw in raw_list]

    def append_turn(self, session_id: str, human: str, ai: str) -> None:
        key = f"agent:session:{session_id}:messages"
        pipe = self._r.pipeline()
        pipe.rpush(key, _serialize_message(HumanMessage(content=human)))
        pipe.rpush(key, _serialize_message(AIMessage(content=ai)))
        max_msgs = self._cfg.max_history * 2
        pipe.ltrim(key, -max_msgs, -1)
        pipe.expire(key, self._cfg.session_ttl_seconds)
        pipe.execute()

    def clear(self, session_id: str) -> None:
        self._r.delete(f"agent:session:{session_id}:messages")

    @property
    def active_sessions(self) -> int:
        return len(self._r.keys("agent:session:*:messages"))


# ── Factory ────────────────────────────────────────────────────────────────────

# Keep MemoryStore as an alias so existing code that imports it still works
MemoryStore = InProcessMemoryBackend


def build_memory(cfg: MemoryConfig) -> Union[InProcessMemoryBackend, RedisMemoryBackend]:
    """
    Factory: returns the right memory backend based on config.
    Defaults to InProcess — zero breaking change for existing deployments.
    """
    backend = getattr(cfg, "backend", "in_process")
    if backend == "redis":
        return RedisMemoryBackend(cfg)
    return InProcessMemoryBackend(cfg)
