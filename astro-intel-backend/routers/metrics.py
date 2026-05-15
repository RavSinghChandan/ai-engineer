"""
GET /api/v1/metrics — Live pipeline metrics dashboard (ADMIN+ only)
"""
from __future__ import annotations
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from metrics import get_collector
from auth.dependencies import require_role
from auth.models import Role, TenantContext
from auth.rbac import Permission, can

router = APIRouter(prefix="/api/v1/metrics", tags=["Metrics"])


@router.get("")
async def get_metrics(
    ctx: TenantContext = Depends(can(Permission.METRICS__VIEW)),
) -> JSONResponse:
    """Return live production metrics dashboard. Requires ADMIN or SUPERADMIN."""
    dashboard = get_collector().dashboard()
    dashboard["thresholds"] = {
        "error_rate_warn_pct": 10,
    }
    dashboard["tenant_id"] = ctx.tenant_id
    return JSONResponse(content=dashboard)
