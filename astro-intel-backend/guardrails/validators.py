"""
Per-node input and output validators.
Each validator returns (ok: bool, reason: str).
"""
from __future__ import annotations
import re
from typing import Any, Dict, Tuple

ValidationResult = Tuple[bool, str]

# ── helpers ──────────────────────────────────────────────────────────────────

INJECTION_PATTERNS = re.compile(
    r"(ignore previous|ignore all|jailbreak|act as|you are now|system prompt|"
    r"forget your instructions|disregard|override instructions)",
    re.IGNORECASE,
)

GARBAGE_PATTERN = re.compile(r"^[^a-zA-Z0-9\s]{4,}$")


def _has_injection(text: str) -> bool:
    return bool(INJECTION_PATTERNS.search(text))


def _is_garbage(text: str) -> bool:
    return bool(GARBAGE_PATTERN.match(text.strip())) if text else False


def _required_keys(state: Dict, *keys: str) -> ValidationResult:
    missing = [k for k in keys if k not in state]
    if missing:
        return False, f"Missing required keys: {missing}"
    return True, ""


# ── INPUT VALIDATORS ─────────────────────────────────────────────────────────

def validate_input_question_agent(state: Dict[str, Any]) -> ValidationResult:
    q = state.get("user_question", "")
    qs = state.get("questions", [])

    if not q and not qs:
        # Allow — falls back to general overview inside the agent
        return True, ""

    all_texts = ([q] if q else []) + list(qs)
    for text in all_texts:
        if not isinstance(text, str):
            return False, f"Question must be a string, got {type(text).__name__}"
        if _has_injection(text):
            return False, "Prompt injection pattern detected in question input"
        if _is_garbage(text):
            return False, f"Garbage input detected: {text!r}"
        if len(text) > 2000:
            return False, "Question exceeds maximum length of 2000 characters"

    return True, ""


def validate_input_domain_agents(state: Dict[str, Any]) -> ValidationResult:
    ok, reason = _required_keys(state, "normalized_questions", "focus_context")
    if not ok:
        return False, reason

    nq = state["normalized_questions"]
    if not isinstance(nq, list) or len(nq) == 0:
        return False, "normalized_questions must be a non-empty list"

    fc = state["focus_context"]
    if not isinstance(fc, dict) or "intent" not in fc:
        return False, "focus_context must contain an 'intent' key"

    return True, ""


def validate_input_meta_agent(state: Dict[str, Any]) -> ValidationResult:
    # Domain agents write into state["memory"] — check at least one key is present
    memory = state.get("memory", {})
    domain_keys = ["numerology", "astrology", "palmistry", "tarot", "vastu"]
    present = [k for k in domain_keys if memory.get(k)]
    if not present:
        return False, "meta_agent requires at least one domain reading in state['memory']"
    return True, ""


def validate_input_remedy_agent(state: Dict[str, Any]) -> ValidationResult:
    # meta_agent writes to state["consolidated"]
    ok, reason = _required_keys(state, "consolidated")
    if not ok:
        return False, reason
    if not isinstance(state["consolidated"], dict):
        return False, "consolidated must be a dict"
    return True, ""


def validate_input_admin_review_agent(state: Dict[str, Any]) -> ValidationResult:
    # remedy_agent writes to state["remedies"]; meta writes to state["consolidated"]
    ok, reason = _required_keys(state, "consolidated", "remedies")
    if not ok:
        return False, reason
    return True, ""


# ── OUTPUT VALIDATORS ─────────────────────────────────────────────────────────

def validate_output_question_agent(state: Dict[str, Any]) -> ValidationResult:
    ok, reason = _required_keys(state, "normalized_questions", "focus_context")
    if not ok:
        return False, reason
    if not state["normalized_questions"]:
        return False, "normalized_questions must not be empty after question_agent"
    return True, ""


def validate_output_domain_agents(state: Dict[str, Any]) -> ValidationResult:
    # Domain agents write into state["memory"][domain_name]
    memory = state.get("memory", {})
    domain_keys = ["numerology", "astrology", "palmistry", "tarot", "vastu"]
    present = [k for k in domain_keys if memory.get(k)]
    if not present:
        return False, "domain_agents produced no domain readings in state['memory']"
    return True, ""


def validate_output_meta_agent(state: Dict[str, Any]) -> ValidationResult:
    # meta_agent writes to state["consolidated"]
    ok, reason = _required_keys(state, "consolidated")
    if not ok:
        return False, reason
    if not isinstance(state["consolidated"], dict) or not state["consolidated"]:
        return False, "consolidated must be a non-empty dict after meta_agent"
    return True, ""


def validate_output_remedy_agent(state: Dict[str, Any]) -> ValidationResult:
    ok, reason = _required_keys(state, "remedies")
    if not ok:
        return False, reason
    return True, ""


def validate_output_admin_review_agent(state: Dict[str, Any]) -> ValidationResult:
    # admin_review_agent writes to state["admin_review"], not "final_report"
    ok, reason = _required_keys(state, "admin_review")
    if not ok:
        return False, reason
    return True, ""


# ── Registry ─────────────────────────────────────────────────────────────────

INPUT_VALIDATORS = {
    "question_agent":     validate_input_question_agent,
    "domain_agents":      validate_input_domain_agents,
    "meta_agent":         validate_input_meta_agent,
    "remedy_agent":       validate_input_remedy_agent,
    "admin_review_agent": validate_input_admin_review_agent,
}

OUTPUT_VALIDATORS = {
    "question_agent":     validate_output_question_agent,
    "domain_agents":      validate_output_domain_agents,
    "meta_agent":         validate_output_meta_agent,
    "remedy_agent":       validate_output_remedy_agent,
    "admin_review_agent": validate_output_admin_review_agent,
}
