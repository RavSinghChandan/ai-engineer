"""Role-Based Access Control — FastAPI dependency injection."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.security.jwt_handler import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


class Role(str, Enum):
    ADMIN = "admin"
    OFFICER = "officer"
    CUSTOMER = "customer"


ROLE_HIERARCHY: "dict[Role, int]" = {
    Role.ADMIN: 3,
    Role.OFFICER: 2,
    Role.CUSTOMER: 1,
}

# Demo user registry — replace with a real DB in production
DEMO_USERS: "dict[str, dict]" = {
    "admin": {
        "password": "admin123",
        "role": Role.ADMIN,
        "name": "Admin User",
    },
    "officer": {
        "password": "officer123",
        "role": Role.OFFICER,
        "name": "Loan Officer",
    },
    "customer": {
        "password": "customer123",
        "role": Role.CUSTOMER,
        "name": "John Customer",
    },
}


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = DEMO_USERS.get(username)
    if user and user["password"] == password:
        return {"username": username, **user}
    return None


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        username: str | None = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc

    user = DEMO_USERS.get(username)
    if not user:
        raise exc
    return {"username": username, **user}


def require_role(minimum_role: Role):
    """FastAPI dependency factory — enforces minimum role level."""

    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        user_role: Role = current_user.get("role", Role.CUSTOMER)
        if ROLE_HIERARCHY.get(user_role, 0) < ROLE_HIERARCHY.get(minimum_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {minimum_role} role or higher. Your role: {user_role}",
            )
        return current_user

    return _check
