"""Agent contract.

An agent is a stateless unit of work: it receives the pipeline state,
uses only injected ports (LLM registry, TTS, vector store, media), and
returns a partial state update. Prompts come from the database (editable
in the UI), never hard-coded.
"""
import json
import re
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.core.exceptions import ProviderContentError
from app.domain.enums import AgentName, EventType, ModelRole
from app.providers.llm.registry import ModelRegistry
from app.providers.ports import AvatarPort, LLMRequest, ThumbnailPort, TTSPort, VectorStorePort, VideoComposerPort

EmitFn = Callable[[EventType, str, dict[str, Any] | None], Awaitable[None]]


@dataclass
class CreatorProfileData:
    """Resolved creator identity for one pipeline run (from a CreatorProfile row)."""

    profile_id: str | None = None
    name: str = "Default (no avatar)"
    voice_provider: str = "macos_say"
    voice_id: str | None = None
    avatar_provider: str = "none"
    avatar_id: str | None = None
    avatar_required: bool = False
    photo_path: str | None = None

_JSON_FENCE_RE = re.compile(r"(?:^```(?:json)?\s*)|(?:\s*```$)", re.MULTILINE)


@dataclass
class PromptData:
    system_prompt: str
    user_template: str
    version: int


@dataclass
class AgentContext:
    """Everything an agent may touch. Nothing else is reachable by design."""

    job_id: str
    settings: Settings
    models: ModelRegistry
    tts: TTSPort
    vector: VectorStorePort
    thumbnails: ThumbnailPort
    composer: VideoComposerPort
    prompts: dict[str, PromptData]
    job_dir: Path
    profile: CreatorProfileData = field(default_factory=CreatorProfileData)
    avatar: AvatarPort | None = None
    current_agent: str | None = None
    emit: EmitFn = field(repr=False, default=None)  # type: ignore[assignment]

    def prompt(self, agent: AgentName) -> PromptData:
        return self.prompts[agent.value]


class Agent(ABC):
    name: AgentName

    @abstractmethod
    async def run(self, state: dict[str, Any], ctx: AgentContext) -> dict[str, Any]:
        """Return a partial state update. Must be side-effect free except via ctx ports."""

    async def _ask_json(
        self, ctx: AgentContext, role: ModelRole, variables: dict[str, Any], temperature: float | None = None
    ) -> dict[str, Any]:
        """Render this agent's DB prompt, call the LLM, parse strict JSON."""
        prompt = ctx.prompt(self.name)
        request = LLMRequest(
            system=prompt.system_prompt,
            user=prompt.user_template.format(**variables),
            temperature=temperature if temperature is not None else ctx.settings.llm_temperature,
            json_mode=True,
        )
        response = await ctx.models.for_role(role).complete(request)
        return parse_llm_json(response.text)


def parse_llm_json(text: str) -> dict[str, Any]:
    cleaned = _JSON_FENCE_RE.sub("", text.strip()).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fall back to the outermost JSON object in the response.
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError as exc:
                raise ProviderContentError(f"LLM returned unparseable JSON: {cleaned[:300]}") from exc
        raise ProviderContentError(f"LLM returned no JSON object: {cleaned[:300]}")
