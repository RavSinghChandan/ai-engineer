"""Asset file serving — streams media produced by the pipeline."""
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, NotFoundError
from app.repositories.content import AssetRepository, VideoJobRepository

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{asset_id}")
async def download_asset(asset_id: str, session: DbSession, user: CurrentUser) -> FileResponse:
    asset = await AssetRepository(session).get(asset_id)
    if asset is None:
        raise NotFoundError("Asset not found")
    job = await VideoJobRepository(session).get_or_raise(asset.job_id)
    project = await job.awaitable_attrs.project
    if project.owner_id != user.id:
        raise ForbiddenError("Not your asset")
    path = Path(asset.path)
    if not path.exists():
        raise NotFoundError("Asset file missing on disk")
    return FileResponse(path, media_type=asset.media_type, filename=path.name)
