"""
Multi-Runbook Reasoning API — Phase 4.

Handles compound incidents that span multiple domains.
All reasoning is RAGless: SQL matching + graph traversal + structural conflict detection.
"""
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from agents.conflict_detector_agent import detect_conflicts
from agents.compound_incident_agent import analyze_compound_incident
from agents.multi_runbook_merger_agent import merge_runbooks
from agents.runbook_matcher_agent import match_runbooks
from agents.incident_classifier_agent import classify_incident
from database.runbooks_store import get_runbook
from utils.rate_limit import query_limiter, client_key

router = APIRouter(prefix="/multi", tags=["multi-runbook"])


class MultiRunbookRequest(BaseModel):
    runbook_ids: List[int] = Field(
        ..., min_length=2, max_length=10,
        description="List of runbook IDs to merge (2–10)",
    )


class CompoundIncidentRequest(BaseModel):
    incident: str = Field(
        ..., min_length=10, max_length=2000,
        description="Describe the compound incident",
    )
    max_runbooks_per_domain: int = Field(default=1, ge=1, le=3)


class ConflictCheckRequest(BaseModel):
    runbook_ids: List[int] = Field(
        ..., min_length=2, max_length=10,
    )


@router.post(
    "/merge",
    responses={
        400: {"description": "Invalid runbook IDs or merge failed"},
        404: {"description": "One or more runbook IDs not found"},
        429: {"description": "Rate limit exceeded — 20 requests/minute per IP"},
    },
)
def merge_runbook_plans(request: Request, req: MultiRunbookRequest):
    """
    Merge multiple runbooks into a single ordered composite execution plan.

    Returns:
    - composite_steps: all steps globally numbered, in safe execution order
    - conflicts: contradicting commands detected between runbooks
    - parallel_opportunities: runbook pairs that can safely run simultaneously
    - rollback_sequence: unified rollback in reverse domain order
    - execution_strategy: recommended approach given conflict severity
    """
    # BUG FIX: no rate limiting — unauthenticated callers could exhaust LLM quota in a loop.
    query_limiter.check(client_key(request), "Multi-runbook rate limit: 20 requests/minute per IP")

    # Validate all IDs exist
    missing = [rid for rid in req.runbook_ids if not get_runbook(rid)]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Runbooks not found: {missing}",
        )

    result = merge_runbooks(req.runbook_ids)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.post(
    "/conflicts",
    responses={
        404: {"description": "One or more runbooks not found"},
        429: {"description": "Rate limit exceeded — 20 requests/minute per IP"},
    },
)
def check_conflicts(request: Request, req: ConflictCheckRequest):
    """
    Check for conflicting commands between runbooks without merging.
    Fast conflict-only check — useful before deciding execution order.
    """
    # BUG FIX: no rate limiting — DB-heavy conflict scan was unthrottled.
    query_limiter.check(client_key(request), "Conflict-check rate limit: 20 requests/minute per IP")

    missing = [rid for rid in req.runbook_ids if not get_runbook(rid)]
    if missing:
        raise HTTPException(status_code=404, detail=f"Runbooks not found: {missing}")

    conflicts = detect_conflicts(req.runbook_ids)

    critical = [c for c in conflicts if c["severity"] == "CRITICAL"]
    high = [c for c in conflicts if c["severity"] == "HIGH"]
    medium = [c for c in conflicts if c["severity"] == "MEDIUM"]

    return {
        "runbook_ids": req.runbook_ids,
        "total_conflicts": len(conflicts),
        "critical_count": len(critical),
        "high_count": len(high),
        "medium_count": len(medium),
        "safe_to_run_together": len(critical) == 0 and len(high) == 0,
        "conflicts": conflicts,
        "recommendation": (
            "SAFE — no blocking conflicts detected. Parallel execution possible."
            if not critical and not high
            else "UNSAFE — resolve conflicts before executing runbooks together."
        ),
    }


@router.post(
    "/compound",
    responses={
        400: {"description": "Incident analysis failed"},
        429: {"description": "Rate limit exceeded — 20 requests/minute per IP"},
    },
)
def handle_compound_incident(request: Request, req: CompoundIncidentRequest):
    """
    Full compound incident handler.

    Pipeline:
    1. analyze_compound_incident: LLM decomposes incident into ordered sub-problems
    2. For each sub-problem: SQL match → find best runbook
    3. merge_runbooks: build composite plan with conflict detection

    Returns a complete multi-domain execution plan.
    """
    # BUG FIX: /multi/compound made multiple LLM calls per request with no rate limiting —
    # an unauthenticated caller could exhaust the entire LLM API quota in seconds.
    query_limiter.check(client_key(request), "Compound incident rate limit: 20 requests/minute per IP")

    # Step 1: Decompose the incident
    decomposition = analyze_compound_incident(req.incident)

    # Step 2: Match runbooks for each sub-incident
    matched_per_domain = []
    selected_ids = []
    seen_ids: set = set()

    for sub in decomposition["sub_incidents"]:
        matches = match_runbooks(
            category=sub["domain"],
            severity=sub["severity"],
            search_terms=sub.get("search_terms", []),
            limit=req.max_runbooks_per_domain,
        )
        domain_selected = []
        for m in matches:
            if m["id"] not in seen_ids:
                domain_selected.append(m)
                selected_ids.append(m["id"])
                seen_ids.add(m["id"])

        matched_per_domain.append({
            "domain": sub["domain"],
            "severity": sub["severity"],
            "description": sub["description"],
            "execution_order": sub.get("execution_order", 99),
            "matched_runbooks": domain_selected,
        })

    if not selected_ids:
        return {
            "incident": req.incident,
            "is_compound": decomposition["is_compound"],
            "decomposition": decomposition,
            "matched_per_domain": matched_per_domain,
            "composite_plan": None,
            "message": "No runbooks found for this incident. Upload relevant PDFs via POST /ingest/upload",
        }

    # Step 3: Merge into composite plan
    composite = merge_runbooks(selected_ids)

    return {
        "incident": req.incident,
        "is_compound": decomposition["is_compound"],
        "total_domains": decomposition["total_domains"],
        "decomposition_reasoning": decomposition["reasoning"],
        "matched_per_domain": matched_per_domain,
        "selected_runbook_ids": selected_ids,
        "composite_plan": composite,
    }


@router.get(
    "/runbooks/{runbook_id}/similar",
    responses={404: {"description": "Runbook not found"}},
)
def find_similar_runbooks(runbook_id: int, limit: int = 5):
    """
    Find runbooks in the same category and severity.
    RAGless: SQL query on structured fields — no vector similarity.
    """
    rb = get_runbook(runbook_id)
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")

    similar = match_runbooks(
        category=rb["category"],
        severity=rb["severity"],
        search_terms=rb["title"].lower().split()[:3],
        limit=limit + 1,
    )
    # Exclude the runbook itself
    similar = [s for s in similar if s["id"] != runbook_id][:limit]

    return {
        "runbook_id": runbook_id,
        "runbook_title": rb["title"],
        "similar_runbooks": similar,
        "total": len(similar),
    }
