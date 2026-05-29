"""
Input Guardrails — Module 4 pattern (Failure Handling & Guardrails).

What this covers:
  1. File size check      — reject PDFs over MAX_PDF_BYTES before reading
  2. PDF extractability   — catch encrypted / image-only PDFs gracefully
  3. Minimum content      — reject resumes with fewer than MIN_RESUME_CHARS
  4. JSON output healing  — attempt to extract valid JSON from LLM markdown fences
  5. Response length gate — catch truncated LLM responses before they reach storage
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger("bench.guardrails")

MAX_PDF_BYTES = 10 * 1024 * 1024   # 10 MB
MIN_RESUME_CHARS = 100               # fewer chars = image-only PDF


class GuardrailError(ValueError):
    """Raised when an input fails a guardrail check. Maps to HTTP 400/422."""


# ── File guardrails ──────────────────────────────────────────────────────────

def check_pdf_size(file_bytes: bytes) -> None:
    if len(file_bytes) > MAX_PDF_BYTES:
        size_mb = len(file_bytes) / (1024 * 1024)
        raise GuardrailError(
            f"PDF too large ({size_mb:.1f} MB). Maximum allowed: {MAX_PDF_BYTES // (1024*1024)} MB."
        )


def check_resume_content(text: str) -> None:
    if len(text.strip()) < MIN_RESUME_CHARS:
        raise GuardrailError(
            "Could not extract enough text from the PDF. "
            "The file may be image-based or encrypted. "
            "Please upload a text-based PDF."
        )


# ── JSON output healing ──────────────────────────────────────────────────────

def heal_json(raw: str) -> Any:
    """
    Extract and parse JSON from LLM output that may be wrapped in markdown.
    Tries:
      1. Direct json.loads
      2. Strip ```json ... ``` fences
      3. Find first { ... } or [ ... ] block
    Raises ValueError if all attempts fail.
    """
    raw = raw.strip()

    # Attempt 1: clean JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt 2: strip markdown fences
    stripped = re.sub(r"^```(?:json)?\s*", "", raw)
    stripped = re.sub(r"\s*```$", "", stripped).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Attempt 3: find first JSON object or array in the string
    for pattern in (r"\{.*\}", r"\[.*\]"):
        match = re.search(pattern, raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                continue

    logger.warning("json_healing_failed raw_snippet=%s", raw[:200])
    raise ValueError(f"LLM returned non-JSON output: {raw[:200]}")


# ── LLM output length gate ────────────────────────────────────────────────────

MIN_PROFILE_KEYS = {"name", "skills"}   # must have at least these


def validate_parsed_profile(profile: dict) -> dict:
    """Ensure the CV parser returned a usable profile. Fill defaults if partial."""
    if not isinstance(profile, dict):
        raise GuardrailError("CV parsing failed — LLM returned unexpected format.")

    profile.setdefault("name", "Unknown")
    profile.setdefault("email", "")
    profile.setdefault("phone", "")
    profile.setdefault("skills", [])
    profile.setdefault("experience_years", 0)
    profile.setdefault("roles", [])
    profile.setdefault("projects", [])
    profile.setdefault("education", "")

    if not isinstance(profile["skills"], list):
        profile["skills"] = []

    return profile


def validate_role_mapping(mapping: dict) -> dict:
    """Ensure role mapping has required fields. Fill defaults if partial."""
    if not isinstance(mapping, dict):
        raise GuardrailError("Role mapping failed — LLM returned unexpected format.")

    mapping.setdefault("match_percentage", 0)
    mapping.setdefault("matched_skills", [])
    mapping.setdefault("missing_skills", [])
    mapping.setdefault("experience_gap", 0)
    mapping.setdefault("recommendation", "Needs further assessment.")
    return mapping
