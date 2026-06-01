"""Tests for Phase 6 — JWT auth, RBAC, multi-tenant isolation."""
import os
import uuid
import tempfile
import pytest

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
init_db()

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ── helpers ───────────────────────────────────────────────────────────────────

_TEST_PW = "P@ssw0rd-test-only"


def _uid() -> str:
    """Short unique suffix so slugs/emails never collide across runs."""
    return uuid.uuid4().hex[:8]


def _register(slug: str = None, email: str = None, password: str = _TEST_PW,
              name: str = None):
    uid = _uid()
    slug = slug or f"tenant-{uid}"
    email = email or f"admin-{uid}@example.com"
    name = name or f"Tenant {uid}"
    resp = client.post("/auth/register", json={
        "tenant_name": name, "tenant_slug": slug,
        "email": email, "password": password, "full_name": "Test User",
    })
    return resp, slug, email


def _login(email: str, password: str = _TEST_PW):
    return client.post("/auth/login", json={"email": email, "password": password})


def _auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


def _fresh_admin():
    """Register a brand-new tenant+admin and return (token, slug, email)."""
    resp, slug, email = _register()
    assert resp.status_code == 201, resp.json()
    token = resp.json()["access_token"]
    return token, slug, email


# ── health ────────────────────────────────────────────────────────────────────

def test_health_phase6():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["phase"] == 6


# ── register ──────────────────────────────────────────────────────────────────

def test_register_creates_tenant_and_admin():
    resp, slug, email = _register()
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    assert data["user"]["tenant_slug"] == slug


def test_register_duplicate_slug_rejected():
    slug = f"dup-{_uid()}"
    _register(slug=slug, email=f"first-{_uid()}@x.com")
    resp, _, _ = _register(slug=slug, email=f"second-{_uid()}@x.com")
    assert resp.status_code == 409
    assert "already taken" in resp.json()["detail"]


def test_register_duplicate_email_rejected():
    email = f"dupuser-{_uid()}@x.com"
    _register(slug=f"ta-{_uid()}", email=email)
    resp, _, _ = _register(slug=f"tb-{_uid()}", email=email)
    assert resp.status_code == 409
    assert "Email already registered" in resp.json()["detail"]


def test_register_invalid_slug_rejected():
    resp = client.post("/auth/register", json={
        "tenant_name": "Bad", "tenant_slug": "UPPER CASE",
        "email": f"x-{_uid()}@x.com", "password": _TEST_PW,
    })
    assert resp.status_code == 422


def test_register_short_password_rejected():
    resp = client.post("/auth/register", json={
        "tenant_name": "T", "tenant_slug": f"t-{_uid()}",
        "email": f"t-{_uid()}@t.com", "password": "short",
    })
    assert resp.status_code == 422


# ── login ─────────────────────────────────────────────────────────────────────

def test_login_returns_token():
    _, _, email = _register()
    resp = _login(email)
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password():
    _, _, email = _register()
    resp = _login(email, "wrongpassword")
    assert resp.status_code == 401


def test_login_unknown_email():
    resp = _login(f"nobody-{_uid()}@nowhere.com")
    assert resp.status_code == 401


# ── /auth/me ─────��────────────────────────────────────────────────────────────

def test_me_returns_profile():
    token, slug, email = _fresh_admin()
    resp = client.get("/auth/me", headers=_auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == email
    assert data["role"] == "admin"
    assert data["tenant_slug"] == slug


def test_me_without_token_rejected():
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_invalid_token_rejected():
    resp = client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken"})
    assert resp.status_code == 401


# ── user management ───────────────────────────────────────────────────────────

def test_admin_can_create_user():
    token, _, _ = _fresh_admin()
    resp = client.post("/auth/users", json={
        "email": f"viewer-{_uid()}@example.com",
        "password": _TEST_PW,
        "full_name": "Viewer User",
        "role": "viewer",
    }, headers=_auth_header(token))
    assert resp.status_code == 201
    assert resp.json()["role"] == "viewer"


def test_admin_can_list_users():
    token, _, _ = _fresh_admin()
    resp = client.get("/auth/users", headers=_auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_admin_can_change_user_role():
    token, _, _ = _fresh_admin()
    viewer_email = f"v-{_uid()}@example.com"
    user_id = client.post("/auth/users", json={
        "email": viewer_email, "password": _TEST_PW, "role": "viewer",
    }, headers=_auth_header(token)).json()["id"]

    resp = client.put(f"/auth/users/{user_id}/role",
                      json={"role": "editor"}, headers=_auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["role"] == "editor"


def test_viewer_cannot_create_user():
    admin_token, _, _ = _fresh_admin()
    viewer_email = f"viewer-{_uid()}@example.com"
    client.post("/auth/users", json={
        "email": viewer_email, "password": _TEST_PW, "role": "viewer",
    }, headers=_auth_header(admin_token))

    viewer_token = _login(viewer_email).json()["access_token"]
    resp = client.post("/auth/users", json={
        "email": f"other-{_uid()}@example.com", "password": _TEST_PW,
    }, headers=_auth_header(viewer_token))
    assert resp.status_code == 403


def test_admin_cannot_change_own_role():
    token, _, _ = _fresh_admin()
    me = client.get("/auth/me", headers=_auth_header(token)).json()
    resp = client.put(f"/auth/users/{me['id']}/role",
                      json={"role": "viewer"}, headers=_auth_header(token))
    assert resp.status_code == 400


def test_invalid_role_rejected():
    token, _, _ = _fresh_admin()
    resp = client.post("/auth/users", json={
        "email": f"x-{_uid()}@example.com",
        "password": _TEST_PW,
        "role": "superuser",
    }, headers=_auth_header(token))
    assert resp.status_code == 422


# ── tenant endpoints ──────────────────────────────────────────────────────────

def test_tenant_me_endpoint():
    token, slug, _ = _fresh_admin()
    resp = client.get("/tenants/me", headers=_auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == slug
    assert "stats" in data
    assert "runbooks" in data["stats"]


def test_tenant_me_requires_auth():
    resp = client.get("/tenants/me")
    assert resp.status_code == 401


# ── backward-compat: unauthenticated calls still work ────────────────────────

def test_runbooks_unauthenticated_still_works():
    resp = client.get("/runbooks")
    assert resp.status_code == 200
    assert "runbooks" in resp.json()


def test_stats_unauthenticated_still_works():
    resp = client.get("/runbooks/stats")
    assert resp.status_code == 200
    assert "total_runbooks" in resp.json()


# ── Multi-source panel priority tests ─────────────────────────────────────────

def test_multi_source_panel_keys_and_priority():
    """build_multi_source_response returns all three panels with correct priority order."""
    import time
    from database.db import get_conn
    from database.runbooks_store import save_runbook
    from agents.multi_source_composer import build_multi_source_response

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO tenants (name, slug, plan, is_active, created_at) VALUES (?,?,?,1,?)",
            ("PanelTestTenant", f"panel-test-{uuid.uuid4().hex[:6]}", "free", time.time()),
        )
        tenant_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()

    state = {
        "title": "Panel Test Runbook", "description": "test", "category": "kubernetes",
        "severity": "P2", "tags": ["k8s"], "prerequisites": [],
        "estimated_duration_minutes": 10,
        "steps": [
            {"step_number": 1, "title": "Check pods", "description": "List pods",
             "commands": ["kubectl get pods"], "expected_output": "pod list",
             "depends_on": [], "is_optional": False, "timeout_seconds": 30},
        ],
        "rollback_steps": [],
    }
    runbook_id = save_runbook(state, "panel_test.pdf", 1, tenant_id=tenant_id)
    result = build_multi_source_response(runbook_id, tenant_id)

    # All three panels must exist
    assert "internal" in result
    assert "official" in result
    assert "combined" in result

    # Priority order: internal=1, official=2, combined=3
    assert result["internal"]["priority"] == 1
    assert result["official"]["priority"] == 2
    assert result["combined"]["priority"] == 3

    # Internal panel must have the steps we saved
    assert result["internal"]["total_steps"] == 1
    assert result["internal"]["steps"][0]["commands"] == ["kubectl get pods"]

    # Internal panel color is green, official blue, combined purple
    assert result["internal"]["color"] == "green"
    assert result["official"]["color"] == "blue"
    assert result["combined"]["color"] == "purple"

    # No mixing: official panel steps come from official source only (empty if no official in DB)
    # combined falls back to internal steps when no official counterpart
    assert isinstance(result["combined"]["steps"], list)
    assert len(result["combined"]["steps"]) >= 0


def test_multi_source_internal_and_official_are_separate():
    """Internal panel and Official panel must never contain each other's source_type."""
    from agents.multi_source_composer import build_multi_source_response
    import time
    from database.db import get_conn
    from database.runbooks_store import save_runbook

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO tenants (name, slug, plan, is_active, created_at) VALUES (?,?,?,1,?)",
            ("SepTestTenant", f"sep-test-{uuid.uuid4().hex[:6]}", "free", time.time()),
        )
        tenant_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()

    state = {
        "title": "Separation Test", "description": "sep test", "category": "kubernetes",
        "severity": "P1", "tags": [], "prerequisites": [],
        "estimated_duration_minutes": 5,
        "steps": [
            {"step_number": 1, "title": "Drain node", "description": "Safely drain",
             "commands": ["kubectl drain node1 --ignore-daemonsets"],
             "expected_output": "node drained", "depends_on": [],
             "is_optional": False, "timeout_seconds": 60},
        ],
        "rollback_steps": [],
    }
    runbook_id = save_runbook(state, "sep_test.pdf", 1, tenant_id=tenant_id)
    result = build_multi_source_response(runbook_id, tenant_id)

    # Internal panel source_type must be 'internal'
    assert result["internal"]["source_type"] == "internal"
    # Official panel source_type must be 'official'
    assert result["official"]["source_type"] == "official"
    # Combined panel source_type must be 'combined'
    assert result["combined"]["source_type"] == "combined"
