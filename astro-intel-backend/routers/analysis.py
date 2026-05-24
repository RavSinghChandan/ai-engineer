"""
FastAPI router — /api/v1/analysis/*
All analysis orchestration endpoints.
"""
from __future__ import annotations
import uuid
import asyncio
from typing import Any, Dict

import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from schemas import AnalysisRequest, ApprovalRequest
from graph.pipeline import run_pipeline
import agents.prompt_config as prompt_config
from agents.report_agent import final_report_agent
from agents.grammar_agent import correct_report
from agents.translation_agent import translation_agent, list_languages
import memory.store as store
import cache.store as response_cache
from cache.semantic import semantic_get, semantic_set, semantic_stats
from cache.redis_store import redis_get, redis_set, redis_stats
from metrics.ragas_evaluator import evaluate as ragas_evaluate
from metrics.collector import get_collector, RunRecord
from utils.deepseek_client import get_session_usage, reset_session_usage
from fastapi import Request
from guardrails.production import rate_limiter, RateLimiter
from auth.dependencies import get_tenant_ctx
from auth.models import TenantContext, Role
from auth.rbac import Permission, can, check_resource_access, audit
import session_store
from utils.event_bus import emit as _emit

router = APIRouter(prefix="/api/v1/analysis", tags=["Analysis"])

# IP-based rate limiter for the auth-free /simplify-bullets endpoint
_simplify_limiter = RateLimiter(max_requests=10, window_seconds=60)


# ── POST /run — start full analysis ──────────────────────────────────────────
@router.post("/run")
async def run_analysis(
    req: AnalysisRequest,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    """
    Execute the full LangGraph pipeline.
    Accepts single user_question AND/OR list of questions.
    Returns admin_review with question-wise insights.
    """
    # ── G1: Rate Limiter — keyed by user_id when provided, else tenant_id ────
    rate_key = getattr(req, "user_id", None) or ctx.tenant_id
    allowed, reason = rate_limiter.is_allowed(rate_key)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

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
        # ── Redis distributed cache (multi-instance) — checked first ─────────
        redis_cached = redis_get(cache_key)
        if redis_cached is not None:
            redis_cached["cache_hit"]    = True
            redis_cached["cache_key"]    = cache_key
            redis_cached["redis_cache"]  = True
            return JSONResponse(content=redis_cached)

        # ── In-memory cache (single-instance fast path) ───────────────────────
        cached = response_cache.get(cache_key, ttl=response_cache.PROFILE_TTL_SECONDS)
        if cached is not None:
            cached["cache_hit"]  = True
            cached["cache_key"]  = cache_key
            return JSONResponse(content=cached)

        # ── Semantic cache: similar question from same user ───────────────────
        profile_key   = response_cache.make_profile_key(profile_dict)
        query_text    = final_question or " ".join(extra_questions)
        sem_cached    = semantic_get(query_text, profile_key, ttl=response_cache.PROFILE_TTL_SECONDS)
        if sem_cached is not None:
            sem_cached["cache_hit"]       = True
            sem_cached["cache_key"]       = cache_key
            sem_cached["semantic_cache"]  = True
            return JSONResponse(content=sem_cached)

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

    session_store.save(session_id, final_state, tenant_id=ctx.tenant_id)
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

    # ── Auto-evaluate RAGAS at run time using all insight IDs ────────────────
    # Computes quality scores immediately without requiring admin approval step.
    # approved_ids = all insight IDs so precision/recall see the full output.
    try:
        all_insight_ids = [
            ins["id"]
            for q in admin_review.get("questions", [])
            for ins in q.get("insights", [])
            if isinstance(ins, dict) and ins.get("id")
        ]
        ragas_rec = ragas_evaluate(
            session_id   = session_id,
            report       = admin_review,
            question     = final_question,
            approved_ids = all_insight_ids,
        )
        response_body["ragas_evaluation"] = {
            "faithfulness_proxy":      ragas_rec.faithfulness,
            "answer_relevancy_proxy":  ragas_rec.answer_relevancy,
            "context_precision_proxy": ragas_rec.context_precision,
            "domain_recall_proxy":     ragas_rec.domain_recall,
            "overall_score":           ragas_rec.overall,
            "alerts":                  ragas_rec.alerts,
        }
    except Exception:
        response_body["ragas_evaluation"] = {}

    # ── Store in Redis (distributed) + in-memory (local fast path) ───────────
    cache_meta = {
        "key_type":       "profile",
        "user_name":      profile_dict.get("full_name", ""),
        "date_of_birth":  profile_dict.get("date_of_birth", ""),
        "place_of_birth": profile_dict.get("place_of_birth", ""),
    }
    response_cache.set(cache_key, response_body, ttl=response_cache.PROFILE_TTL_SECONDS, meta=cache_meta)
    redis_set(cache_key, response_body, ttl=response_cache.PROFILE_TTL_SECONDS)

    # ── Store in semantic cache (embeds query for future similarity matches) ───
    profile_key = response_cache.make_profile_key(profile_dict)
    query_text  = final_question or " ".join(extra_questions)
    if query_text:
        semantic_set(query_text, profile_key, response_body,
                     ttl=response_cache.PROFILE_TTL_SECONDS, meta=cache_meta)

    return JSONResponse(content=response_body)


# ── POST /approve — generate final report ────────────────────────────────────
@router.post("/approve")
async def approve_and_generate(
    req: ApprovalRequest,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    """
    Accept admin approvals by insight ID, generate final report.
    Uses approved_insight_ids / rejected_insight_ids (enterprise schema).
    """
    session_id = req.session_id
    state = session_store.get(session_id)
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

    # Grammar agent — polish all report prose before PDF / translation
    try:
        report = correct_report(report, use_llm=True)
    except Exception:
        pass  # never block report delivery on grammar failure

    t_approve_end = time.time()
    # Record approve-phase token usage back into the session's run record
    _record_approve_tokens(session_id, t_approve_start, t_approve_end)

    session_store.update(session_id, "final_report", report, tenant_id=ctx.tenant_id)
    await store.write_meta(session_id, "final_report", report)

    # ── RAGAS evaluation — score against admin_review (full pipeline output) ────
    # Use admin_review (not final_report) — it has the full insight structure.
    # Pass ALL insight IDs so domain_recall/precision reflect the full pipeline,
    # not just the admin's partial selection.
    try:
        original_state   = session_store.get(session_id) or {}
        original_question = (
            original_state.get("user_question") or
            (original_state.get("questions") or [""])[0]
        )
        all_insight_ids = [
            ins["id"]
            for q in admin_review.get("questions", [])
            for ins in q.get("insights", [])
            if isinstance(ins, dict) and ins.get("id")
        ]
        ragas_record = ragas_evaluate(
            session_id   = session_id,
            report       = admin_review,
            question     = original_question,
            approved_ids = all_insight_ids,
        )
        ragas_scores = {
            "faithfulness":      ragas_record.faithfulness,
            "answer_relevancy":  ragas_record.answer_relevancy,
            "context_precision": ragas_record.context_precision,
            "domain_recall":     ragas_record.domain_recall,
            "overall":           ragas_record.overall,
            "alerts":            ragas_record.alerts,
        }
    except Exception:
        ragas_scores = {}

    return JSONResponse(content={
        "session_id":   session_id,
        "final_report": report,
        "ragas_scores": ragas_scores,
    })


# ── GET /session/{session_id} — retrieve stored session ──────────────────────
@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    ctx: TenantContext = Depends(get_tenant_ctx),
) -> JSONResponse:
    state = session_store.get(session_id)
    if not state:
        state = await store.read_meta(session_id, "state")
    if not state:
        raise HTTPException(status_code=404, detail="Session not found.")

    # RBAC: USERs can view own sessions; ADMINs can view all
    session_tenant = state.get("tenant_id", "")
    check_resource_access(Permission.ANALYSIS__VIEW_OWN, session_tenant, ctx)
    audit(ctx, Permission.ANALYSIS__VIEW_OWN, resource_id=session_id)

    return JSONResponse(content={
        "session_id":          session_id,
        "focus_context":       state.get("focus_context", {}),
        "normalized_questions": state.get("normalized_questions", []),
        "admin_review":        state.get("admin_review", {}),
        "final_report":        state.get("final_report", {}),
        "agent_log":           state.get("agent_log", []),
    })


# ── GET /memory/{session_id} — dump raw memory (ADMIN debug only) ─────────────
@router.get("/memory/{session_id}")
async def get_memory(
    session_id: str,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__VIEW_MEMORY)),
) -> JSONResponse:
    audit(ctx, Permission.ANALYSIS__VIEW_MEMORY, resource_id=session_id)
    all_mem = await store.read_all(session_id)
    return JSONResponse(content={"session_id": session_id, "memory": all_mem})


# ── Metrics helper ───────────────────────────────────────────────────────────
def _record_metrics(session_id: str, state: dict, t_start: float, t_end: float) -> None:
    """Extract signals from completed pipeline state and record to MetricsCollector."""
    total_ms = (t_end - t_start) * 1000

    # Agent latency — parse real elapsed time from guardrails agent_log entries
    # Format: "[Guardrails/question_agent] ✓ completed in 1.234s"
    import re as _re
    agent_latencies: dict = {}
    agent_log = state.get("agent_log", [])
    _ag_pattern = _re.compile(r"\[Guardrails/([a-z_]+)\] ✓ completed in ([\d.]+)s")
    for entry in agent_log:
        m = _ag_pattern.search(str(entry))
        if m:
            ag_name, secs = m.group(1), float(m.group(2))
            agent_latencies[ag_name] = round(secs * 1000, 1)
    # Fill any missing agents with a proportional fallback
    known_agents = ["question_agent", "domain_agents", "meta_agent", "remedy_agent", "admin_review_agent"]
    if not agent_latencies:
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
async def translate_report(
    req: TranslateRequest,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__TRANSLATE)),
) -> JSONResponse:
    """
    Translate a FinalReport into one of the 22 Indian Constitutional languages.
    Preserves tone, structure, impact, and spiritual register.
    """
    report = req.report

    # Fall back to session-stored report if no report body provided
    if not report and req.session_id:
        state = session_store.get(req.session_id)
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


# ── POST /simplify-bullets — plain English rewrite of PDF bullet text ─────────
class SimplifyBulletsRequest(BaseModel):
    bullets: list  # list of strings to simplify


_SIMPLIFY_SYSTEM = """You are a plain-language editor for Aura with Rav, a spiritual reading service.

Rewrite the given spiritual insight into simple, warm English that a 12-year-old can easily understand.

Rules:
1. Keep EVERY specific detail: numbers, dates, planet names, card names, sign names, timing windows.
2. Use short sentences — maximum 20 words each.
3. Always use "you" and "your" — second person only.
4. Replace ALL jargon with plain words: Lagna=rising sign, Mahadasha=main life phase, Nakshatra=lunar star, 7th house=marriage area, 10th house=career area, Yoga=a positive pattern, auspicious=favourable, debilitated=weakened, exalted=at its strongest, retrograde=moving backward, karmic=from past patterns, cosmic=natural.
5. No passive voice — write actively.
6. Tone: warm, caring, encouraging — like a trusted older friend. Never scary.
7. Never use absolute language — say "this suggests", "it looks like", "the chart shows". Never "you WILL" or "guaranteed".
8. Never mention death, divorce, serious illness, or financial ruin.
9. Output ONLY the rewritten text. No quotes. No explanations. No preamble.
10. Maximum 60 words per bullet."""


@router.post("/simplify-bullets")
async def simplify_bullets(req: SimplifyBulletsRequest, request: Request) -> JSONResponse:
    """
    Rewrite a list of spiritual insight bullets into plain, simple English.
    Called client-side after Generate Report — not during the review pipeline.
    No auth required (operates on already-approved, non-PII text).
    """
    client_ip = request.client.host if request.client else "unknown"
    allowed, reason = _simplify_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
    from agents.plain_english_agent import _preprocess, _safety_filter
    try:
        from utils.deepseek_client import call as ds_call
    except Exception:
        # DeepSeek unavailable — return originals unchanged
        return JSONResponse(content={"bullets": req.bullets})

    results = []
    for bullet in req.bullets:
        if not bullet or not bullet.strip():
            results.append(bullet)
            continue
        try:
            preprocessed = _preprocess(bullet)
            rewritten = ds_call(
                system=_SIMPLIFY_SYSTEM,
                user=preprocessed,
                temperature=0.25,
                max_tokens=120,
            )
            if rewritten and len(rewritten.strip()) > 8:
                results.append(_safety_filter(rewritten.strip()))
            else:
                results.append(bullet)
        except Exception:
            results.append(bullet)  # fallback: keep original

    return JSONResponse(content={"bullets": results})


# ── RAG Remedies endpoint ─────────────────────────────────────────────────────

class RemediesRequest(BaseModel):
    life_path: int
    intent: str = "general"
    top_k: int = 5

@router.post("/remedies")
async def get_rag_remedies(req: RemediesRequest, request: Request) -> JSONResponse:
    """
    Retrieve remedy bullet points from the numerology book corpus (RAG).
    Returns structured list: [{icon, category, text}]
    """
    try:
        from numerology_rag.retriever import retrieve_remedy
        raw = retrieve_remedy(life_path=req.life_path, intent=req.intent, top_k=req.top_k)
        if not raw:
            return JSONResponse(content={"remedies": []})

        # Parse raw chunks into short bullet points via LLM
        from utils.deepseek_client import call as ds_call
        result = ds_call(
            system=(
                "You are a numerology remedy expert. Given book passages about numerology remedies, "
                "extract 4-6 concrete, actionable remedy bullet points for this person.\n\n"
                "Output ONLY a JSON array like:\n"
                "[\n"
                "  {\"icon\": \"🕉\", \"category\": \"Mantra\", \"text\": \"Chant Om Namah Shivaya 108 times at sunrise\"},\n"
                "  {\"icon\": \"💎\", \"category\": \"Gemstone\", \"text\": \"Wear blue sapphire on right middle finger\"},\n"
                "  {\"icon\": \"🎨\", \"category\": \"Color\", \"text\": \"Wear indigo or deep blue on Saturdays\"},\n"
                "  {\"icon\": \"🌅\", \"category\": \"Daily Practice\", \"text\": \"Meditate for 11 minutes each morning before speaking\"}\n"
                "]\n\n"
                "Use icons: 🕉 for mantra, 💎 for gemstone, 🎨 for color, 🌅 for daily practice, "
                "🍃 for diet/fasting, 🏠 for vastu, ✦ for other.\n"
                "Keep each text under 15 words. Simple English only. No preamble."
            ),
            user=f"Life Path: {req.life_path}\nIntent: {req.intent}\n\nBook passages:\n{raw}",
            temperature=0.1,
            max_tokens=400,
        )
        import json as _json
        from guardrails.production import repair_json
        parsed, _ = repair_json(result or "[]")
        if isinstance(parsed, list):
            return JSONResponse(content={"remedies": parsed[:6]})
        return JSONResponse(content={"remedies": []})
    except Exception:
        return JSONResponse(content={"remedies": []})


# ── Storytelling endpoint ──────────────────────────────────────────────────────

class StoryRequest(BaseModel):
    bullets: list[str]
    question: str
    intent: str
    subject: str = ""
    life_path: int = 0      # used to retrieve remedy from RAG
    remedies: dict = {}     # legacy field kept for backwards-compat, ignored

@router.post("/story")
async def merge_story(req: StoryRequest, request: Request) -> JSONResponse:
    """
    Merge multiple numerology tradition bullets into one storytelling narrative.
    Remedy is fetched from RAG (numerology books), not from LLM-generated JSON.
    """
    from agents.storytelling_agent import numerology_story
    try:
        # Fetch remedy passage from RAG — grounded in actual book content
        rag_remedy_text = ""
        if req.life_path > 0:
            try:
                from numerology_rag.retriever import retrieve_remedy
                rag_remedy_text = retrieve_remedy(
                    life_path=req.life_path,
                    intent=req.intent,
                    top_k=3,
                )
            except Exception:
                pass

        story = numerology_story(
            bullets=req.bullets,
            question=req.question,
            intent=req.intent,
            subject=req.subject,
            rag_remedy_text=rag_remedy_text,
        )
        return JSONResponse(content={"story": story})
    except Exception:
        return JSONResponse(content={"story": req.bullets[0] if req.bullets else ""})
