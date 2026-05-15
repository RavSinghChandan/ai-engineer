"""
Lead capture endpoints.

Public (authenticated):
  POST /leads            — submit a new lead
  GET  /leads/{lead_id}  — poll own lead status (ownership enforced)
  GET  /leads/{lead_id}/report — download own completed report

ADMIN+:
  GET  /admin/leads               — list all leads
  GET  /admin/leads/count-new     — badge count
  PATCH /admin/leads/{id}/status  — update status
  POST /admin/leads/{id}/attach-report — attach completed report
"""
from __future__ import annotations
import re
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from auth.models import Role, TenantContext
from auth.dependencies import get_tenant_ctx, require_role
from auth.rbac import Permission, can, check_resource_access, audit
import leads.store as store

router = APIRouter(tags=["Leads"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LeadRequest(BaseModel):
    name:               str
    email:              str
    phone:              str
    dob:                str
    consent:            bool
    place_of_birth:     str = ""
    time_of_birth:      str = ""
    alias_name:         str = ""
    question:           str = ""
    preferred_language: str = "en"

class LeadStatusUpdate(BaseModel):
    status: str
    notes:  Optional[str] = ""

class LeadOut(BaseModel):
    lead_id:            str
    name:               str
    email:              str
    phone:              str
    dob:                str
    consent:            bool
    status:             str
    created_at:         float
    updated_at:         float
    notes:              str
    report_json:        str = ""
    place_of_birth:     str = ""
    time_of_birth:      str = ""
    alias_name:         str = ""
    question:           str = ""
    tenant_id:          str = ""
    preferred_language: str = "en"

class AttachReportRequest(BaseModel):
    report_json: str


@router.post("/leads", status_code=status.HTTP_201_CREATED)
async def submit_lead(
    req: LeadRequest,
    ctx: TenantContext = Depends(can(Permission.LEAD__SUBMIT)),
):
    # F2: enforce consent on backend
    if not req.consent:
        raise HTTPException(status_code=400, detail="Consent is required to submit a reading request.")

    # F7: mandatory field validation
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Full name is required.")
    if not req.email.strip() or not _EMAIL_RE.match(req.email.strip()):
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if not req.place_of_birth.strip():
        raise HTTPException(status_code=400, detail="Place of birth is required.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Please include your question for the astrologer.")

    # F8: duplicate lead guard — one active lead per tenant
    if store.has_pending_lead(ctx.tenant_id):
        raise HTTPException(
            status_code=409,
            detail="You already have a reading request in progress. Please wait for it to complete before submitting a new one.",
        )

    lead = store.create_lead(
        name=req.name.strip(),
        email=req.email.strip(),
        phone=req.phone.strip(),
        dob=req.dob.strip(),
        consent=req.consent,
        place_of_birth=req.place_of_birth.strip(),
        time_of_birth=req.time_of_birth.strip(),
        alias_name=req.alias_name.strip(),
        question=req.question.strip(),
        tenant_id=ctx.tenant_id,
        preferred_language=req.preferred_language.strip() or "en",
    )
    return {
        "lead_id": lead.lead_id,
        "status":  lead.status,
        "message": "Your reading request has been received. Our expert astrologer will review and reach out to you.",
    }


@router.get("/leads/{lead_id}", response_model=LeadOut)
async def get_lead_status(
    lead_id: str,
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    lead = store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")

    # RBAC: ownership check via permission system
    check_resource_access(Permission.LEAD__VIEW_OWN, lead.tenant_id, ctx)
    audit(ctx, Permission.LEAD__VIEW_OWN, resource_id=lead_id)

    from dataclasses import asdict
    return LeadOut(**asdict(lead))


@router.get("/admin/leads/count-new")
async def count_new_leads(
    ctx: TenantContext = Depends(can(Permission.LEAD__COUNT_NEW)),
):
    return {"count": store.count_new()}


@router.get("/admin/leads", response_model=List[LeadOut])
async def list_leads(
    ctx: TenantContext = Depends(can(Permission.LEAD__VIEW_ALL)),
):
    from dataclasses import asdict
    return [LeadOut(**asdict(l)) for l in store.list_leads()]


@router.post("/admin/leads/{lead_id}/attach-report")
async def attach_report_to_lead(
    lead_id: str,
    req: AttachReportRequest,
    ctx: TenantContext = Depends(can(Permission.LEAD__ATTACH_REPORT)),
):
    """ADMIN/SUPERADMIN: attach a completed report JSON to a lead and mark it report_ready."""
    lead = store.attach_report(lead_id, req.report_json)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")

    # Fire email notification — non-blocking, never raises
    import json as _json
    from email_service import send_report_ready
    import asyncio, concurrent.futures

    def _send_email():
        try:
            report_data = _json.loads(req.report_json)
            summary = (
                report_data.get("summary")
                or report_data.get("meta_analysis", {}).get("summary", "")
                or "Your complete personalised reading is ready — log in to view it."
            )
            if isinstance(summary, dict):
                summary = summary.get("text", str(summary))
            send_report_ready(
                to_email       = lead.email,
                to_name        = lead.alias_name or lead.name.split()[0],
                report_summary = str(summary)[:400],
            )
        except Exception:
            pass

    loop = asyncio.get_running_loop()
    loop.run_in_executor(concurrent.futures.ThreadPoolExecutor(max_workers=1), _send_email)

    return {"lead_id": lead.lead_id, "status": lead.status, "message": "Report attached. Email notification sent to user."}


@router.get("/leads/{lead_id}/report")
async def get_lead_report(
    lead_id: str,
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    lead = store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")

    # RBAC: ownership check via permission system
    check_resource_access(Permission.LEAD__VIEW_OWN, lead.tenant_id, ctx)
    audit(ctx, Permission.LEAD__VIEW_OWN, resource_id=f"{lead_id}/report")

    if lead.status != "report_ready" or not lead.report_json:
        raise HTTPException(status_code=404, detail="Report not ready yet.")
    import json as _json
    try:
        return _json.loads(lead.report_json)
    except Exception:
        raise HTTPException(status_code=500, detail="Report data corrupted.")


@router.patch("/admin/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: str,
    req: LeadStatusUpdate,
    ctx: TenantContext = Depends(can(Permission.LEAD__UPDATE_STATUS)),
):
    if req.status not in store.VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(store.VALID_STATUSES)}",
        )
    lead = store.update_status(lead_id, req.status, req.notes or "")
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return {"lead_id": lead.lead_id, "status": lead.status}
