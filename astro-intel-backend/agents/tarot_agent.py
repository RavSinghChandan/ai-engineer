"""
STEP 2d — Tarot Reading Agent
Draws a 3-card or 5-card spread; interprets relative to focus.
"""
from __future__ import annotations
from typing import Any, Dict, List

DECK: List[Dict[str, Any]] = [
    {"name":"The Fool",         "keywords":["new beginnings","adventure","potential"],         "meaning":"A fresh start is on the horizon — this suggests uninhibited exploration of new possibilities."},
    {"name":"The Magician",     "keywords":["willpower","skill","manifestation"],               "meaning":"All the tools needed are already present — this suggests the power to manifest goals."},
    {"name":"The High Priestess","keywords":["intuition","inner wisdom","mystery"],            "meaning":"Trust inner knowing over external noise — wisdom lies within."},
    {"name":"The Empress",      "keywords":["abundance","nurturing","creativity"],             "meaning":"A fertile period for creative projects, relationships, and material comfort."},
    {"name":"The Emperor",      "keywords":["structure","authority","stability"],              "meaning":"Building solid foundations and asserting leadership is indicated."},
    {"name":"The Hierophant",   "keywords":["tradition","learning","mentorship"],              "meaning":"Growth through structured learning, mentorship, or spiritual practice."},
    {"name":"The Lovers",       "keywords":["choices","alignment","partnership"],              "meaning":"An important choice involving values or relationships is approaching."},
    {"name":"The Chariot",      "keywords":["determination","momentum","victory"],             "meaning":"Success through disciplined, focused effort is suggested."},
    {"name":"Strength",         "keywords":["courage","patience","inner strength"],            "meaning":"Challenges are overcome gently, with compassion rather than force."},
    {"name":"The Hermit",       "keywords":["introspection","solitude","inner guidance"],      "meaning":"A period of reflection brings profound insight and clarity."},
    {"name":"Wheel of Fortune", "keywords":["cycles","change","opportunity"],                  "meaning":"A positive turning point — change is on the horizon."},
    {"name":"Justice",          "keywords":["fairness","truth","balance"],                     "meaning":"Decisions made with integrity lead to balanced outcomes."},
    {"name":"The Hanged Man",   "keywords":["pause","surrender","new perspective"],            "meaning":"A period of pause opens an entirely new way of seeing the situation."},
    {"name":"Temperance",       "keywords":["balance","moderation","patience"],                "meaning":"Steady, balanced progress is more powerful than rushed action."},
    {"name":"The Star",         "keywords":["hope","renewal","inspiration"],                   "meaning":"Healing, optimism, and renewed faith in the future are indicated."},
    {"name":"The Moon",         "keywords":["intuition","uncertainty","subconscious"],         "meaning":"There is more beneath the surface — trust intuition through uncertain times."},
    {"name":"The Sun",          "keywords":["joy","success","vitality"],                       "meaning":"Positive energy, success, and clarity illuminate the current path."},
    {"name":"Judgement",        "keywords":["awakening","reflection","renewal"],               "meaning":"A significant awakening is indicated — a new chapter is beginning."},
    {"name":"The World",        "keywords":["completion","achievement","wholeness"],           "meaning":"A significant cycle completes — readiness for the next phase is indicated."},
    {"name":"Ace of Pentacles", "keywords":["opportunity","prosperity","new start"],           "meaning":"A new material or financial opportunity is opening."},
    {"name":"Three of Cups",    "keywords":["celebration","community","joy"],                  "meaning":"Joyful gatherings and meaningful friendships are indicated."},
    {"name":"Six of Swords",    "keywords":["transition","moving forward","calm"],             "meaning":"A peaceful transition away from difficulty toward calmer waters."},
    {"name":"Ten of Pentacles", "keywords":["legacy","abundance","family"],                    "meaning":"Long-term stability and family well-being are indicated."},
    {"name":"Ace of Wands",     "keywords":["inspiration","new venture","energy"],             "meaning":"Creative inspiration and the spark of a new venture are present."},
    {"name":"Five of Cups",     "keywords":["grief","loss","regret"],                          "meaning":"Losses are acknowledged — there is still much worth appreciating."},
    {"name":"Nine of Pentacles","keywords":["independence","luxury","self-reliance"],          "meaning":"Financial independence and comfort built through personal effort are indicated."},
    {"name":"King of Cups",     "keywords":["emotional maturity","compassion","balance"],      "meaning":"Emotional mastery and compassionate leadership are indicated."},
    {"name":"Page of Wands",    "keywords":["enthusiasm","exploration","news"],                "meaning":"Creative inspiration and exciting news or opportunities are suggested."},
]

POSITIONS_3 = ["Past / Root Cause", "Present / Current Energy", "Future / Potential Outcome"]
POSITIONS_5 = ["Past", "Present", "Hidden Influence", "Advice for Now", "Future Potential"]

FOCUS_INTERPRETATIONS: Dict[str, str] = {
    "career":  "In the context of your career question: ",
    "finance": "In the context of your financial question: ",
    "marriage":"In the context of your relationship question: ",
    "health":  "In the context of your health question: ",
    "general": "In the context of your overall life question: ",
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
        prefix = FOCUS_INTERPRETATIONS.get("general","")
        meaning = card["meaning"]
        if orientation == "reversed":
            meaning = f"Reversed — {meaning.replace('is indicated','calls for reflection').replace('are indicated','call for reflection')}"
        cards.append({
            "position":    pos,
            "name":        card["name"],
            "orientation": orientation,
            "keywords":    card["keywords"],
            "meaning":     meaning,
        })
    return cards


def _overall_theme(cards: List[Dict[str, Any]], focus: str) -> str:
    positive_kw = {"success","joy","abundance","hope","strength","clarity","opportunity","momentum","achievement","renewal"}
    all_kw = [kw for c in cards for kw in c["keywords"]]
    positives = sum(1 for kw in all_kw if kw in positive_kw)
    prefix = FOCUS_INTERPRETATIONS.get(focus, FOCUS_INTERPRETATIONS["general"])
    if positives >= 3:
        return f"{prefix}the spread suggests a positive, growth-oriented period with opportunities for meaningful advancement."
    return f"{prefix}the spread suggests a reflective time — deliberate, conscious action will open new pathways."


def _guidance(cards: List[Dict[str, Any]], question: str, focus: str) -> List[str]:
    return [
        f"There is a tendency toward {cards[0]['keywords'][0]} shaping the current situation from its roots.",
        f"The present card — {cards[1]['name']} — suggests that {cards[1]['meaning'].lower().rstrip('.')} right now.",
        (f"The future card — {cards[2]['name']} — suggests {cards[2]['keywords'][1]} in the path ahead."
         if len(cards) > 2 else "Patience and consistent action guide toward the desired outcome."),
        "Trust the process — small, conscious steps create lasting transformation.",
    ]


def tarot_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "tarot" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name    = profile.get("full_name","") if isinstance(profile, dict) else profile.full_name
    dob     = profile.get("date_of_birth","") if isinstance(profile, dict) else profile.date_of_birth
    question = state.get("user_question","")
    focus    = state.get("focus_context",{}).get("intent","general")

    mi = state.get("module_inputs",{})
    tarot_input = mi.get("tarot",{}) if isinstance(mi,dict) else {}
    spread_type = (tarot_input.get("spread","3-card") if isinstance(tarot_input,dict) else "3-card")

    positions = POSITIONS_5 if spread_type == "5-card" else POSITIONS_3
    seed = _seed(name + dob + question)
    cards = _draw(positions, seed)

    result = {
        "tradition": "Universal Tarot",
        "focus_addressed": focus,
        "spread": spread_type,
        "question": question,
        "cards": cards,
        "overall_theme": _overall_theme(cards, focus),
        "guidance": _guidance(cards, question, focus),
    }

    state.setdefault("memory", {})["tarot"] = {"universal": result}
    state.setdefault("agent_log", []).append(
        f"[TarotAgent] {spread_type} spread drawn: {[c['name'] for c in cards]}"
    )
    return state
