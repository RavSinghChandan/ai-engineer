"""
Auth API — Phase 6.

POST /auth/register   — create tenant + first admin user
POST /auth/login      — returns JWT access token
GET  /auth/me         — returns current user profile
POST /auth/users      — admin creates additional users in their tenant
GET  /auth/users      — admin lists all users in their tenant
PUT  /auth/users/{id}/role — admin updates a user's role
"""
from __future__ import annotations
import re
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from utils.auth import hash_password, verify_password, create_access_token
from database.users_store import (
    create_tenant, get_tenant_by_slug,
    create_user, get_user_by_email, get_user, list_users_for_tenant, update_user_role,
)
from routers.deps import require_auth, require_role, CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])

VALID_ROLES = {"viewer", "editor", "admin"}
SLUG_RE = re.compile(r"^[a-z0-9\-]{2,40}$")


class RegisterRequest(BaseModel):
    tenant_name: str = Field(..., min_length=2, max_length=80)
    tenant_slug: str = Field(..., min_length=2, max_length=40)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)

    @field_validator("tenant_slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("Slug must be 2-40 lowercase letters, digits, or hyphens")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateUserRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)
    role: str = Field(default="viewer")

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


class UpdateRoleRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


def _user_response(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"],
        "tenant_id": user["tenant_id"],
        "is_active": bool(user["is_active"]),
    }


@router.post("/register", status_code=201)
def register(req: RegisterRequest):
    """
    Create a new tenant + the first admin user.
    The first user of a tenant is always 'admin'.
    """
    if get_tenant_by_slug(req.tenant_slug):
        raise HTTPException(status_code=409, detail=f"Tenant slug '{req.tenant_slug}' already taken")

    if get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    tenant_id = create_tenant(req.tenant_name, req.tenant_slug)
    user_id = create_user(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role="admin",
        tenant_id=tenant_id,
    )
    token = create_access_token(user_id, tenant_id, "admin", req.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "role": "admin",
            "tenant_id": tenant_id,
            "tenant_name": req.tenant_name,
            "tenant_slug": req.tenant_slug,
        },
    }


@router.post("/login")
def login(req: LoginRequest):
    """Authenticate and return a JWT access token."""
    user = get_user_by_email(req.email)
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    from database.users_store import get_tenant
    tenant = get_tenant(user["tenant_id"])
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=403, detail="Tenant is inactive")

    token = create_access_token(user["id"], user["tenant_id"], user["role"], user["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "tenant_id": user["tenant_id"],
            "tenant_name": tenant["name"],
            "tenant_slug": tenant["slug"],
        },
    }


@router.get("/me")
def me(current_user: CurrentUser = Depends(require_auth)):
    """Return the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "tenant_name": current_user.tenant_name,
        "tenant_slug": current_user.tenant_slug,
        "tenant_plan": current_user.tenant_plan,
    }


@router.post("/users", status_code=201, responses={403: {"description": "Requires admin role"}})
def create_user_in_tenant(
    req: CreateUserRequest,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """Admin creates an additional user inside their own tenant."""
    if get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = create_user(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role=req.role,
        tenant_id=current_user.tenant_id,
    )
    user = get_user(user_id)
    return _user_response(user)


@router.get("/users", responses={403: {"description": "Requires admin role"}})
def list_users(current_user: CurrentUser = Depends(require_role("admin"))) -> List[dict]:
    """Admin lists all users in their tenant."""
    return list_users_for_tenant(current_user.tenant_id)


@router.put(
    "/users/{user_id}/role",
    responses={403: {"description": "Requires admin role"}, 404: {"description": "User not found"}},
)
def set_user_role(
    user_id: int,
    req: UpdateRoleRequest,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """Admin updates a user's role. Cannot change own role."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    target = get_user(user_id)
    if not target or target["tenant_id"] != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found in your tenant")
    update_user_role(user_id, req.role)
    return {"user_id": user_id, "role": req.role}
