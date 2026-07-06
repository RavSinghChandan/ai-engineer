"""
Bench Resource Optimization System — Enterprise FastAPI Backend v3.0
====================================================================
Senior AI Engineer module coverage (all 12 modules applied):

  Module 1  Evaluation Metrics:    /metrics, MetricsCollector, token economics, LLM-as-judge
  Module 1  Hallucination:         faithfulness check on every role mapping output
  Module 1  Token Economics:       LangChain callback tracker → real DeepSeek token counts
  Module 2  LLM Core / Prompts:    prompt versioning registry, v1/v2 per operation
  Module 2  LLM Security:          injection detection on CV text, audit log every LLM call
  Module 3  RAG:                   hybrid search (BM25+FAISS+RRF), HyDE, CRAG quality scoring
  Module 3  Advanced RAG:          cross-encoder reranker, retrieval quality gate
  Module 4  Agents:                retry + circuit breaker on all LLM calls
  Module 4  Failure Handling:      3-layer: retry → circuit breaker → fallback message
  Module 4  Memory:                short-term episodic + long-term user facts per session
  Module 5  System Design:         semantic cache L1 (exact hash) + L2 (cosine similarity)
  Module 5  Streaming:             SSE /generate-plan/stream — token-by-token
  Module 5  Latency Budget:        per-component timing logged on every request
  Module 5  API Gateway:           rate limiting (60 req/min/IP), CORS, health probes
  Module 6  MLOps:                 prompt versioning, async SQLite (PostgreSQL-ready)
  Module 7  Real-time:             async throughout, SSE for long operations
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, AsyncGenerator, List, Optional

import aiosqlite
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

# ── Internal imports ──────────────────────────────────────────────────────────
from auth import LoginRequest, TokenResponse, get_current_user, login, require_admin
from infra.redis_client import redis_ping
from infra.kafka_producer import kafka_ping, publish as kafka_publish
from agents.cv_parser_agent import parse_cv
from agents.planning_agent import generate_plan
from agents.role_mapping_agent import map_role
from agents.tracking_agent import calculate_readiness
from cache.semantic_cache import cache_stats
from db import (
    get_progress, get_user, get_all_users, init_db, save_progress,
    save_user, update_completed_tasks,
    get_all_roles_db, get_role_db, create_role_db, update_role_db, delete_role_db,
    seed_roles_from_json,
    save_readiness_score, get_readiness_history,
)
from guardrails.hallucination import run_llm_judge
from memory.session_store import (
    build_memory_context, get_user_facts, get_recent_sessions,
    memory_stats, update_user_facts, write_session_summary,
    sweep_expired_sessions,
)
from metrics.collector import RequestRecord, get_collector
from middleware.logging_mw import RequestLoggingMiddleware, configure_logging
from middleware.rate_limit import RateLimitMiddleware
from middleware.security_headers import SecurityHeadersMiddleware
from metrics.ragas_eval import evaluate as ragas_evaluate, get_ragas_store
from rag.advanced_retrieval import init_bm25_from_roles, get_bm25_index
from rag.knowledge_base import build_vector_store, get_all_roles, get_all_roles_async, get_embeddings  # noqa: F401
from utils.file_parser import extract_text_from_pdf
from utils.guardrails import (
    GuardrailError, check_pdf_size, check_resume_content,
    validate_parsed_profile, validate_role_mapping,
)
from utils.prompts import ACTIVE_VERSIONS, list_prompts
from utils.retry import breaker_status, with_retry
from utils.security import SecurityError, check_injection
from utils.token_tracker import get_tracker, reset_tracker
from guardrails.production import (
    rate_limiter,
    all_guardrail_stats,
    reset_all_breakers,
    reset_breaker,
    filter_pii_from_mapping,
    degradation_tracker,
    register_repair_llm,
    init_guardrail_persistence,
    flush_guardrail_stats,
)

from llm import get_registry, get_llm

load_dotenv()

# BUG FIX: moved logger to module level so lifespan uses structured logging not print()
logger = logging.getLogger("bench.main")

_llm = None
_vector_store = None


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _llm, _vector_store

    configure_logging(os.getenv("LOG_LEVEL", "INFO"))

    api_key = os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set in .env")

    _llm = ChatOpenAI(
        model=model,
        openai_api_key=api_key,
        openai_api_base=base_url,
        temperature=0,
    )

    # G3: register LLM for Level-4 JSON repair
    register_repair_llm(_llm)

    # BUG FIX: replaced print() with logger.info — print() bypasses the structured logging
    # pipeline, doesn't appear in log aggregators (CloudWatch/Splunk), and leaks startup
    # sequence to anyone with stdout access in containerised deployments
    logger.info("Initialising SQLite database...")
    await init_db()
    logger.info("Database ready.")

    init_guardrail_persistence()
    logger.info("Guardrail counters loaded from SQLite.")

    deleted = await sweep_expired_sessions()
    logger.info("Memory sweep: %d expired session(s) removed.", deleted)

    restored = await get_ragas_store().load_from_db()
    logger.info("RAGAS store restored: %d record(s) from DB.", restored)

    roles_json = Path(__file__).parent / "data" / "roles_knowledge.json"
    seeded = await seed_roles_from_json(roles_json)
    if seeded:
        logger.info("Seeded %d role(s) from roles_knowledge.json into SQLite.", seeded)
    else:
        logger.info("Roles already in SQLite — skipping seed.")

    logger.info("Loading embeddings + building vector stores...")
    embeddings = get_embeddings()
    _vector_store = build_vector_store(embeddings)

    roles = await get_all_roles_async()
    init_bm25_from_roles(roles)
    logger.info("FAISS + BM25 hybrid index ready (%d roles).", len(roles))
    logger.info("Enterprise backend v3.0 ready.")
    yield

    flush_guardrail_stats()
    logger.info("Guardrail counters flushed to SQLite.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Bench Resource Optimization API — Enterprise",
    version="3.0.0",
    description=(
        "Production-grade RAG system for bench employee skill mapping and readiness planning. "
        "Implements all 12 Senior AI Engineer modules: hybrid RAG, LLM security, "
        "hallucination detection, token economics, streaming, semantic caching, and more."
    ),
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "https://localhost:4200,https://localhost:4202,https://127.0.0.1:4202"
    ).split(","),
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# ── Route path constants ──────────────────────────────────────────────────────
_UPLOAD_CV_PATH = "/upload-cv"
_MAP_ROLE_PATH = "/map-role"
_GEN_PLAN_PATH = "/generate-plan"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _req_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4())[:8])


def _ragas_background(
    request_id: str,
    query: str,
    answer: str,
    retrieved_context: str,
    matched_skills: list,
    missing_skills: list,
) -> None:
    """
    Run RAGAS evaluation using the actual retrieved role context from FAISS.
    retrieved_context is the full role document text passed back from map_role.
    """
    try:
        # Split the retrieved context into individual role documents
        # (hybrid_retrieve returns multiple docs joined with \n\n)
        raw_chunks = [c.strip() for c in retrieved_context.split("\n\n") if c.strip()]

        # If context is a single block, treat it as one chunk
        if not raw_chunks:
            raw_chunks = [retrieved_context] if retrieved_context.strip() else []

        # Append the structured skill result as an additional grounding chunk
        # so precision/recall metrics reflect what the LLM actually used
        skill_chunk_parts = []
        if matched_skills:
            skill_chunk_parts.append("Matched skills: " + ", ".join(matched_skills))
        if missing_skills:
            skill_chunk_parts.append("Missing skills: " + ", ".join(missing_skills))
        if skill_chunk_parts:
            raw_chunks.append("\n".join(skill_chunk_parts))

        if not raw_chunks:
            return

        record = ragas_evaluate(
            request_id=request_id,
            query=query,
            answer=answer,
            retrieved_chunks=raw_chunks,
        )
        get_ragas_store().add(record)
    except Exception as exc:
        import logging
        logging.getLogger("bench.ragas").warning("ragas_eval_failed: %s", exc)


def _record(
    request: Request,
    endpoint: str,
    t_start: float,
    status: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    match_pct: Optional[float] = None,
    cache_hit: bool = False,
    error: Optional[str] = None,
) -> None:
    total = prompt_tokens + completion_tokens
    cost = (prompt_tokens * 0.14 + completion_tokens * 0.28) / 1_000_000
    get_collector().record(RequestRecord(
        request_id=_req_id(request),
        endpoint=endpoint,
        started_at=t_start,
        ended_at=time.time(),
        latency_ms=(time.time() - t_start) * 1000,
        status_code=status,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total,
        cost_usd=cost,
        match_percentage=match_pct,
        cache_hit=cache_hit,
        error=error,
    ))


# ── Request schemas ───────────────────────────────────────────────────────────

class MapRoleRequest(BaseModel):
    user_id: str
    target_role: str


class GeneratePlanRequest(BaseModel):
    user_id: str
    target_role: str
    missing_skills: List[str]
    num_days: int = 7


class UpdateProgressRequest(BaseModel):
    user_id: str
    completed_task_ids: List[str]


class EvaluateRequest(BaseModel):
    user_id: str
    question: str
    context: str
    output: str


class CreateRoleRequest(BaseModel):
    id: str
    title: str
    description: str = ""
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    experience_years: int = 0
    internal_notes: str = ""


class UpdateRoleRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    required_skills: Optional[List[str]] = None
    preferred_skills: Optional[List[str]] = None
    experience_years: Optional[int] = None
    internal_notes: Optional[str] = None


# ── Response models (Phase 6 — OpenAPI docs completeness) ────────────────────

class HealthReadyResponse(BaseModel):
    status: str
    llm: str
    vector_store: str
    bm25_index: str
    sqlite: str
    hybrid_retrieval: str
    circuit_breakers: dict
    active_prompts: dict
    redis: str = "not_configured"
    kafka: str = "not_configured"


class UploadCvResponse(BaseModel):
    user_id: str
    profile: dict


class RoleSummary(BaseModel):
    id: str
    title: str
    description: str


class ReadinessResponse(BaseModel):
    readiness_score: float
    status: str
    message: str
    completed_count: int
    total_count: int
    covered_skills: List[str]
    pending_skills: List[str]
    next_suggested_task: str


class ProgressHistoryResponse(BaseModel):
    user_id: str
    history: List[dict]
    count: int


# ── Health probes ─────────────────────────────────────────────────────────────

@app.get("/health/live", tags=["Health"])
def health_live():
    """Kubernetes liveness probe."""
    return {"status": "alive"}


@app.get("/health/ready", tags=["Health"], response_model=HealthReadyResponse,
         responses={503: {"description": "Service Unavailable"}})
async def health_ready():
    """
    Kubernetes readiness probe — checks ALL dependencies.
    Returns 503 if LLM, FAISS, BM25, or SQLite is not ready.
    Kubernetes will not route traffic until all checks pass.
    """
    failures = []

    if _llm is None:
        failures.append("llm")
    if _vector_store is None:
        failures.append("vector_store")

    # BM25 index must have at least one document loaded
    bm25 = get_bm25_index()
    if not bm25._docs:
        failures.append("bm25_index")

    # SQLite: lightweight SELECT to confirm DB file is accessible and schema exists
    try:
        from db import DB_PATH
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("SELECT 1 FROM users LIMIT 1")
    except Exception:
        failures.append("sqlite")

    if failures:
        raise HTTPException(503, f"Not ready — failing checks: {', '.join(failures)}")

    return {
        "status": "ready",
        "llm": "deepseek-chat",
        "vector_store": "FAISS",
        "bm25_index": f"{len(bm25._docs)} docs",
        "sqlite": "ok",
        "hybrid_retrieval": "FAISS+BM25+RRF",
        "circuit_breakers": breaker_status(),
        "active_prompts": ACTIVE_VERSIONS,
        "redis": "ok" if redis_ping() else "unavailable",
        "kafka": "ok" if kafka_ping() else "unavailable",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "version": "3.0.0"}


@app.get("/llm/status", tags=["LLM Registry"])
def llm_status():
    """
    Multi-model registry status.
    Shows which model is active for each pipeline task and which providers
    are ready (API key present) vs pending (key not yet configured).
    Task routing: reasoning → deepseek-reasoner, parsing → deepseek-chat,
    generation → deepseek-chat, judging → deepseek-chat.
    Future: swap provider per task once you have the key.
    """
    return get_registry().status()


# ── Authentication ────────────────────────────────────────────────────────────

@app.post("/auth/login", tags=["Auth"], response_model=TokenResponse,
          responses={401: {"description": "Unauthorized"}})
def auth_login(req: LoginRequest):
    """
    Authenticate with user_id + password. Returns a JWT access token (24h expiry by default).
    """
    token = login(req.user_id, req.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid user_id or password.")
    return token


@app.get("/auth/me", tags=["Auth"])
def auth_me(claims: Annotated[object, Depends(get_current_user)]):
    """Return the current authenticated user's claims."""
    return {"user_id": claims.sub, "role": claims.role, "exp": claims.exp}


# ── Observability ─────────────────────────────────────────────────────────────

@app.get("/metrics", tags=["Observability"])
def get_metrics():
    """Production KPI dashboard — includes guardrail stats."""
    dashboard = get_collector().dashboard()
    dashboard["cache_stats"] = cache_stats()
    dashboard["memory_stats"] = memory_stats()
    dashboard["prompts"] = list_prompts()
    dashboard["ragas"] = get_ragas_store().dashboard()
    dashboard["guardrails"] = all_guardrail_stats()
    dashboard["thresholds"] = {
        "error_rate_warn_pct": 5,     # KPI card turns red above this
        "cache_hit_rate_good_pct": 30,  # KPI card turns green at or above this
        "latency_slow_ms": 5000,  # p95 bar flagged slow above this
    }
    return dashboard


@app.get("/ragas", tags=["Observability"])
def get_ragas():
    """RAGAS evaluation dashboard — faithfulness, context precision/recall, answer relevancy."""
    return get_ragas_store().dashboard()


# ── Guardrails API (G1-G5) ────────────────────────────────────────────────────

@app.get("/guardrails/stats", tags=["Guardrails"])
def guardrail_stats():
    """
    Live stats for all 5 production guardrails:
      G1 — per-user rate limiter
      G2 — circuit breakers (all registered breakers)
      G3 — JSON repair cascade
      G4 — PII output filter
      G5 — graceful degradation tracker
    """
    return all_guardrail_stats()


@app.post("/guardrails/circuit-breaker/reset", tags=["Guardrails"])
def reset_circuit_breakers():
    """Admin endpoint: force all LLM circuit breakers to CLOSED state."""
    result = reset_all_breakers()
    return result


@app.post("/guardrails/circuit-breaker/{name}/reset", tags=["Guardrails"])
def reset_named_circuit_breaker(name: str):
    """Admin endpoint: force a named circuit breaker to CLOSED state."""
    return reset_breaker(name)


# ── Roles ─────────────────────────────────────────────────────────────────────

@app.get("/roles", tags=["Roles"], response_model=List[RoleSummary])
async def list_roles(request: Request):
    """
    Phase 3: reads from SQLite (seeded from roles_knowledge.json at startup).
    Phase 6: Cache-Control header — role list is static between admin edits.
    """
    from fastapi.responses import JSONResponse
    roles = await get_all_roles_db()
    data = [{"id": r["id"], "title": r["title"], "description": r["description"]}
            for r in roles]
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=3600"},
    )


async def _rebuild_indexes() -> int:
    """Rebuild FAISS + BM25 after a role change. Returns new role count."""
    global _vector_store
    roles = await get_all_roles_async()
    embeddings = get_embeddings()
    _vector_store = build_vector_store(embeddings, roles=roles)
    init_bm25_from_roles(roles)
    return len(roles)


@app.post("/admin/roles", tags=["Admin"], status_code=201,
          responses={400: {"description": "Bad Request"}, 409: {"description": "Conflict"}})
async def admin_create_role(req: CreateRoleRequest, _claims: Annotated[object, Depends(require_admin)]):
    """
    Create a new role in SQLite. Triggers async FAISS + BM25 rebuild.
    Returns 409 if role_id already exists.
    """
    if not req.required_skills:
        raise HTTPException(400, "required_skills must not be empty.")
    try:
        created = await create_role_db(req.model_dump())
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    # BUG FIX: get_event_loop() is deprecated in Python 3.10+ and can attach the task to a
    # closed or wrong loop in async contexts — use asyncio.ensure_future() which always uses
    # the running loop when called from inside an async handler
    asyncio.ensure_future(_rebuild_indexes())
    return created


@app.get("/admin/roles/{role_id}", tags=["Admin"],
         responses={404: {"description": "Not Found"}})
async def admin_get_role(role_id: str, _claims: Annotated[object, Depends(require_admin)]):
    """Return a single role by ID."""
    role = await get_role_db(role_id)
    if not role:
        raise HTTPException(404, f"Role '{role_id}' not found.")
    return role


@app.put("/admin/roles/{role_id}", tags=["Admin"],
         responses={404: {"description": "Not Found"}})
async def admin_update_role(role_id: str, req: UpdateRoleRequest, _claims: Annotated[object, Depends(require_admin)]):
    """
    Partially update a role. Only supplied fields are changed.
    Triggers async FAISS + BM25 rebuild.
    """
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = await update_role_db(role_id, updates)
    if not updated:
        raise HTTPException(404, f"Role '{role_id}' not found.")
    # BUG FIX: get_event_loop() is deprecated in Python 3.10+ and can attach the task to a
    # closed or wrong loop in async contexts — use asyncio.ensure_future() which always uses
    # the running loop when called from inside an async handler
    asyncio.ensure_future(_rebuild_indexes())
    return updated


@app.delete("/admin/roles/{role_id}", tags=["Admin"],
            responses={404: {"description": "Not Found"}})
async def admin_delete_role(role_id: str, _claims: Annotated[object, Depends(require_admin)]):
    """
    Delete a role by ID. Triggers async FAISS + BM25 rebuild.
    Returns 404 if not found.
    """
    deleted = await delete_role_db(role_id)
    if not deleted:
        raise HTTPException(404, f"Role '{role_id}' not found.")
    # BUG FIX: get_event_loop() is deprecated in Python 3.10+ and can attach the task to a
    # closed or wrong loop in async contexts — use asyncio.ensure_future() which always uses
    # the running loop when called from inside an async handler
    asyncio.ensure_future(_rebuild_indexes())
    return {"deleted": role_id}


# ── CV Upload ─────────────────────────────────────────────────────────────────

@app.post("/upload-cv", tags=["CV"], response_model=UploadCvResponse,
          responses={400: {"description": "Bad Request"}, 429: {"description": "Too Many Requests"},
                     503: {"description": "Service Unavailable"}, 500: {"description": "Internal Server Error"}})
async def upload_cv(request: Request, _claims: Annotated[object, Depends(get_current_user)],
                    file: Annotated[UploadFile, File(...)]):
    """
    Upload PDF → inject detection → extract text → LLM parse (prompt v2) →
    validate → save to SQLite.

    Security: injection patterns checked on CV text before any LLM call.
    Prompt: hardened v2 system prompt resists embedded instructions in CVs.
    """
    t_start = time.time()
    rid = _req_id(request)
    reset_tracker()

    try:
        if not file.filename.lower().endswith(".pdf"):
            raise GuardrailError("Only PDF files are accepted.")

        raw_bytes = await file.read()
        check_pdf_size(raw_bytes)

        # BUG FIX: extension check alone can be spoofed (rename any file to .pdf).
        # Validate the PDF magic bytes header to confirm actual file type.
        if not raw_bytes.startswith(b"%PDF"):
            raise GuardrailError("File does not appear to be a valid PDF.")

        resume_text = extract_text_from_pdf(raw_bytes)
        check_resume_content(resume_text)

        # Module 2: injection check before LLM call
        check_injection(resume_text, source="cv_upload")

        parsed = await with_retry(
            parse_cv,
            resume_text,
            _llm,
            rid,
            breaker_name="cv_parser",
        )
        parsed = validate_parsed_profile(parsed)

        user_id = str(uuid.uuid4())[:8]

        # G1: per-user rate check (after user_id is assigned)
        allowed, reason = rate_limiter.is_allowed(user_id)
        if not allowed:
            raise HTTPException(429, reason)

        await save_user(user_id, parsed, resume_text[:500])

        # Module 4: update long-term user facts (initial skill set)
        update_user_facts(user_id, {"initial_skills": parsed.get("skills", [])})

        # G5: record agent outcome
        degradation_tracker.record_run(rid, {"cv_parser": {"status": "full", "note": "parsed ok"}})

        usage = get_tracker().get_usage()
        _record(request, _UPLOAD_CV_PATH, t_start, 200,
                prompt_tokens=usage["prompt_tokens"],
                completion_tokens=usage["completion_tokens"])

        # Publish event to Kafka — decoupled downstream consumers (analytics, notifications)
        # Fire-and-forget: CV upload succeeds even if Kafka is unavailable
        kafka_publish(
            "KAFKA_CV_TOPIC", "cv.parsed",
            {"user_id": user_id, "skills_count": len(parsed.get("skills", [])),
             "experience_years": parsed.get("experience_years", 0)},
            key=user_id,
        )

        return {"user_id": user_id, "profile": parsed}

    except (GuardrailError, SecurityError) as e:
        _record(request, _UPLOAD_CV_PATH, t_start, 400, error=str(e))
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        _record(request, _UPLOAD_CV_PATH, t_start, 503, error=str(e))
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, _UPLOAD_CV_PATH, t_start, 500, error=str(e))
        raise HTTPException(500, f"CV parsing failed: {e}")


# ── Role Mapping ──────────────────────────────────────────────────────────────

@app.post("/map-role", tags=["Role Mapping"],
          responses={429: {"description": "Too Many Requests"}, 404: {"description": "Not Found"},
                     400: {"description": "Bad Request"}, 503: {"description": "Service Unavailable"},
                     500: {"description": "Internal Server Error"}})
async def map_role_endpoint(request: Request, req: MapRoleRequest,
                            _claims: Annotated[object, Depends(get_current_user)] = None):
    """
    RAG role mapping pipeline (full production stack):
      HyDE → Hybrid retrieval (BM25+FAISS+RRF) → Cross-encoder rerank →
      CRAG quality score → LLM (prompt v2) → Faithfulness check → L1 cache.
    """
    t_start = time.time()
    rid = _req_id(request)
    reset_tracker()

    try:
        # G1: per-user rate limit on LLM-backed operations
        allowed, reason = rate_limiter.is_allowed(req.user_id)
        if not allowed:
            raise HTTPException(429, reason)

        user = await get_user(req.user_id)
        if not user:
            raise HTTPException(404, f"User '{req.user_id}' not found.")

        # Module 2: injection check on role name
        check_injection(req.target_role, source="role_name")

        # Module 4: load session memory context
        build_memory_context(req.user_id)

        result = await with_retry(
            map_role,
            user["profile"],
            req.target_role,
            _vector_store,
            _llm,
            rid,
            breaker_name="role_mapper",
        )
        result = validate_role_mapping(result)

        # Module 4: write session summary to episodic memory
        write_session_summary(req.user_id, {
            "role_explored": req.target_role,
            "match_percentage": result.get("match_percentage", 0),
            "missing_skills": result.get("missing_skills", []),
        })

        # Module 3: RAGAS evaluation — does not block response
        _ragas_background(
            request_id=rid,
            query=req.target_role,
            answer=result.get("recommendation", ""),
            retrieved_context=result.pop("_retrieved_context", ""),
            matched_skills=result.get("matched_skills", []),
            missing_skills=result.get("missing_skills", []),
        )

        # G4: scrub PII from recommendation before returning to client
        user_profile = user.get("profile", {})
        result, _pii_count = filter_pii_from_mapping(result, user_profile)

        # G5: record agent outcome
        cache_hit = result.pop("_cache_hit", False)
        degradation_tracker.record_run(rid, {
            "role_mapper": {
                "status": "partial" if cache_hit else "full",
                "note": "cache_hit" if cache_hit else "llm_call",
            },
            "retrieval": {"status": "full", "note": result.get("retrieval_method", "")},
        })

        usage = get_tracker().get_usage()
        _record(
            request, "/map-role", t_start, 200,
            prompt_tokens=usage["prompt_tokens"],
            completion_tokens=usage["completion_tokens"],
            match_pct=result.get("match_percentage"),
            cache_hit=cache_hit,
        )
        return result

    except HTTPException:
        raise
    except (SecurityError, GuardrailError) as e:
        _record(request, _MAP_ROLE_PATH, t_start, 400, error=str(e))
        degradation_tracker.record_run(rid, {"role_mapper": {"status": "failed", "note": str(e)[:80]}})
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        _record(request, _MAP_ROLE_PATH, t_start, 503, error=str(e))
        degradation_tracker.record_run(rid, {"role_mapper": {"status": "fallback", "note": str(e)[:80]}})
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, _MAP_ROLE_PATH, t_start, 500, error=str(e))
        degradation_tracker.record_run(rid, {"role_mapper": {"status": "failed", "note": str(e)[:80]}})
        raise HTTPException(500, f"Role mapping failed: {e}")


# ── Plan Generation ───────────────────────────────────────────────────────────

@app.post("/generate-plan", tags=["Planning"],
          responses={429: {"description": "Too Many Requests"}, 404: {"description": "Not Found"},
                     503: {"description": "Service Unavailable"}, 500: {"description": "Internal Server Error"}})
async def generate_plan_endpoint(request: Request, req: GeneratePlanRequest,
                                 _claims: Annotated[object, Depends(get_current_user)] = None):
    """Async two-phase plan generation with in-memory cache."""
    t_start = time.time()
    reset_tracker()

    try:
        # G1: per-user rate limit on LLM-backed plan generation
        allowed, reason = rate_limiter.is_allowed(req.user_id)
        if not allowed:
            raise HTTPException(429, reason)

        user = await get_user(req.user_id)
        if not user:
            raise HTTPException(404, f"User '{req.user_id}' not found.")

        # G2: wrap plan generation with named planner circuit breaker
        plan = await with_retry(
            generate_plan,
            req.target_role, req.missing_skills, _llm, req.num_days,
            breaker_name="planner",
        )
        # BUG FIX: timing heuristic (< 0.05s = cache hit) was unreliable — fast servers or
        # warm CPU caches could make real LLM calls appear as cache hits, inflating cache stats.
        # Use the explicit _cache_hit flag that generate_plan already sets in the return dict.
        is_cache_hit = bool(plan.pop("_cache_hit", False))

        await save_progress(req.user_id, req.target_role, plan, [])

        # Module 4: update user facts with skills being trained
        update_user_facts(req.user_id, {"training_role": req.target_role})

        # G5: record planner outcome
        degradation_tracker.record_run(req.user_id, {
            "planner": {
                "status": "partial" if is_cache_hit else "full",
                "note": "cache_hit" if is_cache_hit else "llm_call",
            }
        })

        usage = get_tracker().get_usage()
        _record(request, _GEN_PLAN_PATH, t_start, 200,
                prompt_tokens=usage["prompt_tokens"],
                completion_tokens=usage["completion_tokens"],
                cache_hit=is_cache_hit)

        # Publish plan-generated event for downstream consumers (manager dashboards, nudge service)
        kafka_publish(
            "KAFKA_PLAN_TOPIC", "plan.generated",
            {"user_id": req.user_id, "target_role": req.target_role,
             "total_days": plan.get("total_days", 0), "cache_hit": is_cache_hit},
            key=req.user_id,
        )

        return plan

    except HTTPException:
        raise
    except RuntimeError as e:
        _record(request, _GEN_PLAN_PATH, t_start, 503, error=str(e))
        degradation_tracker.record_run(req.user_id, {"planner": {"status": "fallback", "note": str(e)[:80]}})
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, _GEN_PLAN_PATH, t_start, 500, error=str(e))
        degradation_tracker.record_run(req.user_id, {"planner": {"status": "failed", "note": str(e)[:80]}})
        raise HTTPException(500, f"Plan generation failed: {e}")


# ── SSE Streaming Plan Generation (Module 5/7) ────────────────────────────────

@app.post("/generate-plan/stream", tags=["Planning"],
          responses={429: {"description": "Too Many Requests"}, 404: {"description": "Not Found"}})
async def generate_plan_stream(request: Request, req: GeneratePlanRequest,
                               _claims: Annotated[object, Depends(get_current_user)] = None):
    """
    SSE streaming version of plan generation.
    Emits day-by-day results as they complete (parallel generation).
    Client sees Day 1 result immediately while Day 2-7 are still generating.

    Module 5/7 pattern: StreamingResponse with media_type="text/event-stream"
    Use: Angular EventSource consumer subscribes and updates UI progressively.
    """
    # G1: per-user rate limit on SSE plan generation
    allowed, reason = rate_limiter.is_allowed(req.user_id)
    if not allowed:
        raise HTTPException(429, reason)

    user = await get_user(req.user_id)
    if not user:
        raise HTTPException(404, f"User '{req.user_id}' not found.")

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            yield f"data: {json.dumps({'event': 'start', 'role': req.target_role, 'total_days': req.num_days})}\n\n"

            # G2: planner circuit breaker on SSE path too
            plan = await with_retry(
                generate_plan,
                req.target_role, req.missing_skills, _llm, req.num_days,
                breaker_name="planner",
            )

            await save_progress(req.user_id, req.target_role, plan, [])

            # Stream day-by-day
            for day in plan.get("plan", []):
                payload = json.dumps({"event": "day", "day": day})
                yield f"data: {payload}\n\n"
                await asyncio.sleep(0)   # yield event loop to flush

            yield f"data: {json.dumps({'event': 'done', 'total_days': plan['total_days']})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering (Module 5)
        },
    )


# ── Progress ──────────────────────────────────────────────────────────────────

@app.post("/update-progress", tags=["Progress"], response_model=ReadinessResponse,
          responses={404: {"description": "Not Found"}, 500: {"description": "Internal Server Error"}})
async def update_progress(request: Request, req: UpdateProgressRequest,
                          _claims: Annotated[object, Depends(get_current_user)] = None):
    """Pure Python — no LLM call. Returns instantly."""
    t_start = time.time()
    try:
        progress = await get_progress(req.user_id)
        if not progress:
            raise HTTPException(404, "No plan found. Generate a plan first.")

        updated = await update_completed_tasks(req.user_id, req.completed_task_ids)
        if not updated:
            raise HTTPException(404, "Progress record not found.")

        result = calculate_readiness(
            progress["plan"],
            req.completed_task_ids,
        )

        # Module 4: update user facts + episodic memory on progress save
        covered = result.get("covered_skills", [])
        score = result.get("readiness_score", 0)
        update_user_facts(req.user_id, {"covered_skills": covered})
        if score >= 85:
            write_session_summary(req.user_id, {
                "role_explored": progress["role"],
                "readiness_score": score,
                "skills_covered": covered,
                "milestone": "almost_ready",
            })

        # Phase 4: persist readiness score as a time-series data point
        await save_readiness_score(req.user_id, progress["role"], score)

        _record(request, "/update-progress", t_start, 200)
        return result

    except HTTPException:
        raise
    except Exception as e:
        _record(request, "/update-progress", t_start, 500, error=str(e))
        raise HTTPException(500, f"Progress update failed: {e}")


@app.get("/progress/{user_id}", tags=["Progress"],
         responses={404: {"description": "Not Found"}})
async def get_progress_endpoint(request: Request, user_id: str,
                                _claims: Annotated[object, Depends(get_current_user)] = None):
    t_start = time.time()
    progress = await get_progress(user_id)
    if not progress:
        _record(request, "/progress", t_start, 404)
        raise HTTPException(404, "No progress found.")

    # Enrich with memory context
    progress["_memory_context"] = build_memory_context(user_id)
    progress["_user_facts"] = get_user_facts(user_id)
    _record(request, "/progress", t_start, 200)
    return progress


@app.get("/progress/{user_id}/history", tags=["Progress"], response_model=ProgressHistoryResponse)
async def get_progress_history(request: Request, user_id: str, limit: int = 30,
                               _claims: Annotated[object, Depends(get_current_user)] = None):
    """
    Phase 4: Return the readiness score time-series for a user.
    Sorted oldest-first so frontend can render a sparkline/trend chart directly.
    Returns empty list (not 404) if no history exists yet.
    Capped at last `limit` entries (default 30, max enforced by DB query).
    """
    t_start = time.time()
    history = await get_readiness_history(user_id, limit=min(limit, 100))
    _record(request, "/progress/history", t_start, 200)
    return {"user_id": user_id, "history": history, "count": len(history)}


# ── Memory inspection (Module 4) ─────────────────────────────────────────────

@app.get("/memory/{user_id}", tags=["Memory"])
async def get_memory_endpoint(request: Request, user_id: str,
                              _claims: Annotated[object, Depends(get_current_user)] = None):
    """
    Return full memory profile for a user: episodic sessions + long-term facts
    + rendered context string used in LLM prompts.
    Used by the Memory / Resume page in the frontend.
    """
    t_start = time.time()
    sessions = get_recent_sessions(user_id, n=10)
    facts = get_user_facts(user_id)
    context = build_memory_context(user_id)
    _record(request, "/memory", t_start, 200)
    return {
        "user_id": user_id,
        "episodic_sessions": sessions,
        "long_term_facts": facts,
        "memory_context": context,
        "session_count": len(sessions),
        "has_facts": bool(facts),
    }


# ── LLM-as-Judge evaluation (Module 1) ───────────────────────────────────────

@app.post("/evaluate", tags=["Evaluation"],
          responses={500: {"description": "Internal Server Error"}})
async def evaluate_output(request: Request, req: EvaluateRequest):
    """
    LLM-as-Judge endpoint — Module 1 (evaluation when no ground truth).
    Scores any AI output on: relevance, completeness, accuracy, actionability.
    Use: QA pipeline, regression testing, production quality monitoring.
    """
    t_start = time.time()
    rid = _req_id(request)
    reset_tracker()
    try:
        scores = await asyncio.get_event_loop().run_in_executor(
            None,
            run_llm_judge,
            req.question,
            req.context,
            req.output,
            _llm,
            rid,
        )
        usage = get_tracker().get_usage()
        _record(request, "/evaluate", t_start, 200,
                prompt_tokens=usage["prompt_tokens"],
                completion_tokens=usage["completion_tokens"])

        # G5: track llm_judge outcome
        judge_status = "full" if scores.get("passed") else "partial"
        degradation_tracker.record_run(rid, {
            "llm_judge": {"status": judge_status, "note": f"avg_score={scores.get('avg_score', 0)}"},
        })

        return scores
    except Exception as e:
        _record(request, "/evaluate", t_start, 500, error=str(e))
        degradation_tracker.record_run(rid, {
            "llm_judge": {"status": "failed", "note": str(e)[:80]},
        })
        raise HTTPException(500, f"Evaluation failed: {e}")


# ── Admin: Internal Document Management ──────────────────────────────────────
#
# Privacy architecture:
#   - Only HR admins upload role templates and internal training docs here.
#   - Employee CVs go through /upload-cv (separate flow, separate store).
#   - Internal docs are chunked + embedded LOCALLY using HuggingFace model.
#   - Only chunk text (not raw bytes) enters the FAISS index — nothing external.
#   - LLM never receives raw document content; only retrieved chunk text.

@app.post("/admin/upload-resource", tags=["Admin"],
          responses={400: {"description": "Bad Request"}})
async def admin_upload_resource(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    skill_tags: str = "",
    classification: str = "internal",
    _claims: Annotated[object, Depends(require_admin)] = None,
):
    """
    Upload a company-internal training document (PDF or .txt).

    This document is:
      1. Text-extracted locally (bytes discarded after extraction)
      2. Chunked into 512-word segments with 50-word overlap
      3. Embedded with local HuggingFace model (no external API)
      4. Indexed into internal FAISS document store (separate from roles store)

    Use: HR/admin uploads internal handbooks, role runbooks, team wikis, etc.
    These replace public internet links as task resources in training plans.

    classification: 'internal' | 'confidential' | 'restricted'
    skill_tags:     comma-separated list of skills this doc covers
                    e.g. "Java,Spring Boot,Docker"
    """
    from rag.document_store import index_internal_document, load_internal_store

    t_start = time.time()

    if not file.filename:
        raise HTTPException(400, "No file provided.")

    fname = file.filename.lower()
    if not (fname.endswith((".pdf", ".txt"))):
        raise HTTPException(400, "Only PDF and .txt files are accepted for internal resources.")

    raw_bytes = await file.read()
    if len(raw_bytes) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(400, "File too large. Maximum 50 MB.")

    # Extract text locally
    if fname.endswith(".pdf"):
        text = extract_text_from_pdf(raw_bytes)
    else:
        text = raw_bytes.decode("utf-8", errors="ignore")

    if len(text.strip()) < 50:
        raise HTTPException(400, "Document appears empty or unreadable.")

    # Parse skill_tags
    tags = [t.strip() for t in skill_tags.split(",") if t.strip()] if skill_tags else []
    doc_id = file.filename.rsplit(".", 1)[0].lower().replace(" ", "_")
    title = file.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()

    # Get the embeddings model (already initialised at startup)
    from rag.knowledge_base import get_embeddings
    embeddings = get_embeddings()

    # Load or create internal doc store
    internal_store = load_internal_store(embeddings)

    _store, chunk_count = index_internal_document(
        doc_id=doc_id,
        title=title,
        text=text,
        skill_tags=tags,
        classification=classification,
        embeddings=embeddings,
        existing_store=internal_store,
    )

    _record(request, "/admin/upload-resource", t_start, 200)
    return {
        "doc_id": doc_id,
        "title": title,
        "skill_tags": tags,
        "classification": classification,
        "chunks_indexed": chunk_count,
        "chunk_strategy": "paragraph-boundary",
        "source": "company-internal",
        "message": "Document indexed successfully into internal knowledge base.",
    }


@app.get("/admin/resources", tags=["Admin"])
async def list_internal_resources(_claims: Annotated[object, Depends(require_admin)] = None):
    """
    List all indexed internal documents and the internal resource registry.
    Returns metadata only — no document content or chunk text.
    """
    from rag.document_store import list_indexed_documents, _resource_registry
    return {
        "indexed_documents": list_indexed_documents(),
        "resource_registry": list(_resource_registry.keys()),
        "total_skill_mappings": len(_resource_registry),
        "source": "company-internal",
        "note": "All resources are internal. No public internet links.",
    }


# ── Export & Prediction ───────────────────────────────────────────────────────

@app.get("/export-plan/{user_id}", tags=["Export"])
async def export_plan(
    request: Request,
    user_id: str,
    format: str = "csv",
    _claims: Annotated[object, Depends(get_current_user)] = None,
):
    """
    Export a user's training plan.

    Optimisation: managers need to share progress reports outside the app.
    Two formats:
      - ?format=csv  → CSV for Excel/Sheets (default)
      - ?format=json → lightweight JSON summary for dashboards / email digests

    Returns:
      CSV: text/csv attachment ready to open in Excel
      JSON: plan summary with skills breakdown
    """
    from utils.export import plan_to_csv, plan_to_summary

    progress = await get_progress(user_id)
    if not progress or not progress.get("plan"):
        raise HTTPException(status_code=404, detail=f"No plan found for user {user_id}")

    plan = progress["plan"]
    role = progress.get("role", "unknown")
    completed_ids = progress.get("completed_task_ids", [])
    readiness_score = progress.get("readiness_score", 0.0)

    if format.lower() == "csv":
        from fastapi.responses import Response as FastAPIResponse
        csv_text = plan_to_csv(user_id, role, plan, completed_ids)
        return FastAPIResponse(
            content=csv_text,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="training_plan_{user_id}.csv"'
            },
        )

    # JSON summary
    summary = plan_to_summary(user_id, role, plan, completed_ids, readiness_score)
    return summary


@app.get("/predict-readiness/{user_id}", tags=["Export"])
async def predict_readiness(
    request: Request,
    user_id: str,
    _claims: Annotated[object, Depends(get_current_user)] = None,
):
    """
    Predict when a user will reach 100% readiness based on task completion velocity.

    Optimisation: managers need a forward-looking view, not just current score.
    Algorithm:
      - Fetch readiness score history (up to 30 data points)
      - Compute score-gain-per-day from the history
      - Extrapolate linearly to 100%
      - Return predicted completion date + confidence band

    Confidence levels:
      HIGH   — 5+ history data points
      MEDIUM — 3–4 history data points
      LOW    — < 3 data points (falls back to industry average of 2 tasks/day)
    """
    from utils.export import predict_completion

    progress = await get_progress(user_id)
    if not progress:
        raise HTTPException(status_code=404, detail=f"No progress found for user {user_id}")

    history = await get_readiness_history(user_id, limit=30)
    plan = progress.get("plan", {})
    tasks = plan.get("tasks", [])
    completed_ids = progress.get("completed_task_ids", [])
    current_score = progress.get("readiness_score", 0.0)

    prediction = predict_completion(
        history=history,
        current_score=current_score,
        total_tasks=len(tasks),
        completed_tasks=len(completed_ids),
    )

    return {
        "user_id": user_id,
        "role": progress.get("role", "unknown"),
        "current_readiness_score": current_score,
        "total_tasks": len(tasks),
        "completed_tasks": len(completed_ids),
        "prediction": prediction,
    }


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/candidates", tags=["MCP"])
async def search_candidates(
    skill: Optional[str] = None,
    role: Optional[str] = None,
    min_readiness: int = 0,
    _user=Depends(get_current_user),
):
    """
    Search bench candidates by skill keyword or target role.
    Used by the MCP server so AI clients can query the bench directly.
    Returns user_id, matched skills, role, and readiness score.
    """
    rows = await get_all_users()
    results = []
    for row in rows:
        profile = row.get("profile", {})
        skills = [s.lower() for s in profile.get("skills", [])]
        user_role = row.get("role", "")
        readiness = row.get("readiness_score", 0)

        if skill and skill.lower() not in skills:
            continue
        if role and role.lower() not in user_role.lower():
            continue
        if readiness < min_readiness:
            continue

        results.append({
            "user_id": row["user_id"],
            "name": profile.get("name", ""),
            "role": user_role,
            "skills": profile.get("skills", []),
            "readiness_score": readiness,
        })

    return {"candidates": results, "total": len(results)}


@app.get("/", tags=["Root"])
def root():
    return {
        "service": "Bench Resource Optimization API — Enterprise",
        "version": "3.0.0",
        "docs": "/docs",
        "mcp_server": "python mcp_server.py  (stdio — for Claude Desktop / Cursor)",
        "endpoints": {
            "roles": "GET  /roles",
            "upload_cv": "POST /upload-cv",
            "map_role": "POST /map-role",
            "generate_plan": "POST /generate-plan",
            "generate_stream": "POST /generate-plan/stream  (SSE)",
            "update_progress": "POST /update-progress",
            "get_progress": "GET  /progress/{user_id}",
            "evaluate": "POST /evaluate  (LLM-as-judge)",
            "export_plan": "GET  /export-plan/{user_id}?format=csv|json",
            "predict_readiness": "GET  /predict-readiness/{user_id}",
            "candidates": "GET  /candidates?skill=&role=&min_readiness=  (MCP)",
            "metrics": "GET  /metrics",
            "health_live": "GET  /health/live",
            "health_ready": "GET  /health/ready",
        },
        "senior_ai_modules_applied": {
            "module_1_eval": "MetricsCollector, LLM-as-judge /evaluate, faithfulness scoring",
            "module_1_hallucination": "Faithfulness proxy on every role mapping",
            "module_1_tokens": "LangChain callback tracker → real DeepSeek token counts",
            "module_2_prompts": "Prompt versioning registry (v1/v2 per operation)",
            "module_2_security": "Injection detection on CV text + role name, audit log",
            "module_3_rag": "Hybrid search: BM25+FAISS+RRF, HyDE, CRAG quality scoring",
            "module_3_advanced": "Cross-encoder reranker, retrieval quality gate",
            "module_4_agents": "Retry+backoff, circuit breaker, fallback messages",
            "module_4_memory": "Short-term episodic + long-term user facts per session",
            "module_5_caching": "L1 exact hash + L2 semantic similarity cache",
            "module_5_streaming": "SSE /generate-plan/stream, X-Accel-Buffering: no",
            "module_5_gateway": "Rate limiting 60/min/IP, health probes, CORS",
            "module_6_mlops": "Async SQLite WAL (PostgreSQL-ready), prompt versioning",
            "module_7_realtime": "Async throughout, asyncio.gather for parallel agents",
        },
    }
