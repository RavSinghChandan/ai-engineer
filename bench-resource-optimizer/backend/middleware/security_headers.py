"""
Security headers middleware.

Adds enterprise-grade HTTP security headers to every response:
  - Strict-Transport-Security (HSTS)        — force HTTPS
  - X-Content-Type-Options                  — prevent MIME sniffing
  - X-Frame-Options                         — clickjacking protection
  - Referrer-Policy                         — limit referrer leakage
  - Content-Security-Policy                 — restrict asset origins
  - Permissions-Policy                      — disable unused browser APIs
  - X-XSS-Protection                        — legacy XSS filter

Why this matters at Senior Engineer level:
  An AI API that processes CV files containing PII must treat every
  HTTP boundary as a security surface. These headers are a free,
  zero-latency defence layer that OWASP recommends for all production APIs.
  They appear on every response, including errors — so an attacker cannot
  probe error pages to find injection vectors.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'"
        )
        return response
