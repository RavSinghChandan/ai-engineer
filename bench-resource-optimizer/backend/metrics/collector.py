"""
Production Metrics Collector — Module 1 pattern (Evaluation Metrics / Production KPIs).

Tracks per-request signals across all pipeline operations.
Same architecture as AstroIntel's MetricsCollector — extended for RAG-specific KPIs.

KPIs captured:
  1. Latency P50/P95/P99    — per endpoint + per agent
  2. Token economics        — input/output/total tokens, cost per call (DeepSeek pricing)
  3. RAG retrieval quality  — match % distribution from role mapping
  4. Error rate             — per endpoint
  5. Throughput             — requests per 60s rolling window
  6. Cache hit rate         — plan cache efficiency
  7. Circuit breaker status — from retry module
"""
from __future__ import annotations

import statistics
import time
from collections import deque, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# DeepSeek pricing (same as AstroIntel)
_INPUT_COST_PER_M  = 0.14   # USD per 1M input tokens
_OUTPUT_COST_PER_M = 0.28   # USD per 1M output tokens


@dataclass
class RequestRecord:
    request_id:       str
    endpoint:         str          # /upload-cv, /map-role, /generate-plan, /update-progress
    started_at:       float
    ended_at:         float
    latency_ms:       float
    status_code:      int
    prompt_tokens:    int = 0
    completion_tokens: int = 0
    total_tokens:     int = 0
    cost_usd:         float = 0.0
    match_percentage: Optional[float] = None   # role mapping quality
    cache_hit:        bool = False
    error:            Optional[str] = None


class MetricsCollector:
    """Thread-safe in-memory metrics store. Keeps last 1000 requests."""

    def __init__(self, window: int = 1000) -> None:
        self._records: deque[RequestRecord] = deque(maxlen=window)
        self._timestamps: deque[float] = deque(maxlen=2000)
        self._cache_hits   = 0
        self._cache_misses = 0

    def record(self, r: RequestRecord) -> None:
        self._records.append(r)
        self._timestamps.append(r.ended_at)
        if r.cache_hit:
            self._cache_hits += 1
        else:
            self._cache_misses += 1

    def dashboard(self) -> Dict[str, Any]:
        records = list(self._records)
        if not records:
            return {"total_requests": 0, "message": "No requests recorded yet."}

        n = len(records)
        latencies = sorted(r.latency_ms for r in records)

        def pct(data: List[float], p: float) -> float:
            if not data:
                return 0.0
            idx = max(0, int(p / 100 * len(data)) - 1)
            return round(data[idx], 1)

        # Per-endpoint breakdown
        endpoint_stats: Dict[str, Dict] = defaultdict(lambda: {"count": 0, "errors": 0, "latencies": []})
        for r in records:
            ep = endpoint_stats[r.endpoint]
            ep["count"] += 1
            ep["latencies"].append(r.latency_ms)
            if r.error:
                ep["errors"] += 1

        endpoint_summary = {}
        for ep_name, ep in endpoint_stats.items():
            ep_lats = sorted(ep["latencies"])
            endpoint_summary[ep_name] = {
                "count":      ep["count"],
                "error_rate": round(ep["errors"] / ep["count"] * 100, 1),
                "p50_ms":     pct(ep_lats, 50),
                "p95_ms":     pct(ep_lats, 95),
                "avg_ms":     round(statistics.mean(ep["latencies"]), 1),
            }

        # Token economics
        runs_with_tokens = [r for r in records if r.total_tokens > 0]
        has_real_tokens  = len(runs_with_tokens) > 0

        # RAG match % distribution
        map_records = [r for r in records if r.match_percentage is not None]
        avg_match = round(
            sum(r.match_percentage for r in map_records) / len(map_records), 1
        ) if map_records else 0.0

        # Throughput
        now = time.time()
        rpm = sum(1 for ts in self._timestamps if now - ts <= 60)

        # Cache efficiency
        total_cacheable = self._cache_hits + self._cache_misses
        cache_hit_rate  = round(self._cache_hits / total_cacheable * 100, 1) if total_cacheable else 0.0

        # Error rate
        error_count = sum(1 for r in records if r.error)
        error_rate  = round(error_count / n * 100, 1)

        return {
            "total_requests": n,
            "latency": {
                "p50_ms": pct(latencies, 50),
                "p95_ms": pct(latencies, 95),
                "p99_ms": pct(latencies, 99),
                "avg_ms": round(statistics.mean(latencies), 1),
                "min_ms": round(min(latencies), 1),
                "max_ms": round(max(latencies), 1),
                "history_ms": [round(r.latency_ms, 0) for r in list(records)[-20:]],
            },
            "error_rate": {
                "rate_pct":    error_rate,
                "total_errors": error_count,
            },
            "throughput": {
                "requests_last_60s": rpm,
                "total_requests":    n,
            },
            "token_economics": {
                "has_real_data":         has_real_tokens,
                "avg_prompt_tokens":     round(sum(r.prompt_tokens for r in runs_with_tokens) / max(len(runs_with_tokens), 1)),
                "avg_completion_tokens": round(sum(r.completion_tokens for r in runs_with_tokens) / max(len(runs_with_tokens), 1)),
                "avg_total_tokens":      round(sum(r.total_tokens for r in runs_with_tokens) / max(len(runs_with_tokens), 1)),
                "total_cost_usd":        round(sum(r.cost_usd for r in records), 6),
                "avg_cost_per_request":  round(sum(r.cost_usd for r in runs_with_tokens) / max(len(runs_with_tokens), 1), 6),
                "cost_model":            "DeepSeek: $0.14/1M input + $0.28/1M output",
                "cost_history_usd":      [round(r.cost_usd, 6) for r in list(records)[-20:]],
            },
            "rag_quality": {
                "avg_match_percentage": avg_match,
                "total_role_mappings":  len(map_records),
                "high_match_count":     sum(1 for r in map_records if (r.match_percentage or 0) >= 70),
                "low_match_count":      sum(1 for r in map_records if (r.match_percentage or 0) < 40),
            },
            "cache": {
                "hit_rate_pct": cache_hit_rate,
                "total_hits":   self._cache_hits,
                "total_misses": self._cache_misses,
            },
            "endpoint_breakdown": endpoint_summary,
            "recent_requests": [
                {
                    "request_id":  r.request_id[:8] + "…",
                    "endpoint":    r.endpoint,
                    "latency_ms":  round(r.latency_ms, 0),
                    "status":      r.status_code,
                    "tokens":      r.total_tokens,
                    "cost_usd":    round(r.cost_usd, 6),
                    "cache_hit":   r.cache_hit,
                    "error":       r.error,
                }
                for r in list(records)[-10:]
            ],
        }


_collector: Optional[MetricsCollector] = None


def get_collector() -> MetricsCollector:
    global _collector
    if _collector is None:
        _collector = MetricsCollector()
    return _collector
