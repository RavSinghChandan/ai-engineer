"""
JWT authentication handler.

- HS256 tokens, configurable secret + expiry via env vars
- Creates access tokens with user_id + role claims
- Verifies tokens and returns decoded claims
"""
from __future__ import annotations

import hmac
import os
import time
from typing import Optional

import jwt
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────────────

_INSECURE_DEFAULTS = {
    "bench-resource-optimizer-secret-change-in-prod",
    "bench-dev-secret-local",
    "changeme",
    "secret",
}

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. Set a strong random secret before starting.")
if JWT_SECRET in _INSECURE_DEFAULTS:
    raise RuntimeError("JWT_SECRET is set to a known-insecure default. Set a strong random secret before starting.")

JWT_ALGO = "HS256"
JWT_EXPIRY = int(os.getenv("JWT_EXPIRY_SECONDS", "86400"))


# ── Models ───────────────────────────────────────────────────────────────────

class TokenPayload(BaseModel):
    sub: str        # user_id
    role: str       # "user" | "admin"
    exp: int        # unix expiry timestamp
    iat: int        # issued-at


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    user_id: str
    password: str


# ── Credential store ─────────────────────────────────────────────────────────
# Passwords loaded exclusively from environment variables — no fallback defaults.

_admin_password = os.getenv("ADMIN_PASSWORD", "")
_user_password = os.getenv("DEFAULT_USER_PASSWORD", "")

if not _admin_password:
    raise RuntimeError("ADMIN_PASSWORD environment variable is not set.")
if not _user_password:
    raise RuntimeError("DEFAULT_USER_PASSWORD environment variable is not set.")

ADMIN_CREDENTIALS: dict[str, str] = {"admin": _admin_password}
DEFAULT_USER_PASSWORD = _user_password


def _check_credentials(user_id: str, password: str) -> Optional[str]:
    """Return role string if credentials valid, else None."""
    # BUG FIX: plain == comparison for passwords is vulnerable to timing attacks —
    # an attacker measures response time to guess password character by character.
    # hmac.compare_digest runs in constant time regardless of where strings diverge.
    if user_id in ADMIN_CREDENTIALS:
        return "admin" if hmac.compare_digest(ADMIN_CREDENTIALS[user_id], password) else None
    return "user" if hmac.compare_digest(DEFAULT_USER_PASSWORD, password) else None


# ── Token operations ─────────────────────────────────────────────────────────

def create_token(user_id: str, role: str) -> TokenResponse:
    """Create a signed JWT for the given user_id and role."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + JWT_EXPIRY,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
    return TokenResponse(access_token=token, expires_in=JWT_EXPIRY)


def verify_token(token: str) -> TokenPayload:
    """
    Decode and verify a JWT.
    Raises jwt.ExpiredSignatureError if expired.
    Raises jwt.InvalidTokenError for any other problem.
    """
    data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    return TokenPayload(**data)


def login(user_id: str, password: str) -> Optional[TokenResponse]:
    """
    Validate credentials and return token if valid, else None.
    """
    role = _check_credentials(user_id, password)
    if role is None:
        return None
    return create_token(user_id, role)
