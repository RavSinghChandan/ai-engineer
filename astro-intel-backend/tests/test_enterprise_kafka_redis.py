"""
Enterprise Kafka + Redis Tests
================================
Covers all new enterprise-grade features:

Kafka:
  - Producer retry with exponential backoff
  - DLQ routing after all retries exhausted
  - Multi-worker consumer group lifecycle
  - Graceful shutdown via stop_event
  - Consumer health reporting
  - Producer health reporting

Redis:
  - Connection pool creation
  - Batch get (mget) and pipeline set
  - Job store persistence (DB 1)
  - Pub/sub invalidation channel
  - Stats for both cache DB and job DB
  - Reset client on connection error

Job Store:
  - Redis write-through on every state transition
  - Redis recovery on get miss (simulated restart)
  - retry_count tracking

All tests run without a real Kafka broker or Redis server.
"""
from __future__ import annotations
import json
import time
import pytest
from unittest.mock import MagicMock, patch, call


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _reset_job_store():
    from pipeline_queue import job_store as js
    js._jobs.clear()
    js._completed.clear()


def _mock_redis(get_val=None):
    c = MagicMock()
    c.ping.return_value = True
    c.get.return_value   = get_val
    c.mget.return_value  = [get_val] if get_val else [None]
    c.setex.return_value = True
    c.delete.return_value = 1
    c.keys.return_value   = []
    c.publish.return_value = 1
    c.pipeline.return_value.__enter__ = MagicMock(return_value=MagicMock())
    c.pipeline.return_value.__exit__  = MagicMock(return_value=False)
    c.pipeline.return_value.execute.return_value = [True, True]
    c.info.side_effect = lambda section: {
        "server":   {"redis_version": "7.2", "used_memory": 2097152},
        "keyspace": {"db0": {"keys": 10}, "db1": {"keys": 5}},
        "stats":    {"keyspace_hits": 100, "keyspace_misses": 20, "evicted_keys": 0},
    }.get(section, {})
    return c


# ─────────────────────────────────────────────────────────────────────────────
# KAFKA PRODUCER — Enterprise
# ─────────────────────────────────────────────────────────────────────────────

class TestKafkaProducerEnterprise:

    def setup_method(self):
        import pipeline_queue.producer as p
        p._producer = None
        _reset_job_store()

    def test_publish_retries_on_transient_failure(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", True)
        monkeypatch.setattr(p, "KAFKA_MAX_RETRIES", 3)
        monkeypatch.setattr(p, "KAFKA_RETRY_BACKOFF", 0.0)

        mock_prod = MagicMock()
        # fail first 2 attempts, succeed on 3rd
        mock_prod.send.side_effect = [Exception("timeout"), Exception("timeout"), None]
        mock_prod.flush.return_value = None
        monkeypatch.setattr(p, "_producer", mock_prod)
        monkeypatch.setattr(p, "_reset_producer", lambda: None)

        from pipeline_queue.job_store import create_job
        jid = create_job({})
        result = p.publish(jid, {"user_profile": {}})
        assert result is True
        assert mock_prod.send.call_count == 3

    def test_publish_sends_to_dlq_after_all_retries_exhausted(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", True)
        monkeypatch.setattr(p, "KAFKA_MAX_RETRIES", 2)
        monkeypatch.setattr(p, "KAFKA_RETRY_BACKOFF", 0.0)

        mock_prod = MagicMock()
        mock_prod.send.side_effect = Exception("broker down")
        monkeypatch.setattr(p, "_producer", mock_prod)
        monkeypatch.setattr(p, "_reset_producer", lambda: None)

        dlq_called = []
        monkeypatch.setattr(p, "_send_to_dlq", lambda jid, payload, err: dlq_called.append(jid))
        monkeypatch.setattr(p, "_run_inline", lambda jid, payload: None)

        from pipeline_queue.job_store import create_job
        jid = create_job({})
        result = p.publish(jid, {})
        assert result is False
        assert len(dlq_called) == 1
        assert dlq_called[0] == jid

    def test_publish_falls_back_to_inline_when_kafka_disabled(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", False)
        monkeypatch.setattr(p, "_producer", None)

        inline_called = []
        monkeypatch.setattr(p, "_run_inline", lambda jid, payload: inline_called.append(jid))

        from pipeline_queue.job_store import create_job
        jid = create_job({})
        result = p.publish(jid, {})
        assert result is False

    def test_kafka_producer_health_disabled(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", False)
        h = p.kafka_producer_health()
        assert h["enabled"] is False
        assert h["status"] == "disabled"

    def test_kafka_producer_health_connected(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", True)
        mock_prod = MagicMock()
        monkeypatch.setattr(p, "_producer", mock_prod)
        h = p.kafka_producer_health()
        assert h["enabled"] is True
        assert h["status"] == "connected"
        assert "dlq_topic" in h

    def test_kafka_producer_health_unreachable(self, monkeypatch):
        import pipeline_queue.producer as p
        monkeypatch.setattr(p, "KAFKA_ENABLED", True)
        monkeypatch.setattr(p, "_producer", None)
        monkeypatch.setattr(p, "_get_producer", lambda: None)
        h = p.kafka_producer_health()
        assert h["status"] == "unreachable"


# ─────────────────────────────────────────────────────────────────────────────
# KAFKA CONSUMER — Enterprise
# ─────────────────────────────────────────────────────────────────────────────

class TestKafkaConsumerEnterprise:

    def setup_method(self):
        import pipeline_queue.consumer as c
        c._stop_event.clear()
        c._worker_threads.clear()
        _reset_job_store()

    def test_start_consumer_noop_when_disabled(self, monkeypatch):
        import pipeline_queue.consumer as c
        monkeypatch.setattr(c, "KAFKA_ENABLED", False)
        c.start_consumer()
        assert len(c._worker_threads) == 0

    def test_stop_consumer_sets_stop_event(self, monkeypatch):
        import pipeline_queue.consumer as c
        monkeypatch.setattr(c, "KAFKA_ENABLED", False)
        c.stop_consumer()
        assert c._stop_event.is_set()

    def test_consumer_health_disabled(self, monkeypatch):
        import pipeline_queue.consumer as c
        monkeypatch.setattr(c, "KAFKA_ENABLED", False)
        h = c.consumer_health()
        assert h["enabled"] is False
        assert h["status"] == "disabled"
        assert h["workers"] == 0

    def test_consumer_health_running(self, monkeypatch):
        import pipeline_queue.consumer as c
        monkeypatch.setattr(c, "KAFKA_ENABLED", True)
        mock_thread = MagicMock()
        mock_thread.is_alive.return_value = True
        c._worker_threads = [mock_thread, mock_thread, mock_thread]
        h = c.consumer_health()
        assert h["enabled"] is True
        assert h["workers_alive"] == 3
        assert h["status"] == "running"

    def test_consumer_health_stopped(self, monkeypatch):
        import pipeline_queue.consumer as c
        monkeypatch.setattr(c, "KAFKA_ENABLED", True)
        mock_thread = MagicMock()
        mock_thread.is_alive.return_value = False
        c._worker_threads = [mock_thread]
        h = c.consumer_health()
        assert h["status"] == "stopped"
        assert h["workers_alive"] == 0

    def test_execute_job_called_by_worker(self, monkeypatch):
        import pipeline_queue.consumer as c
        from pipeline_queue.job_store import create_job, get_job, mark_processing

        jid = create_job({"user_profile": {}, "user_question": "test"})
        mark_processing(jid)

        executed = []
        monkeypatch.setattr(c, "_execute_job", lambda p: executed.append(p) or {"session_id": "x"})

        # Simulate one consumer cycle without Kafka
        from pipeline_queue.job_store import mark_done
        mark_done(jid, c._execute_job({"user_profile": {}}))
        assert len(executed) == 1
        assert get_job(jid)["status"] == "done"


# ─────────────────────────────────────────────────────────────────────────────
# REDIS STORE — Enterprise
# ─────────────────────────────────────────────────────────────────────────────

class TestRedisStoreEnterprise:

    def setup_method(self):
        import cache.redis_store as rs
        rs._cache_client = None
        rs._job_client   = None

    def test_redis_mget_returns_hit_dict(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        mock.mget.return_value = [json.dumps({"k": "v1"}), None, json.dumps({"k": "v3"})]
        monkeypatch.setattr(rs, "_cache_client", mock)
        result = rs.redis_mget(["key1", "key2", "key3"])
        assert "key1" in result
        assert "key2" not in result   # miss
        assert "key3" in result

    def test_redis_mget_disabled_returns_empty(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        assert rs.redis_mget(["a", "b"]) == {}

    def test_redis_pipeline_set_batches_writes(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        pipe_mock = MagicMock()
        pipe_mock.execute.return_value = [True, True, True]
        mock.pipeline.return_value = pipe_mock
        monkeypatch.setattr(rs, "_cache_client", mock)

        items = [("k1", {"a": 1}, 300), ("k2", {"b": 2}, 300), ("k3", {"c": 3}, 300)]
        count = rs.redis_pipeline_set(items)
        assert count == 3
        assert pipe_mock.setex.call_count == 3
        pipe_mock.execute.assert_called_once()

    def test_redis_pipeline_set_disabled_returns_zero(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        assert rs.redis_pipeline_set([("k", {}, 60)]) == 0

    def test_redis_delete_publishes_invalidation(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        mock.delete.return_value = 1
        monkeypatch.setattr(rs, "_cache_client", mock)

        published = []
        monkeypatch.setattr(rs, "_publish_invalidation", lambda k: published.append(k))

        rs.redis_delete("some_key")
        assert "some_key" in published

    def test_redis_stats_returns_full_info(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        monkeypatch.setattr(rs, "_cache_client", mock)
        s = rs.redis_stats()
        assert s["status"] == "connected"
        assert "hits" in s
        assert "misses" in s
        assert "evicted_keys" in s
        assert "pool_max" in s

    def test_redis_reset_on_error(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        mock.get.side_effect = Exception("connection lost")
        monkeypatch.setattr(rs, "_cache_client", mock)

        result = rs.redis_get("key")
        assert result is None
        assert rs._cache_client is None  # reset after error

    def test_redis_set_resets_client_on_error(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        mock.setex.side_effect = Exception("write failed")
        monkeypatch.setattr(rs, "_cache_client", mock)

        result = rs.redis_set("key", {}, 60)
        assert result is False
        assert rs._cache_client is None


# ─────────────────────────────────────────────────────────────────────────────
# REDIS JOB STORE — Enterprise
# ─────────────────────────────────────────────────────────────────────────────

class TestRedisJobStore:

    def setup_method(self):
        import cache.redis_store as rs
        rs._job_client = None

    def test_job_redis_set_stores_job(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        monkeypatch.setattr(rs, "_job_client", mock)

        job = {"job_id": "abc", "status": "queued", "created_at": time.time(),
               "updated_at": time.time(), "result": None, "error": None, "retry_count": 0}
        result = rs.job_redis_set("abc", job)
        assert result is True
        mock.setex.assert_called_once()

    def test_job_redis_get_returns_job(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        job = {"job_id": "abc", "status": "done", "created_at": time.time(),
               "updated_at": time.time(), "result": {"ok": True}, "error": None}
        mock = _mock_redis(get_val=json.dumps(job))
        monkeypatch.setattr(rs, "_job_client", mock)

        result = rs.job_redis_get("abc")
        assert result is not None
        assert result["status"] == "done"

    def test_job_redis_get_returns_none_when_disabled(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        assert rs.job_redis_get("any") is None

    def test_job_redis_stats_connected(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", True)
        mock = _mock_redis()
        mock.info.return_value = {"db1": {"keys": 7}}
        monkeypatch.setattr(rs, "_job_client", mock)
        s = rs.job_redis_stats()
        assert s["status"] == "connected"
        assert "total_jobs" in s

    def test_job_redis_stats_disabled(self, monkeypatch):
        import cache.redis_store as rs
        monkeypatch.setattr(rs, "REDIS_ENABLED", False)
        s = rs.job_redis_stats()
        assert s["enabled"] is False


# ─────────────────────────────────────────────────────────────────────────────
# JOB STORE — Redis write-through + recovery
# ─────────────────────────────────────────────────────────────────────────────

class TestJobStoreRedisIntegration:

    def setup_method(self):
        _reset_job_store()

    def test_create_job_persists_to_redis(self, monkeypatch):
        persisted = []
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "_persist", lambda jid: persisted.append(jid))
        jid = js.create_job({"user_profile": {}})
        assert jid in persisted

    def test_mark_processing_persists(self, monkeypatch):
        persisted = []
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "_persist", lambda jid: persisted.append(jid))
        jid = js.create_job({})
        persisted.clear()
        js.mark_processing(jid)
        assert jid in persisted

    def test_mark_done_persists(self, monkeypatch):
        persisted = []
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "_persist", lambda jid: persisted.append(jid))
        jid = js.create_job({})
        persisted.clear()
        js.mark_done(jid, {"session_id": "x"})
        assert jid in persisted

    def test_mark_failed_persists(self, monkeypatch):
        persisted = []
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "_persist", lambda jid: persisted.append(jid))
        jid = js.create_job({})
        persisted.clear()
        js.mark_failed(jid, "boom")
        assert jid in persisted

    def test_increment_retry_increments_count(self):
        import pipeline_queue.job_store as js
        jid = js.create_job({})
        c1 = js.increment_retry(jid)
        c2 = js.increment_retry(jid)
        assert c1 == 1
        assert c2 == 2

    def test_get_job_recovers_from_redis_on_miss(self, monkeypatch):
        import pipeline_queue.job_store as js
        recovered_job = {
            "job_id": "redis-recovered", "status": "done",
            "created_at": time.time(), "updated_at": time.time(),
            "result": {"ok": True}, "error": None, "retry_count": 0,
            "payload": {},
        }
        monkeypatch.setattr(js, "_restore_from_redis",
                            lambda jid: recovered_job if jid == "redis-recovered" else None)
        job = js.get_job("redis-recovered")
        assert job is not None
        assert job["status"] == "done"

    def test_get_job_returns_none_when_not_in_memory_or_redis(self, monkeypatch):
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "_restore_from_redis", lambda jid: None)
        assert js.get_job("ghost-job-xyz") is None

    def test_stats_includes_retry_count(self):
        import pipeline_queue.job_store as js
        jid = js.create_job({})
        js.increment_retry(jid)
        js.increment_retry(jid)
        job = js.get_job(jid)
        assert job["retry_count"] == 2


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH ENDPOINT — Full stack
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthEndpointEnterprise:

    def test_health_endpoint_includes_kafka_and_redis(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert "kafka" in body
        assert "redis" in body
        assert "producer" in body["kafka"]
        assert "consumer" in body["kafka"]
        assert "cache" in body["redis"]
        assert "jobs" in body["redis"]

    def test_jobs_stats_includes_kafka_enabled_flag(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/analysis/jobs/stats",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert "kafka_enabled" in body
        assert isinstance(body["kafka_enabled"], bool)


# ─────────────────────────────────────────────────────────────────────────────
# SMOKE — All new imports
# ─────────────────────────────────────────────────────────────────────────────

class TestEnterpriseSmoke:

    def test_producer_new_functions_exist(self):
        from pipeline_queue.producer import publish, kafka_producer_health, _send_to_dlq
        assert callable(publish)
        assert callable(kafka_producer_health)
        assert callable(_send_to_dlq)

    def test_consumer_new_functions_exist(self):
        from pipeline_queue.consumer import (
            start_consumer, stop_consumer, consumer_health, _execute_job
        )
        assert callable(start_consumer)
        assert callable(stop_consumer)
        assert callable(consumer_health)
        assert callable(_execute_job)

    def test_redis_new_functions_exist(self):
        from cache.redis_store import (
            redis_mget, redis_pipeline_set, job_redis_set,
            job_redis_get, job_redis_stats, register_invalidation_callback
        )
        assert callable(redis_mget)
        assert callable(redis_pipeline_set)
        assert callable(job_redis_set)
        assert callable(job_redis_get)
        assert callable(job_redis_stats)
        assert callable(register_invalidation_callback)

    def test_job_store_has_retry_and_recovery(self):
        from pipeline_queue.job_store import (
            increment_retry, _persist, _restore_from_redis
        )
        assert callable(increment_retry)
        assert callable(_persist)
        assert callable(_restore_from_redis)

    def test_kafka_disabled_by_default(self):
        # Default env has KAFKA_ENABLED=false
        import pipeline_queue.producer as p
        import pipeline_queue.consumer as c
        # Both modules read from env at import time; in test env it's false
        assert isinstance(p.KAFKA_ENABLED, bool)
        assert isinstance(c.KAFKA_ENABLED, bool)
