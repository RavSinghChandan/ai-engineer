"""
Test Suite: Metrics Collector (metrics/collector.py)
Covers: RunRecord creation, dashboard() output structure, latency percentiles,
        error tracking, RAGAS proxies, domain coverage, cost tracking.
"""
import time
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from metrics.collector import MetricsCollector, RunRecord, get_collector


def _make_record(**overrides) -> RunRecord:
    defaults = dict(
        session_id="test-session",
        started_at=time.time() - 1.0,
        ended_at=time.time(),
        total_latency_ms=1000.0,
        agent_latencies={"question_agent": 200.0, "domain_agents": 400.0},
        confidence_counts={"high": 3, "medium": 2, "low": 1},
        domains_active=4,
        error_count=0,
        errors=[],
        estimated_tokens=500,
        questions_count=2,
        high_confidence_questions=1,
        prompt_tokens=300,
        completion_tokens=200,
        total_tokens=500,
        llm_calls=3,
        cost_usd=0.00014,
        hallucination_risk="low",
        hallucination_rate_pct=5.0,
        single_source_flags=1,
        hedge_phrase_flags=0,
        contradiction_flags=0,
        suppressed_count=0,
        fallback_injected=0,
        coverage_gap=False,
    )
    defaults.update(overrides)
    return RunRecord(**defaults)


@pytest.fixture
def collector():
    return MetricsCollector(window=100)


class TestRunRecord:
    def test_creates_valid_record(self):
        r = _make_record()
        assert r.session_id == "test-session"
        assert r.total_latency_ms == 1000.0
        assert r.domains_active == 4

    def test_default_error_count_zero(self):
        r = _make_record()
        assert r.error_count == 0
        assert r.errors == []

    def test_cost_usd_positive(self):
        r = _make_record()
        assert r.cost_usd > 0


class TestMetricsCollector:
    def test_empty_dashboard(self, collector):
        dash = collector.dashboard()
        assert dash["total_runs"] == 0

    def test_record_adds_to_runs(self, collector):
        collector.record(_make_record())
        assert collector.dashboard()["total_runs"] == 1

    def test_multiple_records(self, collector):
        for _ in range(5):
            collector.record(_make_record())
        assert collector.dashboard()["total_runs"] == 5

    def test_max_runs_cap(self):
        small_collector = MetricsCollector(window=3)
        for i in range(5):
            small_collector.record(_make_record(session_id=f"s{i}"))
        assert small_collector.dashboard()["total_runs"] == 3

    def test_latency_p50_computed(self, collector):
        for ms in [100, 200, 300, 400, 500]:
            collector.record(_make_record(total_latency_ms=ms))
        dash = collector.dashboard()
        assert "latency" in dash
        assert dash["latency"]["p50_ms"] > 0

    def test_latency_p95_gte_p50(self, collector):
        for ms in [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]:
            collector.record(_make_record(total_latency_ms=ms))
        dash = collector.dashboard()
        assert dash["latency"]["p95_ms"] >= dash["latency"]["p50_ms"]

    def test_latency_p99_gte_p95(self, collector):
        for ms in range(100, 1100, 10):
            collector.record(_make_record(total_latency_ms=float(ms)))
        dash = collector.dashboard()
        assert dash["latency"]["p99_ms"] >= dash["latency"]["p95_ms"]

    def test_error_rate_zero_with_no_errors(self, collector):
        collector.record(_make_record(error_count=0))
        assert collector.dashboard()["error_rate"]["rate_pct"] == 0.0

    def test_error_rate_100_with_all_errors(self, collector):
        collector.record(_make_record(error_count=1, errors=["boom"]))
        dash = collector.dashboard()
        assert dash["error_rate"]["rate_pct"] == 100.0

    def test_error_rate_partial(self, collector):
        collector.record(_make_record(error_count=0))
        collector.record(_make_record(error_count=1, errors=["oops"]))
        dash = collector.dashboard()
        assert dash["error_rate"]["rate_pct"] == 50.0

    def test_confidence_distribution_tracked(self, collector):
        collector.record(_make_record(confidence_counts={"high": 4, "medium": 3, "low": 1}))
        dash = collector.dashboard()
        assert "confidence" in dash
        assert dash["confidence"]["high"] == 4
        assert dash["confidence"]["medium"] == 3

    def test_domain_coverage_tracked(self, collector):
        collector.record(_make_record(domains_active=5))
        dash = collector.dashboard()
        assert "domain_coverage" in dash
        assert dash["domain_coverage"]["avg_domains_per_run"] == 5.0

    def test_total_cost_tracked(self, collector):
        collector.record(_make_record(cost_usd=0.001, total_tokens=500))
        collector.record(_make_record(cost_usd=0.002, total_tokens=500))
        dash = collector.dashboard()
        total = dash["token_economics"]["total_cost_usd"]
        assert abs(total - 0.003) < 1e-9

    def test_hallucination_audit_present(self, collector):
        collector.record(_make_record(hallucination_risk="low"))
        dash = collector.dashboard()
        assert "hallucination_audit" in dash
        assert "avg_rate_pct" in dash["hallucination_audit"]

    def test_ragas_proxies_present(self, collector):
        collector.record(_make_record())
        dash = collector.dashboard()
        assert "ragas_proxies" in dash
        proxies = dash["ragas_proxies"]
        assert "scores" in proxies
        for key in ("faithfulness_proxy", "context_precision_proxy",
                    "answer_relevancy_proxy", "domain_recall_proxy"):
            assert key in proxies["scores"]

    def test_recent_runs_in_dashboard(self, collector):
        collector.record(_make_record(session_id="s1-abcdef"))
        collector.record(_make_record(session_id="s2-abcdef"))
        dash = collector.dashboard()
        assert "recent_runs" in dash
        assert len(dash["recent_runs"]) >= 1

    def test_throughput_tracked(self, collector):
        collector.record(_make_record())
        dash = collector.dashboard()
        assert "throughput" in dash
        assert dash["throughput"]["total_sessions"] == 1

    def test_get_collector_returns_singleton(self):
        c1 = get_collector()
        c2 = get_collector()
        assert c1 is c2


class TestMetricsApiEndpoint:
    """Test the /api/v1/metrics HTTP endpoint."""

    def test_metrics_endpoint_returns_200(self):
        from fastapi.testclient import TestClient
        from main import app
        tc = TestClient(app)
        resp = tc.get("/api/v1/metrics")
        assert resp.status_code == 200

    def test_metrics_endpoint_has_total_runs(self):
        from fastapi.testclient import TestClient
        from main import app
        tc = TestClient(app)
        resp = tc.get("/api/v1/metrics")
        data = resp.json()
        assert "total_runs" in data
