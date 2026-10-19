"""
Project-specific settings for the FDE toolkit — Bench Resource Optimizer.
This is the only file in fde/ that differs between projects.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, Tuple

PROJECT_NAME = "Bench Resource Optimizer"
BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT

# ── Storage ───────────────────────────────────────────────────────────────────
_DB_PATH = Path(os.environ.get("FDE_DB_PATH", BACKEND_ROOT / "data" / "bench.db"))
REAL_TYPE = "REAL"


def get_conn():
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), timeout=5, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ── Workflows (task types) ────────────────────────────────────────────────────
# baseline_minutes = how long a person takes for the same task by hand.
# ASSUMPTIONS until measured with the customer; the dashboard labels them so.
WORKFLOWS: Dict[str, Dict[str, Any]] = {
    "cv_parsing": {
        "label": "CV parsing",
        "description": "PDF CV → structured profile (skills, experience, roles)",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_CV", "15")),
    },
    "role_mapping": {
        "label": "Role mapping",
        "description": "Profile vs target role → match %, matched and missing skills",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_MAPPING", "30")),
    },
    "plan_generation": {
        "label": "Learning plan",
        "description": "Missing skills → day-by-day upskilling plan",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_PLAN", "60")),
    },
    "progress_update": {
        "label": "Progress update",
        "description": "Completed tasks → readiness score (no model call)",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_PROGRESS", "5")),
    },
    "output_evaluation": {
        "label": "Output evaluation",
        "description": "LLM-as-judge scoring of an AI output",
        "baseline_minutes": float(os.environ.get("FDE_BASELINE_MIN_EVAL", "10")),
    },
}


def is_client_error(exc: BaseException) -> bool:
    """Input refused on purpose (→ 'rejected', not 'failed')."""
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code < 500
    return type(exc).__name__ in {"GuardrailError", "SecurityError", "ValidationError"}


def collect_usage() -> Dict[str, Any]:
    """Model usage of the current task.

    Read from fde.counters (fed by utils/token_tracker.py), not the thread-local
    tracker: the agents run in worker threads, so the endpoint thread's tracker
    would read 0.
    """
    from fde import counters
    c = counters.snapshot()
    return {"prompt_tokens": int(c.get("prompt_tokens", 0)),
            "completion_tokens": int(c.get("completion_tokens", 0)),
            "model_calls": int(c.get("model_calls", 0))}


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
PERMISSION_MATRIX: Dict[str, Dict[str, Any]] = {
    "cv_parser_agent": {
        "description": "Extracts a structured profile from an uploaded CV",
        "read": ["cv_text"],
        "write": ["user_profile"],
        "approval": [],
    },
    "role_mapping_agent": {
        "description": "Scores a profile against a role using retrieved role documents",
        "read": ["user_profile", "role_catalog", "vector_index", "episodic_memory"],
        "write": ["role_mapping", "episodic_memory"],
        "approval": ["deployment_decision"],   # may recommend; a manager decides staffing
    },
    "planning_agent": {
        "description": "Builds the day-by-day learning plan for missing skills",
        "read": ["user_profile", "role_mapping"],
        "write": ["learning_plan"],
        "approval": [],
    },
    "tracking_agent": {
        "description": "Turns completed tasks into a readiness score (rule-based)",
        "read": ["learning_plan", "progress"],
        "write": ["progress", "readiness_score", "episodic_memory"],
        "approval": [],
    },
    "llm_judge": {
        "description": "Scores AI outputs for quality monitoring; changes nothing",
        "read": ["role_mapping", "learning_plan", "evaluation_input"],
        "write": ["evaluation_scores"],
        "approval": [],
    },
    "hr_admin": {
        "kind": "human",
        "description": "HR administrator — owns the role catalog and staffing decisions",
        "read": ["*"],
        "write": ["role_catalog", "vector_index", "deployment_decision"],
        "approval": [],
    },
}

# ── Model-comparison evaluation ───────────────────────────────────────────────
EVAL_DIR = BACKEND_ROOT / "evals"
EVAL_REPORTS_DIR = EVAL_DIR / "reports"
EVAL_DEFAULT_SUITE = "cv_parser.json"
EVAL_MODELS = ["deepseek-chat", "deepseek-reasoner"]
EVAL_API_KEY_ENV = "DEEPSEEK_API_KEY"
EVAL_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")


def load_prompt(ref: str) -> Tuple[str, str, str]:
    """(system, user_template, version) of the production prompt named `ref`."""
    from utils.prompts import get_active
    p = get_active(ref)
    return p.system, p.user, p.version
