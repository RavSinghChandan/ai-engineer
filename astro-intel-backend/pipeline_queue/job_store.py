"""
Kafka Job Store — Enterprise Grade
=====================================
In-memory job lifecycle tracker with Redis persistence fallback.

Lifecycle: queued → processing → done | failed

Redis persistence (when REDIS_ENABLED=true):
  All state transitions are written through to Redis DB 1.
  On startup, in-memory store is warm — Redis is used for durability only.
  This means jobs survive API restarts when Redis is available.

In-memory store is always the read path (fast), Redis is the write-through
durability layer. No Redis round-trip on every get — only on state transitions.
"""
from __future__ import annotations
import time
import uuid
from typing import Any, Optional
from collections import deque

_jobs: dict[str, dict] = {}
_completed: deque[str] = deque(maxlen=500)

JOB_TTL_SECONDS = 3600


def _persist(job_id: str) -> None:
    """Write current job state to Redis (fire-and-forget, never raises)."""
    try:
        from cache.redis_store import job_redis_set
        job = _jobs.get(job_id)
        if job:
            job_redis_set(job_id, job)
    except Exception:
        pass


def _restore_from_redis(job_id: str) -> Optional[dict]:
    """Try to recover a job from Redis if not in memory (e.g., after restart)."""
    try:
        from cache.redis_store import job_redis_get
        return job_redis_get(job_id)
    except Exception:
        return None


def create_job(payload: dict[str, Any]) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "job_id":     job_id,
        "status":     "queued",
        "payload":    payload,
        "created_at": time.time(),
        "updated_at": time.time(),
        "result":     None,
        "error":      None,
        "retry_count": 0,
    }
    _persist(job_id)
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    job = _jobs.get(job_id)
    if job is None:
        # Try Redis recovery (e.g., job was created before this instance started)
        job = _restore_from_redis(job_id)
        if job:
            _jobs[job_id] = job
    if job is None:
        return None
    if job["status"] in ("done", "failed"):
        age = time.time() - job["updated_at"]
        if age > JOB_TTL_SECONDS:
            del _jobs[job_id]
            return None
    return job


def mark_processing(job_id: str) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"]     = "processing"
        _jobs[job_id]["updated_at"] = time.time()
        _persist(job_id)


def mark_done(job_id: str, result: dict[str, Any]) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"]     = "done"
        _jobs[job_id]["result"]     = result
        _jobs[job_id]["updated_at"] = time.time()
        _completed.append(job_id)
        _persist(job_id)


def mark_failed(job_id: str, error: str) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"]     = "failed"
        _jobs[job_id]["error"]      = error
        _jobs[job_id]["updated_at"] = time.time()
        _completed.append(job_id)
        _persist(job_id)


def increment_retry(job_id: str) -> int:
    """Increment retry counter. Returns new count."""
    if job_id in _jobs:
        count = _jobs[job_id].get("retry_count", 0) + 1
        _jobs[job_id]["retry_count"] = count
        _jobs[job_id]["updated_at"]  = time.time()
        _persist(job_id)
        return count
    return 0


def active_count() -> int:
    return sum(1 for j in _jobs.values() if j["status"] in ("queued", "processing"))


def stats() -> dict:
    jobs = list(_jobs.values())
    return {
        "total":      len(jobs),
        "queued":     sum(1 for j in jobs if j["status"] == "queued"),
        "processing": sum(1 for j in jobs if j["status"] == "processing"),
        "done":       sum(1 for j in jobs if j["status"] == "done"),
        "failed":     sum(1 for j in jobs if j["status"] == "failed"),
    }
