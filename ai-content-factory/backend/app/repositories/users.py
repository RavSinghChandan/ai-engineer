"""Identity context repositories."""
import hashlib
from datetime import datetime

from sqlalchemy import select

from app.db.models import RefreshToken, User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    async def store(self, user_id: str, token: str, expires_at: datetime) -> RefreshToken:
        return await self.add(
            RefreshToken(user_id=user_id, token_hash=self.hash_token(token), expires_at=expires_at)
        )

    async def find_valid(self, token: str) -> RefreshToken | None:
        result = await self.session.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == self.hash_token(token),
                RefreshToken.revoked.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def revoke(self, stored: RefreshToken) -> None:
        stored.revoked = True
        await self.session.flush()
