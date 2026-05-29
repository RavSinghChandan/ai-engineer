"""
Structured JSON request logging + request_id correlation — production observability.

Every request gets a unique request_id injected into:
  - Response headers (X-Request-Id) — client/load balancer can correlate
  - Request state (request.state.request_id) — accessible in route handlers
  - Log lines — every log line for this request carries the same ID

Log format (JSON, one line per request):
  {
    "ts": 1714320000.123,
    "level": "INFO",
    "request_id": "abc12345",
    "method": "POST",
    "path": "/upload-cv",
    "status": 200,
    "latency_ms": 1234.5,
    "client_ip": "1.2.3.4",
    "user_agent": "..."
  }

Production: pipe stdout to CloudWatch / Datadog / ELK — they ingest JSON logs natively.
"""
from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("bench.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        request.state.started_at = time.time()

        response = await call_next(request)

        latency_ms = (time.time() - request.state.started_at) * 1000
        client_ip = request.headers.get("x-forwarded-for", "")
        if not client_ip and request.client:
            client_ip = request.client.host

        log_record = {
            "ts": time.time(),
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": round(latency_ms, 2),
            "client_ip": client_ip,
            "user_agent": request.headers.get("user-agent", "")[:80],
        }
        logger.info(json.dumps(log_record))

        response.headers["X-Request-Id"] = request_id
        return response


def configure_logging(level: str = "INFO") -> None:
    """Set up JSON-friendly logging. Call once at startup."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(message)s",   # raw message only — middleware already formats JSON
    )
    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
