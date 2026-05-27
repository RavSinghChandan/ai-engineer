"""
Redis client — enterprise cache layer.

Pattern: connection pool (not a single socket) so concurrent FastAPI
workers share connections without blocking each other.

Usage:
    from infra.redis_client import get_redis, redis_set, redis_get, redis_delete

The client degrades gracefully: if Redis is unavailable, all operations
are no-ops and the in-memory cache takes over. This avoids hard failures
when Redis restarts or is absent in local dev.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger("bench.redis")

_redis_pool = None


def _get_pool():
    """Lazy-init a connection pool. Thread-safe via module-level singleton."""
    global _redis_pool
    if _redis_pool is not None:
        return _redis_pool

    try:
        import redis

        url = os.getenv("REDIS_URL", "redis://localhost:6379")
        _redis_pool = redis.ConnectionPool.from_url(
            url,
            max_connections=20,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        logger.info("Redis connection pool initialised: %s", url)
    except Exception as exc:
        logger.warning("Redis unavailable — cache degraded to in-memory: %s", exc)
        _redis_pool = None

    return _redis_pool


def get_redis():
    """Return a Redis client from the pool, or None if unavailable."""
    pool = _get_pool()
    if pool is None:
        return None
    try:
        import redis

        return redis.Redis(connection_pool=pool)
    except Exception as exc:
        logger.debug("Redis get_redis error: %s", exc)
        return None


def redis_set(key: str, value: Any, ttl_seconds: int = 3600) -> bool:
    """
    Serialize value to JSON and store with TTL.
    Returns True on success, False if Redis is unavailable.
    """
    client = get_redis()
    if client is None:
        return False
    try:
        client.setex(key, ttl_seconds, json.dumps(value))
        return True
    except Exception as exc:
        logger.debug("redis_set error key=%s: %s", key, exc)
        return False


def redis_get(key: str) -> Optional[Any]:
    """
    Fetch and deserialize a value from Redis.
    Returns None if key missing or Redis unavailable.
    """
    client = get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.debug("redis_get error key=%s: %s", key, exc)
        return None


def redis_delete(key: str) -> bool:
    """Delete a key. Returns True if deleted, False otherwise."""
    client = get_redis()
    if client is None:
        return False
    try:
        return bool(client.delete(key))
    except Exception as exc:
        logger.debug("redis_delete error key=%s: %s", key, exc)
        return False


def redis_ping() -> bool:
    """Health check — returns True if Redis responds to PING."""
    client = get_redis()
    if client is None:
        return False
    try:
        return client.ping()
    except Exception:
        return False


def reset_pool():
    """Force pool re-creation (used in tests)."""
    global _redis_pool
    _redis_pool = None
