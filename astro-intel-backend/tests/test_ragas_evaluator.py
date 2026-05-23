"""
RAGAS Evaluation Tests
========================
Positive, Negative, Integration, and Smoke tests for
metrics/ragas_evaluator.py and GET /api/v1/metrics/ragas.

Run:
  cd astro-intel-backend
  pytest tests/test_ragas_evaluator.py -v
"""
from __future__ import annotations
import pytest
from metrics.ragas_evaluator import (
    evaluate, summary, get_record,
    _score_faithfulness, _score_answer_relevancy,
    _score_context_precision, _score_domain_recall,
    _records, THRESHOLDS,
)


def _reset():
    _records.clear()


def _make_report(domains=None, questions=None) -> dict:
    return {
        "domains": domains or {
            "numerology": [{"insights": [
                {"id": "i1", "text": "Life Path 1 drives career independence.", "confidence": "high"},
                {"id": "i2", "text": "Personal Year 3 brings creative growth.",  "confidence": "medium"},
            ]}],
            "astrology": [{"insights": [
                {"id": "i3", "text": "Sun in Aries boosts career ambition.", "confidence": "high"},
            ]}],
        },
        "questions": questions or [
            {"question": "career growth", "story":
             "Your career path drives independence. Creative growth awaits in your personal year."}
        ],
    }


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestRAGASPositive:

    def setup_method(self): _reset()

    def test_evaluate_returns_record(self):
        rec = evaluate("sess1", _make_report(), "career growth", ["i1", "i2", "i3"])
        assert rec.session_id == "sess1"
        assert 0.0 <= rec.faithfulness      <= 1.0
        assert 0.0 <= rec.answer_relevancy  <= 1.0
        assert 0.0 <= rec.context_precision <= 1.0
        assert 0.0 <= rec.domain_recall     <= 1.0

    def test_evaluate_stores_record(self):
        evaluate("sess2", _make_report(), "career growth", ["i1"])
        assert len(_records) == 1

    def test_overall_is_average_of_four(self):
        rec = evaluate("sess3", _make_report(), "career", ["i1", "i2"])
        expected = round((rec.faithfulness + rec.answer_relevancy +
                          rec.context_precision + rec.domain_recall) / 4, 4)
        assert rec.overall == expected

    def test_context_precision_high_confidence_only(self):
        report = _make_report()
        # i1=high, i2=medium — approving both → precision = 1/2
        score = _score_context_precision(report, ["i1", "i2"])
        assert score == pytest.approx(0.5, abs=0.01)

    def test_context_precision_all_high(self):
        report = _make_report()
        # only i1 approved — 1 high out of 1
        score = _score_context_precision(report, ["i1"])
        assert score == 1.0

    def test_domain_recall_two_domains(self):
        report = _make_report()
        score = _score_domain_recall(report, ["i1", "i3"])
        # numerology + astrology = 2 of 5
        assert score == pytest.approx(2/5, abs=0.01)

    def test_domain_recall_no_approved(self):
        score = _score_domain_recall(_make_report(), [])
        assert score == 0.0

    def test_answer_relevancy_exact_question_in_story(self):
        report = {
            "domains": {},
            "questions": [{"story": "career growth independence creative"}],
        }
        score = _score_answer_relevancy(report, "career growth")
        assert score > 0.5

    def test_faithfulness_grounded_story(self):
        report = {
            "domains": {"numerology": [{"insights": [
                {"id": "i1", "text": "Life Path 1 career independence", "confidence": "high"},
            ]}]},
            "questions": [{"story": "Life Path independence drives your career choices."}],
        }
        score = _score_faithfulness(report, ["i1"])
        assert score > 0.0

    def test_summary_returns_correct_count(self):
        evaluate("s1", _make_report(), "career", ["i1"])
        evaluate("s2", _make_report(), "health", ["i2"])
        s = summary()
        assert s["total_scored"] == 2

    def test_summary_averages_in_range(self):
        evaluate("s1", _make_report(), "career", ["i1", "i3"])
        s = summary()
        for metric in ("faithfulness", "answer_relevancy", "context_precision", "domain_recall"):
            assert 0.0 <= s["averages"][metric] <= 1.0

    def test_get_record_finds_session(self):
        evaluate("findme", _make_report(), "spirituality", ["i1"])
        rec = get_record("findme")
        assert rec is not None
        assert rec["session_id"] == "findme"

    def test_alerts_empty_when_all_above_threshold(self):
        """With perfect scores, alerts list must be empty."""
        from unittest.mock import patch
        import metrics.ragas_evaluator as ev
        with patch.object(ev, "_score_faithfulness",      return_value=1.0), \
             patch.object(ev, "_score_answer_relevancy",  return_value=1.0), \
             patch.object(ev, "_score_context_precision", return_value=1.0), \
             patch.object(ev, "_score_domain_recall",     return_value=1.0):
            rec = evaluate("perfect", {}, "test", [])
        assert rec.alerts == []


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestRAGASNegative:

    def setup_method(self): _reset()

    def test_evaluate_never_raises_on_bad_report(self):
        rec = evaluate("bad", None, "career", [])
        assert rec is not None
        assert rec.faithfulness == 0.0

    def test_evaluate_empty_approved_ids(self):
        rec = evaluate("empty", _make_report(), "career", [])
        assert rec is not None

    def test_evaluate_empty_question(self):
        rec = evaluate("noquestion", _make_report(), "", ["i1"])
        assert rec is not None

    def test_get_record_returns_none_for_unknown_session(self):
        result = get_record("nonexistent_session_xyz")
        assert result is None

    def test_summary_empty_when_no_records(self):
        s = summary()
        assert s["total_scored"] == 0
        assert "message" in s

    def test_domain_recall_max_one(self):
        """Score must never exceed 1.0 even if somehow more than 5 domains present."""
        score = _score_domain_recall(_make_report(), ["i1", "i2", "i3"])
        assert score <= 1.0

    def test_answer_relevancy_unrelated_question_low_score(self):
        report = {"domains": {}, "questions": [{"story": "numerology life path career"}]}
        score = _score_answer_relevancy(report, "vastu bedroom direction north")
        assert score < 0.5

    def test_alerts_fire_when_scores_below_threshold(self):
        from unittest.mock import patch
        import metrics.ragas_evaluator as ev
        with patch.object(ev, "_score_faithfulness",      return_value=0.0), \
             patch.object(ev, "_score_answer_relevancy",  return_value=0.0), \
             patch.object(ev, "_score_context_precision", return_value=0.0), \
             patch.object(ev, "_score_domain_recall",     return_value=0.0):
            rec = evaluate("allbad", {}, "test", [])
        assert len(rec.alerts) == 4


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestRAGASIntegration:

    def setup_method(self): _reset()

    def test_ragas_endpoint_returns_200(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/metrics/ragas",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_ragas_endpoint_returns_total_scored(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/metrics/ragas",
                          headers={"Authorization": f"Bearer {token}"})
        body = resp.json()
        assert "total_scored" in body

    def test_ragas_session_endpoint_404_unknown(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app, raise_server_exceptions=False)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/metrics/ragas/unknown-session-xyz",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404

    def test_evaluate_then_summary_reflects_it(self):
        evaluate("integ1", _make_report(), "career growth 2026", ["i1", "i3"])
        s = summary()
        assert s["total_scored"] == 1
        assert len(s["recent"]) == 1
        assert "integ1" in s["recent"][0]["session_id"]

    def test_multiple_evaluations_trend_length(self):
        for i in range(7):
            evaluate(f"t{i}", _make_report(), "career", ["i1"])
        s = summary()
        assert len(s["trend"]) == 5  # last 5


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestRAGASSmoke:

    def test_module_imports(self):
        from metrics.ragas_evaluator import evaluate, summary, get_record, THRESHOLDS
        assert callable(evaluate)
        assert callable(summary)
        assert callable(get_record)
        assert isinstance(THRESHOLDS, dict)

    def test_thresholds_all_between_0_and_1(self):
        for k, v in THRESHOLDS.items():
            assert 0.0 < v < 1.0, f"{k} threshold {v} out of range"

    def test_records_deque_exists(self):
        from metrics.ragas_evaluator import _records
        from collections import deque
        assert isinstance(_records, deque)

    def test_tokenise_removes_stopwords(self):
        from metrics.ragas_evaluator import _tokenise
        tokens = _tokenise("the career is in the future")
        assert "the" not in tokens
        assert "career" in tokens
        assert "future" in tokens
