import os
import time
from fastapi import FastAPI, Request
from app.api.routes import router
from app.core.config import settings
from app.core.logger import get_logger

# ── LangSmith (optional — only if API key is set) ──────────────────────────
os.environ["LANGCHAIN_TRACING_V2"] = settings.langchain_tracing_v2
os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project

# ── Arize Phoenix — free, open-source LLM observability ────────────────────
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.langchain import LangChainInstrumentor

PHOENIX_ENDPOINT = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces")

tracer_provider = TracerProvider()
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint=PHOENIX_ENDPOINT))
)
otel_trace.set_tracer_provider(tracer_provider)
LangChainInstrumentor().instrument(tracer_provider=tracer_provider)

logger = get_logger(__name__)
logger.info(f"Phoenix tracing → {PHOENIX_ENDPOINT}")
logger.info(f"LangSmith tracing enabled={settings.langchain_tracing_v2} | project={settings.langchain_project}")

app = FastAPI(
    title="AI Service",
    description="Production-ready LangChain AI service with agent, RAG, memory, and streaming",
    version="1.0.0",
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(f"{request.method} {request.url.path} | {response.status_code} | {duration}ms")
    return response


app.include_router(router)
