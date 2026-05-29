"""
Semantic Cache — Module 5 pattern (RAG at Scale — Latency Budget, Caching).

Two-layer in-memory cache (Redis-ready upgrade path):

  L1 — Exact hash cache:
    Key: SHA-256 of (operation + canonical input string)
    Hit rate: same identical request twice (e.g. same role mapping for same user)
    Latency saved: full LLM call (~2-4 seconds)
    TTL: 1 hour

  L2 — Semantic similarity cache:
    Key: embedding vector, search by cosine similarity
    Threshold: 0.92 (from Module 5 — enterprise chatbot best practice)
    Hit rate: 25-40% on enterprise systems (similar role queries from different employees)
    Latency saved: full LLM call (~2-4 seconds)
    TTL: 30 minutes

Why this matters for bench-resource-optimizer at 1M requests/day:
  Role mapping for "Java Microservices Developer" is requested by hundreds of employees.
  After the first LLM call, all subsequent similar requests return in < 1ms.
  At 30% hit rate and 3s avg LLM latency: 300,000 requests/day return in <1ms instead of 3s.
  That's 250 hours of LLM compute saved per day.

Production upgrade path:
  Replace _l1_store with: redis_client.setex(key, ttl, json.dumps(value))
  Replace _l2_store with: pgvector table with <=> cosine distance query
  Same API, no changes to callers.
"""
from __future__ import annotations

import hashlib
import logging
import time
from typing import Any, Optional, Tuple

import numpy as np

logger = logging.getLogger("bench.cache")

_L1_TTL = 3600       # 1 hour — exact match cache
_L2_TTL = 1800       # 30 minutes — semantic cache
_L2_THRESHOLD = 0.92  # cosine similarity threshold (Module 5)

# In-memory stores (swap for Redis / pgvector in production)
_l1_store: dict[str, Tuple[Any, float]] = {}          # key → (value, expires_at)
_l2_store: list[Tuple[np.ndarray, Any, float]] = []   # [(embedding, value, expires_at)]


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _evict_expired() -> None:
    """Remove expired entries. Called lazily on every cache operation."""
    now = time.time()
    expired = [k for k, (_, exp) in _l1_store.items() if exp < now]
    for k in expired:
        del _l1_store[k]

    # Evict L2 expired entries
    to_remove = [i for i, (_, _, exp) in enumerate(_l2_store) if exp < now]
    for i in reversed(to_remove):
        _l2_store.pop(i)


# ── L1: Exact hash cache ──────────────────────────────────────────────────────

def l1_get(operation: str, key_data: str) -> Optional[Any]:
    _evict_expired()
    key = _sha256(f"{operation}:{key_data}")
    entry = _l1_store.get(key)
    if entry and entry[1] > time.time():
        logger.debug('{"event":"cache_hit","layer":"L1","op":"%s"}', operation)
        return entry[0]
    return None


def l1_set(operation: str, key_data: str, value: Any) -> None:
    key = _sha256(f"{operation}:{key_data}")
    _l1_store[key] = (value, time.time() + _L1_TTL)


# ── L2: Semantic similarity cache ────────────────────────────────────────────

def l2_get(query_embedding: np.ndarray, operation: str) -> Optional[Any]:
    """Search for a semantically similar cached result."""
    _evict_expired()
    now = time.time()
    best_sim = 0.0
    best_val = None

    for emb, val, exp in _l2_store:
        if exp < now:
            continue
        sim = _cosine_similarity(query_embedding, emb)
        if sim > best_sim:
            best_sim = sim
            best_val = val

    if best_sim >= _L2_THRESHOLD and best_val is not None:
        logger.debug(
            '{"event":"cache_hit","layer":"L2","op":"%s","similarity":%.3f}',
            operation, best_sim,
        )
        return best_val
    return None


def l2_set(query_embedding: np.ndarray, value: Any) -> None:
    _l2_store.append((query_embedding, value, time.time() + _L2_TTL))
    # Keep store bounded (max 500 entries)
    if len(_l2_store) > 500:
        _l2_store.pop(0)


def cache_stats() -> dict:
    now = time.time()
    return {
        "l1_entries": sum(1 for _, (_, exp) in _l1_store.items() if exp > now),
        "l2_entries": sum(1 for _, _, exp in _l2_store if exp > now),
        "l1_ttl_seconds": _L1_TTL,
        "l2_ttl_seconds": _L2_TTL,
        "l2_similarity_threshold": _L2_THRESHOLD,
    }
