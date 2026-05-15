"""
Production Guardrails — Bench Resource Optimizer
=================================================
Five production-grade guardrails adapted for a RAG-heavy pipeline:

  G1 — Per-user sliding-window rate limiter (user_id level, not just IP)
       IP-level throttle already exists in middleware/rate_limit.py (60 req/min).
       G1 adds a finer-grained per-user_id limit (20 req/min) to prevent
       a single bench employee from overwhelming the LLM quota.

  G2 — Circuit breaker with persistent counters + admin reset
       utils/retry.py already has a CircuitBreaker per operation.
       G2 adds: total_failures / total_successes / total_rejected lifetime
       counters and an all_breaker_stats() export for the guardrails API.

  G3 — JSON output repair cascade (4-level: parse → strip → regex → fallback)
       utils/json_parser.py does basic fence-stripping.
       G3 extends it with tracking (repair count, fallback count) and a
       graceful fallback dict so the pipeline never crashes on bad LLM JSON.

  G4 — PII output filter for role-mapping and plan responses
       Guards against the LLM echoing back email, phone, or DOB fields that
       were present in the retrieved user profile but should NOT appear in
       the role-mapping recommendation or training plan output.

  G5 — Graceful degradation tracker for RAG agents
       Records per-request agent outcomes (cv_parser, role_mapper, planner,
       llm_judge) as full / partial / fallback / failed.
       Feeds the /guardrails/stats availability% and recent-runs feed.

Wire points (non-invasive — original logic unchanged):
  G1: main.py → upload_cv, map_role (after user_id is known)
  G2: utils/retry.py exports → all_breaker_stats() re-exports here
  G3: anywhere parse_llm_json() is called → use repair_json() instead
  G4: main.py map_role response → filter_pii_from_mapping()
  G5: main.py after each agent call → degradation_tracker.record_agent()
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("bench.guardrails.production")

# ══════════════════════════════════════════════════════════════════════════════
# G1 — Per-user sliding-window rate limiter
# ══════════════════════════════════════════════════════════════════════════════

class UserRateLimiter:
    """
    Sliding-window rate limiter keyed on user_id (not IP).
    IP-level guard is already in RateLimitMiddleware (60 req/min).
    This adds a user-level guard: 20 LLM-backed requests per 60 seconds.

    Why separate from the IP limiter:
      Multiple employees may share a NAT IP (office Wi-Fi, VPN).
      The IP limiter guards the gateway; this guards per-employee LLM spend.
    """

    def __init__(self, max_requests: int = 20, window_seconds: int = 60) -> None:
        self.max_requests    = max_requests
        self.window_seconds  = window_seconds
        self._windows: Dict[str, deque] = defaultdict(deque)
        self._lock           = Lock()
        self._total_allowed  = 0
        self._total_blocked  = 0

    def is_allowed(self, user_id: str) -> Tuple[bool, str]:
        """Return (allowed, reason). Thread-safe."""
        now = time.monotonic()
        with self._lock:
            q = self._windows[user_id]
            # Evict expired timestamps
            while q and now - q[0] > self.window_seconds:
                q.popleft()

            if len(q) >= self.max_requests:
                self._total_blocked += 1
                retry_in = int(self.window_seconds - (now - q[0])) + 1
                return False, (
                    f"Rate limit exceeded for user '{user_id}'. "
                    f"{self.max_requests} LLM requests per {self.window_seconds}s allowed. "
                    f"Retry in {retry_in}s."
                )

            q.append(now)
            self._total_allowed += 1
            return True, "allowed"

    def stats(self) -> Dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            active: Dict[str, int] = {}
            for uid, q in self._windows.items():
                # count only within window
                cnt = sum(1 for ts in q if now - ts <= self.window_seconds)
                if cnt > 0:
                    active[uid] = cnt
            return {
                "tracked_users":  len(active),
                "max_requests":   self.max_requests,
                "window_seconds": self.window_seconds,
                "total_allowed":  self._total_allowed,
                "total_blocked":  self._total_blocked,
                "current_counts": active,
            }


# Singleton
rate_limiter = UserRateLimiter(max_requests=20, window_seconds=60)


# ══════════════════════════════════════════════════════════════════════════════
# G2 — Circuit breaker persistent stats + admin reset
# ══════════════════════════════════════════════════════════════════════════════

def all_breaker_stats() -> Dict[str, Any]:
    """
    Export live stats for ALL circuit breakers registered in utils/retry.py.
    Adds lifetime counters to the existing per-operation breakers.

    We monkey-patch persistent counters onto each CircuitBreaker the first
    time this is called — the original class is unchanged.
    """
    from utils.retry import _breakers, _State

    result: Dict[str, Any] = {}
    for name, cb in _breakers.items():
        # Inject persistent counters if not present (idempotent)
        if not hasattr(cb, "_total_failures"):
            cb._total_failures  = 0
            cb._total_successes = 0
            cb._total_rejected  = 0

        # Wrap record_failure / record_success to increment counters
        if not getattr(cb, "_stats_patched", False):
            _orig_fail = cb.record_failure.__func__ if hasattr(cb.record_failure, "__func__") else None
            _orig_succ = cb.record_success.__func__ if hasattr(cb.record_success, "__func__") else None

            def _patched_fail(self=cb):
                self._total_failures += 1
                if self.is_open():
                    self._total_rejected += 1
                type(self).record_failure(self)

            def _patched_succ(self=cb):
                self._total_successes += 1
                type(self).record_success(self)

            cb.record_failure = _patched_fail  # type: ignore[method-assign]
            cb.record_success = _patched_succ  # type: ignore[method-assign]
            cb._stats_patched = True

        s = cb.state  # triggers OPEN→HALF_OPEN transition if timeout elapsed
        result[name] = {
            "state":             s.value,
            "failures":          cb._failures,
            "failure_threshold": cb.failure_threshold,
            "reset_timeout_s":   cb.reset_timeout,
            "total_failures":    cb._total_failures,
            "total_successes":   cb._total_successes,
            "total_rejected":    cb._total_rejected,
        }
    return result


def reset_breaker(name: str) -> Dict[str, Any]:
    """Admin reset: force a named circuit breaker to CLOSED."""
    from utils.retry import _breakers, _State
    if name not in _breakers:
        return {"error": f"No circuit breaker named '{name}'"}
    cb = _breakers[name]
    cb._failures   = 0
    cb._state      = _State.CLOSED
    cb._opened_at  = None
    logger.info('{"event":"cb_reset","name":"%s"}', name)
    return {"status": "reset", "name": name, "state": "closed"}


def reset_all_breakers() -> Dict[str, Any]:
    """Admin reset: force ALL circuit breakers to CLOSED."""
    from utils.retry import _breakers, _State
    for name, cb in _breakers.items():
        cb._failures  = 0
        cb._state     = _State.CLOSED
        cb._opened_at = None
    logger.info('{"event":"all_cb_reset","count":%d}', len(_breakers))
    return {"status": "reset", "count": len(_breakers), "state": "closed"}


# ══════════════════════════════════════════════════════════════════════════════
# G3 — JSON repair cascade with tracking
# ══════════════════════════════════════════════════════════════════════════════

class _JsonRepairStats:
    def __init__(self) -> None:
        self.total_calls    = 0
        self.direct_parse   = 0
        self.fence_strip    = 0
        self.regex_extract  = 0
        self.llm_repair     = 0   # Level 4 — LLM fixed it
        self.fallback_used  = 0   # Level 4 — LLM also failed, used fallback
        self.total_failures = 0   # All 4 levels exhausted, no fallback

_json_stats = _JsonRepairStats()

# LLM instance registered by main.py after startup — None until then
_repair_llm: Optional[Any] = None


def register_repair_llm(llm: Any) -> None:
    """
    Register the shared LLM instance for G3 Level 4 repair.
    Call from main.py lifespan after _llm is created.
    """
    global _repair_llm
    _repair_llm = llm
    logger.info('{"event":"g3_llm_repair_registered"}')


_LLM_REPAIR_PROMPT = (
    "The following text is supposed to be valid JSON but failed to parse. "
    "Fix it and return ONLY the corrected JSON — no explanation, no markdown, no extra text.\n\n"
    "BROKEN TEXT:\n{broken}\n\nCORRECTED JSON:"
)


def _try_llm_repair(broken: str) -> Optional[Any]:
    """
    Level 4: ask the LLM to fix the broken JSON.
    Returns parsed object on success, None on any failure.
    Kept synchronous — called from sync parse_llm_json() context.
    """
    if _repair_llm is None:
        return None
    try:
        prompt = _LLM_REPAIR_PROMPT.format(broken=broken[:1500])
        # Use the LangChain ChatOpenAI interface already initialised in main.py
        result = _repair_llm.invoke(prompt)
        repaired_text = result.content if hasattr(result, "content") else str(result)
        # Strip fences from repair response
        repaired_text = re.sub(r"^```[a-zA-Z]*\n?", "", repaired_text.strip())
        repaired_text = re.sub(r"\n?```\s*$", "", repaired_text).strip()
        return json.loads(repaired_text)
    except Exception as exc:
        logger.warning('{"event":"g3_llm_repair_failed","error":"%s"}', str(exc)[:80])
        return None


def repair_json(
    raw: str,
    fallback: Optional[Any] = None,
) -> Tuple[Optional[Any], str]:
    """
    4-level JSON repair cascade for LLM output.

    Returns (parsed_value, repair_level) where repair_level is one of:
      "direct"   — parsed cleanly (Level 1)
      "fence"    — needed markdown fence removal (Level 2)
      "regex"    — needed regex first-brace extraction (Level 3)
      "llm"      — LLM fixed the broken JSON (Level 4)
      "fallback" — all 4 levels failed, fallback value returned
      "failed"   — all 4 levels failed AND no fallback provided

    Tracks repair stats for the guardrails dashboard.
    """
    _json_stats.total_calls += 1
    text = (raw or "").strip()

    # Level 1 — direct parse
    try:
        v = json.loads(text)
        _json_stats.direct_parse += 1
        return v, "direct"
    except json.JSONDecodeError:
        pass

    # Level 2 — strip markdown fences
    stripped = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    stripped = re.sub(r"\n?```\s*$", "", stripped).strip()
    try:
        v = json.loads(stripped)
        _json_stats.fence_strip += 1
        logger.debug('{"event":"json_repair","level":"fence_strip"}')
        return v, "fence"
    except json.JSONDecodeError:
        pass

    # Level 3 — regex extract first JSON object or array
    for ch, end_ch in [('{', '}'), ('[', ']')]:
        idx = stripped.find(ch)
        if idx >= 0:
            candidate = stripped[idx:]
            for end in [candidate.rfind(end_ch) + 1, len(candidate)]:
                try:
                    v = json.loads(candidate[:end])
                    _json_stats.regex_extract += 1
                    logger.debug('{"event":"json_repair","level":"regex_extract"}')
                    return v, "regex"
                except json.JSONDecodeError:
                    continue

    # Level 4 — LLM repair call
    llm_result = _try_llm_repair(stripped or text)
    if llm_result is not None:
        _json_stats.llm_repair += 1
        logger.info('{"event":"json_repair","level":"llm_repair"}')
        return llm_result, "llm"

    # All levels exhausted
    _json_stats.total_failures += 1
    logger.warning('{"event":"json_repair_all_failed","raw_snippet":"%s"}', text[:80])

    if fallback is not None:
        _json_stats.fallback_used += 1
        return fallback, "fallback"

    return None, "failed"


def json_repair_stats() -> Dict[str, Any]:
    s = _json_stats
    total = max(s.total_calls, 1)
    return {
        "total_calls":    s.total_calls,
        "direct_pct":     round(s.direct_parse  / total * 100, 1),
        "fence_pct":      round(s.fence_strip   / total * 100, 1),
        "regex_pct":      round(s.regex_extract / total * 100, 1),
        "llm_repair_pct": round(s.llm_repair    / total * 100, 1),
        "fallback_pct":   round(s.fallback_used / total * 100, 1),
        "failure_pct":    round(s.total_failures / total * 100, 1),
        "total_failures":  s.total_failures,
        "llm_repair_available": _repair_llm is not None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# G4 — PII output filter for mapping and plan responses
# ══════════════════════════════════════════════════════════════════════════════

# Fields that should never appear verbatim in LLM output responses
_PII_FIELDS = {"email", "phone", "dob", "date_of_birth", "national_id",
               "passport", "address", "bank_account"}

# Regex patterns for common PII forms
_PII_PATTERNS = [
    (re.compile(r'\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b', re.IGNORECASE), "[EMAIL REDACTED]"),
    (re.compile(r'\b(\+?\d[\d\s\-().]{7,14}\d)\b'),                "[PHONE REDACTED]"),
    (re.compile(r'\b\d{4}[-/]\d{2}[-/]\d{2}\b'),                  "[DATE REDACTED]"),
    (re.compile(r'\b\d{2}[-/]\d{2}[-/]\d{4}\b'),                  "[DATE REDACTED]"),
]

_pii_filter_stats = {"total_checked": 0, "total_scrubbed": 0, "fields_scrubbed": 0}


def filter_pii_from_output(text: str, user_profile: Optional[Dict] = None) -> Tuple[str, int]:
    """
    Scrub PII from any string output before returning to the client.

    Removes:
      - Email / phone values from the user profile (exact match)
      - Regex-detected emails, phone numbers, dates

    Returns (cleaned_text, scrub_count).
    """
    _pii_filter_stats["total_checked"] += 1
    scrub_count = 0

    # Exact-match scrub: remove specific values from user profile
    if user_profile:
        for field, value in user_profile.items():
            if field.lower() in _PII_FIELDS and isinstance(value, str) and len(value) > 3:
                if value in text:
                    text = text.replace(value, f"[{field.upper()} REDACTED]")
                    scrub_count += 1
                    _pii_filter_stats["fields_scrubbed"] += 1

    # Regex scrub
    for pattern, replacement in _PII_PATTERNS:
        new_text, n = pattern.subn(replacement, text)
        if n > 0:
            text = new_text
            scrub_count += n

    if scrub_count > 0:
        _pii_filter_stats["total_scrubbed"] += 1
        logger.info('{"event":"pii_scrubbed","count":%d}', scrub_count)

    return text, scrub_count


def filter_pii_from_mapping(mapping: Dict, user_profile: Optional[Dict] = None) -> Tuple[Dict, int]:
    """
    Filter PII from role-mapping response dict.
    Checks: recommendation, role title, and any string fields.
    """
    total = 0
    for key in ("recommendation", "readiness_level", "role"):
        if key in mapping and isinstance(mapping[key], str):
            cleaned, n = filter_pii_from_output(mapping[key], user_profile)
            mapping[key] = cleaned
            total += n
    return mapping, total


def pii_filter_stats() -> Dict[str, Any]:
    return {
        "total_outputs_checked": _pii_filter_stats["total_checked"],
        "outputs_with_pii":      _pii_filter_stats["total_scrubbed"],
        "fields_scrubbed":       _pii_filter_stats["fields_scrubbed"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# G5 — Graceful degradation tracker for RAG agents
# ══════════════════════════════════════════════════════════════════════════════

_AGENTS = ["cv_parser", "role_mapper", "planner", "llm_judge", "retrieval"]


class GracefulDegradationTracker:
    """
    Records per-request agent outcomes for the bench pipeline.

    Agent statuses:
      full      — agent completed normally, result used
      partial   — agent completed with reduced quality (e.g., cache hit, no rerank)
      fallback  — agent failed, fallback response used
      skipped   — agent was not called for this request type
      failed    — agent raised exception, no fallback available

    Availability % = full+partial runs / (full+partial+fallback+failed) * 100
    """

    def __init__(self, maxlen: int = 50) -> None:
        self._runs: deque = deque(maxlen=maxlen)
        self._lock = Lock()
        self._lifetime: Dict[str, Dict[str, int]] = {
            a: {"full": 0, "partial": 0, "fallback": 0, "skipped": 0, "failed": 0}
            for a in _AGENTS
        }

    def record_run(
        self,
        request_id: str,
        agent_outcomes: Dict[str, Dict[str, Any]],
    ) -> None:
        """
        Call once per request with a dict of:
        {
          "cv_parser":   {"status": "full",     "note": "..."},
          "role_mapper": {"status": "fallback",  "note": "cache miss + LLM failed"},
          ...
        }
        Skipped agents need not be listed.
        """
        ts = time.time()
        run: Dict[str, Any] = {
            "request_id": request_id,
            "ts":         ts,
            "agents":     {},
        }

        overall = "full"
        with self._lock:
            for agent in _AGENTS:
                outcome = agent_outcomes.get(agent, {"status": "skipped", "note": ""})
                status  = outcome.get("status", "skipped")
                run["agents"][agent] = {
                    "status": status,
                    "note":   outcome.get("note", ""),
                }
                self._lifetime[agent][status] = self._lifetime[agent].get(status, 0) + 1

                # Determine overall quality
                if status == "failed":
                    overall = "failed"
                elif status == "fallback" and overall != "failed":
                    overall = "fallback"
                elif status == "partial" and overall not in ("failed", "fallback"):
                    overall = "partial"

            run["overall"] = overall
            self._runs.append(run)

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            runs = list(self._runs)
            total_runs = len(runs)

            agent_avail: Dict[str, float] = {}
            agent_health: Dict[str, Dict[str, int]] = {}
            for agent, counts in self._lifetime.items():
                active = counts["full"] + counts["partial"] + counts["fallback"] + counts["failed"]
                if active == 0:
                    agent_avail[agent] = 100.0
                else:
                    agent_avail[agent] = round((counts["full"] + counts["partial"]) / active * 100, 1)
                agent_health[agent] = dict(counts)

            # Recent 5 runs for the feed
            recent = []
            for r in list(reversed(runs))[:5]:
                recent.append({
                    "request_id": r["request_id"][:8] + "…",
                    "ts":         r["ts"],
                    "overall":    r["overall"],
                    "agents":     r["agents"],
                })

            # Overall counts across all runs
            overall_counts = {"full": 0, "partial": 0, "fallback": 0, "failed": 0}
            for r in runs:
                key = r.get("overall", "full")
                if key in overall_counts:
                    overall_counts[key] += 1

            return {
                "total_runs":        total_runs,
                "overall_counts":    overall_counts,
                "agent_availability": agent_avail,
                "agent_health":      agent_health,
                "recent_runs":       recent,
            }


# Singleton
degradation_tracker = GracefulDegradationTracker()


# ══════════════════════════════════════════════════════════════════════════════
# Master stats aggregator
# ══════════════════════════════════════════════════════════════════════════════

def all_guardrail_stats() -> Dict[str, Any]:
    """
    Single call that returns all 5 guardrail stat blocks.
    Used by GET /guardrails/stats.
    """
    return {
        "g1_rate_limiter":         rate_limiter.stats(),
        "g2_circuit_breakers":     all_breaker_stats(),
        "g3_json_repair":          json_repair_stats(),
        "g4_pii_filter":           pii_filter_stats(),
        "g5_graceful_degradation": degradation_tracker.stats(),
    }
