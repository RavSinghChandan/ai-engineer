"""
STEP 2a — Numerology Super Agent
Runs 3 sub-agents: Indian, Chaldean, Pythagorean
Each stores output in memory[numerology][tradition]
"""
from __future__ import annotations
from typing import Any, Dict
from utils.numerics import (
    life_path, destiny_number, letter_map_indian, letter_map_chaldean,
    letter_map_pythagorean, name_number, soul_urge, personality_number,
    get_traits, lucky_numbers, lucky_colors_for_number, reduce_number
)


def _predictions_for_focus(lp: int, nm: int, focus: str, tradition: str) -> list:
    base = [
        f"There is a tendency toward {get_traits(lp)['traits'][0].lower()} driving key decisions.",
        f"The {tradition} tradition suggests natural aptitude for fields aligned with number {lp} energy.",
    ]
    focus_map = {
        "career":       [f"Number {lp} individuals often thrive in roles demanding {get_traits(lp)['traits'][1].lower()}.",
                         "This suggests a favorable year for career advancement and recognition."],
        "finance":      [f"Lucky numbers {lucky_numbers(lp, nm)} align with financial cycles.",
                         "Disciplined financial planning is indicated for stable growth."],
        "marriage":     ["Partnership numbers suggest compatibility with grounded, emotionally expressive individuals.",
                         "This suggests a meaningful relationship chapter opening."],
        "health":       ["Vitality is supported — routine and discipline enhance physical well-being.",
                         "Mental health benefits from creative expression and community."],
        "spirituality": [f"Number {lp} carries deep spiritual resonance — meditation amplifies growth.",
                         "A period of inner seeking and clarity is indicated."],
        "general":      ["A balanced period is suggested — gradual, steady progress is indicated."],
    }
    specific = focus_map.get(focus, focus_map["general"])
    return specific + base


def _run_tradition(name: str, dob: str, lmap: Dict[str, int], tradition: str, focus: str) -> Dict[str, Any]:
    lp   = life_path(dob)
    dest = destiny_number(dob)
    nm   = name_number(name, lmap)
    su   = soul_urge(name, lmap)
    pn   = personality_number(name, lmap)
    t    = get_traits(lp)
    return {
        "tradition": tradition,
        "focus_addressed": focus,
        "core_numbers": {
            "life_path":         lp,
            "destiny":           dest,
            "name_number":       nm,
            "soul_urge":         su,
            "personality":       pn,
            "maturity":          reduce_number(lp + nm),
        },
        "traits":     t["traits"],
        "strengths":  t["strengths"],
        "weaknesses": t["weaknesses"],
        "lucky_numbers": lucky_numbers(lp, nm),
        "lucky_colors":  lucky_colors_for_number(lp),
        "predictions": _predictions_for_focus(lp, nm, focus, tradition),
    }


def numerology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "numerology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name    = profile.get("full_name","") if isinstance(profile, dict) else profile.full_name
    dob     = profile.get("date_of_birth","") if isinstance(profile, dict) else profile.date_of_birth
    focus   = state.get("focus_context", {}).get("intent", "general")

    results = {
        "indian":      _run_tradition(name, dob, letter_map_indian(),      "Indian",      focus),
        "chaldean":    _run_tradition(name, dob, letter_map_chaldean(),    "Chaldean",    focus),
        "pythagorean": _run_tradition(name, dob, letter_map_pythagorean(), "Pythagorean", focus),
    }

    state.setdefault("memory", {})["numerology"] = results
    state.setdefault("agent_log", []).append("[NumerologyAgent] All 3 traditions computed and stored.")
    return state
