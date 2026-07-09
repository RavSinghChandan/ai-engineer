"""Agent registry — the single place the pipeline looks up agent implementations.

Replacing an agent (e.g. a HeyGen-powered VideoAgent) means registering a
different class here; the graph never changes.
"""
from app.agents.base import Agent
from app.agents.content_agents import (
    KnowledgeAgent,
    MetadataAgent,
    ResearchAgent,
    ReviewAgent,
    ScriptAgent,
    ScriptIntakeAgent,
    SeoAgent,
    TrendAgent,
)
from app.agents.media_agents import AvatarAgent, ThumbnailAgent, VideoAgent, VoiceAgent
from app.domain.enums import AgentName

_AGENT_CLASSES: tuple[type[Agent], ...] = (
    TrendAgent,
    ResearchAgent,
    KnowledgeAgent,
    ScriptAgent,
    ReviewAgent,
    ScriptIntakeAgent,
    SeoAgent,
    VoiceAgent,
    AvatarAgent,
    ThumbnailAgent,
    VideoAgent,
    MetadataAgent,
)


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[AgentName, Agent] = {cls.name: cls() for cls in _AGENT_CLASSES}

    def get(self, name: AgentName) -> Agent:
        return self._agents[name]

    @property
    def pipeline_order(self) -> list[AgentName]:
        """Execution order of the production pipeline (review loop handled by the graph)."""
        return [cls.name for cls in _AGENT_CLASSES]

    def names(self) -> list[str]:
        return [name.value for name in self.pipeline_order]


agent_registry = AgentRegistry()
