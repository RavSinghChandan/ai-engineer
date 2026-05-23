"""
Async Analysis Router (Phase 7 — Kafka)
=========================================
Two additive endpoints that decouple submission from execution.
The existing POST /api/v1/analysis/run is NEVER touched.

POST /api/v1/analysis/submit
  Accepts the same AnalysisRequest body as /run.
  Publishes to Kafka (or runs inline if Kafka is off).
  Returns immediately with { job_id, status: "queued" }.

GET /api/v1/analysis/job/{job_id}
  Poll for job status + result.
  Returns { job_id, status, result } where status is:
    queued | processing | done | failed

Client flow (Angular):
  1. POST /submit  → get job_id
  2. Poll GET /job/{id} every 2s until status == "done"
  3. Use result exactly like a /run response

When KAFKA_ENABLED=false (default):
  /submit still works — pipeline runs in a background thread.
  Client polls /job/{id} the same way.
  This makes the async pattern testable without Kafka installed.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from schemas import AnalysisRequest
from auth.models import TenantContext
from auth.rbac import Permission, can
from guardrails.production import rate_limiter
from pipeline_queue.job_store import create_job, get_job, stats as job_stats
from pipeline_queue.producer import publish, KAFKA_ENABLED

router = APIRouter(prefix="/api/v1/analysis", tags=["Async Analysis"])


@router.post("/submit")
async def submit_analysis(
    req: AnalysisRequest,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    """
    Submit an analysis job asynchronously.
    Returns job_id immediately — poll /job/{id} for the result.
    Same auth and rate-limiting as /run.
    """
    rate_key = getattr(req, "user_id", None) or ctx.tenant_id
    allowed, reason = rate_limiter.is_allowed(rate_key)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    payload = {
        **req.model_dump(),
        "tenant_id": ctx.tenant_id,
    }

    job_id = create_job(payload)
    via_kafka = publish(job_id, payload)

    return JSONResponse(content={
        "job_id":      job_id,
        "status":      "queued",
        "via_kafka":   via_kafka,
        "poll_url":    f"/api/v1/analysis/job/{job_id}",
        "note":        "Poll poll_url every 2s until status == 'done'",
    })


@router.get("/job/{job_id}")
async def get_job_status(
    job_id: str,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    """
    Poll job status. Returns full result when status == 'done'.
    """
    job = get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_id}' not found or expired.",
        )
    return JSONResponse(content={
        "job_id":     job["job_id"],
        "status":     job["status"],
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "result":     job["result"] if job["status"] == "done" else None,
        "error":      job["error"]  if job["status"] == "failed" else None,
    })


@router.get("/jobs/stats")
async def get_jobs_stats(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """Job queue stats for the metrics dashboard. ADMIN+ only."""
    return JSONResponse(content={
        **job_stats(),
        "kafka_enabled": KAFKA_ENABLED,
    })
