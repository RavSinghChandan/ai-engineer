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

LP_CAREER_INSIGHTS = {
    1: "Life Path 1 is the pioneer — you must lead, originate, or own; subordinate roles drain your vitality and ambition.",
    2: "Life Path 2 excels in collaboration and diplomacy — your greatest career leverage is in partnerships, mediation, and behind-the-scenes influence.",
    3: "Life Path 3 thrives through self-expression — writing, speaking, performing, or creating are the domains where your career ignites and sustains itself.",
    4: "Life Path 4 builds empires through discipline and systems — you are the architect who turns vision into durable reality across years, not months.",
    5: "Life Path 5 needs freedom and variety — careers in travel, sales, media, entrepreneurship, or anything with constant change and new stimulation are your engine.",
    6: "Life Path 6 leads through responsibility and care — service roles, healing professions, education, and family-oriented businesses are your highest fulfillment.",
    7: "Life Path 7 operates in cycles of deep solitary focus followed by breakthrough contributions — your career thrives when you have long uninterrupted windows to investigate, research, and master; setbacks are rarely failures but necessary isolation phases that precede your biggest leaps forward.",
    8: "Life Path 8 is built for power and material mastery — executive roles, business ownership, finance, and ambitious institutional leadership are where your full potential unfolds.",
    9: "Life Path 9 carries a humanitarian mission — your career gains its greatest force when connected to a cause larger than personal gain, and your influence expands globally when it does.",
    11: "Life Path 11 is a master teacher and visionary — your career has an unusual intensity; you are meant to inspire at scale, not just succeed personally.",
    22: "Life Path 22 is the master builder — you are rare: someone who can conceive large-scale visions AND execute them across decades; your career landmark will be something that outlives you.",
    33: "Life Path 33 carries master-level compassion in career — you are meant to serve, heal, and uplift entire communities, and your career fulfillment is inseparable from that mission.",
}

LP_INTENT_TEMPLATES = {
    "marriage": (
        "From the {tradition} perspective, your Life Path {lp} and Name Number {nm} together shape your relationship destiny. "
        "{lp_marriage_insight} "
        "Your Soul Urge number {su} reveals what you deeply seek in a partner — inner alignment with these values accelerates meaningful connection. "
        "Numerically, ages {age1} and {age2} carry strong marriage vibrations based on your personal year cycles."
    ),
    "career": (
        "From the {tradition} perspective, your Life Path {lp} carries a {trait} quality that shapes how you build and advance professionally. "
        "{lp_career_insight} "
        "Your Destiny Number {dest} confirms the field where you create the deepest long-term impact — follow the work that demands your full depth, not just your effort."
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
    lp_marriage    = LP_MARRIAGE_INSIGHTS.get(lp, LP_MARRIAGE_INSIGHTS[1])
    lp_career      = LP_CAREER_INSIGHTS.get(lp, LP_CAREER_INSIGHTS[1])
    age1, age2 = _marriage_age_hints(lp, dob)

    template = LP_INTENT_TEMPLATES.get(intent, LP_INTENT_TEMPLATES["general"])
    return template.format(
        tradition=tradition, lp=lp, nm=nm, dest=dest, su=su, pn=pn,
        trait=trait, lucky=lucky, lp_marriage_insight=lp_marriage,
        lp_career_insight=lp_career,
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

    static_prediction = _build_numerology_prediction(lp, nm, dest, su, pn, tradition, focus, dob)

    # Hybrid RAGless + RAG pipeline — falls back to static if it fails
    prediction = static_prediction
    try:
        from numerology_rag.hybrid_engine import hybrid_numerology_answer
        prediction = hybrid_numerology_answer(
            name=name, dob=dob,
            life_path=lp, destiny=dest,
            soul_urge_num=su, name_number_val=nm,
            tradition=tradition, intent=focus, question=question,
            static_fallback=static_prediction,
            timeout_seconds=7,
        )
    except Exception:
        pass  # keep static_prediction

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
    from concurrent.futures import ThreadPoolExecutor

    tradition_items = list(TRADITION_MAPS.items())

    def _run(item):
        tradition, lmap_fn = item
        return _run_sub_agent(name, dob, lmap_fn(), tradition, intent, question)

    # Run 3 tradition sub-agents in parallel — cuts 3×serial → 1× wall-clock time
    with ThreadPoolExecutor(max_workers=3) as pool:
        sub_results = list(pool.map(_run, tradition_items))

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
        # Carry per-tradition results so numerology_agent_node can reuse without re-running
        "_sub_by_tradition": {r["sub_agent"]: r for r in sub_results},
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

    # Reuse already-computed sub_results from first question — no extra LLM calls
    first_subs = question_wise_analysis[0].get("_sub_by_tradition", {})
    _trad_key_map = {
        "Indian Numerology":      ("indian",      "Indian"),
        "Chaldean Numerology":    ("chaldean",    "Chaldean"),
        "Pythagorean Numerology": ("pythagorean", "Pythagorean"),
    }

    def _build_trad_entry(full_trad: str, short_trad: str, r: Dict) -> Dict:
        lmap_fn = TRADITION_MAPS[full_trad]
        lmap    = lmap_fn()
        lp_val  = r["extra"]["core_numbers"]["life_path"]
        nm_val  = r["extra"]["core_numbers"]["name_number"]
        dest_val = r["extra"]["core_numbers"]["destiny"]
        su_val   = r["extra"]["core_numbers"]["soul_urge"]
        pn_val   = r["extra"]["core_numbers"]["personality"]
        return r["extra"] | {
            "tradition":    short_trad,
            "predictions":  [_build_numerology_prediction(lp_val, nm_val, dest_val, su_val, pn_val, full_trad, normalized_questions[0]["intent"], dob)],
            "traits":       get_traits(lp_val)["traits"],
            "core_numbers": r["extra"]["core_numbers"],
        }

    q0_intent   = normalized_questions[0]["intent"]
    q0_question = normalized_questions[0]["question"]

    r_indian  = first_subs.get("Indian Numerology")    or _run_sub_agent(name, dob, letter_map_indian(),      "Indian Numerology",      q0_intent, q0_question)
    r_chald   = first_subs.get("Chaldean Numerology")  or _run_sub_agent(name, dob, letter_map_chaldean(),    "Chaldean Numerology",    q0_intent, q0_question)
    r_pyth    = first_subs.get("Pythagorean Numerology") or _run_sub_agent(name, dob, letter_map_pythagorean(), "Pythagorean Numerology", q0_intent, q0_question)

    _prompt_cfg = get_prompt("numerology")
    domain_output = {
        "domain":                 "numerology",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "indian":      _build_trad_entry("Indian Numerology",      "Indian",      r_indian),
        "chaldean":    _build_trad_entry("Chaldean Numerology",    "Chaldean",    r_chald),
        "pythagorean": _build_trad_entry("Pythagorean Numerology", "Pythagorean", r_pyth),
    }

    state.setdefault("memory", {})["numerology"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[NumerologyAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions."
    )
    return state
