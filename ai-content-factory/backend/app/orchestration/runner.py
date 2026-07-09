"""Pipeline runner — executes the LangGraph pipeline for a job.

Responsibilities around each agent node:
  * persist AgentRun rows (status, duration, output)
  * persist domain artifacts (script versions, media assets)
  * persist + broadcast real-time events (DB + in-process broker)
  * fail the job cleanly on any agent error

Each DB touch uses its own short transaction so events become visible to
the WebSocket replay immediately (and SQLite locks stay short).
"""
import asyncio
from typing import Any

from app.agents.base import AgentContext, CreatorProfileData, PromptData
from app.agents.registry import agent_registry
from app.core.config import get_settings
from app.core.container import (
    build_avatar_provider,
    build_tts,
    get_composer,
    get_models,
    get_thumbnail_renderer,
    get_vector_store,
)
from app.core.logging import get_logger
from app.db.session import session_scope
from app.domain.enums import AgentName, AssetKind, EventType, JobStatus
from app.orchestration.events import job_event_broker
from app.orchestration.graph import build_pipeline_graph
from app.orchestration.state import PipelineState
from app.repositories.content import AgentRunRepository, AssetRepository, EventRepository, ScriptRepository, VideoJobRepository
from app.repositories.prompts import PromptRepository

logger = get_logger(__name__)

_ASSET_PRODUCERS: dict[AgentName, list[tuple[str, str, AssetKind]]] = {
    # agent → [(state_key, dict_key, asset_kind)]
    AgentName.VOICE: [("voice", "audio_path", AssetKind.AUDIO)],
    AgentName.AVATAR: [("avatar", "video_path", AssetKind.AVATAR_VIDEO)],
    AgentName.THUMBNAIL: [("thumbnail", "path", AssetKind.THUMBNAIL)],
    AgentName.VIDEO: [("video", "video_path", AssetKind.VIDEO), ("video", "srt_path", AssetKind.CAPTIONS)],
}


class PipelineRunner:
    """One instance per process; one asyncio task per running job."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def is_running(self, job_id: str) -> bool:
        task = self._tasks.get(job_id)
        return task is not None and not task.done()

    def start(self, job_id: str) -> None:
        if self.is_running(job_id):
            return
        task = asyncio.create_task(self._execute(job_id), name=f"pipeline-{job_id}")
        self._tasks[job_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(job_id, None))

    async def _emit(
        self,
        job_id: str,
        event_type: EventType,
        message: str,
        agent_name: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        async with session_scope() as session:
            event = await EventRepository(session).append(job_id, event_type, message, agent_name, payload)
            event_dict = {
                "id": event.id,
                "job_id": job_id,
                "agent": agent_name,
                "type": event_type.value,
                "message": message,
                "payload": payload,
                "created_at": event.created_at.isoformat(),
            }
        await job_event_broker.publish(job_id, event_dict)

    async def _set_job(self, job_id: str, **fields: Any) -> None:
        async with session_scope() as session:
            job = await VideoJobRepository(session).get_or_raise(job_id)
            for key, value in fields.items():
                setattr(job, key, value)

    async def _load_prompts(self) -> dict[str, PromptData]:
        async with session_scope() as session:
            repo = PromptRepository(session)
            prompts: dict[str, PromptData] = {}
            for prompt in await repo.list_all():
                if prompt.is_active:
                    prompts[prompt.agent_name] = PromptData(
                        system_prompt=prompt.system_prompt,
                        user_template=prompt.user_template,
                        version=prompt.version,
                    )
            return prompts

    def _make_node(self, agent_name: AgentName, ctx: AgentContext):
        agent = agent_registry.get(agent_name)

        async def node(state: PipelineState) -> dict[str, Any]:
            job_id = ctx.job_id
            ctx.current_agent = agent_name.value
            await self._set_job(job_id, current_agent=agent_name.value)
            async with session_scope() as session:
                run = await AgentRunRepository(session).start(job_id, agent_name.value)
                run_id = run.id
            await self._emit(job_id, EventType.AGENT_STARTED, f"{agent_name.value} agent started", agent_name.value)
            try:
                update = await agent.run(dict(state), ctx)
            except Exception as exc:
                async with session_scope() as session:
                    repo = AgentRunRepository(session)
                    run = await repo.get_or_raise(run_id)
                    await repo.finish(run, error=str(exc))
                await self._emit(
                    job_id, EventType.AGENT_FAILED, f"{agent_name.value} failed: {exc}", agent_name.value
                )
                raise

            await self._persist_artifacts(job_id, agent_name, update)
            async with session_scope() as session:
                repo = AgentRunRepository(session)
                run = await repo.get_or_raise(run_id)
                await repo.finish(run, output=update.get(agent_name.value) or next(iter(update.values()), None))
            await self._emit(
                job_id, EventType.AGENT_COMPLETED, f"{agent_name.value} agent completed", agent_name.value
            )
            return update

        return node

    async def _persist_artifacts(self, job_id: str, agent_name: AgentName, update: dict[str, Any]) -> None:
        if agent_name in (AgentName.SCRIPT, AgentName.SCRIPT_INTAKE) and "script" in update:
            async with session_scope() as session:
                await ScriptRepository(session).add_version(job_id, update["script"], source="agent")
        for state_key, dict_key, kind in _ASSET_PRODUCERS.get(agent_name, []):
            path = (update.get(state_key) or {}).get(dict_key)
            if path:
                async with session_scope() as session:
                    await AssetRepository(session).register(job_id, kind, path)

    async def _execute(self, job_id: str) -> None:
        try:
            await self._execute_pipeline(job_id)
        except Exception as exc:  # last-resort guard: never leave a job stuck in RUNNING
            logger.exception("pipeline_crashed", job_id=job_id)
            await self._set_job(job_id, status=JobStatus.FAILED.value, error=str(exc), current_agent=None)
            await self._emit(job_id, EventType.JOB_FAILED, f"Pipeline crashed: {exc}")

    async def _execute_pipeline(self, job_id: str) -> None:
        settings = get_settings()
        from app.repositories.content import ProjectRepository
        from app.repositories.profiles import CreatorProfileRepository

        async with session_scope() as session:
            job = await VideoJobRepository(session).get_or_raise(job_id)
            topic, project_id = job.topic, job.project_id
        async with session_scope() as session:
            project = await ProjectRepository(session).get_or_raise(project_id)
            niche, audience = project.niche, project.audience
            profile = await CreatorProfileRepository(session).resolve_for_project(project)

        profile_data = (
            CreatorProfileData(
                profile_id=profile.id,
                name=profile.name,
                voice_provider=profile.voice_provider,
                voice_id=profile.voice_id,
                avatar_provider=profile.avatar_provider,
                avatar_id=profile.avatar_id,
                avatar_required=profile.avatar_required,
                photo_path=profile.photo_path,
            )
            if profile
            else CreatorProfileData()
        )

        # Creator-provided script (source="user") switches the graph to the intake path.
        async with session_scope() as session:
            user_script = await ScriptRepository(session).latest_user_script(job_id)
            user_script_text = (user_script.content or {}).get("raw_text", "") if user_script else ""
        async with session_scope() as session:
            job = await VideoJobRepository(session).get_or_raise(job_id)
            thumbnail_instructions = job.thumbnail_instructions or ""

        job_dir = settings.media_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        ctx = AgentContext(
            job_id=job_id,
            settings=settings,
            models=get_models(),
            tts=build_tts(profile_data.voice_provider, profile_data.voice_id),
            vector=get_vector_store(),
            thumbnails=get_thumbnail_renderer(),
            composer=get_composer(),
            prompts=await self._load_prompts(),
            job_dir=job_dir,
            profile=profile_data,
            avatar=build_avatar_provider(profile_data.avatar_provider),
        )
        ctx.emit = lambda event_type, message, payload: self._emit(
            job_id, event_type, message, ctx.current_agent, payload
        )

        graph = build_pipeline_graph(lambda name: self._make_node(name, ctx))
        initial: PipelineState = {
            "job_id": job_id,
            "project_id": project_id,
            "topic": topic,
            "niche": niche,
            "audience": audience,
            "user_script_text": user_script_text,
            "thumbnail_instructions": thumbnail_instructions,
        }

        await self._set_job(job_id, status=JobStatus.RUNNING.value, error=None)
        await self._emit(job_id, EventType.JOB_STARTED, f"Pipeline started for topic: {topic}")
        try:
            final_state = await graph.ainvoke(initial, config={"recursion_limit": 50})
        except Exception as exc:
            logger.exception("pipeline_failed", job_id=job_id)
            await self._set_job(job_id, status=JobStatus.FAILED.value, error=str(exc), current_agent=None)
            await self._emit(job_id, EventType.JOB_FAILED, f"Pipeline failed: {exc}")
            return

        result = {
            "title": final_state.get("seo", {}).get("best_title"),
            "score": final_state.get("review", {}).get("score"),
            "duration_seconds": final_state.get("voice", {}).get("duration_seconds"),
            "metadata": final_state.get("metadata"),
            "seo": final_state.get("seo"),
        }
        await self._set_job(
            job_id, status=JobStatus.AWAITING_APPROVAL.value, current_agent=None, result=result
        )
        await self._emit(
            job_id, EventType.JOB_COMPLETED, "Pipeline finished — video ready for review", payload=result
        )


pipeline_runner = PipelineRunner()
