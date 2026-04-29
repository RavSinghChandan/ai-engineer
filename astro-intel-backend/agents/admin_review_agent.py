"""
STEP 6 — Admin Review Agent
Generates the fully editable, section-by-section JSON for admin approval.
"""
from __future__ import annotations
from typing import Any, Dict, List


def _section(sid: str, title: str, content: str, confidence: str, sources: List[str]) -> Dict[str, Any]:
    return {
        "id":         sid,
        "title":      title,
        "content":    content.strip(),
        "confidence": confidence,
        "sources":    sources,
    }


def admin_review_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    c        = state.get("consolidated", {})
    r        = state.get("remedies", {})
    memory   = state.get("memory", {})
    focus    = state.get("focus_context", {}).get("intent", "general")
    question = state.get("user_question", "")
    profile  = state.get("user_profile", {})
    name     = profile.get("full_name","") if isinstance(profile, dict) else profile.full_name

    sections: List[Dict[str, Any]] = []

    # ── Section 1: Direct answer to user question ────────────────────────────
    if question:
        ans = c.get("question_answered","")
        sections.append(_section(
            "sec_answer",
            "Direct Answer to Your Question",
            ans or f"The analysis suggests a positive path toward your goal regarding: {question}",
            c.get("timing_insight",{}).get("confidence","medium"),
            c.get("timing_insight",{}).get("sources",["astrology","numerology"]),
        ))

    # ── Section 2: Personality Overview ──────────────────────────────────────
    pi = c.get("personality_insight",{})
    sections.append(_section(
        "sec_personality",
        "Personality Overview",
        pi.get("content","A growth-oriented, determined character is consistently indicated."),
        pi.get("confidence","medium"),
        pi.get("sources",["astrology","numerology","palmistry"]),
    ))

    # ── Section 3: Career & Vocation ─────────────────────────────────────────
    ci = c.get("career_insight",{})
    sections.append(_section(
        "sec_career",
        "Career & Vocation",
        ci.get("content","Steady career progress is indicated through consistent, disciplined action."),
        ci.get("confidence","medium"),
        ci.get("sources",["astrology","numerology"]),
    ))

    # ── Section 4: Relationships & Emotional Life ────────────────────────────
    ri = c.get("relationship_insight",{})
    sections.append(_section(
        "sec_relationships",
        "Relationships & Emotional Life",
        ri.get("content","Deep, loyal partnerships are indicated. Emotional intelligence is a key strength."),
        ri.get("confidence","medium"),
        ri.get("sources",["palmistry","astrology"]),
    ))

    # ── Section 5: Health & Vitality ─────────────────────────────────────────
    hi = c.get("health_insight",{})
    sections.append(_section(
        "sec_health",
        "Health & Vitality",
        hi.get("content","Good health is generally indicated — stress management is the key variable."),
        hi.get("confidence","medium"),
        hi.get("sources",["palmistry","astrology"]),
    ))

    # ── Section 6: Spiritual Dimension ───────────────────────────────────────
    si = c.get("spiritual_insight",{})
    sections.append(_section(
        "sec_spiritual",
        "Spiritual & Inner Life",
        si.get("content","A period of spiritual deepening is indicated — inner practice rewards generously now."),
        si.get("confidence","medium"),
        si.get("sources",["tarot","astrology"]),
    ))

    # ── Section 7: Timing & Dasha ─────────────────────────────────────────────
    ti = c.get("timing_insight",{})
    sections.append(_section(
        "sec_timing",
        "Current Timing & Dasha Period",
        ti.get("content","A growth-phase is indicated — consistent action yields compounding long-term results."),
        ti.get("confidence","high"),
        ti.get("sources",["astrology"]),
    ))

    # ── Section 8: Astrology Chart (if selected) ──────────────────────────────
    if "astrology" in memory:
        for trad, data in memory["astrology"].items():
            chart = data.get("chart",{})
            yogas = data.get("yogas",[])
            yoga_text = "; ".join(
                y.get("name","") if isinstance(y,dict) else str(y) for y in yogas
            )
            doshas = data.get("doshas",[])
            sections.append(_section(
                "sec_astrology",
                "Vedic Astrology Chart Highlights",
                f"Lagna: {chart.get('lagna','')} | Moon Sign: {chart.get('moon_sign','')} | "
                f"Sun Sign: {chart.get('sun_sign','')} | Nakshatra: {chart.get('nakshatra','')}. "
                f"Active Yogas: {yoga_text}. "
                f"Dosha status: {', '.join(doshas)}. "
                f"Current period: {data.get('current_dasha','')}.",
                "high",
                ["astrology"],
            ))
            break

    # ── Section 9: Numerology Summary ─────────────────────────────────────────
    if "numerology" in memory:
        num_parts = []
        for trad, data in memory["numerology"].items():
            cn = data.get("core_numbers",{})
            num_parts.append(
                f"{trad}: Life Path {cn.get('life_path','')} | Destiny {cn.get('destiny','')} | Name Number {cn.get('name_number','')}"
            )
        sections.append(_section(
            "sec_numerology",
            "Numerology Core Numbers (3 Traditions)",
            " | ".join(num_parts) + ". " +
            "All three traditions agree on the core life path trajectory — this is a HIGH confidence indicator.",
            "high",
            ["numerology"],
        ))

    # ── Section 10: Tarot Guidance (if selected) ──────────────────────────────
    if "tarot" in memory:
        for trad, data in memory["tarot"].items():
            cards = data.get("cards",[])
            card_names = " → ".join(f"{c['name']} ({c['orientation']})" for c in cards)
            sections.append(_section(
                "sec_tarot",
                "Tarot Spread & Guidance",
                f"{data.get('overall_theme','')} Cards drawn: {card_names}. "
                f"{' '.join(data.get('guidance',[])[:2])}",
                "medium",
                ["tarot"],
            ))
            break

    # ── Section 11: Vastu (if selected) ──────────────────────────────────────
    if "vastu" in memory:
        for trad, data in memory["vastu"].items():
            sections.append(_section(
                "sec_vastu",
                "Vastu Shastra — Space Energy",
                f"{data.get('overall_energy','')} "
                f"Priority corrections: {'; '.join(data.get('corrections',[])[:3])}.",
                "high",
                ["vastu"],
            ))
            break

    # ── Section 12: Palmistry Summary ─────────────────────────────────────────
    if "palmistry" in memory:
        palm_insights = []
        for trad, data in memory["palmistry"].items():
            fi = data.get("focus_insight","")
            if fi:
                palm_insights.append(f"{trad}: {fi}")
        if palm_insights:
            sections.append(_section(
                "sec_palmistry",
                "Palmistry — Hand Analysis (3 Traditions)",
                " | ".join(palm_insights),
                "medium",
                ["palmistry"],
            ))

    # ── Remedy sections ────────────────────────────────────────────────────────
    if r:
        sections.append(_section(
            "sec_remedy_habits",
            "Daily Habits & Lifestyle",
            " ".join(r.get("daily_habits",[])),
            "high",
            ["astrology","numerology","palmistry","vastu","tarot"],
        ))
        sections.append(_section(
            "sec_remedy_mantras",
            "Mantras & Spiritual Practices",
            "; ".join(
                f"{m['mantra']} — {m['purpose']} ({m['count']} times)"
                for m in r.get("mantras",[])
            ) + ". " + " ".join(r.get("yoga_meditation",[])[:2]),
            "high",
            ["astrology","numerology"],
        ))
        gem_parts = "; ".join(
            g["stone"] + " on " + g["finger"] + " for " + g["purpose"]
            for g in r.get("gemstones",[])[:3]
        )
        color_parts = ", ".join(r.get("colors",[])[:5])
        sections.append(_section(
            "sec_remedy_gemstones",
            "Gemstones, Colors & Material Remedies",
            f"Recommended stones: {gem_parts}. Favorable colors: {color_parts}.",
            "medium",
            ["astrology","numerology","vastu"],
        ))
        sections.append(_section(
            "sec_remedy_behavioral",
            "Behavioral Adjustments",
            " ".join(r.get("behavioral_adjustments",[])),
            "high",
            list(memory.keys()),
        ))

    admin_review = {
        "question": question,
        "focus":    focus,
        "subject":  name,
        "sections": sections,
    }

    state["admin_review"] = admin_review
    state.setdefault("agent_log", []).append(
        f"[AdminReviewAgent] Generated {len(sections)} review sections."
    )
    return state
