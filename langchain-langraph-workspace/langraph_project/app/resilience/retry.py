"""
Retry strategies using tenacity.

Three pre-built decorators cover the common banking AI patterns:
  - llm_retry        : transient OpenAI/network failures (3 attempts, exp backoff)
  - db_retry         : database / cache misses (5 attempts, fixed 1s)
  - critical_retry   : payment / fraud critical path (7 attempts, jitter)
"""

import logging
from functools import wraps
from typing import Callable, Optional, Tuple, Type

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    wait_fixed,
    wait_random_exponential,
    before_sleep_log,
    RetryError,
)

logger = logging.getLogger(__name__)

# Exceptions worth retrying on (transient)
_TRANSIENT = (
    ConnectionError,
    TimeoutError,
    OSError,
)

try:
    import openai
    _TRANSIENT = _TRANSIENT + (
        openai.APIConnectionError,
        openai.APITimeoutError,
        openai.RateLimitError,
        openai.InternalServerError,
    )
except ImportError:
    pass


# ── Pre-built retry decorators ────────────────────────────────────────────

llm_retry = retry(
    retry=retry_if_exception_type(_TRANSIENT),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

db_retry = retry(
    retry=retry_if_exception_type(_TRANSIENT),
    stop=stop_after_attempt(5),
    wait=wait_fixed(1),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

critical_retry = retry(
    retry=retry_if_exception_type(_TRANSIENT),
    stop=stop_after_attempt(7),
    wait=wait_random_exponential(multiplier=0.5, max=30),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


# ── Generic factory ────────────────────────────────────────────────────────

def make_retry(
    max_attempts: int = 3,
    exceptions: Tuple[Type[Exception], ...] = _TRANSIENT,
    wait_seconds: float = 1.0,
) -> Callable:
    """Build a custom retry decorator at runtime."""
    return retry(
        retry=retry_if_exception_type(exceptions),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=wait_seconds, min=wait_seconds, max=wait_seconds * 8),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )


def with_retry_fallback(
    primary_fn: Callable,
    fallback_fn: Callable,
    exceptions: Tuple[Type[Exception], ...] = _TRANSIENT,
    max_attempts: int = 3,
):
    """
    Calls primary_fn with retry; if it still fails after all attempts,
    calls fallback_fn instead of raising.
    """
    @wraps(primary_fn)
    def wrapper(*args, **kwargs):
        decorated = make_retry(max_attempts, exceptions)(primary_fn)
        try:
            return decorated(*args, **kwargs)
        except (RetryError, Exception) as exc:
            logger.warning(
                "Primary function %s failed after %d attempts — using fallback. err=%s",
                primary_fn.__name__, max_attempts, exc,
            )
            return fallback_fn(*args, **kwargs)
    return wrapper
