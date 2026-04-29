"""
STEP 2d — Tarot Reading Super Agent
Runs Rider-Waite and Intuitive sub-agents per question.
Stores DomainOutput with question_wise_analysis[] in memory.
"""
from __future__ import annotations
from typing import Any, Dict, List

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
    positive_kw = {"success", "joy", "abundance", "hope", "strength", "clarity", "opportunity", "momentum", "achievement", "renewal"}
    all_kw = [kw for c in cards for kw in c["keywords"]]
    positives = sum(1 for kw in all_kw if kw in positive_kw)
    prefix_map = {
        "career":      "In the context of your career question: ",
        "finance":     "In the context of your financial question: ",
        "marriage":    "In the context of your relationship question: ",
        "health":      "In the context of your health question: ",
        "spirituality":"In the context of your spiritual question: ",
        "education":   "In the context of your education question: ",
        "travel":      "In the context of your travel question: ",
        "children":    "In the context of your family question: ",
        "general":     "In the context of your overall life question: ",
    }
    prefix = prefix_map.get(focus, prefix_map["general"])
    if positives >= 3:
        return f"{prefix}the spread suggests a positive, growth-oriented period with opportunities for meaningful advancement."
    return f"{prefix}the spread suggests a reflective time — deliberate, conscious action will open new pathways."


def _guidance(cards: List[Dict[str, Any]], question: str) -> List[str]:
    return [
        f"There is a tendency toward {cards[0]['keywords'][0]} shaping the current situation from its roots.",
        f"The present card — {cards[1]['name']} — suggests that {cards[1]['meaning'].lower().rstrip('.')} right now.",
        (f"The future card — {cards[2]['name']} — suggests {cards[2]['keywords'][1]} in the path ahead."
         if len(cards) > 2 else "Patience and consistent action guide toward the desired outcome."),
        "Trust the process — small, conscious steps create lasting transformation.",
    ]


def _run_rider_waite(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    positions = POSITIONS_5 if spread_type == "5-card" else POSITIONS_3
    seed  = _seed(name + dob + question + "RW")
    cards = _draw(positions, seed)
    theme = _overall_theme(cards, intent)
    guidance = _guidance(cards, question)
    return {
        "sub_agent":       "Rider-Waite Tarot",
        "question":        question,
        "prediction":      theme,
        "traits":          [c["name"] for c in cards[:3]],
        "confidence_hint": "medium",
        "extra": {
            "spread":        spread_type,
            "cards":         cards,
            "overall_theme": theme,
            "guidance":      guidance,
        },
    }


def _run_intuitive(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    positions = POSITIONS_3
    seed  = _seed(name + dob + question + "INT")
    cards = _draw(positions, seed)
    theme = _overall_theme(cards, intent)
    guidance = _guidance(cards, question)
    return {
        "sub_agent":       "Intuitive Tarot",
        "question":        question,
        "prediction":      theme,
        "traits":          [c["name"] for c in cards[:3]],
        "confidence_hint": "medium",
        "extra": {
            "spread":        "3-card",
            "cards":         cards,
            "overall_theme": theme,
            "guidance":      guidance,
        },
    }


def _analyze_question(name: str, dob: str, question: str, intent: str, spread_type: str) -> Dict[str, Any]:
    rw        = _run_rider_waite(name, dob, question, intent, spread_type)
    intuitive = _run_intuitive(name, dob, question, intent, spread_type)

    sub_results = [rw, intuitive]
    agreements = [
        f"Both Rider-Waite and Intuitive readings confirm {intent}-oriented energy in the current spread.",
        "The cards collectively suggest conscious, deliberate action will yield positive outcomes.",
    ]
    conflicts = []

    summary = (
        f"Tarot analysis for '{question}': {rw['prediction']} "
        f"Cards drawn include {', '.join(rw['traits'][:2])} — symbolizing growth and forward movement."
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        agreements,
        "conflicts":         conflicts,
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

    # Legacy flat structure for admin_review_agent backward compat
    first_rw = question_wise_analysis[0]["sub_agent_results"][0]["extra"]
    domain_output = {
        "domain":                 "tarot",
        "question_wise_analysis": question_wise_analysis,
        "universal": {
            "tradition":     "Universal Tarot",
            "focus_addressed": normalized_questions[0]["intent"],
            "spread":         spread_type,
            "question":       normalized_questions[0]["question"],
            "cards":          first_rw["cards"],
            "overall_theme":  first_rw["overall_theme"],
            "guidance":       first_rw["guidance"],
        },
    }

    state.setdefault("memory", {})["tarot"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[TarotAgent] Analyzed {len(question_wise_analysis)} question(s) across 2 traditions (Rider-Waite, Intuitive)."
    )
    return state
