"""Creator profile repository — the configurable identity layer (voice + avatar per person)."""
from app.db.models import CreatorProfile, Project
from app.repositories.base import BaseRepository


class CreatorProfileRepository(BaseRepository[CreatorProfile]):
    model = CreatorProfile

    async def list_for_owner(self, owner_id: str) -> list[CreatorProfile]:
        return await self.list_where(
            CreatorProfile.owner_id == owner_id, order_by=CreatorProfile.created_at.desc()
        )

    async def get_default(self, owner_id: str) -> CreatorProfile | None:
        rows = await self.list_where(
            CreatorProfile.owner_id == owner_id,
            CreatorProfile.is_default.is_(True),
            limit=1,
        )
        return rows[0] if rows else None

    async def resolve_for_project(self, project: Project) -> CreatorProfile | None:
        """Project's explicit profile, else the owner's default, else None."""
        if project.creator_profile_id:
            profile = await self.get(project.creator_profile_id)
            if profile:
                return profile
        return await self.get_default(project.owner_id)

    async def clear_default(self, owner_id: str) -> None:
        for profile in await self.list_for_owner(owner_id):
            profile.is_default = False
        await self.session.flush()
