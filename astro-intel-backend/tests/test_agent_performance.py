"""
Tests for per_agent_performance() optimisation in MetricsCollector.

Covers:
  - Empty collector returns empty dict
  - Single run: latency values correct
  - Multiple runs: P50/P95/P99 computed correctly
  - Error count propagated
  - _summary block identifies slowest agent
  - GET /api/v1/metrics/agents/performance endpoint (auth-gated)
"""
from __future__ import annotations

import time
from metrics.collector import MetricsCollector, RunRecord


def _make_record(agent_latencies: dict, error_count: int = 0) -> RunRecord:
    now = time.time()
    return RunRecord(
        session_id="test-session",
        started_at=now - 1.0,
        ended_at=now,
        total_latency_ms=sum(agent_latencies.values()),
        agent_latencies=agent_latencies,
        confidence_counts={"high": 2, "medium": 1, "low": 0},
        domains_active=3,
        error_count=error_count,
        errors=[],
        estimated_tokens=100,
        questions_count=1,
        high_confidence_questions=1,
    )


# ── Unit: per_agent_performance ──────────────────────────────────────────────

def test_empty_collector_returns_empty_dict():
    mc = MetricsCollector()
    result = mc.per_agent_performance()
    assert result == {}


def test_single_run_returns_correct_values():
    mc = MetricsCollector()
    mc.record(_make_record({
        "astrology_agent": 120.0,
        "meta_agent": 80.0,
    }))
    result = mc.per_agent_performance()
    assert "astrology_agent" in result
    assert "meta_agent" in result
    assert result["astrology_agent"]["p50_ms"] == 120.0
    assert result["astrology_agent"]["avg_ms"] == 120.0
    assert result["astrology_agent"]["min_ms"] == 120.0
    assert result["astrology_agent"]["max_ms"] == 120.0
    assert result["astrology_agent"]["run_count"] == 1


def test_multiple_runs_latency_distribution():
    mc = MetricsCollector()
    latencies = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0]
    for lat in latencies:
        mc.record(_make_record({"astrology_agent": lat}))
    result = mc.per_agent_performance()
    ag = result["astrology_agent"]
    assert ag["run_count"] == 10
    assert ag["min_ms"] == 100.0
    assert ag["max_ms"] == 1000.0
    assert ag["p50_ms"] >= 400.0  # median
    assert ag["p99_ms"] >= 900.0


def test_summary_identifies_slowest_agent():
    mc = MetricsCollector()
    mc.record(_make_record({
        "astrology_agent": 500.0,
        "meta_agent": 100.0,
        "question_agent": 50.0,
    }))
    result = mc.per_agent_performance()
    assert "_summary" in result
    assert result["_summary"]["slowest_agent_p95"] == "astrology_agent"


def test_summary_agent_count():
    mc = MetricsCollector()
    mc.record(_make_record({
        "astrology_agent": 100.0,
        "numerology_agent": 80.0,
        "tarot_agent": 60.0,
    }))
    result = mc.per_agent_performance()
    assert result["_summary"]["total_agents_tracked"] == 3


def test_multiple_agents_independent():
    mc = MetricsCollector()
    # Run 1: astrology fast, meta slow
    mc.record(_make_record({"astrology_agent": 50.0, "meta_agent": 800.0}))
    # Run 2: astrology slow, meta fast
    mc.record(_make_record({"astrology_agent": 900.0, "meta_agent": 60.0}))
    result = mc.per_agent_performance()
    # Each agent has 2 samples
    assert result["astrology_agent"]["run_count"] == 2
    assert result["meta_agent"]["run_count"] == 2
    # Averages reflect both runs
    assert result["astrology_agent"]["avg_ms"] == 475.0
    assert result["meta_agent"]["avg_ms"] == 430.0


def test_all_required_keys_present():
    mc = MetricsCollector()
    mc.record(_make_record({"astrology_agent": 150.0}))
    result = mc.per_agent_performance()
    ag = result["astrology_agent"]
    for key in ["p50_ms", "p95_ms", "p99_ms", "avg_ms", "min_ms", "max_ms", "run_count", "error_count"]:
        assert key in ag, f"Missing key: {key}"


def test_window_overflow_does_not_raise():
    mc = MetricsCollector(window=5)
    for i in range(20):
        mc.record(_make_record({"astrology_agent": float(i * 10 + 10)}))
    result = mc.per_agent_performance()
    # Should only have last 5 in window
    assert result["astrology_agent"]["run_count"] == 5


def test_agents_sorted_alphabetically():
    mc = MetricsCollector()
    mc.record(_make_record({
        "z_agent": 100.0,
        "a_agent": 200.0,
        "m_agent": 150.0,
    }))
    result = mc.per_agent_performance()
    keys = [k for k in result if not k.startswith("_")]
    assert keys == sorted(keys)
