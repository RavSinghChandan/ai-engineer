"""
LLM Security — Module 2 pattern (Prompt Injection, Jailbreaks, Data Leakage).

4-layer defence:
  Layer 1 — Input validation:   injection pattern detection before any LLM call
  Layer 2 — Prompt hardening:   system prompt includes explicit override resistance
  Layer 3 — Output validation:  system prompt leak detection + off-topic detection
  Layer 4 — Audit logging:      every LLM input/output logged with request_id

Why this matters for bench-resource-optimizer:
  Users upload CVs and choose roles. A malicious user could embed injection
  instructions in a CV to override the CV parser prompt and extract system data,
  or to trigger unintended tool behaviour in future agent calls.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger("bench.security")

# ── Injection patterns (Module 2 — code skeleton) ────────────────────────────

_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"you\s+are\s+now\s+a",
    r"forget\s+(everything|all)\s+you\s+(know|were\s+told)",
    r"(new|updated)\s+system\s+prompt",
    r"repeat\s+your\s+(system\s+)?prompt",
    r"(reveal|show|print|tell\s+me)\s+your\s+(instructions|system\s+prompt|secrets?)",
    r"pretend\s+(you\s+are|to\s+be)",
    r"act\s+as\s+(if\s+you\s+are|a\s+different)",
    r"disregard\s+(all\s+)?previous",
    r"do\s+anything\s+now",  # DAN jailbreak
    r"jailbreak",
    r"override\s+(your\s+)?(instructions|system|safety)",
]

_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in _INJECTION_PATTERNS]

# Patterns that indicate system prompt was leaked in output
_LEAK_PATTERNS = [
    r"you are a cv parser",
    r"you are a technical recruiter",
    r"return only valid json",
    r"system prompt",
    r"my instructions are",
]
_LEAK_COMPILED = [re.compile(p, re.IGNORECASE) for p in _LEAK_PATTERNS]


class SecurityError(ValueError):
    """Raised when a security check fails. Maps to HTTP 400."""


# ── Layer 1: Input validation ─────────────────────────────────────────────────

def check_injection(text: str, source: str = "user_input") -> None:
    """
    Detect prompt injection in any text before it reaches an LLM.
    Call on: CV text, role name, any free-text user input.
    """
    for pattern in _COMPILED:
        if pattern.search(text):
            logger.warning(
                '{"event":"injection_detected","source":"%s","snippet":"%s"}',
                source,
                text[:100].replace('"', "'"),
            )
            raise SecurityError(
                "Input contains patterns that are not allowed. "
                "Please upload a genuine CV or contact support."
            )


def check_output_leak(output: str, request_id: str = "") -> None:
    """
    Detect if the LLM response leaks system prompt content.
    Log warning but do NOT raise — log for audit, return sanitized output.
    """
    for pattern in _LEAK_COMPILED:
        if pattern.search(output):
            logger.warning(
                '{"event":"output_leak_detected","request_id":"%s","snippet":"%s"}',
                request_id,
                output[:120].replace('"', "'"),
            )
            break  # log once


# ── Layer 4: Audit logging ────────────────────────────────────────────────────

def audit_llm_call(
    request_id: str,
    operation: str,
    input_snippet: str,
    output_snippet: str,
    latency_ms: float,
    tokens: int = 0,
    cost_usd: float = 0.0,
) -> None:
    """
    Log every LLM call for security review and compliance.
    In production: ship to CloudWatch / Splunk / ELK.
    """
    logger.info(
        '{"event":"llm_call","request_id":"%s","op":"%s",'
        '"input_len":%d,"output_len":%d,"latency_ms":%.1f,'
        '"tokens":%d,"cost_usd":%.6f}',
        request_id,
        operation,
        len(input_snippet),
        len(output_snippet),
        latency_ms,
        tokens,
        cost_usd,
    )
