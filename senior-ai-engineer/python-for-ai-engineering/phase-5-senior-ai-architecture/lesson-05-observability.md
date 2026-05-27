# Python for AI Engineering — Phase 5
# Lesson 5: Observability — Structured Logging, Metrics, Tracing for AI Services

---

## 1. Intuition (Java Anchor)

Java: SLF4J + Logback for logging, Micrometer for metrics, Spring Sleuth / OpenTelemetry for tracing.
Python: `logging` module + structlog for structured JSON, Prometheus client for metrics, OpenTelemetry for tracing.

AI services have unique observability needs beyond standard APIs: token usage, LLM latency, cache hit rates, embedding quality, hallucination rate. These must be instrumented explicitly — they don't come from the framework.

| Java Pattern | Python Equivalent |
|---|---|
| SLF4J `Logger.info(...)` | `logging.getLogger(__name__).info(...)` |
| Logback JSON encoder | `python-json-logger` / `structlog` |
| MDC `MDC.put("requestId", id)` | `contextvars.ContextVar` |
| Micrometer `Counter` | `prometheus_client.Counter` |
| Micrometer `Histogram` | `prometheus_client.Histogram` |
| Actuator `/metrics` endpoint | `/metrics` with `prometheus_client` |
| Spring Sleuth trace/span | OpenTelemetry `tracer.start_as_current_span()` |
| `@Timed` annotation | `histogram.time()` context manager |
| Actuator `/health` | Custom `@app.get("/health")` endpoint |

---

## 2. Structured JSON Logging

```python
# Java: Logback JSON encoder converts SLF4J log to JSON
# Python: python-json-logger converts stdlib logging to JSON

import logging
import json
import os

def setup_logging(level: str = "INFO") -> None:
    """Configure structured JSON logging for production."""
    try:
        from pythonjsonlogger import jsonlogger

        handler = logging.StreamHandler()
        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
        handler.setFormatter(formatter)
        logging.root.handlers = [handler]
        logging.root.setLevel(level)
    except ImportError:
        # Fallback: plain text if library not installed
        logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# Log structured fields (Java: log.info("msg", kv("key", value))):
logger = logging.getLogger(__name__)

def log_llm_call(model: str, tokens: int, latency_ms: float, cache_hit: bool) -> None:
    logger.info(
        "LLM call completed",
        extra={                      # Java: MDC key-value pairs
            "model": model,
            "tokens": tokens,
            "latency_ms": round(latency_ms),
            "cache_hit": cache_hit,
            "cost_usd": tokens * 0.000003,   # gpt-4o-mini pricing example
        },
    )
# Output JSON:
# {"asctime": "2026-05-27T10:00:00", "levelname": "INFO",
#  "message": "LLM call completed", "model": "gpt-4o", "tokens": 850,
#  "latency_ms": 1234, "cache_hit": false, "cost_usd": 0.00255}
```

---

## 3. Correlation IDs via ContextVar (Java: MDC)

```python
# Java: MDC.put("requestId", id) — thread-local storage for request ID
# Python: ContextVar — async-safe equivalent (MDC uses ThreadLocal which breaks with async)

from contextvars import ContextVar
import uuid
import logging
from fastapi import FastAPI, Request, Response

# Module-level ContextVar (Java: static MDC key):
REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="")

class CorrelationFilter(logging.Filter):
    """Inject request_id into every log record from this request context."""
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = REQUEST_ID.get("")
        return True

# Add filter to root logger:
logging.root.addFilter(CorrelationFilter())

app = FastAPI()

@app.middleware("http")
async def correlation_middleware(request: Request, call_next) -> Response:
    # Get from header or generate new:
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
    token = REQUEST_ID.set(request_id)   # set for this async context
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        REQUEST_ID.reset(token)   # clean up (Java: MDC.remove() in finally)

# Now every logger.info() in this request context automatically includes request_id:
# {"message": "Analyzing CV", "request_id": "a3f9b1c2", ...}
```

---

## 4. Prometheus Metrics

```python
# pip install prometheus-client
from prometheus_client import Counter, Histogram, Gauge, make_asgi_app
from fastapi import FastAPI

app = FastAPI()

# Counters — monotonically increasing (Java: Micrometer Counter):
LLM_CALLS_TOTAL = Counter(
    "llm_calls_total",
    "Total LLM API calls",
    ["model", "status"],        # labels — Java: tags in Micrometer
)
CACHE_HITS = Counter("llm_cache_hits_total", "LLM cache hits")
CACHE_MISSES = Counter("llm_cache_misses_total", "LLM cache misses")

# Histograms — latency distribution (Java: Micrometer Timer):
LLM_LATENCY = Histogram(
    "llm_latency_seconds",
    "LLM call latency",
    ["model"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

# Gauges — current value (Java: Micrometer Gauge):
TOKEN_USAGE = Gauge("llm_tokens_used_total", "Cumulative tokens used")

# Usage in service:
import time

async def call_llm_instrumented(prompt: str, model: str = "gpt-4o") -> str:
    start = time.perf_counter()
    try:
        response = await async_client.chat.completions.create(
            model=model, messages=[{"role": "user", "content": prompt}]
        )
        content = response.choices[0].message.content
        tokens = response.usage.total_tokens

        LLM_CALLS_TOTAL.labels(model=model, status="success").inc()
        LLM_LATENCY.labels(model=model).observe(time.perf_counter() - start)
        TOKEN_USAGE.inc(tokens)
        return content

    except Exception as e:
        LLM_CALLS_TOTAL.labels(model=model, status="error").inc()
        raise

# Expose /metrics endpoint (Java: Actuator /prometheus):
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

---

## 5. Health Check Endpoint (Java: Spring Actuator `/health`)

```python
import time
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
_start_time = time.time()

class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    checks: dict[str, str]

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    checks = {}

    # Check Redis:
    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Check vector store:
    try:
        count = vector_store.ntotal
        checks["vector_store"] = f"ok ({count} vectors)"
    except Exception as e:
        checks["vector_store"] = f"error: {e}"

    # Check LLM (lightweight — just verify the client is initialized):
    checks["llm_client"] = "ok" if llm_service else "not initialized"

    overall = "ok" if all(v == "ok" or v.startswith("ok") for v in checks.values()) else "degraded"

    return HealthResponse(
        status=overall,
        uptime_seconds=round(time.time() - _start_time),
        checks=checks,
    )
```

---

## 6. LLM-Specific Observability

```python
# Standard APM tools (Datadog, New Relic) don't understand LLM metrics.
# These must be tracked explicitly in your code.

import logging
import time

logger = logging.getLogger("llm.metrics")

class InstrumentedLLMService:
    """LLM service with full observability — token cost, latency, cache, errors."""

    async def complete(self, prompt: str, system: str = "", use_cache: bool = True) -> str:
        messages = build_messages(prompt, system)
        cache_key = make_cache_key(messages)
        start = time.perf_counter()

        # Cache check:
        if use_cache:
            cached = await self._cache.get(cache_key)
            if cached:
                CACHE_HITS.inc()
                logger.info(
                    "llm_cache_hit",
                    extra={"cache_key": cache_key[:8], "latency_ms": 0},
                )
                return cached

        CACHE_MISSES.inc()

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
            )
            content = response.choices[0].message.content
            tokens = response.usage.total_tokens
            latency_ms = (time.perf_counter() - start) * 1000

            # Instrument:
            LLM_CALLS_TOTAL.labels(model=self._model, status="success").inc()
            LLM_LATENCY.labels(model=self._model).observe(latency_ms / 1000)
            TOKEN_USAGE.inc(tokens)

            logger.info(
                "llm_call",
                extra={
                    "model": self._model,
                    "tokens": tokens,
                    "latency_ms": round(latency_ms),
                    "cost_usd": round(tokens * 0.000003, 6),
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                },
            )

            # Cache for next time:
            if use_cache:
                await self._cache.set(cache_key, content, ttl_seconds=3600)

            return content

        except Exception as e:
            LLM_CALLS_TOTAL.labels(model=self._model, status="error").inc()
            logger.error("llm_error", extra={"error": str(e), "model": self._model})
            raise
```

---

## 7. Interview Anchor

**"How do you make an AI service observable in production?"**

Say:
> "Four pillars. Structured JSON logging with `python-json-logger` so every log line is parseable by Splunk or Datadog — each LLM call logs model, tokens, latency, cost, and cache hit as JSON fields, not interpolated into a string. Correlation IDs via `contextvars.ContextVar` — like Java MDC but async-safe — so every log line across a multi-step LLM pipeline carries the same request ID. Prometheus metrics via `prometheus_client`: a Counter for calls (labeled by model and status), a Histogram for latency buckets, a Gauge for cumulative token usage — exposed on `/metrics`. A custom `/health` endpoint that checks Redis, the vector store, and the LLM client — same as Spring Actuator but explicit. The AI-specific metrics that don't come for free: token cost per query (critical — alerts when prompt engineering changes accidentally double token usage), cache hit rate (should be > 60% for a production Q&A system), and p95 LLM latency (5s is normal, 30s means something is wrong)."

---

## 8. Quick Reference

```python
# Structured logging setup
from pythonjsonlogger import jsonlogger
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter())
logging.root.handlers = [handler]

# Log with extra fields
logger.info("LLM call", extra={"tokens": 850, "latency_ms": 1234, "model": "gpt-4o"})

# Correlation ID (ContextVar — async-safe MDC)
from contextvars import ContextVar
REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="")
token = REQUEST_ID.set("abc123")   # set in middleware
REQUEST_ID.reset(token)            # cleanup in finally

# Prometheus metrics
from prometheus_client import Counter, Histogram, Gauge, make_asgi_app
c = Counter("name", "description", ["label1"])
c.labels(label1="value").inc()
h = Histogram("name", "description", buckets=[...])
h.observe(seconds)
with h.time(): ...     # auto-time a block
app.mount("/metrics", make_asgi_app())

# Health endpoint
@app.get("/health")
async def health():
    return {"status": "ok", "checks": {"redis": "ok", "llm": "ok"}}

# LLM observability metrics to track:
# - llm_calls_total {model, status}
# - llm_latency_seconds {model}
# - llm_tokens_used_total
# - llm_cache_hits_total / llm_cache_misses_total
# - llm_cost_usd_total

# Java comparison
# logging.getLogger(__name__)  → LoggerFactory.getLogger(getClass())
# extra={"key": val}           → MDC.put("key", val)
# ContextVar                   → ThreadLocal (but async-safe)
# prometheus Counter           → Micrometer Counter
# prometheus Histogram         → Micrometer Timer
# prometheus Gauge             → Micrometer Gauge
# /metrics endpoint            → Actuator /prometheus
# /health endpoint             → Actuator /health
# make_asgi_app()              → ManagementWebServerFactory
```
