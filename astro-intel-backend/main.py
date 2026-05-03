"""
AstroIntel 360° — FastAPI + LangGraph Backend
Entry point: uvicorn main:app --reload --port 8080
"""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import analysis_router, geocode_router
import cache as response_cache

# ── App factory ─────────────────────────────────────────────────────────────
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

# ── CORS — allow Angular dev server ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://localhost:4300",
        "http://localhost:4301",
        "http://127.0.0.1:4200",
        "http://127.0.0.1:4300",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(analysis_router)
app.include_router(geocode_router)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "AstroIntel 360° API", "version": "1.0.0"}


# ── Cache management ──────────────────────────────────────────────────────────
@app.get("/cache/stats", tags=["Cache"])
async def cache_stats():
    return response_cache.stats()

@app.delete("/cache/clear", tags=["Cache"])
async def cache_clear():
    removed = response_cache.clear()
    return {"cleared": removed}


# ── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {
        "service": "AstroIntel 360° Multi-Agent API",
        "version": "1.0.0",
        "docs":    "/docs",
        "endpoints": {
            "run_analysis":      "POST /api/v1/analysis/run",
            "approve_report":    "POST /api/v1/analysis/approve",
            "get_session":       "GET  /api/v1/analysis/session/{session_id}",
            "get_memory":        "GET  /api/v1/analysis/memory/{session_id}",
            "geocode":           "GET  /api/v1/geocode?city=Chandigarh",
            "health":            "GET  /health",
        },
    }
