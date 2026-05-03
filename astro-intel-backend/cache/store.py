"""
In-memory response cache for the AstroIntel pipeline.

Key strategy : user_id + "_" + normalized_query
TTL          : configurable, default 20 minutes
Storage      : plain Python dict — no external dependencies
Eviction     : lazy (checked on get) + periodic sweep on set
"""
from __future__ import annotations
import hashlib
import re
import time
from typing import Any, Dict, Optional, Tuple

# ── config ────────────────────────────────────────────────────────────────────
DEFAULT_TTL_SECONDS: int = 20 * 60   # 20 minutes
MAX_ENTRIES: int         = 500        # hard cap — evict oldest when exceeded

# ── internal store ────────────────────────────────────────────────────────────
# { cache_key: (stored_at_ts, payload) }
_cache: Dict[str, Tuple[float, Any]] = {}


# ── key helpers ───────────────────────────────────────────────────────────────

def _normalize_query(raw: str) -> str:
    """Trim, lowercase, collapse whitespace, strip punctuation noise."""
    s = raw.strip().lower()
    s = re.sub(r"[^\w\s]", "", s)          # drop punctuation
    s = re.sub(r"\s+", " ", s)             # collapse whitespace
    return s


def make_key(user_id: str, questions: list, user_question: str,
             profile: dict = None) -> str:
    """
    Build a deterministic cache key.
    Includes profile (name, dob, tob, pob) so different birth data never collide.
    """
    all_q = []
    if user_question and user_question.strip():
        all_q.append(_normalize_query(user_question))
    for q in (questions or []):
        nq = _normalize_query(q)
        if nq and nq not in all_q:
            all_q.append(nq)

    query_blob = "|".join(sorted(all_q))
    uid = (user_id or "anonymous").strip().lower()

    # Include birth identity so different people never share a cache entry
    profile_blob = ""
    if profile:
        profile_blob = "|".join([
            (profile.get("full_name") or "").strip().lower(),
            (profile.get("date_of_birth") or "").strip(),
            (profile.get("time_of_birth") or "").strip(),
            (profile.get("place_of_birth") or "").strip().lower(),
        ])

    raw_key = f"{uid}__{query_blob}__{profile_blob}"
    hashed  = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
    return f"{uid}__{hashed}"


# ── TTL eviction ──────────────────────────────────────────────────────────────

def _is_expired(stored_at: float, ttl: int) -> bool:
    return (time.time() - stored_at) >= ttl


def _sweep(ttl: int) -> None:
    """Remove all expired entries. Called on every set()."""
    now = time.time()
    expired = [k for k, (ts, _) in _cache.items() if (now - ts) >= ttl]
    for k in expired:
        del _cache[k]


def _evict_oldest() -> None:
    """Remove the single oldest entry when cap is exceeded."""
    if not _cache:
        return
    oldest_key = min(_cache, key=lambda k: _cache[k][0])
    del _cache[oldest_key]


# ── public API ────────────────────────────────────────────────────────────────

def get(key: str, ttl: int = DEFAULT_TTL_SECONDS) -> Optional[Any]:
    """
    Return cached payload if present and not expired, else None.
    """
    entry = _cache.get(key)
    if entry is None:
        return None
    stored_at, payload = entry
    if _is_expired(stored_at, ttl):
        del _cache[key]
        return None
    return payload


def set(key: str, payload: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:  # noqa: A001
    """
    Store payload under key. Sweeps expired entries first; evicts oldest if at cap.
    """
    _sweep(ttl)
    if len(_cache) >= MAX_ENTRIES:
        _evict_oldest()
    _cache[key] = (time.time(), payload)


def invalidate(key: str) -> bool:
    """Explicitly remove a cache entry. Returns True if it existed."""
    return _cache.pop(key, None) is not None


def clear() -> int:
    """Wipe the entire cache. Returns number of entries removed."""
    count = len(_cache)
    _cache.clear()
    return count


def stats() -> Dict[str, Any]:
    """Diagnostic snapshot — safe to expose on a debug endpoint."""
    now = time.time()
    return {
        "total_entries": len(_cache),
        "oldest_age_seconds": round(now - min((ts for ts, _ in _cache.values()), default=now), 1),
        "newest_age_seconds": round(now - max((ts for ts, _ in _cache.values()), default=now), 1),
        "max_entries": MAX_ENTRIES,
        "default_ttl_seconds": DEFAULT_TTL_SECONDS,
    }
