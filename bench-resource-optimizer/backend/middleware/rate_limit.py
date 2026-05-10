"""
Sliding-window rate limiter — Module 5 pattern (AI API Gateway).

Implementation: in-memory token bucket using a deque per client IP.
Production upgrade path: swap _store for a Redis sorted set (same algorithm,
  single line change) to share state across multiple FastAPI workers/pods.

Limits (configurable via env):
  RATE_LIMIT_REQUESTS = 60   (requests per window)
  RATE_LIMIT_WINDOW   = 60   (seconds)

On breach: returns HTTP 429 with Retry-After header.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import DefaultDict, Deque

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_LIMIT  = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW",   "60"))

# ip → deque of request timestamps (monotonic seconds)
_store: DefaultDict[str, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Respect X-Forwarded-For when behind a proxy/load balancer
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter injected as ASGI middleware."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Health + metrics probes bypass rate limiting
        if request.url.path in ("/health/live", "/health/ready", "/metrics"):
            return await call_next(request)

        ip  = _client_ip(request)
        now = time.monotonic()
        q   = _store[ip]

        # Evict timestamps outside the window
        while q and now - q[0] > _WINDOW:
            q.popleft()

        if len(q) >= _LIMIT:
            retry_after = int(_WINDOW - (now - q[0])) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Too many requests. Limit: {_LIMIT} per {_WINDOW}s.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        q.append(now)
        return await call_next(request)
