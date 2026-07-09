"""Agent catalog endpoint — the pipeline roster the dashboard renders."""
from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.registry import agent_registry
from app.api.deps import CurrentUser

router = APIRouter(prefix="/agents", tags=["agents"])

_DESCRIPTIONS = {
    "trend": "Finds the highest-CTR angle for the topic",
    "research": "Builds a factual research brief",
    "knowledge": "Merges research with memory of past videos",
    "script": "Writes the narration script",
    "review": "Scores the script; requests revisions",
    "script_intake": "Structures your own script (bypasses research/review)",
    "seo": "Optimizes title, description, tags",
    "voice": "Synthesizes the narration audio",
    "avatar": "Renders the creator's avatar speaking the narration",
    "thumbnail": "Renders the video thumbnail",
    "video": "Composes the final MP4 with captions",
    "metadata": "Packages upload metadata, chapters, shorts ideas",
}


class AgentInfo(BaseModel):
    name: str
    description: str
    order: int


@router.get("", response_model=list[AgentInfo])
async def list_agents(_: CurrentUser) -> list[AgentInfo]:
    return [
        AgentInfo(name=name, description=_DESCRIPTIONS.get(name, ""), order=index)
        for index, name in enumerate(agent_registry.names())
    ]
