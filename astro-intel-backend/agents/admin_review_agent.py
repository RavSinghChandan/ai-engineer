"""
STEP 6 — Admin Review Agent
Generates question-wise editable insight list for admin approval.
Each insight has: id, content, confidence, domains[], is_common, editable.
"""
from __future__ import annotations
from typing import Any, Dict, List
from agents.agent_prompts import build_prompt


def admin_review_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    # Use question_consensus from meta_agent if available
    question_consensus = state.get("question_consensus", [])
    normalized_questions = state.get("normalized_questions", [])
    memory  = state.get("memory", {})
    remedies = state.get("remedies", {})
    profile  = state.get("user_profile", {})
    name     = profile.get("full_name", "") if isinstance(profile, dict) else profile.full_name

    if question_consensus:
        # New enterprise path: question-wise insights from meta consensus
        questions_output = []
        for qc in question_consensus:
            q_idx = question_consensus.index(qc) + 1
            raw_insights = qc.get("insights", [])

            # Ensure stable IDs in format q{n}_i{n}
            formatted_insights = []
            for i, ins in enumerate(raw_insights):
                formatted_insights.append({
                    "id":          ins.get("id", f"q{q_idx}_i{i+1}"),
                    "content":     ins["content"],
                    "confidence":  ins.get("confidence", "medium"),
                    "domains":     ins.get("domains", []),
                    "is_common":   ins.get("is_common", False),
                    "editable":    True,
                })

            # Add remedy insight for this question if remedies exist
            if remedies:
                intent = qc.get("intent", "general")
                habits = remedies.get("daily_habits", [])
                if habits:
                    formatted_insights.append({
                        "id":         f"q{q_idx}_remedy",
                        "content":    f"Recommended practice: {habits[0]}",
                        "confidence": "high",
                        "domains":    ["astrology", "numerology", "vastu"],
                        "is_common":  True,
                        "editable":   True,
                    })

            questions_output.append({
                "question": qc["question"],
                "intent":   qc.get("intent", "general"),
                "insights": formatted_insights,
            })

        admin_review = {
            "subject":   name,
            "questions": questions_output,
        }
    else:
        # Fallback: legacy flat section structure
        c = state.get("consolidated", {})
        r = remedies
        focus    = state.get("focus_context", {}).get("intent", "general")
        question = state.get("user_question", "")

        sections: List[Dict[str, Any]] = []

        def _sec(sid, title, content, confidence, sources):
            return {
                "id":         sid,
                "title":      title,
                "content":    content.strip() if content else "",
                "confidence": confidence,
                "sources":    sources,
            }

        if question:
            ans = c.get("question_answered", "")
            sections.append(_sec(
                "sec_answer", "Direct Answer to Your Question",
                ans or f"The analysis suggests a positive path toward your goal regarding: {question}",
                c.get("timing_insight", {}).get("confidence", "medium"),
                c.get("timing_insight", {}).get("sources", ["astrology", "numerology"]),
            ))

        pi = c.get("personality_insight", {})
        sections.append(_sec(
            "sec_personality", "Personality Overview",
            pi.get("content", "A growth-oriented, determined character is consistently indicated."),
            pi.get("confidence", "medium"),
            pi.get("sources", ["astrology", "numerology", "palmistry"]),
        ))

        ci = c.get("career_insight", {})
        sections.append(_sec(
            "sec_career", "Career & Vocation",
            ci.get("content", "Steady career progress is indicated through consistent, disciplined action."),
            ci.get("confidence", "medium"),
            ci.get("sources", ["astrology", "numerology"]),
        ))

        ri = c.get("relationship_insight", {})
        sections.append(_sec(
            "sec_relationships", "Relationships & Emotional Life",
            ri.get("content", "Deep, loyal partnerships are indicated. Emotional intelligence is a key strength."),
            ri.get("confidence", "medium"),
            ri.get("sources", ["palmistry", "astrology"]),
        ))

        hi = c.get("health_insight", {})
        sections.append(_sec(
            "sec_health", "Health & Vitality",
            hi.get("content", "Good health is generally indicated — stress management is the key variable."),
            hi.get("confidence", "medium"),
            hi.get("sources", ["palmistry", "astrology"]),
        ))

        si = c.get("spiritual_insight", {})
        sections.append(_sec(
            "sec_spiritual", "Spiritual & Inner Life",
            si.get("content", "A period of spiritual deepening is indicated — inner practice rewards generously now."),
            si.get("confidence", "medium"),
            si.get("sources", ["tarot", "astrology"]),
        ))

        ti = c.get("timing_insight", {})
        sections.append(_sec(
            "sec_timing", "Current Timing & Dasha Period",
            ti.get("content", "A growth-phase is indicated — consistent action yields compounding long-term results."),
            ti.get("confidence", "high"),
            ti.get("sources", ["astrology"]),
        ))

        if r:
            sections.append(_sec(
                "sec_remedy_habits", "Daily Habits & Lifestyle",
                " ".join(r.get("daily_habits", [])),
                "high",
                ["astrology", "numerology", "palmistry", "vastu", "tarot"],
            ))
            sections.append(_sec(
                "sec_remedy_mantras", "Mantras & Spiritual Practices",
                "; ".join(
                    f"{m['mantra']} — {m['purpose']} ({m['count']} times)"
                    for m in r.get("mantras", [])
                ),
                "high",
                ["astrology", "numerology"],
            ))

        # Convert legacy sections into question-wise format
        q_insights = []
        for i, sec in enumerate(sections):
            q_insights.append({
                "id":         f"q1_i{i+1}",
                "content":    sec.get("content", ""),
                "confidence": sec.get("confidence", "medium"),
                "domains":    sec.get("sources", []),
                "is_common":  len(sec.get("sources", [])) >= 3,
                "editable":   True,
            })

        admin_review = {
            "subject":   name,
            "questions": [
                {
                    "question": question or "General life overview.",
                    "intent":   focus,
                    "insights": q_insights,
                }
            ],
        }

    for q_item in admin_review["questions"]:
        domain_texts = "\n".join(ins["content"] for ins in q_item["insights"][:6])
        build_prompt(
            "admin_review",
            name=name,
            question=q_item["question"],
            intent=q_item.get("intent", "general"),
            domain_outputs=domain_texts,
        )

    state["admin_review"] = admin_review
    total_insights = sum(len(q["insights"]) for q in admin_review["questions"])
    state.setdefault("agent_log", []).append(
        f"[AdminReviewAgent] Generated {total_insights} insights across {len(admin_review['questions'])} question(s)."
    )
    return state
