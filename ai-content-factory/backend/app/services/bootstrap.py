"""Startup bootstrap: create tables (dev convenience) and seed default prompts.

Schema evolution is Alembic-owned; create_all is a no-op once migrations ran.
"""
from app.agents.prompt_seeds import PROMPT_SEEDS
from app.core.logging import get_logger
from app.db.base import Base
from app.db.session import engine, session_scope
from app.repositories.prompts import PromptRepository

logger = get_logger(__name__)


async def bootstrap() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_scope() as session:
        prompts = PromptRepository(session)
        seeded = 0
        for agent_name, seed in PROMPT_SEEDS.items():
            if not await prompts.exists_for(agent_name):
                await prompts.new_version(agent_name, seed["system"], seed["user"], notes="v1 baseline seed")
                seeded += 1
        if seeded:
            logger.info("prompts_seeded", count=seeded)
