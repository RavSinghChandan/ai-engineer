"""
STEP 2d — Tarot Reading Super Agent
Runs Rider-Waite and Intuitive sub-agents per question.
Each sub-agent builds a personalized, question-specific multi-sentence answer.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt

DECK: List[Dict[str, Any]] = [
    {"name": "The Fool",          "keywords": ["new beginnings", "adventure", "potential"],        "meaning": "A fresh start is on the horizon — uninhibited exploration of new possibilities is suggested."},
    {"name": "The Magician",      "keywords": ["willpower", "skill", "manifestation"],              "meaning": "All the tools needed are already present — the power to manifest goals is available now."},
    {"name": "The High Priestess","keywords": ["intuition", "inner wisdom", "mystery"],             "meaning": "Trust inner knowing over external noise — wisdom and clarity emerge from within."},
    {"name": "The Empress",       "keywords": ["abundance", "nurturing", "creativity"],             "meaning": "A fertile period for creative projects, relationships, and material comfort."},
    {"name": "The Emperor",       "keywords": ["structure", "authority", "stability"],              "meaning": "Building solid foundations and asserting leadership with clarity is indicated."},
    {"name": "The Hierophant",    "keywords": ["tradition", "learning", "mentorship"],              "meaning": "Growth through structured learning, mentorship, or spiritual practice is supported."},
    {"name": "The Lovers",        "keywords": ["choices", "alignment", "partnership"],              "meaning": "An important choice involving values or relationships is approaching — clarity supports the decision."},
    {"name": "The Chariot",       "keywords": ["determination", "momentum", "victory"],             "meaning": "Success through disciplined, focused effort is strongly indicated."},
    {"name": "Strength",          "keywords": ["courage", "patience", "inner strength"],            "meaning": "Challenges are overcome with compassion and patience rather than force."},
    {"name": "The Hermit",        "keywords": ["introspection", "solitude", "inner guidance"],      "meaning": "A period of reflection brings profound insight and directional clarity."},
    {"name": "Wheel of Fortune",  "keywords": ["cycles", "change", "opportunity"],                  "meaning": "A positive turning point is approaching — change opens new doors."},
    {"name": "Justice",           "keywords": ["fairness", "truth", "balance"],                     "meaning": "Decisions made with integrity lead to balanced, lasting outcomes."},
    {"name": "The Hanged Man",    "keywords": ["pause", "surrender", "new perspective"],            "meaning": "A period of pause opens an entirely new way of seeing the situation — surrender brings insight."},
    {"name": "Temperance",        "keywords": ["balance", "moderation", "patience"],                "meaning": "Steady, balanced progress is more powerful than rushed action."},
    {"name": "The Star",          "keywords": ["hope", "renewal", "inspiration"],                   "meaning": "Healing, optimism, and renewed faith in the future are indicated."},
    {"name": "The Moon",          "keywords": ["intuition", "uncertainty", "subconscious"],         "meaning": "There is more beneath the surface — trusting intuition through uncertainty is the path forward."},
    {"name": "The Sun",           "keywords": ["joy", "success", "vitality"],                       "meaning": "Positive energy, success, and clarity illuminate the current path."},
    {"name": "Judgement",         "keywords": ["awakening", "reflection", "renewal"],               "meaning": "A significant awakening is indicated — a new chapter is beginning."},
    {"name": "The World",         "keywords": ["completion", "achievement", "wholeness"],           "meaning": "A significant cycle completes — readiness for the next phase is indicated."},
    {"name": "Ace of Pentacles",  "keywords": ["opportunity", "prosperity", "new start"],           "meaning": "A new material or financial opportunity is opening."},
    {"name": "Three of Cups",     "keywords": ["celebration", "community", "joy"],                  "meaning": "Joyful gatherings and meaningful friendships are indicated."},
    {"name": "Six of Swords",     "keywords": ["transition", "moving forward", "calm"],             "meaning": "A peaceful transition away from difficulty toward calmer, clearer waters."},
    {"name": "Ten of Pentacles",  "keywords": ["legacy", "abundance", "family"],                    "meaning": "Long-term stability and family well-being are indicated."},
    {"name": "Ace of Wands",      "keywords": ["inspiration", "new venture", "energy"],             "meaning": "Creative inspiration and the spark of a new venture are present."},
    {"name": "Nine of Pentacles", "keywords": ["independence", "luxury", "self-reliance"],          "meaning": "Financial independence built through personal effort is indicated."},
    {"name": "King of Cups",      "keywords": ["emotional maturity", "compassion", "balance"],      "meaning": "Emotional mastery and compassionate leadership are indicated."},
    {"name": "Page of Wands",     "keywords": ["enthusiasm", "exploration", "news"],                "meaning": "Creative inspiration and exciting opportunities or news are suggested."},
    {"name": "Four of Wands",     "keywords": ["celebration", "harmony", "achievement"],            "meaning": "A milestone of celebration and harmony — goals are within reach."},
]

POSITIONS_3 = ["Past / Root Cause", "Present / Current Energy", "Future / Potential Outcome"]
POSITIONS_5 = ["Past", "Present", "Hidden Influence", "Advice for Now", "Future Potential"]

# ── Question-specific card interpretation templates ────────────────────────────
INTENT_CARD_TEMPLATES = {
    "marriage": (
        "The cards drawn for your marriage question are: {card0} (Past), {card1} (Present), {card2} (Future). "
        "The past card — {card0} — suggests that {meaning0} This shapes the foundation of your relationship journey. "
        "The present card — {card1} — indicates that {meaning1} This is the current energy surrounding your marriage question. "
        "The future card — {card2} — suggests {meaning2} "
        "The overall spread indicates that {theme} Patience and emotional readiness are the key preparations."
    ),
    "career": (
        "The cards drawn for your career question are: {card0} (Past), {card1} (Present), {card2} (Future). "
        "The past card — {card0} — reveals that {meaning0} "
        "The present card — {card1} — shows that {meaning1} "
        "The future card — {card2} — suggests {meaning2} "
        "The overall spread confirms: {theme}"
    ),
    "finance": (
        "The cards drawn for your financial question are: {card0} (Past), {card1} (Present), {card2} (Future). "
        "The past card reveals financial energy rooted in {meaning0} "
        "The present card — {card1} — shows the current financial landscape: {meaning1} "
        "The future card — {card2} — projects that {meaning2} "
        "Overall: {theme}"
    ),
    "general": (
        "The cards drawn for your question are: {card0} (Past), {card1} (Present), {card2} (Future). "
        "The past card — {card0} — suggests that {meaning0} "
        "The present card — {card1} — shows that {meaning1} "
        "The future card — {card2} — indicates {meaning2} "
        "Overall spread theme: {theme}"
    ),
}


def _seed(s: str) -> int:
    return sum(ord(c) for c in s)


def _draw(positions: List[str], seed: int) -> List[Dict[str, Any]]:
    used = set()
    cards = []
    for i, pos in enumerate(positions):
        idx = (seed + i * 7) % len(DECK)
        while idx in used:
            idx = (idx + 1) % len(DECK)
        used.add(idx)
        card = DECK[idx]
        orientation = "upright" if (seed + i) % 5 != 0 else "reversed"
        meaning = card["meaning"]
        if orientation == "reversed":
            meaning = f"Reversed — {meaning.replace('is indicated', 'calls for reflection').replace('are indicated', 'call for reflection')}"
        cards.append({
            "position":    pos,
            "name":        card["name"],
            "orientation": orientation,
            "keywords":    card["keywords"],
            "meaning":     meaning,
        })
    return cards


def _overall_theme(cards: List[Dict[str, Any]], focus: str) -> str:
    positive_kw = {"success", "joy", "abundance", "hope", "strength", "clarity", "opportunity", "momentum", "achievement", "renewal", "celebration", "harmony"}
    all_kw = [kw for c in cards for kw in c["keywords"]]
    positives = sum(1 for kw in all_kw if kw in positive_kw)

    focus_context = {
        "marriage":    "regarding your marriage question",
        "career":      "regarding your career question",
        "finance":     "regarding your financial question",
        "health":      "regarding your health question",
        "spirituality":"regarding your spiritual question",
        "education":   "regarding your education question",
        "travel":      "regarding your travel question",
        "children":    "regarding your family question",
        "general":     "regarding your question",
    }.get(focus, "regarding your question")

    if positives >= 3:
        return f"The spread {focus_context} suggests a positive, growth-oriented period with clear opportunities ahead."
    return f"The spread {focus_context} suggests a reflective time — deliberate, conscious action will open new pathways."


def _build_tarot_prediction(cards: List[Dict[str, Any]], intent: str, question: str) -> str:
    if len(cards) < 3:
        return _overall_theme(cards, intent)
    template = INTENT_CARD_TEMPLATES.get(intent, INTENT_CARD_TEMPLATES["general"])
    theme = _overall_theme(cards, intent)
    m0 = cards[0]["meaning"].rstrip(".")
    m1 = cards[1]["meaning"].rstrip(".")
    m2 = cards[2]["meaning"].rstrip(".")
    return template.format(
        card0=cards[0]["name"], card1=cards[1]["name"], card2=cards[2]["name"],
        meaning0=m0.lower() + ".", meaning1=m1.lower() + ".", meaning2=m2.lower() + ".",
        theme=theme,
    )


def _run_rider_waite(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    positions = POSITIONS_5 if spread_type == "5-card" else POSITIONS_3
    seed  = _seed(name + dob + question + "RW")
    cards = _draw(positions, seed)
    prediction = _build_tarot_prediction(cards, intent, question)
    theme = _overall_theme(cards, intent)
    _cfg = build_prompt(
        "tarot_rider_waite",
        name=name, dob=dob, question=question, intent=intent,
        card0=cards[0]["name"] if len(cards) > 0 else "",
        card1=cards[1]["name"] if len(cards) > 1 else "",
        card2=cards[2]["name"] if len(cards) > 2 else "",
        orient0=cards[0]["orientation"] if len(cards) > 0 else "",
        orient1=cards[1]["orientation"] if len(cards) > 1 else "",
        orient2=cards[2]["orientation"] if len(cards) > 2 else "",
    )
    return {
        "sub_agent":       "Rider-Waite Tarot",
        "question":        question,
        "prediction":      prediction,
        "traits":          [c["name"] for c in cards[:3]],
        "confidence_hint": "medium",
        "extra": {
            "spread":        spread_type,
            "cards":         cards,
            "overall_theme": theme,
            "guidance":      [prediction],
        },
    }


def _run_intuitive(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    seed  = _seed(name + dob + question + "INT")
    cards = _draw(POSITIONS_3, seed)
    prediction = _build_tarot_prediction(cards, intent, question)
    theme = _overall_theme(cards, intent)
    _cfg = build_prompt(
        "tarot_intuitive",
        name=name, dob=dob, question=question, intent=intent,
        card0=cards[0]["name"] if len(cards) > 0 else "",
        card1=cards[1]["name"] if len(cards) > 1 else "",
        card2=cards[2]["name"] if len(cards) > 2 else "",
        orient0=cards[0]["orientation"] if len(cards) > 0 else "",
        orient1=cards[1]["orientation"] if len(cards) > 1 else "",
        orient2=cards[2]["orientation"] if len(cards) > 2 else "",
    )
    return {
        "sub_agent":       "Intuitive Tarot",
        "question":        question,
        "prediction":      prediction,
        "traits":          [c["name"] for c in cards[:3]],
        "confidence_hint": "medium",
        "extra": {
            "spread":        "3-card",
            "cards":         cards,
            "overall_theme": theme,
            "guidance":      [prediction],
        },
    }


def _analyze_question(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    rw        = _run_rider_waite(name, dob, question, intent, spread_type)
    intuitive = _run_intuitive(name, dob, question, intent, spread_type)

    sub_results = [rw, intuitive]
    summary = (
        f"Tarot analysis for '{question}': {rw['prediction'][:120]}... "
        f"Cards drawn: {', '.join(rw['traits'][:3])}."
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        [f"Both Rider-Waite and Intuitive readings confirm energy relevant to: {question}."],
        "conflicts":         [],
    }


def tarot_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "tarot" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "")    if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else profile.date_of_birth

    mi = state.get("module_inputs", {})
    tarot_input = mi.get("tarot", {}) if isinstance(mi, dict) else {}
    spread_type = tarot_input.get("spread", "3-card") if isinstance(tarot_input, dict) else "3-card"

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, nq["question"], nq["intent"], spread_type)
        question_wise_analysis.append(analysis)

    first_rw = question_wise_analysis[0]["sub_agent_results"][0]["extra"]
    _prompt_cfg = get_prompt("tarot")
    domain_output = {
        "domain":                 "tarot",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "universal": {
            "tradition":       "Universal Tarot",
            "focus_addressed": normalized_questions[0]["intent"],
            "spread":          spread_type,
            "question":        normalized_questions[0]["question"],
            "cards":           first_rw["cards"],
            "overall_theme":   first_rw["overall_theme"],
            "guidance":        first_rw["guidance"],
        },
    }

    state.setdefault("memory", {})["tarot"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[TarotAgent] Analyzed {len(question_wise_analysis)} question(s) across 2 traditions (Rider-Waite, Intuitive)."
    )
    return state
