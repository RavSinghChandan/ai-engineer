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


def _score_faithfulness(report: dict, approved_ids: list[str]) -> float:
    """
    Faithfulness: do story paragraphs only reflect what the domain agents said?

    Method: collect all approved insight bullet text, then check what fraction
    of story sentences contain at least one keyword from the insight pool.
    A story that invents content will have low overlap.
    """
    # Collect approved insight text
    insight_tokens: set[str] = set()
    approved_set = set(approved_ids)
    for domain_data in report.get("domains", {}).values():
        for q_block in (domain_data if isinstance(domain_data, list) else []):
            for insight in q_block.get("insights", []):
                if insight.get("id") in approved_set:
                    insight_tokens |= _tokenise(insight.get("text", ""))

    if not insight_tokens:
        return 1.0  # no insights to compare — can't penalise

    # Collect story sentences from all domain stories
    story_sentences: list[str] = []
    for q_block in report.get("questions", []):
        story = q_block.get("story", "")
        if story:
            story_sentences += re.split(r"(?<=[.!?])\s+", story.strip())

    if not story_sentences:
        return 1.0

    grounded = sum(
        1 for s in story_sentences
        if _tokenise(s) & insight_tokens
    )
    return round(grounded / len(story_sentences), 4)


def _score_answer_relevancy(report: dict, question: str) -> float:
    """
    Answer relevancy: does the report story address the user's question?

    Method: keyword overlap between question tokens and all story text.
    """
    q_tokens = _tokenise(question)
    if not q_tokens:
        return 1.0

    story_text = " ".join(
        q_block.get("story", "")
        for q_block in report.get("questions", [])
    )
    story_tokens = _tokenise(story_text)

    if not story_tokens:
        return 0.0

    overlap = len(q_tokens & story_tokens) / len(q_tokens)
    return round(min(overlap, 1.0), 4)


def _score_context_precision(report: dict, approved_ids: list[str]) -> float:
    """
    Context precision: of the approved insights, what fraction were HIGH confidence?
    HIGH-confidence = backed by 3+ independent domains (most reliable content).
    """
    approved_set = set(approved_ids)
    total = 0
    high  = 0
    for domain_data in report.get("domains", {}).values():
        for q_block in (domain_data if isinstance(domain_data, list) else []):
            for insight in q_block.get("insights", []):
                if insight.get("id") in approved_set:
                    total += 1
                    if insight.get("confidence", "").lower() == "high":
                        high += 1
    if total == 0:
        return 1.0
    return round(high / total, 4)


def _score_domain_recall(report: dict, approved_ids: list[str]) -> float:
    """
    Domain recall: fraction of 5 possible domains that contributed
    at least one approved insight to the final report.
    """
    approved_set = set(approved_ids)
    domains_with_content: set[str] = set()
    for domain in _DOMAINS:
        domain_data = report.get("domains", {}).get(domain, [])
        for q_block in (domain_data if isinstance(domain_data, list) else []):
            for insight in q_block.get("insights", []):
                if insight.get("id") in approved_set:
                    domains_with_content.add(domain)
                    break
    return round(len(domains_with_content) / len(_DOMAINS), 4)


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
