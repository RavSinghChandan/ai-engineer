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
    user_id: str = "anonymous"
    # Accept either a single question string OR a list of questions
    user_question: str = ""
    questions: List[str] = Field(default_factory=list)
    selected_modules: List[str] = Field(
        default=["astrology", "numerology", "palmistry", "tarot", "vastu"]
    )
    module_inputs: Dict[str, Any] = Field(default_factory=dict)
    # Optional geocoded coordinates for precise astronomical computation
    geocode: Optional[Dict[str, Any]] = None
    # Prompt version: "v1" (warm/exploratory) or "v2" (laser-sharp) — default v2
    prompt_version: Optional[str] = "v2"
    # Set True to skip cache and force a fresh pipeline run (admin use)
    bypass_cache: bool = False


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

class EditedInsight(BaseModel):
    """One insight that was manually corrected before approval."""
    insight_id:     str
    original_text:  str
    corrected_text: str
    reason_tag:     str = ""   # e.g. "tone", "wrong_remedy", "factual", "language"


class ApprovalRequest(BaseModel):
    session_id: str
    approved_insight_ids: List[str]
    rejected_insight_ids: List[str]
    brand_name: str = "{{BRAND_NAME}}"
    logo_url: str = "{{LOGO_URL}}"
    image_url: str = "{{IMAGE_URL}}"
    # Optional: insights that were edited before approval → auto-logged to episodic memory
    edited_insights: List[EditedInsight] = Field(default_factory=list)


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


# ── Holistic 360° life report (parallel flow, no user question) ──────────────
class HolisticRequest(BaseModel):
    """A full-life 360° report request. No question — birth details only."""
    user_profile: UserProfile
    user_id: str = "anonymous"
    prompt_version: Optional[str] = "v2"
    bypass_cache: bool = False


class HolisticChapter(BaseModel):
    """One chapter of the 360° book (rendered as story-arc PDF pages)."""
    chapter_id: str                 # stable slug, e.g. "life_path"
    order: int                      # 1-based position (hierarchy of importance)
    title: str                      # e.g. "Your Life Path"
    intent: str                     # career / relationships / health / general …
    story: str                      # [HOOK]…[REMEDIES] labelled story arc
    numbers: Dict[str, Any] = Field(default_factory=dict)  # numbers used


class HolisticReview(BaseModel):
    """Human-in-loop review payload for the holistic flow (mirrors AdminReview)."""
    session_id: str
    user_name: str
    chapters: List[HolisticChapter]
    generated_at: str


class HolisticApprovalRequest(BaseModel):
    session_id: str
    approved_chapter_ids: List[str] = Field(default_factory=list)
    rejected_chapter_ids: List[str] = Field(default_factory=list)
    brand_name: str = "{{BRAND_NAME}}"
    logo_url: str = "{{LOGO_URL}}"
    image_url: str = "{{IMAGE_URL}}"


class HolisticReport(BaseModel):
    """Final approved 360° book — rendered as a 20-30 page storytelling PDF."""
    brand_name: str
    logo_url: str
    image_url: str
    user_name: str
    chapters: List[HolisticChapter]
    generated_at: str
