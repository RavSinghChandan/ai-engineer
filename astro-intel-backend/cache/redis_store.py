"""
Redis Distributed Cache (Phase 6)
====================================
Drop-in companion to cache/store.py for multi-instance deployments.

Design principle — ZERO impact on existing code:
  - cache/store.py (in-memory dict) is NEVER modified
  - This module adds Redis as an optional second layer
  - All functions degrade silently when Redis is unavailable
  - The existing /run endpoint keeps using cache/store.py as-is
  - Redis is consulted ONLY when REDIS_ENABLED=true

When to enable:
  Single EC2 instance   → REDIS_ENABLED=false (default) — in-memory is fine
  2+ EC2 instances      → REDIS_ENABLED=true — share cache across instances
  Local dev             → REDIS_ENABLED=false — no Redis install needed

Environment variables:
  REDIS_ENABLED   — true / false (default: false)
  REDIS_URL       — redis://localhost:6379/0  (default)
  REDIS_PASSWORD  — optional password
  REDIS_TTL_SECS  — default TTL override (default: uses caller's TTL)

Wire-up (in routers/analysis.py):
  from cache.redis_store import redis_get, redis_set
  # Check Redis BEFORE in-memory cache, set AFTER pipeline completes.
  # In-memory cache is still set for same-instance fast path.
"""
from __future__ import annotations
import json
import os
from typing import Any, Optional

REDIS_ENABLED  = os.getenv("REDIS_ENABLED",  "false").lower() == "true"
REDIS_URL      = os.getenv("REDIS_URL",      "redis://localhost:6379/0")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

_client = None   # lazy-loaded redis.Redis instance


def _get_client():
    """Return Redis client, lazy-loaded. Returns None if Redis unavailable."""
    global _client
    if _client is not None:
        return _client
    if not REDIS_ENABLED:
        return None
    try:
        import redis
        _client = redis.Redis.from_url(
            REDIS_URL,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        _client.ping()   # fail fast if unreachable
        return _client
    except Exception:
        _client = None
        return None


def redis_get(key: str) -> Optional[Any]:
    """
    Fetch a cached payload from Redis by key.
    Returns deserialized dict/list or None on miss / error / disabled.
    """
    if not REDIS_ENABLED:
        return None
    try:
        client = _get_client()
        if client is None:
            return None
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def redis_set(key: str, payload: Any, ttl: int) -> bool:
    """
    Store a payload in Redis with TTL seconds.
    Returns True on success, False on error / disabled.
    Payload is JSON-serialised — must be JSON-compatible.
    """
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_client()
        if client is None:
            return False
        raw = json.dumps(payload, default=str)
        client.setex(key, ttl, raw)
        return True
    except Exception:
        return False


def redis_delete(key: str) -> bool:
    """Delete a key from Redis. Returns True if key existed."""
    if not REDIS_ENABLED:
        return False
    try:
        client = _get_client()
        if client is None:
            return False
        return bool(client.delete(key))
    except Exception:
        return False


def redis_flush_prefix(prefix: str) -> int:
    """Delete all keys matching prefix*. Returns count deleted."""
    if not REDIS_ENABLED:
        return 0
    try:
        client = _get_client()
        if client is None:
            return 0
        keys = client.keys(f"{prefix}*")
        if keys:
            return client.delete(*keys)
        return 0
    except Exception:
        return 0


def redis_stats() -> dict:
    """Return Redis connection status and basic stats for metrics dashboard."""
    if not REDIS_ENABLED:
        return {"enabled": False, "status": "disabled"}
    try:
        client = _get_client()
        if client is None:
            return {"enabled": True, "status": "unreachable", "url": REDIS_URL}
        info = client.info("server")
        db_info = client.info("keyspace")
        return {
            "enabled":        True,
            "status":         "connected",
            "url":            REDIS_URL,
            "redis_version":  info.get("redis_version", "unknown"),
            "used_memory_mb": round(int(info.get("used_memory", 0)) / 1024 / 1024, 2),
            "total_keys":     sum(
                v.get("keys", 0) for v in db_info.values()
                if isinstance(v, dict)
            ),
        }
    except Exception as e:
        return {"enabled": True, "status": "error", "error": str(e)}
