"""
FastAPI router — /api/v1/analysis/*
All analysis orchestration endpoints.
"""
from __future__ import annotations
import uuid
import asyncio
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from schemas import AnalysisRequest, ApprovalRequest
from graph.pipeline import run_pipeline
from agents.report_agent import final_report_agent
from agents.translation_agent import translation_agent, list_languages
import memory.store as store

router = APIRouter(prefix="/api/v1/analysis", tags=["Analysis"])

# In-memory session store (maps session_id → completed pipeline state)
_sessions: Dict[str, Dict[str, Any]] = {}


# ── POST /run — start full analysis ──────────────────────────────────────────
@router.post("/run")
async def run_analysis(req: AnalysisRequest) -> JSONResponse:
    """
    Execute the full LangGraph pipeline.
    Accepts single user_question AND/OR list of questions.
    Returns admin_review with question-wise insights.
    """
    session_id = str(uuid.uuid4())

    profile_dict = req.user_profile.model_dump()
    initial_state: Dict[str, Any] = {
        "user_profile":        profile_dict,
        "user_question":       req.user_question or "",
        "questions":           req.questions or [],
        "selected_modules":    req.selected_modules,
        "module_inputs":       req.module_inputs,
        "normalized_questions":[],
        "focus_context":       {},
        "memory":              {},
        "consolidated":        {},
        "question_consensus":  [],
        "admin_review_data":   {},
        "remedies":            {},
        "admin_review":        {},
        "final_report":        {},
        "agent_log":           [],
        "errors":              [],
    }

    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(None, run_pipeline, initial_state)

    _sessions[session_id] = final_state
    await store.write_meta(session_id, "state", final_state)
    await store.write_meta(session_id, "profile", profile_dict)

    admin_review = final_state.get("admin_review", {})

    return JSONResponse(content={
        "session_id":          session_id,
        "status":              "completed",
        "focus_context":       final_state.get("focus_context", {}),
        "normalized_questions": final_state.get("normalized_questions", []),
        "memory_keys":         store.memory_keys(session_id),
        "admin_review":        admin_review,
        "agent_log":           final_state.get("agent_log", []),
        "raw_outputs": {
            "astrology":    final_state.get("memory", {}).get("astrology"),
            "numerology":   final_state.get("memory", {}).get("numerology"),
            "palmistry":    final_state.get("memory", {}).get("palmistry"),
            "tarot":        final_state.get("memory", {}).get("tarot"),
            "vastu":        final_state.get("memory", {}).get("vastu"),
            "remedies":     final_state.get("remedies"),
            "consolidated": final_state.get("consolidated"),
        },
    })


# ── POST /approve — generate final report ────────────────────────────────────
@router.post("/approve")
async def approve_and_generate(req: ApprovalRequest) -> JSONResponse:
    """
    Accept admin approvals by insight ID, generate final report.
    Uses approved_insight_ids / rejected_insight_ids (enterprise schema).
    """
    session_id = req.session_id
    state = _sessions.get(session_id)
    if not state:
        state = await store.read_meta(session_id, "state")
    if not state:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found. Run /run first.")

    admin_review = state.get("admin_review", {})
    memory       = state.get("memory", {})
    remedies     = state.get("remedies", {})

    report = final_report_agent(
        admin_review = admin_review,
        approved_ids = req.approved_insight_ids,
        rejected_ids = req.rejected_insight_ids,
        brand_name   = req.brand_name,
        logo_url     = req.logo_url,
        image_url    = req.image_url,
        memory       = memory,
        remedies     = remedies,
    )

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
        "session_id":          session_id,
        "focus_context":       state.get("focus_context", {}),
        "normalized_questions": state.get("normalized_questions", []),
        "admin_review":        state.get("admin_review", {}),
        "final_report":        state.get("final_report", {}),
        "agent_log":           state.get("agent_log", []),
    })


# ── GET /memory/{session_id} — dump raw memory ───────────────────────────────
@router.get("/memory/{session_id}")
async def get_memory(session_id: str) -> JSONResponse:
    all_mem = await store.read_all(session_id)
    return JSONResponse(content={"session_id": session_id, "memory": all_mem})


# ── GET /languages — list all supported translation languages ─────────────────
@router.get("/languages")
async def get_languages() -> JSONResponse:
    return JSONResponse(content={"languages": list_languages()})


# ── POST /translate — translate a final report into a target language ─────────
class TranslateRequest(BaseModel):
    session_id: str
    language_code: str           # e.g. "hi", "bn", "ta"
    report: Dict[str, Any] = {}  # if provided, translate this; else load from session


@router.post("/translate")
async def translate_report(req: TranslateRequest) -> JSONResponse:
    """
    Translate a FinalReport into one of the 22 Indian Constitutional languages.
    Preserves tone, structure, impact, and spiritual register.
    """
    report = req.report

    # Fall back to session-stored report if no report body provided
    if not report and req.session_id:
        state = _sessions.get(req.session_id)
        if not state:
            state = await store.read_meta(req.session_id, "state")
        if state:
            report = state.get("final_report", {})
        if not report:
            stored = await store.read_meta(req.session_id, "final_report")
            if stored:
                report = stored

    if not report:
        raise HTTPException(
            status_code=404,
            detail="No report found. Provide report in request body or run /approve first."
        )

    try:
        # Import Anthropic client lazily to avoid hard dependency at startup
        try:
            import anthropic
            client = anthropic.Anthropic()

            def llm_caller(prompt: Dict[str, Any]) -> str:
                msg = client.messages.create(
                    model=prompt["model"],
                    max_tokens=prompt["max_tokens"],
                    temperature=prompt["temperature"],
                    system=prompt["system"],
                    messages=[{"role": "user", "content": prompt["user"]}],
                )
                return msg.content[0].text

        except (ImportError, Exception):
            llm_caller = None   # falls back to mock prefix translation

        translated = translation_agent(
            report=report,
            target_language_code=req.language_code,
            llm_caller=llm_caller,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist translated report to session store
    if req.session_id:
        lang_key = f"final_report_{req.language_code}"
        await store.write_meta(req.session_id, lang_key, translated)

    return JSONResponse(content={
        "session_id":    req.session_id,
        "language_code": req.language_code,
        "language_name": translated.get("language_name", ""),
        "final_report":  translated,
    })
