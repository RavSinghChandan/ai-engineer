"""
AstroIntel 360° — FastAPI + LangGraph Backend
Entry point: uvicorn main:app --reload --port 8080
"""
from __future__ import annotations
import os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── Production secret guard ───────────────────────────────────────────────────
_UNSAFE_DEFAULTS = {
    "JWT_SECRET":           "astrointel-jwt-secret-change-in-production",
    "MASTER_API_KEY":       "sk-master-astrointel-change-me",
    "PW_SALT":              "astrointel-pw-salt-change-me",
    "SUPERADMIN_PASSWORD":  "AuraAdmin2024!",
}
_ENV = os.environ.get("APP_ENV", "development").lower()
if _ENV == "production":
    for _var, _default in _UNSAFE_DEFAULTS.items():
        if os.environ.get(_var, _default) == _default:
            sys.exit(
                f"\n[FATAL] {_var} is still set to the default placeholder value.\n"
                f"Set a strong random value before running in production.\n"
                f"Generate: python3 -c \"import secrets; print(secrets.token_hex(32))\"\n"
            )

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import analysis_router, geocode_router, metrics_router
from auth.router import router as auth_router
from leads.router import router as leads_router
from auth.dependencies import require_role, get_tenant_ctx
from auth.models import Role, TenantContext
from auth.rbac import Permission, can
import auth.store as auth_store
import auth.users as users_store
import leads.store as leads_store
import cache as response_cache
from guardrails.production import all_guardrail_stats
import database as _database

# ── Bootstrap database ───────────────────────────────────────────────────────
_database.init_db()           # CREATE TABLE IF NOT EXISTS (idempotent)
_database.migrate_from_json() # one-shot INSERT OR IGNORE from legacy JSON files
auth_store.load()
users_store.load()
leads_store.load()

# ── App factory ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="AstroIntel 360° API",
    description=(
        "Multi-agent LangGraph-orchestrated 360° Astro-Spiritual Intelligence System. "
        "Combines Vedic Astrology, Numerology (3 traditions), Palmistry (3 traditions), "
        "Tarot, Vastu, and Cross-system Meta-analysis with Admin human-in-the-loop approval."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# ALLOWED_ORIGINS env var overrides in production — comma-separated list of origins
_default_origins = [
    "http://localhost:4200",
    "http://localhost:4300",
    "http://localhost:4301",
    "http://127.0.0.1:4200",
    "http://127.0.0.1:4300",
]
_env_origins = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else _default_origins
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth_router)          # /auth/token, /admin/*
app.include_router(leads_router)         # /leads, /admin/leads
app.include_router(analysis_router)      # /api/v1/analysis/* — auth wired per-endpoint
app.include_router(geocode_router)
app.include_router(metrics_router)       # /api/v1/metrics — ADMIN+


# ── Health check (public) ────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "AstroIntel 360° API", "version": "1.0.0"}


# ── Cache management (ADMIN+) ─────────────────────────────────────────────────
@app.get("/cache/stats", tags=["Cache"])
async def cache_stats(ctx: TenantContext = Depends(can(Permission.CACHE__VIEW))):
    return response_cache.stats()

@app.get("/cache/entries", tags=["Cache"])
async def cache_entries(ctx: TenantContext = Depends(can(Permission.CACHE__VIEW))):
    return {"entries": response_cache.entries(), "stats": response_cache.stats()}

@app.delete("/cache/clear", tags=["Cache"])
async def cache_clear(ctx: TenantContext = Depends(can(Permission.CACHE__INVALIDATE))):
    removed = response_cache.clear()
    return {"cleared": removed}

@app.delete("/cache/invalidate/{key}", tags=["Cache"])
async def cache_invalidate(key: str, ctx: TenantContext = Depends(can(Permission.CACHE__INVALIDATE))):
    removed = response_cache.invalidate(key)
    return {"key": key, "removed": removed}


# ── Production Guardrail Stats (ADMIN+) ──────────────────────────────────────
@app.get("/guardrails/stats", tags=["Guardrails"])
async def guardrail_stats(ctx: TenantContext = Depends(can(Permission.GUARDRAILS__VIEW))):
    return all_guardrail_stats()

@app.post("/guardrails/circuit-breaker/reset", tags=["Guardrails"])
async def reset_circuit_breaker(ctx: TenantContext = Depends(can(Permission.GUARDRAILS__RESET_CB))):
    """SUPERADMIN only — reset LLM circuit breaker to CLOSED."""
    from guardrails.production import llm_circuit_breaker
    llm_circuit_breaker.reset()
    return {"status": "reset", "state": llm_circuit_breaker.state}


# ── Root (public) ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {
        "service": "AstroIntel 360° API",
        "version": "1.0.0",
        "docs":    "/docs",
        "health":  "/health",
    }
