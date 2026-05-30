from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.db import init_db
from routers.ingest_router import router as ingest_router
from routers.runbooks_router import router as runbooks_router
from routers.graph_router import router as graph_router
from routers.query_router import router as query_router

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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(runbooks_router)
app.include_router(graph_router)
app.include_router(query_router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RunbookAI",
        "version": "1.0.0",
        "phase": 3,
        "description": "PDF ingestion + structured extraction + dependency graph + incident query engine",
    }
