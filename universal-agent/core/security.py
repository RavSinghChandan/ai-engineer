"""
Security layer — auth, rate limiting, input sanitization.

Opt-in per tenant via config:
  security.require_api_key: true/false
  security.rate_limit.requests_per_minute: 60
  security.input_max_length: 2000
  security.blocked_patterns: [...]
"""
import hashlib
import hmac
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Token bucket rate limiter ──────────────────────────────────────────────────

@dataclass
class _TokenBucket:
    capacity: int
    refill_rate: float       # tokens per second
    tokens: float = field(init=False)
    last_refill: float = field(default_factory=time.time, init=False)

    def __post_init__(self):
        self.tokens = float(self.capacity)

    def consume(self) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


# ── Security layer ─────────────────────────────────────────────────────────────

class SecurityLayer:
    """
    Handles API key verification, rate limiting, and input sanitization.
    All security is opt-in — disabled by default so existing integrations
    are not broken.
    """

    def __init__(self, cfg=None):
        self._cfg = cfg
        # Load API keys from env: PLATFORM_API_KEYS=tenant1:key1,tenant2:key2
        self._key_map: dict[str, str] = self._load_api_keys()
        # Per-tenant rate limit buckets
        self._buckets: dict[str, _TokenBucket] = {}

    def _load_api_keys(self) -> dict[str, str]:
        """Parse PLATFORM_API_KEYS env var → {tenant_id: hashed_key}"""
        raw = os.environ.get("PLATFORM_API_KEYS", "")
        key_map: dict[str, str] = {}
        for entry in raw.split(","):
            entry = entry.strip()
            if ":" in entry:
                tenant_id, api_key = entry.split(":", 1)
                key_map[tenant_id.strip()] = self._hash_key(api_key.strip())
        return key_map

    def _hash_key(self, key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    def verify_api_key(self, api_key: str) -> Optional[str]:
        """
        Returns tenant_id if key is valid, None otherwise.
        Uses constant-time comparison to prevent timing attacks.
        """
        if not api_key:
            return None
        hashed = self._hash_key(api_key)
        for tenant_id, stored_hash in self._key_map.items():
            if hmac.compare_digest(hashed, stored_hash):
                return tenant_id
        return None

    def check_rate_limit(self, tenant_id: str, rpm: int = 60) -> bool:
        """Returns True if request is within rate limit, False if exceeded."""
        if tenant_id not in self._buckets:
            self._buckets[tenant_id] = _TokenBucket(
                capacity=rpm,
                refill_rate=rpm / 60.0,
            )
        return self._buckets[tenant_id].consume()

    def sanitize_input(
        self,
        message: str,
        max_length: int = 2000,
        blocked_patterns: Optional[list[str]] = None,
    ) -> str:
        """
        Validates and sanitizes user input.
        Raises ValueError if input fails any check.
        Returns stripped message if valid.
        """
        if not message or not message.strip():
            raise ValueError("Empty message")

        if len(message) > max_length:
            raise ValueError(f"Message too long (max {max_length} chars)")

        if blocked_patterns:
            msg_lower = message.lower()
            for pattern in blocked_patterns:
                if pattern.lower() in msg_lower:
                    logger.warning(f"Blocked input pattern detected: '{pattern}'")
                    raise ValueError("Input contains restricted content")

        return message.strip()
