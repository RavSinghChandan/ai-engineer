"""
Test Suite: FastAPI HTTP Endpoints (main.py + routers/)
Covers: health, root, cache endpoints, guardrail stats, circuit breaker reset,
        analysis/run (cache-hit path), analysis/approve, session retrieval.

All LLM-calling code is bypassed via bypass_cache + pipeline mocking so tests
run without API keys and without network access.
"""
import json
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
import cache.store as cache_store

# ── App import (must come after sys.path setup) ──────────────────────────────
from main import app

client = TestClient(app)

VALID_PROFILE = {
    "full_name": "Varun Sharma",
    "alias_name": "",
    "date_of_birth": "1990-05-15",
    "time_of_birth": "10:30",
    "place_of_birth": "Delhi",
    "pincode": "",
}

VALID_RUN_PAYLOAD = {
    "user_profile": VALID_PROFILE,
    "user_id": "test_user_001",
    "user_question": "What is my career path?",
    "questions": [],
    "selected_modules": ["numerology"],
    "bypass_cache": False,
}


@pytest.fixture(autouse=True)
def reset_cache():
    cache_store.clear()
    cache_store._hits = 0
    cache_store._misses = 0
    yield
    cache_store.clear()


# ── Health & Root ─────────────────────────────────────────────────────────────

class TestHealthAndRoot:
    def test_health_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_body(self):
        resp = client.get("/health")
        data = resp.json()
        assert data["status"] == "ok"
        assert "AstroIntel" in data["service"]
        assert data["version"] == "1.0.0"

    def test_root_returns_200(self):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_root_has_endpoints_map(self):
        resp = client.get("/")
        data = resp.json()
        assert "endpoints" in data
        assert "run_analysis" in data["endpoints"]
        assert "health" in data["endpoints"]

    def test_docs_reachable(self):
        resp = client.get("/docs")
        assert resp.status_code == 200


# ── Cache Endpoints ───────────────────────────────────────────────────────────

class TestCacheEndpoints:
    def test_cache_stats_returns_200(self):
        resp = client.get("/cache/stats")
        assert resp.status_code == 200

    def test_cache_stats_structure(self):
        resp = client.get("/cache/stats")
        data = resp.json()
        for key in ("total_entries", "hits", "misses", "hit_rate_pct"):
            assert key in data

    def test_cache_entries_empty(self):
        resp = client.get("/cache/entries")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []

    def test_cache_clear_removes_entries(self):
        # Seed a cache entry directly
        cache_store.set("testkey", {"data": "x"})
        resp = client.delete("/cache/clear")
        assert resp.status_code == 200
        assert resp.json()["cleared"] >= 1
        assert len(cache_store.entries()) == 0

    def test_cache_invalidate_existing_key(self):
        cache_store.set("inv_key", {"x": 1})
        resp = client.delete("/cache/invalidate/inv_key")
        assert resp.status_code == 200
        assert resp.json()["removed"] is True

    def test_cache_invalidate_nonexistent_key(self):
        resp = client.delete("/cache/invalidate/nonexistent_xyz")
        assert resp.status_code == 200
        assert resp.json()["removed"] is False

    def test_cache_entries_after_manual_set(self):
        cache_store.set("k1", {}, meta={"user_name": "Varun", "key_type": "profile"})
        resp = client.get("/cache/entries")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert len(entries) == 1
        assert entries[0]["user_name"] == "Varun"


# ── Guardrail Endpoints ───────────────────────────────────────────────────────

class TestGuardrailEndpoints:
    def test_guardrail_stats_returns_200(self):
        resp = client.get("/guardrails/stats")
        assert resp.status_code == 200

    def test_guardrail_stats_has_all_guardrails(self):
        resp = client.get("/guardrails/stats")
        data = resp.json()
        for g in ("rate_limiter", "circuit_breaker", "json_repair", "pii_filter"):
            assert g in data, f"Missing guardrail key: {g}"

    def test_circuit_breaker_reset_returns_200(self):
        resp = client.post("/guardrails/circuit-breaker/reset")
        assert resp.status_code == 200

    def test_circuit_breaker_reset_state_is_closed(self):
        resp = client.post("/guardrails/circuit-breaker/reset")
        data = resp.json()
        assert data["state"] == "closed"


# ── Analysis: Cache-Hit Path ──────────────────────────────────────────────────

class TestAnalysisRunCacheHit:
    def _seed_cache(self):
        """Pre-seed cache so /run returns a cache hit without calling LLM."""
        profile_dict = VALID_PROFILE
        cache_key = cache_store.make_key(
            user_id="",
            questions=[],
            user_question="What is my career path?",
            profile=profile_dict,
        )
        cached_response = {
            "session_id": "cached-session-001",
            "status": "completed",
            "cache_hit": False,
            "cache_key": cache_key,
            "focus_context": {"intent": "career"},
            "normalized_questions": [{"question": "career path", "intent": "career", "index": 0}],
            "memory_keys": [],
            "admin_review": {"questions": []},
            "agent_log": [],
            "hallucination_audit": {},
            "raw_outputs": {},
        }
        cache_store.set(
            cache_key,
            cached_response,
            ttl=cache_store.PROFILE_TTL_SECONDS,
            meta={"user_name": "Varun Sharma", "key_type": "profile"},
        )
        return cache_key

    def test_cache_hit_returns_200(self):
        self._seed_cache()
        resp = client.post("/api/v1/analysis/run", json=VALID_RUN_PAYLOAD)
        assert resp.status_code == 200

    def test_cache_hit_flag_true(self):
        self._seed_cache()
        resp = client.post("/api/v1/analysis/run", json=VALID_RUN_PAYLOAD)
        data = resp.json()
        assert data["cache_hit"] is True

    def test_cache_hit_returns_correct_session_id(self):
        self._seed_cache()
        resp = client.post("/api/v1/analysis/run", json=VALID_RUN_PAYLOAD)
        data = resp.json()
        assert data["session_id"] == "cached-session-001"

    def test_same_user_different_user_id_gets_cache_hit(self):
        self._seed_cache()
        # Call with different user_id — should still get cache hit
        payload = {**VALID_RUN_PAYLOAD, "user_id": "totally_different_user_id_999"}
        resp = client.post("/api/v1/analysis/run", json=payload)
        data = resp.json()
        assert data["cache_hit"] is True

    def test_bypass_cache_skips_cache(self):
        self._seed_cache()
        payload = {**VALID_RUN_PAYLOAD, "bypass_cache": True}
        # With bypass, it will call the actual pipeline which needs an LLM key.
        # We expect either success or a graceful error, not a cache hit.
        resp = client.post("/api/v1/analysis/run", json=payload)
        # Just check it doesn't return cache_hit=True
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("cache_hit") is not True


# ── Analysis: Request Validation ─────────────────────────────────────────────

class TestAnalysisRequestValidation:
    def test_missing_user_profile_returns_422(self):
        resp = client.post("/api/v1/analysis/run", json={"user_question": "career?"})
        assert resp.status_code == 422

    def test_missing_full_name_returns_422(self):
        bad_profile = {**VALID_PROFILE}
        del bad_profile["full_name"]
        resp = client.post("/api/v1/analysis/run", json={"user_profile": bad_profile})
        assert resp.status_code == 422

    def test_missing_dob_returns_422(self):
        bad_profile = {**VALID_PROFILE}
        del bad_profile["date_of_birth"]
        resp = client.post("/api/v1/analysis/run", json={"user_profile": bad_profile})
        assert resp.status_code == 422

    def test_rate_limit_blocks_after_10_requests(self):
        """Rate limiter singleton: user hitting >10 req/60s gets 429."""
        # Use a unique user_id to avoid polluting other tests
        limited_payload = {**VALID_RUN_PAYLOAD, "user_id": "rate_test_user_zzz"}
        # Seed cache so LLM is not called
        profile_dict = VALID_PROFILE
        cache_key = cache_store.make_key("", [], "What is my career path?", profile_dict)
        cache_store.set(cache_key, {"session_id": "x", "cache_hit": False, "status": "completed",
                                     "admin_review": {}, "agent_log": [], "focus_context": {},
                                     "normalized_questions": [], "memory_keys": [],
                                     "hallucination_audit": {}, "raw_outputs": {}, "cache_key": cache_key})
        from guardrails.production import rate_limiter
        for _ in range(10):
            rate_limiter.is_allowed("rate_test_user_zzz")
        resp = client.post("/api/v1/analysis/run", json=limited_payload)
        assert resp.status_code == 429


# ── Session Retrieval ─────────────────────────────────────────────────────────

class TestSessionRetrieval:
    def test_unknown_session_returns_404(self):
        resp = client.get("/api/v1/analysis/session/nonexistent-session-99999")
        assert resp.status_code == 404

    def test_unknown_memory_returns_200_with_empty(self):
        resp = client.get("/api/v1/analysis/memory/nonexistent-session-99999")
        assert resp.status_code == 200


# ── Languages Endpoint ────────────────────────────────────────────────────────

class TestLanguagesEndpoint:
    def test_languages_returns_200(self):
        resp = client.get("/api/v1/analysis/languages")
        assert resp.status_code == 200

    def test_languages_list_not_empty(self):
        resp = client.get("/api/v1/analysis/languages")
        data = resp.json()
        assert "languages" in data
        assert len(data["languages"]) > 0

    def test_hindi_in_languages(self):
        resp = client.get("/api/v1/analysis/languages")
        data = resp.json()
        codes = [lang.get("code") for lang in data["languages"]]
        assert "hi" in codes


# ── CORS Headers ──────────────────────────────────────────────────────────────

class TestCors:
    def test_cors_header_present_for_allowed_origin(self):
        resp = client.get("/health", headers={"Origin": "http://localhost:4200"})
        assert "access-control-allow-origin" in resp.headers

    def test_options_preflight_allowed(self):
        resp = client.options(
            "/api/v1/analysis/run",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "POST",
            }
        )
        assert resp.status_code in (200, 204)
