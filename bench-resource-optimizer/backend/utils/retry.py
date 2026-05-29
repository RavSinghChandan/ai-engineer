"""
LLM Retry + Circuit Breaker — Module 4 pattern (Failure Handling & Guardrails).

Why this exists:
  DeepSeek (and any LLM API) fails transiently — rate limits (429), timeouts, 5xx.
  Without retry logic, a single bad call = user-visible error.
  With circuit breaker, sustained failures stop traffic instead of queuing it up.

Circuit breaker states:
  CLOSED  → normal operation, calls pass through
  OPEN    → too many failures in window → fast-fail all calls for `reset_timeout` seconds
  HALF-OPEN → after reset_timeout, allow one probe call; success → CLOSED, fail → OPEN
"""
from __future__ import annotations

import asyncio
import functools
import logging
import time
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger("bench.retry")

F = TypeVar("F", bound=Callable[..., Any])

# ── Circuit Breaker ──────────────────────────────────────────────────────────


class _State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        reset_timeout: float = 30.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self._state = _State.CLOSED
        self._failures = 0
        self._opened_at: Optional[float] = None

    @property
    def state(self) -> _State:
        if self._state == _State.OPEN:
            if time.monotonic() - (self._opened_at or 0) >= self.reset_timeout:
                self._state = _State.HALF_OPEN
        return self._state

    def record_success(self) -> None:
        self._failures = 0
        self._state = _State.CLOSED
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = _State.OPEN
            self._opened_at = time.monotonic()
            logger.warning(
                "circuit_breaker=%s state=OPEN failures=%d",
                self.name, self._failures,
            )

    def is_open(self) -> bool:
        return self.state == _State.OPEN


# ── Global circuit breakers (one per LLM operation type) ────────────────────
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(name: str) -> CircuitBreaker:
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(name)
    return _breakers[name]


def breaker_status() -> dict:
    return {name: cb.state.value for name, cb in _breakers.items()}


# ── Retry with exponential backoff ──────────────────────────────────────────

async def with_retry(
    fn: Callable,
    *args,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    breaker_name: str = "llm",
    **kwargs,
) -> Any:
    """
    Call fn(*args, **kwargs) with retry + circuit breaker.

    Retry schedule:
      attempt 1 → immediate
      attempt 2 → 1s delay
      attempt 3 → 2s delay
    Respects circuit breaker: fast-fails when OPEN.
    """
    cb = get_breaker(breaker_name)

    for attempt in range(1, max_attempts + 1):
        if cb.is_open():
            raise RuntimeError(
                f"Circuit breaker '{breaker_name}' is OPEN — "
                f"LLM API degraded. Retry in {cb.reset_timeout}s."
            )

        try:
            if asyncio.iscoroutinefunction(fn):
                result = await fn(*args, **kwargs)
            else:
                result = await asyncio.get_event_loop().run_in_executor(None, functools.partial(fn, *args, **kwargs))
            cb.record_success()
            return result

        except Exception as exc:
            cb.record_failure()
            logger.warning(
                "llm_call_failed breaker=%s attempt=%d/%d error=%s",
                breaker_name, attempt, max_attempts, exc,
            )
            if attempt == max_attempts:
                raise
            await asyncio.sleep(base_delay * (2 ** (attempt - 1)))
