"""
Coverage tests for low-coverage router modules:
  - routers/geocode.py
  - routers/stream.py
  - routers/feedback.py
  - routers/analysis.py (helper functions + language/translate/simplify endpoints)
"""
from __future__ import annotations
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _make_app():
    from fastapi import FastAPI
    from routers.geocode import router as geo_router
    from routers.feedback import router as fb_router
    from routers.analysis import router as an_router

    app = FastAPI()
    app.include_router(geo_router)
    app.include_router(fb_router)
    app.include_router(an_router)
    return app


def _admin_ctx():
    from auth.models import TenantContext, Role
    return TenantContext(tenant_id="t1", role=Role.ADMIN, api_key="test-key", user_id="u1", email="a@b.com")


class TestGeocodeRouter:
    def test_builtin_lookup_chandigarh(self):
        from routers.geocode import _builtin_lookup
        result = _builtin_lookup("chandigarh")
        assert result is not None
        assert result["timezone"] == "Asia/Kolkata"

    def test_builtin_lookup_unknown(self):
        from routers.geocode import _builtin_lookup
        assert _builtin_lookup("xyzunknowncity") is None

    def test_builtin_lookup_partial_match(self):
        from routers.geocode import _builtin_lookup
        result = _builtin_lookup("New Delhi, India")
        assert result is not None

    def test_cache_get_miss(self):
        from routers.geocode import _cache_get, _GEO_CACHE
        _GEO_CACHE.clear()
        assert _cache_get("nonexistent") is None

    def test_cache_set_and_get(self):
        from routers.geocode import _cache_get, _cache_set, _GEO_CACHE
        _GEO_CACHE.clear()
        _cache_set("testcity", {"lat": 1.0, "lon": 2.0, "timezone": "UTC", "display_name": "Test", "source": "builtin"})
        result = _cache_get("testcity")
        assert abs(result["lat"] - 1.0) < 0.001

    def test_cache_expired_returns_none(self):
        import time
        from routers.geocode import _cache_get, _GEO_CACHE, _GEO_TTL
        _GEO_CACHE["oldcity"] = (time.time() - _GEO_TTL - 1, {"lat": 0.0})
        assert _cache_get("oldcity") is None

    def test_timezone_from_cc_known(self):
        from routers.geocode import _timezone_from_cc
        assert _timezone_from_cc("in", 77.0) == "Asia/Kolkata"

    def test_timezone_from_cc_unknown_uses_longitude(self):
        from routers.geocode import _timezone_from_cc
        tz = _timezone_from_cc("zz", 45.0)
        assert "Etc/GMT" in tz

    def test_geocode_endpoint_builtin(self):
        import asyncio
        from routers.geocode import geocode, _GEO_CACHE
        _GEO_CACHE.clear()
        with patch("routers.geocode._nominatim_lookup", return_value=None):
            result = asyncio.run(geocode("mumbai"))
        assert result.city == "mumbai"
        assert abs(result.lat - 19.076) < 0.01

    def test_geocode_endpoint_nominatim(self):
        import asyncio
        from routers.geocode import geocode, _GEO_CACHE
        _GEO_CACHE.clear()
        nom_result = {"lat": 10.0, "lon": 20.0, "display_name": "TestCity", "timezone": "UTC", "source": "nominatim"}
        with patch("routers.geocode._nominatim_lookup", return_value=nom_result):
            result = asyncio.run(geocode("testcityx"))
        assert abs(result.lat - 10.0) < 0.001

    def test_geocode_endpoint_empty_city_raises(self):
        import asyncio
        from routers.geocode import geocode
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            asyncio.run(geocode(""))
        assert exc.value.status_code == 400

    def test_geocode_not_found_raises_404(self):
        import asyncio
        from routers.geocode import geocode, _GEO_CACHE
        _GEO_CACHE.clear()
        from fastapi import HTTPException
        with patch("routers.geocode._nominatim_lookup", return_value=None):
            with pytest.raises(HTTPException) as exc:
                asyncio.run(geocode("zzzneverexists99999"))
        assert exc.value.status_code == 404

    def test_geocode_cache_stats(self):
        import asyncio
        from routers.geocode import geocode_cache_stats, _GEO_CACHE, _cache_set
        _GEO_CACHE.clear()
        _cache_set("delhi", {"lat": 28.0, "lon": 77.0, "timezone": "Asia/Kolkata", "display_name": "Delhi", "source": "builtin"})
        stats = asyncio.run(geocode_cache_stats())
        assert stats["cached_cities"] == 1

    def test_geocode_returns_from_cache(self):
        import asyncio
        from routers.geocode import geocode, _GEO_CACHE, _cache_set
        _GEO_CACHE.clear()
        _cache_set("london", {"lat": 51.5, "lon": -0.1, "timezone": "Europe/London", "display_name": "London", "source": "cache"})
        result = asyncio.run(geocode("london"))
        assert result.source == "cache"

    def test_nominatim_lookup_http_error(self):
        import asyncio
        import httpx
        from routers.geocode import _nominatim_lookup
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(side_effect=httpx.RequestError("fail", request=None))
            result = asyncio.run(_nominatim_lookup("some city"))
        assert result is None

    def test_nominatim_lookup_empty_results(self):
        import asyncio
        from routers.geocode import _nominatim_lookup
        with patch("httpx.AsyncClient") as mock_client:
            mock_resp = MagicMock()
            mock_resp.json.return_value = []
            mock_resp.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)
            result = asyncio.run(_nominatim_lookup("emptycity"))
        assert result is None


class TestStreamRouter:
    def test_event_generator_timeout(self):
        import asyncio
        from routers.stream import _event_generator

        collected = []

        def fake_subscribe(sid):
            return asyncio.Queue()

        async def _run():
            with patch("routers.stream.subscribe", side_effect=fake_subscribe):
                with patch("routers.stream.unsubscribe"):
                    with patch("routers.stream._SSE_TIMEOUT_SECONDS", 0):
                        async for chunk in _event_generator("test-session"):
                            collected.append(chunk)
                            break

        asyncio.run(_run())
        assert any("timeout" in c or "heartbeat" in c or "event" in c for c in collected)

    def test_event_generator_pipeline_done(self):
        import asyncio
        from routers.stream import _event_generator

        async def _run():
            q = asyncio.Queue()
            await q.put({"event": "pipeline_done", "data": {"session_id": "s1"}})

            chunks = []
            with patch("routers.stream.subscribe", return_value=q):
                with patch("routers.stream.unsubscribe"):
                    async for chunk in _event_generator("sess-1"):
                        chunks.append(chunk)
            return chunks

        chunks = asyncio.run(_run())
        assert "pipeline_done" in "".join(chunks)

    def test_event_generator_pipeline_error(self):
        import asyncio
        from routers.stream import _event_generator

        async def _run():
            q = asyncio.Queue()
            await q.put({"event": "pipeline_error", "data": {"error": "crash"}})

            chunks = []
            with patch("routers.stream.subscribe", return_value=q):
                with patch("routers.stream.unsubscribe"):
                    async for chunk in _event_generator("sess-err"):
                        chunks.append(chunk)
            return chunks

        chunks = asyncio.run(_run())
        assert "pipeline_error" in "".join(chunks)

    def test_event_generator_node_event(self):
        import asyncio
        from routers.stream import _event_generator

        async def _run():
            q = asyncio.Queue()
            await q.put({"event": "node_start", "data": {"node": "grammar_agent"}})
            await q.put({"event": "pipeline_done", "data": {}})

            chunks = []
            with patch("routers.stream.subscribe", return_value=q):
                with patch("routers.stream.unsubscribe"):
                    async for chunk in _event_generator("sess-2"):
                        chunks.append(chunk)
            return chunks

        chunks = asyncio.run(_run())
        full = "".join(chunks)
        assert "node_start" in full
        assert "grammar_agent" in full


class TestFeedbackRouter:
    def _client(self):
        from fastapi import FastAPI
        from routers.feedback import router
        app = FastAPI()
        app.include_router(router)
        ctx = _admin_ctx()
        app.dependency_overrides = {}
        from auth.rbac import Permission, can
        from auth.dependencies import get_tenant_ctx
        app.dependency_overrides[get_tenant_ctx] = lambda: ctx
        return TestClient(app)

    def test_post_correction_success(self):
        client = self._client()
        with patch("routers.feedback.log_correction", return_value=42):
            resp = client.post("/api/v1/feedback/corrections", json={
                "insight_id": "q1_i1",
                "original_text": "Original content here",
                "corrected_text": "Corrected content here",
                "intent": "career",
            })
        assert resp.status_code == 200
        assert resp.json()["id"] == 42

    def test_post_correction_empty_text(self):
        client = self._client()
        resp = client.post("/api/v1/feedback/corrections", json={
            "insight_id": "q1_i1",
            "original_text": "",
            "corrected_text": "Corrected",
            "intent": "career",
        })
        assert resp.status_code == 422

    def test_post_correction_identical_texts(self):
        client = self._client()
        resp = client.post("/api/v1/feedback/corrections", json={
            "insight_id": "q1_i1",
            "original_text": "Same text",
            "corrected_text": "Same text",
            "intent": "career",
        })
        assert resp.status_code == 422

    def test_post_corrections_batch(self):
        client = self._client()
        with patch("routers.feedback.log_correction", return_value=1):
            resp = client.post("/api/v1/feedback/corrections/batch", json={
                "corrections": [
                    {"insight_id": "i1", "original_text": "orig1", "corrected_text": "corr1", "intent": "general"},
                    {"insight_id": "i2", "original_text": "same", "corrected_text": "same", "intent": "general"},
                ]
            })
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_get_corrections(self):
        client = self._client()
        with patch("routers.feedback.list_corrections", return_value=[{"id": 1}]):
            resp = client.get("/api/v1/feedback/corrections")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_get_correction_stats(self):
        client = self._client()
        with patch("routers.feedback.correction_stats", return_value={"career": 3}):
            resp = client.get("/api/v1/feedback/corrections/stats")
        assert resp.status_code == 200
        assert resp.json()["career"] == 3

    def test_get_persona_preferences(self):
        client = self._client()
        with patch("routers.feedback.get_persona_prefs", return_value={"lang": "hi"}):
            resp = client.get("/api/v1/feedback/persona/preferences")
        assert resp.status_code == 200
        assert resp.json()["preferences"]["lang"] == "hi"

    def test_set_persona_preference(self):
        client = self._client()
        with patch("routers.feedback.set_persona_pref"):
            resp = client.post("/api/v1/feedback/persona/preferences", json={"key": "lang", "value": "hi"})
        assert resp.status_code == 200
        assert resp.json()["key"] == "lang"

    def test_set_persona_preference_empty_key(self):
        client = self._client()
        resp = client.post("/api/v1/feedback/persona/preferences", json={"key": "", "value": "hi"})
        assert resp.status_code == 422

    def test_persona_preview(self):
        client = self._client()
        tenant_ctx_mock = {"past_corrections": [], "preference_overrides": {}}
        with patch("routers.feedback.build_tenant_context", return_value=tenant_ctx_mock):
            with patch("routers.feedback.format_for_prompt", return_value="prompt"):
                resp = client.get("/api/v1/feedback/persona/preview?query=career")
        assert resp.status_code == 200
        assert "past_corrections_found" in resp.json()


class TestAnalysisHelpers:
    def test_get_languages_endpoint(self):
        from fastapi import FastAPI
        from routers.analysis import router
        from auth.rbac import can, Permission
        from auth.dependencies import get_tenant_ctx
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_tenant_ctx] = lambda: _admin_ctx()
        client = TestClient(app)
        resp = client.get("/api/v1/analysis/languages")
        assert resp.status_code == 200
        langs = resp.json()["languages"]
        assert any(l["code"] == "hi" for l in langs)

    def test_record_metrics_helper(self):
        from routers.analysis import _record_metrics
        state = {
            "agent_log": ["step1"],
            "errors": [],
            "memory": {"astrology": {}},
            "hallucination_audit": {},
            "focus_context": {"intent": "career"},
        }
        with patch("routers.analysis.get_session_usage", return_value={"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150, "calls": 1}):
            with patch("routers.analysis.get_collector") as mock_col:
                mock_col.return_value.record = MagicMock()
                _record_metrics("sess-1", state, 0.0, 1.0)

    def test_record_approve_tokens_no_calls(self):
        from routers.analysis import _record_approve_tokens
        with patch("routers.analysis.get_session_usage", return_value={"calls": 0}):
            _record_approve_tokens("sess-1", 0.0, 1.0)

    def test_record_approve_tokens_with_calls(self):
        from routers.analysis import _record_approve_tokens
        from metrics.collector import RunRecord
        mock_record = RunRecord(
            session_id="sess-1",
            started_at=0.0, ended_at=1.0, total_latency_ms=1000.0,
            agent_latencies={}, confidence_counts={}, domains_active=0,
            error_count=0, errors=[], estimated_tokens=150, questions_count=1,
            high_confidence_questions=0,
            prompt_tokens=100, completion_tokens=50, total_tokens=150, llm_calls=1,
        )
        with patch("routers.analysis.get_session_usage", return_value={"calls": 2, "prompt_tokens": 200, "completion_tokens": 100, "total_tokens": 300}):
            with patch("routers.analysis.get_collector") as mock_col:
                mock_col.return_value._runs = [mock_record]
                _record_approve_tokens("sess-1", 0.0, 1.0)
        assert mock_record.llm_calls == 3

    def _translate_app(self):
        from fastapi import FastAPI
        from routers.analysis import router
        from auth.dependencies import get_tenant_ctx
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_tenant_ctx] = lambda: _admin_ctx()
        return app

    def test_translate_no_report_no_session_raises_404(self):
        async def _null_coro(*_a, **_kw):
            return None

        client = TestClient(self._translate_app())
        with patch("routers.analysis.session_store.get", return_value=None):
            with patch("routers.analysis.store.read_meta", side_effect=_null_coro):
                resp = client.post("/api/v1/analysis/translate", json={
                    "session_id": "nosuchsession",
                    "language_code": "hi",
                    "report": {},
                })
        assert resp.status_code == 404

    def test_translate_no_deepseek_key_raises_503(self):
        client = TestClient(self._translate_app())
        with patch("os.environ.get", return_value=""):
            resp = client.post("/api/v1/analysis/translate", json={
                "session_id": "",
                "language_code": "hi",
                "report": {"narrative": "Hello world."},
            })
        assert resp.status_code in (503, 200)

    def test_translate_english_passthrough(self):
        async def _null_coro(*_a, **_kw):
            return None

        client = TestClient(self._translate_app())
        with patch("os.environ.get", return_value="fake-key"):
            with patch("routers.analysis.translation_agent", return_value={"language_code": "en", "narrative": "Hello"}):
                with patch("routers.analysis.store.write_meta", side_effect=_null_coro):
                    resp = client.post("/api/v1/analysis/translate", json={
                        "session_id": "",
                        "language_code": "en",
                        "report": {"narrative": "Hello world."},
                    })
        assert resp.status_code == 200
        assert resp.json()["language_code"] == "en"

    def test_translate_invalid_language_raises_400(self):
        client = TestClient(self._translate_app())
        with patch("os.environ.get", return_value="fake-key"):
            with patch("routers.analysis.translation_agent", side_effect=ValueError("not supported")):
                resp = client.post("/api/v1/analysis/translate", json={
                    "session_id": "",
                    "language_code": "xx",
                    "report": {"narrative": "Hello."},
                })
        assert resp.status_code == 400
