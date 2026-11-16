"""
FastAPI router for the AgentBusinessMetrics dashboard.

    GET  /business-metrics?days=30            the five metrics, daily trend, recent recommendations
    POST /allocations/{rec_id}/decision       { decision: accepted | modified | rejected, note }
    POST /allocations/{rec_id}/outcome        { outcome: success | failed, note }
    POST /allocations/manual                  { candidate_id, target_role, minutes, note }
                                              an allocation made by hand, for the manual baseline

A decision is the staffing call the permission matrix reserves for a human
(hr_admin → deployment_decision); it is also recorded as the review step of the
role-mapping task in the FDE ledger.
"""
from __future__ import annotations

import time
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from business_metrics import metrics, store
from fde import ledger as fde_ledger, permissions as fde_perm


class DecisionRequest(BaseModel):
    decision: Literal["accepted", "modified", "rejected"]
    note: str = Field("", max_length=500)


class OutcomeRequest(BaseModel):
    outcome: Literal["success", "failed"]
    note: str = Field("", max_length=500)


class ManualAllocationRequest(BaseModel):
    candidate_id: str = Field(..., min_length=1, max_length=100)
    target_role: str = Field(..., min_length=1, max_length=200)
    minutes: float = Field(..., gt=0, le=60 * 24 * 60, description="Time the allocation took by hand")
    note: str = Field("", max_length=500)


def _who(claims: Any) -> str:
    return getattr(claims, "sub", "") or "unknown"


def build_router(auth_dependency: Callable) -> APIRouter:
    router = APIRouter(tags=["Business Metrics"])

    @router.get("/business-metrics")
    async def business_metrics(days: int = Query(30, ge=1, le=365), claims: Any = Depends(auth_dependency)):
        return metrics.summary(days)

    @router.post("/allocations/{rec_id}/decision")
    async def decide(rec_id: str, req: DecisionRequest, claims: Any = Depends(auth_dependency)):
        fde_perm.authorize("hr_admin", "write", "deployment_decision")
        try:
            rec = store.decide(rec_id, req.decision, by=_who(claims), note=req.note)
        except store.NotFound:
            raise HTTPException(404, "Recommendation not found.")
        except store.InvalidTransition as exc:
            raise HTTPException(409, str(exc))
        if rec["task_id"]:
            fde_ledger.record_review(rec["task_id"], approved=int(req.decision != "rejected"),
                                     rejected=int(req.decision == "rejected"),
                                     edited=int(req.decision == "modified"),
                                     reviewed_at=rec["decided_at"])
        return rec

    @router.post("/allocations/{rec_id}/outcome")
    async def outcome(rec_id: str, req: OutcomeRequest, claims: Any = Depends(auth_dependency)):
        try:
            return store.record_outcome(rec_id, req.outcome, note=req.note)
        except store.NotFound:
            raise HTTPException(404, "Recommendation not found.")
        except store.InvalidTransition as exc:
            raise HTTPException(409, str(exc))

    @router.post("/allocations/manual", status_code=201)
    async def manual(req: ManualAllocationRequest, claims: Any = Depends(auth_dependency)):
        fde_perm.authorize("hr_admin", "write", "deployment_decision")
        now = time.time()
        rec_id = store.create_manual(candidate_id=req.candidate_id, target_role=req.target_role,
                                     started_at=now - req.minutes * 60, allocated_at=now,
                                     by=_who(claims), note=req.note)
        return store.get(rec_id)

    return router
