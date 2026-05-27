"""
JWT authentication handler.

- HS256 tokens, configurable secret + expiry via env vars
- Creates access tokens with user_id + role claims
- Verifies tokens and returns decoded claims
- No third-party auth server needed — self-contained for demo/production
"""
from __future__ import annotations

import os
import time
from typing import Optional

import jwt
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────────────

JWT_SECRET  = os.getenv("JWT_SECRET", "bench-resource-optimizer-secret-change-in-prod")
JWT_ALGO    = "HS256"
JWT_EXPIRY  = int(os.getenv("JWT_EXPIRY_SECONDS", "86400"))   # 24 hours default


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


# ── Simple credential store (demo) ───────────────────────────────────────────
# In a real system this would be a DB table with hashed passwords.
# For this demo: hardcoded admin + any user_id with password "bench123"

ADMIN_CREDENTIALS: dict[str, str] = {
    "admin": os.getenv("ADMIN_PASSWORD", "admin123"),
}
DEFAULT_USER_PASSWORD = os.getenv("DEFAULT_USER_PASSWORD", "bench123")


def _check_credentials(user_id: str, password: str) -> Optional[str]:
    """Return role string if credentials valid, else None."""
    if user_id in ADMIN_CREDENTIALS:
        return "admin" if ADMIN_CREDENTIALS[user_id] == password else None
    # Any other user_id is a regular user
    return "user" if password == DEFAULT_USER_PASSWORD else None


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
