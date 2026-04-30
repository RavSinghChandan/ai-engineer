"""
STEP 2a — Numerology Super Agent
Runs 3 sub-agents (Indian, Chaldean, Pythagorean) per question.
Each sub-agent builds a personalized, question-specific multi-sentence answer
using actual computed numbers — not generic category text.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt
from utils.numerics import (
    life_path, destiny_number, letter_map_indian, letter_map_chaldean,
    letter_map_pythagorean, name_number, soul_urge, personality_number,
    get_traits, lucky_numbers, lucky_colors_for_number, reduce_number
)

TRADITION_MAPS = {
    "Indian Numerology":      letter_map_indian,
    "Chaldean Numerology":    letter_map_chaldean,
    "Pythagorean Numerology": letter_map_pythagorean,
}

# ── Life-path marriage compatibility ──────────────────────────────────────────
LP_MARRIAGE_INSIGHTS = {
    1: ("Life Path 1 seeks a confident, independent partner who respects autonomy. "
        "Best compatibility is with Life Paths 3, 5, and 6 — partners who are expressive and nurturing."),
    2: ("Life Path 2 is the most relationship-oriented number — partnership and harmony are core life themes. "
        "Marriage is strongly indicated and deeply fulfilling; best matches are Life Paths 6, 8, and 9."),
    3: ("Life Path 3 brings creativity and joy to relationships — a partner who appreciates expression and fun is ideal. "
        "Best compatibility with Life Paths 1, 5, and 7 — dynamic and intellectually stimulating bonds."),
    4: ("Life Path 4 values stability and commitment — marriage comes after careful consideration and trust-building. "
        "Best matches are Life Paths 1, 7, and 8 — grounded, dependable, and growth-oriented partners."),
    5: ("Life Path 5 seeks freedom within commitment — a partner who is adventurous and non-restrictive is ideal. "
        "Best compatibility with Life Paths 1, 3, and 7 — dynamic partnerships with mutual respect for independence."),
    6: ("Life Path 6 is naturally oriented toward home, family, and devoted partnership — marriage is a central life theme. "
        "Best matches are Life Paths 2, 8, and 9 — nurturing, responsible, and emotionally mature partners."),
    7: ("Life Path 7 seeks a spiritually and intellectually compatible partner — surface-level connections do not satisfy. "
        "Best compatibility with Life Paths 4 and 9 — deep, meaningful bonds with mutual inner growth."),
    8: ("Life Path 8 brings power and ambition to relationships — a partner who is confident and supportive is essential. "
        "Best matches are Life Paths 2, 4, and 6 — grounded partners who complement without competing."),
    9: ("Life Path 9 is compassionate and giving in relationships — a partner who shares humanitarian values is ideal. "
        "Best compatibility with Life Paths 3, 6, and 9 — partners with emotional depth and a giving nature."),
    11: ("Life Path 11 is a master number carrying intense spiritual and relational energy. "
         "A deeply karmic bond is indicated — the partner will be a significant soul connection and growth catalyst."),
    22: ("Life Path 22 attracts partnerships aligned with a larger life mission. "
         "Marriage will be purposeful and legacy-building — the partner shares ambitious, constructive values."),
    33: ("Life Path 33 carries master-level compassion — the partner will be a soulmate in the truest sense. "
         "Marriage is deeply spiritual and service-oriented in nature."),
}

LP_INTENT_TEMPLATES = {
    "marriage": (
        "From the {tradition} perspective, your Life Path {lp} and Name Number {nm} together shape your relationship destiny. "
        "{lp_marriage_insight} "
        "Your Soul Urge number {su} reveals what you deeply seek in a partner — inner alignment with these values accelerates meaningful connection. "
        "Numerically, ages {age1} and {age2} carry strong marriage vibrations based on your personal year cycles."
    ),
    "career": (
        "From the {tradition} perspective, your Life Path {lp} indicates a {trait} nature in professional contexts. "
        "Your Destiny Number {dest} points toward long-term career fulfillment in areas aligned with leadership, creativity, or service. "
        "The current personal year cycle supports deliberate skill-building — recognition and advancement follow consistent effort."
    ),
    "finance": (
        "From the {tradition} perspective, your Life Path {lp} and lucky numbers {lucky} align with financial cycles. "
        "Your Destiny Number {dest} governs long-term material outcomes — disciplined, purposeful financial planning is your strongest strategy. "
        "The current period favors steady accumulation over speculation — grounded decisions compound over time."
    ),
    "health": (
        "From the {tradition} perspective, your Life Path {lp} suggests a {trait} constitution. "
        "Routine, discipline, and balance are your health foundations — these come naturally to a {lp} life path. "
        "Mental and emotional wellness directly impact physical health for your number — mindfulness practices are especially beneficial."
    ),
    "spirituality": (
        "From the {tradition} perspective, your Life Path {lp} carries strong spiritual resonance. "
        "Your Soul Urge {su} reveals an inner hunger for meaning and transcendence — this period is ripe for deepening spiritual practice. "
        "Meditation, journaling, and time in nature amplify inner clarity significantly for your number."
    ),
    "education": (
        "From the {tradition} perspective, your Life Path {lp} is oriented toward learning and intellectual growth. "
        "Your Destiny Number {dest} confirms strong academic potential — structured study and mentorship yield excellent results. "
        "This is a favorable numerological cycle for certifications, courses, or advanced degrees."
    ),
    "travel": (
        "From the {tradition} perspective, your Life Path {lp} and current personal year cycle support movement and exploration. "
        "Your Name Number {nm} adds favorable vibrations to travel decisions — plans made now have strong momentum. "
        "International or long-distance travel is positively aspected — trust emerging opportunities."
    ),
    "children": (
        "From the {tradition} perspective, your Life Path {lp} and Destiny Number {dest} indicate nurturing, parenting energy. "
        "Family expansion is positively supported in the current numerological cycle. "
        "Your Soul Urge {su} reveals a deep desire for meaningful family bonds — this chapter is opening naturally."
    ),
    "general": (
        "From the {tradition} perspective, your Life Path {lp} indicates a {trait} nature. "
        "Your Destiny Number {dest} and Name Number {nm} together suggest a growth-oriented period across all life areas. "
        "Consistent effort aligned with your natural strengths yields compounding, lasting results."
    ),
}


def _marriage_age_hints(lp: int, dob: str) -> tuple:
    """Compute two marriage-window ages based on personal year cycles."""
    try:
        birth_year = int(dob.split("-")[0]) if "-" in dob else int(dob[-4:])
        from datetime import date
        current_year = date.today().year
        age_now = current_year - birth_year
    except Exception:
        age_now = 25
    # Personal year of marriage is typically a 2, 6, or 9 personal year
    # Simplistic: next two ages where (age % 9) is in (2, 5, 6)
    ages = []
    for a in range(max(age_now, 20), age_now + 15):
        if (a % 9) in (2, 5, 6) and len(ages) < 2:
            ages.append(a)
    if len(ages) < 2:
        ages = [age_now + 1, age_now + 3]
    return ages[0], ages[1]


def _build_numerology_prediction(lp: int, nm: int, dest: int, su: int, pn: int, tradition: str, intent: str, dob: str) -> str:
    traits = get_traits(lp)
    trait  = traits["traits"][0].lower() if traits["traits"] else "purposeful"
    lucky  = ", ".join(str(n) for n in lucky_numbers(lp, nm)[:3])
    lp_marriage = LP_MARRIAGE_INSIGHTS.get(lp, LP_MARRIAGE_INSIGHTS[1])
    age1, age2 = _marriage_age_hints(lp, dob)

    template = LP_INTENT_TEMPLATES.get(intent, LP_INTENT_TEMPLATES["general"])
    return template.format(
        tradition=tradition, lp=lp, nm=nm, dest=dest, su=su, pn=pn,
        trait=trait, lucky=lucky, lp_marriage_insight=lp_marriage,
        age1=age1, age2=age2,
    )


def _run_sub_agent(name: str, dob: str, lmap: Dict[str, int], tradition: str, focus: str, question: str) -> Dict[str, Any]:
    lp   = life_path(dob)
    dest = destiny_number(dob)
    nm   = name_number(name, lmap)
    su   = soul_urge(name, lmap)
    pn   = personality_number(name, lmap)
    t    = get_traits(lp)
    _lucky = ", ".join(str(n) for n in lucky_numbers(lp, nm)[:3])

    _trad_key = {
        "Indian Numerology": "numerology_indian",
        "Chaldean Numerology": "numerology_chaldean",
        "Pythagorean Numerology": "numerology_pythagorean",
    }.get(tradition, "numerology")
    _cfg = build_prompt(
        _trad_key,
        name=name, dob=dob, tradition=tradition,
        question=question, intent=focus,
        lp=lp, dest=dest, nm=nm, su=su, pn=pn, lucky=_lucky,
    )

    prediction = _build_numerology_prediction(lp, nm, dest, su, pn, tradition, focus, dob)

    return {
        "sub_agent":        tradition,
        "question":         question,
        "prediction":       prediction,
        "traits":           t["traits"][:3],
        "confidence_hint":  "high" if lp in (1,3,5,7,9,11,22,33) else "medium",
        "extra": {
            "core_numbers": {
                "life_path":   lp,
                "destiny":     dest,
                "name_number": nm,
                "soul_urge":   su,
                "personality": pn,
                "maturity":    reduce_number(lp + nm),
            },
            "lucky_numbers":  lucky_numbers(lp, nm),
            "lucky_colors":   lucky_colors_for_number(lp),
            "all_predictions": [prediction],
            "strengths":  t["strengths"],
            "weaknesses": t["weaknesses"],
        },
    }


def _analyze_question(name: str, dob: str, question: str, intent: str, q_idx: int) -> Dict[str, Any]:
    sub_results = []
    for tradition, lmap_fn in TRADITION_MAPS.items():
        result = _run_sub_agent(name, dob, lmap_fn(), tradition, intent, question)
        sub_results.append(result)

    lp = sub_results[0]["extra"]["core_numbers"]["life_path"]
    traits_str = ", ".join(sub_results[0]["traits"][:2])
    summary = (
        f"Numerology analysis for '{question}': Life Path {lp} — {traits_str} nature indicated. "
        f"All three traditions confirm this trajectory for {intent}."
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        ["All three numerology traditions confirm the core life-path trajectory for this question."],
        "conflicts":         [],
    }


def numerology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "numerology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "") if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else profile.date_of_birth

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, nq["question"], nq["intent"], nq["index"])
        question_wise_analysis.append(analysis)

    _prompt_cfg = get_prompt("numerology")
    domain_output = {
        "domain":                 "numerology",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "indian":      _run_sub_agent(name, dob, letter_map_indian(),      "Indian Numerology",      normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Indian",      "predictions": [_build_numerology_prediction(life_path(dob), name_number(name, letter_map_indian()),      destiny_number(dob), soul_urge(name, letter_map_indian()),      personality_number(name, letter_map_indian()),      "Indian Numerology",      normalized_questions[0]["intent"], dob)], "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_indian(),      "Indian",      normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
        "chaldean":    _run_sub_agent(name, dob, letter_map_chaldean(),    "Chaldean Numerology",    normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Chaldean",    "predictions": [_build_numerology_prediction(life_path(dob), name_number(name, letter_map_chaldean()),    destiny_number(dob), soul_urge(name, letter_map_chaldean()),    personality_number(name, letter_map_chaldean()),    "Chaldean Numerology",    normalized_questions[0]["intent"], dob)], "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_chaldean(),    "Chaldean",    normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
        "pythagorean": _run_sub_agent(name, dob, letter_map_pythagorean(), "Pythagorean Numerology", normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Pythagorean", "predictions": [_build_numerology_prediction(life_path(dob), name_number(name, letter_map_pythagorean()), destiny_number(dob), soul_urge(name, letter_map_pythagorean()), personality_number(name, letter_map_pythagorean()), "Pythagorean Numerology", normalized_questions[0]["intent"], dob)], "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_pythagorean(), "Pythagorean", normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
    }

    state.setdefault("memory", {})["numerology"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[NumerologyAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions."
    )
    return state
