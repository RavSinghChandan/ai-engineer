"""
Test Suite: Multi-Tenant Auth System
=====================================
Covers:
  - Role model (can() hierarchy)
  - auth/store.py (CRUD, bootstrap, persistence)
  - auth/dependencies.py (JWT create/verify, get_tenant_ctx)
  - HTTP endpoints: /auth/token, /auth/me, /admin/tenants, /admin/keys
  - Role enforcement: USER blocked from ADMIN endpoints, ADMIN blocked from SUPERADMIN
  - Analysis endpoints protected: 401 without key, 200 with valid key
  - Cache/guardrail endpoints: 401 without key, 403 for USER, 200 for ADMIN

All tests use in-memory state reset between tests — no disk writes needed.
"""
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import auth.store as store
from auth.models import Role, TenantContext
from auth.dependencies import create_access_token, verify_token


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_auth_store():
    """Reset all auth state before every test — no cross-test contamination."""
    store.clear_for_tests()
    # Bootstrap a clean superadmin
    store._tenants["tenant_master"] = _make_tenant("tenant_master", "Master")
    store._api_keys[SUPERADMIN_KEY] = _make_key(SUPERADMIN_KEY, "tenant_master", Role.SUPERADMIN)
    yield
    store.clear_for_tests()


@pytest.fixture()
def client():
    # Import AFTER store is reset so app picks up clean state
    from main import app
    import cache.store as cache_store
    cache_store.clear()
    return TestClient(app, raise_server_exceptions=False)


# ── Test constants ────────────────────────────────────────────────────────────

SUPERADMIN_KEY = "sk-master-test-superadmin"
ADMIN_KEY      = "sk-tenant-test-admin-key"
USER_KEY       = "sk-tenant-test-user-key"
TENANT_ID      = "tenant_abc123"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_tenant(tid, name):
    from auth.models import Tenant
    return Tenant(tenant_id=tid, name=name, is_active=True, created_at=time.time())

def _make_key(key, tid, role):
    from auth.models import APIKey
    return APIKey(key=key, tenant_id=tid, role=role,
                  description="test", is_active=True, created_at=time.time())

def _seed_tenant_with_keys():
    """Seed a test tenant with both ADMIN and USER keys."""
    store._tenants[TENANT_ID] = _make_tenant(TENANT_ID, "Test Corp")
    store._api_keys[ADMIN_KEY] = _make_key(ADMIN_KEY, TENANT_ID, Role.ADMIN)
    store._api_keys[USER_KEY]  = _make_key(USER_KEY,  TENANT_ID, Role.USER)


# ════════════════════════════════════════════════════════════════════════════
# 1. Role model
# ════════════════════════════════════════════════════════════════════════════

class TestRoleModel:
    def test_user_can_user(self):
        assert Role.USER.can(Role.USER) is True

    def test_user_cannot_admin(self):
        assert Role.USER.can(Role.ADMIN) is False

    def test_user_cannot_superadmin(self):
        assert Role.USER.can(Role.SUPERADMIN) is False

    def test_admin_can_user(self):
        assert Role.ADMIN.can(Role.USER) is True

    def test_admin_can_admin(self):
        assert Role.ADMIN.can(Role.ADMIN) is True

    def test_admin_cannot_superadmin(self):
        assert Role.ADMIN.can(Role.SUPERADMIN) is False

    def test_superadmin_can_all(self):
        for role in [Role.USER, Role.ADMIN, Role.SUPERADMIN]:
            assert Role.SUPERADMIN.can(role) is True

    def test_role_values(self):
        assert Role.USER.value       == "user"
        assert Role.ADMIN.value      == "admin"
        assert Role.SUPERADMIN.value == "superadmin"


# ════════════════════════════════════════════════════════════════════════════
# 2. Auth store
# ════════════════════════════════════════════════════════════════════════════

class TestAuthStore:
    def test_lookup_valid_key(self):
        _seed_tenant_with_keys()
        result = store.lookup_key(ADMIN_KEY)
        assert result is not None
        assert result.role == Role.ADMIN

    def test_lookup_unknown_key_returns_none(self):
        assert store.lookup_key("sk-does-not-exist") is None

    def test_lookup_inactive_key_returns_none(self):
        _seed_tenant_with_keys()
        store._api_keys[ADMIN_KEY].is_active = False
        assert store.lookup_key(ADMIN_KEY) is None

    def test_lookup_key_for_inactive_tenant_returns_none(self):
        _seed_tenant_with_keys()
        store._tenants[TENANT_ID].is_active = False
        assert store.lookup_key(ADMIN_KEY) is None

    def test_create_tenant(self):
        tenant = store.create_tenant("New Corp")
        assert tenant.tenant_id.startswith("tenant_")
        assert tenant.name == "New Corp"
        assert store.get_tenant(tenant.tenant_id) is not None

    def test_create_api_key(self):
        tenant  = store.create_tenant("Corp A")
        api_key = store.create_api_key(tenant.tenant_id, Role.USER, "test user key")
        assert api_key.key.startswith("sk-")
        assert api_key.role == Role.USER
        assert store.lookup_key(api_key.key) is not None

    def test_create_key_for_unknown_tenant_raises(self):
        with pytest.raises(ValueError, match="does not exist"):
            store.create_api_key("tenant_nonexistent", Role.USER)

    def test_revoke_key(self):
        _seed_tenant_with_keys()
        revoked = store.revoke_key(USER_KEY)
        assert revoked is True
        assert store.lookup_key(USER_KEY) is None

    def test_revoke_unknown_key_returns_false(self):
        assert store.revoke_key("sk-does-not-exist") is False

    def test_list_tenants(self):
        _seed_tenant_with_keys()
        tenants = store.list_tenants()
        ids = [t.tenant_id for t in tenants]
        assert TENANT_ID in ids
        assert "tenant_master" in ids

    def test_list_keys_for_tenant(self):
        _seed_tenant_with_keys()
        keys = store.list_keys_for_tenant(TENANT_ID)
        key_strs = [k.key for k in keys]
        assert ADMIN_KEY in key_strs
        assert USER_KEY  in key_strs

    def test_superadmin_key_not_in_tenant_list(self):
        _seed_tenant_with_keys()
        keys = store.list_keys_for_tenant(TENANT_ID)
        assert all(k.key != SUPERADMIN_KEY for k in keys)


# ════════════════════════════════════════════════════════════════════════════
# 3. JWT creation and verification
# ════════════════════════════════════════════════════════════════════════════

class TestJWT:
    def test_create_and_verify_token(self):
        _seed_tenant_with_keys()
        token = create_access_token(TENANT_ID, Role.ADMIN, ADMIN_KEY, "Test Corp")
        ctx   = verify_token(token)
        assert ctx is not None
        assert ctx.tenant_id  == TENANT_ID
        assert ctx.role       == Role.ADMIN
        assert ctx.api_key    == ADMIN_KEY
        assert ctx.tenant_name == "Test Corp"

    def test_verify_garbage_token_returns_none(self):
        assert verify_token("not.a.jwt") is None

    def test_verify_tampered_token_returns_none(self):
        token = create_access_token(TENANT_ID, Role.SUPERADMIN, SUPERADMIN_KEY)
        tampered = token[:-5] + "XXXXX"
        assert verify_token(tampered) is None

    def test_token_contains_role(self):
        token = create_access_token(TENANT_ID, Role.USER, USER_KEY)
        ctx   = verify_token(token)
        assert ctx.role == Role.USER

    def test_superadmin_token_verifies(self):
        token = create_access_token("tenant_master", Role.SUPERADMIN, SUPERADMIN_KEY)
        ctx   = verify_token(token)
        assert ctx.is_superadmin() is True


# ════════════════════════════════════════════════════════════════════════════
# 4. TenantContext helpers
# ════════════════════════════════════════════════════════════════════════════

class TestTenantContext:
    def test_user_is_not_admin(self):
        ctx = TenantContext(TENANT_ID, Role.USER, USER_KEY)
        assert ctx.is_admin_or_above() is False
        assert ctx.is_superadmin()     is False

    def test_admin_is_admin(self):
        ctx = TenantContext(TENANT_ID, Role.ADMIN, ADMIN_KEY)
        assert ctx.is_admin_or_above() is True
        assert ctx.is_superadmin()     is False

    def test_superadmin_is_all(self):
        ctx = TenantContext("tenant_master", Role.SUPERADMIN, SUPERADMIN_KEY)
        assert ctx.is_admin_or_above() is True
        assert ctx.is_superadmin()     is True


# ════════════════════════════════════════════════════════════════════════════
# 5. HTTP — /auth/token
# ════════════════════════════════════════════════════════════════════════════

class TestAuthTokenEndpoint:
    def test_valid_key_returns_token(self, client):
        resp = client.post("/auth/token", json={"api_key": SUPERADMIN_KEY})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"]       == "superadmin"

    def test_invalid_key_returns_401(self, client):
        resp = client.post("/auth/token", json={"api_key": "sk-wrong-key"})
        assert resp.status_code == 401

    def test_token_response_has_tenant_id(self, client):
        resp = client.post("/auth/token", json={"api_key": SUPERADMIN_KEY})
        assert resp.json()["tenant_id"] == "tenant_master"

    def test_token_response_has_expires_in(self, client):
        resp = client.post("/auth/token", json={"api_key": SUPERADMIN_KEY})
        assert resp.json()["expires_in"] > 0

    def test_user_key_token_has_user_role(self, client):
        _seed_tenant_with_keys()
        resp = client.post("/auth/token", json={"api_key": USER_KEY})
        assert resp.status_code == 200
        assert resp.json()["role"] == "user"


# ════════════════════════════════════════════════════════════════════════════
# 6. HTTP — /auth/me
# ════════════════════════════════════════════════════════════════════════════

class TestWhoAmI:
    def test_superadmin_whoami(self, client):
        resp = client.get("/auth/me", headers={"X-API-Key": SUPERADMIN_KEY})
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "superadmin"
        # New RBAC: permissions is a sorted list of permission strings
        assert isinstance(data["permissions"], list)
        assert "tenant:manage" in data["permissions"]
        assert "metrics:view"  in data["permissions"]
        assert "guardrails:reset_cb" in data["permissions"]

    def test_admin_whoami(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/auth/me", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "admin"
        assert isinstance(data["permissions"], list)
        assert "metrics:view"   in data["permissions"]
        assert "tenant:manage"  not in data["permissions"]   # SUPERADMIN only
        assert "user:manage"    not in data["permissions"]   # SUPERADMIN only

    def test_user_whoami(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/auth/me", headers={"X-API-Key": USER_KEY})
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "user"
        assert isinstance(data["permissions"], list)
        assert "metrics:view"   not in data["permissions"]
        assert "tenant:manage"  not in data["permissions"]
        assert "analysis:run"   in data["permissions"]

    def test_no_auth_returns_401(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_jwt_bearer_whoami(self, client):
        token = create_access_token("tenant_master", Role.SUPERADMIN, SUPERADMIN_KEY, "Master")
        resp  = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "superadmin"

    def test_invalid_bearer_returns_401(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert resp.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# 7. HTTP — /admin/tenants (SUPERADMIN only)
# ════════════════════════════════════════════════════════════════════════════

class TestAdminTenants:
    def test_superadmin_can_create_tenant(self, client):
        resp = client.post(
            "/admin/tenants",
            json={"name": "Acme Corp", "admin_description": "Acme admin key"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "tenant_id"  in data
        assert "admin_key"  in data
        assert data["admin_key"].startswith("sk-")
        assert data["role"] == "admin"

    def test_admin_cannot_create_tenant(self, client):
        _seed_tenant_with_keys()
        resp = client.post(
            "/admin/tenants",
            json={"name": "Corp B"},
            headers={"X-API-Key": ADMIN_KEY},
        )
        assert resp.status_code == 403

    def test_user_cannot_create_tenant(self, client):
        _seed_tenant_with_keys()
        resp = client.post(
            "/admin/tenants",
            json={"name": "Corp C"},
            headers={"X-API-Key": USER_KEY},
        )
        assert resp.status_code == 403

    def test_no_auth_cannot_create_tenant(self, client):
        resp = client.post("/admin/tenants", json={"name": "Corp D"})
        assert resp.status_code == 401

    def test_superadmin_can_list_tenants(self, client):
        resp = client.get("/admin/tenants", headers={"X-API-Key": SUPERADMIN_KEY})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_admin_cannot_list_tenants(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/admin/tenants", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 403

    def test_created_tenant_appears_in_list(self, client):
        client.post(
            "/admin/tenants",
            json={"name": "Listed Corp"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        tenants = client.get("/admin/tenants", headers={"X-API-Key": SUPERADMIN_KEY}).json()
        names = [t["name"] for t in tenants]
        assert "Listed Corp" in names


# ════════════════════════════════════════════════════════════════════════════
# 8. HTTP — /admin/tenants/{id}/keys
# ════════════════════════════════════════════════════════════════════════════

class TestAddKeys:
    def test_superadmin_can_add_user_key(self, client):
        # Create tenant first
        cr = client.post(
            "/admin/tenants",
            json={"name": "KeyTest Corp"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        tid = cr.json()["tenant_id"]
        resp = client.post(
            f"/admin/tenants/{tid}/keys",
            json={"role": "user", "description": "end user key"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "user"
        assert data["key"].startswith("sk-")

    def test_cannot_create_superadmin_key_via_api(self, client):
        cr = client.post(
            "/admin/tenants",
            json={"name": "Corp X"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        tid = cr.json()["tenant_id"]
        resp = client.post(
            f"/admin/tenants/{tid}/keys",
            json={"role": "superadmin"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 400

    def test_invalid_role_returns_400(self, client):
        cr = client.post(
            "/admin/tenants",
            json={"name": "Corp Y"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        tid = cr.json()["tenant_id"]
        resp = client.post(
            f"/admin/tenants/{tid}/keys",
            json={"role": "wizard"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 400

    def test_add_key_for_unknown_tenant_returns_404(self, client):
        resp = client.post(
            "/admin/tenants/tenant_does_not_exist/keys",
            json={"role": "user"},
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# 9. HTTP — /admin/keys/{key} (revoke)
# ════════════════════════════════════════════════════════════════════════════

class TestRevokeKey:
    def test_superadmin_can_revoke_key(self, client):
        _seed_tenant_with_keys()
        resp = client.delete(
            f"/admin/keys/{USER_KEY}",
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"
        # Verify key no longer works
        assert client.get("/auth/me", headers={"X-API-Key": USER_KEY}).status_code == 401

    def test_revoke_unknown_key_returns_404(self, client):
        resp = client.delete(
            "/admin/keys/sk-does-not-exist",
            headers={"X-API-Key": SUPERADMIN_KEY},
        )
        assert resp.status_code == 404

    def test_admin_cannot_revoke_key(self, client):
        _seed_tenant_with_keys()
        resp = client.delete(
            f"/admin/keys/{USER_KEY}",
            headers={"X-API-Key": ADMIN_KEY},
        )
        assert resp.status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# 10. HTTP — /admin/my-tenant and /admin/my-keys
# ════════════════════════════════════════════════════════════════════════════

class TestMyTenant:
    def test_admin_can_see_own_tenant(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/admin/my-tenant", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200
        assert resp.json()["tenant_id"] == TENANT_ID

    def test_user_can_see_own_tenant(self, client):
        # RBAC: USER now has TENANT__VIEW_OWN permission — can see own tenant info
        _seed_tenant_with_keys()
        resp = client.get("/admin/my-tenant", headers={"X-API-Key": USER_KEY})
        assert resp.status_code == 200
        assert resp.json()["tenant_id"] == TENANT_ID

    def test_admin_can_list_own_keys(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/admin/my-keys", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200
        keys = [k["key"] for k in resp.json()]
        assert ADMIN_KEY in keys
        assert USER_KEY  in keys

    def test_my_keys_does_not_show_other_tenant_keys(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/admin/my-keys", headers={"X-API-Key": ADMIN_KEY})
        keys = [k["key"] for k in resp.json()]
        assert SUPERADMIN_KEY not in keys


# ════════════════════════════════════════════════════════════════════════════
# 11. Analysis endpoints — auth enforcement
# ════════════════════════════════════════════════════════════════════════════

class TestAnalysisAuthEnforcement:
    VALID_PAYLOAD = {
        "user_profile": {
            "full_name":     "Test User",
            "date_of_birth": "1990-01-01",
            "time_of_birth": "12:00",
            "place_of_birth": "Mumbai",
            "alias_name":    "",
            "pincode":       "",
        },
        "user_id":       "test-001",
        "user_question": "Tell me about my career.",
        "bypass_cache":  False,
    }

    def test_run_without_auth_returns_401(self, client):
        resp = client.post("/api/v1/analysis/run", json=self.VALID_PAYLOAD)
        assert resp.status_code == 401

    def test_run_with_invalid_key_returns_401(self, client):
        resp = client.post(
            "/api/v1/analysis/run",
            json=self.VALID_PAYLOAD,
            headers={"X-API-Key": "sk-fake-key"},
        )
        assert resp.status_code == 401

    def test_run_with_user_key_is_allowed(self, client):
        _seed_tenant_with_keys()
        # With no LLM key we expect a non-401/403 response (500 or 200 from cache)
        resp = client.post(
            "/api/v1/analysis/run",
            json=self.VALID_PAYLOAD,
            headers={"X-API-Key": USER_KEY},
        )
        assert resp.status_code != 401
        assert resp.status_code != 403

    def test_approve_without_auth_returns_401(self, client):
        resp = client.post("/api/v1/analysis/approve", json={
            "session_id": "fake-session", "approved_insight_ids": [],
            "rejected_insight_ids": [], "brand_name": "Test",
            "logo_url": "", "image_url": "",
        })
        assert resp.status_code == 401

    def test_translate_without_auth_returns_401(self, client):
        resp = client.post("/api/v1/analysis/translate", json={
            "session_id": "fake", "language_code": "hi", "report": {},
        })
        assert resp.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# 12. Admin/guardrail endpoints — role enforcement
# ════════════════════════════════════════════════════════════════════════════

class TestAdminEndpointRoles:
    def test_metrics_without_auth_returns_401(self, client):
        resp = client.get("/api/v1/metrics")
        assert resp.status_code == 401

    def test_metrics_with_user_key_returns_403(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/api/v1/metrics", headers={"X-API-Key": USER_KEY})
        assert resp.status_code == 403

    def test_metrics_with_admin_key_returns_200(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/api/v1/metrics", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200

    def test_guardrail_stats_without_auth_returns_401(self, client):
        resp = client.get("/guardrails/stats")
        assert resp.status_code == 401

    def test_guardrail_stats_with_user_returns_403(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/guardrails/stats", headers={"X-API-Key": USER_KEY})
        assert resp.status_code == 403

    def test_guardrail_stats_with_admin_returns_200(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/guardrails/stats", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200

    def test_circuit_breaker_reset_with_admin_returns_403(self, client):
        _seed_tenant_with_keys()
        resp = client.post("/guardrails/circuit-breaker/reset",
                           headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 403

    def test_circuit_breaker_reset_with_superadmin_returns_200(self, client):
        resp = client.post("/guardrails/circuit-breaker/reset",
                           headers={"X-API-Key": SUPERADMIN_KEY})
        assert resp.status_code == 200

    def test_cache_stats_with_user_returns_403(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/cache/stats", headers={"X-API-Key": USER_KEY})
        assert resp.status_code == 403

    def test_cache_stats_with_admin_returns_200(self, client):
        _seed_tenant_with_keys()
        resp = client.get("/cache/stats", headers={"X-API-Key": ADMIN_KEY})
        assert resp.status_code == 200

    def test_health_is_public(self, client):
        """Health check must be public — no auth required."""
        resp = client.get("/health")
        assert resp.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# 13. JWT Bearer auth on protected endpoints
# ════════════════════════════════════════════════════════════════════════════

class TestJWTBearerOnEndpoints:
    def test_metrics_with_admin_jwt(self, client):
        _seed_tenant_with_keys()
        token = create_access_token(TENANT_ID, Role.ADMIN, ADMIN_KEY, "Test Corp")
        resp  = client.get("/api/v1/metrics",
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_metrics_with_user_jwt_returns_403(self, client):
        _seed_tenant_with_keys()
        token = create_access_token(TENANT_ID, Role.USER, USER_KEY, "Test Corp")
        resp  = client.get("/api/v1/metrics",
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_revoked_key_jwt_returns_401(self, client):
        _seed_tenant_with_keys()
        token = create_access_token(TENANT_ID, Role.ADMIN, ADMIN_KEY)
        # Revoke the key AFTER creating the token
        store.revoke_key(ADMIN_KEY)
        resp = client.get("/api/v1/metrics",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
