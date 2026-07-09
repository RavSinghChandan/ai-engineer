"""Authentication use cases: register, login, refresh-token rotation."""
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.domain.enums import UserRole
from app.repositories.users import RefreshTokenRepository, UserRepository
from app.schemas.auth import TokenPair


class AuthService:
    def __init__(self, session: AsyncSession):
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def register(self, email: str, password: str, full_name: str) -> User:
        if await self.users.get_by_email(email):
            raise ConflictError("An account with this email already exists")
        return await self.users.add(
            User(
                email=email.lower(),
                password_hash=hash_password(password),
                full_name=full_name,
                role=UserRole.CREATOR.value,
            )
        )

    async def login(self, email: str, password: str) -> TokenPair:
        user = await self.users.get_by_email(email)
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid email or password")
        return await self._issue_tokens(user)

    async def refresh(self, refresh_token: str) -> TokenPair:
        payload = decode_token(refresh_token, TOKEN_TYPE_REFRESH)
        stored = await self.tokens.find_valid(refresh_token)
        if stored is None:
            raise UnauthorizedError("Refresh token unknown or revoked")
        expires_at = stored.expires_at if stored.expires_at.tzinfo else stored.expires_at.replace(tzinfo=UTC)
        if expires_at < datetime.now(UTC):
            raise UnauthorizedError("Refresh token expired")
        user = await self.users.get_or_raise(payload["sub"])
        await self.tokens.revoke(stored)  # rotation: one use per refresh token
        return await self._issue_tokens(user)

    async def logout(self, refresh_token: str) -> None:
        stored = await self.tokens.find_valid(refresh_token)
        if stored is not None:
            await self.tokens.revoke(stored)

    async def _issue_tokens(self, user: User) -> TokenPair:
        settings = get_settings()
        refresh = create_refresh_token(user.id)
        await self.tokens.store(
            user.id, refresh, datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
        )
        return TokenPair(access_token=create_access_token(user.id, user.role), refresh_token=refresh)
