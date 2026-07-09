"""Pipeline state schema shared by all LangGraph nodes."""
from typing import Any, TypedDict


class PipelineState(TypedDict, total=False):
    # Inputs
    job_id: str
    project_id: str
    topic: str
    niche: str
    audience: str
    user_script_text: str
    thumbnail_instructions: str

    # Agent outputs (one slice per agent)
    trend: dict[str, Any]
    research: dict[str, Any]
    knowledge: dict[str, Any]
    script: dict[str, Any]
    review: dict[str, Any]
    seo: dict[str, Any]
    voice: dict[str, Any]
    avatar: dict[str, Any]
    thumbnail: dict[str, Any]
    video: dict[str, Any]
    metadata: dict[str, Any]
