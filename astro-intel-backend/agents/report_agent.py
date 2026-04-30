"""
STEP 7 — Final Report Agent
Consolidates admin-approved insights into a coherent 360° narrative.
Generates 4 prompt variants (simple/detailed × low-temp/precise-temp).
Temperature: 0 (deterministic) or 0.1 (near-deterministic) — never creative randomness.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List

from .simplify_agent import simplify_narrative, build_structured_summary_prompt
from .agent_prompts import get_prompt, REPORT_AGENT, REPORT_AGENT_STRUCTURED


# ── Prompt builders ────────────────────────────────────────────────────────────

def _build_prompts(
    question: str,
    intent: str,
    insights: List[Dict[str, Any]],
    subject: str,
    domains: List[str],
    remedies: Dict[str, Any] = {},
) -> Dict[str, Any]:
    """
    Returns 4 prompt variants for the consolidation LLM call.
    Caller picks one based on user preference / latency budget.
    temperature=0   → fully deterministic (simple variants)
    temperature=0.1 → near-deterministic with slight phrasing variety (detailed variants)
    """
    insight_block = "\n".join(
        f"- [{ins['confidence'].upper()}] ({', '.join(ins.get('domains', []))}) {ins['content']}"
        for ins in insights
    )

    _report_cfg = REPORT_AGENT
    sys_base = _report_cfg["system"]

    # ── Simple · temperature=0 ──────────────────────────────────────────────
    simple_0 = {
        "model":       "claude-opus-4-7",
        "temperature": 0,
        "top_p":       _report_cfg["top_p"],
        "max_tokens":  600,
        "system":      sys_base,
        "user": (
            f"Subject: {subject}\n"
            f"Question: {question}\n"
            f"Intent: {intent}\n"
            f"Traditions used: {', '.join(domains)}\n\n"
            f"Approved insights:\n{insight_block}\n\n"
            "Write a concise 2–3 paragraph summary that directly answers the question "
            "using the insights above. Plain prose, no bullet points, no headers."
        ),
    }

    # ── Simple · temperature=0.1 ────────────────────────────────────────────
    simple_01 = {**simple_0, "temperature": _report_cfg["temperature"]}

    # ── Detailed · temperature=0 ────────────────────────────────────────────
    detailed_0 = {
        "model":       "claude-opus-4-7",
        "temperature": 0,
        "top_p":       _report_cfg["top_p"],
        "max_tokens":  1400,
        "system":      sys_base,
        "user": (
            f"Subject: {subject}\n"
            f"Question: {question}\n"
            f"Intent: {intent}\n"
            f"Traditions used: {', '.join(domains)}\n\n"
            f"Approved insights:\n{insight_block}\n\n"
            "Write a comprehensive 360° analysis structured as follows:\n"
            "1. Direct Answer — address the question head-on in 1–2 sentences.\n"
            "2. Astrological Perspective — what the chart and dasha suggest.\n"
            "3. Numerological Perspective — what the numbers reveal.\n"
            "4. Cross-tradition Consensus — where multiple systems agree.\n"
            "5. Practical Guidance — 3–5 actionable steps the person can take.\n"
            "6. Closing Note — an encouraging, grounded closing sentence.\n\n"
            "Use headers for each section. Keep each section to 2–4 sentences. "
            "No bullet lists inside sections — prose only."
        ),
    }

    # ── Detailed · temperature=0.1 ──────────────────────────────────────────
    detailed_01 = {**detailed_0, "temperature": _report_cfg["temperature"]}

    # ── Structured bullet-point (WHO/WHAT/WHEN/WHERE/HOW + remedies) ───────────
    structured = build_structured_summary_prompt(question, intent, insights, subject, remedies)

    return {
        "simple_t0":    simple_0,
        "simple_t01":   simple_01,
        "detailed_t0":  detailed_0,
        "detailed_t01": detailed_01,
        "structured":   structured,   # bullet-point WHO/WHAT/WHEN/WHERE/HOW + remedies
    }


# ── Consolidation logic ────────────────────────────────────────────────────────

def _consolidate_section(
    question: str,
    intent: str,
    approved_insights: List[Dict[str, Any]],
    subject: str,
    domains: List[str],
    remedies: Dict[str, Any] = {},
) -> Dict[str, Any]:
    """
    Builds a consolidated narrative for one question section.
    If an LLM is available the caller should replace `narrative` with the
    LLM response.  We also return the 4 prompt variants so the API layer
    can invoke the model with whichever variant the caller prefers.
    """
    # Deterministic fallback narrative (used when LLM is not called)
    high  = [i for i in approved_insights if i.get("confidence") == "high"]
    med   = [i for i in approved_insights if i.get("confidence") == "medium"]
    other = [i for i in approved_insights if i.get("confidence") not in ("high", "medium")]

    ordered = high + med + other
    sentences = [i["content"].rstrip(".") + "." for i in ordered]

    # Direct answer (first high-conf or first insight)
    direct = sentences[0] if sentences else "The analysis indicates a positive path forward."

    # Cross-domain consensus sentences
    multi = [i["content"] for i in approved_insights if i.get("is_common")]
    consensus_note = (
        f" Multiple spiritual traditions converge on: {multi[0].rstrip('.')}."
        if multi else ""
    )

    # Practical closing
    domains_str = ", ".join(d.capitalize() for d in domains[:3]) if domains else "multiple traditions"
    closing = (
        f" The combined wisdom of {domains_str} suggests that consistent, mindful action "
        "in the direction indicated above yields the most favourable outcomes."
    )

    narrative_parts = [direct]
    if len(sentences) > 1:
        narrative_parts.append(" ".join(sentences[1:]))
    narrative_parts.append(consensus_note + closing)

    narrative = " ".join(p for p in narrative_parts if p.strip())

    prompts = _build_prompts(question, intent, approved_insights, subject, domains, remedies)

    simple_narrative = simplify_narrative(narrative, question, intent)

    from .simplify_agent import build_structured_summary
    structured_summary = build_structured_summary(
        question, intent, approved_insights, remedies, {}
    )

    return {
        "question":           question,
        "intent":             intent,
        "narrative":          narrative,
        "simple_narrative":   simple_narrative,
        "structured_summary": structured_summary,
        "prompts":            prompts,
        "insights":           approved_insights,
        "domain_breakdown":   _domain_breakdown(approved_insights),
    }


def _domain_breakdown(insights: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    breakdown: Dict[str, List[str]] = {}
    for ins in insights:
        for d in ins.get("domains", []):
            breakdown.setdefault(d, []).append(ins["content"])
    return breakdown


# ── Public entry point ─────────────────────────────────────────────────────────

def final_report_agent(
    admin_review: Dict[str, Any],
    approved_ids: List[str],
    rejected_ids: List[str],
    brand_name: str = "{{BRAND_NAME}}",
    logo_url:   str = "{{LOGO_URL}}",
    image_url:  str = "{{IMAGE_URL}}",
    memory:     Dict[str, Any] = {},
    remedies:   Dict[str, Any] = {},
) -> Dict[str, Any]:

    subject       = admin_review.get("subject", "")
    all_questions = admin_review.get("questions", [])

    report_sections: List[Dict[str, Any]] = []
    all_questions_text: List[str] = []
    approved_count = 0
    rejected_count = 0
    conf_dist = {"high": 0, "medium": 0, "low": 0}

    modules_used = [m for m in ["astrology", "numerology", "palmistry", "tarot", "vastu"] if m in memory]

    for q_block in all_questions:
        question = q_block.get("question", "")
        intent   = q_block.get("intent", "general")
        insights = q_block.get("insights", [])
        all_questions_text.append(question)

        approved_insights = [
            {
                "id":         i["id"],
                "content":    i["content"],
                "confidence": i.get("confidence", "medium"),
                "domains":    i.get("domains", []),
                "is_common":  i.get("is_common", False),
                "approved":   True,
                "editable":   True,   # kept so frontend can still edit
            }
            for i in insights if i["id"] in approved_ids
        ]
        rejected_count += len([i for i in insights if i["id"] in rejected_ids])
        approved_count += len(approved_insights)

        for ins in approved_insights:
            c = ins.get("confidence", "medium")
            conf_dist[c] = conf_dist.get(c, 0) + 1

        if approved_insights:
            # Match per-question remedy
            qr_list = remedies.get("question_remedies", []) if remedies else []
            qr = next((r for r in qr_list if r.get("question") == question), {})
            section = _consolidate_section(
                question, intent, approved_insights, subject, modules_used, qr
            )
            report_sections.append(section)

    # ── Legacy flat-structure fallback ─────────────────────────────────────
    if not all_questions and "sections" in admin_review:
        flat_sections = admin_review.get("sections", [])
        question      = admin_review.get("question", "")
        focus         = admin_review.get("focus", "general")
        all_questions_text = [question] if question else ["General life overview."]

        approved_legacy = [s for s in flat_sections if s["id"] in approved_ids]
        rejected_count  = len([s for s in flat_sections if s["id"] in rejected_ids])
        approved_count  = len(approved_legacy)

        for s in approved_legacy:
            c = s.get("confidence", "medium")
            conf_dist[c] = conf_dist.get(c, 0) + 1

        if approved_legacy:
            legacy_insights = [
                {
                    "id":         s["id"],
                    "content":    s["content"],
                    "confidence": s.get("confidence", "medium"),
                    "domains":    s.get("sources", []),
                    "is_common":  len(s.get("sources", [])) >= 3,
                    "approved":   True,
                    "editable":   True,
                }
                for s in approved_legacy
            ]
            section = _consolidate_section(
                question or "General life overview.",
                focus,
                legacy_insights,
                subject,
                modules_used,
            )
            report_sections.append(section)

    now = datetime.now(timezone.utc)

    report = {
        "brand_name":   brand_name,
        "logo_url":     logo_url,
        "image_url":    image_url,
        "report_title": "360° Spiritual Intelligence Report",
        "user_name":    subject,
        "questions":    all_questions_text,
        "generated_at": now.isoformat(),
        "modules_used": modules_used,

        "total_insights_reviewed": approved_count + rejected_count,
        "total_insights_approved": approved_count,
        "total_insights_rejected": rejected_count,
        "confidence_distribution": conf_dist,

        "title_page": {
            "brand":      brand_name,
            "logo_url":   logo_url,
            "image_url":  image_url,
            "title":      "360° Spiritual Intelligence Report",
            "subtitle":   "A comprehensive multi-discipline spiritual analysis",
            "for_person": subject,
            "questions":  all_questions_text,
            "date":       now.strftime("%d %B %Y"),
            "modules":    modules_used,
        },

        "disclaimer": (
            "This report is prepared for spiritual guidance and personal reflection. "
            "All insights are expressed as tendencies and possibilities, not absolute predictions. "
            "This report does not replace professional medical, legal, or financial advice."
        ),

        # Each section: question + intent + narrative + prompts + editable insights
        "sections": report_sections,

        "rejected_insight_ids": rejected_ids,

        "closing_note": (
            f"This report was generated by {brand_name} — a 360° multi-tradition spiritual intelligence system. "
            "The insights represent a synthesis of Vedic Astrology, Numerology, Palmistry, Tarot, and Vastu wisdom. "
            "Use this as a compass, not a map."
        ),
    }

    return report
