"""Project endpoints."""
from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, NotFoundError
from app.db.models import Project, VideoJob
from app.repositories.content import ProjectRepository, VideoJobRepository
from app.schemas.content import JobCreate, JobOut, ProjectCreate, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


async def get_owned_project(session, user, project_id: str) -> Project:
    project = await ProjectRepository(session).get(project_id)
    if project is None:
        raise NotFoundError("Project not found")
    if project.owner_id != user.id:
        raise ForbiddenError("Not your project")
    return project


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, session: DbSession, user: CurrentUser) -> ProjectOut:
    project = await ProjectRepository(session).add(
        Project(
            owner_id=user.id,
            name=body.name,
            niche=body.niche,
            audience=body.audience,
            description=body.description,
            creator_profile_id=body.creator_profile_id,
        )
    )
    return ProjectOut.model_validate(project)


@router.get("", response_model=list[ProjectOut])
async def list_projects(session: DbSession, user: CurrentUser) -> list[ProjectOut]:
    projects = await ProjectRepository(session).list_for_owner(user.id)
    return [ProjectOut.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, session: DbSession, user: CurrentUser) -> ProjectOut:
    return ProjectOut.model_validate(await get_owned_project(session, user, project_id))


@router.post("/{project_id}/jobs", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(project_id: str, body: JobCreate, session: DbSession, user: CurrentUser) -> JobOut:
    await get_owned_project(session, user, project_id)
    job = await VideoJobRepository(session).add(
        VideoJob(
            project_id=project_id,
            topic=body.topic,
            thumbnail_instructions=body.thumbnail_instructions.strip(),
        )
    )
    if body.script_text.strip():
        # Creator's own script: stored verbatim; the pipeline will start at script-intake.
        from app.repositories.content import ScriptRepository

        await ScriptRepository(session).add_version(
            job.id, {"raw_text": body.script_text.strip()}, source="user"
        )
    return JobOut.model_validate(job)


@router.get("/{project_id}/jobs", response_model=list[JobOut])
async def list_jobs(project_id: str, session: DbSession, user: CurrentUser) -> list[JobOut]:
    await get_owned_project(session, user, project_id)
    jobs = await VideoJobRepository(session).list_for_project(project_id)
    return [JobOut.model_validate(j) for j in jobs]
