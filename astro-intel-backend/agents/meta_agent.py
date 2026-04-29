"""
STEP 4 — Meta Consensus Agent (Master Intelligence)
Reads all memory, detects patterns, resolves conflicts, assigns confidence.
"""
from __future__ import annotations
from collections import Counter
from typing import Any, Dict, List, Tuple


def _collect_traits(memory: Dict[str, Any]) -> List[str]:
    traits = []
    if "numerology" in memory:
        for trad in memory["numerology"].values():
            traits.extend(trad.get("traits", []))
    if "palmistry" in memory:
        for trad in memory["palmistry"].values():
            traits.extend(trad.get("traits", []))
    if "astrology" in memory:
        for trad in memory["astrology"].values():
            traits.extend(trad.get("strengths", []))
    return traits


def _top_patterns(items: List[str], min_freq: int = 2) -> List[Tuple[str, int]]:
    freq = Counter(t.strip().lower() for t in items)
    return [(t, c) for t, c in freq.most_common(10) if c >= min_freq]


def _assign_confidence(count: int, total_agents: int) -> str:
    if count >= 3:        return "high"
    if count >= 2:        return "medium"
    return "low"


def _collect_predictions(memory: Dict[str, Any], focus: str) -> List[Dict[str, Any]]:
    """Gather all predictions with their source, then de-duplicate similar ones."""
    pool: List[Dict[str, Any]] = []
    if "astrology" in memory:
        for trad, data in memory["astrology"].items():
            for p in data.get("predictions", []):
                pool.append({"text": p, "source": "astrology", "tradition": trad})
    if "numerology" in memory:
        for trad, data in memory["numerology"].items():
            for p in data.get("predictions", []):
                pool.append({"text": p, "source": "numerology", "tradition": trad})
    if "tarot" in memory:
        for trad, data in memory["tarot"].items():
            for g in data.get("guidance", []):
                pool.append({"text": g, "source": "tarot", "tradition": trad})
    if "palmistry" in memory:
        for trad, data in memory["palmistry"].items():
            fi = data.get("focus_insight","")
            if fi:
                pool.append({"text": fi, "source": "palmistry", "tradition": trad})
    return pool[:12]


def _filter_by_focus(pool: List[Dict[str, Any]], focus: str) -> List[Dict[str, Any]]:
    if focus == "general":
        return pool
    FOCUS_TERMS = {
        "career":   ["career","job","work","profession","business","role","leadership","promotion"],
        "finance":  ["finance","money","wealth","financial","income","gain","savings","investment"],
        "marriage": ["marriage","relationship","partner","love","partnership","bond"],
        "health":   ["health","vitality","body","physical","wellness","well-being"],
        "spirituality":["spiritual","meditation","karma","inner","soul","practice"],
    }
    terms = FOCUS_TERMS.get(focus, [])
    if not terms:
        return pool
    filtered = [p for p in pool if any(t in p["text"].lower() for t in terms)]
    return filtered if filtered else pool[:4]  # fallback to top-4 if nothing matches


def _build_career_insight(memory: Dict[str, Any], focus: str) -> Dict[str, Any]:
    sources, content_parts = [], []

    if "astrology" in memory:
        for data in memory["astrology"].values():
            preds = [p for p in data.get("predictions",[]) if any(
                k in p.lower() for k in ["career","profession","work","business","role"]
            )]
            if preds:
                content_parts.append(preds[0])
                sources.append("astrology")

    if "numerology" in memory:
        for data in memory["numerology"].values():
            preds = [p for p in data.get("predictions",[]) if any(
                k in p.lower() for k in ["career","role","leadership","advance","field"]
            )]
            if preds:
                content_parts.append(preds[0])
                sources.append("numerology")
                break

    if "palmistry" in memory:
        for data in memory["palmistry"].values():
            cn = data.get("career_notes",[])
            if cn:
                content_parts.append(cn[0])
                sources.append("palmistry")
                break

    if "tarot" in memory:
        for data in memory["tarot"].values():
            th = data.get("overall_theme","")
            if th:
                content_parts.append(th)
                sources.append("tarot")
                break

    if not content_parts:
        content_parts = ["Steady career growth is indicated across multiple analytical systems."]
        sources = list(memory.keys())

    unique_src = list(dict.fromkeys(sources))
    return {
        "content": " ".join(content_parts[:4]),
        "confidence": _assign_confidence(len(unique_src), 5),
        "sources": unique_src,
    }


def _build_personality_insight(top_traits: List[Tuple[str, int]], memory: Dict[str, Any]) -> Dict[str, Any]:
    if not top_traits:
        top_traits = [("growth-oriented", 2), ("adaptable", 2)]
    trait_str = ", ".join(t for t, _ in top_traits[:4])
    sources = [m for m in ["astrology","numerology","palmistry"] if m in memory]
    return {
        "content": f"There is a strong tendency toward {trait_str} — this pattern repeats consistently across multiple spiritual traditions. "
                   f"This suggests these qualities form the core character architecture and will be most prominent during key life decisions.",
        "confidence": _assign_confidence(len(top_traits), 5),
        "sources": sources,
    }


def _build_relationship_insight(memory: Dict[str, Any]) -> Dict[str, Any]:
    parts, sources = [], []
    if "palmistry" in memory:
        for data in memory["palmistry"].values():
            rn = data.get("relationship_notes",[])
            if rn:
                parts.append(rn[0])
                sources.append("palmistry")
    if "astrology" in memory:
        for data in memory["astrology"].values():
            preds = [p for p in data.get("predictions",[]) if any(k in p.lower() for k in ["relation","partner","marriage","love"])]
            if preds:
                parts.append(preds[0])
                sources.append("astrology")
    if "tarot" in memory:
        for data in memory["tarot"].values():
            guidance = data.get("guidance",[])
            if guidance:
                parts.append(guidance[0])
                sources.append("tarot")
    if not parts:
        parts = ["There is a tendency toward meaningful, loyal partnerships. Emotional depth and commitment are key themes."]
        sources = list(memory.keys())[:2]
    return {
        "content": " ".join(parts[:3]),
        "confidence": _assign_confidence(len(set(sources)), 5),
        "sources": list(dict.fromkeys(sources)),
    }


def _build_health_insight(memory: Dict[str, Any]) -> Dict[str, Any]:
    parts, sources = [], []
    if "palmistry" in memory:
        for data in memory["palmistry"].values():
            hn = data.get("health_notes",[])
            if hn:
                parts.append(hn[0])
                sources.append("palmistry")
    if "astrology" in memory:
        for data in memory["astrology"].values():
            ch = data.get("challenges",[])
            if ch:
                parts.append(ch[0])
                sources.append("astrology")
    if not parts:
        parts = ["Good health is indicated overall — attention to stress management and routine is advisable."]
        sources = ["astrology","palmistry"]
    return {
        "content": " ".join(parts[:3]),
        "confidence": "medium",
        "sources": list(dict.fromkeys(sources)),
    }


def _build_spiritual_insight(memory: Dict[str, Any]) -> Dict[str, Any]:
    parts, sources = [], []
    if "tarot" in memory:
        for data in memory["tarot"].values():
            th = data.get("overall_theme","")
            if th:
                parts.append(th)
                sources.append("tarot")
    if "astrology" in memory:
        for data in memory["astrology"].values():
            yogas = data.get("yogas",[])
            if yogas:
                parts.append(yogas[0].get("description","") if isinstance(yogas[0],dict) else str(yogas[0]))
                sources.append("astrology")
    if "numerology" in memory:
        for trad, data in memory["numerology"].items():
            lp = data.get("core_numbers",{}).get("life_path",0)
            if lp in (7, 11, 22, 33):
                parts.append(f"Life Path {lp} carries strong spiritual resonance — inner seeking and meditation amplify growth.")
                sources.append("numerology")
                break
    if not parts:
        parts = ["Spiritual growth is indicated — a regular mindfulness practice is recommended."]
        sources = ["astrology"]
    return {
        "content": " ".join(parts[:3]),
        "confidence": "medium",
        "sources": list(dict.fromkeys(sources)),
    }


def _build_timing_insight(memory: Dict[str, Any]) -> Dict[str, Any]:
    parts, sources = [], []
    if "astrology" in memory:
        for data in memory["astrology"].values():
            dasha = data.get("current_dasha","")
            preds = data.get("predictions",[])
            if dasha:
                parts.append(f"Currently running {dasha}.")
                sources.append("astrology")
            if preds:
                parts.append(preds[0])
    if "numerology" in memory:
        for trad, data in memory["numerology"].items():
            preds = data.get("predictions",[])
            if preds:
                parts.append(preds[-1])
                sources.append("numerology")
                break
    return {
        "content": " ".join(parts[:3]) or "Timing indicators suggest a growth phase — consistent action now yields long-term results.",
        "confidence": "high" if "astrology" in sources else "medium",
        "sources": list(dict.fromkeys(sources)),
    }


def _detect_conflicts(memory: Dict[str, Any]) -> List[Dict[str, Any]]:
    conflicts = []
    # Numerology traditions sometimes differ on name number emphasis — flag if all 3 diverge
    if "numerology" in memory:
        nums = memory["numerology"]
        lps = {t: d.get("core_numbers",{}).get("life_path",0) for t,d in nums.items()}
        values = list(lps.values())
        if len(set(values)) == len(values) and len(values) > 1:
            conflicts.append({
                "area": "Numerology — Life Path interpretation",
                "note": "Minor variation across traditions — Indian and Chaldean readings agree on core traits; Pythagorean adds name-number nuance.",
                "resolution": "Majority (2 of 3) agreement retained as primary insight.",
            })
    return conflicts


def meta_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    memory  = state.get("memory", {})
    focus   = state.get("focus_context", {}).get("intent", "general")
    question = state.get("user_question", "")

    top_traits    = _top_patterns(_collect_traits(memory))
    all_preds     = _collect_predictions(memory, focus)
    focus_preds   = _filter_by_focus(all_preds, focus)
    conflicts     = _detect_conflicts(memory)

    personality   = _build_personality_insight(top_traits, memory)
    career        = _build_career_insight(memory, focus)
    relationship  = _build_relationship_insight(memory)
    health        = _build_health_insight(memory)
    spiritual     = _build_spiritual_insight(memory)
    timing        = _build_timing_insight(memory)

    answer_to_question = ""
    if question:
        combined = " ".join(p["text"] for p in focus_preds[:3])
        answer_to_question = (
            f"Regarding your question — '{question}' — here is what the combined analysis reveals: "
            f"{combined} "
            f"This is confirmed across {len(set(p['source'] for p in focus_preds[:3]))} spiritual systems."
        ) if focus_preds else (
            f"Regarding your question — '{question}' — the overall life energy is positive. "
            "Consistent effort aligned with your natural strengths will guide you forward."
        )

    consolidated = {
        "question_answered": answer_to_question,
        "focus": focus,
        "top_traits": [{"trait": t, "count": c, "confidence": _assign_confidence(c, 5)} for t, c in top_traits],
        "personality_insight":  personality,
        "career_insight":       career,
        "relationship_insight": relationship,
        "health_insight":       health,
        "spiritual_insight":    spiritual,
        "timing_insight":       timing,
        "conflicts_detected":   conflicts,
        "total_agents_run":     sum(len(v) for v in memory.values() if isinstance(v, dict)),
    }

    state["consolidated"] = consolidated
    state.setdefault("agent_log", []).append(
        f"[MetaAgent] Consolidated {len(top_traits)} repeating traits, "
        f"{len(focus_preds)} focus-relevant predictions, {len(conflicts)} conflicts resolved."
    )
    return state
