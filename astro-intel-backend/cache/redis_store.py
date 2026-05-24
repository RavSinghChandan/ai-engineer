"""
Redis Distributed Cache — Enterprise Grade
============================================
Connection pool, health checks, pub/sub invalidation, pipeline batching.

Design:
  DB 0 — response cache (L2 behind in-memory L1)
  DB 1 — job store persistence (see pipeline_queue/job_store.py)

All functions degrade silently when Redis is unavailable — app never breaks.

Environment variables:
  REDIS_ENABLED              — true / false (default: false)
  REDIS_URL                  — redis://localhost:6379/0  (DB 0, cache)
  REDIS_JOB_URL              — redis://localhost:6379/1  (DB 1, jobs)
  REDIS_PASSWORD             — optional auth password
  REDIS_POOL_MIN             — min connections in pool (default: 2)
  REDIS_POOL_MAX             — max connections in pool (default: 20)
  REDIS_SOCKET_TIMEOUT       — per-op timeout seconds (default: 3)
  REDIS_SOCKET_CONNECT_TIMEOUT — connect timeout seconds (default: 2)

Pub/Sub channel:
  "astrointel:cache:invalidate" — broadcast cache key invalidation to all
  instances so L1 (in-memory) is also cleared cluster-wide.
"""
from __future__ import annotations
import json
import os
import threading
import time
from typing import Any, Callable, Optional

REDIS_ENABLED   = os.getenv("REDIS_ENABLED",   "false").lower() == "true"
REDIS_URL       = os.getenv("REDIS_URL",       "redis://localhost:6379/0")
REDIS_JOB_URL   = os.getenv("REDIS_JOB_URL",   "redis://localhost:6379/1")
REDIS_PASSWORD  = os.getenv("REDIS_PASSWORD",  None)
REDIS_POOL_MIN  = int(os.getenv("REDIS_POOL_MIN",  "2"))
REDIS_POOL_MAX  = int(os.getenv("REDIS_POOL_MAX",  "20"))
REDIS_SOCK_TO   = int(os.getenv("REDIS_SOCKET_TIMEOUT",         "3"))
REDIS_CONN_TO   = int(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", "2"))

INVALIDATE_CHANNEL = "astrointel:cache:invalidate"

# Lazy-loaded connection pool clients
_cache_client = None   # DB 0 — response cache
_job_client   = None   # DB 1 — job store
_pool_lock    = threading.Lock()

# Pub/sub invalidation callbacks registered by consumers
_invalidate_callbacks: list[Callable[[str], None]] = []
_pubsub_thread: threading.Thread | None = None


# ── Connection pool factory ───────────────────────────────────────────────────

def _make_client(url: str):
    """Create a Redis client with a connection pool. Returns None on failure."""
    try:
        import redis
        pool = redis.ConnectionPool.from_url(
            url,
            password=REDIS_PASSWORD,
            decode_responses=True,
            max_connections=REDIS_POOL_MAX,
            socket_timeout=REDIS_SOCK_TO,
            socket_connect_timeout=REDIS_CONN_TO,
            health_check_interval=30,
        )
        client = redis.Redis(connection_pool=pool)
        client.ping()
        return client
    except Exception:
        return None


def _get_cache_client():
    global _cache_client
    if _cache_client is not None:
        return _cache_client
    if not REDIS_ENABLED:
        return None
    with _pool_lock:
        if _cache_client is None:
            _cache_client = _make_client(REDIS_URL)
    return _cache_client


def _get_job_client():
    global _job_client
    if _job_client is not None:
        return _job_client
    if not REDIS_ENABLED:
        return None
    with _pool_lock:
        if _job_client is None:
            _job_client = _make_client(REDIS_JOB_URL)
    return _job_client


def _reset_cache_client():
    """Force reconnect on next call — called after connection errors."""
    global _cache_client
    _cache_client = None


def _reset_job_client():
    global _job_client
    _job_client = None


# ── Cache operations (DB 0) ───────────────────────────────────────────────────

def redis_get(key: str) -> Optional[Any]:
    """Fetch from cache. Returns deserialized value or None."""
    if not REDIS_ENABLED:
        return None
    try:
        client = _get_cache_client()
        if client is None:
            return None
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        _reset_cache_client()
        return None


def redis_set(key: str, payload: Any, ttl: int) -> bool:
    """Store in cache with TTL. Returns True on success."""
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_cache_client()
        if client is None:
            return False
        client.setex(key, ttl, json.dumps(payload, default=str))
        return True
    except Exception:
        _reset_cache_client()
        return False


def redis_mget(keys: list[str]) -> dict[str, Any]:
    """Batch get multiple keys. Returns dict of key → value for hits only."""
    if not REDIS_ENABLED or not keys:
        return {}
    try:
        client = _get_cache_client()
        if client is None:
            return {}
        values = client.mget(keys)
        result = {}
        for k, v in zip(keys, values):
            if v is not None:
                try:
                    result[k] = json.loads(v)
                except Exception:
                    pass
        return result
    except Exception:
        _reset_cache_client()
        return {}


def redis_pipeline_set(items: list[tuple[str, Any, int]]) -> int:
    """
    Batch set via Redis pipeline for efficiency.
    items: list of (key, payload, ttl_seconds)
    Returns number of items successfully written.
    """
    if not REDIS_ENABLED or not items:
        return 0
    try:
        client = _get_cache_client()
        if client is None:
            return 0
        pipe = client.pipeline(transaction=False)
        for key, payload, ttl in items:
            pipe.setex(key, ttl, json.dumps(payload, default=str))
        results = pipe.execute()
        return sum(1 for r in results if r)
    except Exception:
        _reset_cache_client()
        return 0


def redis_delete(key: str) -> bool:
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_cache_client()
        if client is None:
            return False
        deleted = bool(client.delete(key))
        if deleted:
            _publish_invalidation(key)
        return deleted
    except Exception:
        _reset_cache_client()
        return False


def redis_flush_prefix(prefix: str) -> int:
    if not REDIS_ENABLED:
        return 0
    try:
        client = _get_cache_client()
        if client is None:
            return 0
        keys = client.keys(f"{prefix}*")
        if not keys:
            return 0
        count = client.delete(*keys)
        for k in keys:
            _publish_invalidation(k)
        return count
    except Exception:
        _reset_cache_client()
        return 0


def redis_stats() -> dict:
    if not REDIS_ENABLED:
        return {"enabled": False, "status": "disabled"}
    try:
        client = _get_cache_client()
        if client is None:
            return {"enabled": True, "status": "unreachable", "url": REDIS_URL}
        srv   = client.info("server")
        ksp   = client.info("keyspace")
        stats = client.info("stats")
        pool_info = client.connection_pool.connection_kwargs if hasattr(client, "connection_pool") else {}
        return {
            "enabled":           True,
            "status":            "connected",
            "url":               REDIS_URL,
            "redis_version":     srv.get("redis_version", "unknown"),
            "used_memory_mb":    round(int(srv.get("used_memory", 0)) / 1024 / 1024, 2),
            "total_keys":        sum(v.get("keys", 0) for v in ksp.values() if isinstance(v, dict)),
            "hits":              stats.get("keyspace_hits", 0),
            "misses":            stats.get("keyspace_misses", 0),
            "evicted_keys":      stats.get("evicted_keys", 0),
            "pool_max":          REDIS_POOL_MAX,
        }
    except Exception as e:
        _reset_cache_client()
        return {"enabled": True, "status": "error", "error": str(e)}


# ── Job store operations (DB 1) ───────────────────────────────────────────────

JOB_KEY_PREFIX = "job:"
JOB_TTL_SECS   = 3600  # 1 hour


def job_redis_set(job_id: str, job_dict: dict) -> bool:
    """Persist a job record to Redis DB 1."""
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_job_client()
        if client is None:
            return False
        age = time.time() - job_dict.get("created_at", time.time())
        ttl = max(60, int(JOB_TTL_SECS - age))
        client.setex(f"{JOB_KEY_PREFIX}{job_id}", ttl,
                     json.dumps(job_dict, default=str))
        return True
    except Exception:
        _reset_job_client()
        return False


def job_redis_get(job_id: str) -> Optional[dict]:
    """Fetch a job record from Redis DB 1."""
    if not REDIS_ENABLED:
        return None
    try:
        client = _get_job_client()
        if client is None:
            return None
        raw = client.get(f"{JOB_KEY_PREFIX}{job_id}")
        return json.loads(raw) if raw else None
    except Exception:
        _reset_job_client()
        return None


def job_redis_delete(job_id: str) -> bool:
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_job_client()
        if client is None:
            return False
        return bool(client.delete(f"{JOB_KEY_PREFIX}{job_id}"))
    except Exception:
        _reset_job_client()
        return False


def job_redis_stats() -> dict:
    """Stats for the job DB (DB 1)."""
    if not REDIS_ENABLED:
        return {"enabled": False, "status": "disabled"}
    try:
        client = _get_job_client()
        if client is None:
            return {"enabled": True, "status": "unreachable"}
        ksp = client.info("keyspace")
        db1 = ksp.get("db1", {})
        return {
            "enabled":    True,
            "status":     "connected",
            "total_jobs": db1.get("keys", 0) if isinstance(db1, dict) else 0,
        }
    except Exception:
        _reset_job_client()
        return {"enabled": True, "status": "error"}


# ── Pub/Sub invalidation ──────────────────────────────────────────────────────

def _publish_invalidation(key: str) -> None:
    """Publish cache key to invalidation channel so all instances clear L1."""
    try:
        client = _get_cache_client()
        if client:
            client.publish(INVALIDATE_CHANNEL, key)
    except Exception:
        pass


def register_invalidation_callback(fn: Callable[[str], None]) -> None:
    """Register a function to be called when a cache key is invalidated remotely."""
    _invalidate_callbacks.append(fn)
    _ensure_pubsub_listener()


def _ensure_pubsub_listener() -> None:
    global _pubsub_thread
    if _pubsub_thread and _pubsub_thread.is_alive():
        return
    if not REDIS_ENABLED:
        return
    _pubsub_thread = threading.Thread(
        target=_pubsub_loop,
        daemon=True,
        name="redis-pubsub-invalidate",
    )
    _pubsub_thread.start()


def _pubsub_loop() -> None:
    """Background thread: subscribe to invalidation channel and call callbacks."""
    try:
        import redis as redis_lib
        client = redis_lib.Redis.from_url(
            REDIS_URL,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_timeout=REDIS_SOCK_TO,
            socket_connect_timeout=REDIS_CONN_TO,
        )
        pubsub = client.pubsub()
        pubsub.subscribe(INVALIDATE_CHANNEL)
        for message in pubsub.listen():
            if message and message["type"] == "message":
                key = message.get("data", "")
                for cb in _invalidate_callbacks:
                    try:
                        cb(key)
                    except Exception:
                        pass
    except Exception:
        pass
