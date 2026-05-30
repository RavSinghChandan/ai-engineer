import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from extractor.pdf_extractor import extract_pdf_bytes
from graph.pipeline import extraction_pipeline
from database.runbooks_store import (
    save_runbook, create_ingest_job, update_ingest_job, get_ingest_job
)
from database.graph_store import build_and_save_graph
from database.db import init_db

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/upload")
async def upload_runbook(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Upload a runbook PDF.
    Returns a job_id immediately. Poll /ingest/job/{job_id} for status.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20MB")

    job_id = create_ingest_job(file.filename)
    background_tasks.add_task(_process_pdf, job_id, file.filename, content)

    return {
        "job_id": job_id,
        "status": "pending",
        "message": f"PDF '{file.filename}' queued for processing. Poll /ingest/job/{job_id}",
    }


@router.get("/job/{job_id}")
def get_job_status(job_id: int):
    """Poll the status of an ingest job."""
    job = get_ingest_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _process_pdf(job_id: int, filename: str, content: bytes) -> None:
    """Background task: extract → structure → persist."""
    try:
        update_ingest_job(job_id, status="processing")

        # Step 1: Extract raw text from PDF
        doc = extract_pdf_bytes(filename, content)

        # Step 2: Run LangGraph extraction pipeline
        state = extraction_pipeline.invoke({
            "filename": filename,
            "raw_text": doc.full_text,
            "tables": [],
            "agent_log": [],
        })

        # Step 3: Persist to database
        if state.get("extraction_error") and not state.get("steps"):
            update_ingest_job(
                job_id,
                status="failed",
                error=state.get("extraction_error", "unknown error"),
                agent_log=state.get("agent_log", []),
            )
            return

        runbook_id = save_runbook(state, filename, doc.total_pages)

        # Step 4: Build dependency graph automatically
        try:
            build_and_save_graph(runbook_id)
            state["agent_log"] = state.get("agent_log", []) + ["graph_builder: dependency graph built"]
        except Exception as graph_exc:
            state["agent_log"] = state.get("agent_log", []) + [f"graph_builder: warning — {graph_exc}"]

        update_ingest_job(
            job_id,
            status="completed",
            runbook_id=runbook_id,
            agent_log=state.get("agent_log", []),
        )

    except Exception as exc:
        update_ingest_job(job_id, status="failed", error=str(exc))
