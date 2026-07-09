"""FastAPI dependencies: DB session, current user, role guards."""
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import TOKEN_TYPE_ACCESS, decode_token
from app.db.models import User
from app.db.session import get_db_session
from app.domain.enums import UserRole
from app.repositories.users import UserRepository

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")
    payload = decode_token(credentials.credentials, TOKEN_TYPE_ACCESS)
    user = await UserRepository(session).get(payload["sub"])
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole):
    async def guard(user: CurrentUser) -> User:
        if user.role not in {role.value for role in roles}:
            raise ForbiddenError("Insufficient permissions")
        return user

    return Depends(guard)
