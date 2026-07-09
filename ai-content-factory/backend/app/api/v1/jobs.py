"""Job lifecycle endpoints: start, inspect, events replay, approve."""
from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.db.models import VideoJob
from app.domain.enums import EventType, JobStatus
from app.orchestration.runner import pipeline_runner
from app.repositories.content import EventRepository, VideoJobRepository
from app.schemas.content import EventOut, JobDetailOut, JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])

_RESTARTABLE = {JobStatus.QUEUED.value, JobStatus.FAILED.value}


async def get_owned_job(session, user, job_id: str, with_details: bool = False) -> VideoJob:
    repo = VideoJobRepository(session)
    job = await (repo.get_with_details(job_id) if with_details else repo.get(job_id))
    if job is None:
        raise NotFoundError("Job not found")
    project = await job.awaitable_attrs.project
    if project.owner_id != user.id:
        raise ForbiddenError("Not your job")
    return job


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(job_id: str, session: DbSession, user: CurrentUser) -> JobDetailOut:
    job = await get_owned_job(session, user, job_id, with_details=True)
    return JobDetailOut.model_validate(job)


@router.post("/{job_id}/start", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_job(job_id: str, session: DbSession, user: CurrentUser) -> JobOut:
    job = await get_owned_job(session, user, job_id)
    if job.status not in _RESTARTABLE or pipeline_runner.is_running(job_id):
        raise ConflictError(f"Job is {job.status} and cannot be started")
    pipeline_runner.start(job_id)
    job.status = JobStatus.RUNNING.value
    return JobOut.model_validate(job)


@router.post("/{job_id}/approve", response_model=JobOut)
async def approve_job(job_id: str, session: DbSession, user: CurrentUser) -> JobOut:
    job = await get_owned_job(session, user, job_id)
    if job.status != JobStatus.AWAITING_APPROVAL.value:
        raise ConflictError(f"Job is {job.status}, not awaiting approval")
    job.status = JobStatus.APPROVED.value
    await EventRepository(session).append(
        job_id, EventType.JOB_APPROVED, "Video approved by owner", None, None
    )
    return JobOut.model_validate(job)


@router.get("/{job_id}/events", response_model=list[EventOut])
async def replay_events(
    job_id: str, session: DbSession, user: CurrentUser, after_id: int = 0
) -> list[EventOut]:
    await get_owned_job(session, user, job_id)
    events = await EventRepository(session).replay(job_id, after_id)
    return [
        EventOut(
            id=e.id,
            job_id=e.job_id,
            agent=e.agent_name,
            type=e.event_type,
            message=e.message,
            payload=e.payload,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]
