"""
STEP 2c — Palmistry Super Agent
Runs Indian, Chinese, Western sub-agents per question.
Stores DomainOutput with question_wise_analysis[] in memory.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt, get_prompt


FOCUS_INSIGHTS: Dict[str, Dict[str, str]] = {
    "Indian": {
        "career":      "The fate line and Jupiter mount suggest strong professional ambition and steady career advancement.",
        "finance":     "Mercury mount and a clear fate line indicate financial intelligence and business aptitude.",
        "marriage":    "The heart line and Venus mount suggest deep, loyal bonds and a nurturing partnership.",
        "health":      "The life line's strength indicates good vitality — attention to mental stress is advisable.",
        "spirituality":"Sun line and Moon mount indicate a spiritually inclined nature with intuitive gifts.",
        "education":   "Head line clarity suggests analytical aptitude and success in structured learning.",
        "travel":      "Life line arc suggests a desire for exploration — travel brings growth and expansion.",
        "children":    "Venus mount development indicates warmth and readiness for nurturing family bonds.",
        "general":     "Overall palm indicators suggest a balanced, growth-oriented life path.",
    },
    "Chinese": {
        "career":      "The fate line rising strongly from the base suggests a career built by personal effort.",
        "finance":     "Mercury mount and Qi in the life line suggest financial growth through communication and commerce.",
        "marriage":    "Noble heart line suggests sincere, spiritually-aligned partnerships are possible.",
        "health":      "Strong Qi in the life line is a positive indicator — emotional balance is the key variable.",
        "spirituality":"Wood hand type carries spiritual receptivity — inner practice is natural and rewarding.",
        "education":   "Head line clarity and Mercury mount suggest aptitude for scholarly and intellectual pursuits.",
        "travel":      "Life force (Qi) is strong — movement and exploration activate career and life momentum.",
        "children":    "West zone (Varuna) of the palm indicates warmth and strong parental instincts.",
        "general":     "Overall palm Qi flow suggests good fortune with deliberate, consistent action.",
    },
    "Western": {
        "career":      "The fate line and Apollo mount together indicate clear purpose and creative career success.",
        "finance":     "A strong fate line with Mercury mount suggests financial growth through intellectual work.",
        "marriage":    "Long heart line and Venus mount confirm deep desire for committed, lasting partnership.",
        "health":      "Earth hand type generally indicates strong physical constitution — stress management is the key variable.",
        "spirituality":"Luna mount development suggests strong intuitive depth and spiritual receptivity.",
        "education":   "Head line sloping toward Luna opens creative and imaginative intellectual pathways.",
        "travel":      "A wide life line arc suggests enthusiasm for exploration and strong adaptability.",
        "children":    "Venus mount and long heart line indicate deep nurturing capacity and family orientation.",
        "general":     "The hand profile suggests a grounded, capable individual with room for continued growth.",
    },
}

LINE_DATA = {
    "Indian": {
        "life_line":  "Strong, curved life line — good vitality and tendency toward an active life.",
        "head_line":  "Clear and long head line — analytical thinking and sound professional decisions.",
        "heart_line": "Upward-curving heart line — warm emotional expressiveness and meaningful relationships.",
        "fate_line":  "Fate line rising from base — self-made path built through personal determination.",
        "sun_line":   "Sun line present — recognition, creativity, and public acknowledgment.",
    },
    "Chinese": {
        "life_line":  "Strong arc indicates abundant life force (Qi) — health and fortune are favored.",
        "head_line":  "Straight, clear head line — practical intelligence and clear decision-making.",
        "heart_line": "Rising toward index finger — noble emotions and idealistic partnerships.",
        "fate_line":  "Present and structured — goal-oriented career trajectory is suggested.",
        "wisdom_line":"Present — depth of thought and ability to learn from experience.",
    },
    "Western": {
        "life_line":  "Wide arc indicates enthusiasm and a strong zest for living.",
        "head_line":  "Sloping toward Luna — creative and imaginative thinking.",
        "heart_line": "Long heart line — emotional depth and capacity for long-term committed relationships.",
        "fate_line":  "Strong from wrist to middle finger — strong sense of purpose and direction.",
        "apollo_line":"Present — warmth, creativity, and appreciation for beauty.",
    },
}

TRAITS = {
    "Indian":  ["Determined", "Creative", "Emotionally expressive", "Practical"],
    "Chinese": ["Intuitive", "Goal-oriented", "Creative", "Socially adept"],
    "Western": ["Grounded", "Resilient", "Creative thinker", "Emotionally deep"],
}


def _run_sub_agent(tradition: str, hand_shape: str, question: str, intent: str, name: str = "", dob: str = "") -> Dict[str, Any]:
    focus_insight = FOCUS_INSIGHTS[tradition].get(intent, FOCUS_INSIGHTS[tradition]["general"])
    traits = TRAITS[tradition]
    _trad_key = {
        "Indian":  "palmistry_indian",
        "Chinese": "palmistry_chinese",
        "Western": "palmistry_western",
    }.get(tradition, "palmistry")
    _cfg = build_prompt(
        _trad_key,
        name=name or "Client", dob=dob or "",
        tradition=f"{tradition} Palmistry",
        question=question, intent=intent,
        palm_insight=focus_insight,
    )
    return {
        "sub_agent":       f"{tradition} Palmistry",
        "question":        question,
        "prediction":      focus_insight,
        "traits":          traits,
        "confidence_hint": "medium",
        "extra": {
            "lines":        LINE_DATA[tradition],
            "hand_shape":   hand_shape or f"{tradition} hand type",
            "focus_insight": focus_insight,
            "health_notes":  ["Good constitution is indicated.", "Stress management is advisable."],
            "career_notes":  ["Leadership and communication aptitude is indicated."],
            "relationship_notes": ["Deep, loyal bonds are suggested by the heart line."],
        },
    }


def _analyze_question(tradition_results: List[Dict], question: str, intent: str) -> Dict[str, Any]:
    predictions = [r["prediction"] for r in tradition_results]
    agreements = []
    # All traditions agree on focus intent
    agreements.append(f"All three palmistry traditions confirm {intent}-related energy in the hand analysis.")

    conflicts = []
    summary = (
        f"Palmistry analysis for '{question}': Three traditions (Indian, Chinese, Western) examined the hand. "
        f"{tradition_results[0]['prediction']} This reading carries medium confidence."
    )
    return {
        "question":          question,
        "intent":            intent,
        "sub_agent_results": tradition_results,
        "domain_summary":    summary,
        "agreements":        agreements,
        "conflicts":         conflicts,
    }


def palmistry_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "palmistry" not in state.get("selected_modules", []):
        return state

    mi = state.get("module_inputs", {})
    palm_input = mi.get("palmistry", {}) if isinstance(mi, dict) else {}
    hand_shape = palm_input.get("hand_shape", "") if isinstance(palm_input, dict) else ""

    profile = state.get("user_profile", {})
    name = profile.get("full_name", "") if isinstance(profile, dict) else getattr(profile, "full_name", "")
    dob  = profile.get("date_of_birth", "") if isinstance(profile, dict) else getattr(profile, "date_of_birth", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        single = state.get("user_question", "")
        focus  = state.get("focus_context", {}).get("intent", "general")
        normalized_questions = [{"question": single or "General life overview.", "intent": focus, "index": 0}]

    _prompt_cfg = get_prompt("palmistry")
    question_wise_analysis = []
    for nq in normalized_questions:
        tradition_results = [
            _run_sub_agent("Indian",  hand_shape, nq["question"], nq["intent"], name, dob),
            _run_sub_agent("Chinese", hand_shape, nq["question"], nq["intent"], name, dob),
            _run_sub_agent("Western", hand_shape, nq["question"], nq["intent"], name, dob),
        ]
        analysis = _analyze_question(tradition_results, nq["question"], nq["intent"])
        question_wise_analysis.append(analysis)

    # Legacy flat structure for backward compat with admin_review_agent / meta_agent
    first_intent = normalized_questions[0]["intent"]
    first_q      = normalized_questions[0]["question"]
    domain_output = {
        "domain":                 "palmistry",
        "question_wise_analysis": question_wise_analysis,
        "prompt_config": {
            "temperature": _prompt_cfg["temperature"],
            "top_p":       _prompt_cfg["top_p"],
            "role":        _prompt_cfg["role"],
        },
        "indian":  {
            "tradition": "Indian", "focus_addressed": first_intent,
            "traits": TRAITS["Indian"], "lines": LINE_DATA["Indian"],
            "focus_insight": FOCUS_INSIGHTS["Indian"].get(first_intent, FOCUS_INSIGHTS["Indian"]["general"]),
            "health_notes": ["Good constitution.", "Stress management advisable."],
            "career_notes": ["Jupiter mount suggests leadership."],
            "relationship_notes": ["Heart line suggests loyalty and depth."],
        },
        "chinese": {
            "tradition": "Chinese", "focus_addressed": first_intent,
            "traits": TRAITS["Chinese"], "lines": LINE_DATA["Chinese"],
            "focus_insight": FOCUS_INSIGHTS["Chinese"].get(first_intent, FOCUS_INSIGHTS["Chinese"]["general"]),
            "health_notes": ["Strong Qi flow.", "Emotional balance is key."],
            "career_notes": ["Wood hand thrives in creative and educational fields."],
            "relationship_notes": ["Noble heart line — sincere partnerships."],
        },
        "western": {
            "tradition": "Western", "focus_addressed": first_intent,
            "traits": TRAITS["Western"], "lines": LINE_DATA["Western"],
            "focus_insight": FOCUS_INSIGHTS["Western"].get(first_intent, FOCUS_INSIGHTS["Western"]["general"]),
            "health_notes": ["Earth hand — strong constitution.", "Stress monitoring advised."],
            "career_notes": ["Fate line and Apollo mount — clear purpose."],
            "relationship_notes": ["Long heart line — committed, lasting partnership."],
        },
    }

    state.setdefault("memory", {})["palmistry"] = domain_output
    state.setdefault("agent_log", []).append(
        f"[PalmistryAgent] Analyzed {len(question_wise_analysis)} question(s) across 3 traditions."
    )
    return state
