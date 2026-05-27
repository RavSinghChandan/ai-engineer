"""
FastAPI dependency: get_current_user()

Usage:
    @app.post("/upload-cv")
    async def upload_cv(claims: TokenPayload = Depends(get_current_user)):
        ...

    @app.post("/admin/roles")
    async def create_role(claims: TokenPayload = Depends(require_admin)):
        ...
"""
import jwt
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.jwt_handler import TokenPayload, verify_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> TokenPayload:
    """
    Extract and validate Bearer token from Authorization header.
    Returns decoded claims on success.
    Raises 401 if missing or invalid.
    Raises 403 if token is expired.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing. Please include: Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return verify_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token has expired. Please login again.",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(
    claims: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    """
    Extends get_current_user — additionally requires role == 'admin'.
    Raises 403 if user is authenticated but not an admin.
    """
    if claims.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for this endpoint.",
        )
    return claims
