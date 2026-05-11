"""
Prompt Loader — AstroIntel 360°
================================
Loads system prompts from versioned .txt files in prompts/v1/ and prompts/v2/.

Usage:
    from prompts.loader import load_system_prompt

    system = load_system_prompt("astrology")          # uses active version from prompt_config
    system = load_system_prompt("astrology", "v1")    # explicit version override

Directory layout:
    prompts/
      v1/   astrology.txt  numerology.txt  tarot.txt  palmistry.txt
            vastu.txt      meta.txt        remedy.txt  admin_review.txt
            report.txt     simplify.txt    question.txt
      v2/   astrology.txt  numerology.txt  meta.txt    report.txt
            simplify.txt   (+ v1 copies for agents that have no v2 variant)

Version switch: agents/prompt_config.py → ACTIVE_PROMPT_VERSION = "v1" | "v2"
Per-agent override: AGENT_VERSION_OVERRIDES = {"meta": "v2"}
"""
from __future__ import annotations

from pathlib import Path
from functools import lru_cache

_PROMPTS_DIR = Path(__file__).parent   # astro-intel-backend/prompts/


@lru_cache(maxsize=64)
def load_system_prompt(agent: str, version: str | None = None) -> str:
    """
    Load the system prompt for the given agent at the given version.

    If version is None, the active version is resolved from prompt_config.
    Results are cached in-process — restart the server to pick up file edits.
    """
    if version is None:
        from agents.prompt_config import get_version
        version = get_version(agent)

    path = _PROMPTS_DIR / version / f"{agent}.txt"

    # Graceful fallback: if v2 file doesn't exist, use v1
    if not path.exists() and version != "v1":
        path = _PROMPTS_DIR / "v1" / f"{agent}.txt"

    if not path.exists():
        raise FileNotFoundError(
            f"Prompt file not found: {path}. "
            f"Expected prompts/{version}/{agent}.txt"
        )

    return path.read_text(encoding="utf-8").strip()
