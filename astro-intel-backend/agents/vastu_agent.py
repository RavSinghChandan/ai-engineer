"""
STEP 2e — Vastu Shastra Super Agent
Runs Traditional Vastu and Modern Vastu sub-agents per question.
Stores DomainOutput with question_wise_analysis[] in memory.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt

DIRECTION_ENERGY: Dict[str, str] = {
    "north":     "North (Kubera) carries prosperity and career energy — highly auspicious for work and finance.",
    "northeast":  "Northeast (Eeshaan) is the most spiritually potent direction — ideal for meditation and learning.",
    "east":      "East (Indra) brings solar vitality and health — excellent for morning routines and health-focused spaces.",
    "southeast":  "Southeast (Agni) carries fire energy — creative and ambitious, requires balance.",
    "south":     "South (Yama) represents discipline and strength — suitable for master bedrooms with proper remedies.",
    "southwest":  "Southwest (Nairuti) governs stability and grounding — excellent for main family spaces.",
    "west":      "West (Varuna) carries water energy — suited for gains, children's spaces, and social areas.",
    "northwest":  "Northwest (Vayu) represents movement and social connections — excellent for guest spaces.",
}

ZONE_ANALYSIS: Dict[str, str] = {
    "North Zone (Kubera — Wealth)":       "Keep clutter-free and light — a small water feature or blue items enhance this zone.",
    "Northeast Zone (Eeshaan — Spirit)":  "Ideal for prayer or meditation — keep clean, minimalist, and well-lit.",
    "East Zone (Indra — Health)":         "Ensure good windows for morning sunlight — promotes vitality and optimism.",
    "Southeast Zone (Agni — Fire)":       "Ideal for kitchen — avoid bedroom placement in this zone.",
    "South Zone (Yama — Discipline)":     "Suitable for storage and heavy objects — avoid main entrance here.",
    "Southwest Zone (Nairuti — Stability)":"Ideal for master bedroom — keeps the head of family anchored.",
    "West Zone (Varuna — Gains)":         "Suitable for living room and children's study areas.",
    "Northwest Zone (Vayu — Movement)":   "Good for guest room or vehicle parking — supports movement energy.",
    "Brahmasthan (Centre)":               "CRITICAL — keep fully open and clutter-free. This is the energy heart of the home.",
}

DIRECTION_COLORS: Dict[str, List[str]] = {
    "north":    ["Blue", "Green", "White"],
    "northeast":["White", "Light Yellow", "Cream"],
    "east":     ["Green", "White", "Light Blue"],
    "southeast":["Orange", "Yellow", "Red (accent)"],
    "south":    ["Red", "Pink", "Coral"],
    "southwest":["Yellow", "Earthy Brown", "Peach"],
    "west":     ["White", "Grey", "Blue"],
    "northwest":["Grey", "White", "Silver"],
}

FOCUS_VASTU_ZONES: Dict[str, List[str]] = {
    "career":      ["North Zone (Kubera — Wealth)", "East Zone (Indra — Health)"],
    "finance":     ["North Zone (Kubera — Wealth)", "West Zone (Varuna — Gains)"],
    "marriage":    ["Southwest Zone (Nairuti — Stability)", "West Zone (Varuna — Gains)"],
    "health":      ["East Zone (Indra — Health)", "Northeast Zone (Eeshaan — Spirit)"],
    "spirituality":["Northeast Zone (Eeshaan — Spirit)", "Brahmasthan (Centre)"],
    "education":   ["Northeast Zone (Eeshaan — Spirit)", "North Zone (Kubera — Wealth)"],
    "travel":      ["Northwest Zone (Vayu — Movement)", "North Zone (Kubera — Wealth)"],
    "children":    ["West Zone (Varuna — Gains)", "Southwest Zone (Nairuti — Stability)"],
    "general":     list(ZONE_ANALYSIS.keys()),
}

FOCUS_CORRECTIONS: Dict[str, List[str]] = {
    "career":      ["Place a laughing Buddha or Kubera yantra in the North zone for career activation.",
                    "Keep your work desk facing East or North — enhances focus and productivity."],
    "finance":     ["Place a money plant in a green pot in the North zone.",
                    "Keep the North wall free of heavy shelving or dark objects."],
    "marriage":    ["Place rose quartz crystals in the Southwest zone of the bedroom.",
                    "Use soft pink or rose-colored furnishings in the bedroom to activate Venus energy."],
    "health":      ["Keep the East zone open with maximum morning light.",
                    "Place healing plants (aloe vera, tulsi) in the East zone."],
    "spirituality":["Create a dedicated prayer space in the Northeast corner.",
                    "Use white or light yellow in the Northeast — avoid dark colors here."],
    "education":   ["Keep the Northeast zone free of heavy furniture — it enhances learning and concentration.",
                    "Place books and study materials in the North or Northeast."],
    "travel":      ["Activate the Northwest zone with a metal wind chime to support movement energy.",
                    "Keep travel documents and luggage in the Northwest zone."],
    "children":    ["Ensure the West zone is bright and welcoming — it supports children's growth.",
                    "Avoid heavy furniture over the West zone — allow free energy flow."],
    "general":     [],
}

BASE_CORRECTIONS = [
    "Place a small indoor money plant or tulsi in the North or Northeast zone.",
    "Hang a Vastu pyramid or clear quartz crystal in the Brahmasthan to enhance central energy.",
    "Use a metal wind chime in the Northwest to activate air element energy.",
    "Ensure the main entrance is well-lit, welcoming, and free from obstructions.",
]


def _run_traditional_vastu(facing: str, prop_type: str, question: str, intent: str, name: str = "") -> Dict[str, Any]:
    priority_zones = FOCUS_VASTU_ZONES.get(intent, list(ZONE_ANALYSIS.keys()))
    zone_analysis  = {z: ZONE_ANALYSIS[z] for z in priority_zones if z in ZONE_ANALYSIS}
    overall        = DIRECTION_ENERGY.get(facing, DIRECTION_ENERGY["north"])
    corrections    = BASE_CORRECTIONS[:2] + FOCUS_CORRECTIONS.get(intent, [])
    _cfg = build_prompt(
        "vastu",
        name=name or "Client",
        question=question, intent=intent,
        property_type=prop_type,
        facing=facing.capitalize(),
        zone=", ".join(priority_zones[:2]),
        zone_energy=overall,
    )

    prediction = (
        f"Traditional Vastu analysis for '{question}': {overall} "
        f"Priority zones for {intent}: {', '.join(priority_zones[:2])}. "
        f"Key correction: {corrections[0] if corrections else 'Keep spaces clean and well-lit.'}"
    )
    return {
        "sub_agent":       "Traditional Vastu Shastra",
        "question":        question,
        "prediction":      prediction,
        "traits":          priority_zones[:3],
        "confidence_hint": "high",
        "extra": {
            "overall_energy":   overall,
            "priority_zones":   priority_zones,
            "zone_analysis":    zone_analysis,
            "corrections":      corrections,
            "colors_recommended": DIRECTION_COLORS.get(facing, ["White", "Green", "Blue"]),
        },
    }


def _run_modern_vastu(facing: str, question: str, intent: str) -> Dict[str, Any]:
    priority_zones = FOCUS_VASTU_ZONES.get(intent, list(ZONE_ANALYSIS.keys()))
    overall        = DIRECTION_ENERGY.get(facing, DIRECTION_ENERGY["north"])
    corrections    = BASE_CORRECTIONS[2:] + FOCUS_CORRECTIONS.get(intent, [])

    prediction = (
        f"Modern Vastu analysis for '{question}': Space energy is optimized when {intent}-related zones are activated. "
        f"{overall} Declutter priority zones and introduce natural elements for energy alignment."
    )
    return {
        "sub_agent":       "Modern Vastu",
        "question":        question,
        "prediction":      prediction,
        "traits":          ["Natural elements", "Declutter", "Positive flow"],
        "confidence_hint": "medium",
        "extra": {
            "overall_energy": overall,
            "priority_zones": priority_zones,
            "corrections":    corrections,
            "modern_tips":    [
                "Use salt lamps or diffusers with essential oils to cleanse space energy.",
                "Place crystals (clear quartz, citrine) in activated zones for energy amplification.",
                "Ensure indoor plants are in the North and East zones for vitality and prosperity.",
            ],
        },
    }


def _analyze_question(facing: str, prop_type: str, question: str, intent: str, name: str = "") -> Dict[str, Any]:
    traditional = _run_traditional_vastu(facing, prop_type, question, intent, name)
    modern      = _run_modern_vastu(facing, question, intent)

    sub_results = [traditional, modern]
    agreements = [
        f"Both Traditional and Modern Vastu agree on activating {intent}-related spatial zones.",
        "Keeping the Brahmasthan (centre) clean and open is universally recommended.",
    ]
    conflicts = []

    summary = (
        f"Vastu analysis for '{question}': {traditional['prediction']} "
        f"Both traditions confirm spatial alignment supports {intent} outcomes."
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        agreements,
        "conflicts":         conflicts,
    }


def vastu_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "vastu" not in state.get("selected_modules", []):
        return state

    mi = state.get("module_inputs", {})
    vastu_input = mi.get("vastu", {}) if isinstance(mi, dict) else {}
    if isinstance(vastu_input, dict):
        facing    = (vastu_input.get("facing_direction", "North") or "North").lower()
        prop_type = vastu_input.get("property_type", "Apartment / Flat") or "Apartment / Flat"
        notes     = vastu_input.get("floor_plan_notes", "") or ""
    else:
        facing, prop_type, notes = "north", "Apartment / Flat", ""

    profile = state.get("user_profile", {})
    name = profile.get("full_name", "") if isinstance(profile, dict) else getattr(profile, "full_name", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    _prompt_cfg = get_prompt("vastu")
    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(facing, prop_type, nq["question"], nq["intent"], name)
        question_wise_analysis.append(analysis)

    # Legacy flat structure for admin_review_agent backward compat
    first_trad = question_wise_analysis[0]["sub_agent_results"][0]["extra"]
    domain_output = {
        "domain":                 "vastu",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "vedic": {
            "tradition":         "Vedic Vastu Shastra",
            "focus_addressed":   normalized_questions[0]["intent"],
            "property_type":     prop_type,
            "facing_direction":  facing.capitalize(),
            "overall_energy":    first_trad["overall_energy"],
            "priority_zones":    first_trad["priority_zones"],
            "zone_analysis":     first_trad["zone_analysis"],
            "full_zone_analysis": ZONE_ANALYSIS,
            "corrections":       first_trad["corrections"],
            "colors_recommended": first_trad["colors_recommended"],
            "floor_plan_notes":  notes,
        },
    }

    state.setdefault("memory", {})["vastu"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[VastuAgent] Analyzed {len(question_wise_analysis)} question(s) across 2 traditions (Traditional, Modern)."
    )
    return state
