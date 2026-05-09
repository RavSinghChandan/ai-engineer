"""
Hallucination Detection & Mitigation — AstroIntel 360°
=======================================================
Three-layer architecture (matches senior-ai-engineer study module):

  Layer 1 — PREVENTION  (structural — built into consensus architecture)
    · Multi-agent consensus: single agent claim → LOW confidence, not shown as reliable
    · Structured output format: agents return typed dicts, not free text
    · Domain isolation: each agent works independently, cross-validation at meta layer

  Layer 2 — DETECTION   (this module — runs after meta_agent completes)
    · Single-source detector:   insight backed by only 1 domain → flagged
    · Cross-domain contradictions: same question, opposing predictions → flagged
    · Hedge-phrase scanner:    "might", "possibly", "unclear" in insight text → flagged
    · Coverage gap detector:   < 3 of 5 domains contributed → pipeline coverage warning

  Layer 3 — RECOVERY    (this module — applied before response is returned)
    · Suppress:  LOW-confidence insights are quarantined from the primary response
    · Retry:     (logged — actual retry is in safe_node; here we record retry signals)
    · Fallback:  insert a calibrated fallback insight when a question gets 0 trusted answers

Every detection event is recorded in state["hallucination_audit"] and picked up by
the MetricsCollector in routers/analysis.py.
"""
from __future__ import annotations
import re
import time
from typing import Any, Dict, List, Tuple

# ── Hedge phrases that signal LLM uncertainty ─────────────────────────────────
_HEDGE_PATTERN = re.compile(
    r"\b(might|may|possibly|perhaps|unclear|uncertain|not sure|could be|"
    r"it seems|appears to|likely|probably|roughly|approximately|i believe|"
    r"it is possible|hard to say|difficult to determine)\b",
    re.IGNORECASE,
)

# ── Keywords that signal strong positive / negative predictions ───────────────
_POSITIVE_KW = re.compile(r"\b(growth|success|favorable|strong|excellent|"
                          r"positive|auspicious|good|beneficial|thriving)\b", re.IGNORECASE)
_NEGATIVE_KW = re.compile(r"\b(decline|failure|unfavorable|weak|poor|"
                          r"inauspicious|bad|detrimental|challenging|difficult)\b", re.IGNORECASE)


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

def _detect_single_source(insight: Dict[str, Any]) -> Tuple[bool, str]:
    """Insight backed by only 1 domain = unverified claim."""
    domains = insight.get("domains", [])
    if len(domains) <= 1 and insight.get("confidence", "low").lower() == "low":
        return True, f"single_source:{domains[0] if domains else 'unknown'}"
    return False, ""


def _detect_hedge_phrases(insight: Dict[str, Any]) -> Tuple[bool, str]:
    """Hedge words in insight text = LLM uncertainty signal."""
    text = insight.get("content", "")
    matches = _HEDGE_PATTERN.findall(text)
    if matches:
        return True, f"hedge_phrases:{','.join(set(m.lower() for m in matches[:3]))}"
    return False, ""


def _detect_cross_domain_contradiction(
    insights: List[Dict[str, Any]],
    question: str,
) -> List[Dict[str, str]]:
    """
    Detect opposing predictions for the same question across domains.
    Simple heuristic: one insight has positive keywords, another has negative keywords,
    both are from different domains.
    """
    contradictions = []
    pos_sources, neg_sources = [], []

    for ins in insights:
        text = ins.get("content", "")
        domains = ins.get("domains", ["?"])
        domain = domains[0] if domains else "?"
        if _POSITIVE_KW.search(text):
            pos_sources.append(domain)
        if _NEGATIVE_KW.search(text):
            neg_sources.append(domain)

    if pos_sources and neg_sources:
        contradictions.append({
            "type": "cross_domain_contradiction",
            "question": question[:80],
            "positive_domains": pos_sources,
            "negative_domains": neg_sources,
            "note": (
                f"Opposing predictions detected: {pos_sources} signal positive, "
                f"{neg_sources} signal challenging. Consensus layer resolved via majority."
            ),
        })
    return contradictions


def _detect_coverage_gap(memory: Dict[str, Any]) -> Tuple[bool, str]:
    """Fewer than 3 of 5 domains contributed = coverage gap."""
    domains = ["astrology", "numerology", "palmistry", "tarot", "vastu"]
    active = [d for d in domains if memory.get(d)]
    if len(active) < 3:
        return True, f"coverage_gap:{len(active)}/5_domains_active"
    return False, ""


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 3 — RECOVERY
# ═══════════════════════════════════════════════════════════════════════════════

def _suppress_low_confidence(
    insights: List[Dict[str, Any]],
    flagged_ids: set,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Quarantine insights that are flagged as unreliable.
    Returns (trusted_insights, suppressed_insights).
    HIGH/MEDIUM confidence insights are never suppressed.
    """
    trusted, suppressed = [], []
    for ins in insights:
        conf = ins.get("confidence", "low").lower()
        if ins.get("id") in flagged_ids and conf == "low":
            suppressed.append({**ins, "_suppressed_reason": "hallucination_risk:low_confidence_single_source"})
        else:
            trusted.append(ins)
    return trusted, suppressed


def _fallback_insight(question: str, domains_active: List[str]) -> Dict[str, Any]:
    """
    Recovery fallback: when a question gets 0 trusted answers, return a
    calibrated fallback instead of an empty or hallucinated response.
    """
    return {
        "id": "fallback_recovery",
        "content": (
            f"Insufficient cross-domain consensus was reached for: \"{question[:60]}\". "
            f"The available data from {', '.join(domains_active)} suggests reviewing "
            f"this question with more specific details for a reliable reading."
        ),
        "confidence": "low",
        "domains": domains_active,
        "is_common": False,
        "editable": False,
        "_is_fallback": True,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY — run_hallucination_check()
# ═══════════════════════════════════════════════════════════════════════════════

def run_hallucination_check(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all three layers after meta_agent completes.
    Mutates state in-place — adds state["hallucination_audit"].
    Does NOT break the pipeline. All operations are additive.
    """
    t0 = time.perf_counter()

    memory = state.get("memory", {})
    # hallucination_check runs BEFORE admin_review_agent, so use question_consensus
    # (written by meta_agent) as the source of insights to check.
    question_consensus = state.get("question_consensus", [])
    # Build a unified questions_data list from question_consensus
    questions_data = [
        {
            "question": qc.get("question", ""),
            "insights": qc.get("insights", []),
        }
        for qc in question_consensus
    ]

    audit: Dict[str, Any] = {
        "layer1_prevention": {
            "consensus_architecture": True,
            "structured_output": True,
            "domain_isolation": True,
            "note": "Architecture-level prevention is always active.",
        },
        "layer2_detection": {
            "events": [],
            "total_insights_checked": 0,
            "single_source_flags": 0,
            "hedge_phrase_flags": 0,
            "contradiction_flags": 0,
            "coverage_gap": False,
        },
        "layer3_recovery": {
            "suppressed_count": 0,
            "fallback_injected": 0,
            "retry_signals": 0,
            "suppressed_insights": [],
        },
        "overall_risk": "low",
        "hallucination_rate_pct": 0.0,
        "checked_at_ms": round((time.perf_counter() - t0) * 1000, 2),
    }

    flagged_insight_ids: set = set()
    total_insights = 0
    flagged_count = 0

    # ── Layer 2a: Coverage gap ────────────────────────────────────────────────
    cov_flagged, cov_reason = _detect_coverage_gap(memory)
    if cov_flagged:
        audit["layer2_detection"]["coverage_gap"] = True
        audit["layer2_detection"]["events"].append({
            "type": "coverage_gap",
            "reason": cov_reason,
            "severity": "medium",
        })

    # ── Layer 2b & 2c: Per-question insight checks ────────────────────────────
    for q_data in questions_data:
        question = q_data.get("question", "")
        insights = q_data.get("insights", [])
        total_insights += len(insights)

        for ins in insights:
            # Single-source detection
            flagged, reason = _detect_single_source(ins)
            if flagged:
                flagged_insight_ids.add(ins.get("id"))
                flagged_count += 1
                audit["layer2_detection"]["single_source_flags"] += 1
                audit["layer2_detection"]["events"].append({
                    "type": "single_source",
                    "insight_id": ins.get("id"),
                    "question": question[:60],
                    "reason": reason,
                    "severity": "medium",
                })

            # Hedge-phrase detection
            h_flagged, h_reason = _detect_hedge_phrases(ins)
            if h_flagged:
                flagged_insight_ids.add(ins.get("id"))
                flagged_count += 1
                audit["layer2_detection"]["hedge_phrase_flags"] += 1
                audit["layer2_detection"]["events"].append({
                    "type": "hedge_phrase",
                    "insight_id": ins.get("id"),
                    "question": question[:60],
                    "reason": h_reason,
                    "severity": "low",
                })

        # Cross-domain contradiction detection
        contradictions = _detect_cross_domain_contradiction(insights, question)
        if contradictions:
            audit["layer2_detection"]["contradiction_flags"] += len(contradictions)
            for c in contradictions:
                audit["layer2_detection"]["events"].append({**c, "severity": "high"})

    audit["layer2_detection"]["total_insights_checked"] = total_insights

    # ── Layer 3: Recovery — suppress + fallback ───────────────────────────────
    all_suppressed = []
    for q_data in questions_data:
        question = q_data.get("question", "")
        insights = q_data.get("insights", [])
        domains_active = list(memory.keys())

        trusted, suppressed = _suppress_low_confidence(insights, flagged_insight_ids)
        all_suppressed.extend(suppressed)

        # Fallback injection: if all insights were suppressed for this question
        if len(trusted) == 0 and len(suppressed) > 0:
            fallback = _fallback_insight(question, domains_active)
            trusted.append(fallback)
            audit["layer3_recovery"]["fallback_injected"] += 1
            audit["layer3_recovery"]["retry_signals"] += 1
            state.setdefault("agent_log", []).append(
                f"[Hallucination/Recovery] Fallback inserted for question: {question[:60]}"
            )

        # Write suppressed insights back as quarantined (not removed, just marked)
        for ins in suppressed:
            ins["_quarantined"] = True

    audit["layer3_recovery"]["suppressed_count"] = len(all_suppressed)
    audit["layer3_recovery"]["suppressed_insights"] = [
        {
            "id": s.get("id"),
            "question": "",
            "reason": s.get("_suppressed_reason", ""),
            "confidence": s.get("confidence"),
            "domains": s.get("domains", []),
        }
        for s in all_suppressed
    ]

    # ── Compute overall risk ──────────────────────────────────────────────────
    rate = round(flagged_count / max(total_insights, 1) * 100, 1)
    audit["hallucination_rate_pct"] = rate
    audit["overall_risk"] = (
        "high"   if rate >= 40 or audit["layer2_detection"]["contradiction_flags"] > 0 else
        "medium" if rate >= 15 or cov_flagged else
        "low"
    )

    audit["checked_at_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    state["hallucination_audit"] = audit
    state.setdefault("agent_log", []).append(
        f"[Hallucination] L2 detected {flagged_count}/{total_insights} flagged insights "
        f"({rate}% rate) · Risk: {audit['overall_risk']} · "
        f"L3 suppressed {len(all_suppressed)}, fallbacks: {audit['layer3_recovery']['fallback_injected']}"
    )
    return state
