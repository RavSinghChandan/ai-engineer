"""
Prompt Loader — Bench Resource Optimizer
=========================================
Loads system prompts from versioned .txt files in prompts/v1/ and prompts/v2/.

Usage:
    from prompts.loader import load_system_prompt

    system = load_system_prompt("cv_parser")          # uses ACTIVE_VERSIONS from utils/prompts.py
    system = load_system_prompt("cv_parser", "v1")    # explicit version override

Directory layout:
    prompts/
      v1/   cv_parser.txt  role_mapper.txt  hyde.txt  llm_judge.txt
      v2/   cv_parser.txt  role_mapper.txt  hyde.txt  llm_judge.txt
            (hyde + llm_judge are copies of v1 — no v2 variant yet)

Version switch: utils/prompts.py → ACTIVE_VERSIONS dict
  e.g. ACTIVE_VERSIONS = {"cv_parser": "v2", "role_mapper": "v2", "planner": "v1", ...}
"""
from __future__ import annotations

from pathlib import Path
from functools import lru_cache

_PROMPTS_DIR = Path(__file__).parent   # bench-resource-optimizer/backend/prompts/


@lru_cache(maxsize=32)
def load_system_prompt(agent: str, version: str | None = None) -> str:
    """
    Load the system prompt for the given agent at the given version.

    If version is None, the active version is resolved from ACTIVE_VERSIONS in utils/prompts.py.
    Results are LRU-cached in-process — restart the server to pick up file edits.
    """
    if version is None:
        from utils.prompts import ACTIVE_VERSIONS
        version = ACTIVE_VERSIONS.get(agent, "v1")

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
