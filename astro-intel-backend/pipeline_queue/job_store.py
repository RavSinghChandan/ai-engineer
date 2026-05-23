"""
Kafka Job Store (Phase 7)
==========================
In-memory job status tracker for async pipeline jobs submitted via Kafka.

Each job has a lifecycle:
  queued → processing → done | failed

This store is the bridge between:
  - POST /api/v1/analysis/submit  (producer — creates job, publishes to Kafka)
  - GET  /api/v1/analysis/job/{id} (consumer — polls job status + result)

Storage: in-memory dict (same process).
For multi-instance deployments, swap this for Redis-backed job store
(redis_store.redis_get/set with "job::" prefix).
"""
from __future__ import annotations
import time
import uuid
from typing import Any, Optional
from collections import deque

# job_id → job dict
_jobs: dict[str, dict] = {}

# Keep last 500 completed jobs (FIFO eviction)
_completed: deque[str] = deque(maxlen=500)

JOB_TTL_SECONDS = 3600  # 1 hour — completed jobs expire after this


def create_job(payload: dict[str, Any]) -> str:
    """Create a new job record. Returns job_id."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "job_id":     job_id,
        "status":     "queued",
        "payload":    payload,
        "created_at": time.time(),
        "updated_at": time.time(),
        "result":     None,
        "error":      None,
    }
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    """Return job dict or None if not found / expired."""
    job = _jobs.get(job_id)
    if job is None:
        return None
    # Lazy expiry for completed/failed jobs
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


def mark_done(job_id: str, result: dict[str, Any]) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"]     = "done"
        _jobs[job_id]["result"]     = result
        _jobs[job_id]["updated_at"] = time.time()
        _completed.append(job_id)


def mark_failed(job_id: str, error: str) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"]     = "failed"
        _jobs[job_id]["error"]      = error
        _jobs[job_id]["updated_at"] = time.time()
        _completed.append(job_id)


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
