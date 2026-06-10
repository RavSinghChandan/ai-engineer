"""
Tests for RunbookAI metrics collector and /metrics endpoint.
"""
from __future__ import annotations

import os
import tempfile
import time

import pytest

# ── Isolate DB for tests ──────────────────────────────────────────────────────
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
init_db()

from fastapi.testclient import TestClient
from main import app
from utils.metrics import MetricsCollector

client = TestClient(app)


# ── Unit: MetricsCollector ────────────────────────────────────────────────────

def test_snapshot_empty():
    mc = MetricsCollector()
    snap = mc.snapshot()
    assert snap["total_queries"] == 0
    assert snap["rate_limit_hits"] == 0
    assert snap["latency"] == {}
    assert snap["error_rate_pct"] == 0.0


def test_record_single_query():
    mc = MetricsCollector()
    mc.record_query("pods crashing", "kubernetes", "P1", "HIGH", 120.5, 3)
    snap = mc.snapshot()
    assert snap["total_queries"] == 1
    assert snap["categories"]["kubernetes"] == 1
    assert snap["severities"]["P1"] == 1
    assert snap["confidence"]["HIGH"] == 1
    assert snap["latency"]["p50_ms"] == 120.5


def test_error_rate():
    mc = MetricsCollector()
    mc.record_query("q1", "kubernetes", "P1", "HIGH", 100.0, 1, error=False)
    mc.record_query("q2", "database", "P2", "LOW",  200.0, 0, error=True)
    snap = mc.snapshot()
    assert snap["error_rate_pct"] == 50.0


def test_latency_percentiles():
    mc = MetricsCollector()
    latencies = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0]
    for lat in latencies:
        mc.record_query("q", "kubernetes", "P1", "HIGH", lat, 1)
    snap = mc.snapshot()
    # P50 should be around 500-600ms
    assert snap["latency"]["p50_ms"] >= 400.0
    assert snap["latency"]["p99_ms"] >= 900.0
    assert snap["latency"]["min_ms"] == 100.0
    assert snap["latency"]["max_ms"] == 1000.0


def test_rate_limit_hits():
    mc = MetricsCollector()
    mc.record_rate_limit_hit()
    mc.record_rate_limit_hit()
    snap = mc.snapshot()
    assert snap["rate_limit_hits"] == 2


def test_recent_queries_capped_at_5():
    mc = MetricsCollector()
    for i in range(10):
        mc.record_query(f"incident {i}", "network", "P2", "MEDIUM", float(i * 10), 1)
    snap = mc.snapshot()
    assert len(snap["recent_queries"]) == 5


def test_reset_clears_data():
    mc = MetricsCollector()
    mc.record_query("q", "kubernetes", "P1", "HIGH", 100.0, 1)
    mc.record_rate_limit_hit()
    mc.reset()
    snap = mc.snapshot()
    assert snap["total_queries"] == 0
    assert snap["rate_limit_hits"] == 0


def test_multiple_categories():
    mc = MetricsCollector()
    mc.record_query("q1", "kubernetes", "P1", "HIGH", 100.0, 1)
    mc.record_query("q2", "kubernetes", "P2", "LOW", 200.0, 0)
    mc.record_query("q3", "database", "P1", "HIGH", 150.0, 2)
    snap = mc.snapshot()
    assert snap["categories"]["kubernetes"] == 2
    assert snap["categories"]["database"] == 1


def test_window_overflow():
    """Records beyond window size should not raise errors."""
    mc = MetricsCollector(window=5)
    for i in range(20):
        mc.record_query(f"q{i}", "kubernetes", "P1", "HIGH", 100.0, 1)
    snap = mc.snapshot()
    # Window is 5, should only keep last 5
    assert snap["total_queries"] == 5


# ── API: GET /metrics ─────────────────────────────────────────────────────────

def test_metrics_endpoint_returns_200():
    resp = client.get("/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_queries" in data
    assert "latency" in data
    assert "categories" in data
    assert "severities" in data
    assert "confidence" in data
    assert "error_rate_pct" in data
    assert "rate_limit_hits" in data
    assert "recent_queries" in data


def test_metrics_endpoint_empty_state():
    # Reset global collector
    from utils.metrics import collector
    collector.reset()
    resp = client.get("/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queries"] == 0
    assert data["latency"] == {}


def test_metrics_reset_endpoint():
    from utils.metrics import collector
    collector.record_query("q", "kubernetes", "P1", "HIGH", 50.0, 1)
    resp = client.post("/metrics/reset")
    assert resp.status_code == 200
    assert resp.json()["status"] == "reset"
    snap = collector.snapshot()
    assert snap["total_queries"] == 0
