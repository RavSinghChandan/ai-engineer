"""
RBAC Test Suite — tests/test_rbac.py
=====================================
Validates the permission matrix, role hierarchy, and enforcement layer.

Run:  python -m pytest tests/test_rbac.py -v
"""
import pytest
from auth.models import Role, TenantContext
from auth.rbac import (
    Permission, has_permission, permissions_for_role,
    check_resource_access, _permissions_for,
)
from fastapi import HTTPException


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def ctx(role: Role, tenant_id: str = "tenant_a", user_id: str = "u1") -> TenantContext:
    return TenantContext(
        tenant_id   = tenant_id,
        role        = role,
        api_key     = "",
        tenant_name = "Test",
        user_id     = user_id,
    )

USER_CTX        = ctx(Role.USER,       tenant_id="tenant_a")
ADMIN_CTX       = ctx(Role.ADMIN,      tenant_id="tenant_a")
SUPERADMIN_CTX  = ctx(Role.SUPERADMIN, tenant_id="tenant_master")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Permission catalogue — every Permission value is unique
# ─────────────────────────────────────────────────────────────────────────────

def test_all_permission_values_are_unique():
    values = [p.value for p in Permission]
    assert len(values) == len(set(values)), "Duplicate permission value found"


def test_permission_values_follow_naming_convention():
    for p in Permission:
        assert ":" in p.value, f"Permission {p.name} value '{p.value}' must follow 'resource:action' format"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Role → Permission matrix completeness
# ─────────────────────────────────────────────────────────────────────────────

def test_every_role_has_permissions():
    for role in Role:
        perms = _permissions_for(role)
        assert len(perms) > 0, f"Role {role.value} has no permissions"


def test_superadmin_has_all_permissions():
    sa_perms = _permissions_for(Role.SUPERADMIN)
    for perm in Permission:
        assert perm in sa_perms, f"SUPERADMIN missing permission: {perm.value}"


def test_admin_does_not_have_superadmin_exclusive_permissions():
    admin_perms = _permissions_for(Role.ADMIN)
    superadmin_only = {
        Permission.GUARDRAILS__RESET_CB,
        Permission.USER__MANAGE,
        Permission.TENANT__MANAGE,
        Permission.TENANT__MANAGE_KEYS,
    }
    for p in superadmin_only:
        assert p not in admin_perms, f"ADMIN should NOT have SUPERADMIN-exclusive permission: {p.value}"


def test_user_does_not_have_admin_permissions():
    user_perms = _permissions_for(Role.USER)
    admin_only = {
        Permission.ANALYSIS__VIEW_ALL,
        Permission.ANALYSIS__VIEW_MEMORY,
        Permission.LEAD__VIEW_ALL,
        Permission.LEAD__UPDATE_STATUS,
        Permission.LEAD__ATTACH_REPORT,
        Permission.LEAD__COUNT_NEW,
        Permission.METRICS__VIEW,
        Permission.CACHE__VIEW,
        Permission.CACHE__INVALIDATE,
        Permission.GUARDRAILS__VIEW,
    }
    for p in admin_only:
        assert p not in user_perms, f"USER should NOT have ADMIN permission: {p.value}"


# ─────────────────────────────────────────────────────────────────────────────
# 3. has_permission() — unit tests for every critical permission
# ─────────────────────────────────────────────────────────────────────────────

class TestUserPermissions:
    def test_can_run_analysis(self):
        assert has_permission(Role.USER, Permission.ANALYSIS__RUN)

    def test_can_approve_analysis(self):
        assert has_permission(Role.USER, Permission.ANALYSIS__APPROVE)

    def test_can_view_own_session(self):
        assert has_permission(Role.USER, Permission.ANALYSIS__VIEW_OWN)

    def test_cannot_view_all_sessions(self):
        assert not has_permission(Role.USER, Permission.ANALYSIS__VIEW_ALL)

    def test_cannot_view_memory(self):
        assert not has_permission(Role.USER, Permission.ANALYSIS__VIEW_MEMORY)

    def test_can_submit_lead(self):
        assert has_permission(Role.USER, Permission.LEAD__SUBMIT)

    def test_can_view_own_lead(self):
        assert has_permission(Role.USER, Permission.LEAD__VIEW_OWN)

    def test_cannot_view_all_leads(self):
        assert not has_permission(Role.USER, Permission.LEAD__VIEW_ALL)

    def test_cannot_update_lead_status(self):
        assert not has_permission(Role.USER, Permission.LEAD__UPDATE_STATUS)

    def test_cannot_attach_report(self):
        assert not has_permission(Role.USER, Permission.LEAD__ATTACH_REPORT)

    def test_cannot_view_metrics(self):
        assert not has_permission(Role.USER, Permission.METRICS__VIEW)

    def test_cannot_manage_users(self):
        assert not has_permission(Role.USER, Permission.USER__MANAGE)

    def test_cannot_manage_tenants(self):
        assert not has_permission(Role.USER, Permission.TENANT__MANAGE)

    def test_cannot_reset_circuit_breaker(self):
        assert not has_permission(Role.USER, Permission.GUARDRAILS__RESET_CB)


class TestAdminPermissions:
    def test_can_run_analysis(self):
        assert has_permission(Role.ADMIN, Permission.ANALYSIS__RUN)

    def test_can_view_all_sessions(self):
        assert has_permission(Role.ADMIN, Permission.ANALYSIS__VIEW_ALL)

    def test_can_view_memory(self):
        assert has_permission(Role.ADMIN, Permission.ANALYSIS__VIEW_MEMORY)

    def test_can_view_all_leads(self):
        assert has_permission(Role.ADMIN, Permission.LEAD__VIEW_ALL)

    def test_can_update_lead_status(self):
        assert has_permission(Role.ADMIN, Permission.LEAD__UPDATE_STATUS)

    def test_can_attach_report(self):
        assert has_permission(Role.ADMIN, Permission.LEAD__ATTACH_REPORT)

    def test_can_view_metrics(self):
        assert has_permission(Role.ADMIN, Permission.METRICS__VIEW)

    def test_can_view_cache(self):
        assert has_permission(Role.ADMIN, Permission.CACHE__VIEW)

    def test_can_view_guardrails(self):
        assert has_permission(Role.ADMIN, Permission.GUARDRAILS__VIEW)

    def test_cannot_reset_circuit_breaker(self):
        assert not has_permission(Role.ADMIN, Permission.GUARDRAILS__RESET_CB)

    def test_cannot_manage_users(self):
        assert not has_permission(Role.ADMIN, Permission.USER__MANAGE)

    def test_cannot_manage_tenants(self):
        assert not has_permission(Role.ADMIN, Permission.TENANT__MANAGE)


class TestSuperadminPermissions:
    def test_can_reset_circuit_breaker(self):
        assert has_permission(Role.SUPERADMIN, Permission.GUARDRAILS__RESET_CB)

    def test_can_manage_users(self):
        assert has_permission(Role.SUPERADMIN, Permission.USER__MANAGE)

    def test_can_manage_tenants(self):
        assert has_permission(Role.SUPERADMIN, Permission.TENANT__MANAGE)

    def test_can_manage_keys(self):
        assert has_permission(Role.SUPERADMIN, Permission.TENANT__MANAGE_KEYS)


# ─────────────────────────────────────────────────────────────────────────────
# 4. permissions_for_role() — output is strings, usable in API response
# ─────────────────────────────────────────────────────────────────────────────

def test_permissions_for_role_returns_strings():
    perms = permissions_for_role(Role.USER)
    assert isinstance(perms, set)
    for p in perms:
        assert isinstance(p, str)


def test_permissions_for_role_user_count():
    """USER has at least 7 permissions."""
    assert len(permissions_for_role(Role.USER)) >= 7


def test_permissions_for_role_superadmin_count():
    """SUPERADMIN has every permission."""
    assert len(permissions_for_role(Role.SUPERADMIN)) == len(Permission)


# ─────────────────────────────────────────────────────────────────────────────
# 5. check_resource_access() — ownership enforcement
# ─────────────────────────────────────────────────────────────────────────────

class TestResourceAccess:

    def test_user_can_access_own_resource(self):
        # Should not raise
        check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_a", USER_CTX)

    def test_user_cannot_access_other_tenant_resource(self):
        with pytest.raises(HTTPException) as exc_info:
            check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", USER_CTX)
        assert exc_info.value.status_code == 403

    def test_admin_can_access_any_tenant_resource(self):
        # ADMIN bypasses ownership — should not raise even for different tenant
        check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", ADMIN_CTX)

    def test_superadmin_can_access_any_tenant_resource(self):
        check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", SUPERADMIN_CTX)

    def test_user_blocked_if_missing_permission(self):
        # Even for own tenant, user can't view ALL leads
        with pytest.raises(HTTPException) as exc_info:
            check_resource_access(Permission.LEAD__VIEW_ALL, "tenant_a", USER_CTX)
        assert exc_info.value.status_code == 403

    def test_admin_blocked_without_permission(self):
        # ADMIN can't reset circuit breaker even for own tenant
        with pytest.raises(HTTPException) as exc_info:
            check_resource_access(Permission.GUARDRAILS__RESET_CB, "tenant_a", ADMIN_CTX)
        assert exc_info.value.status_code == 403

    def test_empty_resource_tenant_id_allows_user(self):
        # Empty tenant_id means resource has no owner — allow access
        check_resource_access(Permission.LEAD__VIEW_OWN, "", USER_CTX)

    def test_error_message_contains_permission_name(self):
        with pytest.raises(HTTPException) as exc_info:
            check_resource_access(Permission.LEAD__VIEW_ALL, "tenant_a", USER_CTX)
        assert "lead:view_all" in exc_info.value.detail

    def test_ownership_error_message_is_clear(self):
        with pytest.raises(HTTPException) as exc_info:
            check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", USER_CTX)
        assert "own resources" in exc_info.value.detail


# ─────────────────────────────────────────────────────────────────────────────
# 6. Multitenant isolation — cross-tenant access is blocked at permission layer
# ─────────────────────────────────────────────────────────────────────────────

class TestMultitenantIsolation:

    def test_tenant_a_user_cannot_read_tenant_b_lead(self):
        tenant_a_user = ctx(Role.USER, tenant_id="tenant_a")
        with pytest.raises(HTTPException) as exc:
            check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", tenant_a_user)
        assert exc.value.status_code == 403

    def test_tenant_b_user_cannot_read_tenant_a_lead(self):
        tenant_b_user = ctx(Role.USER, tenant_id="tenant_b")
        with pytest.raises(HTTPException) as exc:
            check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_a", tenant_b_user)
        assert exc.value.status_code == 403

    def test_admin_in_tenant_a_can_cross_tenant_read(self):
        # ADMINs manage the platform — they can see all tenants' leads
        admin = ctx(Role.ADMIN, tenant_id="tenant_a")
        check_resource_access(Permission.LEAD__VIEW_OWN, "tenant_b", admin)

    def test_two_users_same_tenant_isolation(self):
        user1 = ctx(Role.USER, tenant_id="shared_tenant", user_id="user_1")
        user2 = ctx(Role.USER, tenant_id="different_tenant", user_id="user_2")
        # user1 can read shared_tenant resources
        check_resource_access(Permission.LEAD__VIEW_OWN, "shared_tenant", user1)
        # user2 cannot
        with pytest.raises(HTTPException):
            check_resource_access(Permission.LEAD__VIEW_OWN, "shared_tenant", user2)


# ─────────────────────────────────────────────────────────────────────────────
# 7. lru_cache correctness — same role always gets same permissions
# ─────────────────────────────────────────────────────────────────────────────

def test_permission_lookup_is_deterministic():
    perms1 = _permissions_for(Role.ADMIN)
    perms2 = _permissions_for(Role.ADMIN)
    assert perms1 is perms2  # lru_cache returns same object


def test_role_permissions_are_immutable():
    perms = _permissions_for(Role.USER)
    assert isinstance(perms, frozenset), "Permissions must be a frozenset (immutable)"


# ─────────────────────────────────────────────────────────────────────────────
# 8. RBAC summary — print for documentation
# ─────────────────────────────────────────────────────────────────────────────

def test_rbac_matrix_summary(capsys):
    """Print the complete permission matrix for documentation."""
    print("\n\n=== RBAC PERMISSION MATRIX ===\n")
    all_perms = sorted(p.value for p in Permission)
    roles = [Role.USER, Role.ADMIN, Role.SUPERADMIN]

    header = f"{'Permission':<35} " + "  ".join(f"{r.value:^12}" for r in roles)
    print(header)
    print("─" * len(header))

    for pv in all_perms:
        p = Permission(pv)
        row = f"{pv:<35} "
        for r in roles:
            mark = "✓" if has_permission(r, p) else "·"
            row += f"{mark:^14}"
        print(row)

    print(f"\nTotal permissions: {len(all_perms)}")
    print(f"USER permissions:        {len(permissions_for_role(Role.USER))}")
    print(f"ADMIN permissions:       {len(permissions_for_role(Role.ADMIN))}")
    print(f"SUPERADMIN permissions:  {len(permissions_for_role(Role.SUPERADMIN))}")
    # Test passes regardless
    assert True
