"""Domain enumerations — the vocabulary of the system. No magic strings."""
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    CREATOR = "creator"
    VIEWER = "viewer"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentName(str, Enum):
    TREND = "trend"
    RESEARCH = "research"
    KNOWLEDGE = "knowledge"
    SCRIPT = "script"
    SCRIPT_INTAKE = "script_intake"
    REVIEW = "review"
    SEO = "seo"
    VOICE = "voice"
    AVATAR = "avatar"
    THUMBNAIL = "thumbnail"
    VIDEO = "video"
    METADATA = "metadata"
    PUBLISHING = "publishing"
    ANALYTICS = "analytics"
    LEARNING = "learning"


class AgentRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class EventType(str, Enum):
    JOB_STARTED = "job_started"
    AGENT_STARTED = "agent_started"
    AGENT_PROGRESS = "agent_progress"
    AGENT_COMPLETED = "agent_completed"
    AGENT_FAILED = "agent_failed"
    JOB_COMPLETED = "job_completed"
    JOB_FAILED = "job_failed"
    JOB_APPROVED = "job_approved"


class AssetKind(str, Enum):
    AUDIO = "audio"
    VIDEO = "video"
    AVATAR_VIDEO = "avatar_video"
    THUMBNAIL = "thumbnail"
    CAPTIONS = "captions"
    SCRIPT = "script"


class VoiceProvider(str, Enum):
    MACOS_SAY = "macos_say"
    ELEVENLABS = "elevenlabs"


class TrainingKind(str, Enum):
    VOICE = "voice"
    AVATAR_PHOTO = "avatar_photo"
    AVATAR_VIDEO = "avatar_video"


class AvatarProvider(str, Enum):
    NONE = "none"
    HEYGEN = "heygen"                 # studio avatar / digital twin (avatar_id)
    HEYGEN_PHOTO = "heygen_photo"     # talking photo (talking_photo_id)


class ModelRole(str, Enum):
    """Logical LLM roles — agents ask for a role, never a provider."""

    TREND_ANALYST = "trend_analyst"
    RESEARCHER = "researcher"
    SCRIPT_WRITER = "script_writer"
    REVIEWER = "reviewer"
    SEO_EXPERT = "seo_expert"
    METADATA_WRITER = "metadata_writer"
