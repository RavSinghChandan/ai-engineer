"""
Coverage boost for:
  - cache/redis_store.py  (57% → 88%+)  — all operations with mocked Redis client
"""
from __future__ import annotations
import json
from unittest.mock import MagicMock, patch


def _mock_redis_client():
    """Return a MagicMock that passes isinstance checks."""
    return MagicMock()


class TestMakeClient:
    def test_make_client_returns_none_on_import_error(self):
        from cache.redis_store import _make_client
        with patch.dict("sys.modules", {"redis": None}):
            result = _make_client("redis://localhost:6379/0")
        assert result is None

    def test_make_client_returns_none_on_ping_failure(self):
        from cache.redis_store import _make_client
        mock_redis = MagicMock()
        mock_pool = MagicMock()
        mock_client = MagicMock()
        mock_client.ping.side_effect = ConnectionRefusedError("no redis")
        mock_redis.ConnectionPool.from_url.return_value = mock_pool
        mock_redis.Redis.return_value = mock_client
        with patch.dict("sys.modules", {"redis": mock_redis}):
            result = _make_client("redis://localhost:6379/0")
        assert result is None

    def test_make_client_success(self):
        from cache.redis_store import _make_client
        mock_redis = MagicMock()
        mock_pool = MagicMock()
        mock_client = MagicMock()
        mock_client.ping.return_value = True
        mock_redis.ConnectionPool.from_url.return_value = mock_pool
        mock_redis.Redis.return_value = mock_client
        with patch.dict("sys.modules", {"redis": mock_redis}):
            result = _make_client("redis://localhost:6379/0")
        assert result is mock_client


class TestGetClientFunctions:
    def setup_method(self):
        import cache.redis_store as rs
        rs._cache_client = None
        rs._job_client = None

    def test_get_cache_client_returns_none_when_disabled(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs._get_cache_client()
        assert result is None

    def test_get_job_client_returns_none_when_disabled(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs._get_job_client()
        assert result is None

    def test_get_cache_client_returns_existing(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        rs._cache_client = mock_client
        result = rs._get_cache_client()
        assert result is mock_client
        rs._cache_client = None

    def test_get_job_client_returns_existing(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        rs._job_client = mock_client
        result = rs._get_job_client()
        assert result is mock_client
        rs._job_client = None

    def test_get_cache_client_enabled_creates_client(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_make_client", return_value=mock_client):
                result = rs._get_cache_client()
        assert result is mock_client
        rs._cache_client = None

    def test_get_job_client_enabled_creates_client(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_make_client", return_value=mock_client):
                result = rs._get_job_client()
        assert result is mock_client
        rs._job_client = None


class TestRedisGet:
    def setup_method(self):
        import cache.redis_store as rs
        rs._cache_client = None

    def test_redis_get_disabled_returns_none(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.redis_get("some-key")
        assert result is None

    def test_redis_get_no_client_returns_none(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=None):
                result = rs.redis_get("some-key")
        assert result is None

    def test_redis_get_hit_returns_value(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.get.return_value = json.dumps({"x": 1})
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_get("key1")
        assert result == {"x": 1}

    def test_redis_get_miss_returns_none(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.get.return_value = None
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_get("missing-key")
        assert result is None

    def test_redis_get_exception_returns_none(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.get.side_effect = RuntimeError("connection lost")
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_get("err-key")
        assert result is None


class TestRedisSet:
    def test_redis_set_disabled_returns_false(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.redis_set("k", {"v": 1}, 60)
        assert result is False

    def test_redis_set_no_client_returns_false(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=None):
                result = rs.redis_set("k", {"v": 1}, 60)
        assert result is False

    def test_redis_set_success(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.setex.return_value = True
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_set("k", {"v": 1}, 60)
        assert result is True

    def test_redis_set_exception_returns_false(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.setex.side_effect = RuntimeError("redis down")
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_set("k", {"v": 1}, 60)
        assert result is False


class TestRedisMget:
    def test_redis_mget_disabled_returns_empty(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.redis_mget(["k1", "k2"])
        assert result == {}

    def test_redis_mget_empty_keys_returns_empty(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", True):
            result = rs.redis_mget([])
        assert result == {}

    def test_redis_mget_hits_and_misses(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.mget.return_value = [json.dumps({"a": 1}), None]
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_mget(["k1", "k2"])
        assert "k1" in result
        assert "k2" not in result

    def test_redis_mget_exception_returns_empty(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.mget.side_effect = RuntimeError("mget failed")
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_mget(["k1"])
        assert result == {}


class TestRedisPipelineSet:
    def test_pipeline_set_disabled_returns_zero(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.redis_pipeline_set([("k", {}, 60)])
        assert result == 0

    def test_pipeline_set_empty_returns_zero(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", True):
            result = rs.redis_pipeline_set([])
        assert result == 0

    def test_pipeline_set_success(self):
        from cache import redis_store as rs
        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [True, True]
        mock_client = MagicMock()
        mock_client.pipeline.return_value = mock_pipe
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_pipeline_set([("k1", {}, 60), ("k2", {}, 60)])
        assert result == 2


class TestRedisDelete:
    def test_redis_delete_disabled_returns_false(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.redis_delete("key")
        assert result is False

    def test_redis_delete_success(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.delete.return_value = 1
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                with patch.object(rs, "_publish_invalidation"):
                    result = rs.redis_delete("key")
        assert result is True

    def test_redis_delete_not_found_returns_false(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.delete.return_value = 0
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_cache_client", return_value=mock_client):
                result = rs.redis_delete("key")
        assert result is False


class TestJobRedisOperations:
    def test_job_redis_set_disabled_returns_false(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.job_redis_set("job-1", {"status": "done"})
        assert result is False

    def test_job_redis_get_disabled_returns_none(self):
        from cache import redis_store as rs
        with patch.object(rs, "REDIS_ENABLED", False):
            result = rs.job_redis_get("job-1")
        assert result is None

    def test_job_redis_set_success(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.setex.return_value = True
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_job_client", return_value=mock_client):
                result = rs.job_redis_set("job-1", {"status": "done"})
        assert result is True

    def test_job_redis_get_hit(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.get.return_value = json.dumps({"status": "done"})
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_job_client", return_value=mock_client):
                result = rs.job_redis_get("job-1")
        assert result == {"status": "done"}

    def test_job_redis_get_miss(self):
        from cache import redis_store as rs
        mock_client = MagicMock()
        mock_client.get.return_value = None
        with patch.object(rs, "REDIS_ENABLED", True):
            with patch.object(rs, "_get_job_client", return_value=mock_client):
                result = rs.job_redis_get("job-miss")
        assert result is None
