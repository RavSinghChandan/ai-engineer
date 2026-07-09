"""Agent-platform context repository: DB-backed, versioned prompts."""
from sqlalchemy import select, update

from app.core.exceptions import NotFoundError
from app.db.models import Prompt
from app.repositories.base import BaseRepository


class PromptRepository(BaseRepository[Prompt]):
    model = Prompt

    async def get_active(self, agent_name: str) -> Prompt:
        result = await self.session.execute(
            select(Prompt)
            .where(Prompt.agent_name == agent_name, Prompt.is_active.is_(True))
            .order_by(Prompt.version.desc())
            .limit(1)
        )
        prompt = result.scalar_one_or_none()
        if prompt is None:
            raise NotFoundError(f"No active prompt for agent '{agent_name}'")
        return prompt

    async def list_all(self) -> list[Prompt]:
        return await self.list_where(order_by=Prompt.agent_name)

    async def new_version(self, agent_name: str, system_prompt: str, user_template: str, notes: str = "") -> Prompt:
        current = await self.list_where(Prompt.agent_name == agent_name, order_by=Prompt.version.desc(), limit=1)
        next_version = (current[0].version + 1) if current else 1
        await self.session.execute(
            update(Prompt).where(Prompt.agent_name == agent_name).values(is_active=False)
        )
        return await self.add(
            Prompt(
                agent_name=agent_name,
                version=next_version,
                system_prompt=system_prompt,
                user_template=user_template,
                is_active=True,
                notes=notes,
            )
        )

    async def exists_for(self, agent_name: str) -> bool:
        result = await self.session.execute(
            select(Prompt.id).where(Prompt.agent_name == agent_name).limit(1)
        )
        return result.scalar_one_or_none() is not None
