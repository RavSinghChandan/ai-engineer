"""
Pydantic schemas — single source of truth for all API contracts.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, Field


# ── Input ──────────────────────────────────────────────────────────────────
class UserProfile(BaseModel):
    full_name: str
    alias_name: str = ""
    date_of_birth: str          # YYYY-MM-DD
    time_of_birth: str = ""     # HH:MM
    place_of_birth: str = ""
    pincode: str = ""


class AnalysisRequest(BaseModel):
    user_profile: UserProfile
    user_question: str = ""
    selected_modules: List[str] = Field(
        default=["astrology", "numerology", "palmistry", "tarot", "vastu"]
    )
    module_inputs: Dict[str, Any] = Field(default_factory=dict)


# ── Shared graph state ─────────────────────────────────────────────────────
class GraphState(BaseModel):
    # inputs
    user_profile: UserProfile
    user_question: str = ""
    selected_modules: List[str] = []
    module_inputs: Dict[str, Any] = {}

    # question intent
    focus_context: Dict[str, Any] = {}

    # raw agent outputs (the in-memory RAG store)
    memory: Dict[str, Any] = Field(default_factory=dict)

    # consolidated
    consolidated: Dict[str, Any] = {}

    # remedies
    remedies: Dict[str, Any] = {}

    # admin review
    admin_review: Dict[str, Any] = {}

    # final report
    final_report: Dict[str, Any] = {}

    # execution metadata
    agent_log: List[str] = []
    errors: List[str] = []


# ── Admin approval ─────────────────────────────────────────────────────────
class ApprovalRequest(BaseModel):
    session_id: str
    approved_sections: List[str]
    rejected_sections: List[str]
    brand_name: str = "{{BRAND_NAME}}"
    logo_url: str = "{{LOGO_URL}}"
    image_url: str = "{{IMAGE_URL}}"


# ── Response wrappers ──────────────────────────────────────────────────────
class AnalysisResponse(BaseModel):
    session_id: str
    status: str
    focus_context: Dict[str, Any]
    memory_keys: Dict[str, List[str]]
    admin_review: Dict[str, Any]
    raw_outputs: Dict[str, Any]


class FinalReportResponse(BaseModel):
    session_id: str
    final_report: Dict[str, Any]
