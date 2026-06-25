"""
LLM Registry — task-to-model routing.

Each pipeline task is assigned to the best model for that task.
The registry resolves the task name → provider → LangChain LLM instance.
Fallback: if the preferred provider is not ready (no API key), the
registry automatically falls back to the deepseek provider.

Task roles
──────────
  reasoning    Role-gap analysis, skill inference — needs chain-of-thought
  parsing      CV / document extraction — needs fast structured JSON output
  generation   Training plan creation — needs creativity + long output
  judging      LLM-as-judge hallucination eval — needs strictness
  embedding    Vector search for role-skill matching (future Cohere)
  default      Catch-all for any unlisted task

To swap a task to a new model once you have the key:
  1. Set the API key env var (see providers.py)
  2. Change the provider name in TASK_ROUTING below
  That's it. No agent code changes needed.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

from langchain_openai import ChatOpenAI

from .providers import PROVIDERS, ProviderConfig, get_provider

logger = logging.getLogger("bench.llm_registry")

# ── Task → preferred provider ─────────────────────────────────────────────────
# Right-column = what to switch to once API key is available
TASK_ROUTING: dict[str, str] = {
    # Task name        Current provider        # Future provider (comment)
    "reasoning":       "deepseek_reasoner",    # → deepseek_reasoner (R1)  [already deepseek]
    "parsing":         "deepseek",             # → anthropic (claude-haiku-4-5)
    "generation":      "deepseek",             # → openai (gpt-4o) or google (gemini-1.5-pro)
    "judging":         "deepseek",             # → anthropic (claude-opus-4-8) or openai (gpt-4o)
    "embedding":       "deepseek",             # → cohere (embed-english-v3)
    "default":         "deepseek",
}

# Per-task model overrides (when same provider but different model tier)
TASK_MODEL_OVERRIDE: dict[str, str] = {
    "reasoning":  "deepseek-reasoner",         # R1 on same DeepSeek key
    # "judging":  "claude-opus-4-8",           # uncomment once anthropic key set
    # "parsing":  "claude-haiku-4-5-20251001", # uncomment once anthropic key set
}

# Per-task token limits (tuned for each task's output size)
TASK_MAX_TOKENS: dict[str, int] = {
    "reasoning":   1024,   # longer chain-of-thought
    "parsing":      420,   # compact JSON profile
    "generation":   200,   # per-day task block
    "judging":      300,   # judge verdict + scores
    "embedding":      0,   # not a text-gen task
    "default":      512,
}

# Per-task temperature settings
TASK_TEMPERATURE: dict[str, float] = {
    "reasoning":  0.0,   # deterministic gap analysis
    "parsing":    0.0,   # exact structured extraction
    "generation": 0.7,   # creative plan variety
    "judging":    0.0,   # consistent scoring
    "default":    0.1,
}


class LLMRegistry:
    """
    Resolves task → LangChain ChatOpenAI instance.
    Instances are cached per (provider, model) pair.
    """

    def __init__(self) -> None:
        self._cache: dict[str, ChatOpenAI] = {}

    def _make_llm(self, provider: ProviderConfig, model: Optional[str] = None, task: str = "default") -> ChatOpenAI:
        effective_model = model or provider.default_model
        cache_key = f"{provider.name}::{effective_model}"

        if cache_key in self._cache:
            return self._cache[cache_key]

        api_key = provider.api_key()
        if not api_key:
            raise RuntimeError(
                f"Provider '{provider.name}' is not ready — "
                f"set {provider.env_key} in your .env file.\n"
                f"Note: {provider.notes}"
            )

        llm = ChatOpenAI(
            model=effective_model,
            openai_api_key=api_key,
            openai_api_base=provider.base_url(),
            temperature=TASK_TEMPERATURE.get(task, 0.1),
            max_retries=2,
        )

        self._cache[cache_key] = llm
        logger.info(
            '{"event":"llm_resolved","task":"%s","provider":"%s","model":"%s"}',
            task, provider.name, effective_model,
        )
        return llm

    def get(self, task: str = "default") -> ChatOpenAI:
        """
        Return the best available LLM for the given task.
        Falls back to deepseek if the preferred provider lacks a key.
        """
        preferred_name = TASK_ROUTING.get(task, TASK_ROUTING["default"])
        preferred = get_provider(preferred_name)
        model_override = TASK_MODEL_OVERRIDE.get(task)

        if preferred.is_ready():
            return self._make_llm(preferred, model_override, task)

        # Fallback: log and use deepseek
        logger.warning(
            '{"event":"llm_fallback","task":"%s","preferred":"%s","reason":"no_api_key","fallback":"deepseek"}',
            task, preferred_name,
        )
        fallback = get_provider("deepseek")
        return self._make_llm(fallback, task=task)

    def status(self) -> dict:
        """Return readiness status of all providers — useful for /health endpoint."""
        return {
            "task_routing": TASK_ROUTING,
            "providers": {
                name: {
                    "name": cfg.name,
                    "ready": cfg.is_ready(),
                    "model": cfg.default_model,
                    "notes": cfg.notes,
                }
                for name, cfg in PROVIDERS.items()
            },
        }


# ── Module-level singleton ────────────────────────────────────────────────────
_registry: Optional[LLMRegistry] = None


def get_registry() -> LLMRegistry:
    global _registry
    if _registry is None:
        _registry = LLMRegistry()
    return _registry


def get_llm(task: str = "default") -> ChatOpenAI:
    """Convenience shortcut — get_llm('reasoning'), get_llm('parsing'), etc."""
    return get_registry().get(task)
