"""
Multi-Query RAG — Module 3 (Advanced RAG Patterns: Self-RAG, CRAG, HyDE)

Problem this solves in AstroIntel:
  Keyword-based intent classification misses abstractly phrased questions.
  "Will my ventures prosper?" has zero keyword overlap with the 'career' bucket.
  A single query embedding / keyword pass may fail entirely on such questions.

Multi-Query RAG solution:
  1. Generate 2 semantic variants of the user question via LLM (DeepSeek).
  2. Classify the original query + all variants using the existing _classify().
  3. Pick the highest-confidence result across all variants.
  4. Fall back to original single-query classification if LLM is unavailable.

Design:
  - Additive only — _classify() and normalize_questions() are NOT changed.
  - This module is a thin wrapper called by question_agent_node before _classify().
  - LLM call is bounded: max_tokens=80, temperature=0 (deterministic), timeout=30s.
  - If the LLM call fails or returns unparseable output, original query is used.

Cost: one extra LLM call per user question (before classification only, not per pipeline run).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List
from guardrails.production import repair_json

logger = logging.getLogger("astro.rag.multi_query")

_VARIANT_SYSTEM = (
    "You are a query reformulation engine for an astrology platform. "
    "Given a user question, generate exactly 2 alternative phrasings that preserve "
    "the same intent but use different vocabulary. "
    "Return ONLY a JSON array of 2 strings. No explanation, no markdown."
)


def _generate_variants(question: str) -> List[str]:
    """
    Use DeepSeek to generate 2 semantic variants of the question.
    Returns empty list on any failure — caller falls back to original.
    """
    try:
        from utils.deepseek_client import call as llm_call
        raw = llm_call(
            system=_VARIANT_SYSTEM,
            user=question,
            temperature=0,
            max_tokens=80,
        )
        # ── G3: JSON Repair — handle malformed LLM JSON array output ─────────
        parsed, was_repaired = repair_json(raw)
        if parsed is None:
            logger.debug("multi_query: JSON repair failed, skipping variants")
            return []
        if was_repaired:
            logger.info("multi_query: repaired malformed JSON from LLM")
        variants = parsed if isinstance(parsed, list) else parsed.get("variants", []) if isinstance(parsed, dict) else []
        if isinstance(variants, list):
            return [str(v).strip() for v in variants if v and str(v).strip()][:2]
    except Exception as exc:
        logger.debug("multi_query variant generation failed: %s", exc)
    return []


def multi_query_classify(question: str) -> Dict[str, Any]:
    """
    Multi-Query RAG intent classification.

    Runs _classify() on the original question + up to 2 LLM-generated variants,
    then returns the classification with the highest confidence score.

    Confidence priority: high > medium > low.
    Tie-break: first occurrence (original question wins ties).
    """
    from agents.question_agent import _classify

    _CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}

    candidates: List[Dict[str, Any]] = []

    # Always classify the original question
    original_result = _classify(question)
    original_result["_source_query"] = question
    candidates.append(original_result)

    # Generate and classify variants
    variants = _generate_variants(question)
    for variant in variants:
        result = _classify(variant)
        result["_source_query"] = variant
        candidates.append(result)
        logger.debug(
            '{"event":"multi_query_variant","variant":"%s","intent":"%s","confidence":"%s"}',
            variant[:60], result.get("intent"), result.get("confidence"),
        )

    # Pick highest-confidence result; ties go to the original
    best = max(candidates, key=lambda r: _CONFIDENCE_RANK.get(r.get("confidence", "low"), 0))

    logger.info(
        '{"event":"multi_query_classify","original":"%s","variants_generated":%d,'
        '"best_intent":"%s","best_confidence":"%s","winning_query":"%s"}',
        question[:60], len(variants),
        best.get("intent"), best.get("confidence"),
        best.get("_source_query", question)[:60],
    )

    # Strip internal tracking key before returning
    best.pop("_source_query", None)
    return best
