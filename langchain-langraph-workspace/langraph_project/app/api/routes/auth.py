"""
Step 10 — JWT Authentication Routes

POST /api/v1/auth/token      → issue access token (username + password)
GET  /api/v1/auth/me         → current user info
GET  /api/v1/auth/admin-only → RBAC demo — admin only
GET  /api/v1/auth/officer+   → RBAC demo — officer or higher

Demo credentials:
  admin    / admin123
  officer  / officer123
  customer / customer123
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.security.rbac import (
    DEMO_USERS,
    Role,
    authenticate_user,
    get_current_user,
    require_role,
)
from app.security.jwt_handler import create_access_token
from app.schemas.security import TokenResponse, UserInfo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Security"])


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Obtain JWT access token",
    description=(
        "Exchange credentials for a Bearer token.\n\n"
        "**Demo accounts:**\n"
        "| Username | Password | Role |\n"
        "|---|---|---|\n"
        "| admin | admin123 | admin |\n"
        "| officer | officer123 | officer |\n"
        "| customer | customer123 | customer |"
    ),
)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    logger.info("Token issued | user=%s role=%s", user["username"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], username=user["username"])


@router.get("/me", response_model=UserInfo, summary="Current user profile")
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserInfo(
        username=current_user["username"],
        role=current_user["role"],
        name=current_user["name"],
    )


@router.get(
    "/admin-only",
    summary="Admin-only endpoint (RBAC demo)",
    description="Returns 403 for officer/customer roles.",
)
async def admin_only(current_user: dict = Depends(require_role(Role.ADMIN))):
    return {
        "message": f"Welcome, {current_user['name']}! You have full admin access.",
        "role": current_user["role"],
    }


@router.get(
    "/officer-or-above",
    summary="Officer+ endpoint (RBAC demo)",
    description="Accessible by officer and admin roles. Returns 403 for customer.",
)
async def officer_or_above(current_user: dict = Depends(require_role(Role.OFFICER))):
    return {
        "message": f"Welcome, {current_user['name']}! You have officer-level access.",
        "role": current_user["role"],
    }
