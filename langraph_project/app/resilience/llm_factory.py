"""
Resilient LLM factory — single entry point for all agents.

Composes: circuit breaker → retry → fallback chain → timeout
Every LLM call in the platform should go through get_resilient_llm().

Layer order (outermost → innermost):
  1. Circuit breaker  — fail fast if OpenAI is known-down
  2. Retry            — retry transient failures (3 attempts, exp backoff)
  3. Fallback chain   — try gpt-4o-mini → gpt-3.5-turbo → rule-based
  4. Timeout          — hard 30s ceiling on any single call
"""

import logging
from typing import List, Optional

from langchain_core.messages import BaseMessage, AIMessage

from app.resilience.circuit_breaker import openai_breaker, CircuitOpenError
from app.resilience.fallback import FallbackLLM, _rule_based_fallback
from app.resilience.timeout import TimeoutLLM, DEFAULT_LLM_TIMEOUT
from app.resilience.retry import llm_retry

logger = logging.getLogger(__name__)


class ResilientLLM:
    """
    Drop-in LLM with the full resilience stack:
      circuit breaker → retry → fallback → timeout
    """

    def __init__(
        self,
        temperature: float = 0,
        intent: Optional[str] = None,
        timeout: float = DEFAULT_LLM_TIMEOUT,
    ):
        self._temperature = temperature
        self._intent = intent
        self._timeout = timeout

        # Inner fallback LLM (handles model chain: primary → secondary → rule-based)
        _fallback_llm = FallbackLLM(temperature=temperature, intent=intent)
        # Wrap with timeout
        self._timed_llm = TimeoutLLM(_fallback_llm, timeout=timeout)

    def invoke(self, messages: List[BaseMessage]) -> AIMessage:
        # Circuit breaker check (fast path — no I/O)
        if openai_breaker.state.value == "open":
            logger.error("Circuit OPEN — returning rule-based response immediately")
            return _rule_based_fallback(messages, self._intent)

        @llm_retry
        def _call():
            return self._timed_llm.invoke(messages)

        try:
            result = openai_breaker.call(_call)()
            return result
        except CircuitOpenError as exc:
            logger.error("CircuitOpenError: %s", exc)
            return _rule_based_fallback(messages, self._intent)
        except Exception as exc:
            logger.error("ResilientLLM final failure: %s", exc)
            return _rule_based_fallback(messages, self._intent)


def get_resilient_llm(
    temperature: float = 0,
    intent: Optional[str] = None,
    timeout: float = DEFAULT_LLM_TIMEOUT,
) -> ResilientLLM:
    """Factory — returns a fully resilient LLM instance."""
    return ResilientLLM(temperature=temperature, intent=intent, timeout=timeout)
