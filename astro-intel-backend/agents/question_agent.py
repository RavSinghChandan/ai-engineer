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
                     "employment","startup","entrepreneur","salary","raise","interview",
                     "leadership","leader","power","political","politics","position",
                     "success","venture","launch","scale","impact","influence","recognition",
                     "platform","voice","mission","legacy","vision","global","industry",
                     "founder","executive","manager","team","conflict"],
    "finance":      ["money","finance","wealth","investment","loan","debt","savings",
                     "income","profit","loss","stock","property","purchase","abundance",
                     "financial","rich","afford","revenue","budget","asset","fund"],
    "marriage":     ["marriage","married","marry","wedding","relationship","love","partner","spouse",
                     "divorce","boyfriend","girlfriend","soulmate","engagement","dating","wife","husband",
                     "girl","boy","romantic","intimacy","commitment","companionship","compatibility",
                     "compatible","life partner","attract","find love","find someone","suitable",
                     "right person","meet someone","soul mate","together","loneliness","alone",
                     "get married","fall in love","romantic partner","future partner"],
    "health":       ["health","disease","illness","body","medicine","hospital","surgery",
                     "yoga","fitness","stress","anxiety","recovery","pain","vitality",
                     "wellbeing","heal","diet","energy","fatigue","immune","mental","physical"],
    "spirituality": ["spiritual","meditation","karma","dharma","moksha","god","prayer",
                     "temple","religion","soul","peace","awakening","purpose","dharma",
                     "higher","grounded","inner","consciousness","universe","divine",
                     "meaning","fulfil","life purpose","wisdom","enlighten","mindful"],
    "education":    ["study","education","exam","degree","college","university",
                     "learning","course","scholarship","school","result","knowledge",
                     "skill","teach","train","certif","qualify","academic"],
    "travel":       ["travel","abroad","foreign","immigration","visa","country",
                     "relocate","settle","move","overseas","journey","destination","migrate"],
    "children":     ["child","baby","pregnancy","fertility","son","daughter",
                     "parent","family","kid","conceive","offspring","motherhood","fatherhood"],
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


# Strong phrases that force a specific intent regardless of keyword scores.
# Ordered from most specific to least — first match wins.
_INTENT_PHRASES: List[tuple] = [
    # marriage / relationship phrases
    ("marriage",     ["life partner", "compatible partner", "compatible life partner",
                      "find a partner", "find someone", "find love", "get married",
                      "fall in love", "meet my partner", "future partner", "future husband",
                      "future wife", "soulmate", "life companion", "romantic partner"]),
    # career phrases that contain generic words like "find"
    ("career",       ["find a job", "find work", "find employment", "career path",
                      "job search", "job interview"]),
    # finance phrases
    ("finance",      ["financial freedom", "financial stability", "build wealth",
                      "make money", "earn money"]),
    # health phrases
    ("health",       ["get healthy", "lose weight", "mental health", "stay fit"]),
    # travel phrases
    ("travel",       ["move abroad", "settle abroad", "go overseas", "relocate to"]),
    # children phrases
    ("children",     ["have a baby", "have children", "get pregnant", "start a family"]),
    # spirituality phrases
    ("spirituality", ["life purpose", "find my purpose", "inner peace", "spiritual path"]),
]


def _classify(question: str) -> Dict[str, Any]:
    """Classify a single question string into intent + metadata."""
    if not question or not question.strip():
        return {"intent": GENERAL, "confidence": "low", "detected_keywords": []}

    q_lower = question.lower()

    # Phase 1: phrase-priority override — specific multi-word phrases beat keyword counts
    for forced_intent, phrases in _INTENT_PHRASES:
        for phrase in phrases:
            if phrase in q_lower:
                return {
                    "intent":            forced_intent,
                    "confidence":        "high",
                    "detected_keywords": [phrase],
                    "secondary_intents": [],
                }

    # Phase 2: keyword scoring
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


def _split_multi_question(text: str) -> List[str]:
    """
    Split a single string that contains multiple ?-terminated sentences into
    individual question strings.  Only splits on '?' followed by a space or end-of-string,
    never on '?' inside a word.  Returns the original list unchanged if only one
    question is found (avoids splitting rhetorical sub-clauses).
    """
    if not text or text.count("?") <= 1:
        return [text] if text else []
    # Split on '?' keeping the delimiter, then reattach it
    import re as _re
    parts = _re.split(r"\?", text)
    questions: List[str] = []
    for part in parts:
        # Strip leading filler words and punctuation ("Also,", "And,", ",", ".", ";")
        part = _re.sub(r"^[\s,;.]+", "", part)
        part = _re.sub(r"^(?:also|and|but|so|now|tell me|please)\s*[,.]?\s*", "", part, flags=_re.IGNORECASE)
        part = part.strip()
        if part:
            questions.append(part[0].upper() + part[1:] + "?")
    return questions if len(questions) > 1 else [text]


def normalize_questions(raw_questions: List[str], single_question: str) -> List[Dict[str, Any]]:
    """
    Build the normalised_questions list.
    Single source of truth: user_question is the final input (what was in the
    field at submission time).  raw_questions is kept for multi-question enterprise
    mode, but any text that duplicates user_question is dropped so the pipeline
    never processes the same question twice.

    When user_question contains multiple ?-terminated sentences (e.g. a user typed
    3 questions in one box), each sentence is split into a separate question entry
    so each gets its own sub-intent and unique answer.
    """
    final = single_question.strip() if single_question and single_question.strip() else ""

    # Normalised comparison — strip, lowercase, collapse whitespace
    def _norm(t: str) -> str:
        return " ".join(t.lower().split())

    seen: set = set()
    all_q: List[str] = []

    if final:
        # Split multi-sentence single questions into individual questions
        split_questions = _split_multi_question(final)
        for sq in split_questions:
            sq = sq.strip()
            if sq and _norm(sq) not in seen:
                all_q.append(sq)
                seen.add(_norm(sq))

    for q in raw_questions:
        qs = q.strip() if q else ""
        if qs and _norm(qs) not in seen:
            all_q.append(qs)
            seen.add(_norm(qs))

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
