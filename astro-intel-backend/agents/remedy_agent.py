"""
STEP 5 — Remedy Agent
Per-question remedies: habits, mantras, colors. No fear language.
Synthesizes insights from consolidated + memory.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt


PLANET_MANTRAS: Dict[str, Dict[str, Any]] = {
    "Sun":     {"mantra": "Om Hreem Suryaya Namah",                       "purpose": "Clarity, confidence, and vitality",                "count": 108},
    "Moon":    {"mantra": "Om Shreem Chandraya Namah",                    "purpose": "Emotional balance and peace of mind",              "count": 108},
    "Mars":    {"mantra": "Om Kraam Kreem Kraum Sah Bhaumaya Namah",     "purpose": "Courage, energy, and determination",               "count": 108},
    "Mercury": {"mantra": "Om Braam Breem Braum Sah Budhaya Namah",      "purpose": "Intelligence, communication, and clarity",         "count": 108},
    "Jupiter": {"mantra": "Om Graam Greem Graum Sah Gurave Namah",       "purpose": "Wisdom, prosperity, and blessings",               "count": 108},
    "Venus":   {"mantra": "Om Draam Dreem Draum Sah Shukraya Namah",     "purpose": "Love, beauty, and harmony",                       "count": 108},
    "Saturn":  {"mantra": "Om Praam Preem Praum Sah Shanaischaraya Namah","purpose": "Discipline and karmic balance",                   "count": 108},
    "Rahu":    {"mantra": "Om Raam Rahave Namah",                         "purpose": "Clarity of ambition and mental focus",            "count": 108},
    "Ketu":    {"mantra": "Om Sraam Sreem Sraum Sah Ketave Namah",       "purpose": "Spiritual insight and liberation",                "count": 108},
}

LAGNA_GEMSTONES: Dict[str, Dict[str, str]] = {
    "Aries":       {"stone": "Red Coral",                  "finger": "Ring finger, right hand", "purpose": "Mars energy — courage and vitality"},
    "Taurus":      {"stone": "Diamond or White Sapphire",  "finger": "Ring finger",             "purpose": "Venus energy — beauty and harmony"},
    "Gemini":      {"stone": "Emerald",                    "finger": "Little finger",           "purpose": "Mercury energy — intellect and communication"},
    "Cancer":      {"stone": "Pearl or Moonstone",         "finger": "Little finger",           "purpose": "Moon energy — emotional balance"},
    "Leo":         {"stone": "Ruby",                       "finger": "Ring finger, right hand", "purpose": "Sun energy — confidence and vitality"},
    "Virgo":       {"stone": "Emerald",                    "finger": "Little finger",           "purpose": "Mercury energy — clarity and health"},
    "Libra":       {"stone": "Diamond or Opal",            "finger": "Ring finger",             "purpose": "Venus energy — harmony and relationships"},
    "Scorpio":     {"stone": "Red Coral",                  "finger": "Ring finger",             "purpose": "Mars energy — transformation and strength"},
    "Sagittarius": {"stone": "Yellow Sapphire",            "finger": "Index finger",            "purpose": "Jupiter energy — wisdom and prosperity"},
    "Capricorn":   {"stone": "Blue Sapphire (after trial)","finger": "Middle finger",           "purpose": "Saturn energy — discipline and stability"},
    "Aquarius":    {"stone": "Blue Sapphire or Amethyst",  "finger": "Middle finger",           "purpose": "Saturn energy — innovation and clarity"},
    "Pisces":      {"stone": "Yellow Sapphire",            "finger": "Index finger",            "purpose": "Jupiter energy — spirituality and grace"},
}

FOCUS_HABITS: Dict[str, List[str]] = {
    "career": [
        "Begin each workday with 5 minutes of intention-setting — write your top goal for the day.",
        "Keep your workspace clean and organized — a clear environment supports a clear mind.",
        "Dedicate focused, uninterrupted time to your most important task daily.",
        "Invest in one meaningful professional connection per week — relationships compound over time.",
    ],
    "finance": [
        "Track every expense for 30 days — awareness is the foundation of financial growth.",
        "Set up automatic savings on the 1st of each month — even a small amount builds momentum.",
        "Study one financial concept per week — knowledge compounds like interest.",
        "Pause 48 hours before making major financial decisions — clarity follows reflection.",
    ],
    "marriage": [
        "Practice active, judgment-free listening in all important conversations.",
        "Express one genuine appreciation to your partner daily — small acts sustain deep bonds.",
        "Create weekly connection time without screens or distractions.",
        "Work on your own inner growth — a fulfilled individual brings more to a relationship.",
    ],
    "health": [
        "Begin with 20 minutes of morning sunlight — this supports circadian rhythm and mood.",
        "Eat your largest meal before 2 PM — digestive strength is highest during midday.",
        "Aim for 7–8 hours of sleep — recovery is when transformation happens.",
        "Walk 30 minutes daily — a consistently underrated longevity and mental clarity practice.",
    ],
    "spirituality": [
        "Practice 10 minutes of silent sitting each morning before engaging with any screen.",
        "Keep a spiritual journal — write reflections, dreams, and gratitude nightly.",
        "Spend time in nature weekly — reconnecting with natural cycles grounds spiritual energy.",
        "Fast one meal per week as an act of voluntary discipline and gratitude.",
    ],
    "education": [
        "Study in 50-minute focused blocks — then take a 10-minute break (Pomodoro method).",
        "Review notes within 24 hours of learning — spaced repetition dramatically improves retention.",
        "Find a study partner or mentor — teaching what you learn reinforces mastery.",
        "Maintain a regular sleep schedule during exam periods — rest anchors learning.",
    ],
    "travel": [
        "Begin travel planning 3–6 months in advance — early preparation reduces friction.",
        "Learn basic phrases of your destination language — it opens doors and hearts.",
        "Keep travel documents organized and accessible — avoid last-minute stress.",
        "Journal your travels — writing anchors experiences and generates gratitude.",
    ],
    "children": [
        "Create consistent daily rituals with your child — predictability builds security.",
        "Practice active, curious listening with children — validate before advising.",
        "Limit screen time for both yourself and children — quality time builds stronger bonds.",
        "Read together daily — even 15 minutes of shared reading deepens connection.",
    ],
    "general": [
        "Begin each morning with 10 minutes of mindful breathing.",
        "Spend 20 minutes in natural sunlight daily.",
        "Keep a gratitude journal — write 3 things you appreciate each evening.",
        "Hydrate well — 8 glasses of water daily supports physical vitality and mental clarity.",
    ],
}

FOCUS_COLORS: Dict[str, List[str]] = {
    "career":      ["Royal Blue", "Gold", "White"],
    "finance":     ["Green", "Gold", "Yellow"],
    "marriage":    ["Rose Pink", "Ivory", "Lavender"],
    "health":      ["Green", "White", "Sky Blue"],
    "spirituality":["Violet", "White", "Indigo"],
    "education":   ["Yellow", "Green", "White"],
    "travel":      ["Orange", "Blue", "White"],
    "children":    ["Soft Yellow", "Green", "White"],
    "general":     ["Gold", "White", "Green"],
}

FOCUS_BEHAVIORAL: Dict[str, List[str]] = {
    "career": [
        "There is a tendency toward overwork — schedule 'no-work zones' to protect creative energy.",
        "Speak with confidence in professional settings — your ideas have more value than you may realize.",
        "Avoid comparing your journey to others — focus on your own trajectory.",
    ],
    "finance": [
        "Avoid reactive financial decisions — pause and consult trusted advisors before major moves.",
        "Practice saying no to non-essential expenses — financial freedom is built on disciplined choices.",
        "Celebrate financial milestones — positive reinforcement builds lasting habits.",
    ],
    "marriage": [
        "Practice active listening — seek to understand before being understood.",
        "Pause before reacting in moments of conflict — breathe, then respond thoughtfully.",
        "Work on your own inner healing — a whole person attracts a healthy partnership.",
    ],
    "health": [
        "Move your body for joy, not punishment — find activities you genuinely enjoy.",
        "Schedule regular health check-ups — prevention is far easier than cure.",
        "Monitor stress levels — emotional patterns often surface in physical symptoms first.",
    ],
    "spirituality": [
        "Practice consistency over intensity — a small daily practice yields more than occasional intensity.",
        "Approach your inner life with curiosity, not judgment — growth follows acceptance.",
        "Share your insights with others — teaching deepens your own understanding.",
    ],
    "general": [
        "There is a tendency toward overwork — intentional rest is as important as action.",
        "Practice active listening in relationships — this strengthens all bonds.",
        "Pause before reactive decisions — wait 24 hours when emotions are elevated.",
    ],
}


def _yoga_for_focus(focus: str, lagna: str) -> List[str]:
    base = [
        "Surya Namaskar (12 rounds each morning) — aligns body and mind with solar energy.",
        "Pranayama — Anulom Vilom (10 minutes) for left-right brain balance.",
        "Mindfulness meditation (10 minutes before bed) — improves sleep quality.",
    ]
    focus_yoga = {
        "career":      ["Warrior Pose (Virabhadrasana) — builds confidence and determination."],
        "finance":     ["Mountain Pose (Tadasana) — grounding and stability for clear thinking."],
        "marriage":    ["Camel Pose (Ustrasana) — opens the heart space for deeper connection."],
        "health":      ["Child's Pose (Balasana) — deeply restorative for physical and nervous system health."],
        "spirituality":["Lotus Pose (Padmasana) — the classic posture for inner stillness."],
        "education":   ["Eagle Pose (Garudasana) — builds focus and concentration."],
    }
    return focus_yoga.get(focus, []) + base[:3]


def _build_question_remedies(question: str, intent: str, lagna: str, dasha_planet: str, memory: Dict) -> Dict[str, Any]:
    habits    = FOCUS_HABITS.get(intent, FOCUS_HABITS["general"])
    colors    = FOCUS_COLORS.get(intent, FOCUS_COLORS["general"])[:]

    # Add numerology lucky colors
    num = memory.get("numerology", {})
    for trad in ["indian", "chaldean", "pythagorean"]:
        lc = num.get(trad, {}).get("lucky_colors", [])
        if lc:
            colors.extend(lc)
            break

    mantras = [
        {"mantra": "Om Namah Shivaya", "purpose": "Overall well-being, protection, and inner peace", "count": 108},
        {"mantra": "Gayatri Mantra — Om Bhur Bhuvaḥ Svaḥ...", "purpose": "Wisdom, divine light, and clarity of mind", "count": 21},
    ]
    if dasha_planet in PLANET_MANTRAS:
        mantras.insert(0, PLANET_MANTRAS[dasha_planet])

    return {
        "question": question,
        "intent":   intent,
        "habits":   habits,
        "mantras":  mantras[:3],
        "colors":   list(dict.fromkeys(colors))[:5],
    }


def remedy_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    memory       = state.get("memory", {})
    focus        = state.get("focus_context", {}).get("intent", "general")
    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        q = state.get("user_question", "")
        normalized_questions = [{"question": q or "General life overview.", "intent": focus, "index": 0}]

    # Extract lagna and dasha planet from astrology memory
    lagna, dasha_planet = "", "Jupiter"
    astro = memory.get("astrology", {})
    vedic_data = astro.get("vedic", {})
    if vedic_data:
        lagna        = vedic_data.get("chart", {}).get("lagna", "")
        dasha_planet = vedic_data.get("dasha_planet", "Jupiter") or "Jupiter"

    # Collect colors from numerology and vastu for primary focus
    all_colors = FOCUS_COLORS.get(focus, FOCUS_COLORS["general"])[:]
    num = memory.get("numerology", {})
    for trad in ["indian", "chaldean", "pythagorean"]:
        lc = num.get(trad, {}).get("lucky_colors", [])
        if lc:
            all_colors.extend(lc)
            break
    vastu = memory.get("vastu", {})
    vedic_vastu = vastu.get("vedic", {})
    if vedic_vastu:
        all_colors.extend(vedic_vastu.get("colors_recommended", []))
    unique_colors = list(dict.fromkeys(all_colors))[:6]

    # Primary mantras
    mantras = [
        {"mantra": "Om Namah Shivaya", "purpose": "Overall well-being, protection, and inner peace", "count": 108},
        {"mantra": "Gayatri Mantra — Om Bhur Bhuvaḥ Svaḥ Tat Savitur Varenyam...", "purpose": "Wisdom, divine light, and clarity of mind", "count": 21},
    ]
    if dasha_planet in PLANET_MANTRAS:
        mantras.insert(0, PLANET_MANTRAS[dasha_planet])

    # Gemstones
    gemstones = []
    if lagna and lagna in LAGNA_GEMSTONES:
        gemstones.append(LAGNA_GEMSTONES[lagna])
    gemstones.append({"stone": "Clear Quartz",  "finger": "Any finger or pendant", "purpose": "General amplification of positive intention"})
    gemstones.append({"stone": "Moonstone",     "finger": "Little finger or pendant", "purpose": "Emotional balance and intuitive clarity"})

    # Fasting day
    fasting_map = {
        "Aries": "Tuesday", "Taurus": "Friday", "Gemini": "Wednesday", "Cancer": "Monday",
        "Leo": "Sunday", "Virgo": "Wednesday", "Libra": "Friday", "Scorpio": "Tuesday",
        "Sagittarius": "Thursday", "Capricorn": "Saturday", "Aquarius": "Saturday", "Pisces": "Thursday",
    }
    fasting_day = fasting_map.get(lagna, "Thursday")

    # Per-question remedies
    question_remedies = [
        _build_question_remedies(nq["question"], nq["intent"], lagna, dasha_planet, memory)
        for nq in normalized_questions
    ]

    remedies = {
        "focus_addressed":        focus,
        "daily_habits":           FOCUS_HABITS.get(focus, FOCUS_HABITS["general"]),
        "mantras":                mantras,
        "colors":                 unique_colors,
        "gemstones":              gemstones,
        "fasting": [
            f"{fasting_day} fasting is aligned with your lagna planet — light sattvic meals or fruit are ideal.",
            "Fasting with gratitude — not rigidity — carries the greatest benefit.",
        ],
        "charity": [
            f"Donate food, clothing, or essentials on {fasting_day}s — aligned with your lagna ruling planet.",
            "Support education-related causes — this strengthens Jupiter's blessings.",
            "Acts of anonymous charity carry the greatest karmic benefit.",
        ],
        "behavioral_adjustments": FOCUS_BEHAVIORAL.get(focus, FOCUS_BEHAVIORAL["general"]),
        "yoga_meditation":        _yoga_for_focus(focus, lagna),
        "vastu_remedies": (
            vedic_vastu.get("corrections", [])[:4] if vedic_vastu else []
        ),
        "question_remedies":      question_remedies,
    }

    name = profile.get("full_name", "") if isinstance(profile := state.get("user_profile", {}), dict) else getattr(profile, "full_name", "")
    lp_num = 0
    num_mem = state.get("memory", {}).get("numerology", {})
    for trad in ["indian", "chaldean", "pythagorean"]:
        lp_num = num_mem.get(trad, {}).get("core_numbers", {}).get("life_path", 0)
        if lp_num:
            break
    for nq in normalized_questions:
        build_prompt(
            "remedy",
            name=name, lagna=lagna, dasha=dasha_planet,
            question=nq["question"], intent=nq["intent"], lp=lp_num,
        )

    state["remedies"] = remedies
    state.setdefault("agent_log", []).append(
        f"[RemedyAgent] Remedies synthesized for {len(normalized_questions)} question(s). focus={focus}, lagna={lagna}, dasha={dasha_planet}."
    )
    return state
