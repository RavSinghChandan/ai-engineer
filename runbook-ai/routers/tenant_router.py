"""
Tenant management API — Phase 6.

GET  /tenants/me          — current tenant info + usage stats
GET  /tenants             — superadmin lists all tenants
POST /tenants/{id}/deactivate — superadmin deactivates a tenant
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from routers.deps import require_auth, require_role, CurrentUser
from database.users_store import get_tenant, list_tenants
from database.db import get_conn

router = APIRouter(prefix="/tenants", tags=["tenants"])


def _tenant_stats(tenant_id: int) -> dict:
    with get_conn() as conn:
        runbooks = conn.execute(
            "SELECT COUNT(*) as n FROM runbooks WHERE tenant_id=?", (tenant_id,)
        ).fetchone()["n"]
        users = conn.execute(
            "SELECT COUNT(*) as n FROM users WHERE tenant_id=? AND is_active=1", (tenant_id,)
        ).fetchone()["n"]
        jobs = conn.execute(
            "SELECT COUNT(*) as n FROM ingest_jobs WHERE tenant_id=?", (tenant_id,)
        ).fetchone()["n"]
    return {"runbooks": runbooks, "active_users": users, "ingest_jobs": jobs}


@router.get("/me")
def my_tenant(current_user: CurrentUser = Depends(require_auth)):
    """Returns current tenant info with usage statistics."""
    tenant = get_tenant(current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "id": tenant["id"],
        "name": tenant["name"],
        "slug": tenant["slug"],
        "plan": tenant["plan"],
        "is_active": bool(tenant["is_active"]),
        "stats": _tenant_stats(current_user.tenant_id),
    }


@router.get("", responses={403: {"description": "Requires superadmin role"}})
def list_all_tenants(current_user: CurrentUser = Depends(require_role("superadmin"))):
    """Superadmin lists all tenants."""
    tenants = list_tenants()
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "slug": t["slug"],
            "plan": t["plan"],
            "is_active": bool(t["is_active"]),
            "stats": _tenant_stats(t["id"]),
        }
        for t in tenants
    ]


@router.post("/{tenant_id}/deactivate", responses={403: {"description": "Requires superadmin role"}})
def deactivate_tenant(
    tenant_id: int,
    current_user: CurrentUser = Depends(require_role("superadmin")),
):
    """Superadmin deactivates a tenant (soft delete — preserves data)."""
    tenant = get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    with get_conn() as conn:
        conn.execute("UPDATE tenants SET is_active=0 WHERE id=?", (tenant_id,))
        conn.commit()
    return {"tenant_id": tenant_id, "is_active": False}
