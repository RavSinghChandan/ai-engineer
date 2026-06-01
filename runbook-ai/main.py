from __future__ import annotations
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.db import init_db
from routers.ingest_router import router as ingest_router
from routers.runbooks_router import router as runbooks_router
from routers.graph_router import router as graph_router
from routers.query_router import router as query_router
from routers.multi_runbook_router import router as multi_router
from routers.auth_router import router as auth_router
from routers.tenant_router import router as tenant_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

# CORS — restrict to known origins in production.
# Set ALLOWED_ORIGINS=https://app.example.com,https://www.example.com in .env
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["http://localhost:4200", "http://localhost:4201"]  # safe dev default
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("RunbookAI started — CORS origins: %s", ALLOWED_ORIGINS)
    yield


app = FastAPI(
    title="RunbookAI",
    description=(
        "Enterprise IT Runbook & Incident Response Assistant. "
        "RAGless — structured extraction + dependency graph reasoning. "
        "Zero vectors. Zero hallucinated commands."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)

app.include_router(auth_router)
app.include_router(tenant_router)
app.include_router(ingest_router)
app.include_router(runbooks_router)
app.include_router(graph_router)
app.include_router(query_router)
app.include_router(multi_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RunbookAI",
        "version": "1.0.0",
        "phase": 6,
        "description": "PDF ingestion + structured extraction + dependency graph + incident query + multi-runbook reasoning + JWT auth + multi-tenant RBAC",
    }
