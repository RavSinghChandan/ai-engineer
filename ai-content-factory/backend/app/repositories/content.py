"""Content-production context repositories: projects, jobs, runs, scripts, assets, events."""
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.db.models import AgentRun, AgentRunEvent, Asset, Project, ScriptVersion, VideoJob
from app.domain.enums import AgentRunStatus, AssetKind, EventType
from app.db.models import ASSET_MEDIA_TYPES
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    async def list_for_owner(self, owner_id: str) -> list[Project]:
        return await self.list_where(Project.owner_id == owner_id, order_by=Project.created_at.desc())


class VideoJobRepository(BaseRepository[VideoJob]):
    model = VideoJob

    async def get_with_details(self, job_id: str) -> VideoJob | None:
        stmt = (
            select(VideoJob)
            .where(VideoJob.id == job_id)
            .options(
                selectinload(VideoJob.runs),
                selectinload(VideoJob.assets),
                selectinload(VideoJob.script_versions),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: str) -> list[VideoJob]:
        return await self.list_where(VideoJob.project_id == project_id, order_by=VideoJob.created_at.desc())


class AgentRunRepository(BaseRepository[AgentRun]):
    model = AgentRun

    async def start(self, job_id: str, agent_name: str) -> AgentRun:
        run = AgentRun(
            job_id=job_id,
            agent_name=agent_name,
            status=AgentRunStatus.RUNNING.value,
            started_at=datetime.now(UTC),
        )
        return await self.add(run)

    async def finish(self, run: AgentRun, output: dict[str, Any] | None = None, error: str | None = None) -> None:
        run.finished_at = datetime.now(UTC)
        if run.started_at is not None:
            started = run.started_at if run.started_at.tzinfo else run.started_at.replace(tzinfo=UTC)
            run.duration_seconds = (run.finished_at - started).total_seconds()
        run.status = AgentRunStatus.FAILED.value if error else AgentRunStatus.COMPLETED.value
        run.output = output
        run.error = error
        await self.session.flush()


class EventRepository(BaseRepository[AgentRunEvent]):
    model = AgentRunEvent

    async def append(
        self,
        job_id: str,
        event_type: EventType,
        message: str,
        agent_name: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> AgentRunEvent:
        event = AgentRunEvent(
            job_id=job_id,
            agent_name=agent_name,
            event_type=event_type.value,
            message=message,
            payload=payload,
            created_at=datetime.now(UTC),
        )
        return await self.add(event)

    async def replay(self, job_id: str, after_id: int = 0) -> list[AgentRunEvent]:
        return await self.list_where(
            AgentRunEvent.job_id == job_id,
            AgentRunEvent.id > after_id,
            order_by=AgentRunEvent.id,
        )


class ScriptRepository(BaseRepository[ScriptVersion]):
    model = ScriptVersion

    async def add_version(self, job_id: str, content: dict[str, Any], source: str) -> ScriptVersion:
        result = await self.session.execute(
            select(func.coalesce(func.max(ScriptVersion.version), 0)).where(ScriptVersion.job_id == job_id)
        )
        next_version = int(result.scalar_one()) + 1
        return await self.add(ScriptVersion(job_id=job_id, version=next_version, content=content, source=source))

    async def latest(self, job_id: str) -> ScriptVersion | None:
        rows = await self.list_where(
            ScriptVersion.job_id == job_id, order_by=ScriptVersion.version.desc(), limit=1
        )
        return rows[0] if rows else None

    async def latest_user_script(self, job_id: str) -> ScriptVersion | None:
        rows = await self.list_where(
            ScriptVersion.job_id == job_id,
            ScriptVersion.source == "user",
            order_by=ScriptVersion.version.desc(),
            limit=1,
        )
        return rows[0] if rows else None


class AssetRepository(BaseRepository[Asset]):
    model = Asset

    async def register(
        self, job_id: str, kind: AssetKind, path: str, meta: dict[str, Any] | None = None
    ) -> Asset:
        return await self.add(
            Asset(job_id=job_id, kind=kind.value, path=path, media_type=ASSET_MEDIA_TYPES[kind], meta=meta)
        )

    async def for_job(self, job_id: str) -> list[Asset]:
        return await self.list_where(Asset.job_id == job_id, order_by=Asset.created_at)
