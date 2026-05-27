# Python for AI Engineering — Phase 2
# Lesson 5: Logging

---

## 1. Intuition (Java Anchor)

Java: SLF4J + Logback/Log4j — `Logger log = LoggerFactory.getLogger(MyClass.class)`.
Python: built-in `logging` module — same concepts, slightly different API.

| Java (SLF4J) | Python |
|---|---|
| `LoggerFactory.getLogger(MyClass.class)` | `logging.getLogger(__name__)` |
| `log.debug("msg")` | `logger.debug("msg")` |
| `log.info("msg")` | `logger.info("msg")` |
| `log.warn("msg")` | `logger.warning("msg")` |
| `log.error("msg", e)` | `logger.error("msg", exc_info=True)` or `logger.exception("msg")` |
| `log.info("val={}", val)` | `logger.info("val=%s", val)` or `logger.info(f"val={val}")` |
| `%d` in logback.xml | logging.basicConfig / dictConfig |
| MDC.put("requestId", id) | LogRecord extras / structlog |

---

## 2. Basic Logging Setup

```python
import logging

# Module-level logger — same as Java's getLogger per class
# __name__ = module path, e.g., "agents.cv_parser" — automatic hierarchy
logger = logging.getLogger(__name__)

# Root logger configuration (do this ONCE at application startup):
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Usage — identical log levels to Java:
logger.debug("Parsing CV text: %d chars", len(text))       # dev detail
logger.info("CV parsed: user=%s, skills=%d", uid, n)       # business event
logger.warning("Low confidence score: %.2f", score)        # degraded but ok
logger.error("LLM call failed: %s", error)                 # error, continues
logger.critical("Database connection lost — shutting down") # fatal
```

---

## 3. Logging Exceptions (Java: log.error("msg", exception))

```python
# Java: log.error("LLM failed", e);   — logs message + stacktrace

# Python option 1: logger.exception() — logs message + full traceback automatically
try:
    result = call_llm(prompt)
except Exception as e:
    logger.exception(f"LLM call failed for user {user_id}")
    # logs: message + full traceback — use inside except blocks

# Python option 2: logger.error with exc_info=True — same result
try:
    result = call_llm(prompt)
except Exception as e:
    logger.error("LLM call failed: %s", e, exc_info=True)

# Python option 3: log message only (no traceback)
logger.error("LLM call failed: %s", e)   # message only — use when traceback is noise
```

---

## 4. Logger Hierarchy (Java: Package-level loggers)

```python
# Java: getLogger("com.myapp.service") — hierarchy via package names
# Python: same — hierarchy via __name__ (module path)

# In agents/cv_parser.py:
logger = logging.getLogger(__name__)    # = "agents.cv_parser"

# In agents/planning_agent.py:
logger = logging.getLogger(__name__)    # = "agents.planning_agent"

# Root logger controls all:
logging.getLogger().setLevel(logging.WARNING)      # silence everything below WARNING

# Silence a noisy library (like LangChain's verbose output):
logging.getLogger("langchain").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("openai").setLevel(logging.WARNING)

# Your app still logs at INFO:
logging.getLogger("agents").setLevel(logging.INFO)
logging.getLogger("api").setLevel(logging.INFO)
```

---

## 5. Structured Logging (JSON) — Production Standard

```python
# Java: Logback + logstash-logback-encoder → JSON logs
# Python: structlog library or custom JSON formatter

import json
import logging

class JSONFormatter(logging.Formatter):
    """Formats log records as JSON — parseable by Datadog, ELK, CloudWatch."""
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Attach extras if present
        if hasattr(record, "user_id"):
            log_entry["user_id"] = record.user_id
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

def configure_logging(level: str = "INFO"):
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)

# Usage:
configure_logging("INFO")
logger = logging.getLogger(__name__)
logger.info("CV uploaded", extra={"user_id": "ravi", "request_id": "abc-123"})
# Output: {"timestamp": "...", "level": "INFO", "message": "CV uploaded", "user_id": "ravi", ...}
```

---

## 6. Correlation IDs — Request Tracing (Java: MDC)

```python
# Java: MDC.put("requestId", id) — ThreadLocal storage per request
# Python (FastAPI): contextvars — like ThreadLocal but for coroutines

import uuid
import logging
from contextvars import ContextVar

# ContextVar = per-request storage, safe for async (unlike Java ThreadLocal for threads)
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

class CorrelationFilter(logging.Filter):
    """Injects request_id into every log record."""
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("no-request-id")
        return True

# FastAPI middleware to set request_id per request:
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        token = request_id_var.set(req_id)   # set for this request's context
        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = req_id
            return response
        finally:
            request_id_var.reset(token)      # clean up

# Every log within the request now includes request_id automatically
# Java MDC equivalent — but works correctly in async context
```

---

## 7. LLM-Specific Logging Patterns

```python
# Log every LLM call with enough context to debug and audit:

import time

def log_llm_call(
    operation: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: float,
    success: bool,
    error: str = "",
):
    entry = {
        "event": "llm_call",
        "operation": operation,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "latency_ms": round(latency_ms, 1),
        "success": success,
    }
    if error:
        entry["error"] = error
    logger.info("LLM call", extra=entry)

# Wrapper that logs automatically:
def traced_llm_call(operation: str):
    def decorator(fn):
        import functools
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = fn(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                log_llm_call(operation, "gpt-4o", 0, 0, elapsed, success=True)
                return result
            except Exception as e:
                elapsed = (time.perf_counter() - start) * 1000
                log_llm_call(operation, "gpt-4o", 0, 0, elapsed, success=False, error=str(e))
                raise
        return wrapper
    return decorator

@traced_llm_call("parse_cv")
def parse_cv(text: str) -> dict: ...
```

---

## 8. Interview Anchor

**"How do you implement logging in a production FastAPI AI service?"**

Say:
> "Three layers. First, a JSON formatter so every log line is machine-parseable by Datadog or ELK — same as Java's logstash-logback-encoder. Second, correlation IDs via `ContextVar` — a middleware sets a `request_id` per incoming request, a logging Filter injects it into every log record automatically. This is the Python equivalent of Java's MDC, but using `ContextVar` instead of `ThreadLocal` because async code shares threads. Third, LLM-specific structured logs — every LLM call logs operation, model, token counts, latency, and success/failure as structured fields. That gives me a queryable audit trail for debugging hallucinations, cost spikes, and latency regressions."

---

## 9. Quick Reference

```python
# Module-level logger
logger = logging.getLogger(__name__)

# One-time startup config
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

# Log levels
logger.debug("detail")          # Java: log.debug()
logger.info("event")            # Java: log.info()
logger.warning("degraded")      # Java: log.warn()
logger.error("error: %s", e)    # Java: log.error()
logger.exception("in handler")  # Java: log.error("msg", e) — auto-includes traceback

# Silence noisy library
logging.getLogger("langchain").setLevel(logging.WARNING)

# Correlation ID (async-safe)
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
request_id_var.set(req_id)   # per-request
request_id_var.get()         # retrieve anywhere in same request context

# Java comparison
# getLogger(__name__)         → LoggerFactory.getLogger(MyClass.class)
# logging.basicConfig()       → logback.xml / log4j2.xml
# ContextVar                  → MDC (ThreadLocal)
# logger.exception()          → log.error("msg", e)
# logging.getLogger("lib").setLevel(WARNING) → <logger name="lib" level="WARN"/>
```
