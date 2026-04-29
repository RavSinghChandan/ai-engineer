"""
Pydantic schemas — single source of truth for all API contracts.
Supports multiple questions per request (enterprise multi-agent spec).
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
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
    # Accept either a single question string OR a list of questions
    user_question: str = ""
    questions: List[str] = Field(default_factory=list)
    selected_modules: List[str] = Field(
        default=["astrology", "numerology", "palmistry", "tarot", "vastu"]
    )
    module_inputs: Dict[str, Any] = Field(default_factory=dict)


# ── Normalised question ────────────────────────────────────────────────────
class NormalizedQuestion(BaseModel):
    question: str
    intent: str          # career / marriage / finance / health / spirituality / general …
    index: int           # 0-based position in original list


# ── Sub-agent result (one question, one tradition) ─────────────────────────
class SubAgentResult(BaseModel):
    sub_agent: str               # e.g. "Indian Numerology"
    question: str
    prediction: str
    traits: List[str] = []
    confidence_hint: str = "medium"   # low / medium / high
    extra: Dict[str, Any] = {}        # tradition-specific data


# ── Domain-level question-wise analysis ────────────────────────────────────
class QuestionAnalysis(BaseModel):
    question: str
    intent: str
    sub_agent_results: List[SubAgentResult]
    domain_summary: str
    agreements: List[str] = []
    conflicts: List[str] = []


class DomainOutput(BaseModel):
    domain: str
    question_wise_analysis: List[QuestionAnalysis]


# ── Meta / consensus ───────────────────────────────────────────────────────
class ConsensusInsight(BaseModel):
    content: str
    confidence: str              # high / medium / low
    domains: List[str]
    is_common: bool              # True if 3+ domains agree
    source_predictions: List[str] = []


class QuestionConsensus(BaseModel):
    question: str
    intent: str
    insights: List[ConsensusInsight]
    key_insight: str             # single strongest takeaway


# ── Admin review ───────────────────────────────────────────────────────────
class AdminInsight(BaseModel):
    id: str                      # e.g. "q1_i1"
    content: str
    confidence: str
    domains: List[str]
    is_common: bool
    editable: bool = True


class AdminQuestion(BaseModel):
    question: str
    intent: str
    insights: List[AdminInsight]


class AdminReview(BaseModel):
    questions: List[AdminQuestion]


# ── Remedy ─────────────────────────────────────────────────────────────────
class QuestionRemedy(BaseModel):
    question: str
    habits: List[str] = []
    mantras: List[str] = []
    colors: List[str] = []


# ── Approval ───────────────────────────────────────────────────────────────
class ApprovalRequest(BaseModel):
    session_id: str
    approved_insight_ids: List[str]
    rejected_insight_ids: List[str]
    brand_name: str = "{{BRAND_NAME}}"
    logo_url: str = "{{LOGO_URL}}"
    image_url: str = "{{IMAGE_URL}}"


# ── Final report ───────────────────────────────────────────────────────────
class FinalReportSection(BaseModel):
    question: str
    insights: List[str]
    remedy: Optional[QuestionRemedy] = None


class FinalReport(BaseModel):
    brand_name: str
    logo_url: str
    image_url: str
    user_name: str
    questions: List[str]
    sections: List[FinalReportSection]
    generated_at: str
