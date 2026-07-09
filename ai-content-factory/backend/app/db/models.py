"""SQLAlchemy ORM models — normalized schema, one class per table."""
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.domain.enums import AgentRunStatus, AssetKind, JobStatus, UserRole


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.CREATOR.value, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    projects: Mapped[list["Project"]] = relationship(back_populates="owner")


class RefreshToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CreatorProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A creator identity: which voice speaks and which avatar performs.

    Fully data-driven — the pipeline reads provider + id from the profile,
    so training a new person means inserting a row, never touching code.
    """

    __tablename__ = "creator_profiles"

    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_provider: Mapped[str] = mapped_column(String(30), default="macos_say", nullable=False)
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_provider: Mapped[str] = mapped_column(String(30), default="none", nullable=False)
    avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    photo_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    training_sessions: Mapped[list["TrainingSession"]] = relationship(
        back_populates="profile", order_by="desc(TrainingSession.created_at)"
    )


class TrainingSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Append-only training ledger — every sample ever given compounds.

    Voice re-clones always use the full accumulated sample history, so each
    new recording makes the clone better instead of replacing knowledge.
    """

    __tablename__ = "training_sessions"

    profile_id: Mapped[str] = mapped_column(ForeignKey("creator_profiles.id"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # TrainingKind
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # resulting voice/photo id
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    profile: Mapped[CreatorProfile] = relationship(back_populates="training_sessions")


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "projects"

    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    niche: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    audience: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    creator_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("creator_profiles.id"), nullable=True
    )

    owner: Mapped[User] = relationship(back_populates="projects")
    creator_profile: Mapped[CreatorProfile | None] = relationship()
    jobs: Mapped[list["VideoJob"]] = relationship(back_populates="project", order_by="desc(VideoJob.created_at)")


class VideoJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "video_jobs"

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=JobStatus.QUEUED.value, index=True, nullable=False)
    current_agent: Mapped[str | None] = mapped_column(String(30), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    project: Mapped[Project] = relationship(back_populates="jobs")
    runs: Mapped[list["AgentRun"]] = relationship(back_populates="job", order_by="AgentRun.started_at")
    assets: Mapped[list["Asset"]] = relationship(back_populates="job")
    script_versions: Mapped[list["ScriptVersion"]] = relationship(back_populates="job", order_by="ScriptVersion.version")


class AgentRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "agent_runs"

    job_id: Mapped[str] = mapped_column(ForeignKey("video_jobs.id"), index=True, nullable=False)
    agent_name: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=AgentRunStatus.PENDING.value, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[VideoJob] = relationship(back_populates="runs")


class AgentRunEvent(Base):
    __tablename__ = "agent_run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("video_jobs.id"), index=True, nullable=False)
    agent_name: Mapped[str | None] = mapped_column(String(30), nullable=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ScriptVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "script_versions"
    __table_args__ = (UniqueConstraint("job_id", "version", name="uq_script_job_version"),)

    job_id: Mapped[str] = mapped_column(ForeignKey("video_jobs.id"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="agent", nullable=False)  # agent | review | user

    job: Mapped[VideoJob] = relationship(back_populates="script_versions")


class Prompt(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "prompts"
    __table_args__ = (UniqueConstraint("agent_name", "version", name="uq_prompt_agent_version"),)

    agent_name: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)


class Asset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "assets"

    job_id: Mapped[str] = mapped_column(ForeignKey("video_jobs.id"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    media_type: Mapped[str] = mapped_column(String(100), nullable=False)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    job: Mapped[VideoJob] = relationship(back_populates="assets")


ASSET_MEDIA_TYPES: dict[AssetKind, str] = {
    AssetKind.AUDIO: "audio/wav",
    AssetKind.VIDEO: "video/mp4",
    AssetKind.AVATAR_VIDEO: "video/mp4",
    AssetKind.THUMBNAIL: "image/png",
    AssetKind.CAPTIONS: "application/x-subrip",
    AssetKind.SCRIPT: "application/json",
}
