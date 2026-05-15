"""
Test Suite: LIVE End-to-End Pipeline Tests (requires DEEPSEEK_API_KEY)
=======================================================================
These tests call the actual LLM. They run the full pipeline:
  run_analysis → admin_review → approve → final_report → translate

Profile used: Varun Sharma (1990-05-15, Delhi) — a fixed real-world profile
so results are deterministic in structure (even if wording varies).

Run with: export $(grep -v '^#' .env | xargs) && python3 -m pytest tests/test_live_pipeline.py -v
"""
import os
import time
import pytest
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Load .env if not already set
if not os.environ.get("DEEPSEEK_API_KEY"):
    try:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass

pytestmark = pytest.mark.skipif(
    not os.environ.get("DEEPSEEK_API_KEY"),
    reason="DEEPSEEK_API_KEY not set — skipping live pipeline tests"
)

from fastapi.testclient import TestClient
import cache.store as cache_store

from main import app
client = TestClient(app, raise_server_exceptions=False)

VARUN_PROFILE = {
    "full_name": "Varun Sharma",
    "alias_name": "",
    "date_of_birth": "1990-05-15",
    "time_of_birth": "10:30",
    "place_of_birth": "Delhi",
    "pincode": "",
}

CAREER_QUESTION = "What does my birth chart say about my career and professional growth?"
HEALTH_QUESTION = "What should I focus on for my health and wellness based on my numerology?"


@pytest.fixture(autouse=True)
def reset_state():
    """Reset cache and rate limiter before every test."""
    cache_store.clear()
    cache_store._hits = 0
    cache_store._misses = 0
    # Reset rate limiter windows so 10-req limit doesn't bleed between tests
    from guardrails.production import rate_limiter
    rate_limiter._windows.clear()
    rate_limiter._total_allowed = 0
    rate_limiter._total_blocked = 0
    yield
    cache_store.clear()


def _uid(suffix: str) -> str:
    """Unique user_id per test to keep rate limit windows independent."""
    return f"test_{suffix}_{int(time.time() * 1000) % 100000}"


def _run(user_id: str, question: str = CAREER_QUESTION, bypass: bool = True,
         extra_questions=None, timeout=120):
    payload = {
        "user_profile": VARUN_PROFILE,
        "user_id": user_id,
        "user_question": question,
        "bypass_cache": bypass,
    }
    if extra_questions:
        payload["questions"] = extra_questions
    return client.post("/api/v1/analysis/run", json=payload, timeout=timeout)


# ── Live /run — Single question ───────────────────────────────────────────────

class TestLiveRunSingleQuestion:
    def test_run_returns_200(self):
        resp = _run(_uid("r200"))
        assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text[:300]}"

    def test_run_returns_session_id(self):
        data = _run(_uid("rsid")).json()
        assert "session_id" in data
        assert len(data["session_id"]) > 8

    def test_run_returns_admin_review(self):
        data = _run(_uid("rar")).json()
        assert "admin_review" in data
        assert "questions" in data["admin_review"]
        assert len(data["admin_review"]["questions"]) >= 1

    def test_run_insights_have_required_fields(self):
        data = _run(_uid("rif")).json()
        for q in data["admin_review"]["questions"]:
            assert "question" in q
            assert "insights" in q
            for insight in q["insights"]:
                assert "id" in insight
                assert "content" in insight
                assert "confidence" in insight
                assert insight["confidence"] in ("high", "medium", "low")
                assert "domains" in insight

    def test_run_has_agent_log(self):
        data = _run(_uid("ral")).json()
        assert "agent_log" in data
        assert len(data["agent_log"]) > 0

    def test_run_has_security_audit_in_log(self):
        data = _run(_uid("rsa")).json()
        log = " ".join(data.get("agent_log", []))
        assert "Security" in log or "security" in log

    def test_run_has_hallucination_audit(self):
        data = _run(_uid("rha")).json()
        assert "hallucination_audit" in data
        audit = data["hallucination_audit"]
        assert "overall_risk" in audit
        assert audit["overall_risk"] in ("low", "medium", "high")

    def test_run_cache_stored_after_first_call(self):
        uid = _uid("rcs")
        resp = _run(uid)
        assert resp.status_code == 200
        assert len(cache_store.entries()) == 1

    def test_second_call_is_cache_hit(self):
        uid = _uid("rch")
        _run(uid)   # first call — LLM, stores cache
        resp2 = _run(uid, bypass=False, timeout=30)   # second — must hit cache
        assert resp2.status_code == 200
        assert resp2.json()["cache_hit"] is True

    def test_different_user_id_still_cache_hit(self):
        """CORE FIX: same birth profile, different user_id → must hit same cache entry."""
        _run("session_A_fixed")   # first call
        resp2 = client.post("/api/v1/analysis/run", json={
            "user_profile": VARUN_PROFILE,
            "user_id": "session_B_completely_different",
            "user_question": CAREER_QUESTION,
            "bypass_cache": False,
        }, timeout=30)
        assert resp2.json()["cache_hit"] is True
        assert len(cache_store.entries()) == 1  # exactly 1 entry, not 2


# ── Live /run — Multiple questions ───────────────────────────────────────────

class TestLiveRunMultipleQuestions:
    def test_two_questions_returns_question_blocks(self):
        uid = _uid("mq2")
        resp = _run(uid, question=CAREER_QUESTION, extra_questions=[HEALTH_QUESTION], timeout=180)
        assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        assert len(data["admin_review"]["questions"]) >= 1

    def test_multiple_questions_produce_insights(self):
        uid = _uid("mqui")
        resp = _run(uid, question="", extra_questions=[CAREER_QUESTION, HEALTH_QUESTION], timeout=180)
        assert resp.status_code == 200
        all_content = [
            ins["content"]
            for q in resp.json()["admin_review"]["questions"]
            for ins in q["insights"]
        ]
        assert len(all_content) >= 1


# ── Live /approve — Report generation ────────────────────────────────────────

class TestLiveApprove:
    def _run_and_get_session(self, uid):
        resp = _run(uid)
        assert resp.status_code == 200, f"/run failed: {resp.status_code} {resp.text[:200]}"
        data = resp.json()
        session_id = data["session_id"]
        approved_ids = [
            ins["id"]
            for q in data["admin_review"]["questions"]
            for ins in q["insights"]
            if ins["confidence"] in ("high", "medium")
        ]
        return session_id, approved_ids

    def _approve(self, session_id, approved_ids, rejected_ids=None):
        return client.post("/api/v1/analysis/approve", json={
            "session_id": session_id,
            "approved_insight_ids": approved_ids,
            "rejected_insight_ids": rejected_ids or [],
            "brand_name": "AstroIntel",
            "logo_url": "",
            "image_url": "",
        }, timeout=120)

    def test_approve_returns_200(self):
        sid, ids = self._run_and_get_session(_uid("apr200"))
        assert self._approve(sid, ids).status_code == 200

    def test_approve_returns_final_report(self):
        sid, ids = self._run_and_get_session(_uid("aprfr"))
        data = self._approve(sid, ids).json()
        assert "final_report" in data
        assert "sections" in data["final_report"]
        assert len(data["final_report"]["sections"]) >= 1

    def test_report_sections_have_insights(self):
        sid, ids = self._run_and_get_session(_uid("aprsi"))
        report = self._approve(sid, ids).json()["final_report"]
        for section in report["sections"]:
            assert "question" in section
            assert "insights" in section
            assert isinstance(section["insights"], list)

    def test_report_has_remedies_block(self):
        sid, ids = self._run_and_get_session(_uid("aprrem"))
        report = self._approve(sid, ids).json()["final_report"]
        assert "remedies" in report

    def test_report_user_name_present(self):
        sid, ids = self._run_and_get_session(_uid("aprun"))
        report = self._approve(sid, ids).json()["final_report"]
        assert report.get("user_name", "") != ""

    def test_approve_with_all_rejected_still_200(self):
        sid, ids = self._run_and_get_session(_uid("aprej"))
        assert self._approve(sid, approved_ids=[], rejected_ids=ids).status_code == 200


# ── Live translation ──────────────────────────────────────────────────────────

class TestLiveTranslation:
    def _get_report(self, uid):
        run_resp = _run(uid)
        assert run_resp.status_code == 200
        data = run_resp.json()
        session_id = data["session_id"]
        ids = [ins["id"] for q in data["admin_review"]["questions"] for ins in q["insights"]]
        apr = client.post("/api/v1/analysis/approve", json={
            "session_id": session_id,
            "approved_insight_ids": ids,
            "rejected_insight_ids": [],
            "brand_name": "AstroIntel",
            "logo_url": "", "image_url": "",
        }, timeout=120)
        assert apr.status_code == 200
        return session_id, apr.json()["final_report"]

    def test_translate_to_hindi_returns_200(self):
        session_id, report = self._get_report(_uid("trhi"))
        resp = client.post("/api/v1/analysis/translate", json={
            "session_id": session_id, "language_code": "hi", "report": report,
        }, timeout=120)
        assert resp.status_code == 200

    def test_translate_response_has_language_code(self):
        session_id, report = self._get_report(_uid("trlc"))
        resp = client.post("/api/v1/analysis/translate", json={
            "session_id": session_id, "language_code": "hi", "report": report,
        }, timeout=120)
        data = resp.json()
        assert "final_report" in data
        assert data["language_code"] == "hi"


# ── Live Guardrail stats after real run ───────────────────────────────────────

class TestLiveGuardrailStats:
    def test_guardrail_stats_update_after_run(self):
        _run(_uid("gs1"))
        data = client.get("/guardrails/stats").json()
        assert data["rate_limiter"]["total_allowed"] >= 1

    def test_json_repair_stats_recorded(self):
        _run(_uid("gs2"))
        data = client.get("/guardrails/stats").json()
        assert "json_repair" in data
        assert data["json_repair"]["total_calls"] >= 0

    def test_metrics_records_run(self):
        _run(_uid("gs3"))
        data = client.get("/api/v1/metrics").json()
        assert data["total_runs"] >= 1
        assert data["latency"]["p50_ms"] > 0
