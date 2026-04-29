"""
STEP 2b — Vedic Astrology Super Agent
Runs Vedic, KP, and Western sub-agents per question.
Stores DomainOutput with question_wise_analysis[] in memory.
"""
from __future__ import annotations
from typing import Any, Dict, List
from utils.astro_calc import (
    _seed, lagna_rashi, moon_rashi, sun_sign_from_dob,
    planetary_positions, nakshatra_of_moon, house_analysis,
    active_doshas, current_dasha, dasha_periods, active_yogas,
    predictions_for_focus
)


FOCUS_INTERPRETATIONS: Dict[str, Dict[str, str]] = {
    "Vedic": {
        "career":      "The Lagna and 10th house lord indicate strong professional ambition — a favorable dasha supports career growth.",
        "finance":     "2nd and 11th house energies suggest financial gains through disciplined, persistent effort.",
        "marriage":    "7th house analysis indicates meaningful partnerships — emotional maturity is a key strength.",
        "health":      "Lagna and 8th house analysis suggest good vitality — stress and overwork are areas to monitor.",
        "spirituality":"Favorable yogas and 9th house energy indicate a spiritual deepening phase.",
        "education":   "5th house lord is well-placed — academic success and intellectual growth are supported.",
        "travel":      "12th and 9th house energies support travel and relocation — new horizons are opening.",
        "children":    "5th house energy is positively activated — parenting and family expansion are indicated.",
        "general":     "The overall chart suggests a growth phase — consistent action yields compounding results.",
    },
    "KP": {
        "career":      "Sub-lord of the 10th cusp indicates favorable signification for career advancement and recognition.",
        "finance":     "Sub-lord of the 2nd cusp is well-placed — financial accumulation through steady effort is supported.",
        "marriage":    "7th cusp sub-lord signification points to a meaningful relationship chapter opening.",
        "health":      "Ascendant sub-lord analysis suggests good physical health — mental balance is key.",
        "spirituality":"9th cusp sub-lord carries spiritual signification — inner practice rewards deeply now.",
        "education":   "5th cusp sub-lord is favorably placed — study and certification efforts will succeed.",
        "travel":      "12th cusp sub-lord supports foreign travel and settlement opportunities.",
        "children":    "5th cusp sub-lord analysis supports family expansion and parenting themes.",
        "general":     "KP system analysis confirms a positive period — deliberate action amplifies outcomes.",
    },
    "Western": {
        "career":      "10th house activity and Midheaven aspects suggest career visibility and advancement opportunities.",
        "finance":     "2nd house planets and Venus aspects indicate financial growth through creative or communicative work.",
        "marriage":    "7th house ruler and Venus placement suggest partnership opportunities — emotional openness is key.",
        "health":      "Ascendant ruler aspects suggest good vitality — regular routines and self-care are emphasized.",
        "spirituality":"Neptune and Jupiter aspects indicate spiritual receptivity and a deepening inner life.",
        "education":   "Mercury and Jupiter aspects favor learning, study, and intellectual achievement.",
        "travel":      "Sagittarius and 9th house placements support international travel and cultural expansion.",
        "children":    "Moon and Venus aspects indicate nurturing instincts and favorable parenting energy.",
        "general":     "Western chart analysis suggests positive outer-planet transits supporting growth and expansion.",
    },
}


def _run_vedic_sub_agent(name: str, dob: str, tob: str, pob: str, question: str, intent: str) -> Dict[str, Any]:
    seed    = _seed(name + dob + pob)
    lagna   = lagna_rashi(seed)
    moon    = moon_rashi(seed)
    sun     = sun_sign_from_dob(dob)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)
    preds   = predictions_for_focus(lagna, sun, moon, intent, seed)

    focus_pred = FOCUS_INTERPRETATIONS["Vedic"].get(intent, FOCUS_INTERPRETATIONS["Vedic"]["general"])
    return {
        "sub_agent":       "Vedic Astrology",
        "question":        question,
        "prediction":      focus_pred,
        "traits":          [f"Lagna {lagna}", f"Moon {moon}", nakshat],
        "confidence_hint": "high",
        "extra": {
            "chart": {"lagna": lagna, "moon_sign": moon, "sun_sign": sun, "nakshatra": nakshat},
            "planetary_positions": planetary_positions(seed),
            "house_analysis":      house_analysis(seed, lagna),
            "doshas":              active_doshas(seed),
            "current_dasha":       dasha_label,
            "dasha_planet":        dasha_planet,
            "dasha_periods":       dasha_periods(seed),
            "yogas":               active_yogas(seed),
            "predictions":         preds,
            "strengths": [
                f"Natural {lagna} qualities bring resilience and determination.",
                f"Moon in {moon} supports emotional depth and intuition.",
                f"The {nakshat} nakshatra bestows wisdom and perceptiveness.",
            ],
            "challenges": [
                f"The {moon} Moon may bring emotional fluctuations — mindful management is advised.",
                "A tendency toward overwork — balance and delegation are recommended.",
            ],
        },
    }


def _run_kp_sub_agent(name: str, dob: str, question: str, intent: str) -> Dict[str, Any]:
    seed = _seed(name + dob + "KP")
    lagna = lagna_rashi(seed)
    moon  = moon_rashi(seed)
    focus_pred = FOCUS_INTERPRETATIONS["KP"].get(intent, FOCUS_INTERPRETATIONS["KP"]["general"])
    return {
        "sub_agent":       "KP Astrology",
        "question":        question,
        "prediction":      focus_pred,
        "traits":          [f"Ascendant sub-lord active", f"Moon sub-lord {moon}", "Favorable dasha signification"],
        "confidence_hint": "medium",
        "extra": {
            "chart":         {"lagna": lagna, "moon_sign": moon},
            "predictions":   [focus_pred, f"KP cusp analysis confirms favorable period for {intent}."],
            "cusp_analysis": f"Sub-lord of relevant house cusps is well-placed for {intent} matters.",
        },
    }


def _run_western_sub_agent(name: str, dob: str, question: str, intent: str) -> Dict[str, Any]:
    seed = _seed(name + dob + "Western")
    sun  = sun_sign_from_dob(dob)
    moon = moon_rashi(seed)
    focus_pred = FOCUS_INTERPRETATIONS["Western"].get(intent, FOCUS_INTERPRETATIONS["Western"]["general"])
    return {
        "sub_agent":       "Western Astrology",
        "question":        question,
        "prediction":      focus_pred,
        "traits":          [f"Sun in {sun}", f"Moon in {moon}", "Active outer planet transits"],
        "confidence_hint": "medium",
        "extra": {
            "chart":       {"sun_sign": sun, "moon_sign": moon},
            "predictions": [focus_pred, f"Western transit analysis supports {intent} themes for the current period."],
            "transits":    f"Jupiter and Saturn transits are active — sustained growth is indicated.",
        },
    }


def _analyze_question(name: str, dob: str, tob: str, pob: str, question: str, intent: str) -> Dict[str, Any]:
    vedic   = _run_vedic_sub_agent(name, dob, tob, pob, question, intent)
    kp      = _run_kp_sub_agent(name, dob, question, intent)
    western = _run_western_sub_agent(name, dob, question, intent)

    sub_results = [vedic, kp, western]
    agreements = [
        f"All three traditions confirm a favorable period for {intent}-related matters.",
        "Timing indicators align across systems — consistent action is recommended.",
    ]
    conflicts = []
    if intent in ("finance", "career"):
        conflicts.append("KP and Western may differ on exact timing — Vedic dasha period takes priority for timing.")

    lagna = vedic["extra"]["chart"]["lagna"]
    dasha = vedic["extra"]["current_dasha"]
    summary = (
        f"Astrology analysis for '{question}': Lagna is {lagna}, currently running {dasha}. "
        f"All three systems (Vedic, KP, Western) broadly confirm {intent}-related growth energy. "
        f"{vedic['prediction']}"
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        agreements,
        "conflicts":         conflicts,
    }


def astrology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "astrology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "")   if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth","") if isinstance(profile, dict) else profile.date_of_birth
    tob  = profile.get("time_of_birth","") if isinstance(profile, dict) else getattr(profile, "time_of_birth", "")
    pob  = profile.get("place_of_birth","") if isinstance(profile, dict) else getattr(profile, "place_of_birth", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, tob, pob, nq["question"], nq["intent"])
        question_wise_analysis.append(analysis)

    # Legacy flat structure for admin_review_agent backward compat
    first_sub = question_wise_analysis[0]["sub_agent_results"][0]
    domain_output = {
        "domain":                 "astrology",
        "question_wise_analysis": question_wise_analysis,
        "vedic":                  first_sub["extra"],
    }
    domain_output["vedic"]["tradition"]      = "Vedic"
    domain_output["vedic"]["focus_addressed"] = normalized_questions[0]["intent"]
    domain_output["vedic"]["predictions"]    = first_sub["extra"].get("predictions", [])
    domain_output["vedic"]["strengths"]      = first_sub["extra"].get("strengths", [])
    domain_output["vedic"]["challenges"]     = first_sub["extra"].get("challenges", [])
    domain_output["vedic"]["yogas"]          = first_sub["extra"].get("yogas", [])
    domain_output["vedic"]["doshas"]         = first_sub["extra"].get("doshas", [])
    domain_output["vedic"]["current_dasha"]  = first_sub["extra"].get("current_dasha", "")

    state.setdefault("memory", {})["astrology"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[AstrologyAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions (Vedic, KP, Western)."
    )
    return state


def _moon_strength(moon: str) -> str:
    q = {
        "Aries": "quick, decisive emotional responses", "Taurus": "emotional stability and patience",
        "Gemini": "mental agility and adaptability", "Cancer": "nurturing depth and empathy",
        "Leo": "emotional warmth and generosity", "Virgo": "analytical clarity and service",
        "Libra": "harmony and cooperative instincts", "Scorpio": "deep emotional resilience",
        "Sagittarius": "optimism and expansive outlook", "Capricorn": "emotional discipline and perseverance",
        "Aquarius": "independent thinking and humanitarian values", "Pisces": "compassion and intuitive depth",
    }
    return q.get(moon, "emotional intelligence")
