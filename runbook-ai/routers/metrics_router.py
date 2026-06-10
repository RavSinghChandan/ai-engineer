"""
RunbookAI Metrics Router — Observability endpoint.

GET /metrics  → query volume, latency, category distribution, error rate.

No auth required (safe to expose internally; add JWT guard for public deployments).
"""
from __future__ import annotations

from fastapi import APIRouter
from utils.metrics import collector

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics():
    """
    Live observability snapshot.

    Returns:
      - total_queries: all-time count in current process (resets on restart)
      - latency: P50/P95/P99/min/max/avg in milliseconds
      - categories: query count per incident category (kubernetes, database, …)
      - severities: query count per severity (P1/P2/P3)
      - confidence: HIGH/MEDIUM/LOW/NONE distribution
      - error_rate_pct: % of queries that returned an error
      - rate_limit_hits: how many requests were throttled
      - recent_queries: last 5 queries with metadata (no incident text)
    """
    return collector.snapshot()


@router.post("/reset", include_in_schema=False)
def reset_metrics():
    """Reset all counters — for testing only. Not exposed in production docs."""
    collector.reset()
    return {"status": "reset"}
