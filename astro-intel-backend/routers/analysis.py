"""
FastAPI router — /api/v1/analysis/*
All analysis orchestration endpoints.
"""
from __future__ import annotations
import uuid
import asyncio
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from schemas import AnalysisRequest, ApprovalRequest
from graph.pipeline import run_pipeline
from agents.report_agent import final_report_agent
import memory.store as store

router = APIRouter(prefix="/api/v1/analysis", tags=["Analysis"])

# In-memory session store (maps session_id → completed pipeline state)
_sessions: Dict[str, Dict[str, Any]] = {}


# ── POST /run — start full analysis ──────────────────────────────────────────
@router.post("/run")
async def run_analysis(req: AnalysisRequest) -> JSONResponse:
    """
    Execute the full LangGraph pipeline and return admin review + raw outputs.
    """
    session_id = str(uuid.uuid4())

    # Build initial state dict
    profile_dict = req.user_profile.dict()
    initial_state: Dict[str, Any] = {
        "user_profile":     profile_dict,
        "user_question":    req.user_question or "",
        "selected_modules": req.selected_modules,
        "module_inputs":    req.module_inputs,
        "focus_context":    {},
        "memory":           {},
        "consolidated":     {},
        "remedies":         {},
        "admin_review":     {},
        "final_report":     {},
        "agent_log":        [],
        "errors":           [],
    }

    # Run synchronously inside executor to avoid blocking event loop
    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(None, run_pipeline, initial_state)

    # Persist session
    _sessions[session_id] = final_state

    # Also write to shared memory store (async)
    await store.write_meta(session_id, "state", final_state)
    await store.write_meta(session_id, "profile", profile_dict)

    return JSONResponse(content={
        "session_id":   session_id,
        "status":       "completed",
        "focus_context": final_state.get("focus_context", {}),
        "memory_keys":   store.memory_keys(session_id),
        "admin_review":  final_state.get("admin_review", {}),
        "agent_log":     final_state.get("agent_log", []),
        "raw_outputs": {
            "astrology":  final_state.get("memory", {}).get("astrology"),
            "numerology": final_state.get("memory", {}).get("numerology"),
            "palmistry":  final_state.get("memory", {}).get("palmistry"),
            "tarot":      final_state.get("memory", {}).get("tarot"),
            "vastu":      final_state.get("memory", {}).get("vastu"),
            "remedies":   final_state.get("remedies"),
            "consolidated": final_state.get("consolidated"),
        },
    })


# ── POST /approve — generate final report ────────────────────────────────────
@router.post("/approve")
async def approve_and_generate(req: ApprovalRequest) -> JSONResponse:
    """
    Accept admin approvals, run Final Report Agent, return polished report.
    """
    session_id = req.session_id
    state = _sessions.get(session_id)
    if not state:
        # Try memory store
        state = await store.read_meta(session_id, "state")
    if not state:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found. Run /run first.")

    admin_review = state.get("admin_review", {})
    memory       = state.get("memory", {})

    report = final_report_agent(
        admin_review   = admin_review,
        approved_ids   = req.approved_sections,
        rejected_ids   = req.rejected_sections,
        brand_name     = req.brand_name,
        logo_url       = req.logo_url,
        image_url      = req.image_url,
        memory         = memory,
    )

    # Persist final report
    _sessions[session_id]["final_report"] = report
    await store.write_meta(session_id, "final_report", report)

    return JSONResponse(content={
        "session_id":   session_id,
        "final_report": report,
    })


# ── GET /session/{session_id} — retrieve stored session ──────────────────────
@router.get("/session/{session_id}")
async def get_session(session_id: str) -> JSONResponse:
    state = _sessions.get(session_id)
    if not state:
        state = await store.read_meta(session_id, "state")
    if not state:
        raise HTTPException(status_code=404, detail="Session not found.")
    return JSONResponse(content={
        "session_id":   session_id,
        "focus_context": state.get("focus_context",{}),
        "admin_review":  state.get("admin_review",{}),
        "final_report":  state.get("final_report",{}),
        "agent_log":     state.get("agent_log",[]),
    })


# ── GET /memory/{session_id} — dump raw memory ───────────────────────────────
@router.get("/memory/{session_id}")
async def get_memory(session_id: str) -> JSONResponse:
    all_mem = await store.read_all(session_id)
    return JSONResponse(content={"session_id": session_id, "memory": all_mem})
