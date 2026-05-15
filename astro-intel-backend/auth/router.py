"""
Auth + Tenant management endpoints.

Public (no auth needed):
  POST /auth/token          — exchange API key for JWT

SUPERADMIN only:
  POST /admin/tenants       — create a new tenant + generate their first ADMIN key
  GET  /admin/tenants       — list all tenants
  POST /admin/tenants/{tenant_id}/keys  — add a key (any role) to an existing tenant
  DELETE /admin/keys/{key}  — revoke an API key

ADMIN or above:
  GET  /admin/my-tenant     — see own tenant details + keys
  GET  /admin/my-keys       — list own tenant's keys
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from auth.models import Role, TenantContext
from auth.dependencies import create_access_token, get_tenant_ctx, require_role
import auth.store as store

router = APIRouter(tags=["Auth & Tenants"])


# ── Request / Response schemas ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    api_key: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    tenant_id:    str
    role:         str
    tenant_name:  str
    expires_in:   int   # seconds

class CreateTenantRequest(BaseModel):
    name:              str
    admin_description: str = "Primary admin key"

class CreateKeyRequest(BaseModel):
    role:        str   # "user" | "admin"
    description: str = ""

class TenantOut(BaseModel):
    tenant_id:   str
    name:        str
    is_active:   bool
    key_count:   int

class KeyOut(BaseModel):
    key:         str
    tenant_id:   str
    role:        str
    description: str
    is_active:   bool


# ── POST /auth/token — exchange API key for JWT ───────────────────────────────

@router.post("/auth/token", response_model=TokenResponse)
async def get_token(req: TokenRequest):
    """
    Exchange a raw API key for a short-lived JWT.
    Clients can then use Bearer <JWT> instead of sending the raw key every time.
    """
    entry = store.lookup_key(req.api_key)
    if not entry:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or inactive API key.",
        )
    tenant = store.get_tenant(entry.tenant_id)
    token  = create_access_token(
        tenant_id   = entry.tenant_id,
        role        = entry.role,
        api_key     = entry.key,
        tenant_name = tenant.name if tenant else "",
    )
    import os
    ttl = int(os.environ.get("JWT_TTL_SECONDS", "86400"))
    return TokenResponse(
        access_token = token,
        tenant_id    = entry.tenant_id,
        role         = entry.role.value,
        tenant_name  = tenant.name if tenant else "",
        expires_in   = ttl,
    )


# ── POST /admin/tenants — create tenant (SUPERADMIN only) ─────────────────────

@router.post("/admin/tenants", status_code=status.HTTP_201_CREATED)
async def create_tenant(
    req: CreateTenantRequest,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """
    Create a new tenant and generate their first ADMIN API key.
    Only SUPERADMIN can do this.
    """
    tenant  = store.create_tenant(req.name)
    api_key = store.create_api_key(
        tenant_id   = tenant.tenant_id,
        role        = Role.ADMIN,
        description = req.admin_description,
    )
    return {
        "tenant_id":   tenant.tenant_id,
        "tenant_name": tenant.name,
        "admin_key":   api_key.key,
        "role":        api_key.role.value,
        "message":     (
            f"Tenant '{tenant.name}' created. "
            f"Share the admin_key with the tenant admin — it cannot be retrieved again."
        ),
    }


# ── GET /admin/tenants — list all tenants (SUPERADMIN only) ───────────────────

@router.get("/admin/tenants", response_model=List[TenantOut])
async def list_tenants(
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    tenants = store.list_tenants()
    return [
        TenantOut(
            tenant_id  = t.tenant_id,
            name       = t.name,
            is_active  = t.is_active,
            key_count  = len(store.list_keys_for_tenant(t.tenant_id)),
        )
        for t in tenants
    ]


# ── POST /admin/tenants/{tenant_id}/keys — add a key (SUPERADMIN only) ────────

@router.post("/admin/tenants/{tenant_id}/keys", status_code=status.HTTP_201_CREATED)
async def add_key_to_tenant(
    tenant_id: str,
    req:       CreateKeyRequest,
    ctx:       TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """Add a USER or ADMIN key to an existing tenant."""
    try:
        role = Role(req.role.lower())
    except ValueError:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = f"Invalid role '{req.role}'. Must be 'user' or 'admin'.",
        )
    if role == Role.SUPERADMIN:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "Cannot create SUPERADMIN keys via API. Set MASTER_API_KEY env var.",
        )
    try:
        api_key = store.create_api_key(tenant_id, role, req.description)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return {
        "key":         api_key.key,
        "tenant_id":   api_key.tenant_id,
        "role":        api_key.role.value,
        "description": api_key.description,
        "message":     "API key created. Store it securely — it cannot be retrieved again.",
    }


# ── DELETE /admin/keys/{key} — revoke a key (SUPERADMIN only) ─────────────────

@router.delete("/admin/keys/{key}")
async def revoke_key(
    key: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    revoked = store.revoke_key(key)
    if not revoked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found.")
    return {"key": key, "status": "revoked"}


# ── GET /admin/my-tenant — own tenant info (ADMIN or above) ──────────────────

@router.get("/admin/my-tenant")
async def my_tenant(ctx: TenantContext = Depends(require_role(Role.ADMIN))):
    tenant = store.get_tenant(ctx.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    keys   = store.list_keys_for_tenant(ctx.tenant_id)
    return {
        "tenant_id":  tenant.tenant_id,
        "name":       tenant.name,
        "is_active":  tenant.is_active,
        "key_count":  len(keys),
    }


# ── GET /admin/my-keys — own tenant's keys (ADMIN or above) ──────────────────

@router.get("/admin/my-keys", response_model=List[KeyOut])
async def my_keys(ctx: TenantContext = Depends(require_role(Role.ADMIN))):
    """List all API keys for the caller's tenant. Key values are shown in full."""
    keys = store.list_keys_for_tenant(ctx.tenant_id)
    return [
        KeyOut(
            key         = k.key,
            tenant_id   = k.tenant_id,
            role        = k.role.value,
            description = k.description,
            is_active   = k.is_active,
        )
        for k in keys
    ]


# ── GET /auth/me — who am I? (any authenticated user) ────────────────────────

@router.get("/auth/me")
async def whoami(ctx: TenantContext = Depends(get_tenant_ctx)):
    return {
        "tenant_id":   ctx.tenant_id,
        "tenant_name": ctx.tenant_name,
        "role":        ctx.role.value,
        "permissions": {
            "run_analysis":       True,
            "approve_own":        True,
            "translate_own":      True,
            "view_metrics":       ctx.is_admin_or_above(),
            "view_guardrails":    ctx.is_admin_or_above(),
            "manage_tenants":     ctx.is_superadmin(),
            "reset_circuit_breaker": ctx.is_superadmin(),
        },
    }
