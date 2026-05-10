"""
Token Tracking via LangChain Callbacks — Module 1 pattern (Token Economics).

LangChain's ChatOpenAI doesn't expose raw API usage like direct HTTP calls.
This callback handler intercepts every LLM call and extracts real token counts
from the LLM response object, then accumulates them in a thread-local store.

Pattern: same as AstroIntel's deepseek_client thread-local accumulator,
but hooked into LangChain's callback system instead.

Usage:
    tracker = get_tracker()
    tracker.reset()
    # ... LLM calls happen (tracker is passed via callbacks=[tracker]) ...
    usage = tracker.get_usage()
    # usage = {"prompt_tokens": 437, "completion_tokens": 272, "total_tokens": 709, "calls": 1}

DeepSeek pricing (same as AstroIntel):
    $0.14 / 1M input tokens
    $0.28 / 1M output tokens
"""
from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional
from uuid import UUID

from langchain.callbacks.base import BaseCallbackHandler
from langchain_core.outputs import LLMResult

_INPUT_COST_PER_M  = 0.14
_OUTPUT_COST_PER_M = 0.28


class TokenTracker(BaseCallbackHandler):
    """
    LangChain callback handler that accumulates real token counts.
    Pass as callbacks=[tracker] to any LangChain chain invocation.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self._prompt_tokens     = 0
            self._completion_tokens = 0
            self._calls             = 0

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        """Called after every LLM call with the response including token usage."""
        usage = {}

        # Try LangChain >= 0.2 usage_metadata path
        for gen_list in response.generations:
            for gen in gen_list:
                if hasattr(gen, "message") and hasattr(gen.message, "usage_metadata"):
                    meta = gen.message.usage_metadata
                    if meta:
                        usage = {
                            "prompt_tokens":     meta.get("input_tokens", 0),
                            "completion_tokens": meta.get("output_tokens", 0),
                        }
                        break

        # Fallback: llm_output dict (older LangChain / OpenAI-compatible APIs)
        if not usage and response.llm_output:
            raw = response.llm_output.get("token_usage", {})
            usage = {
                "prompt_tokens":     raw.get("prompt_tokens", 0),
                "completion_tokens": raw.get("completion_tokens", 0),
            }

        with self._lock:
            self._prompt_tokens     += usage.get("prompt_tokens", 0)
            self._completion_tokens += usage.get("completion_tokens", 0)
            self._calls             += 1

    def get_usage(self) -> Dict[str, Any]:
        with self._lock:
            pt = self._prompt_tokens
            ct = self._completion_tokens
            cost = (pt * _INPUT_COST_PER_M + ct * _OUTPUT_COST_PER_M) / 1_000_000
            return {
                "prompt_tokens":     pt,
                "completion_tokens": ct,
                "total_tokens":      pt + ct,
                "calls":             self._calls,
                "cost_usd":          round(cost, 8),
            }


# ── Request-scoped tracker (one per request, thread-safe) ────────────────────

_local = threading.local()


def get_tracker() -> TokenTracker:
    """Return the tracker for the current thread. Creates one if not present."""
    if not hasattr(_local, "tracker"):
        _local.tracker = TokenTracker()
    return _local.tracker


def reset_tracker() -> None:
    """Reset token counts for the current thread. Call at request start."""
    get_tracker().reset()


def get_usage() -> Dict[str, Any]:
    """Return accumulated token usage for the current thread."""
    return get_tracker().get_usage()
