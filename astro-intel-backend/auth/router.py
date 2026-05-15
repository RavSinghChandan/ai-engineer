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
import auth.users as users

router = APIRouter(tags=["Auth & Tenants"])


# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:    str
    name:     str
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str

class CreateAdminRequest(BaseModel):
    email:    str
    name:     str
    password: str

class UserOut(BaseModel):
    user_id:    str
    email:      str
    name:       str
    role:       str
    is_active:  bool
    created_at: float

class TokenRequest(BaseModel):
    api_key: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    tenant_id:    str
    role:         str
    tenant_name:  str
    expires_in:   int
    user_id:      str = ""
    email:        str = ""
    name:         str = ""

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


# ── POST /auth/register — self-registration (USER) ───────────────────────────

@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest):
    """
    Self-register as a USER. Creates an account + personal tenant instantly.
    Returns a JWT so the user is logged in immediately.
    """
    try:
        user = users.create_user(req.email, req.name, req.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    tenant = store.get_tenant(user.tenant_id)
    import os
    ttl = int(os.environ.get("JWT_TTL_SECONDS", "86400"))
    from auth.dependencies import create_access_token as _create_token
    token = _create_token(
        tenant_id   = user.tenant_id,
        role        = Role(user.role),
        api_key     = "",
        tenant_name = tenant.name if tenant else req.name,
        user_id     = user.user_id,
        email       = user.email,
        name        = user.name,
    )
    return TokenResponse(
        access_token = token,
        tenant_id    = user.tenant_id,
        role         = user.role,
        tenant_name  = tenant.name if tenant else req.name,
        expires_in   = ttl,
        user_id      = user.user_id,
        email        = user.email,
        name         = user.name,
    )


# ── POST /auth/login — email + password login ────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    """
    Login with email + password. Works for USER, ADMIN, and SUPERADMIN.
    Returns a JWT. No API key is ever exposed.
    """
    user = users.get_by_email(req.email)
    if not user or not users.verify_password(user, req.password):
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Account is disabled. Contact your administrator.",
        )
    tenant = store.get_tenant(user.tenant_id)
    import os
    ttl = int(os.environ.get("JWT_TTL_SECONDS", "86400"))
    from auth.dependencies import create_access_token as _create_token
    token = _create_token(
        tenant_id   = user.tenant_id,
        role        = Role(user.role),
        api_key     = "",
        tenant_name = tenant.name if tenant else user.name,
        user_id     = user.user_id,
        email       = user.email,
        name        = user.name,
    )
    return TokenResponse(
        access_token = token,
        tenant_id    = user.tenant_id,
        role         = user.role,
        tenant_name  = tenant.name if tenant else user.name,
        expires_in   = ttl,
        user_id      = user.user_id,
        email        = user.email,
        name         = user.name,
    )


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


# ── SUPERADMIN tenant management ─────────────────────────────────────────────

@router.patch("/admin/tenants/{tenant_id}/lock")
async def lock_tenant(
    tenant_id: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """Disable a tenant — all their keys stop working immediately."""
    ok = store.set_tenant_active(tenant_id, False)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "locked"}


@router.patch("/admin/tenants/{tenant_id}/unlock")
async def unlock_tenant(
    tenant_id: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """Re-enable a previously locked tenant."""
    ok = store.set_tenant_active(tenant_id, True)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "unlocked"}


@router.delete("/admin/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """Permanently delete a tenant and all their API keys."""
    ok = store.delete_tenant(tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "deleted"}


@router.get("/admin/all-keys", response_model=List[KeyOut])
async def all_keys(
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """SUPERADMIN: list every API key across all tenants."""
    return [
        KeyOut(
            key         = k.key,
            tenant_id   = k.tenant_id,
            role        = k.role.value,
            description = k.description,
            is_active   = k.is_active,
        )
        for k in store.list_all_keys()
    ]


# ── User management (SUPERADMIN only) ────────────────────────────────────────

@router.get("/admin/users", response_model=List[UserOut])
async def list_users(ctx: TenantContext = Depends(require_role(Role.SUPERADMIN))):
    """SUPERADMIN: list all registered users."""
    return [
        UserOut(
            user_id    = u.user_id,
            email      = u.email,
            name       = u.name,
            role       = u.role,
            is_active  = u.is_active,
            created_at = u.created_at,
        )
        for u in users.list_users()
    ]


@router.post("/admin/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    req: CreateAdminRequest,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """SUPERADMIN: create an ADMIN account with email+password."""
    try:
        user = users.create_admin_user(req.email, req.name, req.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return UserOut(
        user_id    = user.user_id,
        email      = user.email,
        name       = user.name,
        role       = user.role,
        is_active  = user.is_active,
        created_at = user.created_at,
    )


@router.patch("/admin/users/{email}/lock")
async def lock_user(
    email: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """SUPERADMIN: disable a user account."""
    ok = users.set_active(email, False)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"email": email, "status": "locked"}


@router.patch("/admin/users/{email}/unlock")
async def unlock_user(
    email: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """SUPERADMIN: re-enable a user account."""
    ok = users.set_active(email, True)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"email": email, "status": "unlocked"}


@router.delete("/admin/users/{email}")
async def delete_user(
    email: str,
    ctx: TenantContext = Depends(require_role(Role.SUPERADMIN)),
):
    """SUPERADMIN: permanently delete a user account."""
    try:
        ok = users.delete_user(email)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"email": email, "status": "deleted"}


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
