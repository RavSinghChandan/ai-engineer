"""Ports — the contracts every external capability must satisfy.

Business logic (agents, services) depends ONLY on these protocols.
Concrete providers live in app/providers/* and are wired in the
composition root. Swapping DeepSeek → Claude or ElevenLabs → OpenAI
never touches an agent.
"""
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field


class LLMRequest(BaseModel):
    system: str
    user: str
    temperature: float = 0.7
    json_mode: bool = False
    max_tokens: int | None = None


class LLMResponse(BaseModel):
    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


@runtime_checkable
class LLMPort(Protocol):
    async def complete(self, request: LLMRequest) -> LLMResponse: ...


class TTSResult(BaseModel):
    audio_path: Path
    duration_seconds: float
    voice: str


@runtime_checkable
class TTSPort(Protocol):
    async def synthesize(self, text: str, out_dir: Path) -> TTSResult: ...


class VectorHit(BaseModel):
    text: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


@runtime_checkable
class VectorStorePort(Protocol):
    async def add(self, collection: str, texts: list[str], metadatas: list[dict[str, Any]]) -> None: ...
    async def search(self, collection: str, query: str, k: int = 5) -> list[VectorHit]: ...


class AvatarResult(BaseModel):
    video_path: Path
    provider_video_id: str
    duration_seconds: float


@runtime_checkable
class AvatarPort(Protocol):
    async def render(self, avatar_id: str, audio_path: Path, out_dir: Path, width: int, height: int) -> AvatarResult: ...


class ComposeSpec(BaseModel):
    background_image: Path
    audio_path: Path
    srt_path: Path | None = None
    out_path: Path
    width: int = 1280
    height: int = 720
    fps: int = 30


@runtime_checkable
class VideoComposerPort(Protocol):
    async def compose(self, spec: ComposeSpec) -> Path: ...
    async def media_duration(self, path: Path) -> float: ...


class ThumbnailSpec(BaseModel):
    title: str
    subtitle: str = ""
    out_path: Path
    width: int = 1280
    height: int = 720
    # Designed concept (thumbnail v2) — falls back to title/subtitle rendering when absent
    headline: str | None = None
    kicker: str | None = None
    bg_from: str = "#0f172a"
    bg_to: str = "#1e3a8a"
    accent: str = "#38bdf8"
    photo_path: Path | None = None


@runtime_checkable
class ThumbnailPort(Protocol):
    def render(self, spec: ThumbnailSpec) -> Path: ...
