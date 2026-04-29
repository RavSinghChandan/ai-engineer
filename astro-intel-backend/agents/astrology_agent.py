"""
STEP 2b — Vedic Astrology Agent
"""
from __future__ import annotations
from typing import Any, Dict
from utils.astro_calc import (
    _seed, lagna_rashi, moon_rashi, sun_sign_from_dob,
    planetary_positions, nakshatra_of_moon, house_analysis,
    active_doshas, current_dasha, dasha_periods, active_yogas,
    predictions_for_focus
)


def astrology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "astrology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name    = profile.get("full_name","") if isinstance(profile, dict) else profile.full_name
    dob     = profile.get("date_of_birth","") if isinstance(profile, dict) else profile.date_of_birth
    tob     = profile.get("time_of_birth","") if isinstance(profile, dict) else getattr(profile, "time_of_birth","")
    pob     = profile.get("place_of_birth","") if isinstance(profile, dict) else getattr(profile, "place_of_birth","")
    focus   = state.get("focus_context", {}).get("intent", "general")

    seed    = _seed(name + dob + pob)
    lagna   = lagna_rashi(seed)
    moon    = moon_rashi(seed)
    sun     = sun_sign_from_dob(dob)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)

    result = {
        "tradition": "Vedic",
        "focus_addressed": focus,
        "chart": {
            "lagna":       lagna,
            "moon_sign":   moon,
            "sun_sign":    sun,
            "nakshatra":   nakshat,
        },
        "planetary_positions": planetary_positions(seed),
        "house_analysis":      house_analysis(seed, lagna),
        "doshas":              active_doshas(seed),
        "current_dasha":       dasha_label,
        "dasha_planet":        dasha_planet,
        "dasha_periods":       dasha_periods(seed),
        "yogas":               active_yogas(seed),
        "strengths": [
            f"Natural {lagna} qualities bring resilience and determination.",
            f"Moon in {moon} supports {_moon_strength(moon)}.",
            f"The {nakshat} nakshatra bestows wisdom and perceptiveness.",
        ],
        "challenges": [
            f"The {moon} Moon may bring emotional fluctuations requiring mindful management.",
            "There is a tendency toward overwork — balance is strongly recommended.",
        ],
        "predictions": predictions_for_focus(lagna, sun, moon, focus, seed),
    }

    state.setdefault("memory", {})["astrology"] = {"vedic": result}
    state.setdefault("agent_log", []).append(
        f"[AstrologyAgent] Chart computed: Lagna={lagna}, Moon={moon}, Dasha={dasha_label}"
    )
    return state


def _moon_strength(moon: str) -> str:
    q = {
        "Aries":"quick, decisive emotional responses","Taurus":"emotional stability and patience",
        "Gemini":"mental agility and adaptability","Cancer":"nurturing depth and empathy",
        "Leo":"emotional warmth and generosity","Virgo":"analytical clarity and service",
        "Libra":"harmony and cooperative instincts","Scorpio":"deep emotional resilience",
        "Sagittarius":"optimism and expansive outlook","Capricorn":"emotional discipline and perseverance",
        "Aquarius":"independent thinking and humanitarian values","Pisces":"compassion and intuitive depth",
    }
    return q.get(moon, "emotional intelligence")
