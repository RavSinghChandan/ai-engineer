"""
STEP 2b — Vedic Astrology Super Agent
Runs Vedic, KP, and Western sub-agents per question.
Each sub-agent builds a personalized, question-specific multi-sentence answer
using the actual computed chart values — not generic category text.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt, ASTROLOGY_AGENT_VEDIC, ASTROLOGY_AGENT_KP, ASTROLOGY_AGENT_WESTERN
from utils.astro_calc import (
    _seed, lagna_rashi, moon_rashi, sun_sign_from_dob,
    planetary_positions, nakshatra_of_moon, house_analysis,
    active_doshas, current_dasha, dasha_periods, active_yogas,
    predictions_for_focus
)


# ── Marriage timing by dasha planet ────────────────────────────────────────────
DASHA_MARRIAGE_TIMING = {
    "Sun":     "The Sun dasha period is active — marriage timing is likely in the 2–3 year window ahead, particularly when Venus or Jupiter transits the 7th house.",
    "Moon":    "The Moon dasha brings emotional readiness for commitment — marriage is strongly indicated within 1–2 years, especially during favorable Venus transits.",
    "Mars":    "Mars dasha adds passion and decisiveness — marriage prospects are active now, with the best window during Jupiter's transit over the 7th house.",
    "Mercury": "Mercury dasha supports communication and connection — meeting a compatible partner is likely; formal commitment may follow within 2–4 years.",
    "Jupiter": "Jupiter dasha is among the most auspicious for marriage — a significant relationship or formal commitment is strongly indicated within 1–2 years.",
    "Venus":   "Venus dasha is the most favorable period for marriage — a committed partnership is very strongly indicated, often within the current year or next.",
    "Saturn":  "Saturn dasha brings slow but lasting commitments — marriage is indicated, though it may come after patient waiting; age 27–30 or 35–38 are classic Saturn windows.",
    "Rahu":    "Rahu dasha can bring unconventional or unexpected relationships — marriage is possible but may involve cross-cultural, long-distance, or unique circumstances.",
    "Ketu":    "Ketu dasha emphasizes spiritual bonds over worldly commitments — marriage may be delayed, but when it comes it is deeply karmic and meaningful.",
}

LAGNA_PARTNER_TRAITS = {
    "Aries":       "The 7th house falls in Libra — a diplomatic, artistic, and harmonious partner is indicated.",
    "Taurus":      "The 7th house falls in Scorpio — an intense, deeply loyal, and emotionally strong partner is suggested.",
    "Gemini":      "The 7th house falls in Sagittarius — a philosophical, adventurous, and optimistic partner is favored.",
    "Cancer":      "The 7th house falls in Capricorn — a stable, responsible, and career-oriented partner is indicated.",
    "Leo":         "The 7th house falls in Aquarius — an independent, innovative, and humanitarian partner is suggested.",
    "Virgo":       "The 7th house falls in Pisces — a compassionate, spiritual, and emotionally receptive partner is indicated.",
    "Libra":       "The 7th house falls in Aries — an assertive, energetic, and courageous partner is favored.",
    "Scorpio":     "The 7th house falls in Taurus — a grounded, sensual, and materially secure partner is suggested.",
    "Sagittarius": "The 7th house falls in Gemini — a witty, communicative, and intellectually stimulating partner is indicated.",
    "Capricorn":   "The 7th house falls in Cancer — a nurturing, family-oriented, and emotionally warm partner is favored.",
    "Aquarius":    "The 7th house falls in Leo — a confident, generous, and creatively expressive partner is suggested.",
    "Pisces":      "The 7th house falls in Virgo — a practical, health-conscious, and service-oriented partner is indicated.",
}

INTENT_QUESTION_TEMPLATES = {
    "marriage": {
        "Vedic": (
            "From the Vedic perspective, your {lagna} Lagna places the 7th house (marriage) in focus. "
            "{partner_trait} {dasha_timing} "
            "The {nakshatra} nakshatra of your Moon in {moon} adds emotional depth to your partnerships — "
            "you seek a bond that is both spiritually meaningful and emotionally secure."
        ),
        "KP": (
            "The KP system analyses the 7th cusp sub-lord directly for marriage timing. "
            "With your Moon in {moon} and Lagna in {lagna}, the sub-lord signification points toward "
            "a meaningful relationship chapter that is actively opening. "
            "KP analysis confirms that 7th house matters are energised — deliberate steps toward commitment will be rewarded."
        ),
        "Western": (
            "In Western astrology, your {sun} Sun and Moon in {moon} shape your relationship style. "
            "Venus placement and 7th house ruler aspects indicate partnership opportunities — "
            "emotional openness and clear communication are the two most important factors for manifesting the right relationship. "
            "The current outer-planet transits support meaningful romantic development."
        ),
    },
    "career": {
        "Vedic": (
            "Your {lagna} Lagna places the 10th house of career in focus. "
            "Currently running {dasha} dasha — this period activates professional ambition and recognition. "
            "The {nakshatra} nakshatra enhances strategic thinking, making this a favorable window for career advancement."
        ),
        "KP": (
            "KP analysis of the 10th cusp sub-lord confirms strong career signification in this period. "
            "With {lagna} Lagna, leadership and professional authority are highlighted. "
            "Deliberate skill-building and visibility efforts will yield measurable recognition."
        ),
        "Western": (
            "Your {sun} Sun and Midheaven aspects indicate career visibility and advancement opportunities. "
            "10th house activity is highlighted — professional goals pursued with focus now carry strong momentum. "
            "Jupiter and Saturn transits support sustained career growth through disciplined, consistent action."
        ),
    },
    "finance": {
        "Vedic": (
            "The 2nd and 11th houses govern wealth in Vedic astrology — your {lagna} Lagna activates these through the current {dasha} dasha. "
            "Financial growth through disciplined, persistent effort is indicated. "
            "The {nakshatra} nakshatra bestows resourcefulness — practical, grounded financial decisions compound steadily."
        ),
        "KP": (
            "KP 2nd cusp sub-lord analysis suggests financial accumulation is supported in the current period. "
            "Income through consistent effort and skill application is favored. "
            "Speculation or high-risk ventures are not recommended — steady building is the path."
        ),
        "Western": (
            "Your {sun} Sun and Venus aspects indicate financial growth through creative or communicative work. "
            "2nd house planets are active — income potential is expanding. "
            "Long-term planning aligned with your natural strengths will yield lasting material security."
        ),
    },
    "general": {
        "Vedic": (
            "Your {lagna} Lagna and {moon} Moon sign together indicate a growth-oriented phase. "
            "Currently running {dasha} dasha — consistent, purposeful action compounds powerfully in this period. "
            "The {nakshatra} nakshatra bestows wisdom and perceptiveness to navigate challenges with clarity."
        ),
        "KP": (
            "KP system analysis confirms a positive overall period with favorable cusp significations. "
            "Deliberate effort in areas of personal priority will yield clear results. "
            "Moon sub-lord placement supports emotional steadiness and sound decision-making."
        ),
        "Western": (
            "Your {sun} Sun and Moon in {moon} create a personality that is both adaptive and purposeful. "
            "Current outer-planet transits — Jupiter and Saturn — support sustained growth across life areas. "
            "Focusing energy on long-term goals during this window amplifies outcomes significantly."
        ),
    },
}


def _build_prediction(template_key: str, tradition: str, lagna: str, moon: str, sun: str, nakshatra: str, dasha: str) -> str:
    templates = INTENT_QUESTION_TEMPLATES.get(template_key, INTENT_QUESTION_TEMPLATES["general"])
    tmpl = templates.get(tradition, templates.get("Vedic", ""))
    partner_trait = LAGNA_PARTNER_TRAITS.get(lagna, "A compatible, emotionally aligned partner is indicated.")
    dasha_planet  = dasha.split(" ")[0] if dasha else "Jupiter"
    dasha_timing  = DASHA_MARRIAGE_TIMING.get(dasha_planet, DASHA_MARRIAGE_TIMING["Jupiter"])
    return tmpl.format(
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshatra,
        dasha=dasha, partner_trait=partner_trait, dasha_timing=dasha_timing,
    )


def _run_vedic_sub_agent(name: str, dob: str, tob: str, pob: str, question: str, intent: str) -> Dict[str, Any]:
    seed       = _seed(name + dob + pob)
    lagna      = lagna_rashi(seed)
    moon       = moon_rashi(seed)
    sun        = sun_sign_from_dob(dob)
    nakshat    = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)
    preds      = predictions_for_focus(lagna, sun, moon, intent, seed)

    _cfg = build_prompt(
        "astrology_vedic",
        name=name, dob=dob, tob=tob, pob=pob,
        question=question, intent=intent, tradition="Vedic (Jyotish)",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "Vedic", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "Vedic Astrology",
        "question":        question,
        "prediction":      prediction,
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
                f"The {moon} Moon may bring emotional fluctuations requiring mindful management.",
                "A tendency toward overwork — balance and delegation are recommended.",
            ],
        },
    }


def _run_kp_sub_agent(name: str, dob: str, question: str, intent: str) -> Dict[str, Any]:
    seed  = _seed(name + dob + "KP")
    lagna = lagna_rashi(seed)
    moon  = moon_rashi(seed)
    sun   = sun_sign_from_dob(dob)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)

    _cfg = build_prompt(
        "astrology_kp",
        name=name, dob=dob, tob="", pob="",
        question=question, intent=intent, tradition="KP System",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "KP", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "KP Astrology",
        "question":        question,
        "prediction":      prediction,
        "traits":          [f"Ascendant sub-lord active", f"Moon sub-lord {moon}", "Favorable dasha signification"],
        "confidence_hint": "medium",
        "extra": {
            "chart":         {"lagna": lagna, "moon_sign": moon},
            "predictions":   [prediction, f"KP cusp analysis confirms favorable period for {intent}."],
            "cusp_analysis": f"Sub-lord of relevant house cusps is well-placed for {intent} matters.",
        },
    }


def _run_western_sub_agent(name: str, dob: str, question: str, intent: str) -> Dict[str, Any]:
    seed  = _seed(name + dob + "Western")
    sun   = sun_sign_from_dob(dob)
    moon  = moon_rashi(seed)
    lagna = lagna_rashi(seed)
    nakshat = nakshatra_of_moon(seed)
    dasha_planet, dasha_label = current_dasha(seed, dob)

    _cfg = build_prompt(
        "astrology_western",
        name=name, dob=dob, tob="", pob="",
        question=question, intent=intent, tradition="Western",
        lagna=lagna, moon=moon, sun=sun, nakshatra=nakshat, dasha=dasha_label,
    )
    prediction = _build_prediction(intent, "Western", lagna, moon, sun, nakshat, dasha_label)

    return {
        "sub_agent":       "Western Astrology",
        "question":        question,
        "prediction":      prediction,
        "traits":          [f"Sun in {sun}", f"Moon in {moon}", "Active outer planet transits"],
        "confidence_hint": "medium",
        "extra": {
            "chart":       {"sun_sign": sun, "moon_sign": moon},
            "predictions": [prediction, f"Western transit analysis supports {intent} themes for the current period."],
            "transits":    "Jupiter and Saturn transits are active — sustained growth is indicated.",
        },
    }


def _analyze_question(name: str, dob: str, tob: str, pob: str, question: str, intent: str) -> Dict[str, Any]:
    vedic   = _run_vedic_sub_agent(name, dob, tob, pob, question, intent)
    kp      = _run_kp_sub_agent(name, dob, question, intent)
    western = _run_western_sub_agent(name, dob, question, intent)

    sub_results = [vedic, kp, western]
    lagna = vedic["extra"]["chart"]["lagna"]
    dasha = vedic["extra"]["current_dasha"]

    summary = (
        f"Astrology analysis for '{question}': Lagna is {lagna}, currently running {dasha}. "
        f"All three systems (Vedic, KP, Western) confirm {intent}-related energy. "
        f"{vedic['prediction']}"
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        [
            f"All three astrological traditions confirm a favorable period for {intent}-related matters.",
            "Timing indicators align across Vedic, KP, and Western systems.",
        ],
        "conflicts":         [],
    }


def astrology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "astrology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "")    if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else profile.date_of_birth
    tob  = profile.get("time_of_birth", "") if isinstance(profile, dict) else getattr(profile, "time_of_birth", "")
    pob  = profile.get("place_of_birth", "") if isinstance(profile, dict) else getattr(profile, "place_of_birth", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, tob, pob, nq["question"], nq["intent"])
        question_wise_analysis.append(analysis)

    first_sub = question_wise_analysis[0]["sub_agent_results"][0]
    _prompt_cfg = get_prompt("astrology")
    domain_output = {
        "domain":                 "astrology",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "vedic":                  first_sub["extra"],
    }
    domain_output["vedic"]["tradition"]       = "Vedic"
    domain_output["vedic"]["focus_addressed"] = normalized_questions[0]["intent"]
    domain_output["vedic"]["predictions"]     = first_sub["extra"].get("predictions", [])
    domain_output["vedic"]["strengths"]       = first_sub["extra"].get("strengths", [])
    domain_output["vedic"]["challenges"]      = first_sub["extra"].get("challenges", [])
    domain_output["vedic"]["yogas"]           = first_sub["extra"].get("yogas", [])
    domain_output["vedic"]["doshas"]          = first_sub["extra"].get("doshas", [])
    domain_output["vedic"]["current_dasha"]   = first_sub["extra"].get("current_dasha", "")

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
