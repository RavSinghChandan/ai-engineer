"""
AgentBusinessMetrics — whether the staffing recommendations are worth having.

    acceptance_rate           managers accept the AI suggestion as-is ÷ AI suggestions decided
    time_to_allocate          AI-assisted (request → allocation) vs manual (start → allocation)
    intervention_rate         AI suggestions where the agent asked for help, or the manager
                              had to change or reject them ÷ AI suggestions
    cost_per_recommendation   model cost (from the FDE ledger) + infrastructure share
    allocation_success_rate   allocations that worked ÷ allocations with a recorded outcome

Inputs that are not measured yet come from the environment and are tagged
"assumption" on the dashboard:
    BENCH_MANUAL_ALLOCATION_MINUTES  manual time to allocate, used until a manual
                                     allocation is logged (default 90)
    BENCH_INFRA_COST_PER_MONTH_USD   hosting cost spread over the window's
                                     recommendations (default 25)
"""
from __future__ import annotations

import os
import statistics
import time
from typing import Any, Dict, List, Optional

from business_metrics import store

Rows = List[Dict[str, Any]]


def manual_baseline_minutes() -> float:
    return float(os.environ.get("BENCH_MANUAL_ALLOCATION_MINUTES", "90"))


def infra_cost_per_month_usd() -> float:
    return float(os.environ.get("BENCH_INFRA_COST_PER_MONTH_USD", "25"))


def _pct(part: int, whole: int) -> Optional[float]:
    return round(part / whole * 100, 1) if whole else None


def _median(values: List[float]) -> Optional[float]:
    return round(statistics.median(values), 1) if values else None


def _minutes_to_allocate(rows: Rows) -> List[float]:
    return [(r["allocated_at"] - r["requested_at"]) / 60 for r in rows if r["allocated_at"] is not None]


def _metric(key: str, label: str, value: Any, unit: str, description: str, *,
            higher_is_better: Optional[bool], assumption: bool = False, **detail: Any) -> Dict[str, Any]:
    return {"key": key, "label": label, "value": value, "unit": unit, "description": description,
            "higher_is_better": higher_is_better, "assumption": assumption, "detail": detail}


def acceptance_rate(ai: Rows) -> Dict[str, Any]:
    decided = [r for r in ai if r["decision"]]
    counts = {d: sum(r["decision"] == d for r in decided) for d in store.DECISIONS}
    return _metric(
        "acceptance_rate", "Recommendation acceptance rate", _pct(counts["accepted"], len(decided)),
        "pct", "Managers accepted the AI suggestion as-is ÷ AI suggestions they decided on",
        higher_is_better=True, decided=len(decided), pending=len(ai) - len(decided),
        accepted_with_changes_pct=_pct(counts["modified"], len(decided)), **counts)


def time_to_allocate(ai: Rows, manual: Rows) -> Dict[str, Any]:
    ai_minutes = _median(_minutes_to_allocate(ai))
    measured = _minutes_to_allocate(manual)
    manual_minutes = _median(measured) if measured else manual_baseline_minutes()
    saved = (round((1 - ai_minutes / manual_minutes) * 100, 1)
             if ai_minutes is not None and manual_minutes else None)
    return _metric(
        "time_to_allocate", "Time to allocate (AI-assisted)", ai_minutes, "min",
        "Median minutes from asking for a recommendation to allocating someone, "
        "compared with allocating by hand",
        higher_is_better=False, assumption=not measured,
        ai_minutes=ai_minutes, manual_minutes=manual_minutes,
        manual_source="measured" if measured else "assumption (BENCH_MANUAL_ALLOCATION_MINUTES)",
        manual_allocations=len(measured), ai_allocations=len(_minutes_to_allocate(ai)),
        time_saved_pct=saved)


def intervention_rate(ai: Rows) -> Dict[str, Any]:
    flagged = sum(r["needs_help"] for r in ai)
    changed = sum(r["decision"] == "modified" for r in ai)
    rejected = sum(r["decision"] == "rejected" for r in ai)
    needed = sum(r["needs_help"] or r["decision"] in ("modified", "rejected") for r in ai)
    reasons: Dict[str, int] = {}
    for r in ai:
        for reason in r["help_reasons"]:
            reasons[reason] = reasons.get(reason, 0) + 1
    return _metric(
        "intervention_rate", "Human intervention rate", _pct(needed, len(ai)), "pct",
        "AI suggestions where the agent flagged it needed help, or the manager had to "
        "change or reject the suggestion ÷ AI suggestions",
        higher_is_better=False, interventions=needed, recommendations=len(ai),
        flagged_by_agent=flagged, changed_by_manager=changed, rejected_by_manager=rejected,
        reasons=reasons)


def cost_per_recommendation(ai: Rows, days: int) -> Dict[str, Any]:
    model = sum(r["model_cost_usd"] for r in ai)
    infra = infra_cost_per_month_usd() * days / 30
    n = len(ai)
    return _metric(
        "cost_per_recommendation_usd", "Cost per recommendation",
        round((model + infra) / n, 6) if n else None, "usd",
        "Model spend (from the task ledger) plus the window's share of hosting cost ÷ AI suggestions",
        higher_is_better=False, assumption=True, recommendations=n,
        model_cost_usd=round(model, 6), model_per_recommendation_usd=round(model / n, 6) if n else None,
        infra_cost_usd=round(infra, 2), infra_per_recommendation_usd=round(infra / n, 6) if n else None,
        infra_source="assumption (BENCH_INFRA_COST_PER_MONTH_USD)")


def allocation_success_rate(ai: Rows, manual: Rows) -> Dict[str, Any]:
    def rate(rows: Rows):
        known = [r for r in rows if r["outcome"]]
        return _pct(sum(r["outcome"] == "success" for r in known), len(known)), len(known)

    ai_rate, ai_known = rate(ai)
    manual_rate, manual_known = rate(manual)
    awaiting = sum(r["allocated_at"] is not None and not r["outcome"] for r in ai)
    return _metric(
        "allocation_success_rate", "Allocation success rate", ai_rate, "pct",
        "AI-recommended allocations that worked out ÷ those with a recorded outcome",
        higher_is_better=True, outcomes_recorded=ai_known, awaiting_outcome=awaiting,
        manual_success_rate=manual_rate, manual_outcomes_recorded=manual_known)


def summary(days: int = 30) -> Dict[str, Any]:
    days = max(1, min(int(days), 365))
    rows = store.fetch(time.time() - days * 86400)
    ai = [r for r in rows if r["source"] == "ai"]
    manual = [r for r in rows if r["source"] == "manual"]

    daily: Dict[str, Dict[str, Any]] = {}
    for r in ai:
        day = time.strftime("%Y-%m-%d", time.gmtime(r["created_at"]))
        d = daily.setdefault(day, {"date": day, "recommendations": 0, "accepted": 0, "modified": 0,
                                   "rejected": 0, "pending": 0})
        d["recommendations"] += 1
        d[r["decision"] or "pending"] += 1

    recent = [{
        "rec_id": r["rec_id"], "source": r["source"], "candidate_id": r["candidate_id"],
        "target_role": r["target_role"], "match_pct": r["match_pct"], "needs_help": r["needs_help"],
        "help_reasons": r["help_reasons"], "created_at": r["created_at"], "decision": r["decision"],
        "decided_by": r["decided_by"], "allocated_at": r["allocated_at"], "outcome": r["outcome"],
        "model_cost_usd": r["model_cost_usd"],
        "minutes_to_allocate": (round((r["allocated_at"] - r["requested_at"]) / 60, 1)
                                if r["allocated_at"] is not None else None),
    } for r in rows[:25]]

    return {
        "window_days": days,
        "generated_at": time.time(),
        "recommendations": len(ai),
        "manual_allocations": len(manual),
        "metrics": [
            acceptance_rate(ai),
            time_to_allocate(ai, manual),
            intervention_rate(ai),
            cost_per_recommendation(ai, days),
            allocation_success_rate(ai, manual),
        ],
        "daily": [daily[k] for k in sorted(daily)],
        "recent": recent,
    }
