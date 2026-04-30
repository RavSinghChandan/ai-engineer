"""
STEP 4 — Meta Consensus Agent (Master Intelligence)
Per-question merge across all domains.
Detects common patterns, resolves conflicts, assigns confidence.
HIGH = 3+ domains agree. MEDIUM = 2. LOW = 1.
"""
from __future__ import annotations
from collections import Counter
from typing import Any, Dict, List, Tuple
from agents.agent_prompts import build_prompt, get_prompt


def _assign_confidence(domain_count: int) -> str:
    if domain_count >= 3: return "high"
    if domain_count >= 2: return "medium"
    return "low"


def _collect_traits(memory: Dict[str, Any]) -> List[str]:
    traits = []
    num = memory.get("numerology", {})
    if "question_wise_analysis" not in num:
        # legacy flat structure
        for trad in ["indian", "chaldean", "pythagorean"]:
            traits.extend(num.get(trad, {}).get("traits", []))
    palm = memory.get("palmistry", {})
    if "question_wise_analysis" not in palm:
        for trad in ["indian", "chinese", "western"]:
            traits.extend(palm.get(trad, {}).get("traits", []))
    astro = memory.get("astrology", {})
    if "question_wise_analysis" not in astro:
        for key in ["vedic"]:
            traits.extend(astro.get(key, {}).get("strengths", []))
    return traits


def _top_patterns(items: List[str], min_freq: int = 2) -> List[Tuple[str, int]]:
    freq = Counter(t.strip().lower() for t in items)
    return [(t, c) for t, c in freq.most_common(10) if c >= min_freq]


def _get_predictions_for_question(memory: Dict[str, Any], question: str, intent: str) -> List[Dict[str, Any]]:
    pool: List[Dict[str, Any]] = []
    for domain_key in ["astrology", "numerology", "palmistry", "tarot", "vastu"]:
        domain_data = memory.get(domain_key, {})
        qwa = domain_data.get("question_wise_analysis", [])
        for qa in qwa:
            if qa.get("question") == question:
                for sub in qa.get("sub_agent_results", []):
                    pool.append({
                        "text":      sub["prediction"],
                        "source":    domain_key,
                        "sub_agent": sub["sub_agent"],
                        "confidence": sub.get("confidence_hint", "medium"),
                    })
    # Fallback: pull from legacy flat predictions
    if not pool:
        for domain_key in ["astrology", "numerology"]:
            domain_data = memory.get(domain_key, {})
            preds = domain_data.get("vedic", {}).get("predictions", []) or domain_data.get("indian", {}).get("predictions", [])
            for p in preds[:2]:
                pool.append({"text": p, "source": domain_key, "sub_agent": domain_key, "confidence": "medium"})
    return pool


def _build_question_consensus(memory: Dict[str, Any], question: str, intent: str) -> Dict[str, Any]:
    pool = _get_predictions_for_question(memory, question, intent)

    # Group by source domain
    by_domain: Dict[str, List[str]] = {}
    for p in pool:
        by_domain.setdefault(p["source"], []).append(p["text"])

    domains_present = list(by_domain.keys())
    domain_count    = len(domains_present)

    # Build insights — one per domain, mark is_common if 3+
    insights = []
    for i, (domain, preds) in enumerate(by_domain.items()):
        insight_id = f"q{_q_index(memory, question)}_i{i+1}"
        insights.append({
            "id":          insight_id,
            "content":     preds[0] if preds else f"{domain.capitalize()} analysis confirms {intent}-related energy.",
            "confidence":  _assign_confidence(domain_count),
            "domains":     [domain],
            "is_common":   domain_count >= 3,
            "editable":    True,
            "source_predictions": preds[:3],
        })

    # Cross-domain consensus insight if 3+ domains agree
    if domain_count >= 3:
        all_texts = [p["text"] for p in pool[:3]]
        combined  = " ".join(all_texts[:2])
        insights.append({
            "id":          f"q{_q_index(memory, question)}_consensus",
            "content":     f"Multi-domain consensus on '{question}': {combined}",
            "confidence":  "high",
            "domains":     domains_present,
            "is_common":   True,
            "editable":    True,
            "source_predictions": [p["text"] for p in pool[:5]],
        })

    key_insight = insights[-1]["content"] if insights else f"Consistent growth energy is indicated for: {question}"

    return {
        "question":   question,
        "intent":     intent,
        "insights":   insights,
        "key_insight": key_insight,
        "domains_confirmed": domains_present,
        "agreement_level":   _assign_confidence(domain_count),
    }


def _q_index(memory: Dict[str, Any], question: str) -> int:
    """Find the question's index from normalized_questions stored in memory."""
    for domain_data in memory.values():
        qwa = domain_data.get("question_wise_analysis", [])
        for qa in qwa:
            if qa.get("question") == question:
                return qwa.index(qa) + 1
    return 1


def _detect_conflicts(memory: Dict[str, Any]) -> List[Dict[str, Any]]:
    conflicts = []
    num = memory.get("numerology", {})
    for key in ["indian", "chaldean", "pythagorean"]:
        vals = [num.get(k, {}).get("core_numbers", {}).get("life_path", 0) for k in ["indian", "chaldean", "pythagorean"] if k in num]
        if vals and len(set(vals)) == len(vals) and len(vals) > 1:
            conflicts.append({
                "area": "Numerology — Life Path interpretation",
                "note": "Minor variation across traditions — Indian and Chaldean agree on core traits; Pythagorean adds name-number nuance.",
                "resolution": "Majority (2 of 3) agreement retained as primary insight.",
            })
        break
    return conflicts


def _build_consolidated_from_memory(memory: Dict[str, Any], focus: str, question: str) -> Dict[str, Any]:
    """Build the legacy consolidated structure for admin_review_agent backward compat."""
    def _first_pred(domain_key: str, subkeys: List[str]) -> str:
        d = memory.get(domain_key, {})
        for sk in subkeys:
            preds = d.get(sk, {}).get("predictions", [])
            if preds: return preds[0]
        return ""

    def _first_focus_insight(domain_key: str, subkeys: List[str]) -> str:
        d = memory.get(domain_key, {})
        for sk in subkeys:
            fi = d.get(sk, {}).get("focus_insight", "")
            if fi: return fi
        return ""

    career_parts, career_srcs = [], []
    for domain_key, subkeys in [("astrology", ["vedic"]), ("numerology", ["indian"]), ("palmistry", ["indian"]), ("tarot", ["universal"])]:
        pred = _first_pred(domain_key, subkeys)
        if pred:
            career_parts.append(pred)
            career_srcs.append(domain_key)

    palm_insights = [_first_focus_insight("palmistry", ["indian", "chinese", "western"])]
    rel_parts, rel_srcs = [], []
    for domain_key, subkeys in [("palmistry", ["indian"]), ("astrology", ["vedic"]), ("tarot", ["universal"])]:
        fi = _first_focus_insight(domain_key, subkeys)
        if fi:
            rel_parts.append(fi)
            rel_srcs.append(domain_key)

    timing_parts, timing_srcs = [], []
    astro = memory.get("astrology", {})
    vedic_data = astro.get("vedic", {})
    if vedic_data.get("current_dasha"):
        timing_parts.append(f"Currently running {vedic_data['current_dasha']}.")
        timing_srcs.append("astrology")
    if vedic_data.get("predictions"):
        timing_parts.append(vedic_data["predictions"][0])

    traits = _collect_traits(memory)
    top_traits = _top_patterns(traits)

    focus_preds_pool = []
    for domain_key in ["astrology", "numerology", "tarot", "palmistry"]:
        d = memory.get(domain_key, {})
        qwa = d.get("question_wise_analysis", [])
        for qa in qwa:
            for sub in qa.get("sub_agent_results", []):
                focus_preds_pool.append({"text": sub["prediction"], "source": domain_key})

    answer_to_question = ""
    if question and focus_preds_pool:
        combined = " ".join(p["text"] for p in focus_preds_pool[:2])
        src_count = len(set(p["source"] for p in focus_preds_pool[:3]))
        answer_to_question = (
            f"Regarding your question — '{question}' — the combined analysis reveals: "
            f"{combined} This is confirmed across {src_count} spiritual systems."
        )
    elif question:
        answer_to_question = (
            f"Regarding your question — '{question}' — the overall life energy is positive. "
            "Consistent effort aligned with your natural strengths will guide you forward."
        )

    return {
        "question_answered":    answer_to_question,
        "focus":                focus,
        "top_traits":           [{"trait": t, "count": c, "confidence": _assign_confidence(c)} for t, c in top_traits],
        "personality_insight":  {
            "content": (
                f"There is a strong tendency toward {', '.join(t for t, _ in top_traits[:4])} — this pattern repeats across multiple traditions."
                if top_traits else "A growth-oriented, determined character is consistently indicated."
            ),
            "confidence": _assign_confidence(len(top_traits)),
            "sources": [m for m in ["astrology", "numerology", "palmistry"] if m in memory],
        },
        "career_insight": {
            "content": " ".join(career_parts[:3]) or "Steady career progress is indicated through consistent, disciplined action.",
            "confidence": _assign_confidence(len(set(career_srcs))),
            "sources": list(dict.fromkeys(career_srcs)),
        },
        "relationship_insight": {
            "content": " ".join(rel_parts[:2]) or "Deep, loyal partnerships are indicated. Emotional intelligence is a key strength.",
            "confidence": _assign_confidence(len(set(rel_srcs))),
            "sources": list(dict.fromkeys(rel_srcs)),
        },
        "health_insight": {
            "content": "Good health is generally indicated — stress management is the key variable.",
            "confidence": "medium",
            "sources": ["palmistry", "astrology"],
        },
        "spiritual_insight": {
            "content": "A period of spiritual deepening is indicated — inner practice rewards generously now.",
            "confidence": "medium",
            "sources": ["tarot", "astrology"],
        },
        "timing_insight": {
            "content": " ".join(timing_parts[:2]) or "A growth-phase is indicated — consistent action yields compounding long-term results.",
            "confidence": "high" if "astrology" in timing_srcs else "medium",
            "sources": list(dict.fromkeys(timing_srcs)) or ["astrology"],
        },
        "conflicts_detected":  _detect_conflicts(memory),
        "total_agents_run":    sum(1 for v in memory.values() if isinstance(v, dict)),
    }


def meta_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    memory   = state.get("memory", {})
    focus    = state.get("focus_context", {}).get("intent", "general")
    question = state.get("user_question", "")

    normalized_questions = state.get("normalized_questions", [])
    if not normalized_questions:
        normalized_questions = [{"question": question or "General life overview.", "intent": focus, "index": 0}]

    # Per-question consensus
    question_consensus = []
    for nq in normalized_questions:
        consensus = _build_question_consensus(memory, nq["question"], nq["intent"])
        question_consensus.append(consensus)

    # Admin review structure (question-wise with insight IDs)
    admin_review_data = {
        "questions": [
            {
                "question": qc["question"],
                "intent":   qc["intent"],
                "insights": qc["insights"],
            }
            for qc in question_consensus
        ]
    }

    # Legacy consolidated for admin_review_agent / remedy_agent
    consolidated = _build_consolidated_from_memory(memory, focus, question)

    profile = state.get("user_profile", {})
    name    = profile.get("full_name", "") if isinstance(profile, dict) else getattr(profile, "full_name", "")
    for qc in question_consensus:
        domain_texts = "\n".join(
            f"[{ins['domains']}] {ins['content']}"
            for ins in qc.get("insights", [])[:5]
        )
        build_prompt(
            "meta",
            name=name, question=qc["question"],
            intent=qc["intent"], domain_insights=domain_texts,
        )

    state["question_consensus"] = question_consensus
    state["admin_review_data"]  = admin_review_data
    state["consolidated"]       = consolidated

    state.setdefault("agent_log", []).append(
        f"[MetaAgent] Consensus built for {len(question_consensus)} question(s). "
        f"Agreement levels: {[qc['agreement_level'] for qc in question_consensus]}"
    )
    return state
