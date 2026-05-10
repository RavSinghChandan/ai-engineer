"""
Hallucination Detection — Module 1 (Hallucination Root Cause, Detection, Mitigation)
                          Module 3 (RAG Evaluation — RAGAS Faithfulness Proxy)

Two mechanisms:

  1. Faithfulness proxy (no ground truth needed):
     Check if the LLM output is grounded in the retrieved role context.
     If the output mentions skills NOT in the retrieved context, that's a hallucination signal.
     Threshold: < 0.4 grounding score → return fallback message (Module 3 pattern).

  2. LLM-as-Judge (Module 1 — evaluation when no ground truth):
     A second LLM call evaluates the quality of the first call's output.
     Scores: relevance, completeness, accuracy, actionability (1-5 each).
     In production: run async on every response, alert if avg score drops below 3.5.

Why these matter for bench-resource-optimizer:
  Role mapping output is used to generate a training plan.
  A hallucinated skill gap ("candidate is missing Kubernetes" when they have it)
  generates an unnecessary training week. That wastes 20+ hours of employee time.
  At 10,000 employees, each hallucinated skill costs ~$50K in wasted bench time.
  Faithfulness checking pays for itself immediately.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("bench.hallucination")


# ── Faithfulness proxy ────────────────────────────────────────────────────────

def _extract_skills(text: str) -> set:
    """Extract likely skill tokens (CamelCase, ALLCAPS, or known tech terms)."""
    # Match: CamelCase, ALL_CAPS, hyphenated-tech, or single tech keywords
    tokens = re.findall(r'\b[A-Z][a-zA-Z]+\b|\b[A-Z]{2,}\b|\b\w+-\w+\b', text)
    # Also include lowercase known tech terms
    lower_tokens = re.findall(
        r'\b(java|python|docker|kubernetes|kafka|redis|postgresql|mongodb|'
        r'angular|react|node|spring|maven|gradle|jwt|rest|api|git|linux|aws|'
        r'terraform|jenkins|ansible|prometheus|airflow|spark|pandas|mlflow|'
        r'fastapi|langchain|pytorch|tensorflow|scikit)\b',
        text.lower()
    )
    return set(t.lower() for t in tokens) | set(lower_tokens)


def check_faithfulness(
    llm_output: str,
    retrieved_context: str,
    threshold: float = 0.4,
) -> Tuple[float, bool, str]:
    """
    Check if LLM output is grounded in the retrieved context.

    Method: skill token overlap between output and context.
    Skills mentioned in output but NOT in context = potential hallucination.

    Returns: (grounding_score, is_faithful, reason)
    - grounding_score: 0.0 (fully hallucinated) to 1.0 (fully grounded)
    - is_faithful: True if score >= threshold
    - reason: explanation string for audit log
    """
    output_skills  = _extract_skills(llm_output)
    context_skills = _extract_skills(retrieved_context)

    if not output_skills:
        return 1.0, True, "no_skill_claims_in_output"

    grounded = output_skills & context_skills
    score    = len(grounded) / len(output_skills)

    is_faithful = score >= threshold
    reason = (
        f"grounded={len(grounded)}/{len(output_skills)}_skills "
        f"score={score:.2f} threshold={threshold}"
    )

    if not is_faithful:
        ungrounded = output_skills - context_skills
        logger.warning(
            '{"event":"faithfulness_fail","score":%.2f,"ungrounded_skills":%s}',
            score, list(ungrounded)[:5],
        )

    return score, is_faithful, reason


FAITHFULNESS_FALLBACK = (
    "The role requirements could not be verified with sufficient confidence. "
    "Please try selecting the role again or contact your HR system for the exact skill requirements."
)


# ── LLM-as-Judge ─────────────────────────────────────────────────────────────

def run_llm_judge(
    question: str,
    context: str,
    output: str,
    llm,
    request_id: str = "",
) -> Dict[str, Any]:
    """
    Evaluate LLM output quality using a second LLM call as judge.
    Module 1 pattern: use when no ground truth exists.

    Returns judge scores dict:
    {
        "relevance": int,        # 1-5
        "completeness": int,     # 1-5
        "accuracy": int,         # 1-5
        "actionability": int,    # 1-5
        "avg_score": float,      # mean of above
        "reasoning": str,
        "passed": bool,          # avg_score >= 3.5
    }
    """
    from utils.prompts import get_active
    from utils.json_parser import parse_llm_json
    from langchain.prompts import ChatPromptTemplate

    prompt_def = get_active("llm_judge")
    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_def.system),
        ("human", prompt_def.user),
    ])
    bounded = llm.bind(max_tokens=120)
    chain   = prompt | bounded

    try:
        result = chain.invoke({
            "question": question[:200],
            "context":  context[:400],
            "output":   output[:400],
        })
        scores = parse_llm_json(result.content)
        avg = round(
            (scores.get("relevance", 3) + scores.get("completeness", 3) +
             scores.get("accuracy", 3) + scores.get("actionability", 3)) / 4, 2
        )
        scores["avg_score"] = avg
        scores["passed"]    = avg >= 3.5
        scores["request_id"] = request_id

        if not scores["passed"]:
            logger.warning(
                '{"event":"llm_judge_fail","request_id":"%s","avg_score":%.2f}',
                request_id, avg,
            )
        return scores

    except Exception as e:
        logger.error('{"event":"llm_judge_error","error":"%s"}', str(e)[:80])
        return {
            "relevance": 0, "completeness": 0, "accuracy": 0, "actionability": 0,
            "avg_score": 0.0, "passed": False,
            "reasoning": f"judge_failed: {e}",
            "request_id": request_id,
        }
