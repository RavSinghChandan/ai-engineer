"""
FastAPI auth dependencies.

Every protected endpoint declares one of these as a dependency:
  - get_tenant_ctx  → any authenticated caller (USER, ADMIN, SUPERADMIN)
  - require_role(Role.ADMIN) → ADMIN or above
  - require_role(Role.SUPERADMIN) → SUPERADMIN only

Two auth methods supported (tried in order):
  1. X-API-Key header   → direct key lookup, no JWT needed
  2. Authorization: Bearer <JWT>  → validate JWT, extract claims

Usage in a router:
  @router.get("/metrics")
  async def metrics(ctx: TenantContext = Depends(require_role(Role.ADMIN))):
      ...
"""
from __future__ import annotations

import os
import time
from functools import lru_cache
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from auth.models import Role, TenantContext
import auth.store as store

# ── JWT config ────────────────────────────────────────────────────────────────
_JWT_SECRET    = os.environ.get("JWT_SECRET", "astrointel-jwt-secret-change-in-production")
_JWT_ALGORITHM = "HS256"
_JWT_TTL_SEC   = int(os.environ.get("JWT_TTL_SECONDS", "86400"))   # 24 hours default


# ── Token creation (used by /auth/token endpoint) ─────────────────────────────

def create_access_token(tenant_id: str, role: Role,
                        api_key: str = "", tenant_name: str = "",
                        user_id: str = "", email: str = "", name: str = "") -> str:
    payload = {
        "tenant_id":   tenant_id,
        "role":        role.value,
        "api_key":     api_key,
        "tenant_name": tenant_name,
        "user_id":     user_id,
        "email":       email,
        "name":        name,
        "exp":         int(time.time()) + _JWT_TTL_SEC,
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def verify_token(token: str) -> Optional[TenantContext]:
    """Decode a JWT and return TenantContext, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        return TenantContext(
            tenant_id   = payload["tenant_id"],
            role        = Role(payload["role"]),
            api_key     = payload.get("api_key", ""),
            tenant_name = payload.get("tenant_name", ""),
        )
    except (JWTError, KeyError, ValueError):
        return None


# ── Core dependency ───────────────────────────────────────────────────────────

async def get_tenant_ctx(
    x_api_key:     Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> TenantContext:
    """
    Resolve caller identity from X-API-Key header OR Bearer JWT.
    Raises HTTP 401 if neither is valid.
    """
    # ── Method 1: X-API-Key header ────────────────────────────────────────────
    if x_api_key:
        entry = store.lookup_key(x_api_key)
        if entry:
            tenant = store.get_tenant(entry.tenant_id)
            return TenantContext(
                tenant_id   = entry.tenant_id,
                role        = entry.role,
                api_key     = x_api_key,
                tenant_name = tenant.name if tenant else "",
            )
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or inactive API key.",
        )

    # ── Method 2: Bearer JWT ──────────────────────────────────────────────────
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        ctx   = verify_token(token)
        if ctx:
            # For API-key-based JWTs, verify the key is still active.
            # User-based JWTs (email+password login) have no api_key — skip check.
            if ctx.api_key and not store.lookup_key(ctx.api_key):
                raise HTTPException(
                    status_code = status.HTTP_401_UNAUTHORIZED,
                    detail      = "Token's API key has been revoked.",
                )
            return ctx
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired JWT token.",
        )

    raise HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail      = "Authentication required. Provide X-API-Key header or Bearer token.",
        headers     = {"WWW-Authenticate": "Bearer"},
    )


# ── Role-gated dependency factory ─────────────────────────────────────────────

def require_role(minimum_role: Role):
    """
    Returns a FastAPI dependency that enforces a minimum role.

    Usage:
      async def endpoint(ctx = Depends(require_role(Role.ADMIN))):
    """
    async def _check(ctx: TenantContext = Depends(get_tenant_ctx)) -> TenantContext:
        if not ctx.role.can(minimum_role):
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = (
                    f"Insufficient permissions. "
                    f"Required: {minimum_role.value}, you have: {ctx.role.value}."
                ),
            )
        return ctx
    return _check


# ── Session ownership guard ───────────────────────────────────────────────────

def assert_owns_session(session_tenant_id: str, ctx: TenantContext) -> None:
    """
    Raise 403 if a USER tries to access a session that belongs to another tenant.
    ADMIN and SUPERADMIN can access any session within their scope.
    """
    if ctx.role == Role.USER and session_tenant_id != ctx.tenant_id:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "You can only access your own sessions.",
        )
