"""
Circuit Breaker pattern — prevents cascading failures when a downstream
service (OpenAI, DB, payment API) is consistently unavailable.

States:
  CLOSED   → normal operation, requests pass through
  OPEN     → service is down, requests fail fast (no actual calls made)
  HALF_OPEN → cooldown elapsed, one test request allowed through

Usage:
    cb = CircuitBreaker(name="openai", failure_threshold=5, recovery_timeout=60)

    @cb.call
    def call_openai(prompt):
        return llm.invoke(prompt)
"""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from threading import Lock
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5       # failures before OPEN
    recovery_timeout: float = 60.0   # seconds in OPEN before HALF_OPEN
    success_threshold: int = 2        # successes in HALF_OPEN to go CLOSED

    # Internal state
    _state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _success_count: int = field(default=0, init=False)
    _last_failure_time: Optional[float] = field(default=None, init=False)
    _lock: Lock = field(default_factory=Lock, init=False)

    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                if time.monotonic() - (self._last_failure_time or 0) >= self.recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info("[CircuitBreaker:%s] OPEN → HALF_OPEN", self.name)
        return self._state

    def _on_success(self) -> None:
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info("[CircuitBreaker:%s] HALF_OPEN → CLOSED (recovered)", self.name)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0  # reset on any success

    def _on_failure(self, exc: Exception) -> None:
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            logger.warning(
                "[CircuitBreaker:%s] failure %d/%d — %s",
                self.name, self._failure_count, self.failure_threshold, exc,
            )
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.error("[CircuitBreaker:%s] CLOSED → OPEN (threshold reached)", self.name)

    def call(self, fn: Callable) -> Callable:
        """Decorator — wraps any callable with circuit-breaker protection."""
        @wraps(fn)
        def wrapper(*args, **kwargs):
            current_state = self.state
            if current_state == CircuitState.OPEN:
                raise CircuitOpenError(
                    f"Circuit '{self.name}' is OPEN — service unavailable. "
                    f"Retry after {self.recovery_timeout}s."
                )
            try:
                result = fn(*args, **kwargs)
                self._on_success()
                return result
            except CircuitOpenError:
                raise
            except Exception as exc:
                self._on_failure(exc)
                raise
        return wrapper

    def status(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "last_failure_time": self._last_failure_time,
        }


class CircuitOpenError(RuntimeError):
    """Raised when a circuit breaker is in OPEN state."""


# ── Pre-built breakers for banking AI services ───────────────────────────

openai_breaker = CircuitBreaker(
    name="openai",
    failure_threshold=5,
    recovery_timeout=60.0,
    success_threshold=2,
)

vector_store_breaker = CircuitBreaker(
    name="vector_store",
    failure_threshold=3,
    recovery_timeout=30.0,
    success_threshold=1,
)

payment_api_breaker = CircuitBreaker(
    name="payment_api",
    failure_threshold=3,
    recovery_timeout=120.0,
    success_threshold=2,
)


def get_all_breaker_statuses() -> list[dict]:
    return [
        openai_breaker.status(),
        vector_store_breaker.status(),
        payment_api_breaker.status(),
    ]
