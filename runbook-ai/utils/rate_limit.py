"""
Simple in-process sliding-window rate limiter.

Suitable for single-instance deployments. For multi-instance, swap
the backing store with Redis (same interface, different _store impl).
"""
from __future__ import annotations
import time
import threading
from collections import deque
from fastapi import Request, HTTPException


class SlidingWindowRateLimiter:
    """Thread-safe per-key sliding window rate limiter."""

    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self._max = max_calls
        self._window = window_seconds
        self._store: dict[str, deque] = {}
        self._lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            if key not in self._store:
                self._store[key] = deque()
            dq = self._store[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self._max:
                return False
            dq.append(now)
            return True

    def check(self, key: str, detail: str = "Rate limit exceeded. Try again later.") -> None:
        """Raise HTTP 429 if rate limit exceeded."""
        if not self.is_allowed(key):
            raise HTTPException(status_code=429, detail=detail)


def client_key(request: Request) -> str:
    """Extract IP from request for use as rate-limit key."""
    # BUG FIX: X-Forwarded-For is client-controlled — an attacker can set it to any value
    # to rotate IPs and bypass rate limiting. Only trust it when a trusted proxy is configured.
    # For direct deployments (no trusted reverse proxy), use the real socket IP.
    trusted_proxy = request.headers.get("X-Real-IP")  # set by nginx/envoy, not by clients
    if trusted_proxy:
        return trusted_proxy.strip()
    return request.client.host if request.client else "unknown"


# 20 queries per minute per IP — adjust via env if needed
query_limiter = SlidingWindowRateLimiter(max_calls=20, window_seconds=60)
