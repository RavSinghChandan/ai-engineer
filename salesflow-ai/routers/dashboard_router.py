from fastapi import APIRouter
from database.leads_store import count_leads_by_stage, list_leads
from database.interactions_store import count_interactions_by_intent
from database.db import get_conn

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

FUNNEL_ORDER = [
    "NEW_LEAD", "ENGAGED", "INTERESTED",
    "NEGOTIATING", "CONVERTED", "CLOSED_WON", "CLOSED_LOST",
]


@router.get("/stats")
def get_stats():
    stage_counts = count_leads_by_stage()
    intent_counts = count_interactions_by_intent()

    total_leads = sum(stage_counts.values())
    converted = stage_counts.get("CONVERTED", 0) + stage_counts.get("CLOSED_WON", 0)
    conversion_rate = round(converted / total_leads * 100, 1) if total_leads else 0.0

    with get_conn() as conn:
        total_messages = conn.execute(
            "SELECT COUNT(*) FROM interactions WHERE role='customer'"
        ).fetchone()[0]

    funnel = [
        {"stage": s, "count": stage_counts.get(s, 0)}
        for s in FUNNEL_ORDER
    ]

    return {
        "total_leads": total_leads,
        "converted": converted,
        "conversion_rate_pct": conversion_rate,
        "total_messages_received": total_messages,
        "funnel": funnel,
        "intent_breakdown": intent_counts,
    }


@router.get("/recent")
def get_recent(limit: int = 10):
    leads = list_leads(limit=limit)
    return {"recent_leads": leads}
