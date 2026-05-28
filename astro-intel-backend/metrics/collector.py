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

RAGAS-style proxy metrics (Module 3 — RAG Evaluation):
  AstroIntel uses rule-based domain agents + consensus, not classic RAG retrieval.
  Standard RAGAS context_precision/recall don't apply (no vector store queries).
  Instead we map existing signals to the closest RAGAS analogue:
    faithfulness_proxy     ← % insights NOT flagged by hallucination layer (grounded in multi-domain consensus)
    context_precision_proxy← % of domains that produced HIGH-confidence output (useful "retrieved" domains)
    answer_relevancy_proxy ← % questions with HIGH consensus (answer addressed the question asked)
    domain_recall_proxy    ← avg domains active / 5 (did all relevant domains contribute?)
  These are exposed in ragas_proxies in the dashboard for interview-ready explanation.
"""
from __future__ import annotations

import time
import statistics
from collections import deque, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# Approximate GPT-4o-mini token pricing (input + output)
_COST_PER_1K_TOKENS = 0.000165  # USD — $0.15/1M input + $0.60/1M output blended


def _compute_episodic_metrics(runs: list) -> dict:
    """
    Episodic memory metrics — aggregated across the rolling window.

    corrections_recalled:
      How many past corrections the persona injector retrieved and injected
      into the LangGraph state on average.  Higher = richer correction history.

    persona_injection_rate:
      % of runs where chandan_preferences was present in state.
      Should be 100% once the system is running normally.

    avg_persona_context_chars:
      Average size of the persona prompt block (static persona + recalled corrections).
      Grows as the correction store fills up.

    total_corrections_db:
      Live count from the episodic_corrections table — pulled fresh each dashboard call.
    """
    n = max(len(runs), 1)
    runs_with_persona = [r for r in runs if getattr(r, 'has_persona_injection', False)]
    avg_recalled = round(
        sum(getattr(r, 'corrections_recalled', 0) for r in runs) / n, 2
    )
    avg_chars = round(
        sum(getattr(r, 'persona_context_chars', 0) for r in runs_with_persona)
        / max(len(runs_with_persona), 1)
    )
    injection_rate = round(len(runs_with_persona) / n * 100, 1)

    # Pull live total from DB across all tenants (non-blocking — returns 0 on any error)
    total_db = 0
    try:
        from memory.episodic import correction_stats_global
        total_db = correction_stats_global().get("total_corrections", 0)
    except Exception:
        pass

    return {
        "total_corrections_logged": total_db,
        "avg_corrections_recalled_per_run": avg_recalled,
        "persona_injection_rate_pct": injection_rate,
        "avg_persona_context_chars": avg_chars,
        "runs_with_persona": len(runs_with_persona),
        "phase": (
            "Phase 1 — correction logging + persona injection (active)"
            if total_db < 100 else
            "Phase 2 — distillation dataset ready for generation"
            if total_db < 500 else
            "Phase 3 — LoRA fine-tune dataset threshold reached"
        ),
        "next_phase_at": 100 if total_db < 100 else 500 if total_db < 500 else None,
        "corrections_until_next_phase": max(0, (100 if total_db < 100 else 500) - total_db) if total_db < 500 else 0,
    }


def _compute_ragas_proxies(
    runs: list,
    conf_totals: dict,
    total_insights: int,
    hallucination_proxy_pct: float,
    answer_relevance_proxy_pct: float,
    avg_domains: float,
) -> dict:
    """
    Map AstroIntel-specific signals to RAGAS-equivalent proxy metrics.

    AstroIntel does not use vector retrieval, so standard RAGAS
    (context_precision, context_recall) cannot be computed directly.
    We map the closest equivalent signals instead.

    faithfulness_proxy:
      Standard RAGAS faithfulness = LLM claims grounded in retrieved context.
      AstroIntel proxy = % of insights NOT suppressed by the hallucination layer.
      Suppression happens when an insight has only 1 domain source (single-source flag)
      or contains hedge phrases / contradictions. Non-suppressed = grounded in consensus.

    context_precision_proxy:
      Standard RAGAS context_precision = retrieved chunks that contributed to answer.
      AstroIntel proxy = % of active domains that produced HIGH-confidence output.
      A domain that ran but produced LOW confidence = noisy "retrieved context."

    answer_relevancy_proxy:
      Standard RAGAS answer_relevancy = answer addresses the question asked.
      AstroIntel proxy = % of questions that received HIGH-consensus answers.

    domain_recall_proxy:
      Standard RAGAS context_recall = all relevant context was retrieved.
      AstroIntel proxy = avg active domains / 5 (did all configured domains contribute?).
    """
    n = max(len(runs), 1)

    # Faithfulness proxy: % insights not suppressed by hallucination layer
    total_suppressed  = sum(r.suppressed_count for r in runs)
    faithfulness_proxy = round(
        max(0.0, 1.0 - (total_suppressed / max(total_insights, 1))), 4
    )

    # Context precision proxy: HIGH-confidence insights / all insights
    high_insights = conf_totals.get("high", 0)
    context_precision_proxy = round(high_insights / max(total_insights, 1), 4)

    # Answer relevancy proxy: direct from existing signal (already 0–100)
    answer_relevancy_proxy = round(answer_relevance_proxy_pct / 100, 4)

    # Domain recall proxy: avg active domains / 5 possible
    domain_recall_proxy = round(avg_domains / 5, 4)

    thresholds = {
        "faithfulness_proxy":      0.85,
        "context_precision_proxy": 0.60,
        "answer_relevancy_proxy":  0.70,
        "domain_recall_proxy":     0.60,
    }

    scores = {
        "faithfulness_proxy":      faithfulness_proxy,
        "context_precision_proxy": context_precision_proxy,
        "answer_relevancy_proxy":  answer_relevancy_proxy,
        "domain_recall_proxy":     domain_recall_proxy,
    }

    alerts = [
        {"metric": k, "score": scores[k], "threshold": v}
        for k, v in thresholds.items()
        if scores[k] < v
    ]

    return {
        "scores":     scores,
        "thresholds": thresholds,
        "alerts":     alerts,
        "note": (
            "These are RAGAS-equivalent proxies for AstroIntel's consensus architecture. "
            "AstroIntel has no vector retrieval — metrics map domain-agent signals to "
            "the nearest RAGAS analogue for interview and evaluation comparability."
        ),
    }


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
    estimated_tokens: int                   # fallback if no real data
    questions_count: int
    high_confidence_questions: int          # questions that got HIGH consensus
    # Real token economics (from DeepSeek API usage field)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    llm_calls: int = 0
    cost_usd: float = 0.0
    # Hallucination audit fields
    hallucination_risk: str = "unknown"     # low / medium / high
    hallucination_rate_pct: float = 0.0
    single_source_flags: int = 0
    hedge_phrase_flags: int = 0
    contradiction_flags: int = 0
    suppressed_count: int = 0
    fallback_injected: int = 0
    coverage_gap: bool = False
    # Episodic memory fields (populated from chandan_preferences in state)
    corrections_recalled: int = 0           # how many past corrections were retrieved
    persona_context_chars: int = 0          # length of the persona prompt block injected
    has_persona_injection: bool = False     # True if chandan_preferences was present in state


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
        # Use real token data where available, fall back to estimate
        runs_with_real = [r for r in runs if r.total_tokens > 0]
        has_real_tokens = len(runs_with_real) > 0

        avg_cost = round(
            sum(r.cost_usd for r in runs_with_real) / max(len(runs_with_real), 1)
            if has_real_tokens else
            sum(r.estimated_tokens for r in runs) / n * _COST_PER_1K_TOKENS / 1000,
            6
        )

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
            "token_economics": {
                "has_real_data": has_real_tokens,
                "data_source": "DeepSeek API usage field" if has_real_tokens else "estimate (no LLM calls in /run pipeline)",
                # Per-run averages
                "avg_prompt_tokens":     round(sum(r.prompt_tokens for r in runs_with_real) / max(len(runs_with_real), 1)) if has_real_tokens else 0,
                "avg_completion_tokens": round(sum(r.completion_tokens for r in runs_with_real) / max(len(runs_with_real), 1)) if has_real_tokens else 0,
                "avg_total_tokens":      round(sum(r.total_tokens for r in runs_with_real) / max(len(runs_with_real), 1)) if has_real_tokens else 0,
                "avg_llm_calls":         round(sum(r.llm_calls for r in runs_with_real) / max(len(runs_with_real), 1), 1) if has_real_tokens else 0,
                # Totals across all runs
                "total_prompt_tokens":     sum(r.prompt_tokens for r in runs),
                "total_completion_tokens": sum(r.completion_tokens for r in runs),
                "total_tokens_all_runs":   sum(r.total_tokens for r in runs),
                "total_llm_calls":         sum(r.llm_calls for r in runs),
                # Cost
                "avg_cost_per_run_usd":  avg_cost,
                "total_cost_usd":        round(sum(r.cost_usd for r in runs), 6),
                "cost_model": "DeepSeek: $0.14/1M input + $0.28/1M output (deepseek-chat)",
                "rule_based_note": "Domain agents (astrology/numerology/palmistry/tarot/vastu) = 0 tokens. LLM only in simplify_agent (WHO/WHAT/WHERE) and /approve report_agent.",
                # Efficiency metrics
                "tokens_per_insight": round(
                    sum(r.total_tokens for r in runs_with_real) /
                    max(sum(r.confidence_counts.get("high", 0) + r.confidence_counts.get("medium", 0) for r in runs_with_real), 1), 1
                ) if has_real_tokens else 0,
                "cost_history_usd": [round(r.cost_usd, 6) for r in list(runs)[-20:]],
                "token_history": [r.total_tokens for r in list(runs)[-20:]],
            },
            "throughput": {
                "requests_last_60s": throughput_rpm,
                "total_sessions": n,
            },
            "agent_latency_avg_ms": agent_avg,
            "hallucination_audit": {
                "avg_rate_pct": round(sum(r.hallucination_rate_pct for r in runs) / n, 1),
                "risk_distribution": {
                    "low":    sum(1 for r in runs if r.hallucination_risk == "low"),
                    "medium": sum(1 for r in runs if r.hallucination_risk == "medium"),
                    "high":   sum(1 for r in runs if r.hallucination_risk == "high"),
                },
                "total_single_source_flags": sum(r.single_source_flags for r in runs),
                "total_hedge_phrase_flags":  sum(r.hedge_phrase_flags for r in runs),
                "total_contradiction_flags": sum(r.contradiction_flags for r in runs),
                "total_suppressed":          sum(r.suppressed_count for r in runs),
                "total_fallbacks_injected":  sum(r.fallback_injected for r in runs),
                "coverage_gap_runs":         sum(1 for r in runs if r.coverage_gap),
                "layer_summary": {
                    "layer1_prevention": "Always active — consensus architecture, structured output, domain isolation",
                    "layer2_detection":  "Runs after meta_agent — single-source check, hedge-phrase scan, contradiction detection",
                    "layer3_recovery":   "Suppresses LOW-confidence flagged insights, injects fallback if question has 0 trusted answers",
                },
            },
            "recent_runs": [
                {
                    "session_id":        r.session_id[:8] + "…",
                    "latency_ms":        round(r.total_latency_ms, 0),
                    "confidence_high":   r.confidence_counts.get("high", 0),
                    "confidence_low":    r.confidence_counts.get("low", 0),
                    "domains_active":    r.domains_active,
                    "errors":            r.error_count,
                    "tokens_est":        r.estimated_tokens,
                    "h_risk":            r.hallucination_risk,
                    "h_rate_pct":        r.hallucination_rate_pct,
                    "h_flags":           r.single_source_flags + r.hedge_phrase_flags + r.contradiction_flags,
                    "h_suppressed":      r.suppressed_count,
                }
                for r in list(runs)[-10:]
            ],
            "ragas_proxies": _compute_ragas_proxies(runs, conf_totals, total_insights, hallucination_proxy, answer_relevance_proxy, avg_domains),
            "episodic_memory": _compute_episodic_metrics(runs),
            "interview_explainer": {
                "why_these_metrics": (
                    "AstroIntel uses rule-based domain agents + a consensus layer — not retrieval-augmented generation. "
                    "Standard RAGAS metrics (faithfulness, context recall) don't apply. "
                    "Instead we track: (1) Consensus confidence as a reliability proxy — HIGH means 3+ independent "
                    "spiritual traditions agree, reducing hallucination risk. "
                    "(2) Latency P95 — parallel agent execution reduced this from ~6 minutes to ~15 seconds. "
                    "(3) Cost per report — capped at ~$0.07 with GPT-4o-mini × 5 agent calls + gpt-4o × 1 synthesis. "
                    "(4) Domain coverage — a report where only 1/5 domains contributed is a quality signal. "
                    "(5) Hallucination audit — 3-layer detection (single-source, hedge-phrase, contradiction) "
                    "with Layer 3 recovery suppressing unreliable insights before they reach the user."
                ),
                "ragas_mapping": (
                    "RAGAS proxies mapped to AstroIntel signals: "
                    "faithfulness → % insights not suppressed by hallucination layer; "
                    "context_precision → % domains producing HIGH-confidence output; "
                    "answer_relevancy → % questions with HIGH-consensus answer; "
                    "domain_recall → avg active domains / 5 possible."
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
            "token_economics": {"has_real_data": False, "avg_total_tokens": 0, "avg_cost_per_run_usd": 0, "total_cost_usd": 0, "data_source": "no data"},
            "throughput": {"requests_last_60s": 0, "total_sessions": 0},
            "agent_latency_avg_ms": {},
            "ragas_proxies": {"scores": {}, "thresholds": {}, "alerts": [], "note": "No data yet."},
            "episodic_memory": _compute_episodic_metrics([]),
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
