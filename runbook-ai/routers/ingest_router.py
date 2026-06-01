import logging
from typing import Annotated, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from extractor.pdf_extractor import extract_pdf_bytes
from graph.pipeline import extraction_pipeline
from database.runbooks_store import (
    save_runbook, create_ingest_job, update_ingest_job, get_ingest_job
)
from database.graph_store import build_and_save_graph
from routers.deps import require_role, optional_auth, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

_PDF_MAGIC = b"%PDF"

EditorUser = Annotated[CurrentUser, Depends(require_role("editor"))]
OptionalUser = Annotated[Optional[CurrentUser], Depends(optional_auth)]


@router.post(
    "/upload",
    status_code=202,
    responses={
        400: {"description": "Not a PDF or invalid file"},
        401: {"description": "Not authenticated"},
        403: {"description": "Requires editor role or higher"},
        413: {"description": "File exceeds 20MB limit"},
    },
)
async def upload_runbook(
    background_tasks: BackgroundTasks,
    current_user: EditorUser,
    file: UploadFile = File(...),
):
    """
    Upload a runbook PDF. Requires editor or admin role.
    Returns a job_id immediately. Poll /ingest/job/{job_id} for status.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20MB")

    # Validate PDF magic bytes — extension alone can be spoofed
    if not content.startswith(_PDF_MAGIC):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF")

    job_id = create_ingest_job(file.filename, tenant_id=current_user.tenant_id)
    background_tasks.add_task(
        _process_pdf, job_id, file.filename, content, current_user.tenant_id
    )

    return {
        "job_id": job_id,
        "status": "pending",
        "message": f"PDF '{file.filename}' queued for processing. Poll /ingest/job/{job_id}",
    }


@router.get(
    "/job/{job_id}",
    responses={404: {"description": "Job not found"}},
)
def get_job_status(job_id: int, current_user: OptionalUser):
    """Poll the status of an ingest job. Tenant-scoped when authenticated."""
    job = get_ingest_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Tenant isolation — authenticated users can only see their own tenant's jobs
    if current_user and job.get("tenant_id") and job["tenant_id"] != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _process_pdf(job_id: int, filename: str, content: bytes, tenant_id: Optional[int]) -> None:
    """Background task: extract → structure → persist."""
    try:
        update_ingest_job(job_id, status="processing")

        doc = extract_pdf_bytes(filename, content)

        state = extraction_pipeline.invoke({
            "filename": filename,
            "raw_text": doc.full_text,
            "tables": [],
            "agent_log": [],
        })

        if state.get("extraction_error") and not state.get("steps"):
            _safe_fail(job_id, state.get("extraction_error", "unknown error"), state.get("agent_log", []))
            return

        runbook_id = save_runbook(state, filename, doc.total_pages, tenant_id=tenant_id)

        try:
            build_and_save_graph(runbook_id)
            state["agent_log"] = state.get("agent_log", []) + ["graph_builder: dependency graph built"]
        except Exception as graph_exc:
            logger.warning("Graph build failed for job %d: %s", job_id, graph_exc)
            state["agent_log"] = state.get("agent_log", []) + [f"graph_builder: warning — {graph_exc}"]

        _safe_complete(job_id, runbook_id, state.get("agent_log", []))

    except Exception as exc:
        logger.exception("PDF processing failed for job %d", job_id)
        _safe_fail(job_id, str(exc))


def _safe_fail(job_id: int, error: str, agent_log: Optional[list] = None) -> None:
    """Mark job failed — catches DB errors so status is never silently lost."""
    try:
        update_ingest_job(job_id, status="failed", error=error, agent_log=agent_log or [])
    except Exception:
        logger.exception("Failed to mark job %d as failed", job_id)


def _safe_complete(job_id: int, runbook_id: int, agent_log: list) -> None:
    """Mark job completed — catches DB errors so status is never silently lost."""
    try:
        update_ingest_job(job_id, status="completed", runbook_id=runbook_id, agent_log=agent_log)
    except Exception:
        logger.exception("Failed to mark job %d as completed", job_id)
