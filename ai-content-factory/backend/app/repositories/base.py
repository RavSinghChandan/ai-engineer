"""Generic repository — shared CRUD plumbing for all aggregate repositories."""
from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.base import Base

TModel = TypeVar("TModel", bound=Base)


class BaseRepository(Generic[TModel]):
    model: type[TModel]

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, entity_id: str) -> TModel | None:
        return await self.session.get(self.model, entity_id)

    async def get_or_raise(self, entity_id: str) -> TModel:
        entity = await self.get(entity_id)
        if entity is None:
            raise NotFoundError(f"{self.model.__name__} {entity_id} not found")
        return entity

    async def add(self, entity: TModel) -> TModel:
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def list_where(self, *criteria: Any, order_by: Any = None, limit: int | None = None) -> list[TModel]:
        stmt = select(self.model).where(*criteria)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        if limit:
            stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
