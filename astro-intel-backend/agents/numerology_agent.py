"""
STEP 2a — Numerology Super Agent
Runs 3 sub-agents (Indian, Chaldean, Pythagorean) per question.
Stores DomainOutput with question_wise_analysis[] in memory.
"""
from __future__ import annotations
from typing import Any, Dict, List
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

FOCUS_PREDICTIONS: Dict[str, List[str]] = {
    "career":       [
        "Career advancement is strongly supported — leadership roles align with your life-path energy.",
        "A favorable cycle for professional recognition and skill-building is indicated.",
    ],
    "finance":      [
        "Financial growth is indicated through disciplined planning aligned with your lucky number cycles.",
        "Lucky numbers align with income cycles — a steady accumulation phase is suggested.",
    ],
    "marriage":     [
        "Partnership numbers indicate compatibility with emotionally expressive, grounded individuals.",
        "A meaningful relationship chapter is opening — emotional depth is your strength.",
    ],
    "health":       [
        "Vitality is well supported — routine and discipline enhance physical resilience.",
        "Mental well-being benefits from creative expression and community engagement.",
    ],
    "spirituality": [
        "Your life-path number carries deep spiritual resonance — meditation amplifies inner growth.",
        "A period of inner seeking and clarity is indicated — spiritual practice rewards generously.",
    ],
    "education":    [
        "Academic and intellectual advancement is strongly favored during this cycle.",
        "Consistent study and mentorship align with your destiny number's energy.",
    ],
    "travel":       [
        "Movement and exploration are positively aspected — international opportunities may arise.",
        "Lucky numbers align with travel timing — plan and act with confidence.",
    ],
    "children":     [
        "Family expansion is positively indicated — nurturing energy is strongly present.",
        "Life-path numbers align with parenthood themes — a meaningful chapter is forming.",
    ],
    "general":      [
        "A balanced, steady period of growth is indicated across all life areas.",
        "Consistent effort aligned with your natural strengths yields compounding results.",
    ],
}


def _predictions_for_focus(lp: int, nm: int, focus: str, tradition: str) -> List[str]:
    base = [
        f"There is a tendency toward {get_traits(lp)['traits'][0].lower()} driving key decisions.",
        f"The {tradition} tradition suggests natural aptitude aligned with number {lp} energy.",
    ]
    specific = FOCUS_PREDICTIONS.get(focus, FOCUS_PREDICTIONS["general"])
    return specific + base


def _run_sub_agent(name: str, dob: str, lmap: Dict[str, int], tradition: str, focus: str, question: str) -> Dict[str, Any]:
    lp   = life_path(dob)
    dest = destiny_number(dob)
    nm   = name_number(name, lmap)
    su   = soul_urge(name, lmap)
    pn   = personality_number(name, lmap)
    t    = get_traits(lp)
    preds = _predictions_for_focus(lp, nm, focus, tradition)
    return {
        "sub_agent":        tradition,
        "question":         question,
        "prediction":       preds[0],
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
            "all_predictions": preds,
            "strengths":  t["strengths"],
            "weaknesses": t["weaknesses"],
        },
    }


def _analyze_question(name: str, dob: str, question: str, intent: str, q_idx: int) -> Dict[str, Any]:
    sub_results = []
    for tradition, lmap_fn in TRADITION_MAPS.items():
        result = _run_sub_agent(name, dob, lmap_fn(), tradition, intent, question)
        sub_results.append(result)

    # Find agreements — predictions that share common themes
    all_preds = [r["prediction"] for r in sub_results]
    agreements = [p for p in all_preds if all_preds.count(p) > 1]
    if not agreements:
        agreements = ["All three numerology traditions broadly agree on the core life-path trajectory."]

    # Detect conflicts — differing confidence levels
    confidences = [r["confidence_hint"] for r in sub_results]
    conflicts = []
    if len(set(confidences)) > 1:
        conflicts.append("Minor variation in confidence across traditions — majority reading is retained as primary.")

    # Domain summary
    lp = sub_results[0]["extra"]["core_numbers"]["life_path"]
    traits_str = ", ".join(sub_results[0]["traits"][:2])
    summary = (
        f"Numerology analysis for '{question}': Life Path {lp} indicates a {traits_str} nature. "
        f"All three traditions confirm this trajectory with {'high' if not conflicts else 'medium'} confidence."
    )

    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": sub_results,
        "domain_summary":    summary,
        "agreements":        agreements[:3],
        "conflicts":         conflicts,
    }


def numerology_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "numerology" not in state.get("selected_modules", []):
        return state

    profile = state["user_profile"]
    name = profile.get("full_name", "") if isinstance(profile, dict) else profile.full_name
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else profile.date_of_birth

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        # Fallback: single question mode
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    question_wise_analysis = []
    for nq in normalized_questions:
        analysis = _analyze_question(name, dob, nq["question"], nq["intent"], nq["index"])
        question_wise_analysis.append(analysis)

    domain_output = {
        "domain":                 "numerology",
        "question_wise_analysis": question_wise_analysis,
        # Legacy flat structure for backward compat with admin_review_agent
        "indian":      _run_sub_agent(name, dob, letter_map_indian(),      "Indian Numerology",      normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Indian",      "predictions": _predictions_for_focus(life_path(dob), name_number(name, letter_map_indian()),      normalized_questions[0]["intent"], "Indian"),      "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_indian(),      "Indian",      normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
        "chaldean":    _run_sub_agent(name, dob, letter_map_chaldean(),    "Chaldean Numerology",    normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Chaldean",    "predictions": _predictions_for_focus(life_path(dob), name_number(name, letter_map_chaldean()),    normalized_questions[0]["intent"], "Chaldean"),    "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_chaldean(),    "Chaldean",    normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
        "pythagorean": _run_sub_agent(name, dob, letter_map_pythagorean(), "Pythagorean Numerology", normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"] | {"tradition": "Pythagorean", "predictions": _predictions_for_focus(life_path(dob), name_number(name, letter_map_pythagorean()), normalized_questions[0]["intent"], "Pythagorean"), "traits": get_traits(life_path(dob))["traits"], "core_numbers": _run_sub_agent(name, dob, letter_map_pythagorean(), "Pythagorean", normalized_questions[0]["intent"], normalized_questions[0]["question"])["extra"]["core_numbers"]},
    }

    state.setdefault("memory", {})["numerology"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[NumerologyAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions."
    )
    return state
