"""Project / job / script / asset DTOs."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import AgentRunStatus, AssetKind, JobStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    niche: str = Field(default="", max_length=255)
    audience: str = Field(default="", max_length=255)
    description: str = ""
    creator_profile_id: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    niche: str
    audience: str
    description: str
    creator_profile_id: str | None = None
    created_at: datetime


class JobCreate(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    script_text: str = Field(default="", max_length=50_000)  # non-empty = bypass research/writing/review
    thumbnail_instructions: str = Field(default="", max_length=2_000)


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_name: str
    status: AgentRunStatus
    started_at: datetime | None
    finished_at: datetime | None
    duration_seconds: float | None
    output: dict[str, Any] | None
    error: str | None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: AssetKind
    media_type: str
    meta: dict[str, Any] | None


class ScriptVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version: int
    content: dict[str, Any]
    source: str
    created_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    topic: str
    status: JobStatus
    current_agent: str | None
    error: str | None
    result: dict[str, Any] | None
    created_at: datetime


class JobDetailOut(JobOut):
    runs: list[AgentRunOut] = []
    assets: list[AssetOut] = []
    script_versions: list[ScriptVersionOut] = []


class EventOut(BaseModel):
    id: int
    job_id: str
    agent: str | None
    type: str
    message: str
    payload: dict[str, Any] | None
    created_at: str
