"""
LLM Registry — multi-model routing layer.

Each task in the pipeline is assigned to the model best suited for it.
Right now every role points to DeepSeek (single API key).
When you obtain additional API keys, change only the provider/model
fields in registry.py — no agent code needs to change.

Task → best-in-market model (future)   | Current (deepseek fallback)
─────────────────────────────────────────────────────────────────────
reasoning     DeepSeek-R1              | deepseek-reasoner
parsing       Claude Haiku 3.5         | deepseek-chat
generation    GPT-4o / Gemini 1.5 Pro  | deepseek-chat
embedding     Cohere embed-v3          | deepseek-chat (text, not embed)
judging       Claude Opus / GPT-4o     | deepseek-chat
"""
from .registry import LLMRegistry, get_llm, get_registry

__all__ = ["LLMRegistry", "get_llm", "get_registry"]
