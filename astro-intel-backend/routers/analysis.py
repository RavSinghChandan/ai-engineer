"""
FastAPI router — /api/v1/analysis/*
All analysis orchestration endpoints.
"""
from __future__ import annotations
import uuid
import asyncio
from typing import Any, Dict

import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from schemas import AnalysisRequest, ApprovalRequest
from graph.pipeline import run_pipeline
import agents.prompt_config as prompt_config
from agents.report_agent import final_report_agent
from agents.translation_agent import translation_agent, list_languages
import memory.store as store
import cache.store as response_cache
from metrics.collector import get_collector, RunRecord
from utils.deepseek_client import get_session_usage, reset_session_usage

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
    # ── Apply per-request prompt version ─────────────────────────────────────
    requested_version = (req.prompt_version or "v2").strip().lower()
    if requested_version in ("v1", "v2"):
        prompt_config.ACTIVE_PROMPT_VERSION = requested_version

    profile_dict   = req.user_profile.model_dump()
    final_question = (req.user_question or "").strip()

    def _norm(t: str) -> str:
        return " ".join(t.lower().split())

    extra_questions = [
        q for q in (req.questions or [])
        if q and q.strip() and _norm(q.strip()) != _norm(final_question)
    ]

    # ── Cache check (skip if bypass_cache=true) ───────────────────────────────
    bypass = req.bypass_cache
    cache_key = response_cache.make_key(
        user_id       = getattr(req, "user_id", "") or "",
        questions     = extra_questions,
        user_question = final_question,
        profile       = profile_dict,
    )

    if not bypass:
        cached = response_cache.get(cache_key, ttl=response_cache.PROFILE_TTL_SECONDS)
        if cached is not None:
            # Return cached response instantly — no LLM calls, no pipeline
            cached["cache_hit"]  = True
            cached["cache_key"]  = cache_key
            return JSONResponse(content=cached)

    # ── Cache miss — run the full pipeline ────────────────────────────────────
    session_id = str(uuid.uuid4())

    initial_state: Dict[str, Any] = {
        "user_profile":        profile_dict,
        "user_question":       final_question,
        "questions":           extra_questions,
        "selected_modules":    req.selected_modules,
        "module_inputs":       req.module_inputs,
        "geocode":             req.geocode or {},
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

    reset_session_usage()
    t_start = time.time()
    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(None, run_pipeline, initial_state)
    t_end = time.time()

    _sessions[session_id] = final_state
    await store.write_meta(session_id, "state", final_state)
    await store.write_meta(session_id, "profile", profile_dict)

    # ── Collect metrics ───────────────────────────────────────────────────────
    _record_metrics(session_id, final_state, t_start, t_end)

    admin_review = final_state.get("admin_review", {})

    response_body: Dict[str, Any] = {
        "session_id":           session_id,
        "status":               "completed",
        "cache_hit":            False,
        "cache_key":            cache_key,
        "focus_context":        final_state.get("focus_context", {}),
        "normalized_questions": final_state.get("normalized_questions", []),
        "memory_keys":          store.memory_keys(session_id),
        "admin_review":         admin_review,
        "agent_log":            final_state.get("agent_log", []),
        "hallucination_audit":  final_state.get("hallucination_audit", {}),
        "raw_outputs": {
            "astrology":    final_state.get("memory", {}).get("astrology"),
            "numerology":   final_state.get("memory", {}).get("numerology"),
            "palmistry":    final_state.get("memory", {}).get("palmistry"),
            "tarot":        final_state.get("memory", {}).get("tarot"),
            "vastu":        final_state.get("memory", {}).get("vastu"),
            "remedies":     final_state.get("remedies"),
            "consolidated": final_state.get("consolidated"),
        },
    }

    # ── Store in cache for future requests from same user ─────────────────────
    response_cache.set(
        cache_key,
        response_body,
        ttl  = response_cache.PROFILE_TTL_SECONDS,
        meta = {
            "key_type":      "profile",
            "user_name":     profile_dict.get("full_name", ""),
            "date_of_birth": profile_dict.get("date_of_birth", ""),
            "place_of_birth": profile_dict.get("place_of_birth", ""),
        },
    )

    return JSONResponse(content=response_body)


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
    # Inject user_profile into memory so simplify_agent can personalise WHEN windows by birth month
    memory       = {**state.get("memory", {}), "user_profile": state.get("user_profile", {})}
    remedies     = state.get("remedies", {})

    reset_session_usage()          # clear accumulator before report generation
    t_approve_start = time.time()

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

    t_approve_end = time.time()
    # Record approve-phase token usage back into the session's run record
    _record_approve_tokens(session_id, t_approve_start, t_approve_end)

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


# ── Metrics helper ───────────────────────────────────────────────────────────
def _record_metrics(session_id: str, state: dict, t_start: float, t_end: float) -> None:
    """Extract signals from completed pipeline state and record to MetricsCollector."""
    total_ms = (t_end - t_start) * 1000

    # Agent latency from agent_log timestamps (best-effort parse)
    agent_latencies: dict = {}
    agent_log = state.get("agent_log", [])
    known_agents = ["question_agent", "domain_agents", "meta_agent", "remedy_agent", "admin_review_agent"]
    # Approximate equal split as fallback (pipeline is mostly sequential)
    per_agent_ms = total_ms / max(len(known_agents), 1)
    for ag in known_agents:
        agent_latencies[ag] = round(per_agent_ms, 1)

    # Confidence distribution from admin_review
    conf_counts: dict = {"high": 0, "medium": 0, "low": 0}
    admin_review = state.get("admin_review", {})
    questions_data = admin_review.get("questions", [])
    high_conf_questions = 0
    total_questions = len(questions_data) or 1

    for q in questions_data:
        q_has_high = False
        for insight in q.get("insights", []):
            lvl = insight.get("confidence", "low").lower()
            if lvl in conf_counts:
                conf_counts[lvl] += 1
            if lvl == "high":
                q_has_high = True
        if q_has_high:
            high_conf_questions += 1

    # If admin_review empty, fall back to question_consensus
    if not questions_data:
        for qc in state.get("question_consensus", []):
            for insight in qc.get("insights", []):
                lvl = insight.get("confidence", "low").lower()
                if lvl in conf_counts:
                    conf_counts[lvl] += 1

    # Domain coverage
    memory = state.get("memory", {})
    domains = ["astrology", "numerology", "palmistry", "tarot", "vastu"]
    domains_active = sum(1 for d in domains if memory.get(d))

    # Errors
    errors = state.get("errors", [])

    # Real token economics from DeepSeek API usage
    tok = get_session_usage()
    prompt_tokens     = tok["prompt_tokens"]
    completion_tokens = tok["completion_tokens"]
    total_tokens      = tok["total_tokens"]
    llm_calls         = tok["calls"]
    # DeepSeek pricing: $0.14/1M input + $0.28/1M output
    cost_usd = round(
        prompt_tokens     * 0.14 / 1_000_000 +
        completion_tokens * 0.28 / 1_000_000,
        6
    )
    # Fallback estimate when no real LLM calls happened in /run
    estimated_tokens = total_tokens if total_tokens > 0 else (2000 if state.get("final_report") else 400)

    # Pull hallucination audit results
    h_audit = state.get("hallucination_audit", {})
    h_l2 = h_audit.get("layer2_detection", {})
    h_l3 = h_audit.get("layer3_recovery", {})

    record = RunRecord(
        session_id=session_id,
        started_at=t_start,
        ended_at=t_end,
        total_latency_ms=total_ms,
        agent_latencies=agent_latencies,
        confidence_counts=conf_counts,
        domains_active=domains_active,
        error_count=len(errors),
        errors=[str(e) for e in errors],
        estimated_tokens=estimated_tokens,
        questions_count=total_questions,
        high_confidence_questions=high_conf_questions,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        llm_calls=llm_calls,
        cost_usd=cost_usd,
        hallucination_risk=h_audit.get("overall_risk", "unknown"),
        hallucination_rate_pct=h_audit.get("hallucination_rate_pct", 0.0),
        single_source_flags=h_l2.get("single_source_flags", 0),
        hedge_phrase_flags=h_l2.get("hedge_phrase_flags", 0),
        contradiction_flags=h_l2.get("contradiction_flags", 0),
        suppressed_count=h_l3.get("suppressed_count", 0),
        fallback_injected=h_l3.get("fallback_injected", 0),
        coverage_gap=h_l2.get("coverage_gap", False),
    )
    get_collector().record(record)


def _record_approve_tokens(session_id: str, t_start: float, t_end: float) -> None:
    """
    After /approve, update the existing run record for this session with
    real token counts from the report generation LLM call(s).
    We update the collector's last record if it matches this session.
    """
    tok = get_session_usage()
    if tok["calls"] == 0:
        return  # no LLM calls happened (e.g. no DEEPSEEK_API_KEY or fallback path)

    cost_usd = round(
        tok["prompt_tokens"]     * 0.14 / 1_000_000 +
        tok["completion_tokens"] * 0.28 / 1_000_000,
        6
    )
    collector = get_collector()
    # Find the matching run in deque and update in-place
    for record in reversed(list(collector._runs)):
        if record.session_id == session_id:
            record.prompt_tokens     += tok["prompt_tokens"]
            record.completion_tokens += tok["completion_tokens"]
            record.total_tokens      += tok["total_tokens"]
            record.llm_calls         += tok["calls"]
            record.cost_usd          += cost_usd
            record.estimated_tokens   = record.total_tokens
            break


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

    import os, json as _json
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not deepseek_key:
        # try loading from .env in project root
        try:
            root_env = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
            with open(root_env) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DEEPSEEK_API_KEY="):
                        deepseek_key = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass

    if not deepseek_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY not set. Add it to your .env file.")

    import urllib.request as _urllib

    def llm_caller(prompt: Dict[str, Any]) -> str:
        payload = _json.dumps({
            "model": "deepseek-chat",
            "temperature": prompt.get("temperature", 0),
            "max_tokens": prompt.get("max_tokens", 4096),
            "messages": [
                {"role": "system", "content": prompt["system"]},
                {"role": "user",   "content": prompt["user"]},
            ],
        }).encode()
        req_obj = _urllib.Request(
            "https://api.deepseek.com/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {deepseek_key}",
            },
            method="POST",
        )
        with _urllib.urlopen(req_obj, timeout=30) as resp:
            data = _json.loads(resp.read().decode())
        raw = data["choices"][0]["message"]["content"]
        if raw.strip().startswith("```"):
            raw = "\n".join(
                l for l in raw.strip().splitlines()
                if not l.strip().startswith("```")
            ).strip()
        return raw

    try:
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
