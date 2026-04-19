"""
Step 10 — Human-in-the-Loop (HITL) Routes

POST /api/v1/security/hitl/submit              → submit loan for officer review
POST /api/v1/security/hitl/{id}/decide         → officer approves or rejects

Flow:
  1. Customer (or system) POSTs to /submit → graph pauses, returns PENDING_HUMAN_REVIEW
  2. Officer POSTs to /{id}/decide         → graph resumes, returns final verdict

Requires JWT Bearer token on all endpoints.
/decide requires officer role or higher.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.security.rbac import Role, require_role
from app.graphs.human_in_loop import submit_for_review, resume_with_decision
from app.schemas.security import (
    HILSubmitRequest,
    HILSubmitResponse,
    HILDecisionRequest,
    HILDecisionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/security", tags=["Security"])


@router.post(
    "/hitl/submit",
    response_model=HILSubmitResponse,
    summary="Submit loan for human review",
    description=(
        "Starts a **LangGraph interrupt workflow**.\n\n"
        "The graph runs `analyze_request` (risk classification) then **pauses** "
        "before `human_review`. Application remains in `PENDING_HUMAN_REVIEW` "
        "state until an officer calls `POST /hitl/{id}/decide`.\n\n"
        "**Risk tiers:** LOW (<$100k), MEDIUM ($100k–$500k), HIGH (>$500k)"
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "High-risk loan": {
                            "summary": ">$500k → HIGH risk tier",
                            "value": {"application_id": "APP-2024-001", "loan_amount": 750000, "applicant_name": "Alice Johnson"},
                        },
                        "Medium-risk loan": {
                            "summary": "$100k–$500k → MEDIUM risk tier",
                            "value": {"application_id": "APP-2024-002", "loan_amount": 250000, "applicant_name": "Bob Smith"},
                        },
                    }
                }
            }
        }
    },
)
async def submit_for_human_review(
    request: HILSubmitRequest,
    current_user: dict = Depends(require_role(Role.CUSTOMER)),
):
    try:
        result = submit_for_review(
            application_id=request.application_id,
            loan_amount=request.loan_amount,
            applicant_name=request.applicant_name,
        )
        logger.info("[HITL] Submitted | app=%s by=%s", request.application_id, current_user["username"])
        return HILSubmitResponse(
            application_id=request.application_id,
            status=result["status"],
            risk_level=result["risk_level"],
        )
    except Exception as exc:
        logger.exception("[HITL] Submit failed | app=%s", request.application_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post(
    "/hitl/{application_id}/decide",
    response_model=HILDecisionResponse,
    summary="Officer decision on pending loan",
    description=(
        "**Resumes the paused LangGraph** for the given application.\n\n"
        "Injects `human_decision` and `human_approver` into the graph state, "
        "then runs `finalize_approval` or `reject_by_human` to completion.\n\n"
        "**Auth required:** officer role or higher  \n"
        "**Decision values:** `approved` | `rejected`"
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Approve": {
                            "summary": "Officer approves the loan",
                            "value": {"decision": "approved", "notes": "All documents verified"},
                        },
                        "Reject": {
                            "summary": "Officer rejects the loan",
                            "value": {"decision": "rejected", "notes": "Insufficient collateral for amount requested"},
                        },
                    }
                }
            }
        }
    },
)
async def make_human_decision(
    application_id: str,
    request: HILDecisionRequest,
    current_user: dict = Depends(require_role(Role.OFFICER)),
):
    if request.decision not in ("approved", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="Decision must be 'approved' or 'rejected'",
        )
    try:
        result = resume_with_decision(
            application_id=application_id,
            decision=request.decision,
            approver=current_user["username"],
            notes=request.notes,
        )
        logger.info(
            "[HITL] Decided | app=%s decision=%s by=%s",
            application_id, request.decision, current_user["username"],
        )
        return HILDecisionResponse(**result)
    except Exception as exc:
        logger.exception("[HITL] Decision failed | app=%s", application_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
