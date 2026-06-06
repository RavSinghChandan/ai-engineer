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

POST /api/v1/analysis/submit-stream  [P5 Combined Pattern]
  Submit async job AND stream SSE progress events in one connection.
  First event: job_queued  { job_id, status: "queued" }
  Then:        node_start / node_done events (same as /stream/{session_id})
  Final:       pipeline_done or pipeline_error

Client flow (Angular):
  1. POST /submit  → get job_id
  2. Poll GET /job/{id} every 2s until status == "done"
  3. Use result exactly like a /run response

  OR for the combined P5 pattern:
  1. POST /submit-stream  → open EventSource connection
  2. Receive job_queued first, then live node events, then pipeline_done
  3. Extract result from the pipeline_done event data

When KAFKA_ENABLED=false (default):
  /submit and /submit-stream still work — pipeline runs in a background thread.
  This makes the async pattern testable without Kafka installed.
"""
from __future__ import annotations
import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from schemas import AnalysisRequest
from auth.models import TenantContext
from auth.rbac import Permission, can
from guardrails.production import rate_limiter
from pipeline_queue.job_store import create_job, get_job, stats as job_stats
from pipeline_queue.producer import publish, KAFKA_ENABLED
from utils.event_bus import subscribe, unsubscribe

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


# ── P5 Combined Pattern — submit-stream ───────────────────────────────────────

_SUBMIT_STREAM_TIMEOUT = 120
_HEARTBEAT_INTERVAL    = 15


@router.post("/submit-stream")
async def submit_and_stream(
    req: AnalysisRequest,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> StreamingResponse:
    """
    P5 — Streaming + Async combined pattern.

    Submits an async job AND streams SSE progress events in a single connection.
    Closes the gap between Part A (SSE streaming) and Part B (async job queue).

    SSE event sequence:
      event: job_queued   data: {job_id, status: "queued"}
      event: node_start   data: {node, ts}         (one per pipeline node)
      event: node_done    data: {node, duration_ms, ts}
      event: pipeline_done  data: {session_id, ts}   ← stream ends here
      event: pipeline_error data: {error, ts}         ← or here on failure

    The job_id in job_queued can also be used to poll GET /job/{id} in parallel.
    """
    rate_key = getattr(req, "user_id", None) or ctx.tenant_id
    allowed, reason = rate_limiter.is_allowed(rate_key)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    payload = {**req.model_dump(), "tenant_id": ctx.tenant_id}
    job_id = create_job(payload)

    async def event_gen():
        # First event: confirm job is queued
        yield (
            f"event: job_queued\n"
            f"data: {json.dumps({'job_id': job_id, 'status': 'queued'})}\n\n"
        )

        # Subscribe to the event bus BEFORE publishing so no events are missed
        q = subscribe(job_id)
        try:
            publish(job_id, payload)

            deadline       = time.time() + _SUBMIT_STREAM_TIMEOUT
            last_heartbeat = time.time()

            while time.time() < deadline:
                remaining = deadline - time.time()
                wait      = min(_HEARTBEAT_INTERVAL, max(0.1, remaining))
                try:
                    envelope = await asyncio.wait_for(q.get(), timeout=wait)
                    event_type = envelope.get("event", "unknown")
                    event_data = envelope.get("data", {})
                    yield (
                        f"event: {event_type}\n"
                        f"data: {json.dumps(event_data)}\n\n"
                    )
                    if event_type in ("pipeline_done", "pipeline_error"):
                        break
                except asyncio.TimeoutError:
                    now = time.time()
                    if now - last_heartbeat >= _HEARTBEAT_INTERVAL:
                        yield ": heartbeat\n\n"
                        last_heartbeat = now
        finally:
            unsubscribe(job_id)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
