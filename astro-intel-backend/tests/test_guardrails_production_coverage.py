"""
Coverage boost for:
  - guardrails/production.py  (87% → 95%+)  — circuit breaker OPEN/HALF_OPEN, repair LLM path, agent snapshot
"""
from __future__ import annotations
import time
from unittest.mock import MagicMock, patch


def _raise(exc):
    raise exc


class TestCircuitBreakerAdvanced:
    def _make_breaker(self, failure_threshold=2, recovery_timeout=0.1):
        from guardrails.production import CircuitBreaker
        return CircuitBreaker(
            name="test_cb",
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
            half_open_max_calls=1,
        )

    def test_call_open_state_raises_circuit_open_error(self):
        from guardrails.production import CircuitBreaker, CircuitOpenError
        cb = self._make_breaker(failure_threshold=1)
        try:
            cb.call(_raise, RuntimeError("fail"))
        except RuntimeError:
            pass
        try:
            cb.call(lambda: None)
            raised = False
        except CircuitOpenError:
            raised = True
        assert raised

    def test_call_half_open_max_calls_reached_raises(self):
        from guardrails.production import CircuitBreaker, CircuitOpenError
        cb = self._make_breaker(failure_threshold=1, recovery_timeout=0.01)
        cb._state = CircuitBreaker.HALF_OPEN
        cb._half_open_calls = cb.half_open_max_calls
        try:
            cb.call(lambda: None)
            raised = False
        except CircuitOpenError:
            raised = True
        assert raised

    def test_on_failure_in_half_open_reopens(self):
        from guardrails.production import CircuitBreaker
        cb = self._make_breaker(failure_threshold=1, recovery_timeout=0.01)
        try:
            cb.call(_raise, RuntimeError("fail"))
        except RuntimeError:
            pass
        time.sleep(0.05)
        assert cb.state == "half_open"
        cb._on_failure()
        assert cb._state == "open"

    def test_on_success_in_half_open_closes(self):
        from guardrails.production import CircuitBreaker
        cb = self._make_breaker(failure_threshold=1, recovery_timeout=0.01)
        try:
            cb.call(_raise, RuntimeError("fail"))
        except RuntimeError:
            pass
        time.sleep(0.05)
        assert cb.state == "half_open"
        cb._on_success()
        assert cb._state == "closed"

    def test_circuit_open_error_propagated(self):
        from guardrails.production import CircuitBreaker, CircuitOpenError
        cb = self._make_breaker(failure_threshold=1)
        try:
            cb.call(_raise, RuntimeError("fail"))
        except RuntimeError:
            pass
        raised_type = None
        try:
            cb.call(lambda: None)
        except CircuitOpenError:
            raised_type = "CircuitOpenError"
        except Exception:
            raised_type = "other"
        assert raised_type == "CircuitOpenError"

    def test_stats_returns_dict(self):
        from guardrails.production import CircuitBreaker
        cb = self._make_breaker()
        stats = cb.stats()
        assert isinstance(stats, dict)
        assert "name" in stats
        assert stats["name"] == "test_cb"


class TestRepairJsonLlmPath:
    def test_repair_json_with_llm_caller_success(self):
        from guardrails.production import repair_json

        def good_llm(prompt: str) -> str:
            return '{"result": "fixed"}'

        result, _ = repair_json('{"result": "fixed"}', llm_caller=good_llm)
        assert isinstance(result, dict)

    def test_repair_json_with_llm_caller_repairs_malformed(self):
        from guardrails.production import repair_json

        def llm_fixer(prompt: str) -> str:
            return '{"result": "repaired"}'

        result, _ = repair_json(
            "{result: bad json}",
            llm_caller=llm_fixer,
        )
        assert isinstance(result, dict)
        assert result.get("result") == "repaired"

    def test_repair_json_with_schema_hint(self):
        from guardrails.production import repair_json

        def llm_fixer(prompt: str) -> str:
            return '{"key": "value"}'

        result, _ = repair_json(
            "{key: value}",
            llm_caller=llm_fixer,
            schema_hint='{"key": "string"}',
        )
        assert isinstance(result, dict)

    def test_repair_json_llm_also_fails_returns_none(self):
        from guardrails.production import repair_json

        def bad_llm(prompt: str) -> str:
            raise RuntimeError("LLM down")

        result, _ = repair_json(
            "{{{{completely invalid",
            llm_caller=bad_llm,
        )
        assert result is None


class TestGracefulDegradationTracker:
    def test_record_run_full_domain(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        domain_results = {
            "astrology": {"question_wise_analysis": [{"insights": []}]},
        }
        snapshot = tracker.record_run("sess-001", domain_results)
        assert isinstance(snapshot, dict)
        assert "overall" in snapshot
        assert "domains" in snapshot

    def test_record_run_degraded_with_fallback_domain(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        domain_results = {
            "astrology": {"question_wise_analysis": [{"insights": []}]},
            "numerology": {"_degraded": True, "_reason": "timeout"},
        }
        snapshot = tracker.record_run("sess-002", domain_results)
        assert snapshot["overall"] in ("full", "degraded", "failed", "skipped")

    def test_record_run_skipped_domain_is_none(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        domain_results = {"astrology": None}
        snapshot = tracker.record_run("sess-003", domain_results)
        assert snapshot["domains"]["astrology"]["status"] == "skipped"

    def test_record_run_partial_flat_dict(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        domain_results = {"numerology": {"life_path": 5, "some_key": "val"}}
        snapshot = tracker.record_run("sess-004", domain_results)
        assert snapshot["domains"]["numerology"]["status"] in ("partial", "full", "fallback")

    def test_record_run_empty_list_domain(self):
        from guardrails.production import GracefulDegradationTracker
        tracker = GracefulDegradationTracker()
        domain_results = {"tarot": []}
        snapshot = tracker.record_run("sess-005", domain_results)
        assert snapshot["domains"]["tarot"]["status"] in ("partial", "fallback")


class TestRateLimiterEdgeCases:
    def test_rate_limiter_is_allowed_true_for_new_key(self):
        from guardrails.production import RateLimiter
        rl = RateLimiter(max_requests=10, window_seconds=60)
        allowed, reason = rl.is_allowed("new-key-xyz")
        assert allowed is True
        assert isinstance(reason, str)

    def test_rate_limiter_blocks_after_max_requests(self):
        from guardrails.production import RateLimiter
        rl = RateLimiter(max_requests=2, window_seconds=60)
        rl.is_allowed("k1")
        rl.is_allowed("k1")
        allowed, reason = rl.is_allowed("k1")
        assert allowed is False
        assert len(reason) > 0

    def test_pii_filter_from_admin_review(self):
        from guardrails.production import filter_pii_from_admin_review
        admin_review = {
            "questions": [
                {
                    "insights": [
                        {"content": "DOB: 1990-05-15. Career looks bright."},
                    ]
                }
            ]
        }
        result, count = filter_pii_from_admin_review(admin_review, {"date_of_birth": "1990-05-15"})
        assert isinstance(result, dict)
        assert isinstance(count, int)
