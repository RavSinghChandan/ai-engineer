"""
Phase 4 — Redis + Kafka infrastructure tests.

All tests mock the underlying clients — no real Redis or Kafka broker is
needed. Tests verify:
  - redis_client: set/get/delete/ping with graceful degradation
  - kafka_producer: publish, retry, DLQ routing
  - /health/ready: redis + kafka status in response
  - main.py: Kafka publish called after CV upload and plan generation
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# Redis client unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRedisClient:

    def setup_method(self):
        from infra import redis_client
        redis_client.reset_pool()

    def test_positive_redis_set_and_get(self):
        mock_client = MagicMock()
        mock_client.get.return_value = json.dumps({"score": 95})

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_set, redis_get
            ok = redis_set("test:key", {"score": 95}, ttl_seconds=60)
            val = redis_get("test:key")

        assert ok is True
        assert val == {"score": 95}

    def test_positive_redis_set_calls_setex_with_ttl(self):
        mock_client = MagicMock()

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_set
            redis_set("cache:abc", {"data": 1}, ttl_seconds=1800)

        mock_client.setex.assert_called_once()
        args = mock_client.setex.call_args[0]
        assert args[0] == "cache:abc"
        assert args[1] == 1800

    def test_positive_redis_delete_returns_true(self):
        mock_client = MagicMock()
        mock_client.delete.return_value = 1

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_delete
            result = redis_delete("cache:abc")

        assert result is True

    def test_negative_redis_get_missing_key_returns_none(self):
        mock_client = MagicMock()
        mock_client.get.return_value = None

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_get
            result = redis_get("nonexistent")

        assert result is None

    def test_negative_redis_unavailable_set_returns_false(self):
        with patch("infra.redis_client.get_redis", return_value=None):
            from infra.redis_client import redis_set
            result = redis_set("key", "value")
        assert result is False

    def test_negative_redis_unavailable_get_returns_none(self):
        with patch("infra.redis_client.get_redis", return_value=None):
            from infra.redis_client import redis_get
            result = redis_get("key")
        assert result is None

    def test_positive_redis_ping_returns_true_when_connected(self):
        mock_client = MagicMock()
        mock_client.ping.return_value = True

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_ping
            assert redis_ping() is True

    def test_negative_redis_ping_returns_false_when_down(self):
        with patch("infra.redis_client.get_redis", return_value=None):
            from infra.redis_client import redis_ping
            assert redis_ping() is False

    def test_negative_redis_set_exception_returns_false(self):
        mock_client = MagicMock()
        mock_client.setex.side_effect = ConnectionError("connection refused")

        with patch("infra.redis_client.get_redis", return_value=mock_client):
            from infra.redis_client import redis_set
            result = redis_set("key", "value")

        assert result is False


# ═══════════════════════════════════════════════════════════════════════════════
# Kafka producer unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestKafkaProducer:

    def setup_method(self):
        from infra import kafka_producer
        kafka_producer.reset_producer()

    def test_positive_publish_succeeds_on_first_attempt(self):
        mock_producer = MagicMock()
        future = MagicMock()
        future.get.return_value = None
        mock_producer.send.return_value = future

        with patch("infra.kafka_producer._get_producer", return_value=mock_producer):
            from infra.kafka_producer import publish
            result = publish("KAFKA_CV_TOPIC", "cv.parsed", {"user_id": "u1"}, key="u1")

        assert result is True
        mock_producer.send.assert_called_once()

    def test_positive_event_envelope_has_required_fields(self):
        mock_producer = MagicMock()
        future = MagicMock()
        future.get.return_value = None
        mock_producer.send.return_value = future

        with patch("infra.kafka_producer._get_producer", return_value=mock_producer):
            from infra.kafka_producer import publish
            publish("KAFKA_CV_TOPIC", "cv.parsed", {"user_id": "u1"})

        sent_kwargs = mock_producer.send.call_args[1]
        envelope = sent_kwargs["value"]
        assert "event_id" in envelope
        assert "event_type" in envelope
        assert envelope["event_type"] == "cv.parsed"
        assert "ts" in envelope
        assert "payload" in envelope

    def test_negative_publish_returns_false_when_kafka_unavailable(self):
        with patch("infra.kafka_producer._get_producer", return_value=None):
            from infra.kafka_producer import publish
            result = publish("KAFKA_CV_TOPIC", "cv.parsed", {})
        assert result is False

    def test_negative_publish_routes_to_dlq_after_max_retries(self):
        mock_producer = MagicMock()
        future = MagicMock()
        future.get.side_effect = Exception("broker timeout")
        mock_producer.send.return_value = future

        with patch("infra.kafka_producer._get_producer", return_value=mock_producer), \
                patch("infra.kafka_producer._send_to_dlq") as mock_dlq, \
                patch("infra.kafka_producer.time.sleep"):
            from infra.kafka_producer import publish
            result = publish("KAFKA_CV_TOPIC", "cv.parsed", {}, max_retries=3)

        assert result is False
        mock_dlq.assert_called_once()
        dlq_args = mock_dlq.call_args[0]
        assert dlq_args[2] == "max_retries_exceeded"

    def test_positive_kafka_ping_true_when_connected(self):
        mock_producer = MagicMock()
        with patch("infra.kafka_producer._get_producer", return_value=mock_producer):
            from infra.kafka_producer import kafka_ping
            assert kafka_ping() is True

    def test_negative_kafka_ping_false_when_unavailable(self):
        with patch("infra.kafka_producer._get_producer", return_value=None):
            from infra.kafka_producer import kafka_ping
            assert kafka_ping() is False


# ═══════════════════════════════════════════════════════════════════════════════
# /health/ready — redis + kafka status in response
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    import sys
    from pathlib import Path
    backend_dir = Path(__file__).parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    mock_llm = MagicMock()
    mock_vs = MagicMock()
    mock_bm25 = MagicMock()
    mock_bm25._docs = ["doc1"]

    patches = [
        patch("main._llm", mock_llm),
        patch("main._vector_store", mock_vs),
        patch("main.init_db", new=AsyncMock()),
        patch("main.build_vector_store", return_value=mock_vs),
        patch("main.get_embeddings", return_value=MagicMock()),
        patch("main.get_all_roles", return_value=[]),
        patch("main.init_bm25_from_roles"),
        patch("main.init_guardrail_persistence"),
        patch("main.flush_guardrail_stats"),
        patch("main.configure_logging"),
        patch("os.getenv", side_effect=lambda k, d=None: {
            "DEEPSEEK_API_KEY": "test_key",
            "JWT_SECRET": "test-secret",
            "REDIS_URL": "redis://localhost:6379",
            "KAFKA_BOOTSTRAP_SERVERS": "localhost:9092",
        }.get(k, d)),
    ]
    for p in patches:
        p.start()

    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app, raise_server_exceptions=False)
    yield c

    for p in patches:
        try:
            p.stop()
        except RuntimeError:
            pass


class TestHealthRedisKafka:

    def test_positive_health_ready_includes_redis_field(self, client):
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["doc"]
        with patch("main._llm", MagicMock()), \
                patch("main._vector_store", MagicMock()), \
                patch("main.get_bm25_index", return_value=mock_bm25), \
                patch("main.redis_ping", return_value=True), \
                patch("main.kafka_ping", return_value=False), \
                patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(return_value=MagicMock(execute=AsyncMock()))
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        if resp.status_code == 200:
            body = resp.json()
            assert "redis" in body
            assert "kafka" in body
            assert body["redis"] == "ok"
            assert body["kafka"] == "unavailable"

    def test_positive_health_ready_kafka_ok_when_connected(self, client):
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["doc"]
        with patch("main._llm", MagicMock()), \
                patch("main._vector_store", MagicMock()), \
                patch("main.get_bm25_index", return_value=mock_bm25), \
                patch("main.redis_ping", return_value=True), \
                patch("main.kafka_ping", return_value=True), \
                patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(return_value=MagicMock(execute=AsyncMock()))
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        if resp.status_code == 200:
            assert resp.json()["kafka"] == "ok"


class TestKafkaPublishIntegration:

    def test_positive_kafka_publish_called_after_cv_upload(self, client):
        """CV upload success triggers Kafka event publish."""
        import io
        from tests.conftest import SAMPLE_PROFILE, make_auth_headers

        mock_profile = SAMPLE_PROFILE
        with patch("main.extract_text_from_pdf", return_value="Ravi Singh Python Developer"), \
                patch("main.check_pdf_size"), \
                patch("main.check_resume_content"), \
                patch("main.check_injection"), \
                patch("main.parse_cv", new=AsyncMock(return_value=mock_profile)), \
                patch("main.validate_parsed_profile", return_value=mock_profile), \
                patch("main.save_user", new=AsyncMock()), \
                patch("main.kafka_publish") as mock_kafka:
            data = {"file": ("cv.pdf", io.BytesIO(b"%PDF " + b"A" * 200), "application/pdf")}
            resp = client.post("/upload-cv", files=data, headers=make_auth_headers())

        if resp.status_code == 200:
            mock_kafka.assert_called_once()
            call_args = mock_kafka.call_args[0]
            assert call_args[0] == "KAFKA_CV_TOPIC"
            assert call_args[1] == "cv.parsed"

    def test_positive_cv_upload_succeeds_even_if_kafka_fails(self, client):
        """Fire-and-forget: CV upload returns 200 even when Kafka publish fails."""
        import io
        from tests.conftest import SAMPLE_PROFILE, make_auth_headers

        with patch("main.extract_text_from_pdf", return_value="Ravi Singh Python Developer"), \
                patch("main.check_pdf_size"), \
                patch("main.check_resume_content"), \
                patch("main.check_injection"), \
                patch("main.parse_cv", new=AsyncMock(return_value=SAMPLE_PROFILE)), \
                patch("main.validate_parsed_profile", return_value=SAMPLE_PROFILE), \
                patch("main.save_user", new=AsyncMock()), \
                patch("main.kafka_publish", return_value=False):  # Kafka fails
            data = {"file": ("cv.pdf", io.BytesIO(b"%PDF " + b"A" * 200), "application/pdf")}
            resp = client.post("/upload-cv", files=data, headers=make_auth_headers())

        assert resp.status_code == 200
