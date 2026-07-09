"""Prompt management endpoints — every agent's prompt is editable and versioned."""
from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.repositories.prompts import PromptRepository
from app.schemas.prompts import PromptOut, PromptUpdate

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptOut])
async def list_prompts(session: DbSession, _: CurrentUser) -> list[PromptOut]:
    prompts = await PromptRepository(session).list_all()
    return [PromptOut.model_validate(p) for p in prompts]


@router.get("/{agent_name}/active", response_model=PromptOut)
async def get_active_prompt(agent_name: str, session: DbSession, _: CurrentUser) -> PromptOut:
    return PromptOut.model_validate(await PromptRepository(session).get_active(agent_name))


@router.put("/{agent_name}", response_model=PromptOut)
async def update_prompt(
    agent_name: str, body: PromptUpdate, session: DbSession, _: CurrentUser
) -> PromptOut:
    repo = PromptRepository(session)
    await repo.get_active(agent_name)  # 404 if the agent has no prompt at all
    prompt = await repo.new_version(agent_name, body.system_prompt, body.user_template, body.notes)
    return PromptOut.model_validate(prompt)
