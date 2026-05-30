from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from database.runbooks_store import get_runbook, list_runbooks
from database.db import get_conn

router = APIRouter(prefix="/runbooks", tags=["runbooks"])

VALID_CATEGORIES = {"networking", "database", "kubernetes", "security", "storage", "cicd", "monitoring", "other"}
VALID_SEVERITIES = {"P1", "P2", "P3", "P4"}


@router.get("")
def get_runbooks(
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all runbooks with optional filters."""
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {VALID_CATEGORIES}")
    if severity and severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: P1, P2, P3, P4")

    runbooks = list_runbooks(category=category, severity=severity, limit=limit, offset=offset)
    return {
        "total": len(runbooks),
        "runbooks": runbooks,
    }


@router.get("/stats")
def get_stats():
    """Dashboard stats — runbook counts by category and severity."""
    with get_conn() as conn:
        by_category = conn.execute(
            "SELECT category, COUNT(*) as cnt FROM runbooks WHERE status='active' GROUP BY category"
        ).fetchall()
        by_severity = conn.execute(
            "SELECT severity, COUNT(*) as cnt FROM runbooks WHERE status='active' GROUP BY severity"
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM runbooks WHERE status='active'"
        ).fetchone()[0]
        total_steps = conn.execute(
            "SELECT COUNT(*) FROM steps WHERE is_rollback=0"
        ).fetchone()[0]

    return {
        "total_runbooks": total,
        "total_steps": total_steps,
        "by_category": {r["category"]: r["cnt"] for r in by_category},
        "by_severity": {r["severity"]: r["cnt"] for r in by_severity},
    }


@router.get("/{runbook_id}")
def get_runbook_detail(runbook_id: int):
    """Get a single runbook with all steps."""
    runbook = get_runbook(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")
    return runbook


@router.get("/{runbook_id}/steps")
def get_steps(runbook_id: int):
    """Get only the steps for a runbook in execution order."""
    runbook = get_runbook(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")
    return {
        "runbook_id": runbook_id,
        "title": runbook["title"],
        "steps": runbook["steps"],
        "rollback_steps": runbook["rollback_steps"],
    }
