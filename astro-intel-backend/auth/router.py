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

import secrets, time
from collections import defaultdict
import os

from fastapi import APIRouter, Depends, HTTPException, status, Request

from guardrails.production import RateLimiter
from pydantic import BaseModel
from typing import List, Optional

from auth.models import Role, TenantContext
from auth.dependencies import create_access_token, get_tenant_ctx, require_role
from auth.rbac import Permission, can, has_permission, permissions_for_role, audit
import auth.store as store
import auth.users as users

# OTP store: email → {code, expires_at}
_otp_store: dict = {}
_OTP_TTL = 600  # 10 minutes

# OTP send rate limit: 3 sends per 15 min per IP (prevents email spam DoS)
_otp_send_attempts: dict = defaultdict(list)
_OTP_SEND_MAX = 3

def _check_otp_send_limit(ip: str) -> None:
    now = time.time()
    attempts = [t for t in _otp_send_attempts[ip] if now - t < _RATE_WINDOW]
    _otp_send_attempts[ip] = attempts
    if len(attempts) >= _OTP_SEND_MAX:
        raise HTTPException(
            status_code = status.HTTP_429_TOO_MANY_REQUESTS,
            detail      = "Too many code requests. Please wait 15 minutes.",
        )

def _record_otp_send(ip: str) -> None:
    _otp_send_attempts[ip].append(time.time())

# F3: simple in-process rate limiter — 5 failed attempts → 15 min lockout per IP
_login_attempts: dict = defaultdict(list)
_RATE_WINDOW = 900   # 15 minutes
_RATE_MAX    = 10    # 10 failed attempts before lockout

def _check_rate_limit(ip: str) -> None:
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < _RATE_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again in 15 minutes.",
        )

def _record_failure(ip: str) -> None:
    _login_attempts[ip].append(time.time())

def _clear_failures(ip: str) -> None:
    _login_attempts.pop(ip, None)

router = APIRouter(tags=["Auth & Tenants"])


# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:    str
    name:     str
    password: str
    phone:    str = ""

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

class OtpSendRequest(BaseModel):
    email: str

class OtpVerifyRequest(BaseModel):
    email: str
    code:  str

class PhoneOtpSendRequest(BaseModel):
    phone: str

class PhoneOtpVerifyRequest(BaseModel):
    phone: str
    code:  str

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

# This runs on a small free instance. Two limits keep it from being swamped:
# a cap on how many accounts exist at all, and a cap on how fast new ones can
# be created. Both are env-tunable so raising them needs no code change.
_MAX_USERS = int(os.environ.get("MAX_TOTAL_USERS", "500"))
_signup_limiter = RateLimiter(
    max_requests=int(os.environ.get("SIGNUPS_PER_HOUR", "20")),
    window_seconds=3600,
)


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request):
    """
    Self-register as a USER. Creates an account + personal tenant instantly.
    Returns a JWT so the user is logged in immediately.
    """
    # Turn people away politely rather than letting the instance fall over.
    if len(users.list_users()) >= _MAX_USERS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We have reached the number of free accounts this trial can host. "
                "Please book a session at https://topmate.io/aurawithrav and we will "
                "read for you directly."
            ),
        )

    client_ip = (request.client.host if request.client else "unknown")
    allowed, reason = _signup_limiter.is_allowed(f"signup:{client_ip}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign-ups from this network. Please try again later.",
        )

    try:
        user = users.create_user(req.email, req.name, req.password, phone=req.phone)
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
async def login(req: LoginRequest, request: Request):
    """
    Login with email + password. Works for USER, ADMIN, and SUPERADMIN.
    Returns a JWT. No API key is ever exposed.
    """
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    user = users.get_by_email(req.email)
    if not user or not users.verify_password(user, req.password):
        _record_failure(ip)
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid email or password.",
        )
    _clear_failures(ip)
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


# ── POST /auth/otp/send — send 6-digit OTP to email ─────────────────────────

@router.post("/auth/otp/send")
async def otp_send(req: OtpSendRequest, request: Request):
    """
    Send a 6-digit OTP to the given email. The account must already exist.
    Rate-limited to the same 5-attempt window as /auth/login.
    """
    ip = request.client.host if request.client else "unknown"
    _check_otp_send_limit(ip)

    email = req.email.lower().strip()
    user  = users.get_by_email(email)
    if not user:
        # Don't reveal whether email exists — same response either way
        _record_otp_send(ip)
        return {"message": "If that email is registered, a code has been sent."}
    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Account is disabled. Contact your administrator.",
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    _otp_store[email] = {"code": code, "expires_at": time.time() + _OTP_TTL}
    _record_otp_send(ip)

    from email_service import send_otp_email
    email_sent = send_otp_email(to_email=user.email, to_name=user.name.split()[0], code=code)

    response: dict = {"message": "If that email is registered, a code has been sent."}
    import os as _os
    if not email_sent and _os.environ.get("APP_ENV", "development").lower() != "production":
        response["dev_code"] = code
        response["dev_note"] = "SMTP not configured. Use this code to log in (dev mode only)."
    return response


# ── POST /auth/otp/verify — verify OTP and issue JWT ─────────────────────────

@router.post("/auth/otp/verify", response_model=TokenResponse)
async def otp_verify(req: OtpVerifyRequest, request: Request):
    """
    Verify the 6-digit OTP. Issues JWT on success, same as /auth/login.
    Code is single-use and expires in 10 minutes.
    """
    ip    = request.client.host if request.client else "unknown"
    email = req.email.lower().strip()

    entry = _otp_store.get(email)
    if not entry or time.time() > entry["expires_at"] or entry["code"] != req.code.strip():
        _record_failure(ip)
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired code. Please request a new one.",
        )

    # Single-use: remove immediately
    del _otp_store[email]
    _clear_failures(ip)

    user = users.get_by_email(email)
    if not user or not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Account is disabled.",
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


# ── POST /auth/otp/phone/send — send 6-digit OTP via phone (dev: returns code) ─

@router.post("/auth/otp/phone/send")
async def otp_phone_send(req: PhoneOtpSendRequest, request: Request):
    """
    Send OTP to a registered phone number.
    No SMS provider configured → returns dev_code in response (same pattern as email OTP).
    """
    ip = request.client.host if request.client else "unknown"
    _check_otp_send_limit(ip)

    user = users.get_by_phone(req.phone)
    if not user:
        _record_otp_send(ip)
        return {"message": "If that phone is registered, a code has been sent."}
    if not user.is_active:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Account is disabled. Contact your administrator.",
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    phone_key = f"phone:{users._normalize_phone(req.phone)}"
    _otp_store[phone_key] = {"code": code, "expires_at": time.time() + _OTP_TTL}
    _record_otp_send(ip)

    import os as _os
    is_dev = _os.environ.get("APP_ENV", "development").lower() != "production"
    if is_dev:
        print(f"\n{'='*50}")
        print(f"  PHONE OTP for {req.phone}: {code}")
        print(f"{'='*50}\n", flush=True)

    response: dict = {"message": "If that phone is registered, a code has been sent."}
    if is_dev:
        response["dev_code"] = code
        response["dev_note"] = "No SMS provider configured. Use this code to log in (dev mode only)."
    return response


# ── POST /auth/otp/phone/verify — verify phone OTP and issue JWT ──────────────

@router.post("/auth/otp/phone/verify", response_model=TokenResponse)
async def otp_phone_verify(req: PhoneOtpVerifyRequest, request: Request):
    """Verify phone OTP code. Issues JWT on success."""
    ip        = request.client.host if request.client else "unknown"
    phone_key = f"phone:{users._normalize_phone(req.phone)}"

    entry = _otp_store.get(phone_key)
    if not entry or time.time() > entry["expires_at"] or entry["code"] != req.code.strip():
        _record_failure(ip)
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired code. Please request a new one.",
        )

    del _otp_store[phone_key]
    _clear_failures(ip)

    user = users.get_by_phone(req.phone)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

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


# ── POST /auth/password/reset — reset password via OTP (no login required) ────

class PasswordResetRequest(BaseModel):
    email:    str
    code:     str
    password: str

@router.post("/auth/password/reset")
async def password_reset(req: PasswordResetRequest, request: Request):
    """
    Reset password using a previously-sent OTP code.
    Flow: send OTP via /auth/otp/send → use code here to set new password.
    The OTP is consumed (single-use); user must re-request if code expired.
    """
    ip    = request.client.host if request.client else "unknown"
    email = req.email.lower().strip()

    entry = _otp_store.get(email)
    if not entry or time.time() > entry["expires_at"] or entry["code"] != req.code.strip():
        _record_failure(ip)
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Invalid or expired code. Request a new code and try again.",
        )

    if len(req.password) < 8:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "Password must be at least 8 characters.",
        )

    del _otp_store[email]
    _clear_failures(ip)

    ok = users.set_password(email, req.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return {"message": "Password updated successfully. You can now sign in with your new password."}


# ── POST /auth/password/change — change password (logged-in user) ─────────────

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password:     str

@router.post("/auth/password/change")
async def password_change(
    req: PasswordChangeRequest,
    ctx: TenantContext = Depends(can(Permission.USER__VIEW_PROFILE)),
):
    """Logged-in user changes their own password. Must supply current password."""
    user = users.get_by_email(ctx.email)
    if not user or not users.verify_password(user, req.current_password):
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "Current password is incorrect.",
        )
    if len(req.new_password) < 8:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = "Password must be at least 8 characters.",
        )
    users.set_password(ctx.email, req.new_password)
    return {"message": "Password changed successfully."}


# ── PATCH /auth/profile — update own name (logged-in user) ────────────────────

class ProfileUpdateRequest(BaseModel):
    name: str

@router.patch("/auth/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    ctx: TenantContext = Depends(can(Permission.USER__VIEW_PROFILE)),
):
    """Logged-in user updates their display name."""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty.")
    ok = users.set_name(ctx.email, name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return {"message": "Profile updated.", "name": name}


# ── POST /auth/phone — add/update phone number for logged-in user ─────────────

@router.post("/auth/phone")
async def update_phone(
    payload: dict,
    ctx: TenantContext = Depends(can(Permission.USER__VIEW_PROFILE)),
):
    """Allow a logged-in user to add or update their phone number."""
    phone = (payload.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number required.")
    ok = users.update_phone(ctx.email, phone)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return {"message": "Phone number updated.", "phone": users._normalize_phone(phone)}


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
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE)),
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
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE)),
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
    ctx:       TenantContext = Depends(can(Permission.TENANT__MANAGE_KEYS)),
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
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE_KEYS)),
):
    revoked = store.revoke_key(key)
    if not revoked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found.")
    return {"key": key, "status": "revoked"}


# ── GET /admin/my-tenant — own tenant info (ADMIN or above) ──────────────────

@router.get("/admin/my-tenant")
async def my_tenant(ctx: TenantContext = Depends(can(Permission.TENANT__VIEW_OWN))):
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
async def my_keys(ctx: TenantContext = Depends(can(Permission.TENANT__VIEW_OWN))):
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
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE)),
):
    """Disable a tenant — all their keys stop working immediately."""
    ok = store.set_tenant_active(tenant_id, False)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "locked"}


@router.patch("/admin/tenants/{tenant_id}/unlock")
async def unlock_tenant(
    tenant_id: str,
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE)),
):
    """Re-enable a previously locked tenant."""
    ok = store.set_tenant_active(tenant_id, True)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "unlocked"}


@router.delete("/admin/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE)),
):
    """Permanently delete a tenant and all their API keys."""
    ok = store.delete_tenant(tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {"tenant_id": tenant_id, "status": "deleted"}


@router.get("/admin/all-keys", response_model=List[KeyOut])
async def all_keys(
    ctx: TenantContext = Depends(can(Permission.TENANT__MANAGE_KEYS)),
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
async def list_users(ctx: TenantContext = Depends(can(Permission.USER__MANAGE))):
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
    ctx: TenantContext = Depends(can(Permission.USER__MANAGE)),
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
    ctx: TenantContext = Depends(can(Permission.USER__MANAGE)),
):
    """SUPERADMIN: disable a user account."""
    ok = users.set_active(email, False)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"email": email, "status": "locked"}


@router.patch("/admin/users/{email}/unlock")
async def unlock_user(
    email: str,
    ctx: TenantContext = Depends(can(Permission.USER__MANAGE)),
):
    """SUPERADMIN: re-enable a user account."""
    ok = users.set_active(email, True)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"email": email, "status": "unlocked"}


@router.delete("/admin/users/{email}")
async def delete_user(
    email: str,
    ctx: TenantContext = Depends(can(Permission.USER__MANAGE)),
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

@router.post("/auth/clear-lockout")
async def clear_lockout(request: Request, ctx: TenantContext = Depends(require_role(Role.SUPERADMIN))):
    """SUPERADMIN: clear all in-memory login lockouts instantly (no restart needed)."""
    count = len(_login_attempts)
    _login_attempts.clear()
    _otp_send_attempts.clear()
    return {"message": f"Cleared {count} locked IP(s). All users can log in again."}


@router.get("/auth/me")
async def whoami(ctx: TenantContext = Depends(can(Permission.USER__VIEW_PROFILE))):
    audit(ctx, Permission.USER__VIEW_PROFILE)
    return {
        "tenant_id":   ctx.tenant_id,
        "tenant_name": ctx.tenant_name,
        "role":        ctx.role.value,
        "user_id":     ctx.user_id,
        "email":       ctx.email,
        "name":        ctx.name,
        # Full RBAC permission set — every permission this role holds
        "permissions": sorted(permissions_for_role(ctx.role)),
    }
