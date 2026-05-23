"""
Phase 3 — Prometheus Exporter Tests
=====================================
Positive, Negative, Integration, and Smoke tests for
metrics/prometheus_exporter.py and the /api/v1/metrics/prometheus endpoint.

Run:
  cd astro-intel-backend
  pytest tests/test_prometheus_exporter.py -v
"""
from __future__ import annotations
import pytest
from metrics.prometheus_exporter import dashboard_to_prometheus


# ── fixture: minimal filled dashboard ────────────────────────────────────────

def _filled_dash() -> dict:
    return {
        "total_runs": 5,
        "latency": {"p50_ms": 9800, "p95_ms": 14000, "p99_ms": 17000, "avg_ms": 10500},
        "confidence": {"high": 30, "medium": 10, "low": 5, "total": 45,
                       "high_pct": 66.7, "medium_pct": 22.2, "low_pct": 11.1},
        "error_rate": {"rate_pct": 20.0, "total_error_runs": 1, "agent_breakdown": {}},
        "hallucination_proxy": {"rate_pct": 11.1, "label": "Low Risk"},
        "hallucination_audit": {
            "total_single_source_flags": 3,
            "total_hedge_phrase_flags": 1,
            "total_contradiction_flags": 0,
            "total_suppressed": 2,
        },
        "domain_coverage": {"avg_domains_per_run": 4.2, "coverage_pct": 84.0},
        "answer_relevance_proxy": {"rate_pct": 75.0},
        "throughput": {"requests_last_60s": 2},
        "token_economics": {
            "avg_total_tokens": 3200, "avg_cost_per_run_usd": 0.000448,
            "total_cost_usd": 0.00224,
        },
        "ragas_proxies": {
            "scores": {
                "faithfulness_proxy": 0.9556,
                "context_precision_proxy": 0.6667,
                "answer_relevancy_proxy": 0.75,
                "domain_recall_proxy": 0.84,
            }
        },
    }


def _empty_dash() -> dict:
    return {
        "total_runs": 0,
        "message": "No pipeline runs recorded yet.",
        "latency": {"p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "avg_ms": 0},
        "confidence": {"high": 0, "medium": 0, "low": 0, "total": 0},
        "error_rate": {"rate_pct": 0, "total_error_runs": 0, "agent_breakdown": {}},
        "hallucination_proxy": {"rate_pct": 0, "label": "No data"},
        "hallucination_audit": {
            "total_single_source_flags": 0, "total_hedge_phrase_flags": 0,
            "total_contradiction_flags": 0, "total_suppressed": 0,
        },
        "domain_coverage": {"avg_domains_per_run": 0, "coverage_pct": 0},
        "answer_relevance_proxy": {"rate_pct": 0},
        "throughput": {"requests_last_60s": 0},
        "token_economics": {"avg_total_tokens": 0, "avg_cost_per_run_usd": 0, "total_cost_usd": 0},
        "ragas_proxies": {"scores": {}},
    }


# ── POSITIVE TESTS ────────────────────────────────────────────────────────────

class TestPrometheusExporterPositive:

    def test_output_is_string(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert isinstance(result, str)

    def test_ends_with_newline(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert result.endswith("\n")

    def test_contains_run_counter(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_pipeline_runs_total 5" in result

    def test_contains_latency_p95(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_pipeline_latency_p95_ms 14000" in result

    def test_contains_error_rate(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_error_rate_pct 20.0" in result

    def test_contains_hallucination_proxy(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_hallucination_proxy_pct 11.1" in result

    def test_contains_ragas_faithfulness(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_ragas_faithfulness_proxy 0.9556" in result

    def test_contains_all_ragas_metrics(self):
        result = dashboard_to_prometheus(_filled_dash())
        for key in ("faithfulness_proxy", "context_precision_proxy",
                    "answer_relevancy_proxy", "domain_recall_proxy"):
            assert f"astrointel_ragas_{key}" in result

    def test_help_lines_present(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "# HELP astrointel_pipeline_runs_total" in result
        assert "# TYPE astrointel_pipeline_runs_total counter" in result

    def test_all_confidence_levels_present(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_confidence_high_total 30" in result
        assert "astrointel_confidence_medium_total 10" in result
        assert "astrointel_confidence_low_total 5" in result

    def test_domain_coverage_present(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_domain_coverage_pct 84.0" in result

    def test_cost_metrics_present(self):
        result = dashboard_to_prometheus(_filled_dash())
        assert "astrointel_avg_cost_per_run_usd" in result
        assert "astrointel_total_cost_usd" in result


# ── NEGATIVE TESTS ────────────────────────────────────────────────────────────

class TestPrometheusExporterNegative:

    def test_empty_dashboard_returns_only_run_counter(self):
        """With total_runs=0, only the counter line should be present (no latency etc.)."""
        result = dashboard_to_prometheus(_empty_dash())
        assert "astrointel_pipeline_runs_total 0" in result
        # Latency metric should NOT appear (no data)
        assert "astrointel_pipeline_latency_p95_ms" not in result

    def test_missing_ragas_scores_key_does_not_raise(self):
        """Dashboard without ragas_proxies key must not raise."""
        dash = _filled_dash()
        del dash["ragas_proxies"]
        result = dashboard_to_prometheus(dash)
        assert isinstance(result, str)

    def test_missing_hallucination_audit_does_not_raise(self):
        dash = _filled_dash()
        del dash["hallucination_audit"]
        result = dashboard_to_prometheus(dash)
        assert isinstance(result, str)

    def test_partial_latency_dict_does_not_raise(self):
        dash = _filled_dash()
        dash["latency"] = {"p50_ms": 5000}  # missing p95, p99, avg
        result = dashboard_to_prometheus(dash)
        assert "astrointel_pipeline_latency_p50_ms 5000" in result
        assert "astrointel_pipeline_latency_p95_ms 0" in result

    def test_zero_total_runs_dash_is_valid_text(self):
        result = dashboard_to_prometheus(_empty_dash())
        # Must be non-empty valid text ending in newline
        assert len(result) > 0
        assert result.endswith("\n")


# ── INTEGRATION TESTS ─────────────────────────────────────────────────────────

class TestPrometheusExporterIntegration:

    def test_endpoint_returns_200_for_admin(self):
        """GET /api/v1/metrics/prometheus returns 200 for admin token."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=True)
        # Get an admin token
        token_resp = client.post("/auth/login", json={"username": "admin", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed — check test credentials")
        token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        resp = client.get("/api/v1/metrics/prometheus", headers=headers)
        assert resp.status_code == 200

    def test_endpoint_content_type_is_plain_text(self):
        """Content-Type must be text/plain for Prometheus scrapers."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=True)
        token_resp = client.post("/auth/login", json={"username": "admin", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        resp = client.get("/api/v1/metrics/prometheus", headers=headers)
        assert "text/plain" in resp.headers.get("content-type", "")

    def test_endpoint_contains_run_counter_metric(self):
        """Response body must contain the run counter metric name."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=True)
        token_resp = client.post("/auth/login", json={"username": "admin", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        resp = client.get("/api/v1/metrics/prometheus", headers=headers)
        assert "astrointel_pipeline_runs_total" in resp.text

    def test_endpoint_returns_401_without_token(self):
        """Unauthenticated request must be rejected."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/v1/metrics/prometheus")
        assert resp.status_code in (401, 403)

    def test_json_and_prometheus_endpoints_report_same_run_count(self):
        """Both /metrics and /metrics/prometheus must agree on total_runs."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app, raise_server_exceptions=True)
        token_resp = client.post("/auth/login", json={"username": "admin", "password": "AuraAdmin2024!"})
        if token_resp.status_code != 200:
            pytest.skip("Admin login failed")
        token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        json_resp = client.get("/api/v1/metrics", headers=headers)
        prom_resp = client.get("/api/v1/metrics/prometheus", headers=headers)

        assert json_resp.status_code == 200
        assert prom_resp.status_code == 200

        json_runs = json_resp.json().get("total_runs", -1)
        # Parse the counter line from prometheus text
        for line in prom_resp.text.splitlines():
            if line.startswith("astrointel_pipeline_runs_total "):
                prom_runs = int(float(line.split()[-1]))
                assert json_runs == prom_runs
                return
        pytest.fail("astrointel_pipeline_runs_total not found in prometheus output")


# ── SMOKE TESTS ───────────────────────────────────────────────────────────────

class TestPrometheusExporterSmoke:

    def test_exporter_module_imports(self):
        from metrics.prometheus_exporter import dashboard_to_prometheus
        assert callable(dashboard_to_prometheus)

    def test_router_has_prometheus_route(self):
        from routers.metrics import router
        paths = [r.path for r in router.routes]
        assert any("prometheus" in p for p in paths)

    def test_no_json_in_output(self):
        """Prometheus text must not contain JSON-style braces or brackets."""
        result = dashboard_to_prometheus(_filled_dash())
        # No JSON objects or arrays — pure key-value lines
        assert "{" not in result
        assert "[" not in result

    def test_each_metric_has_help_and_type(self):
        """Every metric name must have both a # HELP and # TYPE line."""
        result = dashboard_to_prometheus(_filled_dash())
        lines = result.splitlines()
        metric_names = set()
        help_names = set()
        type_names = set()
        for line in lines:
            if line.startswith("# HELP "):
                help_names.add(line.split()[2])
            elif line.startswith("# TYPE "):
                type_names.add(line.split()[2])
            elif line and not line.startswith("#"):
                metric_names.add(line.split()[0])
        # Every metric with a HELP line must also have a TYPE line
        assert help_names == type_names
