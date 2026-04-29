"""
STEP 1 — Question Interpretation Agent
Extracts intent/focus from user_question.
"""
from __future__ import annotations
import re
from typing import Any, Dict


INTENT_KEYWORDS: Dict[str, list] = {
    "career":       ["job","career","work","business","profession","promotion","office","employment","startup","entrepreneur"],
    "finance":      ["money","finance","wealth","investment","loan","debt","savings","income","salary","profit","loss"],
    "marriage":     ["marriage","wedding","relationship","love","partner","spouse","divorce","boyfriend","girlfriend","soulmate"],
    "health":       ["health","disease","illness","body","medicine","hospital","surgery","yoga","fitness","stress","anxiety"],
    "spirituality": ["spiritual","meditation","karma","dharma","moksha","god","prayer","temple","religion","soul","peace"],
    "education":    ["study","education","exam","degree","college","university","learning","course","scholarship"],
    "travel":       ["travel","abroad","foreign","immigration","visa","country","relocate","settle"],
    "children":     ["child","baby","pregnancy","fertility","son","daughter","parent","family"],
}

GENERAL = "general"


def interpret_question(question: str) -> Dict[str, Any]:
    """Return focus_context dict with detected intent, confidence, keywords."""
    if not question or not question.strip():
        return {
            "intent": GENERAL,
            "confidence": "low",
            "detected_keywords": [],
            "question": "",
            "summary": "No specific question provided. A general life overview will be generated.",
        }

    q_lower = question.lower()
    scores: Dict[str, int] = {}
    detected: Dict[str, list] = {}

    for intent, keywords in INTENT_KEYWORDS.items():
        hits = [kw for kw in keywords if kw in q_lower]
        if hits:
            scores[intent] = len(hits)
            detected[intent] = hits

    if not scores:
        primary_intent = GENERAL
        confidence = "low"
        kw = []
    else:
        primary_intent = max(scores, key=lambda k: scores[k])
        conf_score = scores[primary_intent]
        confidence = "high" if conf_score >= 3 else "medium" if conf_score >= 2 else "low"
        kw = detected.get(primary_intent, [])

    secondary = [k for k in scores if k != primary_intent]

    return {
        "intent": primary_intent,
        "secondary_intents": secondary[:2],
        "confidence": confidence,
        "detected_keywords": kw,
        "question": question.strip(),
        "summary": _build_summary(primary_intent, question),
    }


def _build_summary(intent: str, question: str) -> str:
    summaries = {
        "career":       "The user is seeking guidance about their professional life and career path.",
        "finance":      "The user is seeking insights about financial matters and wealth management.",
        "marriage":     "The user is seeking guidance about relationships and marriage.",
        "health":       "The user is seeking insights about their health and physical well-being.",
        "spirituality": "The user is seeking spiritual guidance and inner peace.",
        "education":    "The user is seeking guidance about studies and educational pursuits.",
        "travel":       "The user is seeking insights about travel and relocation.",
        "children":     "The user is seeking guidance related to children and family planning.",
        "general":      "A general life overview will be provided across all dimensions.",
    }
    return summaries.get(intent, summaries["general"])


# ── LangGraph node ─────────────────────────────────────────────────────────
def question_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    question = state.get("user_question", "")
    focus = interpret_question(question)
    state["focus_context"] = focus
    state.setdefault("agent_log", []).append(
        f"[QuestionAgent] Intent detected: {focus['intent']} (confidence: {focus['confidence']})"
    )
    return state
