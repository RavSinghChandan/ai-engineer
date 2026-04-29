"""
STEP 5 — Remedy Agent
Synthesizes all consolidated insights + user question → safe, warm remedies.
"""
from __future__ import annotations
from typing import Any, Dict, List


PLANET_MANTRAS: Dict[str, Dict[str, Any]] = {
    "Sun":     {"mantra": "Om Hreem Suryaya Namah",              "purpose": "Clarity, confidence, and vitality",          "count": 108},
    "Moon":    {"mantra": "Om Shreem Chandraya Namah",           "purpose": "Emotional balance and peace of mind",         "count": 108},
    "Mars":    {"mantra": "Om Kraam Kreem Kraum Sah Bhaumaya Namah", "purpose": "Courage, energy, and drive",             "count": 108},
    "Mercury": {"mantra": "Om Braam Breem Braum Sah Budhaya Namah",  "purpose": "Intelligence, communication, and wit",   "count": 108},
    "Jupiter": {"mantra": "Om Graam Greem Graum Sah Gurave Namah",   "purpose": "Wisdom, prosperity, and blessings",      "count": 108},
    "Venus":   {"mantra": "Om Draam Dreem Draum Sah Shukraya Namah", "purpose": "Love, beauty, and harmony",              "count": 108},
    "Saturn":  {"mantra": "Om Praam Preem Praum Sah Shanaischaraya Namah", "purpose": "Discipline and karmic balance",    "count": 108},
    "Rahu":    {"mantra": "Om Raam Rahave Namah",                "purpose": "Clarity of ambition and mental focus",       "count": 108},
    "Ketu":    {"mantra": "Om Sraam Sreem Sraum Sah Ketave Namah", "purpose": "Spiritual insight and liberation",         "count": 108},
}

LAGNA_GEMSTONES: Dict[str, Dict[str, str]] = {
    "Aries":      {"stone":"Red Coral","finger":"Ring finger, right hand","purpose":"Mars energy — courage and vitality"},
    "Taurus":     {"stone":"Diamond or White Sapphire","finger":"Ring finger","purpose":"Venus energy — beauty and harmony"},
    "Gemini":     {"stone":"Emerald","finger":"Little finger","purpose":"Mercury energy — intellect and communication"},
    "Cancer":     {"stone":"Pearl or Moonstone","finger":"Little finger","purpose":"Moon energy — emotional balance"},
    "Leo":        {"stone":"Ruby","finger":"Ring finger, right hand","purpose":"Sun energy — confidence and vitality"},
    "Virgo":      {"stone":"Emerald","finger":"Little finger","purpose":"Mercury energy — clarity and health"},
    "Libra":      {"stone":"Diamond or Opal","finger":"Ring finger","purpose":"Venus energy — harmony and relationships"},
    "Scorpio":    {"stone":"Red Coral","finger":"Ring finger","purpose":"Mars energy — transformation and strength"},
    "Sagittarius":{"stone":"Yellow Sapphire","finger":"Index finger","purpose":"Jupiter energy — wisdom and prosperity"},
    "Capricorn":  {"stone":"Blue Sapphire (after trial)","finger":"Middle finger","purpose":"Saturn energy — discipline and stability"},
    "Aquarius":   {"stone":"Blue Sapphire or Amethyst","finger":"Middle finger","purpose":"Saturn energy — innovation and clarity"},
    "Pisces":     {"stone":"Yellow Sapphire","finger":"Index finger","purpose":"Jupiter energy — spirituality and grace"},
}

FOCUS_HABITS: Dict[str, List[str]] = {
    "career": [
        "Begin each workday with 5 minutes of intention-setting — write your top goal for the day.",
        "Keep your workspace clean and organized — a clutter-free desk reflects a clear mind.",
        "Practice the 'one deep thing' rule — dedicate focused, uninterrupted time to your most important task daily.",
        "Network with intention — one meaningful professional conversation per week compounds over time.",
    ],
    "finance": [
        "Track every expense for 30 days — awareness is the foundation of financial growth.",
        "Set up automatic savings on the 1st of every month — even a small amount builds momentum.",
        "Study one financial concept per week — knowledge compounds like interest.",
        "Avoid making major financial decisions under emotional stress — wait 48 hours.",
    ],
    "marriage": [
        "Practice active, judgment-free listening in all important conversations.",
        "Express one genuine appreciation to your partner (or a potential partner) daily.",
        "Create weekly 'connection time' without phones or screens.",
        "Work on yourself first — a fulfilled individual brings more to a relationship.",
    ],
    "health": [
        "Begin with 20 minutes of morning sunlight — this regulates circadian rhythm and boosts mood.",
        "Eat your largest meal before 2 PM — digestive strength is highest during midday.",
        "Aim for 7–8 hours of sleep — recovery is when transformation happens.",
        "Walk for 30 minutes daily — this is the most underrated longevity practice.",
    ],
    "spirituality": [
        "Practice 10 minutes of silent sitting each morning before engaging with any screen.",
        "Keep a spiritual journal — write reflections, dreams, and gratitude nightly.",
        "Fast one meal per week as an act of voluntary discipline and gratitude.",
        "Spend time in nature weekly — reconnecting with natural cycles grounds spiritual energy.",
    ],
    "general": [
        "Begin each morning with 10 minutes of mindful breathing.",
        "Spend 20 minutes in natural sunlight daily.",
        "Keep a gratitude journal — write 3 things you appreciate each evening.",
        "Hydrate well — 8 glasses of water daily supports physical vitality.",
        "Avoid heavy meals after sunset — light dinners support better sleep.",
    ],
}

FOCUS_COLORS: Dict[str, List[str]] = {
    "career":      ["Royal Blue","Gold","White"],
    "finance":     ["Green","Gold","Yellow"],
    "marriage":    ["Rose Pink","Ivory","Lavender"],
    "health":      ["Green","White","Sky Blue"],
    "spirituality":["Violet","White","Indigo"],
    "general":     ["Gold","White","Green"],
}

FOCUS_BEHAVIORAL: Dict[str, List[str]] = {
    "career": [
        "There is a tendency toward overwork — schedule 'no-work zones' to protect creative energy.",
        "Speak with confidence in professional settings — your ideas have more value than you realize.",
        "Avoid comparing your chapter 1 to someone else's chapter 10.",
    ],
    "finance": [
        "Avoid reactive financial decisions — consult trusted advisors before major moves.",
        "Practice saying 'no' to non-essential expenses — freedom is built on disciplined choices.",
        "Celebrate financial milestones — positive reinforcement builds lasting habits.",
    ],
    "marriage": [
        "Practice active listening — seek to understand before being understood.",
        "Avoid reactive words in moments of conflict — pause, breathe, then respond.",
        "Work on your own healing — a healed person attracts a healthy partnership.",
    ],
    "health": [
        "Move your body for joy, not punishment — find activities you genuinely enjoy.",
        "Schedule regular health check-ups — prevention is far easier than cure.",
        "Monitor stress levels — emotional stress often precedes physical symptoms.",
    ],
    "general": [
        "There is a tendency toward overwork — intentional rest is as important as action.",
        "Practice active listening in relationships — this strengthens all bonds.",
        "Avoid reactive decisions during emotional highs or lows — wait 24 hours.",
        "Speak with gratitude daily — this improves personal energy and relationships.",
    ],
}


def _yoga_for_focus(focus: str, lagna: str) -> List[str]:
    base = [
        "Surya Namaskar (12 rounds each morning) — aligns body and mind with solar energy.",
        "Pranayama — Anulom Vilom (10 minutes) for left-right brain balance.",
        "Shavasana — 5 minutes of full-body relaxation after any practice restores the nervous system.",
        "Mindfulness meditation (10 minutes before bed) — improves sleep quality and reduces anxiety.",
    ]
    focus_yoga = {
        "career":  ["Warrior Pose (Virabhadrasana) — builds confidence and determination."],
        "finance": ["Mountain Pose (Tadasana) — grounding and stability for clear financial thinking."],
        "marriage":["Heart-opening poses like Camel (Ustrasana) — opens the heart chakra."],
        "health":  ["Child's Pose (Balasana) — deeply restorative for physical and nervous system health."],
        "spirituality":["Lotus Pose (Padmasana) — the classic meditation posture for inner stillness."],
    }
    return focus_yoga.get(focus, []) + base[:3]


def remedy_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    consolidated = state.get("consolidated", {})
    memory       = state.get("memory", {})
    focus        = state.get("focus_context", {}).get("intent", "general")

    # Get lagna from astrology
    lagna = ""
    if "astrology" in memory:
        for data in memory["astrology"].values():
            lagna = data.get("chart", {}).get("lagna", "")
            break

    # Get dasha planet
    dasha_planet = ""
    if "astrology" in memory:
        for data in memory["astrology"].values():
            dasha_planet = data.get("dasha_planet", "Jupiter")
            break

    # Collect colors from all sources
    all_colors = FOCUS_COLORS.get(focus, FOCUS_COLORS["general"])[:]
    if "numerology" in memory:
        for trad, data in memory["numerology"].items():
            all_colors.extend(data.get("lucky_colors", []))
            break
    if "vastu" in memory:
        for data in memory["vastu"].values():
            all_colors.extend(data.get("colors_recommended", []))
            break
    unique_colors = list(dict.fromkeys(all_colors))[:6]

    # Mantras
    mantras = [
        {"mantra": "Om Namah Shivaya", "purpose": "Overall well-being, protection, and inner peace", "count": 108},
        {"mantra": "Gayatri Mantra — Om Bhur Bhuvaḥ Svaḥ Tat Savitur Varenyam...", "purpose": "Wisdom, divine light, and clarity of mind", "count": 21},
    ]
    if dasha_planet and dasha_planet in PLANET_MANTRAS:
        mantras.insert(0, PLANET_MANTRAS[dasha_planet])

    # Gemstones
    gemstones = []
    if lagna and lagna in LAGNA_GEMSTONES:
        gemstones.append(LAGNA_GEMSTONES[lagna])
    gemstones.append({"stone": "Clear Quartz", "finger": "Any finger or worn as pendant", "purpose": "General amplification of positive intention"})
    gemstones.append({"stone": "Moonstone", "finger": "Little finger or pendant", "purpose": "Emotional balance and intuitive clarity"})

    # Fasting
    fasting_map = {
        "Aries":"Tuesday","Taurus":"Friday","Gemini":"Wednesday","Cancer":"Monday",
        "Leo":"Sunday","Virgo":"Wednesday","Libra":"Friday","Scorpio":"Tuesday",
        "Sagittarius":"Thursday","Capricorn":"Saturday","Aquarius":"Saturday","Pisces":"Thursday"
    }
    fasting_day = fasting_map.get(lagna,"Thursday")
    fasting = [
        f"{fasting_day} fasting is aligned with your lagna planet — light sattvic meals or fruit are sufficient.",
        "Fasting with gratitude — not rigidity — carries the greatest benefit.",
    ]

    remedies = {
        "focus_addressed":        focus,
        "daily_habits":           FOCUS_HABITS.get(focus, FOCUS_HABITS["general"]),
        "mantras":                mantras,
        "colors":                 unique_colors,
        "gemstones":              gemstones,
        "fasting":                fasting,
        "charity": [
            f"Donate food, clothing, or essentials on {fasting_day}s — aligned with your lagna ruling planet.",
            "Support education-related causes — this strengthens Jupiter's blessings.",
            "Acts of anonymous charity carry the greatest karmic benefit.",
        ],
        "behavioral_adjustments": FOCUS_BEHAVIORAL.get(focus, FOCUS_BEHAVIORAL["general"]),
        "yoga_meditation":        _yoga_for_focus(focus, lagna),
        "vastu_remedies": (
            [c for d in memory.get("vastu",{}).values() for c in d.get("corrections",[])][:4]
            if "vastu" in memory else []
        ),
    }

    state["remedies"] = remedies
    state.setdefault("agent_log", []).append(
        f"[RemedyAgent] Remedies synthesized for focus={focus}, lagna={lagna}, dasha={dasha_planet}."
    )
    return state
