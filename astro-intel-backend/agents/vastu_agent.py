"""
STEP 2e — Vastu Shastra Agent
Directional energy analysis aligned to focus context.
"""
from __future__ import annotations
from typing import Any, Dict, List

DIRECTION_ENERGY: Dict[str, str] = {
    "north":     "North (Kubera) carries prosperity and career energy — highly auspicious for work and finance.",
    "northeast":  "Northeast (Eeshaan) is the most spiritually potent direction — ideal for meditation and learning.",
    "east":      "East (Indra) brings solar vitality and health — excellent for morning routines and health-focused spaces.",
    "southeast":  "Southeast (Agni) carries fire energy — creative and ambitious but requires balance.",
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
    "north":    ["Blue","Green","White"],
    "northeast":["White","Light Yellow","Cream"],
    "east":     ["Green","White","Light Blue"],
    "southeast":["Orange","Red (accent)","Yellow"],
    "south":    ["Red","Pink","Coral"],
    "southwest":["Yellow","Earthy Brown","Peach"],
    "west":     ["White","Grey","Blue"],
    "northwest":["Grey","White","Silver"],
}

FOCUS_VASTU_ZONES: Dict[str, List[str]] = {
    "career":   ["North Zone (Kubera — Wealth)","East Zone (Indra — Health)"],
    "finance":  ["North Zone (Kubera — Wealth)","West Zone (Varuna — Gains)"],
    "marriage": ["Southwest Zone (Nairuti — Stability)","West Zone (Varuna — Gains)"],
    "health":   ["East Zone (Indra — Health)","Northeast Zone (Eeshaan — Spirit)"],
    "spirituality":["Northeast Zone (Eeshaan — Spirit)","Brahmasthan (Centre)"],
    "general":  list(ZONE_ANALYSIS.keys()),
}


def _imbalances(facing: str, focus: str) -> List[str]:
    base = [
        "There may be a tendency toward energy blockage in the Northeast if heavy items are placed there.",
        "Clutter in the North zone may restrict the flow of prosperity and career energy.",
    ]
    if facing in ("south","southwest"):
        base.append("South-facing entrance may benefit from a Vastu correction mirror or pyramid at the entrance.")
    if focus == "career":
        base.append("Ensure the North zone desk or work corner is clutter-free and well-lit for career activation.")
    if focus == "marriage":
        base.append("Avoid toilets or kitchens in the Southwest — this can affect relationship harmony.")
    return base


def _corrections(facing: str, focus: str) -> List[str]:
    base = [
        "Place a small indoor money plant or tulsi in the North or Northeast zone.",
        "Hang a Vastu pyramid or clear quartz crystal in the Brahmasthan to enhance central energy.",
        "Use a metal wind chime in the Northwest to activate air element energy.",
        "Ensure the main entrance is well-lit, welcoming, and free from obstructions.",
        "Avoid placing mirrors directly facing the main door — redirect to North or East walls.",
    ]
    focus_corrections = {
        "career":   ["Place a laughing Buddha or Kubera yantra in the North zone for career activation.",
                     "Keep your work desk facing East or North — this enhances focus and productivity."],
        "finance":  ["Place a money plant in a green pot in the North zone.",
                     "Keep the North wall of your home free of heavy shelving or dark objects."],
        "marriage": ["Place rose quartz crystals in the Southwest zone of the bedroom.",
                     "Use pink or rose-colored soft furnishings in the bedroom to activate Venus energy."],
        "health":   ["Keep the East zone open with maximum morning light.",
                     "Place healing plants (aloe vera, tulsi) in the East zone."],
        "spirituality":["Create a dedicated prayer space in the Northeast corner.",
                       "Use white or light yellow in the Northeast — avoid dark colors here."],
    }
    return base[:3] + focus_corrections.get(focus, [])


def vastu_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "vastu" not in state.get("selected_modules", []):
        return state

    mi = state.get("module_inputs", {})
    vastu_input = mi.get("vastu", {}) if isinstance(mi, dict) else {}
    if isinstance(vastu_input, dict):
        facing   = (vastu_input.get("facing_direction","North") or "North").lower()
        prop_type = vastu_input.get("property_type","Apartment / Flat") or "Apartment / Flat"
        notes    = vastu_input.get("floor_plan_notes","") or ""
    else:
        facing, prop_type, notes = "north", "Apartment / Flat", ""

    focus = state.get("focus_context",{}).get("intent","general")

    priority_zones = FOCUS_VASTU_ZONES.get(focus, list(ZONE_ANALYSIS.keys()))
    zone_analysis = {z: ZONE_ANALYSIS[z] for z in priority_zones if z in ZONE_ANALYSIS}

    result = {
        "tradition": "Vedic Vastu Shastra",
        "focus_addressed": focus,
        "property_type": prop_type,
        "facing_direction": facing.capitalize(),
        "overall_energy": DIRECTION_ENERGY.get(facing, DIRECTION_ENERGY["north"]),
        "priority_zones": priority_zones,
        "zone_analysis": zone_analysis,
        "full_zone_analysis": ZONE_ANALYSIS,
        "imbalances":  _imbalances(facing, focus),
        "corrections": _corrections(facing, focus),
        "favorable_directions": DIRECTION_COLORS.get((facing + "ne") if "northeast" in facing else facing.split()[0], ["North","Northeast","East"]),
        "colors_recommended": DIRECTION_COLORS.get(facing, ["White","Green","Blue"]),
        "floor_plan_notes": notes,
    }

    state.setdefault("memory", {})["vastu"] = {"vedic": result}
    state.setdefault("agent_log", []).append(
        f"[VastuAgent] Analysis for {facing.capitalize()}-facing property. Focus: {focus}."
    )
    return state
