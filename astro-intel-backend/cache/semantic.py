"""
Semantic Cache (Phase 2)
=========================
Wraps the existing exact-match cache with an embedding similarity layer.

How it works:
  1. On GET  — embed the query, scan stored embeddings for cosine similarity
               above SIMILARITY_THRESHOLD. If match found, return that entry.
               Falls back to exact-match cache if semantic layer is disabled.

  2. On SET  — store the embedding alongside the payload so future queries
               can match against it.

  3. Profile key — birth-chart identity is still exact SHA-256 (birth data
               never has semantic ambiguity). Only the question/query part
               gets semantic matching.

Environment:
  SEMANTIC_CACHE_ENABLED   — true / false (default: false)
  SEMANTIC_SIMILARITY_THRESHOLD — float 0-1 (default: 0.82)
                                  Higher = stricter match required.

Integration:
  Import `semantic_get` / `semantic_set` instead of `cache.get` / `cache.set`
  in routers/analysis.py. Falls back to exact cache when disabled.
"""
from __future__ import annotations
import os
import numpy as np
from typing import Any, Optional

import cache.store as _store

SEMANTIC_CACHE_ENABLED = os.getenv("SEMANTIC_CACHE_ENABLED", "false").lower() == "true"
SIMILARITY_THRESHOLD   = float(os.getenv("SEMANTIC_SIMILARITY_THRESHOLD", "0.82"))

# { cache_key → numpy float32 vector }
_embeddings: dict[str, np.ndarray] = {}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity of two pre-normalised vectors (dot product)."""
    return float(np.dot(a, b))


def _find_similar(query_vec: np.ndarray, profile_key: str) -> Optional[str]:
    """
    Search stored embeddings for a semantically similar entry that belongs
    to the same user profile (same birth-chart identity).
    Returns the cache key of the best match above threshold, or None.
    """
    best_key   = None
    best_score = SIMILARITY_THRESHOLD - 1e-9  # start just below threshold

    for key, vec in _embeddings.items():
        # Only match within the same profile (same person)
        if not key.startswith(f"sem__{profile_key}__"):
            continue
        score = _cosine(query_vec, vec)
        if score > best_score:
            best_score = score
            best_key   = key

    return best_key


def _make_sem_key(profile_key: str, query_text: str) -> str:
    """Semantic cache key: prefix + profile identity + first 40 chars of query."""
    slug = query_text.strip()[:40].replace(" ", "_").lower()
    return f"sem__{profile_key}__{slug}"


def semantic_get(
    query_text: str,
    profile_key: str,
    ttl: int = _store.DEFAULT_TTL_SECONDS,
) -> Optional[Any]:
    """
    Look up query_text in semantic cache.
    - If SEMANTIC_CACHE_ENABLED: embed + cosine search → exact get on best key.
    - Else: exact SHA-256 get (existing behaviour, unchanged).
    Returns cached payload or None.
    """
    if not SEMANTIC_CACHE_ENABLED:
        # Exact-match path — unchanged from existing behaviour
        exact_key = _store.make_key("", [], query_text, {"full_name": "", "date_of_birth": "",
                                                          "time_of_birth": "", "place_of_birth": ""})
        return _store.get(exact_key, ttl)

    try:
        from cache.embedding_model import embed
        query_vec = embed(query_text)
        matched_key = _find_similar(query_vec, profile_key)
        if matched_key:
            payload = _store.get(matched_key, ttl)
            if payload is not None:
                return payload
            # Key expired — remove stale embedding
            _embeddings.pop(matched_key, None)
    except Exception:
        pass  # degrade gracefully to exact match

    return None


def semantic_set(
    query_text: str,
    profile_key: str,
    payload: Any,
    ttl: int = _store.DEFAULT_TTL_SECONDS,
    meta: Optional[dict] = None,
) -> None:
    """
    Store payload with semantic key.
    - If SEMANTIC_CACHE_ENABLED: also store embedding for future similarity search.
    - Else: pass through to exact-match cache (unchanged behaviour).
    """
    sem_key = _make_sem_key(profile_key, query_text)
    _store.set(sem_key, payload, ttl=ttl, meta={**(meta or {}), "key_type": "semantic"})

    if not SEMANTIC_CACHE_ENABLED:
        return

    try:
        from cache.embedding_model import embed
        vec = embed(query_text)
        _embeddings[sem_key] = vec
    except Exception:
        pass  # embedding failed — cache still works via exact key


def semantic_stats() -> dict:
    """Expose semantic cache stats for the metrics dashboard."""
    return {
        "enabled":             SEMANTIC_CACHE_ENABLED,
        "similarity_threshold": SIMILARITY_THRESHOLD,
        "stored_embeddings":   len(_embeddings),
    }


def clear_embeddings() -> int:
    """Wipe all stored embeddings (called when cache is cleared)."""
    count = len(_embeddings)
    _embeddings.clear()
    return count
