"""
Lead capture endpoints.

Public:
  POST /leads            — submit a new lead (any authenticated user)
  GET  /leads/{lead_id}  — poll status (authenticated user who submitted it)

ADMIN+:
  GET  /admin/leads            — list all leads
  PATCH /admin/leads/{id}/status — update lead status
  GET  /admin/leads/count-new  — count leads with status=submitted
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from auth.models import Role, TenantContext
from auth.dependencies import get_tenant_ctx, require_role
import leads.store as store

router = APIRouter(tags=["Leads"])


class LeadRequest(BaseModel):
    name:    str
    email:   str
    phone:   str
    dob:     str
    consent: bool

class LeadStatusUpdate(BaseModel):
    status: str
    notes:  Optional[str] = ""

class LeadOut(BaseModel):
    lead_id:     str
    name:        str
    email:       str
    phone:       str
    dob:         str
    consent:     bool
    status:      str
    created_at:  float
    updated_at:  float
    notes:       str
    report_json: str = ""

class AttachReportRequest(BaseModel):
    report_json: str   # full report object serialized as JSON string


@router.post("/leads", status_code=status.HTTP_201_CREATED)
async def submit_lead(
    req: LeadRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    if not req.name.strip() or not req.email.strip():
        raise HTTPException(status_code=400, detail="Name and email are required.")
    lead = store.create_lead(
        name=req.name.strip(),
        email=req.email.strip(),
        phone=req.phone.strip(),
        dob=req.dob.strip(),
        consent=req.consent,
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
    from dataclasses import asdict
    return LeadOut(**asdict(lead))


@router.get("/admin/leads/count-new")
async def count_new_leads(
    ctx: TenantContext = Depends(require_role(Role.ADMIN)),
):
    return {"count": store.count_new()}


@router.get("/admin/leads", response_model=List[LeadOut])
async def list_leads(
    ctx: TenantContext = Depends(require_role(Role.ADMIN)),
):
    from dataclasses import asdict
    return [LeadOut(**asdict(l)) for l in store.list_leads()]


@router.post("/admin/leads/{lead_id}/attach-report")
async def attach_report_to_lead(
    lead_id: str,
    req: AttachReportRequest,
    ctx: TenantContext = Depends(require_role(Role.ADMIN)),
):
    """ADMIN/SUPERADMIN: attach a completed report JSON to a lead and mark it report_ready."""
    lead = store.attach_report(lead_id, req.report_json)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return {"lead_id": lead.lead_id, "status": lead.status, "message": "Report attached. User can now download it."}


@router.get("/leads/{lead_id}/report")
async def get_lead_report(
    lead_id: str,
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    """Any authenticated user: get the report JSON for a lead (when status=report_ready)."""
    lead = store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
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
    ctx: TenantContext = Depends(require_role(Role.ADMIN)),
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
