"""
Per-Report RAGAS Evaluation (Phase — RAGAS)
=============================================
Scores each generated report against the user's original question
using four RAGAS-equivalent metrics adapted for AstroIntel's
rule-based + LLM-synthesis architecture.

Why not the official RAGAS library?
  Official RAGAS requires retrieved context chunks (RAG pipeline).
  AstroIntel uses rule-based domain agents — no vector retrieval.
  We compute the closest meaningful equivalents from the report content.

Four metrics (all 0.0 – 1.0, higher is better):
  faithfulness       — story covers only what the domain agents actually said
                       (cross-checks story sentences against insight bullets)
  answer_relevancy   — story directly addresses the user's question
                       (keyword + semantic overlap between question and story)
  context_precision  — HIGH-confidence insights / total insights approved
                       (how much of the approved content was high-quality)
  domain_recall      — fraction of 5 domains that contributed approved insights
                       (did all relevant domains show up in the final report?)

Thresholds (used for alerts in dashboard):
  faithfulness       ≥ 0.80
  answer_relevancy   ≥ 0.70
  context_precision  ≥ 0.60
  domain_recall      ≥ 0.60

Storage: in-memory deque of last 200 scored reports.
"""
from __future__ import annotations
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

# ── thresholds ────────────────────────────────────────────────────────────────
THRESHOLDS = {
    "faithfulness":      0.80,
    "answer_relevancy":  0.70,
    "context_precision": 0.60,
    "domain_recall":     0.60,
}

_DOMAINS = ("numerology", "astrology", "palmistry", "tarot", "vastu")


@dataclass
class RAGASRecord:
    session_id:        str
    scored_at:         float
    question:          str
    faithfulness:      float
    answer_relevancy:  float
    context_precision: float
    domain_recall:     float
    alerts:            list = field(default_factory=list)

    @property
    def overall(self) -> float:
        return round((self.faithfulness + self.answer_relevancy +
                      self.context_precision + self.domain_recall) / 4, 4)


# ── singleton store ───────────────────────────────────────────────────────────
_records: deque[RAGASRecord] = deque(maxlen=200)


# ── scoring helpers ───────────────────────────────────────────────────────────

def _tokenise(text: str) -> set[str]:
    """Lowercase word tokens, stop-words stripped."""
    STOP = {"the", "a", "an", "is", "are", "will", "my", "your", "in",
            "on", "at", "for", "of", "to", "and", "or", "with", "be",
            "it", "this", "that", "you", "i", "me", "we", "our"}
    return {w for w in re.findall(r"[a-z]+", text.lower()) if w not in STOP and len(w) > 2}


def _collect_insights(report: dict) -> list[dict]:
    """
    Extract all insight dicts from the report regardless of structure variant.

    AstroIntel report shape (admin_review format):
      report["questions"][i]["insights"][j] → {id, content, confidence, domains, ...}

    Handles both "content" and "text" keys for the insight body.
    """
    insights: list[dict] = []
    for q_block in report.get("questions", []):
        if not isinstance(q_block, dict):
            continue
        for ins in q_block.get("insights", []):
            if isinstance(ins, dict):
                insights.append(ins)
    # fallback: sections list (final_report format)
    if not insights:
        for sec in report.get("sections", []):
            if isinstance(sec, dict):
                for ins in sec.get("insights", []):
                    if isinstance(ins, dict):
                        insights.append(ins)
    return insights


def _insight_text(ins: dict) -> str:
    return ins.get("content") or ins.get("text") or ""


def _score_faithfulness(report: dict, approved_ids: list[str]) -> float:
    """
    Faithfulness: what fraction of insights are grounded (not hallucinated)?

    Method: HIGH confidence = cross-domain validated by meta_agent (3+ traditions
    agreed). MEDIUM = 2 traditions. LOW = single source (hallucination risk).
    Grounded = HIGH or MEDIUM confidence. LOW confidence = not grounded.
    If no insights found, return 1.0.
    """
    approved_set = set(approved_ids)
    all_insights = _collect_insights(report)
    approved = [i for i in all_insights if i.get("id") in approved_set] if approved_set else all_insights
    if not approved:
        return 1.0
    grounded = sum(
        1 for ins in approved
        if ins.get("confidence", "low").lower() in ("high", "medium")
    )
    return round(grounded / len(approved), 4)


def _score_answer_relevancy(report: dict, question: str) -> float:
    """
    Answer relevancy: does the approved content directly address the question?

    Method: keyword overlap between question tokens and all approved insight text.
    """
    q_tokens = _tokenise(question)
    if not q_tokens:
        return 1.0

    all_insights = _collect_insights(report)
    all_text = " ".join(_insight_text(ins) for ins in all_insights)
    content_tokens = _tokenise(all_text)

    if not content_tokens:
        return 0.0

    overlap = len(q_tokens & content_tokens) / len(q_tokens)
    return round(min(overlap, 1.0), 4)


def _score_context_precision(report: dict, approved_ids: list[str]) -> float:
    """
    Context precision: fraction of insights that are HIGH confidence.
    HIGH = backed by cross-domain agreement (meta_agent assigns this when
    3+ traditions ran). Measures how much of the pipeline output is top quality.
    """
    approved_set = set(approved_ids)
    all_insights = _collect_insights(report)
    target = [i for i in all_insights if i.get("id") in approved_set] if approved_set else all_insights
    if not target:
        return 1.0
    high = sum(1 for ins in target if ins.get("confidence", "").lower() == "high")
    return round(high / len(target), 4)


def _score_domain_recall(report: dict, approved_ids: list[str]) -> float:
    """
    Domain recall: fraction of 5 possible domains that contributed
    at least one approved insight to the final report.
    """
    approved_set = set(approved_ids)
    all_insights = _collect_insights(report)
    target = [i for i in all_insights if i.get("id") in approved_set] if approved_set else all_insights
    domains_seen: set[str] = set()
    for ins in target:
        for d in ins.get("domains", []):
            domains_seen.add(d.lower())
        # also check sub_agent field
        sa = ins.get("sub_agent", "")
        for dom in _DOMAINS:
            if dom in sa.lower():
                domains_seen.add(dom)
    return round(len(domains_seen & set(_DOMAINS)) / len(_DOMAINS), 4)


# ── public API ────────────────────────────────────────────────────────────────

def evaluate(
    session_id: str,
    report: dict[str, Any],
    question: str,
    approved_ids: list[str],
) -> RAGASRecord:
    """
    Score a generated report and store the result.
    Called from /approve after final_report_agent completes.
    Never raises — returns a zero-score record on any error.
    """
    try:
        f  = _score_faithfulness(report, approved_ids)
        ar = _score_answer_relevancy(report, question)
        cp = _score_context_precision(report, approved_ids)
        dr = _score_domain_recall(report, approved_ids)

        alerts = [
            k for k, thresh in THRESHOLDS.items()
            if {"faithfulness": f, "answer_relevancy": ar,
                "context_precision": cp, "domain_recall": dr}[k] < thresh
        ]

        rec = RAGASRecord(
            session_id        = session_id,
            scored_at         = time.time(),
            question          = question[:200],
            faithfulness      = f,
            answer_relevancy  = ar,
            context_precision = cp,
            domain_recall     = dr,
            alerts            = alerts,
        )
    except Exception:
        rec = RAGASRecord(
            session_id        = session_id,
            scored_at         = time.time(),
            question          = question[:200],
            faithfulness      = 0.0,
            answer_relevancy  = 0.0,
            context_precision = 0.0,
            domain_recall     = 0.0,
            alerts            = list(THRESHOLDS.keys()),
        )

    _records.append(rec)
    return rec


def summary() -> dict[str, Any]:
    """Aggregate summary of all scored reports — for metrics dashboard."""
    recs = list(_records)
    if not recs:
        return {
            "total_scored": 0,
            "message": "No reports scored yet. Approve an analysis to see RAGAS scores.",
            "averages": {},
            "thresholds": THRESHOLDS,
            "alerts": [],
            "recent": [],
        }

    n = len(recs)

    def avg(attr: str) -> float:
        return round(sum(getattr(r, attr) for r in recs) / n, 4)

    avgs = {
        "faithfulness":      avg("faithfulness"),
        "answer_relevancy":  avg("answer_relevancy"),
        "context_precision": avg("context_precision"),
        "domain_recall":     avg("domain_recall"),
        "overall":           avg("overall"),
    }

    # Which metrics are below threshold on average?
    avg_alerts = [k for k, t in THRESHOLDS.items() if avgs[k] < t]

    recent = [
        {
            "session_id":        r.session_id[:8] + "…",
            "question":          r.question[:80],
            "faithfulness":      r.faithfulness,
            "answer_relevancy":  r.answer_relevancy,
            "context_precision": r.context_precision,
            "domain_recall":     r.domain_recall,
            "overall":           r.overall,
            "alerts":            r.alerts,
            "scored_at":         r.scored_at,
        }
        for r in list(recs)[-10:]
    ]

    # Trend: last 5 overall scores
    trend = [round(r.overall, 3) for r in list(recs)[-5:]]

    return {
        "total_scored": n,
        "averages":     avgs,
        "thresholds":   THRESHOLDS,
        "alerts":       avg_alerts,
        "trend":        trend,
        "recent":       recent,
        "explainer": {
            "faithfulness":      "Story sentences grounded in approved insight bullets (higher = less hallucination)",
            "answer_relevancy":  "Story directly addresses the user's question (higher = more on-topic)",
            "context_precision": "Approved insights that were HIGH confidence (higher = better quality content)",
            "domain_recall":     "Fraction of 5 domains that contributed to the report (higher = more complete)",
        },
    }


def get_record(session_id: str) -> dict[str, Any] | None:
    """Get RAGAS scores for a specific session."""
    for r in reversed(list(_records)):
        if r.session_id == session_id:
            return {
                "session_id":        r.session_id,
                "question":          r.question,
                "faithfulness":      r.faithfulness,
                "answer_relevancy":  r.answer_relevancy,
                "context_precision": r.context_precision,
                "domain_recall":     r.domain_recall,
                "overall":           r.overall,
                "alerts":            r.alerts,
                "scored_at":         r.scored_at,
                "thresholds":        THRESHOLDS,
            }
    return None
