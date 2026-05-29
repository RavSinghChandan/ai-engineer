"""
Phase 2 — JWT authentication tests.

Covers:
  POST /auth/login    — valid credentials, bad password, missing fields, unknown user
  GET  /auth/me       — valid token, no token, expired token, admin token
  Protected endpoints — 401 without token, 403 non-admin to admin route
  Token expiry        — expired token returns 403
  Admin guard         — regular user on admin endpoint → 403
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from auth.jwt_handler import JWT_SECRET, JWT_ALGO, create_token


# ── Shared client (same lifespan-bypass as test_api.py) ──────────────────────

@pytest.fixture(scope="module")
def client():
    import sys
    from pathlib import Path

    backend_dir = Path(__file__).parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    mock_llm = MagicMock()
    mock_vs = MagicMock()

    patches = [
        patch("main._llm", mock_llm),
        patch("main._vector_store", mock_vs),
        patch("main.init_db", new=AsyncMock()),
        patch("main.build_vector_store", return_value=mock_vs),
        patch("main.get_embeddings", return_value=MagicMock()),
        patch("main.get_all_roles", return_value=[]),
        patch("main.init_bm25_from_roles"),
        patch("main.init_guardrail_persistence"),
        patch("main.flush_guardrail_stats"),
        patch("main.configure_logging"),
        patch("os.getenv", side_effect=lambda k, d=None: {
            "DEEPSEEK_API_KEY": "test_key",
            "DEEPSEEK_BASE_URL": "https://api.deepseek.com",
            "DEEPSEEK_MODEL": "deepseek-chat",
            "LOG_LEVEL": "INFO",
            "CORS_ORIGINS": "http://localhost:4200",
            "JWT_SECRET": "test-secret",
        }.get(k, d)),
    ]

    for p in patches:
        p.start()

    from main import app
    c = TestClient(app, raise_server_exceptions=False)
    yield c

    for p in patches:
        try:
            p.stop()
        except RuntimeError:
            pass


def _user_token() -> str:
    return create_token("test_user", "user").access_token


def _admin_token() -> str:
    return create_token("admin", "admin").access_token


def _expired_token() -> str:
    now = int(time.time())
    payload = {"sub": "old_user", "role": "user", "iat": now - 9000, "exp": now - 1}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# ═══════════════════════════════════════════════════════════════════════════════
# POST /auth/login
# ═══════════════════════════════════════════════════════════════════════════════

class TestLogin:

    def test_positive_admin_login_returns_token(self, client):
        resp = client.post("/auth/login", json={"user_id": "admin", "password": "test-admin-pass"})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["expires_in"] > 0

    def test_positive_regular_user_login_returns_token(self, client):
        resp = client.post("/auth/login", json={"user_id": "some_employee", "password": "test-user-pass"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_negative_wrong_password_returns_401(self, client):
        resp = client.post("/auth/login", json={"user_id": "admin", "password": "wrong"})
        assert resp.status_code == 401

    def test_negative_wrong_user_password_returns_401(self, client):
        resp = client.post("/auth/login", json={"user_id": "bob", "password": "badpass"})
        assert resp.status_code == 401

    def test_negative_missing_user_id_returns_422(self, client):
        resp = client.post("/auth/login", json={"password": "bench123"})
        assert resp.status_code == 422

    def test_negative_missing_password_returns_422(self, client):
        resp = client.post("/auth/login", json={"user_id": "bob"})
        assert resp.status_code == 422

    def test_negative_empty_body_returns_422(self, client):
        resp = client.post("/auth/login", json={})
        assert resp.status_code == 422

    def test_positive_token_is_valid_jwt(self, client):
        resp = client.post("/auth/login", json={"user_id": "admin", "password": "test-admin-pass"})
        token = resp.json()["access_token"]
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded["sub"] == "admin"
        assert decoded["role"] == "admin"

    def test_positive_regular_user_role_is_user(self, client):
        resp = client.post("/auth/login", json={"user_id": "alice", "password": "test-user-pass"})
        token = resp.json()["access_token"]
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded["role"] == "user"


# ═══════════════════════════════════════════════════════════════════════════════
# GET /auth/me
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuthMe:

    def test_positive_me_returns_user_claims(self, client):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {_user_token()}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "test_user"
        assert body["role"] == "user"

    def test_positive_admin_me_returns_admin_role(self, client):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {_admin_token()}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_negative_no_token_returns_401(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_negative_bad_token_returns_401(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer not.a.token"})
        assert resp.status_code == 401

    def test_negative_expired_token_returns_403(self, client):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {_expired_token()}"})
        assert resp.status_code == 403

    def test_negative_wrong_auth_scheme_returns_403(self, client):
        resp = client.get("/auth/me", headers={"Authorization": f"Basic {_user_token()}"})
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# Protected endpoint — no token → 401
# ═══════════════════════════════════════════════════════════════════════════════

class TestProtectedWithoutToken:

    def test_negative_upload_cv_no_token_returns_401(self, client):
        import io
        data = {"file": ("resume.pdf", io.BytesIO(b"%PDF test " + b"A" * 200), "application/pdf")}
        resp = client.post("/upload-cv", files=data)
        assert resp.status_code == 401

    def test_negative_map_role_no_token_returns_401(self, client):
        resp = client.post("/map-role", json={"user_id": "u1", "target_role": "Dev"})
        assert resp.status_code == 401

    def test_negative_generate_plan_no_token_returns_401(self, client):
        resp = client.post("/generate-plan", json={
            "user_id": "u1", "target_role": "Dev", "missing_skills": []
        })
        assert resp.status_code == 401

    def test_negative_update_progress_no_token_returns_401(self, client):
        resp = client.post("/update-progress", json={
            "user_id": "u1", "completed_task_ids": []
        })
        assert resp.status_code == 401

    def test_negative_get_progress_no_token_returns_401(self, client):
        resp = client.get("/progress/u1")
        assert resp.status_code == 401

    def test_negative_memory_no_token_returns_401(self, client):
        resp = client.get("/memory/u1")
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# Admin-only endpoints — user token → 403
# ═══════════════════════════════════════════════════════════════════════════════

class TestAdminGuard:

    def test_negative_user_cannot_create_role(self, client):
        payload = {
            "id": "test-guard-role", "title": "T", "description": "T",
            "required_skills": ["Python"], "preferred_skills": [],
            "experience_years": 1, "internal_notes": "",
        }
        with patch("main.create_role_db", new_callable=AsyncMock), \
                patch("main._rebuild_indexes", new_callable=AsyncMock):
            resp = client.post("/admin/roles", json=payload,
                               headers={"Authorization": f"Bearer {_user_token()}"})
        assert resp.status_code == 403

    def test_negative_user_cannot_delete_role(self, client):
        with patch("main.delete_role_db", new_callable=AsyncMock, return_value=True), \
                patch("main._rebuild_indexes", new_callable=AsyncMock):
            resp = client.delete("/admin/roles/some-role",
                                 headers={"Authorization": f"Bearer {_user_token()}"})
        assert resp.status_code == 403

    def test_positive_admin_can_delete_role(self, client):
        with patch("main.delete_role_db", new_callable=AsyncMock, return_value=True), \
                patch("main._rebuild_indexes", new_callable=AsyncMock):
            resp = client.delete("/admin/roles/some-role",
                                 headers={"Authorization": f"Bearer {_admin_token()}"})
        assert resp.status_code == 200
