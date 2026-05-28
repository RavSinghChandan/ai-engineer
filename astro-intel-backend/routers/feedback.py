"""
FastAPI router — /api/v1/feedback/*

Endpoints:
  POST /corrections          — log a manual correction (or batch)
  GET  /corrections          — list recent corrections
  GET  /corrections/stats    — counts by intent
  GET  /persona/preferences  — Chandan's static key-value prefs
  POST /persona/preferences  — upsert a key-value pref
  GET  /persona/preview      — show what agents will see for a given query
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth.dependencies import require_role
from auth.models import Role
from memory.episodic import (
    log_correction,
    list_corrections,
    correction_stats,
    set_persona_pref,
    get_persona_prefs,
)
from memory.persona import build_chandan_context, format_for_prompt

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

@router.post("/corrections", summary="Log a single correction")
async def post_correction(
    body: CorrectionIn,
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    if not body.original_text.strip() or not body.corrected_text.strip():
        raise HTTPException(status_code=422, detail="original_text and corrected_text must not be empty.")
    if body.original_text.strip() == body.corrected_text.strip():
        raise HTTPException(status_code=422, detail="original_text and corrected_text are identical — nothing to log.")

    row_id = log_correction(
        insight_id=body.insight_id,
        original_text=body.original_text,
        corrected_text=body.corrected_text,
        intent=body.intent,
        query_type=body.query_type,
        domains=body.domains,
        reason_tag=body.reason_tag,
    )
    return JSONResponse({"status": "logged", "id": row_id})


@router.post("/corrections/batch", summary="Log multiple corrections at once")
async def post_corrections_batch(
    body: BatchCorrectionIn,
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    ids = []
    for c in body.corrections:
        if c.original_text.strip() and c.corrected_text.strip() and \
                c.original_text.strip() != c.corrected_text.strip():
            row_id = log_correction(
                insight_id=c.insight_id,
                original_text=c.original_text,
                corrected_text=c.corrected_text,
                intent=c.intent,
                query_type=c.query_type,
                domains=c.domains,
                reason_tag=c.reason_tag,
            )
            ids.append(row_id)
    return JSONResponse({"status": "logged", "count": len(ids), "ids": ids})


# ── GET /corrections ──────────────────────────────────────────────────────────

@router.get("/corrections", summary="List recent corrections")
async def get_corrections(
    limit:  int            = Query(50, ge=1, le=500),
    intent: Optional[str]  = Query(None),
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    rows = list_corrections(limit=limit, intent=intent)
    return JSONResponse({"corrections": rows, "count": len(rows)})


@router.get("/corrections/stats", summary="Correction counts by intent")
async def get_correction_stats(
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    return JSONResponse(correction_stats())


# ── Persona preferences ───────────────────────────────────────────────────────

@router.get("/persona/preferences", summary="Get all saved persona preferences")
async def get_preferences(
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    return JSONResponse({"preferences": get_persona_prefs()})


@router.post("/persona/preferences", summary="Set a persona preference key-value")
async def set_preference(
    body: PersonaPrefIn,
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    if not body.key.strip() or not body.value.strip():
        raise HTTPException(status_code=422, detail="key and value must not be empty.")
    set_persona_pref(body.key.strip(), body.value.strip())
    return JSONResponse({"status": "saved", "key": body.key, "value": body.value})


# ── Preview — what will agents actually see? ──────────────────────────────────

@router.get("/persona/preview", summary="Preview the full persona context for a query")
async def preview_persona(
    query:  str           = Query(..., description="The user's question or insight text"),
    intent: str           = Query("general"),
    top_k:  int           = Query(5, ge=1, le=20),
    _: Role = Depends(require_role(Role.ADMIN)),
) -> JSONResponse:
    ctx = build_chandan_context(query=query, intent=intent, top_k=top_k)
    return JSONResponse({
        "past_corrections_found": len(ctx["past_corrections"]),
        "past_corrections":       ctx["past_corrections"],
        "preference_overrides":   ctx["preference_overrides"],
        "full_prompt_block":      format_for_prompt(ctx),
    })
