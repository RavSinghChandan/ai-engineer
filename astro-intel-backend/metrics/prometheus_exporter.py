"""
Prometheus Metrics Exporter
============================
Converts the MetricsCollector dashboard snapshot into OpenMetrics text format
for Grafana / PagerDuty scraping.

Endpoint: GET /api/v1/metrics/prometheus  (ADMIN+, same auth as /api/v1/metrics)

Format: OpenMetrics text (Prometheus exposition format 0.0.4)
  # HELP <name> <description>
  # TYPE <name> <type>
  <name>{labels} <value>

Usage example (Grafana scrape config):
  - job_name: astrointel
    metrics_path: /api/v1/metrics/prometheus
    bearer_token: <admin-jwt>
    static_configs:
      - targets: ['api.aurawithrav.com']
"""
from __future__ import annotations
from typing import Any


def _line(name: str, value: Any, help_text: str = "", metric_type: str = "gauge") -> str:
    lines = []
    if help_text:
        lines.append(f"# HELP {name} {help_text}")
    lines.append(f"# TYPE {name} {metric_type}")
    lines.append(f"{name} {value}")
    return "\n".join(lines)


def dashboard_to_prometheus(dash: dict) -> str:
    """
    Convert a MetricsCollector.dashboard() dict to Prometheus exposition text.
    Returns an empty-metrics block when total_runs == 0.
    """
    total_runs = dash.get("total_runs", 0)
    blocks: list[str] = []

    # ── Pipeline run count ────────────────────────────────────────────────────
    blocks.append(_line(
        "astrointel_pipeline_runs_total",
        total_runs,
        help_text="Total pipeline runs recorded in this process lifetime",
        metric_type="counter",
    ))

    if total_runs == 0:
        return "\n\n".join(blocks) + "\n"

    # ── Latency ───────────────────────────────────────────────────────────────
    lat = dash.get("latency", {})
    for pct, key in [("p50", "p50_ms"), ("p95", "p95_ms"), ("p99", "p99_ms")]:
        blocks.append(_line(
            f"astrointel_pipeline_latency_{pct}_ms",
            lat.get(key, 0),
            help_text=f"Pipeline latency {pct.upper()} in milliseconds",
        ))
    blocks.append(_line(
        "astrointel_pipeline_latency_avg_ms",
        lat.get("avg_ms", 0),
        help_text="Pipeline latency average in milliseconds",
    ))

    # ── Confidence distribution ───────────────────────────────────────────────
    conf = dash.get("confidence", {})
    total_insights = conf.get("total", 0)
    for level in ("high", "medium", "low"):
        blocks.append(_line(
            f"astrointel_confidence_{level}_total",
            conf.get(level, 0),
            help_text=f"Total insights with {level.upper()} confidence",
            metric_type="counter",
        ))
    blocks.append(_line(
        "astrointel_confidence_high_pct",
        conf.get("high_pct", 0),
        help_text="Percentage of HIGH-confidence insights (0–100)",
    ))

    # ── Error rate ────────────────────────────────────────────────────────────
    err = dash.get("error_rate", {})
    blocks.append(_line(
        "astrointel_error_rate_pct",
        err.get("rate_pct", 0),
        help_text="Percentage of pipeline runs that had at least one agent error (0–100)",
    ))
    blocks.append(_line(
        "astrointel_error_runs_total",
        err.get("total_error_runs", 0),
        help_text="Total pipeline runs with errors",
        metric_type="counter",
    ))

    # ── Hallucination proxy ───────────────────────────────────────────────────
    hall = dash.get("hallucination_proxy", {})
    blocks.append(_line(
        "astrointel_hallucination_proxy_pct",
        hall.get("rate_pct", 0),
        help_text="Hallucination proxy: % insights with LOW confidence (lower is better)",
    ))

    # ── Hallucination audit totals ────────────────────────────────────────────
    audit = dash.get("hallucination_audit", {})
    for metric_name, key in [
        ("astrointel_hallucination_single_source_flags_total", "total_single_source_flags"),
        ("astrointel_hallucination_hedge_phrase_flags_total",  "total_hedge_phrase_flags"),
        ("astrointel_hallucination_contradiction_flags_total", "total_contradiction_flags"),
        ("astrointel_hallucination_suppressed_total",          "total_suppressed"),
    ]:
        blocks.append(_line(
            metric_name,
            audit.get(key, 0),
            help_text=metric_name.replace("_", " ").replace("astrointel ", ""),
            metric_type="counter",
        ))

    # ── Domain coverage ───────────────────────────────────────────────────────
    cov = dash.get("domain_coverage", {})
    blocks.append(_line(
        "astrointel_domain_coverage_pct",
        cov.get("coverage_pct", 0),
        help_text="Average domain coverage percentage per run (0–100)",
    ))
    blocks.append(_line(
        "astrointel_domain_avg_per_run",
        cov.get("avg_domains_per_run", 0),
        help_text="Average number of active domains per pipeline run",
    ))

    # ── Answer relevance proxy ────────────────────────────────────────────────
    arv = dash.get("answer_relevance_proxy", {})
    blocks.append(_line(
        "astrointel_answer_relevance_proxy_pct",
        arv.get("rate_pct", 0),
        help_text="% of questions answered with HIGH-confidence multi-domain consensus",
    ))

    # ── Throughput ────────────────────────────────────────────────────────────
    tput = dash.get("throughput", {})
    blocks.append(_line(
        "astrointel_requests_last_60s",
        tput.get("requests_last_60s", 0),
        help_text="Pipeline requests completed in the last 60 seconds",
    ))

    # ── Token economics ───────────────────────────────────────────────────────
    tok = dash.get("token_economics", {})
    blocks.append(_line(
        "astrointel_avg_tokens_per_run",
        tok.get("avg_total_tokens", 0),
        help_text="Average total LLM tokens per pipeline run",
    ))
    blocks.append(_line(
        "astrointel_avg_cost_per_run_usd",
        tok.get("avg_cost_per_run_usd", 0),
        help_text="Average estimated LLM cost per pipeline run in USD",
    ))
    blocks.append(_line(
        "astrointel_total_cost_usd",
        tok.get("total_cost_usd", 0),
        help_text="Cumulative estimated LLM cost across all runs in USD",
        metric_type="counter",
    ))

    # ── RAGAS proxies ─────────────────────────────────────────────────────────
    ragas = dash.get("ragas_proxies", {}).get("scores", {})
    for key, help_text in [
        ("faithfulness_proxy",      "RAGAS faithfulness proxy: % insights not suppressed (0.0–1.0)"),
        ("context_precision_proxy", "RAGAS context precision proxy: % domains producing HIGH-confidence output (0.0–1.0)"),
        ("answer_relevancy_proxy",  "RAGAS answer relevancy proxy: % questions with HIGH consensus (0.0–1.0)"),
        ("domain_recall_proxy",     "RAGAS domain recall proxy: avg active domains / 5 (0.0–1.0)"),
    ]:
        blocks.append(_line(
            f"astrointel_ragas_{key}",
            ragas.get(key, 0),
            help_text=help_text,
        ))

    return "\n\n".join(blocks) + "\n"
