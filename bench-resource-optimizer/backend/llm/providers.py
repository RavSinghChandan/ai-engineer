"""
Provider definitions.

Each provider describes how to instantiate a LangChain-compatible LLM.
All providers use the OpenAI-compatible ChatOpenAI client so we never
need to swap the underlying SDK — only the base_url + model change.

To add a new provider:
  1. Add an entry to PROVIDERS dict
  2. Set the env vars listed in `env_key` and `env_base_url`
  3. Map a task role to the provider in registry.py

Provider keys are stable identifiers — agents reference them by name.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProviderConfig:
    name: str
    env_key: str                        # env var holding the API key
    env_base_url: str                   # env var holding the base URL
    default_model: str                  # model to use when none overridden
    default_base_url: str               # fallback if env_base_url not set
    notes: str = ""                     # human note for docs / interviews
    available: bool = True              # False until API key is supplied

    def api_key(self) -> Optional[str]:
        return os.getenv(self.env_key)

    def base_url(self) -> str:
        return os.getenv(self.env_base_url, self.default_base_url)

    def is_ready(self) -> bool:
        key = self.api_key()
        return bool(key and len(key) > 8 and not key.startswith("your_"))


# ── Provider catalogue ────────────────────────────────────────────────────────
PROVIDERS: dict[str, ProviderConfig] = {

    # ── Active (DeepSeek) ─────────────────────────────────────────────────────
    "deepseek": ProviderConfig(
        name="DeepSeek",
        env_key="DEEPSEEK_API_KEY",
        env_base_url="DEEPSEEK_BASE_URL",
        default_model="deepseek-chat",
        default_base_url="https://api.deepseek.com",
        notes="Primary provider. deepseek-chat for all tasks, deepseek-reasoner for reasoning.",
        available=True,
    ),

    # ── Pending key — reasoning specialist ───────────────────────────────────
    "deepseek_reasoner": ProviderConfig(
        name="DeepSeek-R1 Reasoner",
        env_key="DEEPSEEK_API_KEY",           # same key, different model
        env_base_url="DEEPSEEK_BASE_URL",
        default_model="deepseek-reasoner",
        default_base_url="https://api.deepseek.com",
        notes="Best-in-class chain-of-thought. Used for role-gap reasoning.",
        available=True,                        # same key as deepseek
    ),

    # ── Pending key — parsing specialist ─────────────────────────────────────
    "anthropic": ProviderConfig(
        name="Anthropic Claude",
        env_key="ANTHROPIC_API_KEY",
        env_base_url="ANTHROPIC_BASE_URL",
        default_model="claude-haiku-4-5-20251001",
        default_base_url="https://api.anthropic.com/v1",
        notes="Claude Haiku: fastest structured extraction. Claude Opus: strict judging.",
        available=False,
    ),

    # ── Pending key — generation specialist ──────────────────────────────────
    "openai": ProviderConfig(
        name="OpenAI",
        env_key="OPENAI_API_KEY",
        env_base_url="OPENAI_BASE_URL",
        default_model="gpt-4o",
        default_base_url="https://api.openai.com/v1",
        notes="GPT-4o: creative plan generation. Best for long-form structured output.",
        available=False,
    ),

    # ── Pending key — generation / long-context ───────────────────────────────
    "google": ProviderConfig(
        name="Google Gemini",
        env_key="GOOGLE_API_KEY",
        env_base_url="GOOGLE_BASE_URL",
        default_model="gemini-1.5-pro",
        default_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        notes="Gemini 1.5 Pro: 1M context window — best for large CV + role corpora.",
        available=False,
    ),

    # ── Pending key — embedding specialist ───────────────────────────────────
    "cohere": ProviderConfig(
        name="Cohere",
        env_key="COHERE_API_KEY",
        env_base_url="COHERE_BASE_URL",
        default_model="embed-english-v3.0",
        default_base_url="https://api.cohere.ai/v1",
        notes="embed-english-v3: best semantic search for role/skill matching.",
        available=False,
    ),
}


def get_provider(name: str) -> ProviderConfig:
    if name not in PROVIDERS:
        raise KeyError(f"Unknown provider '{name}'. Available: {list(PROVIDERS)}")
    return PROVIDERS[name]
