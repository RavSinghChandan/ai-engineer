"""
Coverage boost for:
  - routers/async_analysis.py  (55% → 90%+)
  - session_store.py           (74% → 90%+)
"""
from __future__ import annotations
import os
import sys
import time
import json
import pytest
from unittest.mock import MagicMock, patch, call

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
import auth.store as auth_store
from auth.models import Role
from database import get_conn

ADMIN_KEY = "sk-async-sess-admin"
TENANT_ID = "tenant_async_sess"


def _insert_key(tenant_id, tenant_name, key, role):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,1,?)",
            (tenant_id, tenant_name, time.time()),
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
    _insert_key(TENANT_ID, "Async Sess Tenant", ADMIN_KEY, Role.ADMIN)
    yield
    auth_store.clear_for_tests()


@pytest.fixture()
def client():
    import cache.store as cache_store
    cache_store.clear()
    return TestClient(app, raise_server_exceptions=False)


ADMIN_H = {"X-API-Key": ADMIN_KEY}

_GOOD_REQUEST = {
    "user_profile": {
        "full_name": "Test User",
        "date_of_birth": "1990-05-15",
        "time_of_birth": "10:30",
        "place_of_birth": "Delhi",
    },
    "user_question": "What does my chart say about career?",
    "questions": [],
    "selected_modules": ["astrology"],
}


class TestAsyncAnalysisRouter:
    def test_submit_returns_job_id(self, client):
        resp = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST, headers=ADMIN_H)
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "queued"

    def test_submit_returns_poll_url(self, client):
        resp = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST, headers=ADMIN_H)
        assert resp.status_code == 200
        data = resp.json()
        assert "poll_url" in data
        assert data["poll_url"].startswith("/api/v1/analysis/job/")

    def test_get_job_status_found(self, client):
        submit = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST, headers=ADMIN_H)
        job_id = submit.json()["job_id"]
        poll = client.get(f"/api/v1/analysis/job/{job_id}", headers=ADMIN_H)
        assert poll.status_code == 200
        data = poll.json()
        assert data["job_id"] == job_id
        assert data["status"] in ("queued", "processing", "done", "failed")

    def test_get_job_status_not_found(self, client):
        resp = client.get("/api/v1/analysis/job/nonexistent-job-id-xyz", headers=ADMIN_H)
        assert resp.status_code == 404

    def test_get_jobs_stats(self, client):
        resp = client.get("/api/v1/analysis/jobs/stats", headers=ADMIN_H)
        assert resp.status_code == 200
        data = resp.json()
        assert "kafka_enabled" in data

    def test_get_jobs_stats_no_auth_returns_401_or_403(self, client):
        resp = client.get("/api/v1/analysis/jobs/stats")
        assert resp.status_code in (401, 403, 422)

    def test_submit_no_auth_returns_error(self, client):
        resp = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST)
        assert resp.status_code in (401, 403, 422)

    def test_submit_rate_limited(self, client):
        from guardrails.production import rate_limiter
        with patch.object(rate_limiter, "is_allowed", return_value=(False, "rate limit exceeded")):
            resp = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST, headers=ADMIN_H)
        assert resp.status_code == 429

    def test_get_job_result_is_none_when_not_done(self, client):
        submit = client.post("/api/v1/analysis/submit", json=_GOOD_REQUEST, headers=ADMIN_H)
        job_id = submit.json()["job_id"]
        poll = client.get(f"/api/v1/analysis/job/{job_id}", headers=ADMIN_H)
        data = poll.json()
        if data["status"] != "done":
            assert data["result"] is None


class TestSessionStore:
    def setup_method(self):
        import session_store
        session_store._mem.clear()

    def test_save_and_get_roundtrip(self):
        import session_store
        session_store.save("sess-001", {"key": "value"}, tenant_id="t1")
        result = session_store.get("sess-001")
        assert result is not None
        assert result["key"] == "value"

    def test_get_missing_returns_none(self):
        import session_store
        result = session_store.get("sess-nonexistent-xyz")
        assert result is None

    def test_save_serialization_error_returns_early(self):
        import session_store

        class Unserializable:
            pass

        unserializable_state = {"obj": Unserializable()}
        session_store._mem.clear()
        with patch("session_store.json.dumps", side_effect=TypeError("cannot serialize")):
            session_store.save("sess-bad", unserializable_state, tenant_id="t1")
        # Should not raise; just returns early without crashing

    def test_update_existing_session(self):
        import session_store
        session_store.save("sess-upd", {"x": 1}, tenant_id="t1")
        session_store.update("sess-upd", "x", 99, tenant_id="t1")
        result = session_store.get("sess-upd")
        assert result["x"] == 99

    def test_update_missing_session_no_crash(self):
        import session_store
        session_store.update("sess-missing-xyz", "key", "val")
        # Should not raise

    def test_sweep_expired_returns_int(self):
        import session_store
        result = session_store.sweep_expired()
        assert isinstance(result, int)

    def test_sweep_expired_error_returns_zero(self):
        import session_store
        with patch("session_store._db._tx", side_effect=RuntimeError("DB down")):
            result = session_store.sweep_expired()
        assert result == 0

    def test_get_cold_path_db_error_returns_none(self):
        import session_store
        session_store._mem.pop("sess-cold-err", None)
        with patch("session_store._db._tx", side_effect=RuntimeError("DB read error")):
            result = session_store.get("sess-cold-err")
        assert result is None

    def test_get_cold_path_db_row_warms_memory(self):
        import session_store
        session_store._mem.pop("sess-cold-warm", None)

        mock_row = (json.dumps({"restored": True}),)
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = mock_row
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cur

        from contextlib import contextmanager

        @contextmanager
        def mock_tx():
            yield mock_conn

        with patch("session_store._db._tx", mock_tx):
            with patch("session_store._db._USE_PG", False):
                result = session_store.get("sess-cold-warm")

        assert result is not None
        assert result["restored"] is True
        assert session_store._mem.get("sess-cold-warm") == result

    def test_sweep_expired_clears_memory(self):
        import session_store
        session_store._mem["sess-old"] = {"data": "old"}
        session_store.sweep_expired()
        # After sweep memory should be cleared
        assert "sess-old" not in session_store._mem

    def test_save_db_error_does_not_raise(self):
        import session_store
        with patch("session_store._db._tx", side_effect=RuntimeError("DB down")):
            session_store.save("sess-dberr", {"x": 1}, tenant_id="t1")
        # Should not raise

    def test_get_from_memory_hot_path(self):
        import session_store
        session_store._mem["sess-hot"] = {"cached": True}
        result = session_store.get("sess-hot")
        assert result["cached"] is True
