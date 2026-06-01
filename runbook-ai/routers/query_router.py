"""
Incident Query API — Phase 3 core endpoint.

POST /query  — describe an incident, get back ordered steps with exact commands.

RAGless: classify → SQL match → graph traversal → structured response.
Zero vectors. Every command pulled from database verbatim.
"""
from __future__ import annotations
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from graph.query_pipeline import query_pipeline
from agents.runbook_matcher_agent import match_runbooks
from agents.incident_classifier_agent import classify_incident
from agents.response_composer_agent import compose_response
from agents.multi_source_composer import build_multi_source_response
from routers.deps import optional_auth, CurrentUser
from utils.rate_limit import query_limiter, client_key

router = APIRouter(prefix="/query", tags=["query"])

OptionalUser = Annotated[Optional[CurrentUser], Depends(optional_auth)]


class IncidentRequest(BaseModel):
    incident: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Describe the incident in plain English",
        examples=["Pods are stuck in CrashLoopBackOff in the payments namespace"],
    )
    max_runbooks: int = Field(default=3, ge=1, le=10)
    runbook_id: Optional[int] = Field(
        default=None,
        description="Pin to a specific runbook ID (skips matching)",
    )


class QuickMatchRequest(BaseModel):
    incident: str = Field(..., min_length=5, max_length=500)


@router.post(
    "",
    responses={
        400: {"description": "Incident description is empty or too short"},
        404: {"description": "Pinned runbook ID not found"},
        429: {"description": "Rate limit exceeded — 20 queries/minute per IP"},
    },
)
def query_incident(request: Request, req: IncidentRequest, current_user: OptionalUser = None):
    """
    Main endpoint: describe an incident → get ordered runbook steps.

    Pipeline:
    1. classify_incident: LLM extracts category, severity, search_terms
    2. match_runbooks: SQL queries — no vectors
    3. compose_response: graph traversal for order + DB for exact commands

    Returns structured response with:
    - Matched runbook(s) with confidence scores
    - Steps in safe execution order (topological sort)
    - Parallel execution plan (which steps can run simultaneously)
    - Rollback steps
    - Triage summary (LLM-generated prose — clearly labelled)
    - All commands pulled verbatim from DB — source: 'database'
    """
    query_limiter.check(client_key(request), "Query rate limit: 20 requests/minute per IP")

    if not req.incident.strip():
        raise HTTPException(status_code=400, detail="Incident description cannot be empty")

    if req.runbook_id:
        # Pinned runbook — skip classification and matching
        response = compose_response(req.incident, req.runbook_id)
        if "error" in response:
            raise HTTPException(status_code=404, detail=response["error"])
        return {
            "incident": req.incident,
            "match_strategy": "pinned",
            "matched_runbooks": [],
            "selected_runbook_id": req.runbook_id,
            "match_confidence": "PINNED",
            "response": response,
            "agent_log": ["pinned runbook — skipped classification and matching"],
        }

    # Full pipeline
    result = query_pipeline.invoke({
        "incident_text": req.incident,
        "agent_log": [],
    })

    if "error" in result.get("response", {}):
        return {
            "incident": req.incident,
            "match_strategy": "full_pipeline",
            "matched_runbooks": result.get("matched_runbooks", []),
            "selected_runbook_id": None,
            "match_confidence": "NONE",
            "response": result["response"],
            "agent_log": result.get("agent_log", []),
            "classification": {
                "category": result.get("category"),
                "severity": result.get("severity"),
                "search_terms": result.get("search_terms", []),
            },
        }

    selected_id = result.get("selected_runbook_id")
    tenant_id = current_user.tenant_id if current_user else 1

    # Build multi-source panels (internal / combined / official)
    multi = {}
    if selected_id:
        try:
            multi = build_multi_source_response(selected_id, tenant_id)
        except Exception:
            multi = {}

    return {
        "incident": req.incident,
        "match_strategy": "full_pipeline",
        "classification": {
            "category": result.get("category"),
            "severity": result.get("severity"),
            "affected_component": result.get("affected_component"),
            "search_terms": result.get("search_terms", []),
        },
        "matched_runbooks": result.get("matched_runbooks", [])[:req.max_runbooks],
        "selected_runbook_id": selected_id,
        "match_confidence": result.get("match_confidence"),
        "response": result.get("response", {}),
        "panels": multi,
        "agent_log": result.get("agent_log", []),
    }


@router.post("/classify")
def classify_only(req: QuickMatchRequest):
    """
    Classify an incident without fetching runbook steps.
    Useful for previewing what category/severity the system assigns.
    """
    classification = classify_incident(req.incident)
    return {
        "incident": req.incident,
        "classification": classification,
    }


@router.post("/match")
def match_only(req: QuickMatchRequest):
    """
    Classify + match runbooks without composing the full response.
    Returns the top matching runbooks with confidence scores.
    """
    classification = classify_incident(req.incident)
    matches = match_runbooks(
        category=classification["category"],
        severity=classification["severity"],
        search_terms=classification["search_terms"],
        limit=5,
    )
    return {
        "incident": req.incident,
        "classification": classification,
        "matched_runbooks": matches,
        "total_matches": len(matches),
    }


@router.post(
    "/runbook/{runbook_id}",
    responses={404: {"description": "Runbook not found"}},
)
def query_specific_runbook(runbook_id: int, req: QuickMatchRequest):
    """
    Get the response for a specific runbook without going through matching.
    Useful when the engineer already knows which runbook to use.
    """
    response = compose_response(req.incident, runbook_id)
    if "error" in response:
        raise HTTPException(status_code=404, detail=response["error"])
    return {
        "incident": req.incident,
        "runbook_id": runbook_id,
        "response": response,
    }
