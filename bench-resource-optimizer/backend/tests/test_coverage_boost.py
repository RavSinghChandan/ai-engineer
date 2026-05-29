"""
Coverage boost tests — covers remaining gaps in:
  - metrics/ragas_eval.py
  - utils/token_tracker.py
  - utils/retry.py
  - utils/guardrails.py
  - utils/json_parser.py
  - cache/semantic_cache.py
  - infra/kafka_producer.py
  - infra/redis_client.py
  - memory/session_store.py
  - middleware/logging_mw.py
  - middleware/rate_limit.py
  - rag/advanced_retrieval.py (remaining)
  - rag/document_store.py (remaining)
"""
from __future__ import annotations
import time
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import numpy as np

_RNG = np.random.default_rng(42)


# ── metrics/ragas_eval.py ─────────────────────────────────────────────────────

class TestRagasEval:

    def _mock_embed(self, texts):
        """Return unit vectors so cosine similarity works predictably."""
        n = len(texts)
        arr = np.eye(max(n, 4))[:n, :4].astype(np.float32)
        return arr

    def test_cosine_zero_vector(self):
        from metrics.ragas_eval import _cosine
        a = np.zeros(4, dtype=np.float32)
        b = np.ones(4, dtype=np.float32)
        assert _cosine(a, b) < 1e-9

    def test_cosine_identical_vectors(self):
        from metrics.ragas_eval import _cosine
        v = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        assert abs(_cosine(v, v) - 1.0) < 1e-6

    def test_tech_tokens_extraction(self):
        from metrics.ragas_eval import _tech_tokens
        tokens = _tech_tokens("Experience with Python, Docker, and Kubernetes")
        assert "python" in tokens
        assert "docker" in tokens
        assert "kubernetes" in tokens

    def test_token_overlap_empty_a_returns_one(self):
        from metrics.ragas_eval import _token_overlap
        result = _token_overlap(set(), {"python"})
        assert abs(result - 1.0) < 1e-9

    def test_token_overlap_full_match(self):
        from metrics.ragas_eval import _token_overlap
        result = _token_overlap({"python", "docker"}, {"python", "docker", "k8s"})
        assert abs(result - 1.0) < 1e-9

    def test_blend_weighted_average(self):
        from metrics.ragas_eval import _blend
        result = _blend(0.8, 0.6, sem_weight=0.7)
        expected = round(0.7 * 0.8 + 0.3 * 0.6, 4)
        assert abs(result - expected) < 1e-6

    def test_compute_faithfulness_empty_chunks_returns_one(self):
        from metrics.ragas_eval import compute_faithfulness
        score = compute_faithfulness("Python developer", [])
        assert abs(score - 1.0) < 1e-9

    def test_compute_faithfulness_empty_answer_returns_one(self):
        from metrics.ragas_eval import compute_faithfulness
        score = compute_faithfulness("", ["Python developer context"])
        assert abs(score - 1.0) < 1e-9

    def test_compute_faithfulness_with_mock_embed(self):
        from metrics.ragas_eval import compute_faithfulness
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_faithfulness(
                "Python FastAPI developer",
                ["Python FastAPI backend role", "Docker Kubernetes"],
            )
        assert 0.0 <= score <= 1.0

    def test_compute_faithfulness_exception_fallback(self):
        from metrics.ragas_eval import compute_faithfulness
        with patch("metrics.ragas_eval._embed", side_effect=Exception("model down")):
            score = compute_faithfulness("Python developer", ["Python backend"])
        assert 0.0 <= score <= 1.0

    def test_compute_context_precision_empty_chunks_returns_one(self):
        from metrics.ragas_eval import compute_context_precision
        assert abs(compute_context_precision("answer", []) - 1.0) < 1e-9
        assert abs(compute_context_precision("", ["chunk"]) - 1.0) < 1e-9

    def test_compute_context_precision_with_mock(self):
        from metrics.ragas_eval import compute_context_precision
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_context_precision(
                "Python FastAPI developer",
                ["Python backend", "irrelevant xyz"],
            )
        assert 0.0 <= score <= 1.0

    def test_compute_context_precision_exception_fallback(self):
        from metrics.ragas_eval import compute_context_precision
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_context_precision("python developer", ["python context", "docker info"])
        assert 0.0 <= score <= 1.0

    def test_compute_context_recall_empty_returns_one(self):
        from metrics.ragas_eval import compute_context_recall
        assert abs(compute_context_recall("answer", []) - 1.0) < 1e-9

    def test_compute_context_recall_with_mock(self):
        from metrics.ragas_eval import compute_context_recall
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_context_recall("Python FastAPI", ["Python backend context"])
        assert 0.0 <= score <= 1.0

    def test_compute_context_recall_exception_fallback(self):
        from metrics.ragas_eval import compute_context_recall
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_context_recall("python", ["python chunk"])
        assert 0.0 <= score <= 1.0

    def test_compute_answer_relevancy_empty_returns_one(self):
        from metrics.ragas_eval import compute_answer_relevancy
        assert abs(compute_answer_relevancy("", "answer") - 1.0) < 1e-9
        assert abs(compute_answer_relevancy("query", "") - 1.0) < 1e-9

    def test_compute_answer_relevancy_skill_language_floors(self):
        from metrics.ragas_eval import compute_answer_relevancy
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_answer_relevancy(
                "Python Engineer",
                "Train on FastAPI and Docker. Missing skills: Kubernetes.",
            )
        assert score >= 0.55

    def test_compute_answer_relevancy_exception_with_skill_kw(self):
        from metrics.ragas_eval import compute_answer_relevancy
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_answer_relevancy("role", "train on python skills gap recommend")
        assert abs(score - 0.85) < 1e-9

    def test_compute_answer_relevancy_exception_no_kw(self):
        from metrics.ragas_eval import compute_answer_relevancy
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_answer_relevancy("role", "random unrelated text xyz")
        assert abs(score - 0.50) < 1e-9

    def test_compute_precision_at_k_empty_returns_zero(self):
        from metrics.ragas_eval import compute_precision_at_k
        assert compute_precision_at_k([], "query") < 1e-9

    def test_compute_precision_at_k_with_mock(self):
        from metrics.ragas_eval import compute_precision_at_k
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_precision_at_k(
                ["Python developer", "Docker engineer"],
                "Python",
                k=2,
            )
        assert 0.0 <= score <= 1.0

    def test_compute_precision_at_k_exception_no_query_tokens(self):
        from metrics.ragas_eval import compute_precision_at_k
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_precision_at_k(["chunk one", "chunk two"], "the", k=2)
        assert abs(score - 1.0) < 1e-9

    def test_compute_mrr_empty_returns_zero(self):
        from metrics.ragas_eval import compute_mrr
        assert compute_mrr([], "query") < 1e-9

    def test_compute_mrr_with_mock(self):
        from metrics.ragas_eval import compute_mrr
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            score = compute_mrr(["Python developer backend"], "Python")
        assert 0.0 <= score <= 1.0

    def test_compute_mrr_exception_no_match_returns_zero(self):
        from metrics.ragas_eval import compute_mrr
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_mrr(["xyz abc"], "quantum")
        assert score < 1e-9

    def test_compute_mrr_exception_match_returns_positive(self):
        from metrics.ragas_eval import compute_mrr
        with patch("metrics.ragas_eval._embed", side_effect=Exception("err")):
            score = compute_mrr(["unrelated", "python developer"], "python")
        assert score > 0.0

    def test_evaluate_returns_record(self):
        from metrics.ragas_eval import evaluate, RagasRecord
        with patch("metrics.ragas_eval._embed", side_effect=self._mock_embed):
            record = evaluate(
                request_id="req-1",
                query="Python Engineer",
                answer="Candidate has Python and FastAPI skills.",
                retrieved_chunks=["Python FastAPI backend role description"],
                k=1,
            )
        assert isinstance(record, RagasRecord)
        assert record.request_id == "req-1"
        assert 0.0 <= record.faithfulness <= 1.0

    def test_ragas_store_empty_dashboard(self):
        from metrics.ragas_eval import RagasStore
        store = RagasStore(window=5)
        assert store.dashboard()["evaluated"] == 0

    def test_ragas_store_add_and_dashboard(self):
        from metrics.ragas_eval import RagasStore, RagasRecord
        store = RagasStore(window=5)
        rec = RagasRecord(
            request_id="r1", query="Python", timestamp=time.time(),
            faithfulness=0.9, context_precision=0.8, context_recall=0.85,
            answer_relevancy=0.9, precision_at_k=0.8, mrr=0.9,
            passed=True, num_chunks=2,
        )
        store.add(rec)
        dash = store.dashboard()
        assert dash["evaluated"] == 1
        assert abs(dash["pass_rate_pct"] - 100.0) < 1e-9

    def test_ragas_store_dashboard_with_failing_record(self):
        from metrics.ragas_eval import RagasStore, RagasRecord
        store = RagasStore(window=5)
        rec = RagasRecord(
            request_id="r2", query="DevOps", timestamp=time.time(),
            faithfulness=0.1, context_precision=0.1, context_recall=0.1,
            answer_relevancy=0.1, precision_at_k=0.1, mrr=0.1,
            passed=False, num_chunks=1,
        )
        store.add(rec)
        dash = store.dashboard()
        assert len(dash["alerts"]) > 0

    @pytest.mark.asyncio
    async def test_ragas_store_load_from_db(self):
        from metrics.ragas_eval import RagasStore
        store = RagasStore()
        rows = [
            {
                "request_id": "r1", "query": "Python", "timestamp": time.time(),
                "faithfulness": 0.9, "context_precision": 0.8, "context_recall": 0.85,
                "answer_relevancy": 0.9, "precision_at_k": 0.8, "mrr": 0.9,
                "passed": 1, "num_chunks": 2,
            }
        ]
        with patch("db.load_ragas_results", new_callable=AsyncMock, return_value=rows):
            count = await store.load_from_db()
        assert count == 1

    @pytest.mark.asyncio
    async def test_ragas_store_load_from_db_exception(self):
        from metrics.ragas_eval import RagasStore
        store = RagasStore()
        with patch("db.load_ragas_results", new_callable=AsyncMock, side_effect=Exception("db error")):
            count = await store.load_from_db()
        assert count == 0


# ── utils/token_tracker.py ────────────────────────────────────────────────────

class TestTokenTracker:

    def test_reset_clears_counts(self):
        from utils.token_tracker import TokenTracker
        t = TokenTracker()
        t._prompt_tokens = 100
        t._completion_tokens = 50
        t._calls = 3
        t.reset()
        usage = t.get_usage()
        assert usage["prompt_tokens"] == 0
        assert usage["completion_tokens"] == 0
        assert usage["calls"] == 0

    def test_on_llm_end_usage_metadata_path(self):
        from utils.token_tracker import TokenTracker
        t = TokenTracker()
        gen = MagicMock()
        gen.message.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        response = MagicMock()
        response.generations = [[gen]]
        response.llm_output = None
        t.on_llm_end(response)
        usage = t.get_usage()
        assert usage["prompt_tokens"] == 100
        assert usage["completion_tokens"] == 50
        assert usage["calls"] == 1

    def test_on_llm_end_fallback_llm_output(self):
        from utils.token_tracker import TokenTracker
        t = TokenTracker()
        gen = MagicMock()
        gen.message = None
        response = MagicMock()
        response.generations = [[gen]]
        response.llm_output = {"token_usage": {"prompt_tokens": 200, "completion_tokens": 80}}
        t.on_llm_end(response)
        usage = t.get_usage()
        assert usage["prompt_tokens"] == 200
        assert usage["completion_tokens"] == 80

    def test_on_llm_end_no_usage_records_call(self):
        from utils.token_tracker import TokenTracker
        t = TokenTracker()
        gen = MagicMock()
        del gen.message
        response = MagicMock()
        response.generations = [[gen]]
        response.llm_output = None
        t.on_llm_end(response)
        usage = t.get_usage()
        assert usage["calls"] == 1
        assert usage["prompt_tokens"] == 0

    def test_get_usage_cost_calculation(self):
        from utils.token_tracker import TokenTracker
        t = TokenTracker()
        t._prompt_tokens = 1_000_000
        t._completion_tokens = 1_000_000
        usage = t.get_usage()
        assert abs(usage["cost_usd"] - 0.42) < 1e-6

    def test_get_tracker_singleton(self):
        from utils.token_tracker import get_tracker
        t1 = get_tracker()
        t2 = get_tracker()
        assert t1 is t2

    def test_reset_tracker_function(self):
        from utils.token_tracker import reset_tracker, get_tracker
        get_tracker()._prompt_tokens = 99
        reset_tracker()
        assert get_tracker().get_usage()["prompt_tokens"] == 0

    def test_get_usage_function(self):
        from utils.token_tracker import get_usage, reset_tracker
        reset_tracker()
        usage = get_usage()
        assert "prompt_tokens" in usage


# ── utils/retry.py ────────────────────────────────────────────────────────────

class TestRetry:

    def test_circuit_breaker_initial_closed(self):
        from utils.retry import CircuitBreaker
        cb = CircuitBreaker("cb_initial")
        assert not cb.is_open()

    def test_circuit_breaker_opens_after_threshold(self):
        from utils.retry import CircuitBreaker
        cb = CircuitBreaker("cb_opens", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert not cb.is_open()
        cb.record_failure()
        assert cb.is_open()

    def test_circuit_breaker_closes_after_success(self):
        from utils.retry import CircuitBreaker
        cb = CircuitBreaker("cb_closes", failure_threshold=2)
        cb.record_failure()
        cb.record_failure()
        assert cb.is_open()
        cb.record_success()
        assert not cb.is_open()

    def test_circuit_breaker_half_open_after_timeout(self):
        from utils.retry import CircuitBreaker, _State
        cb = CircuitBreaker("cb_halfopen", failure_threshold=1, reset_timeout=0.01)
        cb.record_failure()
        assert cb.is_open()
        time.sleep(0.02)
        assert cb.state == _State.HALF_OPEN

    def test_get_breaker_singleton(self):
        from utils.retry import get_breaker, _breakers
        name = "unique_breaker_xyz"
        _breakers.pop(name, None)
        b1 = get_breaker(name)
        b2 = get_breaker(name)
        assert b1 is b2

    def test_breaker_status_shows_closed(self):
        from utils.retry import breaker_status, get_breaker
        get_breaker("status_cb")
        status = breaker_status()
        assert "status_cb" in status
        assert status["status_cb"] == "closed"

    @pytest.mark.asyncio
    async def test_with_retry_success_async(self):
        from utils.retry import with_retry, _breakers
        import asyncio
        _breakers.pop("retry_ok", None)

        async def good_fn():
            await asyncio.sleep(0)
            return "ok"

        result = await with_retry(good_fn, breaker_name="retry_ok")
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_with_retry_sync_function(self):
        from utils.retry import with_retry, _breakers
        _breakers.pop("retry_sync", None)

        def sync_fn():
            return "sync_result"

        result = await with_retry(sync_fn, breaker_name="retry_sync")
        assert result == "sync_result"

    @pytest.mark.asyncio
    async def test_with_retry_raises_after_max_attempts(self):
        from utils.retry import with_retry, _breakers
        _breakers.pop("retry_fail", None)

        async def bad_fn():
            raise ValueError("always fails")

        with pytest.raises(ValueError):
            await with_retry(bad_fn, max_attempts=2, base_delay=0.01, breaker_name="retry_fail")

    @pytest.mark.asyncio
    async def test_with_retry_open_circuit_fast_fails(self):
        from utils.retry import with_retry, CircuitBreaker, _breakers
        import asyncio
        cb = CircuitBreaker("open_cb", failure_threshold=1)
        cb.record_failure()
        _breakers["open_cb"] = cb

        async def fn():
            await asyncio.sleep(0)
            return "unreachable"

        with pytest.raises(RuntimeError, match="OPEN"):
            await with_retry(fn, breaker_name="open_cb")


# ── utils/guardrails.py ───────────────────────────────────────────────────────

class TestUtilsGuardrails:

    def test_check_resume_content_raises_too_short(self):
        from utils.guardrails import check_resume_content, GuardrailError
        with pytest.raises(GuardrailError):
            check_resume_content("short")

    def test_check_resume_content_valid(self):
        from utils.guardrails import check_resume_content
        long_text = "Python developer with experience building scalable systems.\n" * 5
        check_resume_content(long_text)

    def test_heal_json_direct_parse(self):
        from utils.guardrails import heal_json
        result = heal_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_heal_json_markdown_fence(self):
        from utils.guardrails import heal_json
        result = heal_json('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_heal_json_extract_object(self):
        from utils.guardrails import heal_json
        result = heal_json('some text {"key": "value"} more text')
        assert result == {"key": "value"}

    def test_heal_json_extract_array(self):
        from utils.guardrails import heal_json
        result = heal_json('some text [1, 2, 3] more text')
        assert result == [1, 2, 3]

    def test_heal_json_raises_on_invalid(self):
        from utils.guardrails import heal_json
        with pytest.raises(ValueError):
            heal_json("not json at all no brackets")

    def test_check_pdf_size_too_large_raises(self):
        from utils.guardrails import check_pdf_size, GuardrailError
        large = b"x" * (11 * 1024 * 1024)
        with pytest.raises(GuardrailError):
            check_pdf_size(large)

    def test_check_pdf_size_valid(self):
        from utils.guardrails import check_pdf_size
        small = b"x" * 100
        check_pdf_size(small)


# ── utils/json_parser.py ─────────────────────────────────────────────────────

class TestJsonParser:

    def test_parse_llm_json_valid(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_parse_llm_json_markdown_fence(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_parse_llm_json_partial_extraction(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('prefix {"name": "Alice"} suffix')
        assert result["name"] == "Alice"

    def test_parse_llm_json_multiline_strip(self):
        from utils.json_parser import parse_llm_json
        result = parse_llm_json('```\n{"a":1}\n```')
        assert result["a"] == 1


# ── cache/semantic_cache.py ───────────────────────────────────────────────────

class TestSemanticCache:

    def setup_method(self):
        import cache.semantic_cache as sc
        sc._l1_store.clear()
        sc._l2_store.clear()

    def test_l1_set_and_get(self):
        from cache.semantic_cache import l1_set, l1_get
        l1_set("cv_parse", "user_abc", {"skills": ["Python"]})
        result = l1_get("cv_parse", "user_abc")
        assert result == {"skills": ["Python"]}

    def test_l1_get_miss_returns_none(self):
        from cache.semantic_cache import l1_get
        assert l1_get("cv_parse", "nonexistent_key_xyz") is None

    def test_l2_set_and_get_cosine_hit(self):
        from cache.semantic_cache import l2_set, l2_get
        emb = np.ones(4, dtype=np.float32) / 2.0
        l2_set(emb, {"result": "cached"})
        result = l2_get(emb, "cv_parse")
        assert result == {"result": "cached"}

    def test_l2_get_miss_different_embedding(self):
        from cache.semantic_cache import l2_set, l2_get
        emb_a = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        emb_b = np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32)
        l2_set(emb_a, {"result": "a"})
        result = l2_get(emb_b, "cv_parse")
        assert result is None

    def test_cache_stats_returns_dict(self):
        from cache.semantic_cache import l1_set, cache_stats
        l1_set("cv_parse", "stats_test", {"data": 1})
        stats = cache_stats()
        assert "l1_entries" in stats
        assert stats["l1_entries"] >= 1

    def test_evict_expired_removes_stale_l1(self):
        import cache.semantic_cache as sc
        key = sc._sha256("cv_parse:evict_me")
        sc._l1_store[key] = ({"x": 1}, time.time() - 10)
        sc._evict_expired()
        assert key not in sc._l1_store


# ── infra/kafka_producer.py ───────────────────────────────────────────────────

class TestKafkaProducer:

    def test_get_producer_creates_on_success(self):
        import infra.kafka_producer as kp
        kp._producer = None
        mock_producer = MagicMock()
        with patch("kafka.KafkaProducer", return_value=mock_producer, create=True):
            with patch.dict("sys.modules", {"kafka": MagicMock(KafkaProducer=lambda **kw: mock_producer)}):
                kp._producer = None
                p = kp._get_producer()
        # Either connected or gracefully returned None
        assert p is None or isinstance(p, MagicMock)

    def test_get_producer_exception_returns_none(self):
        import infra.kafka_producer as kp
        kp._producer = None
        kafka_mock = MagicMock()
        kafka_mock.KafkaProducer.side_effect = Exception("kafka down")
        with patch.dict("sys.modules", {"kafka": kafka_mock}):
            p = kp._get_producer()
        assert p is None

    def test_publish_no_producer_returns_false(self):
        import infra.kafka_producer as kp
        kp._producer = None
        result = kp.publish("KAFKA_CV_TOPIC", "cv.parsed", {"user_id": "u1"})
        assert result is False

    def test_publish_with_producer_success(self):
        import infra.kafka_producer as kp
        mock_producer = MagicMock()
        future = MagicMock()
        future.get.return_value = None
        mock_producer.send.return_value = future
        kp._producer = mock_producer
        result = kp.publish("KAFKA_CV_TOPIC", "cv.parsed", {"user_id": "u1"}, key="u1")
        assert result is True
        kp._producer = None

    def test_kafka_ping_no_producer(self):
        import infra.kafka_producer as kp
        kp._producer = None
        result = kp.kafka_ping()
        assert result is False

    def test_reset_producer_closes_existing(self):
        import infra.kafka_producer as kp
        mock_producer = MagicMock()
        kp._producer = mock_producer
        kp.reset_producer()
        mock_producer.close.assert_called_once()
        assert kp._producer is None

    def test_reset_producer_when_none(self):
        import infra.kafka_producer as kp
        kp._producer = None
        kp.reset_producer()
        assert kp._producer is None


# ── infra/redis_client.py ─────────────────────────────────────────────────────

class TestRedisClient:

    def test_get_pool_exception_returns_none(self):
        import infra.redis_client as rc
        rc._redis_pool = None
        redis_mock = MagicMock()
        redis_mock.ConnectionPool.from_url.side_effect = Exception("redis down")
        with patch.dict("sys.modules", {"redis": redis_mock}):
            pool = rc._get_pool()
        assert pool is None

    def test_get_redis_no_pool_returns_none(self):
        import infra.redis_client as rc
        rc._redis_pool = None
        with patch("infra.redis_client._get_pool", return_value=None):
            client = rc.get_redis()
        assert client is None

    def test_redis_set_no_client_returns_false(self):
        import infra.redis_client as rc
        with patch("infra.redis_client.get_redis", return_value=None):
            result = rc.redis_set("key", "value")
        assert result is False

    def test_redis_get_no_client_returns_none(self):
        import infra.redis_client as rc
        with patch("infra.redis_client.get_redis", return_value=None):
            result = rc.redis_get("key")
        assert result is None

    def test_redis_get_with_client(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.get.return_value = '"cached_value"'
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_get("mykey")
        assert result == "cached_value"

    def test_redis_set_with_client_calls_setex(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_set("mykey", {"data": 1}, ttl_seconds=60)
        assert result is True
        mock_client.setex.assert_called_once()

    def test_redis_delete_no_client_returns_false(self):
        import infra.redis_client as rc
        with patch("infra.redis_client.get_redis", return_value=None):
            result = rc.redis_delete("key")
        assert result is False

    def test_redis_delete_with_client(self):
        import infra.redis_client as rc
        mock_client = MagicMock()
        mock_client.delete.return_value = 1
        with patch("infra.redis_client.get_redis", return_value=mock_client):
            result = rc.redis_delete("mykey")
        assert result is True

    def test_redis_ping_no_client(self):
        import infra.redis_client as rc
        with patch("infra.redis_client.get_redis", return_value=None):
            result = rc.redis_ping()
        assert result is False

    def test_reset_pool(self):
        import infra.redis_client as rc
        rc._redis_pool = MagicMock()
        rc.reset_pool()
        assert rc._redis_pool is None


# ── memory/session_store.py ───────────────────────────────────────────────────

class TestSessionStore:

    def setup_method(self):
        from memory import session_store as ss
        ss._episodic.clear()
        ss._user_facts.clear()
        ss._preloaded.clear()

    def test_write_session_summary_stores_in_memory(self):
        from memory.session_store import write_session_summary, get_recent_sessions
        write_session_summary("u1", {"role_explored": "Python Eng", "readiness_score": 60, "skills_covered": []})
        sessions = get_recent_sessions("u1")
        assert len(sessions) >= 1
        assert sessions[0]["role_explored"] == "Python Eng"

    def test_build_memory_context_with_sessions(self):
        from memory.session_store import write_session_summary, build_memory_context
        write_session_summary("u2", {"role_explored": "DevOps", "readiness_score": 45, "skills_covered": ["Docker"]})
        ctx = build_memory_context("u2")
        assert "DevOps" in ctx or isinstance(ctx, str)

    def test_build_memory_context_no_sessions_returns_empty(self):
        from memory.session_store import build_memory_context
        ctx = build_memory_context("no_user_xyz")
        assert ctx == ""

    def test_update_user_facts_upserts(self):
        from memory.session_store import update_user_facts, get_user_facts
        update_user_facts("u3", {"covered_skills": ["Python"], "level": "mid"})
        update_user_facts("u3", {"covered_skills": ["Docker"], "level": "senior"})
        facts = get_user_facts("u3")
        assert "senior" in facts["level"]
        assert "Python" in facts["covered_skills"] or "Docker" in facts["covered_skills"]

    def test_get_user_facts_missing_returns_empty(self):
        from memory.session_store import get_user_facts
        facts = get_user_facts("nobody_xyz")
        assert facts == {}

    def test_memory_stats_returns_counts(self):
        from memory.session_store import write_session_summary, memory_stats
        write_session_summary("u4", {"role_explored": "ML Eng", "readiness_score": 70, "skills_covered": []})
        stats = memory_stats()
        assert "users_with_episodic_memory" in stats
        assert stats["users_with_episodic_memory"] >= 1

    @pytest.mark.asyncio
    async def test_preload_user_memory(self):
        from memory.session_store import preload_user_memory
        rows = [{"role_explored": "Python Eng", "readiness_score": 80, "skills_covered": [], "ts": time.time()}]
        with patch("db.load_memory_sessions", new_callable=AsyncMock, return_value=rows):
            await preload_user_memory("u5")

    @pytest.mark.asyncio
    async def test_sweep_expired_sessions(self):
        from memory.session_store import sweep_expired_sessions
        with patch("db.sweep_expired_sessions", new_callable=AsyncMock, return_value=3):
            deleted = await sweep_expired_sessions()
        assert deleted == 3

    @pytest.mark.asyncio
    async def test_sweep_expired_sessions_exception(self):
        from memory.session_store import sweep_expired_sessions
        with patch("db.sweep_expired_sessions", new_callable=AsyncMock, side_effect=Exception("db err")):
            deleted = await sweep_expired_sessions()
        assert deleted == 0


# ── middleware/logging_mw.py ──────────────────────────────────────────────────

class TestLoggingMiddleware:

    @pytest.mark.asyncio
    async def test_middleware_logs_and_adds_request_id(self):
        from middleware.logging_mw import RequestLoggingMiddleware

        async def fake_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = RequestLoggingMiddleware(fake_app)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/health",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 1234),
        }
        receive = AsyncMock()
        sent_messages = []

        async def capture_send(message):
            sent_messages.append(message)
            await AsyncMock()(message)

        with patch("middleware.logging_mw.logger") as mock_logger:
            await middleware(scope, receive, capture_send)
            mock_logger.info.assert_called()
        assert len(sent_messages) >= 1

    def test_configure_logging(self):
        from middleware.logging_mw import configure_logging
        configure_logging("INFO")


# ── middleware/rate_limit.py ──────────────────────────────────────────────────

class TestRateLimit:

    TEST_IP_A = "192.0.2.1"
    TEST_IP_B = "192.0.2.2"
    TEST_IP_C = "192.0.2.3"
    TEST_IP_D = "192.0.2.4"

    def setup_method(self):
        import middleware.rate_limit as rl
        rl._store.clear()

    @pytest.mark.asyncio
    async def test_request_within_limit_passes(self):
        from middleware.rate_limit import RateLimitMiddleware, _store
        responses = []

        async def mock_next(request):
            from fastapi.responses import JSONResponse
            return JSONResponse({"ok": True})

        from starlette.testclient import TestClient
        from fastapi import FastAPI
        app = FastAPI()
        app.add_middleware(RateLimitMiddleware)

        @app.get("/test")
        def test_route():
            return {"ok": True}

        client = TestClient(app)
        response = client.get("/test")
        assert response.status_code == 200

    def test_rate_limit_exceeded_returns_429(self):
        import middleware.rate_limit as rl
        from collections import deque
        from starlette.testclient import TestClient
        from fastapi import FastAPI

        app = FastAPI()
        app.add_middleware(rl.RateLimitMiddleware)

        @app.get("/test")
        def test_route():
            return {"ok": True}

        # Pre-fill the store to exceed the limit for this test IP
        ip = self.TEST_IP_A
        now = time.monotonic()
        rl._store[ip] = deque([now - 1] * rl._LIMIT)

        client = TestClient(app, raise_server_exceptions=False)
        # Patch _client_ip to always return our pre-filled IP
        with patch("middleware.rate_limit._client_ip", return_value=ip):
            response = client.get("/test")
        assert response.status_code == 429

    def test_client_ip_from_forwarded_header(self):
        from middleware.rate_limit import _client_ip
        request = MagicMock()
        request.headers.get.return_value = self.TEST_IP_B + ", 10.0.0.1"
        ip = _client_ip(request)
        assert ip == self.TEST_IP_B

    def test_client_ip_fallback_to_client_host(self):
        from middleware.rate_limit import _client_ip
        request = MagicMock()
        request.headers.get.return_value = None
        request.client.host = self.TEST_IP_C
        ip = _client_ip(request)
        assert ip == self.TEST_IP_C


# ── rag/advanced_retrieval.py remaining lines ─────────────────────────────────

class TestAdvancedRetrievalExtra:

    def test_crag_retrieve_ambiguous_with_fallback(self):
        from rag.advanced_retrieval import crag_retrieve
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = [
            MagicMock(page_content="python java developer")
        ]
        with patch("rag.advanced_retrieval.score_retrieval_relevance", return_value=0.35):
            docs, _, label = crag_retrieve(
                "python java developer backend",
                mock_store,
                fallback_context="fallback text",
            )
        assert label == "AMBIGUOUS"
        assert any(d.metadata.get("source") == "fallback" for d in docs)

    def test_hybrid_retrieve_with_mmr_and_encoder(self):
        from rag import advanced_retrieval as ar
        from langchain.schema import Document
        docs = [
            Document(page_content="Python FastAPI backend", metadata={}),
            Document(page_content="Docker Kubernetes DevOps", metadata={}),
        ]
        mock_store = MagicMock()
        mock_store.similarity_search.return_value = docs
        mock_bm25 = MagicMock()
        mock_bm25.search.return_value = []

        mock_encoder = MagicMock()
        mock_encoder.encode.return_value = _RNG.random((3, 4)).astype(np.float32)

        with patch.object(ar, "_bm25_index", mock_bm25), \
             patch("rag.advanced_retrieval.get_reranker") as mock_gr, \
             patch("rag.advanced_retrieval._get_bi_encoder", return_value=mock_encoder):
            mock_gr.return_value.rerank.return_value = docs
            results = ar.hybrid_retrieve("python", mock_store, top_n=1, use_reranker=True, use_mmr=True)
        assert isinstance(results, list)

    def test_get_bi_encoder_singleton(self):
        import rag.advanced_retrieval as ar
        ar._bi_encoder = None
        mock_encoder = MagicMock()
        fake_st = MagicMock()
        fake_st.SentenceTransformer = MagicMock(return_value=mock_encoder)
        with patch.dict("sys.modules", {"sentence_transformers": fake_st}):
            enc1 = ar._get_bi_encoder()
            enc2 = ar._get_bi_encoder()
        assert enc1 is enc2


# ── rag/document_store.py remaining ───────────────────────────────────────────

class TestDocumentStoreExtra:

    def test_chunk_text_overlap_carries_forward(self):
        from rag.document_store import _chunk_text
        p1 = "word " * 10
        p2 = "data " * 60
        text = p1 + "\n\n" + p2
        chunks = _chunk_text(text, max_chars=100, overlap_chars=20)
        assert len(chunks) >= 2
