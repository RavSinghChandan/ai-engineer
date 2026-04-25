from collections import defaultdict, deque
from time import time
from fastapi import HTTPException, Request, status
from config import settings


class _SlidingWindowLimiter:
    def __init__(self):
        self._log: dict = defaultdict(deque)

    def is_allowed(self, key: str) -> bool:
        now = time()
        q   = self._log[key]
        while q and q[0] < now - settings.RATE_LIMIT_WINDOW:
            q.popleft()
        if len(q) >= settings.RATE_LIMIT_MAX:
            return False
        q.append(now)
        return True


_limiter = _SlidingWindowLimiter()


async def rate_limit(request: Request):
    """Dependency: 20 requests / 60 s per client IP."""
    client_ip = request.client.host if request.client else "unknown"
    if not _limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Max {settings.RATE_LIMIT_MAX} requests per {settings.RATE_LIMIT_WINDOW}s.",
        )
