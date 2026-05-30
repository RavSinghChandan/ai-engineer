from fastapi import APIRouter, HTTPException, Query
from database.leads_store import list_leads, count_leads_by_stage
from database.interactions_store import get_recent_interactions, count_interactions_by_intent
from database.db import get_conn

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("")
def get_leads(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    return {"leads": list_leads(limit=limit, offset=offset)}


@router.get("/{lead_id}")
def get_lead(lead_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = dict(row)
    lead["history"] = get_recent_interactions(lead_id, limit=50)
    return lead


@router.get("/{lead_id}/history")
def get_lead_history(lead_id: int, limit: int = Query(20, ge=1, le=200)):
    return {"interactions": get_recent_interactions(lead_id, limit=limit)}
