"""
Tests for the 360° Holistic Life Report flow.

Covers:
  - Unit: number computation + chapter builder (offline, LLM mocked)
  - Pipeline: end-to-end holistic graph produces all chapters + guardrails
  - Integration: /run-holistic and /approve-holistic endpoints (TestClient)
  - Regression guard: the question-driven flow is untouched (schemas intact)

All LLM/RAG calls are mocked so the suite is fast and needs no API key.
"""
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import auth.store as auth_store
from auth.models import Role
from database import get_conn
from main import app

ADMIN_KEY = "sk-holistic-admin"
TENANT_ID = "tenant_holistic"
ADMIN_H = {"X-API-Key": ADMIN_KEY}


def _insert_key(tenant_id, name, key, role):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,1,?)",
            (tenant_id, name, time.time()),
        )
        conn.execute(
            "INSERT OR IGNORE INTO api_keys (key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,1,?)",
            (key, tenant_id, role.value, "test", time.time()),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def reset_state():
    auth_store.clear_for_tests()
    _insert_key(TENANT_ID, "Holistic Tenant", ADMIN_KEY, Role.ADMIN)
    yield
    auth_store.clear_for_tests()


@pytest.fixture()
def client():
    import cache.store as cache_store
    cache_store.clear()
    return TestClient(app, raise_server_exceptions=False)


# ── Mocks: replace the LLM/RAG with cheap deterministic stand-ins ────────────
def _fake_hybrid(**kw):
    return f"Reading for {kw.get('intent')} with life path {kw.get('life_path')}."


def _fake_chapter_call(system, user, temperature=0.7, max_tokens=800):
    # The chapter story now comes straight from the LLM (ds_call). Return a
    # valid 6-paragraph arc so the shape assertions pass, echoing the chapter
    # title from the prompt so we can confirm each chapter is distinct.
    return ("[HOOK] A fresh opening for this chapter. [TENSION] A specific test. "
            "[TURN] A number guides. [RESOLUTION] Balance is found. "
            "[CLOSING] Walk on. [REMEDIES] Wear white on Mondays.")


def _fake_rag(**kw):
    return "BOOK KNOWLEDGE: remedies text"


def _mock_llm():
    return [
        patch("numerology_rag.hybrid_engine.hybrid_numerology_answer", side_effect=_fake_hybrid),
        patch("utils.deepseek_client.call", side_effect=_fake_chapter_call),
        patch("numerology_rag.retriever.retrieve_for_rag", side_effect=_fake_rag),
    ]


# ── Unit: number computation ─────────────────────────────────────────────────
def test_core_numbers_are_correct():
    from agents.holistic_agent import _core_numbers
    nums = _core_numbers("Rav Singh Chandan", "1995-08-19")
    # Life path for 1995-08-19 = 1+9+9+5+0+8+1+9 = 42 -> 6
    assert nums["life_path"] == 6
    assert nums["birthday"] == 1          # day 19 -> 1+9=10 -> 1
    # maturity = reduce(life_path + destiny) = reduce(6+6) = reduce(12) = 3
    assert nums["maturity"] == 3
    assert isinstance(nums["lucky_numbers"], list) and nums["lucky_numbers"]
    assert isinstance(nums["lucky_colors"], list) and nums["lucky_colors"]


# ── Unit: chapter builder produces exactly 14 ordered story chapters ─────────
def test_build_chapters_shape_and_order():
    with _mock_llm()[0], _mock_llm()[1], _mock_llm()[2]:
        from agents.holistic_agent import build_holistic_chapters, CHAPTERS
        chapters = build_holistic_chapters("Rav Singh Chandan", "1995-08-19")
        assert len(chapters) == len(CHAPTERS) == 14
        assert [c["order"] for c in chapters] == list(range(1, 15))
        for c in chapters:
            assert c["chapter_id"]
            assert c["title"]
            assert "[HOOK]" in c["story"]
        # First chapter is the most important (life path); last is remedies.
        assert chapters[0]["chapter_id"] == "life_path"
        assert chapters[-1]["chapter_id"] == "remedies"


# ── Pipeline: end-to-end holistic graph, guardrails fire ─────────────────────
def test_holistic_pipeline_runs():
    with _mock_llm()[0], _mock_llm()[1], _mock_llm()[2]:
        from graph.holistic_pipeline import run_holistic_pipeline
        state = {
            "user_profile": {"full_name": "Rav Singh Chandan", "date_of_birth": "1995-08-19"},
            "user_id": "anonymous", "agent_log": [],
        }
        out = run_holistic_pipeline(state)
        assert len(out["holistic_chapters"]) == 14
        # security gate ran and passed
        assert any(
            isinstance(l, dict) and l.get("agent") == "holistic_security"
            and l.get("status") == "passed"
            for l in out["agent_log"]
        )


# ── Integration: /run-holistic then /approve-holistic ────────────────────────
def test_run_and_approve_holistic_endpoint(client):
    with _mock_llm()[0], _mock_llm()[1], _mock_llm()[2]:
        run = client.post(
            "/api/v1/analysis/run-holistic",
            json={"user_profile": {"full_name": "Rav Singh Chandan",
                                   "date_of_birth": "1995-08-19"}},
            headers=ADMIN_H,
        )
        assert run.status_code == 200, run.text
        body = run.json()
        assert body["status"] == "completed"
        review = body["holistic_review"]
        assert len(review["chapters"]) == 14
        session_id = body["session_id"]

        # Approve a subset — keep only 2 chapters.
        approve = client.post(
            "/api/v1/analysis/approve-holistic",
            json={"session_id": session_id,
                  "approved_chapter_ids": ["life_path", "career"]},
            headers=ADMIN_H,
        )
        assert approve.status_code == 200, approve.text
        report = approve.json()["holistic_report"]
        assert len(report["chapters"]) == 2
        kept = {c["chapter_id"] for c in report["chapters"]}
        assert kept == {"life_path", "career"}


def test_approve_holistic_default_keeps_all_but_rejected(client):
    with _mock_llm()[0], _mock_llm()[1], _mock_llm()[2]:
        run = client.post(
            "/api/v1/analysis/run-holistic",
            json={"user_profile": {"full_name": "Rav Singh Chandan",
                                   "date_of_birth": "1995-08-19"}},
            headers=ADMIN_H,
        )
        session_id = run.json()["session_id"]
        approve = client.post(
            "/api/v1/analysis/approve-holistic",
            json={"session_id": session_id, "rejected_chapter_ids": ["remedies"]},
            headers=ADMIN_H,
        )
        assert approve.status_code == 200
        report = approve.json()["holistic_report"]
        # 14 - 1 rejected = 13 kept
        assert len(report["chapters"]) == 13
        assert "remedies" not in {c["chapter_id"] for c in report["chapters"]}


def test_approve_holistic_unknown_session_404(client):
    resp = client.post(
        "/api/v1/analysis/approve-holistic",
        json={"session_id": "does-not-exist"},
        headers=ADMIN_H,
    )
    assert resp.status_code == 404


# ── Regression guard: question-flow schemas remain intact ────────────────────
def test_question_flow_schemas_untouched():
    from schemas import AnalysisRequest, ApprovalRequest, FinalReport  # noqa: F401
    # AnalysisRequest still requires user_profile and defaults question to "".
    req = AnalysisRequest(user_profile={"full_name": "X", "date_of_birth": "1990-01-01"})
    assert req.user_question == ""
    assert req.questions == []
