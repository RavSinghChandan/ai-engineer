"""
STEP 1 — Question Normalization Agent
Accepts single question string OR list of questions.
Breaks each into an atomic normalised record with intent classification.
"""
from __future__ import annotations
import re
from typing import Any, Dict, List

INTENT_KEYWORDS: Dict[str, List[str]] = {
    "career":       ["job","career","work","business","profession","promotion","office",
                     "employment","startup","entrepreneur","salary","raise","interview"],
    "finance":      ["money","finance","wealth","investment","loan","debt","savings",
                     "income","profit","loss","stock","property","purchase"],
    "marriage":     ["marriage","married","marry","wedding","relationship","love","partner","spouse",
                     "divorce","boyfriend","girlfriend","soulmate","engagement","dating","wife","husband","girl","boy"],
    "health":       ["health","disease","illness","body","medicine","hospital","surgery",
                     "yoga","fitness","stress","anxiety","recovery","pain"],
    "spirituality": ["spiritual","meditation","karma","dharma","moksha","god","prayer",
                     "temple","religion","soul","peace","awakening","purpose"],
    "education":    ["study","education","exam","degree","college","university",
                     "learning","course","scholarship","school","result"],
    "travel":       ["travel","abroad","foreign","immigration","visa","country",
                     "relocate","settle","move","overseas"],
    "children":     ["child","baby","pregnancy","fertility","son","daughter",
                     "parent","family","kid","conceive"],
}

GENERAL = "general"

INTENT_SUMMARIES = {
    "career":       "Professional life, career path, and work opportunities.",
    "finance":      "Financial matters, wealth, and money management.",
    "marriage":     "Relationships, love life, and marriage.",
    "health":       "Physical health, vitality, and well-being.",
    "spirituality": "Spiritual growth, inner peace, and purpose.",
    "education":    "Studies, exams, and educational pursuits.",
    "travel":       "Travel, relocation, and life abroad.",
    "children":     "Children, family planning, and parenting.",
    "general":      "General life overview across all dimensions.",
}


def _classify(question: str) -> Dict[str, Any]:
    """Classify a single question string into intent + metadata."""
    if not question or not question.strip():
        return {"intent": GENERAL, "confidence": "low", "detected_keywords": []}

    q_lower = question.lower()
    scores: Dict[str, int] = {}
    detected: Dict[str, List[str]] = {}

    for intent, keywords in INTENT_KEYWORDS.items():
        hits = [kw for kw in keywords if kw in q_lower]
        if hits:
            scores[intent] = len(hits)
            detected[intent] = hits

    if not scores:
        return {"intent": GENERAL, "confidence": "low", "detected_keywords": []}

    primary = max(scores, key=lambda k: scores[k])
    score   = scores[primary]
    confidence = "high" if score >= 3 else "medium" if score >= 2 else "low"

    return {
        "intent":            primary,
        "confidence":        confidence,
        "detected_keywords": detected.get(primary, []),
        "secondary_intents": [k for k in scores if k != primary][:2],
    }


def normalize_questions(raw_questions: List[str], single_question: str) -> List[Dict[str, Any]]:
    """
    Build the normalised_questions list.
    Merges single_question + questions list, deduplicates, returns per-question dicts.
    """
    # Collect all questions
    all_q: List[str] = []
    if single_question and single_question.strip():
        all_q.append(single_question.strip())
    for q in raw_questions:
        if q and q.strip() and q.strip() not in all_q:
            all_q.append(q.strip())

    # Fall back to a general question if nothing provided
    if not all_q:
        all_q = ["Please give me a general life overview."]

    normalized = []
    for idx, q in enumerate(all_q):
        classification = _classify(q)
        normalized.append({
            "question":          q,
            "intent":            classification["intent"],
            "confidence":        classification["confidence"],
            "detected_keywords": classification["detected_keywords"],
            "summary":           INTENT_SUMMARIES.get(classification["intent"], INTENT_SUMMARIES[GENERAL]),
            "index":             idx,
        })

    return normalized


# ── LangGraph node ────────────────────────────────────────────────────────
def question_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    raw_q   = state.get("questions", [])
    single  = state.get("user_question", "")

    normalized = normalize_questions(raw_q, single)
    state["normalized_questions"] = normalized

    # Keep a backward-compat focus_context (first question's intent)
    first = normalized[0]
    state["focus_context"] = {
        "intent":            first["intent"],
        "confidence":        first["confidence"],
        "detected_keywords": first["detected_keywords"],
        "question":          first["question"],
        "summary":           first["summary"],
        "total_questions":   len(normalized),
    }

    state.setdefault("agent_log", []).append(
        f"[QuestionAgent] Normalized {len(normalized)} question(s). "
        f"Intents: {[n['intent'] for n in normalized]}"
    )
    return state
