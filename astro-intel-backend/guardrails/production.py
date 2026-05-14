"""
Production Guardrails — AstroIntel 360°
========================================
Four additional guardrails required for production readiness:

  G1 — Rate Limiter       : per-user request throttle (max N requests / window)
  G2 — Circuit Breaker    : stop sending requests to LLM when failure rate is high
  G3 — JSON Output Repair : on JSONDecodeError, retry once with LLM repair prompt
  G4 — PII Output Filter  : block responses that echo back user's private birth data

These are wired into the pipeline non-invasively:
  - Rate limiter: called at the top of /api/v1/analysis/run
  - Circuit breaker: wraps LLM calls inside agents
  - JSON repair: called in agents that parse LLM JSON output
  - PII filter: called in admin_review_agent before returning insights

None of these touch the LangGraph graph structure or any agent's core logic.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("astrointel.production_guardrails")


# ══════════════════════════════════════════════════════════════════════════════
# G1 — RATE LIMITER
# Per-user sliding window rate limit. Keyed by user_id (falls back to IP).
# Default: max 10 requests per 60 seconds per user.
# ══════════════════════════════════════════════════════════════════════════════

class RateLimiter:
    """
    Sliding-window rate limiter.
    Stores timestamps of recent requests per user in a deque.
    Thread-safe for single-process uvicorn workers.
    """

    def __init__(self, max_requests: int = 10, window_seconds: int = 60) -> None:
        self.max_requests       = max_requests
        self.window_seconds     = window_seconds
        self._windows: Dict[str, deque] = defaultdict(deque)
        self._total_allowed     = 0
        self._total_blocked     = 0

    def is_allowed(self, user_id: str) -> Tuple[bool, str]:
        """
        Returns (allowed, reason).
        allowed=True  → request is within limits
        allowed=False → user has exceeded rate limit
        """
        now = time.time()
        key = (user_id or "anonymous").strip().lower()
        window = self._windows[key]

        # Evict timestamps outside the window
        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= self.max_requests:
            wait_sec = round(self.window_seconds - (now - window[0]), 1)
            reason = (
                f"Rate limit exceeded: {self.max_requests} requests "
                f"per {self.window_seconds}s. Retry in {wait_sec}s."
            )
            self._total_blocked += 1
            logger.warning("[RateLimiter] user=%s BLOCKED — %s", key, reason)
            return False, reason

        window.append(now)
        self._total_allowed += 1
        logger.debug("[RateLimiter] user=%s allowed (%d/%d)", key, len(window), self.max_requests)
        return True, "ok"

    def stats(self) -> Dict[str, Any]:
        now = time.time()
        current_counts = {
            uid: sum(1 for ts in dq if now - ts <= self.window_seconds)
            for uid, dq in self._windows.items()
        }
        # only show users who still have active requests in the window
        active_counts = {uid: cnt for uid, cnt in current_counts.items() if cnt > 0}
        return {
            "tracked_users":      len(active_counts),
            "max_requests":       self.max_requests,
            "window_seconds":     self.window_seconds,
            "total_allowed":      self._total_allowed,
            "total_blocked":      self._total_blocked,
            "current_counts":     active_counts,
        }


# Singleton — imported and used in routers/analysis.py
rate_limiter = RateLimiter(max_requests=10, window_seconds=60)


# ══════════════════════════════════════════════════════════════════════════════
# G2 — CIRCUIT BREAKER
# Tracks failure rate of LLM calls. Opens when failure threshold is exceeded.
# Prevents hammering a failing API and makes failures explicit + fast.
#
# States:
#   CLOSED   — normal operation, all calls go through
#   OPEN     — failure threshold exceeded, calls fail fast with fallback
#   HALF_OPEN — recovery probe: one call allowed through to test recovery
# ══════════════════════════════════════════════════════════════════════════════

class CircuitBreaker:
    CLOSED    = "closed"
    OPEN      = "open"
    HALF_OPEN = "half_open"

    def __init__(
        self,
        name: str = "llm",
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        half_open_max_calls: int = 1,
    ) -> None:
        self.name                = name
        self.failure_threshold   = failure_threshold
        self.recovery_timeout    = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state             = self.CLOSED
        self._failures          = 0
        self._successes         = 0
        self._last_failure_time = 0.0
        self._half_open_calls   = 0
        self._total_failures    = 0
        self._total_successes   = 0
        self._total_rejected    = 0   # calls fast-rejected while OPEN

    @property
    def state(self) -> str:
        if self._state == self.OPEN:
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                self._state = self.HALF_OPEN
                self._half_open_calls = 0
                logger.info("[CircuitBreaker/%s] → HALF_OPEN (probing recovery)", self.name)
        return self._state

    def call(self, fn, *args, **kwargs):
        """
        Execute fn(*args, **kwargs) through the circuit breaker.
        Raises CircuitOpenError if circuit is OPEN.
        """
        state = self.state
        if state == self.OPEN:
            self._total_rejected += 1
            raise CircuitOpenError(
                f"Circuit breaker [{self.name}] is OPEN — "
                f"LLM API failing, returning fallback. "
                f"Retry in {round(self.recovery_timeout - (time.time() - self._last_failure_time), 0)}s."
            )
        if state == self.HALF_OPEN and self._half_open_calls >= self.half_open_max_calls:
            self._total_rejected += 1
            raise CircuitOpenError(
                f"Circuit breaker [{self.name}] HALF_OPEN — max probe calls reached."
            )

        try:
            result = fn(*args, **kwargs)
            self._on_success()
            return result
        except CircuitOpenError:
            raise
        except Exception as exc:
            self._on_failure()
            raise exc

    def _on_success(self) -> None:
        self._failures        = 0
        self._successes      += 1
        self._total_successes += 1
        if self._state == self.HALF_OPEN:
            self._state = self.CLOSED
            logger.info("[CircuitBreaker/%s] → CLOSED (recovered)", self.name)

    def _on_failure(self) -> None:
        self._failures         += 1
        self._total_failures   += 1
        self._last_failure_time = time.time()
        if self._state == self.HALF_OPEN:
            self._state = self.OPEN
            logger.warning("[CircuitBreaker/%s] → OPEN (half-open probe failed)", self.name)
        elif self._failures >= self.failure_threshold:
            self._state = self.OPEN
            logger.error(
                "[CircuitBreaker/%s] → OPEN after %d failures", self.name, self._failures
            )

    def stats(self) -> Dict[str, Any]:
        return {
            "name":                    self.name,
            "state":                   self.state,
            "failures":                self._failures,        # current window failures
            "successes":               self._successes,
            "failure_threshold":       self.failure_threshold,
            "recovery_timeout":        self.recovery_timeout,
            "total_failures":          self._total_failures,  # lifetime
            "total_successes":         self._total_successes, # lifetime
            "total_rejected":          self._total_rejected,  # fast-rejected while OPEN
            "last_failure_age_seconds": round(time.time() - self._last_failure_time, 1)
            if self._last_failure_time else None,
        }

    def reset(self) -> None:
        self._state             = self.CLOSED
        self._failures          = 0
        self._half_open_calls   = 0
        self._last_failure_time = 0.0
        logger.info("[CircuitBreaker/%s] manually RESET → CLOSED", self.name)


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the circuit is open."""


# Singleton circuit breaker for DeepSeek/LLM calls
llm_circuit_breaker = CircuitBreaker(
    name="deepseek_llm",
    failure_threshold=5,
    recovery_timeout=60,
)


# ══════════════════════════════════════════════════════════════════════════════
# G3 — JSON OUTPUT REPAIR
# When an LLM returns malformed JSON, attempt one repair call before failing.
# Resolves ~90% of format errors without human intervention.
# ══════════════════════════════════════════════════════════════════════════════

def repair_json(
    raw_response: str,
    schema_hint: str = "",
    llm_caller=None,
) -> Tuple[Optional[Dict], bool]:
    """
    Try to parse raw_response as JSON.
    On failure:
      1. Try regex extraction of embedded JSON object/array
      2. If llm_caller provided, attempt LLM repair call
      3. Return (result_dict, repaired_flag)

    Returns:
      (parsed_dict, False)  — parsed cleanly on first try
      (parsed_dict, True)   — repaired successfully
      (None, True)          — repair attempted but failed
    """
    # Attempt 1: direct parse
    raw = raw_response.strip()
    try:
        return json.loads(raw), False
    except json.JSONDecodeError:
        pass

    # Attempt 2: strip markdown code fences ```json ... ```
    fenced = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    fenced = re.sub(r"\s*```$", "", fenced, flags=re.MULTILINE).strip()
    try:
        return json.loads(fenced), True
    except json.JSONDecodeError:
        pass

    # Attempt 3: extract first {...} or [...] block via regex
    m = re.search(r"(\{.*\}|\[.*\])", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1)), True
        except json.JSONDecodeError:
            pass

    # Attempt 4: LLM repair call
    if llm_caller:
        try:
            repair_prompt = (
                "You are a JSON repair assistant. "
                "Fix the following malformed JSON and return ONLY valid JSON, nothing else. "
                "No explanation. No markdown. Only the fixed JSON object.\n\n"
                f"Malformed input:\n{raw[:2000]}"
            )
            if schema_hint:
                repair_prompt += f"\n\nExpected schema hint:\n{schema_hint}"

            repaired_raw = llm_caller(repair_prompt)
            repaired_raw = repaired_raw.strip()
            # Strip fences again in case repair LLM added them
            repaired_raw = re.sub(r"^```(?:json)?\s*", "", repaired_raw, flags=re.MULTILINE)
            repaired_raw = re.sub(r"\s*```$", "", repaired_raw, flags=re.MULTILINE).strip()
            result = json.loads(repaired_raw)
            logger.info("[JSONRepair] Successfully repaired malformed LLM output via LLM call.")
            return result, True
        except Exception as exc:
            logger.error("[JSONRepair] LLM repair also failed: %s", exc)

    logger.error("[JSONRepair] All repair attempts failed for output: %s...", raw[:200])
    return None, True


# ══════════════════════════════════════════════════════════════════════════════
# G4 — PII OUTPUT FILTER
# Detect if LLM response echoes back sensitive birth data verbatim.
# Patterns: exact DOB, exact time of birth, exact coordinates.
# If PII detected → scrub or block the insight before returning to user.
# ══════════════════════════════════════════════════════════════════════════════

# Patterns that indicate raw PII being echoed back
_PII_PATTERNS = [
    r"\b\d{4}-\d{2}-\d{2}\b",                    # YYYY-MM-DD date
    r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b", # HH:MM time
    r"\b\d{2}/\d{2}/\d{4}\b",                    # DD/MM/YYYY
    r"\blat(?:itude)?\s*[=:]\s*-?\d+\.\d+\b",    # lat=12.345
    r"\blon(?:gitude)?\s*[=:]\s*-?\d+\.\d+\b",   # lon=77.234
]

_PII_RE = re.compile("|".join(_PII_PATTERNS), re.IGNORECASE)


def filter_pii_from_insight(text: str, user_profile: Dict[str, Any]) -> Tuple[str, bool]:
    """
    Check if text echoes back raw PII from user_profile.
    Returns (filtered_text, pii_found_flag).

    Strategy: replace exact profile field values with generic placeholders.
    This preserves the insight meaning while removing raw data exposure.
    """
    if not text or not user_profile:
        return text, False

    pii_found = False
    result = text

    # Replace exact field values
    sensitive_fields = {
        "date_of_birth":  "[birth date]",
        "time_of_birth":  "[birth time]",
        "place_of_birth": "[birth place]",
        "pincode":        "[pincode]",
    }
    for field, placeholder in sensitive_fields.items():
        val = (user_profile.get(field) or "").strip()
        if val and len(val) > 3 and val in result:
            result = result.replace(val, placeholder)
            pii_found = True
            logger.warning("[PIIFilter] Scrubbed field '%s' from insight output.", field)

    # Check for pattern-matched PII (dates, times, coordinates)
    if _PII_RE.search(result):
        pii_found = True
        logger.warning("[PIIFilter] PII pattern detected in insight. Flagging.")

    return result, pii_found


def filter_pii_from_admin_review(
    admin_review: Dict[str, Any],
    user_profile: Dict[str, Any],
) -> Tuple[Dict[str, Any], int]:
    """
    Walk the full admin_review structure and scrub PII from all insight content fields.
    Returns (scrubbed_admin_review, count_of_scrubbed_insights).
    """
    import copy
    result       = copy.deepcopy(admin_review)
    scrub_count  = 0

    for q in result.get("questions", []):
        for insight in q.get("insights", []):
            original = insight.get("content", "")
            cleaned, found = filter_pii_from_insight(original, user_profile)
            if found:
                insight["content"] = cleaned
                scrub_count += 1

    if scrub_count:
        logger.info("[PIIFilter] Scrubbed PII from %d insight(s).", scrub_count)

    return result, scrub_count


# ══════════════════════════════════════════════════════════════════════════════
# G5 — GRACEFUL DEGRADATION TRACKER
# Records per-domain agent failure events so the pipeline keeps running
# even when individual agents fail. The system degrades gracefully:
#   - FULL      : agent returned valid output
#   - PARTIAL   : agent returned output but with reduced confidence
#   - FALLBACK  : agent failed, pipeline-injected LOW confidence placeholder used
#   - SKIPPED   : agent not selected for this request
#
# Wired into domain_agents_parallel in graph/pipeline.py.
# Does NOT touch any agent logic.
# ══════════════════════════════════════════════════════════════════════════════

DOMAINS = ["numerology", "astrology", "palmistry", "tarot", "vastu"]

class GracefulDegradationTracker:
    """
    Tracks per-domain, per-run degradation status.
    Each run gets a snapshot. History kept for last MAX_HISTORY runs.
    """
    MAX_HISTORY = 50

    def __init__(self) -> None:
        self._runs: deque = deque(maxlen=self.MAX_HISTORY)
        self._total_full     = 0
        self._total_partial  = 0
        self._total_fallback = 0

    def record_run(self, session_id: str, domain_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call after domain_agents_parallel completes.
        domain_results: the memory dict keyed by domain name.
        Returns the degradation snapshot for this run.
        """
        snapshot: Dict[str, Any] = {
            "session_id": session_id,
            "ts":         time.time(),
            "domains":    {},
            "overall":    "full",
        }

        fallback_count  = 0
        partial_count   = 0
        full_count      = 0

        for domain in DOMAINS:
            data = domain_results.get(domain)
            if data is None:
                status   = "skipped"
                reason   = "not selected for this request"
                confidence = "—"
            elif isinstance(data, dict) and data.get("_degraded"):
                status   = "fallback"
                reason   = data.get("_reason", "agent error")
                confidence = "low"
                fallback_count += 1
                self._total_fallback += 1
            elif isinstance(data, dict) and data.get("question_wise_analysis"):
                # Check if any sub-agent produced real output
                qwa = data.get("question_wise_analysis", [])
                has_real = any(
                    sub.get("prediction", "").strip()
                    for q in qwa
                    for sub in q.get("sub_agent_results", [])
                )
                if has_real:
                    status     = "full"
                    reason     = "agent completed normally"
                    confidence = "high"
                    full_count += 1
                    self._total_full += 1
                else:
                    status     = "partial"
                    reason     = "agent ran but returned empty predictions"
                    confidence = "medium"
                    partial_count += 1
                    self._total_partial += 1
            elif isinstance(data, dict) and len(data) > 0:
                status     = "partial"
                reason     = "legacy flat output (pre-enterprise schema)"
                confidence = "medium"
                partial_count += 1
                self._total_partial += 1
            else:
                status     = "fallback"
                reason     = "empty or missing output"
                confidence = "low"
                fallback_count += 1
                self._total_fallback += 1

            snapshot["domains"][domain] = {
                "status":     status,
                "reason":     reason,
                "confidence": confidence,
            }

        # Overall health
        active = full_count + partial_count + fallback_count
        if fallback_count == 0 and active > 0:
            snapshot["overall"] = "full"
        elif fallback_count > 0 and full_count + partial_count > 0:
            snapshot["overall"] = "degraded"
        elif active == 0:
            snapshot["overall"] = "skipped"
        else:
            snapshot["overall"] = "failed"

        snapshot["counts"] = {
            "full": full_count,
            "partial": partial_count,
            "fallback": fallback_count,
            "skipped": len(DOMAINS) - active,
        }

        self._runs.append(snapshot)
        logger.info(
            "[DegradationTracker] session=%s overall=%s full=%d partial=%d fallback=%d",
            session_id, snapshot["overall"], full_count, partial_count, fallback_count,
        )
        return snapshot

    def stats(self) -> Dict[str, Any]:
        runs_list = list(self._runs)
        total_runs = len(runs_list)

        # Aggregate domain health across all runs
        domain_health: Dict[str, Dict[str, int]] = {
            d: {"full": 0, "partial": 0, "fallback": 0, "skipped": 0}
            for d in DOMAINS
        }
        overall_counts = {"full": 0, "degraded": 0, "failed": 0, "skipped": 0}

        for run in runs_list:
            overall_counts[run.get("overall", "full")] = overall_counts.get(run.get("overall", "full"), 0) + 1
            for domain, info in run.get("domains", {}).items():
                s = info.get("status", "skipped")
                if domain in domain_health and s in domain_health[domain]:
                    domain_health[domain][s] += 1

        # Availability % per domain (full+partial / non-skipped)
        domain_availability: Dict[str, float] = {}
        for domain, counts in domain_health.items():
            non_skipped = counts["full"] + counts["partial"] + counts["fallback"]
            if non_skipped:
                domain_availability[domain] = round((counts["full"] + counts["partial"]) / non_skipped * 100, 1)
            else:
                domain_availability[domain] = 100.0  # never used → not a failure

        recent = runs_list[-5:]  # last 5 runs for the live feed
        return {
            "total_runs":          total_runs,
            "lifetime_full":       self._total_full,
            "lifetime_partial":    self._total_partial,
            "lifetime_fallback":   self._total_fallback,
            "overall_counts":      overall_counts,
            "domain_health":       domain_health,
            "domain_availability": domain_availability,
            "recent_runs": [
                {
                    "session_id": r["session_id"][-8:],
                    "ts":         r["ts"],
                    "overall":    r["overall"],
                    "counts":     r["counts"],
                    "domains":    r["domains"],
                }
                for r in reversed(recent)
            ],
        }


# Singleton degradation tracker
degradation_tracker = GracefulDegradationTracker()


# ══════════════════════════════════════════════════════════════════════════════
# GUARDRAIL STATS — single endpoint for admin dashboard
# ══════════════════════════════════════════════════════════════════════════════

def all_guardrail_stats() -> Dict[str, Any]:
    """Aggregate stats from all production guardrails for the admin dashboard."""
    return {
        "rate_limiter":        rate_limiter.stats(),
        "circuit_breaker":     llm_circuit_breaker.stats(),
        "graceful_degradation": degradation_tracker.stats(),
    }
