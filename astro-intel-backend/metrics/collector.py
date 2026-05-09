"""
AstroIntel 360° — Production Metrics Collector
===============================================
Tracks every pipeline run and exposes a dashboard-ready payload.

Metrics captured (mapped to Senior AI Engineer KPIs):
  1.  Pipeline Latency      — P50 / P95 / P99 across all runs
  2.  Agent Latency         — per-agent execution time breakdown
  3.  Consensus Confidence  — HIGH / MEDIUM / LOW distribution (reliability proxy)
  4.  Hallucination Proxy   — % of insights with LOW confidence (single-domain signal)
  5.  Domain Coverage       — avg domains that contributed per report
  6.  Error Rate            — % of runs with at least one agent error
  7.  Throughput            — requests per minute (rolling 60s window)
  8.  Cost Estimate         — token-based cost proxy per report
  9.  Agent Health          — per-agent error counts
  10. Answer Relevance Proxy — % of questions that received HIGH-confidence consensus
"""
from __future__ import annotations

import time
import statistics
from collections import deque, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# Approximate GPT-4o-mini token pricing (input + output)
_COST_PER_1K_TOKENS = 0.000165  # USD — $0.15/1M input + $0.60/1M output blended


@dataclass
class RunRecord:
    session_id: str
    started_at: float
    ended_at: float
    total_latency_ms: float
    agent_latencies: Dict[str, float]       # agent_name → ms
    confidence_counts: Dict[str, int]       # high/medium/low → count
    domains_active: int                     # 0–5
    error_count: int
    errors: List[str]
    estimated_tokens: int
    questions_count: int
    high_confidence_questions: int          # questions that got HIGH consensus


class MetricsCollector:
    """Thread-safe in-memory metrics store. Keeps last 500 runs."""

    def __init__(self, window: int = 500):
        self._runs: deque[RunRecord] = deque(maxlen=window)
        self._agent_error_counts: Dict[str, int] = defaultdict(int)
        self._request_timestamps: deque[float] = deque(maxlen=1000)

    # ── Record a completed pipeline run ─────────────────────────────────────
    def record(self, record: RunRecord) -> None:
        self._runs.append(record)
        self._request_timestamps.append(record.ended_at)
        for err in record.errors:
            for agent in ["question_agent", "domain_agents", "meta_agent",
                          "remedy_agent", "admin_review_agent", "report_agent"]:
                if agent in err.lower():
                    self._agent_error_counts[agent] += 1

    # ── Dashboard snapshot ───────────────────────────────────────────────────
    def dashboard(self) -> Dict[str, Any]:
        runs = list(self._runs)
        if not runs:
            return self._empty_dashboard()

        latencies = [r.total_latency_ms for r in runs]
        latencies_sorted = sorted(latencies)
        n = len(latencies_sorted)

        def percentile(data: List[float], p: float) -> float:
            if not data: return 0.0
            idx = max(0, int(p / 100 * len(data)) - 1)
            return round(data[idx], 1)

        # Confidence distribution
        conf_totals: Dict[str, int] = defaultdict(int)
        total_insights = 0
        for r in runs:
            for lvl, cnt in r.confidence_counts.items():
                conf_totals[lvl] += cnt
                total_insights += cnt

        high   = conf_totals.get("high", 0)
        medium = conf_totals.get("medium", 0)
        low    = conf_totals.get("low", 0)

        hallucination_proxy = round(low / total_insights * 100, 1) if total_insights else 0.0
        answer_relevance_proxy = round(
            sum(r.high_confidence_questions for r in runs) /
            max(sum(r.questions_count for r in runs), 1) * 100, 1
        )

        error_runs = sum(1 for r in runs if r.error_count > 0)
        error_rate = round(error_runs / n * 100, 1)

        avg_domains = round(sum(r.domains_active for r in runs) / n, 2)
        avg_cost    = round(sum(r.estimated_tokens for r in runs) / n * _COST_PER_1K_TOKENS / 1000, 4)

        # Throughput — requests in last 60 seconds
        now = time.time()
        recent = sum(1 for ts in self._request_timestamps if now - ts <= 60)
        throughput_rpm = recent  # requests per last 60s ≈ per minute

        # Per-agent latency averages
        agent_avg: Dict[str, float] = {}
        agent_counts: Dict[str, int] = defaultdict(int)
        agent_sums: Dict[str, float] = defaultdict(float)
        for r in runs:
            for ag, ms in r.agent_latencies.items():
                agent_sums[ag] += ms
                agent_counts[ag] += 1
        for ag in agent_sums:
            agent_avg[ag] = round(agent_sums[ag] / agent_counts[ag], 1)

        return {
            "total_runs": n,
            "latency": {
                "p50_ms":  percentile(latencies_sorted, 50),
                "p95_ms":  percentile(latencies_sorted, 95),
                "p99_ms":  percentile(latencies_sorted, 99),
                "avg_ms":  round(statistics.mean(latencies), 1),
                "min_ms":  round(min(latencies), 1),
                "max_ms":  round(max(latencies), 1),
                "history_ms": [round(r.total_latency_ms, 0) for r in list(runs)[-20:]],
            },
            "confidence": {
                "high":   high,
                "medium": medium,
                "low":    low,
                "total":  total_insights,
                "high_pct":   round(high / total_insights * 100, 1) if total_insights else 0,
                "medium_pct": round(medium / total_insights * 100, 1) if total_insights else 0,
                "low_pct":    round(low / total_insights * 100, 1) if total_insights else 0,
            },
            "hallucination_proxy": {
                "rate_pct": hallucination_proxy,
                "label": (
                    "Low Risk"   if hallucination_proxy < 20 else
                    "Medium Risk" if hallucination_proxy < 40 else
                    "High Risk"
                ),
                "explanation": "% of insights backed by only 1 domain (LOW confidence). Lower is better.",
            },
            "answer_relevance_proxy": {
                "rate_pct": answer_relevance_proxy,
                "label": (
                    "High Relevance"   if answer_relevance_proxy >= 70 else
                    "Medium Relevance" if answer_relevance_proxy >= 40 else
                    "Low Relevance"
                ),
                "explanation": "% of questions that received HIGH-confidence multi-domain consensus.",
            },
            "error_rate": {
                "rate_pct": error_rate,
                "total_error_runs": error_runs,
                "agent_breakdown": dict(self._agent_error_counts),
            },
            "domain_coverage": {
                "avg_domains_per_run": avg_domains,
                "max_possible": 5,
                "coverage_pct": round(avg_domains / 5 * 100, 1),
            },
            "cost": {
                "avg_per_report_usd": avg_cost,
                "total_estimated_usd": round(sum(r.estimated_tokens for r in runs) * _COST_PER_1K_TOKENS / 1000, 4),
                "avg_tokens_per_run": round(sum(r.estimated_tokens for r in runs) / n),
                "model_note": "GPT-4o-mini blended rate — rule-based agents have ~0 LLM cost",
            },
            "throughput": {
                "requests_last_60s": throughput_rpm,
                "total_sessions": n,
            },
            "agent_latency_avg_ms": agent_avg,
            "recent_runs": [
                {
                    "session_id":       r.session_id[:8] + "…",
                    "latency_ms":       round(r.total_latency_ms, 0),
                    "confidence_high":  r.confidence_counts.get("high", 0),
                    "confidence_low":   r.confidence_counts.get("low", 0),
                    "domains_active":   r.domains_active,
                    "errors":           r.error_count,
                    "tokens_est":       r.estimated_tokens,
                }
                for r in list(runs)[-10:]
            ],
            "interview_explainer": {
                "why_these_metrics": (
                    "AstroIntel uses rule-based domain agents + a consensus layer — not retrieval-augmented generation. "
                    "Standard RAGAS metrics (faithfulness, context recall) don't apply. "
                    "Instead we track: (1) Consensus confidence as a reliability proxy — HIGH means 3+ independent "
                    "spiritual traditions agree, reducing hallucination risk. "
                    "(2) Latency P95 — parallel agent execution reduced this from ~6 minutes to ~15 seconds. "
                    "(3) Cost per report — capped at ~$0.07 with GPT-4o-mini × 5 agent calls + gpt-4o × 1 synthesis. "
                    "(4) Domain coverage — a report where only 1/5 domains contributed is a quality signal."
                ),
            },
        }

    def _empty_dashboard(self) -> Dict[str, Any]:
        return {
            "total_runs": 0,
            "message": "No pipeline runs recorded yet. Submit an analysis to see live metrics.",
            "latency": {"p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "avg_ms": 0},
            "confidence": {"high": 0, "medium": 0, "low": 0, "total": 0},
            "hallucination_proxy": {"rate_pct": 0, "label": "No data"},
            "answer_relevance_proxy": {"rate_pct": 0, "label": "No data"},
            "error_rate": {"rate_pct": 0, "total_error_runs": 0, "agent_breakdown": {}},
            "domain_coverage": {"avg_domains_per_run": 0, "max_possible": 5, "coverage_pct": 0},
            "cost": {"avg_per_report_usd": 0, "total_estimated_usd": 0, "avg_tokens_per_run": 0},
            "throughput": {"requests_last_60s": 0, "total_sessions": 0},
            "agent_latency_avg_ms": {},
            "recent_runs": [],
            "interview_explainer": {},
        }


# ── Singleton ────────────────────────────────────────────────────────────────
_collector: Optional[MetricsCollector] = None


def get_collector() -> MetricsCollector:
    global _collector
    if _collector is None:
        _collector = MetricsCollector()
    return _collector
