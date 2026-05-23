"""
SSE Event Bus (Phase 5)
========================
Lightweight in-process pub/sub for pipeline progress events.
Each session gets its own asyncio.Queue so the SSE endpoint can
stream events to the frontend in real time.

Usage:
  # Producer (pipeline wrapper):
  from utils.event_bus import emit
  emit(session_id, "node_start", {"node": "question_agent"})

  # Consumer (SSE endpoint):
  from utils.event_bus import subscribe, unsubscribe
  q = subscribe(session_id)
  try:
      event = await asyncio.wait_for(q.get(), timeout=30)
  finally:
      unsubscribe(session_id)

Event envelope:
  { "event": "<type>", "data": { ... }, "ts": <unix_float> }

Event types emitted by the pipeline wrapper:
  pipeline_start    — pipeline begins
  node_start        — a LangGraph node is about to run
  node_done         — a LangGraph node completed
  pipeline_done     — pipeline finished successfully
  pipeline_error    — pipeline raised an exception
"""
from __future__ import annotations
import asyncio
import time
from typing import Any

# session_id → asyncio.Queue
_queues: dict[str, asyncio.Queue] = {}

MAX_QUEUE_SIZE = 100  # prevent unbounded memory if consumer is slow


def subscribe(session_id: str) -> asyncio.Queue:
    """Create (or return existing) queue for session_id."""
    if session_id not in _queues:
        _queues[session_id] = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
    return _queues[session_id]


def unsubscribe(session_id: str) -> None:
    """Remove queue when SSE connection closes."""
    _queues.pop(session_id, None)


def emit(session_id: str, event_type: str, data: dict[str, Any] | None = None) -> None:
    """
    Put an event onto the session queue.
    Safe to call from a thread (pipeline runs in executor) — uses put_nowait
    and drops silently if the queue is full or the consumer has disconnected.
    """
    q = _queues.get(session_id)
    if q is None:
        return
    envelope = {
        "event": event_type,
        "data":  data or {},
        "ts":    time.time(),
    }
    try:
        q.put_nowait(envelope)
    except asyncio.QueueFull:
        pass  # consumer too slow — drop oldest via non-blocking discard
    except Exception:
        pass


def active_sessions() -> list[str]:
    """Return list of session IDs with active SSE queues."""
    return list(_queues.keys())
