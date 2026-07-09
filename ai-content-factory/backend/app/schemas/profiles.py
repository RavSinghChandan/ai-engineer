"""Creator profile DTOs."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import AvatarProvider, VoiceProvider


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    voice_provider: VoiceProvider = VoiceProvider.MACOS_SAY
    voice_id: str | None = None
    avatar_provider: AvatarProvider = AvatarProvider.NONE
    avatar_id: str | None = None
    avatar_required: bool = False
    is_default: bool = False


class ProfileUpdate(ProfileCreate):
    pass


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    voice_provider: VoiceProvider
    voice_id: str | None
    avatar_provider: AvatarProvider
    avatar_id: str | None
    avatar_required: bool
    is_default: bool
    created_at: datetime


class AvatarCatalogItem(BaseModel):
    avatar_id: str
    name: str | None = None
    gender: str | None = None
    preview_image_url: str | None = None
    premium: bool = False


class VoiceCatalogItem(BaseModel):
    voice_id: str
    name: str | None = None
    category: str | None = None


class TrainingResult(BaseModel):
    kind: str  # voice | avatar
    provider_id: str
    message: str


class TrainingSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    file_path: str
    provider_id: str | None
    notes: str
    created_at: datetime
