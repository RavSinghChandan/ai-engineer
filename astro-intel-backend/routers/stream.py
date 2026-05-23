"""
SSE Streaming Router (Phase 5)
================================
GET /api/v1/stream/{session_id}

Streams pipeline progress events as Server-Sent Events (SSE) to the
Angular frontend. The frontend opens an EventSource connection before
calling /run, then receives real-time node progress until pipeline_done.

SSE wire format (text/event-stream):
  event: node_start
  data: {"node": "question_agent", "ts": 1716123456.78}

  event: node_done
  data: {"node": "domain_agents", "duration_ms": 8432, "ts": ...}

  event: pipeline_done
  data: {"session_id": "...", "ts": ...}

Auth: same JWT bearer token as all other endpoints (ANALYSIS__RUN permission).
Timeout: 120 seconds — pipeline should complete well within this window.
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from utils.event_bus import subscribe, unsubscribe
from auth.dependencies import get_tenant_ctx
from auth.models import TenantContext
from auth.rbac import Permission, can

router = APIRouter(prefix="/api/v1/stream", tags=["Streaming"])

_SSE_TIMEOUT_SECONDS = 120
_HEARTBEAT_INTERVAL  = 15   # send a comment every N seconds to keep connection alive


async def _event_generator(session_id: str) -> AsyncGenerator[str, None]:
    """
    Yield SSE-formatted strings until pipeline_done / pipeline_error
    or the timeout is reached.
    """
    q = subscribe(session_id)
    deadline = time.time() + _SSE_TIMEOUT_SECONDS
    last_heartbeat = time.time()

    try:
        while True:
            now = time.time()
            if now >= deadline:
                yield ": timeout\n\n"
                break

            # Send heartbeat comment to keep connection alive
            if now - last_heartbeat >= _HEARTBEAT_INTERVAL:
                yield ": heartbeat\n\n"
                last_heartbeat = now

            try:
                envelope = await asyncio.wait_for(q.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            event_type = envelope.get("event", "message")
            data_str   = json.dumps(envelope.get("data", {}))

            yield f"event: {event_type}\n"
            yield f"data: {data_str}\n\n"

            # Terminal events — close stream
            if event_type in ("pipeline_done", "pipeline_error"):
                break
    finally:
        unsubscribe(session_id)


@router.get("/{session_id}")
async def stream_pipeline(
    session_id: str,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> StreamingResponse:
    """
    Stream pipeline progress events for the given session_id.
    Open this connection BEFORE calling POST /api/v1/analysis/run.
    """
    return StreamingResponse(
        _event_generator(session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
            "Connection":       "keep-alive",
        },
    )
