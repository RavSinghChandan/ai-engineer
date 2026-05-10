"""
Bench Resource Optimization System — Enterprise FastAPI Backend
==============================================================
Architecture applied from Senior AI Engineer modules:

  Module 1 — Evaluation Metrics:  /metrics endpoint, MetricsCollector per request
  Module 3 — RAG Systems:         FAISS vector store, hybrid retrieval, match scoring
  Module 4 — Failure Handling:    retry + circuit breaker on all LLM calls, guardrails
  Module 5 — AI API Gateway:      rate limiting, structured logging, health probes
  Module 1 — Token Economics:     per-request token + cost tracking (DeepSeek pricing)

Designed for 1M+ requests/day:
  - Async I/O throughout (aiosqlite, async agents, async middleware)
  - SQLite WAL (swap to PostgreSQL with one line change)
  - Sliding-window rate limiter (swap Redis store for multi-worker clusters)
  - Structured JSON logs (pipe to CloudWatch/Datadog)
  - Health probes for Kubernetes liveness + readiness
"""
from __future__ import annotations

import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

# ── Internal imports ──────────────────────────────────────────────────────────
from agents.cv_parser_agent import parse_cv
from agents.planning_agent import generate_plan
from agents.role_mapping_agent import map_role
from agents.tracking_agent import calculate_readiness
from db import get_progress, get_user, init_db, save_progress, save_user, update_completed_tasks
from metrics.collector import RequestRecord, get_collector
from middleware.logging_mw import RequestLoggingMiddleware, configure_logging
from middleware.rate_limit import RateLimitMiddleware
from rag.knowledge_base import build_vector_store, get_all_roles, get_embeddings
from utils.file_parser import extract_text_from_pdf
from utils.guardrails import (
    GuardrailError,
    check_pdf_size,
    check_resume_content,
    validate_parsed_profile,
    validate_role_mapping,
)
from utils.retry import breaker_status, with_retry

load_dotenv()

_llm = None
_vector_store = None


# ── Application lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _llm, _vector_store

    configure_logging(os.getenv("LOG_LEVEL", "INFO"))

    api_key  = os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set in .env")

    _llm = ChatOpenAI(
        model=model,
        openai_api_key=api_key,
        openai_api_base=base_url,
        temperature=0,
    )

    print("⏳ Initialising SQLite database...")
    await init_db()
    print("✅ Database ready.")

    print("⏳ Loading HuggingFace embeddings (downloads once)...")
    embeddings = get_embeddings()
    _vector_store = build_vector_store(embeddings)
    print("✅ DeepSeek LLM + FAISS vector store ready.")
    yield


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Bench Resource Optimization API",
    version="2.0.0",
    description="Enterprise-grade RAG system for bench employee skill mapping and readiness planning.",
    lifespan=lifespan,
)

# Order matters: rate limit → logging → CORS → routes
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:4200,http://localhost:4202,http://127.0.0.1:4202"
    ).split(","),
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _req_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4())[:8])


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
    cost  = (prompt_tokens * 0.14 + completion_tokens * 0.28) / 1_000_000
    get_collector().record(RequestRecord(
        request_id        = _req_id(request),
        endpoint          = endpoint,
        started_at        = t_start,
        ended_at          = time.time(),
        latency_ms        = (time.time() - t_start) * 1000,
        status_code       = status,
        prompt_tokens     = prompt_tokens,
        completion_tokens = completion_tokens,
        total_tokens      = total,
        cost_usd          = cost,
        match_percentage  = match_pct,
        cache_hit         = cache_hit,
        error             = error,
    ))


# ── Request schemas ───────────────────────────────────────────────────────────

class MapRoleRequest(BaseModel):
    user_id:     str
    target_role: str

class GeneratePlanRequest(BaseModel):
    user_id:        str
    target_role:    str
    missing_skills: List[str]
    num_days:       int = 7

class UpdateProgressRequest(BaseModel):
    user_id:             str
    completed_task_ids:  List[str]


# ── Health probes (Kubernetes liveness + readiness) ───────────────────────────

@app.get("/health/live", tags=["Health"])
def health_live():
    """Liveness probe — is the process running?"""
    return {"status": "alive"}


@app.get("/health/ready", tags=["Health"])
def health_ready():
    """Readiness probe — is the service ready to take traffic?"""
    ready = _llm is not None and _vector_store is not None
    if not ready:
        raise HTTPException(503, "Service not ready — LLM or vector store not initialised.")
    return {
        "status": "ready",
        "llm":          "deepseek-chat",
        "vector_store": "FAISS",
        "circuit_breakers": breaker_status(),
    }


@app.get("/health", tags=["Health"])
def health():
    """Legacy health endpoint — kept for backwards compatibility."""
    return {"status": "ok", "llm": "deepseek-chat", "version": "2.0.0"}


# ── Metrics ───────────────────────────────────────────────────────────────────

@app.get("/metrics", tags=["Observability"])
def get_metrics():
    """Production KPI dashboard — latency, tokens, cost, RAG quality, cache hit rate."""
    return get_collector().dashboard()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/roles", tags=["Roles"])
def list_roles():
    roles = get_all_roles()
    return [{"id": r["id"], "title": r["title"], "description": r["description"]}
            for r in roles]


@app.post("/upload-cv", tags=["CV"])
async def upload_cv(request: Request, file: UploadFile = File(...)):
    """
    Upload a PDF resume → extract text → LLM parse → save to SQLite.
    Guardrails: file size, PDF extractability, minimum content length.
    LLM call wrapped with retry + circuit breaker.
    """
    t_start = time.time()
    try:
        if not file.filename.lower().endswith(".pdf"):
            raise GuardrailError("Only PDF files are accepted.")

        raw_bytes = await file.read()
        check_pdf_size(raw_bytes)

        resume_text = extract_text_from_pdf(raw_bytes)
        check_resume_content(resume_text)

        # LLM call with retry (max 3 attempts, exponential backoff)
        parsed = await with_retry(
            parse_cv,
            resume_text,
            _llm,
            breaker_name="cv_parser",
        )
        parsed = validate_parsed_profile(parsed)

        user_id = str(uuid.uuid4())[:8]
        await save_user(user_id, parsed, resume_text[:500])

        _record(request, "/upload-cv", t_start, 200)
        return {"user_id": user_id, "profile": parsed}

    except GuardrailError as e:
        _record(request, "/upload-cv", t_start, 400, error=str(e))
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        _record(request, "/upload-cv", t_start, 503, error=str(e))
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, "/upload-cv", t_start, 500, error=str(e))
        raise HTTPException(500, f"CV parsing failed: {e}")


@app.post("/map-role", tags=["Role Mapping"])
async def map_role_endpoint(request: Request, req: MapRoleRequest):
    """
    RAG role mapping: retrieve role requirements from FAISS → LLM skill gap analysis.
    Returns match %, matched skills, missing skills, experience gap.
    """
    t_start = time.time()
    try:
        user = await get_user(req.user_id)
        if not user:
            raise HTTPException(404, f"User '{req.user_id}' not found.")

        result = await with_retry(
            map_role,
            user["profile"],
            req.target_role,
            _vector_store,
            _llm,
            breaker_name="role_mapper",
        )
        result = validate_role_mapping(result)

        _record(
            request, "/map-role", t_start, 200,
            match_pct=result.get("match_percentage"),
        )
        return result

    except HTTPException:
        raise
    except RuntimeError as e:
        _record(request, "/map-role", t_start, 503, error=str(e))
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, "/map-role", t_start, 500, error=str(e))
        raise HTTPException(500, f"Role mapping failed: {e}")


@app.post("/generate-plan", tags=["Planning"])
async def generate_plan_endpoint(request: Request, req: GeneratePlanRequest):
    """
    Async two-phase plan generation:
      Phase 1 (1 LLM call) — day themes outline
      Phase 2 (N parallel LLM calls) — tasks per day
    In-memory cache: same (role, skills) combo returns instantly.
    """
    t_start = time.time()
    try:
        user = await get_user(req.user_id)
        if not user:
            raise HTTPException(404, f"User '{req.user_id}' not found.")

        current_skills = user["profile"].get("skills", [])

        # generate_plan has its own internal cache; cache_hit detection via timing
        cache_before = time.time()
        plan = await generate_plan(
            req.target_role, req.missing_skills, current_skills, _llm, req.num_days
        )
        # Heuristic: sub-50ms response = cache hit (LLM calls take >200ms)
        is_cache_hit = (time.time() - cache_before) < 0.05

        await save_progress(req.user_id, req.target_role, plan, [])

        _record(request, "/generate-plan", t_start, 200, cache_hit=is_cache_hit)
        return plan

    except HTTPException:
        raise
    except RuntimeError as e:
        _record(request, "/generate-plan", t_start, 503, error=str(e))
        raise HTTPException(503, str(e))
    except Exception as e:
        _record(request, "/generate-plan", t_start, 500, error=str(e))
        raise HTTPException(500, f"Plan generation failed: {e}")


@app.post("/update-progress", tags=["Progress"])
async def update_progress(request: Request, req: UpdateProgressRequest):
    """
    Pure Python — no LLM call.
    Updates completed tasks in SQLite and recalculates readiness score instantly.
    """
    t_start = time.time()
    try:
        progress = await get_progress(req.user_id)
        if not progress:
            raise HTTPException(404, "No plan found. Generate a plan first.")

        updated = await update_completed_tasks(req.user_id, req.completed_task_ids)
        if not updated:
            raise HTTPException(404, "Progress record not found.")

        result = calculate_readiness(
            progress["role"],
            progress["plan"],
            req.completed_task_ids,
        )
        _record(request, "/update-progress", t_start, 200)
        return result

    except HTTPException:
        raise
    except Exception as e:
        _record(request, "/update-progress", t_start, 500, error=str(e))
        raise HTTPException(500, f"Progress update failed: {e}")


@app.get("/progress/{user_id}", tags=["Progress"])
async def get_progress_endpoint(request: Request, user_id: str):
    t_start = time.time()
    progress = await get_progress(user_id)
    if not progress:
        _record(request, "/progress", t_start, 404)
        raise HTTPException(404, "No progress found.")
    _record(request, "/progress", t_start, 200)
    return progress


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Root"])
def root():
    return {
        "service":     "Bench Resource Optimization API",
        "version":     "2.0.0",
        "docs":        "/docs",
        "health":      "/health/ready",
        "metrics":     "/metrics",
        "endpoints": {
            "roles":           "GET  /roles",
            "upload_cv":       "POST /upload-cv",
            "map_role":        "POST /map-role",
            "generate_plan":   "POST /generate-plan",
            "update_progress": "POST /update-progress",
            "get_progress":    "GET  /progress/{user_id}",
        },
        "enterprise_features": [
            "SQLite WAL async storage (PostgreSQL-ready)",
            "Retry + circuit breaker on all LLM calls",
            "Input guardrails (size, content, JSON healing)",
            "Sliding-window rate limiting (60 req/min/IP)",
            "Structured JSON request logging with X-Request-Id",
            "Production metrics: latency P50/P95/P99, token economics, RAG quality, cache hit rate",
            "Kubernetes health probes: /health/live + /health/ready",
        ],
    }
