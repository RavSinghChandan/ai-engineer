"""
RBAC — Role-Based Access Control for AstroIntel 360°
=====================================================

ARCHITECTURE
------------
                    ┌──────────────────────────────────────────────┐
                    │              Permission Registry              │
                    │  (single source of truth for all permissions) │
                    └──────────────────────────────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────────┐
                    │           Role → Permission Matrix           │
                    │                                              │
                    │  USER        → {own reads, submit leads}     │
                    │  ADMIN       → USER + {manage leads, metrics}│
                    │  SUPERADMIN  → ADMIN + {manage users/tenants}│
                    └─────────────────────────────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────────┐
                    │   FastAPI Dependencies (enforcement layer)    │
                    │                                              │
                    │  can(Permission.X)  →  checks matrix        │
                    │  owns_resource(id)  →  checks ownership      │
                    └─────────────────────────────────────────────┘

PERMISSIONS CATALOGUE
---------------------
Every action in the system is a Permission.  Permissions are grouped
into logical areas so you can read them top-to-bottom like a policy doc.

MULTITENANT ISOLATION
---------------------
All resource access goes through two checks:
  1. Role check  → does this role have the permission?
  2. Ownership   → does this tenant/user own the resource?

ADMINS bypass ownership (they manage all resources in the platform).
SUPERADMINS bypass everything.

HOW TO ADD A NEW PERMISSION
----------------------------
1. Add a constant to the Permission class below.
2. Grant it to the correct role(s) in _ROLE_PERMISSION_MAP.
3. Use can(Permission.YOUR_NEW_ONE) in the router endpoint.
That's it — no other file needs to change.
"""
from __future__ import annotations

from enum import Enum
from functools import lru_cache
from typing import FrozenSet, Set

from fastapi import Depends, HTTPException, status

from auth.models import Role, TenantContext
from auth.dependencies import get_tenant_ctx


# ─────────────────────────────────────────────────────────────────────────────
# 1.  PERMISSION CATALOGUE
# ─────────────────────────────────────────────────────────────────────────────

class Permission(str, Enum):
    """
    Every action in the system expressed as a string constant.

    Naming convention:  RESOURCE__ACTION
    e.g.  ANALYSIS__RUN,  LEAD__SUBMIT,  USER__MANAGE
    """

    # ── Analysis (reading pipeline) ──────────────────────────────────────────
    ANALYSIS__RUN          = "analysis:run"          # run the LangGraph pipeline
    ANALYSIS__APPROVE      = "analysis:approve"      # approve insights → final report
    ANALYSIS__VIEW_OWN     = "analysis:view_own"     # view own sessions
    ANALYSIS__VIEW_ALL     = "analysis:view_all"     # view ALL tenant sessions (admin)
    ANALYSIS__TRANSLATE    = "analysis:translate"    # translate report to another language
    ANALYSIS__VIEW_MEMORY  = "analysis:view_memory"  # dump raw memory (admin debug)

    # ── Lead management ───────────────────────────────────────────────────────
    LEAD__SUBMIT           = "lead:submit"           # create a reading request
    LEAD__VIEW_OWN         = "lead:view_own"         # view own lead status / report
    LEAD__VIEW_ALL         = "lead:view_all"         # list all leads (admin)
    LEAD__UPDATE_STATUS    = "lead:update_status"    # change lead status
    LEAD__ATTACH_REPORT    = "lead:attach_report"    # attach completed report + notify
    LEAD__COUNT_NEW        = "lead:count_new"        # badge count (admin dashboard)

    # ── Metrics & monitoring ──────────────────────────────────────────────────
    METRICS__VIEW          = "metrics:view"          # pipeline metrics dashboard

    # ── Cache management ──────────────────────────────────────────────────────
    CACHE__VIEW            = "cache:view"            # view cache stats / entries
    CACHE__INVALIDATE      = "cache:invalidate"      # clear / invalidate cache entries

    # ── Guardrails ────────────────────────────────────────────────────────────
    GUARDRAILS__VIEW       = "guardrails:view"       # view guardrail stats
    GUARDRAILS__RESET_CB   = "guardrails:reset_cb"   # reset circuit breaker (danger)

    # ── User management ───────────────────────────────────────────────────────
    USER__VIEW_PROFILE     = "user:view_profile"     # see own /auth/me
    USER__MANAGE           = "user:manage"           # create/lock/delete user accounts

    # ── Tenant management ─────────────────────────────────────────────────────
    TENANT__VIEW_OWN       = "tenant:view_own"       # view own tenant details + keys
    TENANT__MANAGE         = "tenant:manage"         # create/lock/delete tenants (SUPERADMIN)
    TENANT__MANAGE_KEYS    = "tenant:manage_keys"    # add/revoke API keys (SUPERADMIN)


# ─────────────────────────────────────────────────────────────────────────────
# 2.  ROLE → PERMISSION MATRIX  (single source of truth)
# ─────────────────────────────────────────────────────────────────────────────

_ROLE_PERMISSION_MAP: dict[Role, FrozenSet[Permission]] = {

    Role.USER: frozenset({
        # Analysis
        Permission.ANALYSIS__RUN,
        Permission.ANALYSIS__APPROVE,
        Permission.ANALYSIS__VIEW_OWN,
        Permission.ANALYSIS__TRANSLATE,
        # Leads
        Permission.LEAD__SUBMIT,
        Permission.LEAD__VIEW_OWN,
        # Own profile
        Permission.USER__VIEW_PROFILE,
        # Own tenant info (read-only)
        Permission.TENANT__VIEW_OWN,
    }),

    Role.ADMIN: frozenset({
        # All USER permissions (inherited)
        Permission.ANALYSIS__RUN,
        Permission.ANALYSIS__APPROVE,
        Permission.ANALYSIS__VIEW_OWN,
        Permission.ANALYSIS__VIEW_ALL,       # ← admin can see ALL sessions
        Permission.ANALYSIS__TRANSLATE,
        Permission.ANALYSIS__VIEW_MEMORY,    # ← admin debug
        # Leads — full lifecycle management
        Permission.LEAD__SUBMIT,
        Permission.LEAD__VIEW_OWN,
        Permission.LEAD__VIEW_ALL,
        Permission.LEAD__UPDATE_STATUS,
        Permission.LEAD__ATTACH_REPORT,
        Permission.LEAD__COUNT_NEW,
        # Monitoring
        Permission.METRICS__VIEW,
        Permission.CACHE__VIEW,
        Permission.CACHE__INVALIDATE,
        Permission.GUARDRAILS__VIEW,
        # Own profile + own tenant
        Permission.USER__VIEW_PROFILE,
        Permission.TENANT__VIEW_OWN,
    }),

    Role.SUPERADMIN: frozenset({
        # Everything ADMIN has +
        Permission.ANALYSIS__RUN,
        Permission.ANALYSIS__APPROVE,
        Permission.ANALYSIS__VIEW_OWN,
        Permission.ANALYSIS__VIEW_ALL,
        Permission.ANALYSIS__TRANSLATE,
        Permission.ANALYSIS__VIEW_MEMORY,
        Permission.LEAD__SUBMIT,
        Permission.LEAD__VIEW_OWN,
        Permission.LEAD__VIEW_ALL,
        Permission.LEAD__UPDATE_STATUS,
        Permission.LEAD__ATTACH_REPORT,
        Permission.LEAD__COUNT_NEW,
        Permission.METRICS__VIEW,
        Permission.CACHE__VIEW,
        Permission.CACHE__INVALIDATE,
        Permission.GUARDRAILS__VIEW,
        Permission.USER__VIEW_PROFILE,
        Permission.TENANT__VIEW_OWN,
        # SUPERADMIN exclusives
        Permission.GUARDRAILS__RESET_CB,    # ← only SUPERADMIN resets circuit breaker
        Permission.USER__MANAGE,             # ← create/lock/delete users
        Permission.TENANT__MANAGE,          # ← create/lock/delete tenants
        Permission.TENANT__MANAGE_KEYS,     # ← add/revoke API keys
    }),
}


# ─────────────────────────────────────────────────────────────────────────────
# 3.  PERMISSION CHECKER  (cached for speed)
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=None)
def _permissions_for(role: Role) -> FrozenSet[Permission]:
    """Return the complete permission set for a role (computed once, cached forever)."""
    return _ROLE_PERMISSION_MAP.get(role, frozenset())


def has_permission(role: Role, perm: Permission) -> bool:
    """Core check: does this role hold the requested permission?"""
    return perm in _permissions_for(role)


def permissions_for_role(role: Role) -> Set[str]:
    """Return all permission values for a role — used in /auth/me response."""
    return {p.value for p in _permissions_for(role)}


# ─────────────────────────────────────────────────────────────────────────────
# 4.  FASTAPI DEPENDENCIES  (the enforcement layer you use in routers)
# ─────────────────────────────────────────────────────────────────────────────

def can(perm: Permission):
    """
    FastAPI dependency factory.  Checks that the caller holds the permission.

    Usage in any endpoint:
        @router.get("/some/route")
        async def my_endpoint(ctx = Depends(can(Permission.METRICS__VIEW))):
            ...
    """
    async def _check(ctx: TenantContext = Depends(get_tenant_ctx)) -> TenantContext:
        if not has_permission(ctx.role, perm):
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = (
                    f"Permission denied: '{perm.value}' required. "
                    f"Your role '{ctx.role.value}' does not have this permission."
                ),
            )
        return ctx
    return _check


def can_access_resource(perm: Permission, resource_tenant_id: str):
    """
    Dependency factory for resource-level access.

    Checks BOTH permission AND ownership:
      - Permission check:  does the role have the permission?
      - Ownership check:   is the resource owned by this tenant?
                          (ADMIN/SUPERADMIN bypass ownership — they can access all)

    Usage:
        @router.get("/leads/{lead_id}")
        async def get_lead(lead_id: str, ctx = Depends(get_tenant_ctx)):
            lead = store.get_lead(lead_id)
            await can_access_resource_check(Permission.LEAD__VIEW_OWN, lead.tenant_id, ctx)
    """
    async def _check(ctx: TenantContext = Depends(get_tenant_ctx)) -> TenantContext:
        if not has_permission(ctx.role, perm):
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = f"Permission denied: '{perm.value}' required.",
            )
        # Ownership: USERs can only access their own resources
        # ADMIN and SUPERADMIN bypass ownership (they manage the platform)
        if ctx.role == Role.USER and resource_tenant_id and resource_tenant_id != ctx.tenant_id:
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = "Access denied: you can only access your own resources.",
            )
        return ctx
    return _check


def check_resource_access(perm: Permission, resource_tenant_id: str, ctx: TenantContext) -> None:
    """
    Imperative (non-dependency) version of resource access check.
    Use this when you already have ctx and need to check inline.

    Example:
        lead = store.get_lead(lead_id)
        check_resource_access(Permission.LEAD__VIEW_OWN, lead.tenant_id, ctx)
    """
    if not has_permission(ctx.role, perm):
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = f"Permission denied: '{perm.value}' required.",
        )
    if ctx.role == Role.USER and resource_tenant_id and resource_tenant_id != ctx.tenant_id:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Access denied: you can only access your own resources.",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5.  AUDIT LOGGING  (lightweight — logs every permission decision)
# ─────────────────────────────────────────────────────────────────────────────

import logging
_audit_log = logging.getLogger("rbac.audit")


def audit(ctx: TenantContext, perm: Permission, resource_id: str = "", granted: bool = True) -> None:
    """
    Write one line to the audit log for every significant access decision.
    In production, pipe this to your SIEM / Datadog / CloudWatch.

    Format:
        RBAC | GRANTED | tenant=X user=Y role=Z perm=A resource=B
        RBAC | DENIED  | tenant=X user=Y role=Z perm=A resource=B
    """
    verdict = "GRANTED" if granted else "DENIED"
    _audit_log.info(
        "RBAC | %s | tenant=%s user=%s role=%s perm=%s resource=%s",
        verdict, ctx.tenant_id, ctx.user_id or ctx.email or "api-key",
        ctx.role.value, perm.value, resource_id or "-",
    )
