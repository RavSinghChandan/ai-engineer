"""
Phase 7 — Kafka Async Pipeline Tests
=======================================
Positive, Negative, Integration, Smoke tests for
queue/job_store.py, queue/producer.py, queue/consumer.py,
and the /submit + /job/{id} endpoints.
All tests run without a real Kafka broker.
"""
from __future__ import annotations
import time
import pytest
from pipeline_queue.job_store import (
    create_job, get_job, mark_processing, mark_done, mark_failed,
    active_count, stats, _jobs,
)


def _reset():
    _jobs.clear()


# ── JOB STORE POSITIVE ────────────────────────────────────────────────────────

class TestJobStorePositive:

    def setup_method(self): _reset()

    def test_create_job_returns_string_id(self):
        jid = create_job({"user_profile": {}})
        assert isinstance(jid, str) and len(jid) > 0

    def test_created_job_is_queued(self):
        jid = create_job({"user_profile": {}})
        job = get_job(jid)
        assert job["status"] == "queued"

    def test_mark_processing_updates_status(self):
        jid = create_job({})
        mark_processing(jid)
        assert get_job(jid)["status"] == "processing"

    def test_mark_done_stores_result(self):
        jid = create_job({})
        mark_done(jid, {"session_id": "abc"})
        job = get_job(jid)
        assert job["status"] == "done"
        assert job["result"]["session_id"] == "abc"

    def test_mark_failed_stores_error(self):
        jid = create_job({})
        mark_failed(jid, "pipeline exploded")
        job = get_job(jid)
        assert job["status"] == "failed"
        assert "pipeline exploded" in job["error"]

    def test_active_count_counts_queued_and_processing(self):
        j1 = create_job({})
        j2 = create_job({})
        mark_processing(j2)
        assert active_count() == 2

    def test_active_count_excludes_done(self):
        jid = create_job({})
        mark_done(jid, {})
        assert active_count() == 0

    def test_stats_returns_all_states(self):
        create_job({})
        j2 = create_job({})
        mark_done(j2, {})
        s = stats()
        assert s["queued"] >= 1
        assert s["done"] >= 1
        assert "processing" in s
        assert "failed" in s


# ── JOB STORE NEGATIVE ───────────────────────────────────────────────────────

class TestJobStoreNegative:

    def setup_method(self): _reset()

    def test_get_job_returns_none_for_unknown(self):
        assert get_job("does-not-exist") is None

    def test_mark_done_on_unknown_id_does_not_raise(self):
        mark_done("ghost", {"x": 1})  # must not raise

    def test_mark_failed_on_unknown_id_does_not_raise(self):
        mark_failed("ghost", "err")  # must not raise

    def test_expired_done_job_returns_none(self, monkeypatch):
        import pipeline_queue.job_store as js
        monkeypatch.setattr(js, "JOB_TTL_SECONDS", 0)
        jid = create_job({})
        mark_done(jid, {"ok": True})
        time.sleep(0.01)
        result = get_job(jid)
        assert result is None


# ── PRODUCER POSITIVE ─────────────────────────────────────────────────────────

class TestProducerPositive:

    def setup_method(self): _reset()

    def test_publish_disabled_runs_inline(self, monkeypatch):
        """With KAFKA_ENABLED=false, publish() must fall back to inline thread."""
        import pipeline_queue.producer as prod
        monkeypatch.setattr(prod, "KAFKA_ENABLED", False)
        monkeypatch.setattr(prod, "_producer", None)

        jid = create_job({"user_profile": {}, "user_question": "test"})
        called = []

        def fake_run_inline(job_id, payload):
            called.append(job_id)
            mark_done(job_id, {"result": "ok"})

        monkeypatch.setattr(prod, "_run_inline", fake_run_inline)
        result = prod.publish(jid, {"user_profile": {}, "user_question": "test"})
        assert result is False   # False = fell back to inline

    def test_publish_kafka_enabled_sends_message(self, monkeypatch):
        import pipeline_queue.producer as prod
        monkeypatch.setattr(prod, "KAFKA_ENABLED", True)

        mock_producer = pytest.importorskip("unittest.mock").MagicMock()
        monkeypatch.setattr(prod, "_producer", mock_producer)

        jid = create_job({})
        result = prod.publish(jid, {"user_profile": {}})
        assert result is True
        mock_producer.send.assert_called_once()
        mock_producer.flush.assert_called_once()

    def test_publish_kafka_send_failure_falls_back(self, monkeypatch):
        """If Kafka send raises, must fall back to inline without crashing."""
        import pipeline_queue.producer as prod
        monkeypatch.setattr(prod, "KAFKA_ENABLED", True)

        mock_producer = pytest.importorskip("unittest.mock").MagicMock()
        mock_producer.send.side_effect = Exception("broker down")
        monkeypatch.setattr(prod, "_producer", mock_producer)

        called = []
        monkeypatch.setattr(prod, "_run_inline",
                            lambda jid, payload: called.append(jid))

        jid = create_job({})
        result = prod.publish(jid, {})
        assert result is False  # fell back


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestKafkaIntegration:

    def setup_method(self): _reset()

    def test_submit_endpoint_returns_job_id(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        body = {
            "user_profile": {
                "full_name": "Test User", "date_of_birth": "1990-01-01",
                "time_of_birth": "10:00", "place_of_birth": "Mumbai",
            },
            "user_question": "career growth",
            "questions": [],
        }
        resp = client.post("/api/v1/analysis/submit", json=body, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "queued"

    def test_job_status_endpoint_returns_status(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        body = {
            "user_profile": {
                "full_name": "Poll Test", "date_of_birth": "1985-06-15",
                "time_of_birth": "08:00", "place_of_birth": "Delhi",
            },
            "user_question": "health",
            "questions": [],
        }
        submit = client.post("/api/v1/analysis/submit", json=body, headers=headers)
        job_id = submit.json()["job_id"]

        poll = client.get(f"/api/v1/analysis/job/{job_id}", headers=headers)
        assert poll.status_code == 200
        assert poll.json()["job_id"] == job_id
        assert poll.json()["status"] in ("queued", "processing", "done", "failed")

    def test_job_404_for_unknown_id(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app, raise_server_exceptions=False)
        token_resp = client.post("/auth/login",
                                 json={"email": "admin@aura.local", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json()["access_token"]
        resp = client.get("/api/v1/analysis/job/nonexistent-job-xyz",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404

    def test_jobs_stats_endpoint(self):
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
        assert "total" in body


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestKafkaSmoke:

    def test_job_store_imports(self):
        from pipeline_queue.job_store import create_job, get_job, mark_done, stats
        assert callable(create_job)

    def test_producer_imports(self):
        from pipeline_queue.producer import publish, KAFKA_ENABLED
        assert callable(publish)
        assert isinstance(KAFKA_ENABLED, bool)

    def test_consumer_imports(self):
        from pipeline_queue.consumer import start_consumer, _execute_job, KAFKA_ENABLED
        assert callable(start_consumer)
        assert callable(_execute_job)

    def test_kafka_disabled_by_default(self):
        from pipeline_queue.producer import KAFKA_ENABLED
        assert KAFKA_ENABLED is False

    def test_start_consumer_noop_when_disabled(self, monkeypatch):
        import pipeline_queue.consumer as cons
        monkeypatch.setattr(cons, "KAFKA_ENABLED", False)
        cons._worker_threads.clear()
        cons.start_consumer()   # must not raise or start any threads
        assert len(cons._worker_threads) == 0
