"""
RunbookAI Metrics Collector — Observability optimisation.

Tracks:
  - Query counts (total, by category, by severity)
  - Latency distribution (P50, P95, P99)
  - Match confidence distribution
  - Rate-limit hit count
  - Top incident categories over the last N queries

Thread-safe in-memory store (no external dependencies).
For multi-instance deployments, swap _store with Redis.

Usage:
    from utils.metrics import collector
    collector.record_query(...)

    GET /metrics  → collector.snapshot()
"""
from __future__ import annotations

import statistics
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class QueryRecord:
    incident: str
    category: str        # kubernetes, database, network, …
    severity: str        # P1, P2, P3, unknown
    confidence: str      # HIGH, MEDIUM, LOW, NONE
    latency_ms: float
    runbooks_matched: int
    ts: float = field(default_factory=time.time)
    error: bool = False


class MetricsCollector:
    """Thread-safe in-memory metrics store. Keeps last 500 query records."""

    def __init__(self, window: int = 500) -> None:
        self._records: deque[QueryRecord] = deque(maxlen=window)
        self._rate_limit_hits: int = 0
        self._lock = threading.Lock()

    # ── Record ───────────────────────────────────────────────────────────────

    def record_query(
        self,
        incident: str,
        category: str,
        severity: str,
        confidence: str,
        latency_ms: float,
        runbooks_matched: int,
        error: bool = False,
    ) -> None:
        with self._lock:
            self._records.append(QueryRecord(
                incident=incident[:120],  # trim for storage
                category=category or "unknown",
                severity=severity or "unknown",
                confidence=confidence or "NONE",
                latency_ms=latency_ms,
                runbooks_matched=runbooks_matched,
                error=error,
            ))

    def record_rate_limit_hit(self) -> None:
        with self._lock:
            self._rate_limit_hits += 1

    # ── Snapshot ─────────────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            records = list(self._records)

        if not records:
            return {
                "total_queries": 0,
                "rate_limit_hits": self._rate_limit_hits,
                "latency": {},
                "categories": {},
                "severities": {},
                "confidence": {},
                "error_rate_pct": 0.0,
                "recent_queries": [],
            }

        latencies = [r.latency_ms for r in records]
        latencies_sorted = sorted(latencies)
        n = len(latencies_sorted)

        def percentile(p: float) -> float:
            idx = max(0, int(n * p / 100) - 1)
            return round(latencies_sorted[idx], 1)

        categories: Dict[str, int] = defaultdict(int)
        severities: Dict[str, int] = defaultdict(int)
        confidences: Dict[str, int] = defaultdict(int)

        for r in records:
            categories[r.category] += 1
            severities[r.severity] += 1
            confidences[r.confidence] += 1

        errors = sum(1 for r in records if r.error)
        error_rate = round(errors / n * 100, 2) if n else 0.0

        # Last 5 queries for quick debug
        recent = [
            {
                "category": r.category,
                "severity": r.severity,
                "confidence": r.confidence,
                "latency_ms": round(r.latency_ms, 1),
                "runbooks_matched": r.runbooks_matched,
                "error": r.error,
                "ts": r.ts,
            }
            for r in list(self._records)[-5:]
        ]
        recent.reverse()

        return {
            "total_queries": n,
            "rate_limit_hits": self._rate_limit_hits,
            "latency": {
                "p50_ms": percentile(50),
                "p95_ms": percentile(95),
                "p99_ms": percentile(99),
                "min_ms": round(min(latencies), 1),
                "max_ms": round(max(latencies), 1),
                "avg_ms": round(statistics.mean(latencies), 1),
            },
            "categories": dict(sorted(categories.items(), key=lambda x: x[1], reverse=True)),
            "severities": dict(severities),
            "confidence": dict(confidences),
            "error_rate_pct": error_rate,
            "recent_queries": recent,
        }

    def reset(self) -> None:
        """Clear all recorded data (useful in tests)."""
        with self._lock:
            self._records.clear()
            self._rate_limit_hits = 0


# ── Singleton ────────────────────────────────────────────────────────────────
collector = MetricsCollector()
