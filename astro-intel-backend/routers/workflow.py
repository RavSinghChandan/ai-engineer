"""
Durable Workflow Router
=========================
The 360° pipeline as a durable task: checkpointed after every agent step, resumed
after a crash, optionally paused for a human approval before delivery.

POST /api/v1/workflow/tasks
  Same AnalysisRequest body as /analysis/run, plus ?require_approval=true.
  Send an Idempotency-Key header: repeating the request with the same key returns the
  original task instead of starting a second run (409 if the body differs).

GET  /api/v1/workflow/tasks/{task_id}
  { status, current_step, attempts, steps[], effects[], checkpoints, result, error }
  status: PENDING | RUNNING | WAITING_FOR_APPROVAL | COMPLETED | FAILED

POST /api/v1/workflow/tasks/{task_id}/approve
POST /api/v1/workflow/tasks/{task_id}/reject      body: { "reason": "..." }
  Resume a WAITING_FOR_APPROVAL task. 409 when the task is not waiting.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from schemas import AnalysisRequest
from auth.models import Role, TenantContext
from auth.rbac import Permission, can
from guardrails.production import rate_limiter
from workflow import runner, store

router = APIRouter(prefix="/api/v1/workflow", tags=["Durable Workflow"])


def _visible(task: Optional[dict], ctx: TenantContext) -> dict:
    if task is None or (task["tenant_id"] != ctx.tenant_id and ctx.role != Role.SUPERADMIN):
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


def _public(task: dict) -> dict:
    return {k: task.get(k) for k in (
        "task_id", "status", "current_step", "attempts", "max_attempts", "require_approval",
        "approved_by", "steps", "effects", "checkpoints", "result", "error",
        "created_at", "updated_at")}


@router.post("/tasks")
async def create_task(
    req: AnalysisRequest,
    require_approval: bool = False,
    idempotency_key: str = Header(default="", alias="Idempotency-Key", max_length=200),
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    rate_key = getattr(req, "user_id", None) or ctx.tenant_id
    allowed, reason = rate_limiter.is_allowed(rate_key)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    payload = {**req.model_dump(), "tenant_id": ctx.tenant_id}
    try:
        task, created = runner.submit(payload, idempotency_key=idempotency_key,
                                      tenant_id=ctx.tenant_id, require_approval=require_approval)
    except store.IdempotencyConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if created:
        runner.start(task["task_id"])
    return JSONResponse(status_code=202 if created else 200, content={
        "task_id":  task["task_id"],
        "status":   task["status"],
        "created":  created,
        "poll_url": f"/api/v1/workflow/tasks/{task['task_id']}",
    })


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__RUN)),
) -> JSONResponse:
    return JSONResponse(content=_public(_visible(runner.status(task_id), ctx)))


@router.post("/tasks/{task_id}/approve")
async def approve_task(
    task_id: str,
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    _visible(store.get_task(task_id), ctx)
    by = ctx.email or ctx.user_id or ctx.api_key[:8]
    task = await asyncio.get_running_loop().run_in_executor(None, runner.approve, task_id, by)
    if task is None:
        raise HTTPException(status_code=409, detail="Task is not waiting for approval.")
    return JSONResponse(content=_public(runner.status(task_id)))


@router.post("/tasks/{task_id}/reject")
async def reject_task(
    task_id: str,
    reason: str = Body(default="", embed=True, max_length=500),
    ctx: TenantContext = Depends(can(Permission.ANALYSIS__APPROVE)),
) -> JSONResponse:
    _visible(store.get_task(task_id), ctx)
    by = ctx.email or ctx.user_id or ctx.api_key[:8]
    task = await asyncio.get_running_loop().run_in_executor(None, runner.reject, task_id, by, reason)
    if task is None:
        raise HTTPException(status_code=409, detail="Task is not waiting for approval.")
    return JSONResponse(content=_public(runner.status(task_id)))
