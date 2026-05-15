"""
Test Suite: Pydantic Schemas (schemas/models.py)
Covers: validation, defaults, field constraints, serialization.
"""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pydantic import ValidationError
from schemas import UserProfile, AnalysisRequest, ApprovalRequest, FinalReport
from schemas.models import (
    NormalizedQuestion, SubAgentResult, QuestionAnalysis, DomainOutput,
    ConsensusInsight, QuestionConsensus, AdminInsight, AdminQuestion,
    AdminReview, QuestionRemedy, FinalReportSection,
)


VALID_PROFILE = {
    "full_name": "Varun Sharma",
    "date_of_birth": "1990-05-15",
    "time_of_birth": "10:30",
    "place_of_birth": "Delhi",
}


class TestUserProfile:
    def test_minimal_valid_profile(self):
        p = UserProfile(full_name="Test User", date_of_birth="1990-01-01")
        assert p.full_name == "Test User"
        assert p.date_of_birth == "1990-01-01"

    def test_full_profile(self):
        p = UserProfile(**VALID_PROFILE)
        assert p.place_of_birth == "Delhi"

    def test_alias_name_defaults_empty(self):
        p = UserProfile(full_name="X", date_of_birth="2000-01-01")
        assert p.alias_name == ""

    def test_optional_fields_have_defaults(self):
        p = UserProfile(full_name="X", date_of_birth="2000-01-01")
        assert p.time_of_birth == ""
        assert p.place_of_birth == ""
        assert p.pincode == ""

    def test_missing_full_name_raises(self):
        with pytest.raises(ValidationError):
            UserProfile(date_of_birth="1990-01-01")

    def test_missing_dob_raises(self):
        with pytest.raises(ValidationError):
            UserProfile(full_name="X")


class TestAnalysisRequest:
    def test_minimal_valid_request(self):
        req = AnalysisRequest(
            user_profile=UserProfile(**VALID_PROFILE),
            user_question="What is my career?",
        )
        assert req.user_question == "What is my career?"
        assert req.user_id == "anonymous"

    def test_default_modules_all_five(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert set(req.selected_modules) == {"astrology", "numerology", "palmistry", "tarot", "vastu"}

    def test_bypass_cache_defaults_false(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert req.bypass_cache is False

    def test_prompt_version_defaults_v2(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert req.prompt_version == "v2"

    def test_multiple_questions_accepted(self):
        req = AnalysisRequest(
            user_profile=UserProfile(**VALID_PROFILE),
            questions=["career?", "health?", "marriage?"],
        )
        assert len(req.questions) == 3

    def test_questions_defaults_empty_list(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert req.questions == []

    def test_missing_user_profile_raises(self):
        with pytest.raises(ValidationError):
            AnalysisRequest(user_question="test")

    def test_module_inputs_defaults_empty_dict(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert req.module_inputs == {}

    def test_geocode_optional_none(self):
        req = AnalysisRequest(user_profile=UserProfile(**VALID_PROFILE))
        assert req.geocode is None

    def test_geocode_accepted(self):
        req = AnalysisRequest(
            user_profile=UserProfile(**VALID_PROFILE),
            geocode={"lat": 28.6, "lon": 77.2, "timezone": "Asia/Kolkata"},
        )
        assert req.geocode["lat"] == 28.6


class TestApprovalRequest:
    def test_valid_approval(self):
        req = ApprovalRequest(
            session_id="sess-123",
            approved_insight_ids=["q1_i1", "q1_i2"],
            rejected_insight_ids=["q1_i3"],
        )
        assert req.session_id == "sess-123"
        assert "q1_i1" in req.approved_insight_ids

    def test_empty_approval_lists_valid(self):
        req = ApprovalRequest(
            session_id="sess-456",
            approved_insight_ids=[],
            rejected_insight_ids=[],
        )
        assert req.approved_insight_ids == []

    def test_brand_defaults(self):
        req = ApprovalRequest(session_id="s", approved_insight_ids=[], rejected_insight_ids=[])
        assert req.brand_name == "{{BRAND_NAME}}"
        assert req.logo_url == "{{LOGO_URL}}"

    def test_missing_session_id_raises(self):
        with pytest.raises(ValidationError):
            ApprovalRequest(approved_insight_ids=[], rejected_insight_ids=[])


class TestAdminInsight:
    def test_valid_insight(self):
        ai = AdminInsight(
            id="q1_i1",
            content="Career growth looks strong",
            confidence="high",
            domains=["numerology", "astrology"],
            is_common=True,
        )
        assert ai.id == "q1_i1"
        assert ai.editable is True  # default

    def test_confidence_values(self):
        for conf in ["high", "medium", "low"]:
            ai = AdminInsight(id="x", content="y", confidence=conf, domains=[], is_common=False)
            assert ai.confidence == conf


class TestAdminReview:
    def test_valid_admin_review(self):
        review = AdminReview(questions=[
            AdminQuestion(
                question="career?",
                intent="career",
                insights=[
                    AdminInsight(id="q1_i1", content="good", confidence="high",
                                 domains=["numerology"], is_common=True)
                ]
            )
        ])
        assert len(review.questions) == 1

    def test_empty_questions_valid(self):
        review = AdminReview(questions=[])
        assert review.questions == []


class TestQuestionRemedy:
    def test_valid_remedy(self):
        r = QuestionRemedy(
            question="career?",
            habits=["meditate daily"],
            mantras=["Om Shanti"],
            colors=["blue"],
        )
        assert r.question == "career?"
        assert "blue" in r.colors

    def test_empty_remedy_lists_valid(self):
        r = QuestionRemedy(question="health?")
        assert r.habits == []
        assert r.mantras == []
        assert r.colors == []


class TestNormalizedQuestion:
    def test_valid_normalized_question(self):
        nq = NormalizedQuestion(
            question="What about my career?",
            intent="career",
            index=0,
        )
        assert nq.index == 0

    def test_index_required(self):
        with pytest.raises(ValidationError):
            NormalizedQuestion(question="x", intent="general")


class TestSubAgentResult:
    def test_valid_sub_agent_result(self):
        sar = SubAgentResult(
            sub_agent="Indian Numerology",
            question="career?",
            prediction="Success in business ventures.",
            confidence_hint="high",
        )
        assert sar.sub_agent == "Indian Numerology"

    def test_defaults(self):
        sar = SubAgentResult(sub_agent="x", question="y", prediction="z")
        assert sar.traits == []
        assert sar.confidence_hint == "medium"
        assert sar.extra == {}


class TestFinalReport:
    def test_valid_final_report(self):
        from datetime import datetime
        report = FinalReport(
            brand_name="AstroIntel",
            logo_url="https://example.com/logo.png",
            image_url="https://example.com/img.png",
            user_name="Varun Sharma",
            questions=["career?"],
            sections=[
                FinalReportSection(
                    question="career?",
                    insights=["Your career will flourish."],
                )
            ],
            generated_at=datetime.utcnow().isoformat(),
        )
        assert report.brand_name == "AstroIntel"
        assert len(report.sections) == 1

    def test_section_remedy_optional(self):
        section = FinalReportSection(question="q", insights=["insight"])
        assert section.remedy is None
