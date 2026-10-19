"""
Per-task counters: model calls, retries, permission checks, anything countable.

The agents of one task often run in worker threads (LangGraph nodes, thread
pools), where context variables don't follow. So, like the token trackers in
this codebase, counters live in one process-level, lock-protected dict that a
task resets when it starts and reads when it ends.

Limitation (stated, not hidden): two tasks running at the same moment in the
same process share these counters. Token usage already has the same limit.
"""
from __future__ import annotations

import threading
from typing import Dict

_lock = threading.Lock()
_counts: Dict[str, float] = {}


def incr(name: str, n: float = 1) -> None:
    """Add n to a named counter. Safe to call from any thread; never raises."""
    try:
        with _lock:
            _counts[name] = _counts.get(name, 0) + n
    except Exception:  # pragma: no cover - counting must never break a request
        pass


def snapshot() -> Dict[str, float]:
    with _lock:
        return dict(_counts)


def reset() -> None:
    with _lock:
        _counts.clear()
