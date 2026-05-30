"""
FastAPI dependency injection for auth + tenant isolation.

Usage:
    current_user = Depends(require_auth)          # any authenticated user
    current_user = Depends(require_role("admin"))  # admin or superadmin only
    current_user = Depends(require_role("editor")) # editor, admin, superadmin
"""
from __future__ import annotations
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.auth import decode_token
from database.users_store import get_user, get_tenant

_bearer = HTTPBearer(auto_error=False)

ROLE_HIERARCHY = {"viewer": 0, "editor": 1, "admin": 2, "superadmin": 3}


class CurrentUser:
    def __init__(self, user: dict, tenant: dict):
        self.id: int = user["id"]
        self.email: str = user["email"]
        self.full_name: str = user["full_name"]
        self.role: str = user["role"]
        self.tenant_id: int = user["tenant_id"]
        self.tenant_name: str = tenant["name"]
        self.tenant_slug: str = tenant["slug"]
        self.tenant_plan: str = tenant["plan"]

    def has_role(self, min_role: str) -> bool:
        return ROLE_HIERARCHY.get(self.role, 0) >= ROLE_HIERARCHY.get(min_role, 0)


def _extract_user(credentials: Optional[HTTPAuthorizationCredentials]) -> CurrentUser:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = get_user(int(payload["sub"]))
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    tenant = get_tenant(user["tenant_id"])
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant inactive or not found")

    return CurrentUser(user, tenant)


def require_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> CurrentUser:
    return _extract_user(credentials)


def require_role(min_role: str):
    def _dep(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> CurrentUser:
        user = _extract_user(credentials)
        if not user.has_role(min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{min_role}' role or higher. Your role: '{user.role}'",
            )
        return user
    return _dep


def optional_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> Optional[CurrentUser]:
    """Returns CurrentUser if token is valid, None if no token provided."""
    if not credentials:
        return None
    try:
        return _extract_user(credentials)
    except HTTPException:
        return None
