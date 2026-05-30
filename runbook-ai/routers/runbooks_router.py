from __future__ import annotations
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from database.runbooks_store import get_runbook, list_runbooks, count_runbooks
from database.db import get_conn
from routers.deps import optional_auth, CurrentUser

router = APIRouter(prefix="/runbooks", tags=["runbooks"])

VALID_CATEGORIES = {"networking", "database", "kubernetes", "security", "storage", "cicd", "monitoring", "other"}
VALID_SEVERITIES = {"P1", "P2", "P3", "P4"}
_NOT_FOUND = "Runbook not found"

OptionalUser = Annotated[Optional[CurrentUser], Depends(optional_auth)]
CategoryQ = Annotated[Optional[str], Query()]
SeverityQ = Annotated[Optional[str], Query()]
LimitQ = Annotated[int, Query(ge=1, le=100)]
OffsetQ = Annotated[int, Query(ge=0)]


def _check_tenant(runbook: dict, user: Optional[CurrentUser]) -> None:
    if user and runbook.get("tenant_id") and runbook["tenant_id"] != user.tenant_id:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)


@router.get(
    "",
    responses={400: {"description": "Invalid category or severity filter"}},
)
def get_runbooks(
    current_user: OptionalUser,
    category: CategoryQ = None,
    severity: SeverityQ = None,
    limit: LimitQ = 20,
    offset: OffsetQ = 0,
):
    """List all runbooks with optional filters. Tenant-scoped when authenticated."""
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {VALID_CATEGORIES}")
    if severity and severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail="Invalid severity. Must be one of: P1, P2, P3, P4")

    tenant_id = current_user.tenant_id if current_user else None
    runbooks = list_runbooks(category=category, severity=severity, limit=limit, offset=offset, tenant_id=tenant_id)
    total = count_runbooks(category=category, severity=severity, tenant_id=tenant_id)
    return {"total": total, "runbooks": runbooks}


@router.get("/stats")
def get_stats(current_user: OptionalUser):
    """Dashboard stats — runbook counts by category and severity. Tenant-scoped when authenticated."""
    tenant_filter = ""
    params: list = []
    if current_user:
        tenant_filter = " AND tenant_id=?"
        params.append(current_user.tenant_id)

    with get_conn() as conn:
        by_category = conn.execute(
            f"SELECT category, COUNT(*) as cnt FROM runbooks WHERE status='active'{tenant_filter} GROUP BY category",
            params,
        ).fetchall()
        by_severity = conn.execute(
            f"SELECT severity, COUNT(*) as cnt FROM runbooks WHERE status='active'{tenant_filter} GROUP BY severity",
            params,
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(*) FROM runbooks WHERE status='active'{tenant_filter}", params,
        ).fetchone()[0]
        total_steps = conn.execute(
            f"""SELECT COUNT(*) FROM steps s
                JOIN runbooks r ON s.runbook_id=r.id
                WHERE s.is_rollback=0 AND r.status='active'{tenant_filter}""",
            params,
        ).fetchone()[0]

    return {
        "total_runbooks": total,
        "total_steps": total_steps,
        "by_category": {r["category"]: r["cnt"] for r in by_category},
        "by_severity": {r["severity"]: r["cnt"] for r in by_severity},
    }


@router.get(
    "/{runbook_id}",
    responses={404: {"description": _NOT_FOUND}},
)
def get_runbook_detail(runbook_id: int, current_user: OptionalUser):
    """Get a single runbook with all steps."""
    runbook = get_runbook(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    _check_tenant(runbook, current_user)
    return runbook


@router.get(
    "/{runbook_id}/steps",
    responses={404: {"description": _NOT_FOUND}},
)
def get_steps(runbook_id: int, current_user: OptionalUser):
    """Get only the steps for a runbook in execution order."""
    runbook = get_runbook(runbook_id)
    if not runbook:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    _check_tenant(runbook, current_user)
    return {
        "runbook_id": runbook_id,
        "title": runbook["title"],
        "steps": runbook["steps"],
        "rollback_steps": runbook["rollback_steps"],
    }
