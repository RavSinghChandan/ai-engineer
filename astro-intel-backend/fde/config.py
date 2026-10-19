"""
Project-specific settings for the FDE toolkit — AstroIntel (Aura with Rav).
This is the only file in fde/ that differs between projects.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Tuple

import database

PROJECT_NAME = "AstroIntel — Aura with Rav"
BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT

# ── Storage: the app's own database (SQLite locally, PostgreSQL in the cloud) ─
REAL_TYPE = "DOUBLE PRECISION" if database._USE_PG else "REAL"


def get_conn():
    return database.get_conn()


# ── Workflows (task types) ────────────────────────────────────────────────────
# baseline_minutes = how long a practitioner takes for the same report by hand.
# ASSUMPTIONS until measured with the customer; the dashboard labels them so.
WORKFLOWS: Dict[str, Dict[str, Any]] = {
    "question_report": {
        "label": "Question-led report",
        "description": "Birth details + a question → multi-domain insights for human review",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_QUESTION", "45")),
    },
    "holistic_report": {
        "label": "360° life report",
        "description": "Birth details only → 14-chapter life report for human review",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_HOLISTIC", "180")),
    },
}


def is_client_error(exc: BaseException) -> bool:
    """Input refused on purpose (→ 'rejected', not 'failed')."""
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code < 500
    return type(exc).__name__ in {"ValidationError", "InjectionDetected", "GuardrailError"}


def collect_usage() -> Dict[str, Any]:
    """Model usage of the current request, from the DeepSeek client accumulator."""
    try:
        from utils.deepseek_client import get_session_usage
        u = get_session_usage()
        return {"prompt_tokens": u.get("prompt_tokens", 0),
                "completion_tokens": u.get("completion_tokens", 0),
                "model_calls": u.get("calls", 0)}
    except Exception:
        return {}


# ── Pricing (USD per 1M tokens) ───────────────────────────────────────────────
DEFAULT_MODEL = "deepseek-chat"
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
}
PRICING_NOTE = ("deepseek-chat matches the constants used by the app's existing cost tracking; "
                "verify both against DeepSeek's pricing page before quoting costs externally.")

# ── Agent permission matrix (default deny) ────────────────────────────────────
# read = may read · write = may create/modify · approval = a human must approve
_DOMAIN = {
    "read": ["birth_profile", "normalized_questions", "module_inputs"],
    "write": ["domain_readings"],
    "approval": [],
}
PERMISSION_MATRIX: Dict[str, Dict[str, Any]] = {
    "question_agent": {
        "description": "Normalises the user's question and detects intent",
        "read": ["user_question"],
        "write": ["normalized_questions"],
        "approval": [],
    },
    "astrology_agent": {"description": "Domain reading: astrology", **_DOMAIN},
    "numerology_agent": {"description": "Domain reading: numerology", **_DOMAIN},
    "palmistry_agent": {"description": "Domain reading: palmistry", **_DOMAIN},
    "tarot_agent": {"description": "Domain reading: tarot", **_DOMAIN},
    "vastu_agent": {"description": "Domain reading: vastu", **_DOMAIN},
    "meta_agent": {
        "description": "Builds cross-domain consensus; never sees raw birth details",
        "read": ["domain_readings"],
        "write": ["consolidated_insights"],
        "approval": [],
    },
    "remedy_agent": {
        "description": "Suggests remedies from consolidated insights",
        "read": ["consolidated_insights"],
        "write": ["remedies"],
        "approval": [],
    },
    "admin_review_agent": {
        "description": "Drafts the review sheet, using past reviewer corrections",
        "read": ["consolidated_insights", "remedies", "episodic_corrections"],
        "write": ["review_draft"],
        "approval": [],
    },
    "holistic_agent": {
        "description": "Writes the 14 chapters of the 360° report",
        "read": ["birth_profile"],
        "write": ["review_draft"],
        "approval": [],
    },
    "report_agent": {
        "description": "Generates the final report — only from approved insights",
        "read": ["review_draft", "remedies"],
        "write": ["final_report"],
        "approval": ["final_report"],          # a human approves before it is generated
    },
    "grammar_agent": {
        "description": "Polishes wording of the approved report; may not change facts",
        "read": ["final_report"],
        "write": ["final_report"],
        "approval": [],
    },
    "translation_agent": {
        "description": "Translates an approved report",
        "read": ["final_report"],
        "write": ["translated_report"],
        "approval": [],
    },
    "human_reviewer": {
        "kind": "human",
        "description": "Admin who approves, rejects or edits insights; owns corrections",
        "read": ["*"],
        "write": ["review_draft", "final_report", "episodic_corrections"],
        "approval": [],
    },
}
# Not granted to any agent (default deny): lead_contact (email/phone), auth data.

# ── Model-comparison evaluation ───────────────────────────────────────────────
EVAL_DIR = BACKEND_ROOT / "evals"
EVAL_REPORTS_DIR = EVAL_DIR / "reports"
EVAL_DEFAULT_SUITE = "plain_english.json"
EVAL_MODELS = ["deepseek-chat", "deepseek-reasoner"]
EVAL_API_KEY_ENV = "DEEPSEEK_API_KEY"
EVAL_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")


def load_prompt(ref: str) -> Tuple[str, str, str]:
    """(system, user_template, version) of the production prompt named `ref`."""
    if ref == "plain_english":
        from agents.plain_english_agent import _SYSTEM
        return _SYSTEM, "{text}", "plain_english_agent._SYSTEM"
    if ref == "grammar":
        from agents.grammar_agent import _GRAMMAR_SYSTEM
        return _GRAMMAR_SYSTEM, "{text}", "grammar_agent._GRAMMAR_SYSTEM"
    raise KeyError(f"unknown prompt ref '{ref}'")
