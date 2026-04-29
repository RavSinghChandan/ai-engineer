"""
In-process shared memory store (RAG simulation).
Keyed by session_id → module → agent_type → payload.
Thread-safe via asyncio lock per session.
"""
from __future__ import annotations
import asyncio
from typing import Any, Dict, Optional
from datetime import datetime, timezone

_store: Dict[str, Dict[str, Any]] = {}
_locks: Dict[str, asyncio.Lock] = {}


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _locks:
        _locks[session_id] = asyncio.Lock()
    return _locks[session_id]


async def write(session_id: str, module: str, agent: str, data: Any) -> None:
    lock = _get_lock(session_id)
    async with lock:
        _store.setdefault(session_id, {}).setdefault(module, {})[agent] = data


async def read(session_id: str, module: str, agent: Optional[str] = None) -> Any:
    lock = _get_lock(session_id)
    async with lock:
        sess = _store.get(session_id, {})
        if agent:
            return sess.get(module, {}).get(agent)
        return sess.get(module, {})


async def read_all(session_id: str) -> Dict[str, Any]:
    lock = _get_lock(session_id)
    async with lock:
        import copy
        return copy.deepcopy(_store.get(session_id, {}))


async def write_meta(session_id: str, key: str, data: Any) -> None:
    await write(session_id, "__meta__", key, data)


async def read_meta(session_id: str, key: str) -> Any:
    return await read(session_id, "__meta__", key)


def clear(session_id: str) -> None:
    _store.pop(session_id, None)
    _locks.pop(session_id, None)


def memory_keys(session_id: str) -> Dict[str, list]:
    sess = _store.get(session_id, {})
    return {mod: list(agents.keys()) for mod, agents in sess.items() if not mod.startswith("__")}
