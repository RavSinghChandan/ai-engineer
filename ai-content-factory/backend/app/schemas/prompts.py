"""Prompt management DTOs."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_name: str
    version: int
    system_prompt: str
    user_template: str
    is_active: bool
    notes: str
    updated_at: datetime


class PromptUpdate(BaseModel):
    system_prompt: str = Field(min_length=1)
    user_template: str = Field(min_length=1)
    notes: str = ""
