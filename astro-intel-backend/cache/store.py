"""
In-memory response cache for the AstroIntel pipeline.

Two-tier TTL strategy:
  PROFILE_TTL  — 30 days  — birth chart + domain agent outputs (static forever)
  SESSION_TTL  — 20 min   — full pipeline response including questions (session-scoped)

Key strategy:
  profile_key  — hash(name + dob + tob + pob)             → reused across sessions
  session_key  — hash(profile_key + sorted questions)     → unique per question set

Storage      : plain Python dict — no external dependencies
Eviction     : lazy (checked on get) + periodic sweep on set
"""
from __future__ import annotations
import hashlib
import re
import time
from typing import Any, Dict, List, Optional, Tuple

# ── config ────────────────────────────────────────────────────────────────────
PROFILE_TTL_SECONDS: int = 30 * 24 * 60 * 60   # 30 days — birth charts are permanent
SESSION_TTL_SECONDS: int = 20 * 60              # 20 min  — full response cache
DEFAULT_TTL_SECONDS: int = PROFILE_TTL_SECONDS  # default = profile TTL
MAX_ENTRIES: int         = 500

# ── internal stores ───────────────────────────────────────────────────────────
# { cache_key: (stored_at_ts, payload, meta) }
# meta = { "user_name", "date_of_birth", "place_of_birth", "hit_count", "key_type" }
_cache: Dict[str, Tuple[float, Any, Dict]] = {}

# hit / miss counters (reset on server restart)
_hits:   int = 0
_misses: int = 0


# ── key helpers ───────────────────────────────────────────────────────────────

def _normalize(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def make_profile_key(profile: dict) -> str:
    """
    Deterministic key based purely on birth identity.
    Same person = same key regardless of which questions they ask.
    TTL = 30 days (birth charts never change).
    """
    blob = "|".join([
        _normalize(profile.get("full_name") or ""),
        (profile.get("date_of_birth") or "").strip(),
        (profile.get("time_of_birth") or "").strip(),
        _normalize(profile.get("place_of_birth") or ""),
    ])
    hashed = hashlib.sha256(blob.encode()).hexdigest()[:20]
    name_slug = re.sub(r"[^a-z0-9]", "", _normalize(profile.get("full_name") or "anon"))[:12]
    return f"profile__{name_slug}__{hashed}"


def make_key(user_id: str, questions: list, user_question: str,
             profile: dict = None) -> str:
    """
    Session-level key: profile identity + question set.
    Same person asking same questions = cache hit.
    Different questions = different key (fresh run).
    """
    all_q = []
    if user_question and user_question.strip():
        all_q.append(_normalize(user_question))
    for q in (questions or []):
        nq = _normalize(q)
        if nq and nq not in all_q:
            all_q.append(nq)

    query_blob   = "|".join(sorted(all_q))
    profile_key  = make_profile_key(profile) if profile else "noprofile"
    raw_key      = f"{profile_key}__{query_blob}"
    hashed       = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
    uid          = (user_id or "anonymous").strip().lower()
    return f"session__{uid}__{hashed}"


# ── TTL eviction ──────────────────────────────────────────────────────────────

def _is_expired(stored_at: float, ttl: int) -> bool:
    return (time.time() - stored_at) >= ttl


def _sweep() -> None:
    """Remove all expired entries using each entry's own TTL stored in meta."""
    now = time.time()
    expired = [
        k for k, (ts, _, meta) in _cache.items()
        if (now - ts) >= meta.get("ttl", DEFAULT_TTL_SECONDS)
    ]
    for k in expired:
        del _cache[k]


def _evict_oldest() -> None:
    if not _cache:
        return
    oldest_key = min(_cache, key=lambda k: _cache[k][0])
    del _cache[oldest_key]


# ── public API ────────────────────────────────────────────────────────────────

def get(key: str, ttl: int = DEFAULT_TTL_SECONDS) -> Optional[Any]:
    """Return cached payload if present and not expired, else None. Increments counters."""
    global _hits, _misses
    entry = _cache.get(key)
    if entry is None:
        _misses += 1
        return None
    stored_at, payload, meta = entry
    entry_ttl = meta.get("ttl", ttl)
    if _is_expired(stored_at, entry_ttl):
        del _cache[key]
        _misses += 1
        return None
    # increment hit count on the entry
    _cache[key] = (stored_at, payload, {**meta, "hit_count": meta.get("hit_count", 0) + 1})
    _hits += 1
    return payload


def set(  # noqa: A001
    key: str,
    payload: Any,
    ttl: int = DEFAULT_TTL_SECONDS,
    meta: Optional[Dict] = None,
) -> None:
    """
    Store payload under key.
    meta can carry: user_name, date_of_birth, place_of_birth, key_type
    """
    _sweep()
    if len(_cache) >= MAX_ENTRIES:
        _evict_oldest()
    entry_meta = {
        "ttl":           ttl,
        "hit_count":     0,
        "key_type":      "session",
        "user_name":     "",
        "date_of_birth": "",
        "place_of_birth":"",
        **(meta or {}),
    }
    _cache[key] = (time.time(), payload, entry_meta)


def invalidate(key: str) -> bool:
    """Explicitly remove a cache entry. Returns True if it existed."""
    return _cache.pop(key, None) is not None


def clear() -> int:
    """Wipe the entire cache. Returns number of entries removed."""
    count = len(_cache)
    _cache.clear()
    return count


def stats() -> Dict[str, Any]:
    """Diagnostic snapshot for admin dashboard."""
    now = time.time()
    timestamps = [ts for ts, _, _ in _cache.values()]
    return {
        "total_entries":      len(_cache),
        "hits":               _hits,
        "misses":             _misses,
        "hit_rate_pct":       round(_hits / max(_hits + _misses, 1) * 100, 1),
        "oldest_age_seconds": round(now - min(timestamps, default=now), 1),
        "newest_age_seconds": round(now - max(timestamps, default=now), 1),
        "max_entries":        MAX_ENTRIES,
        "profile_ttl_days":   PROFILE_TTL_SECONDS // 86400,
        "session_ttl_minutes": SESSION_TTL_SECONDS // 60,
    }


def entries() -> List[Dict[str, Any]]:
    """Return all cache entries for admin UI — sorted newest first."""
    now = time.time()
    result = []
    for key, (stored_at, _, meta) in _cache.items():
        ttl = meta.get("ttl", DEFAULT_TTL_SECONDS)
        age_sec = now - stored_at
        expires_in_sec = max(0.0, ttl - age_sec)
        result.append({
            "key":              key,
            "key_type":         meta.get("key_type", "session"),
            "user_name":        meta.get("user_name", ""),
            "date_of_birth":    meta.get("date_of_birth", ""),
            "place_of_birth":   meta.get("place_of_birth", ""),
            "cached_at":        stored_at,
            "age_seconds":      round(age_sec, 0),
            "expires_in_seconds": round(expires_in_sec, 0),
            "expires_in_days":  round(expires_in_sec / 86400, 1),
            "hit_count":        meta.get("hit_count", 0),
            "ttl_seconds":      ttl,
        })
    result.sort(key=lambda x: x["cached_at"], reverse=True)
    return result
