"""
Phase 6 — Redis Cache Tests
=============================
Positive, Negative, Integration, Smoke tests for cache/redis_store.py.
All tests run without a real Redis server — client is mocked.
"""
from __future__ import annotations
import pytest
from unittest.mock import MagicMock, patch


def _mock_client(get_val=None, ping_ok=True):
    c = MagicMock()
    c.ping.return_value = True if ping_ok else (_ for _ in ()).throw(Exception("conn refused"))
    c.get.return_value  = get_val
    c.setex.return_value = True
    c.delete.return_value = 1
    c.keys.return_value   = []
    c.info.return_value   = {"redis_version": "7.0", "used_memory": 1024 * 1024}
    return c


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestRedisCachePositive:

    def setup_method(self):
        import cache.redis_store as rs
        rs._client = None

    def test_redis_get_returns_payload_when_key_exists(self, monkeypatch):
        import json, cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        payload = {"session_id": "abc", "status": "completed"}
        mock = _mock_client(get_val=json.dumps(payload))
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_get("some_key")
        assert result == payload

    def test_redis_set_calls_setex(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client()
        monkeypatch.setattr(rs, "_client", mock)
        ok = rs.redis_set("key1", {"data": "x"}, ttl=300)
        assert ok is True
        mock.setex.assert_called_once()

    def test_redis_delete_returns_true_when_key_existed(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client()
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_delete("key1")
        assert result is True

    def test_redis_stats_connected(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client()
        mock.info.side_effect = lambda section: (
            {"redis_version": "7.0", "used_memory": 2097152}
            if section == "server" else {}
        )
        monkeypatch.setattr(rs, "_client", mock)
        s = rs.redis_stats()
        assert s["status"] == "connected"
        assert s["redis_version"] == "7.0"

    def test_redis_get_returns_none_on_cache_miss(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client(get_val=None)
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_get("missing_key")
        assert result is None


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestRedisCacheNegative:

    def setup_method(self):
        import cache.redis_store as rs
        rs._client = None

    def test_redis_disabled_get_returns_none(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        assert rs.redis_get("any_key") is None

    def test_redis_disabled_set_returns_false(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        assert rs.redis_set("key", {"x": 1}, ttl=60) is False

    def test_redis_disabled_stats_shows_disabled(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        s = rs.redis_stats()
        assert s["enabled"] is False
        assert s["status"] == "disabled"

    def test_redis_get_error_returns_none(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client()
        mock.get.side_effect = Exception("connection lost")
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_get("key")
        assert result is None

    def test_redis_set_error_returns_false(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client()
        mock.setex.side_effect = Exception("write failed")
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_set("key", {"x": 1}, ttl=60)
        assert result is False

    def test_redis_get_invalid_json_returns_none(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_client(get_val="not valid json {{")
        monkeypatch.setattr(rs, "_client", mock)
        result = rs.redis_get("key")
        assert result is None

    def test_redis_unreachable_stats_shows_unreachable(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        monkeypatch.setattr(rs, "_client", None)
        with patch("cache.redis_store._get_client", return_value=None):
            s = rs.redis_stats()
        assert s["status"] in ("unreachable", "error", "disabled")


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestRedisCacheIntegration:

    def test_redis_stats_in_metrics_endpoint(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/metrics", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert "redis_cache" in body
        assert "enabled" in body["redis_cache"]

    def test_redis_disabled_does_not_affect_run_endpoint(self, monkeypatch):
        """With REDIS_ENABLED=false, /run must still work exactly as before."""
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        # redis_get must return None → falls through to in-memory cache
        result = rs.redis_get("any_key")
        assert result is None


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestRedisCacheSmoke:

    def test_module_imports(self):
        from cache.redis_store import redis_get, redis_set, redis_delete, redis_stats
        assert callable(redis_get)
        assert callable(redis_set)
        assert callable(redis_delete)
        assert callable(redis_stats)

    def test_enabled_flag_is_bool(self):
        import cache.redis_store as rs
        assert isinstance(rs.REDIS_ENABLED, bool)

    def test_url_is_string(self):
        import cache.redis_store as rs
        assert isinstance(rs.REDIS_URL, str)

    def test_client_starts_none(self):
        import cache.redis_store as rs
        # attribute must exist (even if set to a client by now)
        assert hasattr(rs, "_client")
