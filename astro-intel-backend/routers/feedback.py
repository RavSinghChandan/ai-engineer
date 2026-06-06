"""
FastAPI router — /api/v1/feedback/*

Endpoints:
  POST /corrections          — log a manual correction (or batch)
  GET  /corrections          — list recent corrections for this tenant
  GET  /corrections/stats    — counts by intent for this tenant
  GET  /persona/preferences  — this tenant's static key-value prefs
  POST /persona/preferences  — upsert a key-value pref for this tenant
  GET  /persona/preview      — show what agents will see for a given query
  GET  /memory-summary       — P4 pattern: full memory profile for this tenant

All endpoints are tenant-scoped: each tenant only sees and modifies their own data.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth.dependencies import get_tenant_ctx
from auth.models import TenantContext
from auth.rbac import Permission, can
from memory.episodic import (
    log_correction,
    list_corrections,
    correction_stats,
    set_persona_pref,
    get_persona_prefs,
)
from memory.persona import build_tenant_context, format_for_prompt

router = APIRouter(prefix="/api/v1/feedback", tags=["Feedback & Episodic Memory"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CorrectionIn(BaseModel):
    insight_id:     str
    original_text:  str
    corrected_text: str
    intent:         str        = "general"
    query_type:     str        = "general"
    domains:        List[str]  = []
    reason_tag:     str        = ""          # e.g. "tone", "wrong_remedy", "factual"


class BatchCorrectionIn(BaseModel):
    corrections: List[CorrectionIn]


class PersonaPrefIn(BaseModel):
    key:   str
    value: str


# ── POST /corrections ─────────────────────────────────────────────────────────

@router.post("/corrections", summary="Log a single correction for this tenant")
async def post_correction(
    body: CorrectionIn,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    if not body.original_text.strip() or not body.corrected_text.strip():
        raise HTTPException(status_code=422, detail="original_text and corrected_text must not be empty.")
    if body.original_text.strip() == body.corrected_text.strip():
        raise HTTPException(status_code=422, detail="original_text and corrected_text are identical — nothing to log.")

    row_id = log_correction(
        tenant_id=ctx.tenant_id,
        insight_id=body.insight_id,
        original_text=body.original_text,
        corrected_text=body.corrected_text,
        intent=body.intent,
        query_type=body.query_type,
        domains=body.domains,
        reason_tag=body.reason_tag,
    )
    return JSONResponse({"status": "logged", "id": row_id, "tenant_id": ctx.tenant_id})


@router.post("/corrections/batch", summary="Log multiple corrections at once for this tenant")
async def post_corrections_batch(
    body: BatchCorrectionIn,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    ids = []
    for c in body.corrections:
        if c.original_text.strip() and c.corrected_text.strip() and \
                c.original_text.strip() != c.corrected_text.strip():
            row_id = log_correction(
                tenant_id=ctx.tenant_id,
                insight_id=c.insight_id,
                original_text=c.original_text,
                corrected_text=c.corrected_text,
                intent=c.intent,
                query_type=c.query_type,
                domains=c.domains,
                reason_tag=c.reason_tag,
            )
            ids.append(row_id)
    return JSONResponse({"status": "logged", "count": len(ids), "ids": ids, "tenant_id": ctx.tenant_id})


# ── GET /corrections ──────────────────────────────────────────────────────────

@router.get("/corrections", summary="List recent corrections for this tenant")
async def get_corrections(
    limit:  int            = Query(50, ge=1, le=500),
    intent: Optional[str]  = Query(None),
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    rows = list_corrections(tenant_id=ctx.tenant_id, limit=limit, intent=intent)
    return JSONResponse({"corrections": rows, "count": len(rows), "tenant_id": ctx.tenant_id})


@router.get("/corrections/stats", summary="Correction counts by intent for this tenant")
async def get_correction_stats(
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    return JSONResponse(correction_stats(tenant_id=ctx.tenant_id))


# ── Persona preferences ───────────────────────────────────────────────────────

@router.get("/persona/preferences", summary="Get all saved persona preferences for this tenant")
async def get_preferences(
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    return JSONResponse({"preferences": get_persona_prefs(tenant_id=ctx.tenant_id), "tenant_id": ctx.tenant_id})


@router.post("/persona/preferences", summary="Set a persona preference key-value for this tenant")
async def set_preference(
    body: PersonaPrefIn,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    if not body.key.strip() or not body.value.strip():
        raise HTTPException(status_code=422, detail="key and value must not be empty.")
    set_persona_pref(tenant_id=ctx.tenant_id, key=body.key.strip(), value=body.value.strip())
    return JSONResponse({"status": "saved", "key": body.key, "value": body.value, "tenant_id": ctx.tenant_id})


# ── Preview — what will agents actually see? ──────────────────────────────────

@router.get("/persona/preview", summary="Preview the full persona context for a query (this tenant only)")
async def preview_persona(
    query:  str           = Query(..., description="The user's question or insight text"),
    intent: str           = Query("general"),
    top_k:  int           = Query(5, ge=1, le=20),
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    tenant_ctx = build_tenant_context(
        query=query,
        intent=intent,
        tenant_id=ctx.tenant_id,
        top_k=top_k,
    )
    return JSONResponse({
        "tenant_id":              ctx.tenant_id,
        "past_corrections_found": len(tenant_ctx["past_corrections"]),
        "past_corrections":       tenant_ctx["past_corrections"],
        "preference_overrides":   tenant_ctx["preference_overrides"],
        "full_prompt_block":      format_for_prompt(tenant_ctx),
    })


# ── P4 Memory-Based AI Pattern — /memory-summary ─────────────────────────────

@router.get("/memory-summary", summary="P4 pattern: full memory profile for this tenant")
async def get_memory_summary(
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    """
    P4 — Memory-Based AI pattern endpoint.

    Flow: Retrieve → Context Build → LLM → Store

    Returns the tenant's complete memory profile:
    - Episodic correction count and breakdown by intent
    - Saved persona preferences
    - 5 most recent corrections
    - Correction summary injected into every pipeline run

    This endpoint makes the P4 pattern directly observable and demo-able.
    Every POST /analysis/run auto-retrieves from this same store and injects
    it as persona_context before any agent runs.
    """
    stats   = correction_stats(ctx.tenant_id)
    prefs   = get_persona_prefs(ctx.tenant_id)
    recent  = list_corrections(ctx.tenant_id, limit=5)
    preview = build_tenant_context(query="general", intent="general", tenant_id=ctx.tenant_id)

    return JSONResponse({
        "tenant_id":          ctx.tenant_id,
        "pattern":            "P4-Memory-Based-AI",
        "flow":               "retrieve → context_build → LLM → store",
        "correction_count":   stats["total_corrections"],
        "by_intent":          stats["by_intent"],
        "preferences":        prefs,
        "recent_corrections": recent,
        "persona_preview":    preview.get("correction_summary", ""),
        "how_it_works": {
            "retrieve":      "build_tenant_context() fetches top-K corrections by cosine similarity",
            "context_build": "persona_injection_node formats corrections into persona_context string",
            "llm":           "all 15 domain agents receive persona_context via build_prompt()",
            "store":         "POST /approve with edited_insights calls log_correction() → SQLite",
        },
    })
