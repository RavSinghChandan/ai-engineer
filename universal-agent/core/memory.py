"""Session memory — per-user, auto-expiring conversation history."""
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from .config_loader import MemoryConfig


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


class MemoryStore:
    """In-process session store. Replace with Redis adapter for multi-instance deployments."""

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
        # Trim to max_history (each turn = 2 messages)
        max_msgs = self._cfg.max_history * 2
        while len(session.messages) > max_msgs:
            session.messages.popleft()

    def get_history(self, session_id: str) -> list[BaseMessage]:
        session = self.get_or_create(session_id)
        return session.as_list()

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
