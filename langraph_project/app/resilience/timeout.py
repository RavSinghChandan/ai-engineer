"""
Timeout handling for LangGraph nodes and external calls.

Uses concurrent.futures for thread-based timeout (works on all platforms,
unlike signal-based approach which is Unix-only and not safe in async context).
"""

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from functools import wraps
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="timeout-")

DEFAULT_LLM_TIMEOUT = 30.0       # seconds
DEFAULT_TOOL_TIMEOUT = 10.0
DEFAULT_DB_TIMEOUT = 5.0


def with_timeout(seconds: float, fallback: Optional[Any] = None):
    """
    Decorator — raises TimeoutError (or returns fallback) if fn takes
    longer than `seconds`.

    Example:
        @with_timeout(seconds=30, fallback={"error": "timed out"})
        def call_llm(prompt):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            future = _executor.submit(fn, *args, **kwargs)
            try:
                return future.result(timeout=seconds)
            except FuturesTimeout:
                future.cancel()
                logger.error(
                    "Timeout after %.1fs in %s", seconds, fn.__name__
                )
                if fallback is not None:
                    return fallback
                raise TimeoutError(
                    f"{fn.__name__} exceeded {seconds}s timeout"
                )
        return wrapper
    return decorator


def call_with_timeout(
    fn: Callable,
    *args,
    timeout: float = DEFAULT_LLM_TIMEOUT,
    fallback: Optional[Any] = None,
    **kwargs,
) -> Any:
    """
    One-shot timeout wrapper without decorator syntax.

    result = call_with_timeout(llm.invoke, messages, timeout=25)
    """
    future = _executor.submit(fn, *args, **kwargs)
    try:
        return future.result(timeout=timeout)
    except FuturesTimeout:
        future.cancel()
        logger.error("call_with_timeout: %s timed out after %.1fs", getattr(fn, "__name__", fn), timeout)
        if fallback is not None:
            return fallback
        raise TimeoutError(f"Call timed out after {timeout}s")


class TimeoutLLM:
    """
    Wraps any LLM with a timeout on .invoke().
    Composes with FallbackLLM for timeout + fallback.

    Example:
        llm = TimeoutLLM(FallbackLLM(temperature=0), timeout=25)
        response = llm.invoke(messages)
    """

    def __init__(self, llm: Any, timeout: float = DEFAULT_LLM_TIMEOUT):
        self._llm = llm
        self._timeout = timeout

    def invoke(self, messages):
        from langchain_core.messages import AIMessage
        fallback_response = AIMessage(
            content="I'm sorry, the request timed out. Please try again."
        )
        return call_with_timeout(
            self._llm.invoke,
            messages,
            timeout=self._timeout,
            fallback=fallback_response,
        )
