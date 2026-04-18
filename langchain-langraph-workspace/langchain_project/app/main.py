import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

# ── LangSmith (optional — enable by setting LANGCHAIN_TRACING_V2=true in .env) ─
os.environ["LANGCHAIN_TRACING_V2"] = settings.langchain_tracing_v2
os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project

# ── Arize Phoenix — LLM observability (graceful: no crash if not running) ──────
try:
    from opentelemetry import trace as otel_trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from openinference.instrumentation.langchain import LangChainInstrumentor

    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.phoenix_collector_endpoint))
    )
    otel_trace.set_tracer_provider(tracer_provider)
    LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
    logger.info(f"Phoenix tracing active → {settings.phoenix_collector_endpoint}")
except Exception as e:
    logger.warning(f"Phoenix tracing not available (skipping): {e}")

logger.info(
    f"LangSmith tracing={settings.langchain_tracing_v2} | project={settings.langchain_project}"
)

# ── OpenAPI tag groups (controls Swagger sidebar order) ────────────────────────
tags_metadata = [
    {
        "name": "Health",
        "description": "Service status and readiness checks.",
    },
    {
        "name": "Chat",
        "description": (
            "Main AI chat interface. Supports structured JSON responses and "
            "token-by-token streaming. Integrates agent, RAG, memory, and versioned prompts."
        ),
    },
    {
        "name": "Agent",
        "description": (
            "Direct agent invocation. The agent autonomously decides which tools "
            "to call and returns a full tool-usage trace alongside the answer."
        ),
    },
    {
        "name": "RAG",
        "description": (
            "Retrieval-Augmented Generation. Upload documents (.txt or .pdf) to build "
            "a FAISS vector store. Activate retrieval via `use_rag: true` in `/chat`."
        ),
    },
    {
        "name": "Prompts",
        "description": (
            "Versioned system prompts stored in `app/prompts/`. "
            "Select a version dynamically in any chat request."
        ),
    },
    {
        "name": "Memory",
        "description": "Inspect and manage the in-process conversation history.",
    },
]

app = FastAPI(
    title="AI Service",
    summary="Production-ready LangChain AI service",
    description="""
## Overview
Enterprise AI microservice built with **LangChain + FastAPI**.

Demonstrates: agent tool use, multi-step reasoning, RAG, conversation memory,
versioned prompts, streaming, retry/fallback, and full observability.

## Quick start
1. Set `OPENAI_API_KEY` in `.env`
2. `uvicorn app.main:app --reload`
3. Open `/docs`

## Observability
- **LangSmith** — set `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` in `.env`
- **Arize Phoenix** — run `phoenix serve` and set `PHOENIX_COLLECTOR_ENDPOINT` in `.env`
""",
    version="1.0.0",
    openapi_tags=tags_metadata,
    contact={"name": "AI Service", "email": "ai-service@example.com"},
    license_info={"name": "MIT"},
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(f"{request.method} {request.url.path} | {response.status_code} | {duration}ms")
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(router)
