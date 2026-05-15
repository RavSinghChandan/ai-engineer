"""
OTP Login Test Suite — tests/test_otp.py
=========================================
Tests the full OTP flow: send → verify → JWT issued.

Run:  python -m pytest tests/test_otp.py -v
"""
import pytest, time
from fastapi.testclient import TestClient

import auth.router as auth_router_mod
import auth.users  as users_store
import auth.store  as auth_store

# ── App import (loads all stores) ────────────────────────────────────────────
from main import app

client = TestClient(app)

KNOWN_EMAIL = "otptest_unique@example.com"
KNOWN_NAME  = "OTP Tester"
KNOWN_PASS  = "OtpPass123!"


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _clean():
    """Reset OTP store and rate limiters between tests."""
    auth_router_mod._otp_store.clear()
    auth_router_mod._otp_send_attempts.clear()
    auth_router_mod._login_attempts.clear()
    yield
    auth_router_mod._otp_store.clear()
    auth_router_mod._otp_send_attempts.clear()
    auth_router_mod._login_attempts.clear()


@pytest.fixture(scope="module")
def registered_user():
    """Ensure KNOWN_EMAIL is registered before OTP tests run."""
    users_store.load()
    auth_store.load()
    existing = users_store.get_by_email(KNOWN_EMAIL)
    if not existing:
        resp = client.post("/auth/register", json={
            "name": KNOWN_NAME, "email": KNOWN_EMAIL, "password": KNOWN_PASS,
        })
        assert resp.status_code in (200, 201), f"Register failed: {resp.text}"
    return KNOWN_EMAIL


# ── Helper ────────────────────────────────────────────────────────────────────

def _inject_otp(email: str, code: str = "123456", ttl: int = 600):
    """Bypass email delivery — inject code directly into the OTP store."""
    auth_router_mod._otp_store[email.lower().strip()] = {
        "code": code,
        "expires_at": time.time() + ttl,
    }


# ── 1. POST /auth/otp/send ────────────────────────────────────────────────────

class TestOtpSend:

    def test_send_known_email_returns_200(self, registered_user):
        resp = client.post("/auth/otp/send", json={"email": registered_user})
        assert resp.status_code == 200
        assert "message" in resp.json()

    def test_send_unknown_email_returns_same_message(self):
        resp = client.post("/auth/otp/send", json={"email": "nobody@nowhere.com"})
        assert resp.status_code == 200
        # Must not reveal whether email exists (anti-enumeration)
        data = resp.json()
        assert "message" in data
        assert "registered" in data["message"].lower()

    def test_send_stores_otp_for_known_email(self, registered_user):
        client.post("/auth/otp/send", json={"email": registered_user})
        assert registered_user.lower() in auth_router_mod._otp_store

    def test_send_does_not_store_otp_for_unknown_email(self):
        client.post("/auth/otp/send", json={"email": "ghost@nowhere.xyz"})
        assert "ghost@nowhere.xyz" not in auth_router_mod._otp_store

    def test_send_code_is_6_digits(self, registered_user):
        client.post("/auth/otp/send", json={"email": registered_user})
        entry = auth_router_mod._otp_store.get(registered_user.lower())
        assert entry is not None
        assert len(entry["code"]) == 6
        assert entry["code"].isdigit()

    def test_send_code_expires_in_future(self, registered_user):
        client.post("/auth/otp/send", json={"email": registered_user})
        entry = auth_router_mod._otp_store.get(registered_user.lower())
        assert entry["expires_at"] > time.time()

    def test_send_rate_limit_blocks_after_3_sends(self, registered_user):
        for _ in range(3):
            r = client.post("/auth/otp/send", json={"email": registered_user})
            assert r.status_code == 200
        # 4th should be blocked
        r = client.post("/auth/otp/send", json={"email": registered_user})
        assert r.status_code == 429
        assert "wait" in r.json()["detail"].lower()

    def test_send_email_case_insensitive(self, registered_user):
        upper = registered_user.upper()
        resp = client.post("/auth/otp/send", json={"email": upper})
        assert resp.status_code == 200
        # OTP stored under lowercase key
        assert registered_user.lower() in auth_router_mod._otp_store

    def test_send_missing_email_field_returns_422(self):
        resp = client.post("/auth/otp/send", json={})
        assert resp.status_code == 422


# ── 2. POST /auth/otp/verify ──────────────────────────────────────────────────

class TestOtpVerify:

    def test_valid_code_returns_jwt(self, registered_user):
        _inject_otp(registered_user, "654321")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "654321",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_valid_code_clears_otp_store(self, registered_user):
        _inject_otp(registered_user, "111111")
        client.post("/auth/otp/verify", json={"email": registered_user, "code": "111111"})
        assert registered_user.lower() not in auth_router_mod._otp_store

    def test_wrong_code_returns_401(self, registered_user):
        _inject_otp(registered_user, "999999")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "000000",
        })
        assert resp.status_code == 401

    def test_expired_code_returns_401(self, registered_user):
        auth_router_mod._otp_store[registered_user.lower()] = {
            "code": "777777",
            "expires_at": time.time() - 1,  # already expired
        }
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "777777",
        })
        assert resp.status_code == 401

    def test_code_is_single_use(self, registered_user):
        _inject_otp(registered_user, "222222")
        r1 = client.post("/auth/otp/verify", json={"email": registered_user, "code": "222222"})
        assert r1.status_code == 200
        # Second use must fail
        r2 = client.post("/auth/otp/verify", json={"email": registered_user, "code": "222222"})
        assert r2.status_code == 401

    def test_verify_unknown_email_returns_401(self):
        resp = client.post("/auth/otp/verify", json={
            "email": "phantom@nobody.xyz", "code": "000000",
        })
        assert resp.status_code == 401

    def test_verify_missing_code_returns_422(self, registered_user):
        resp = client.post("/auth/otp/verify", json={"email": registered_user})
        assert resp.status_code == 422

    def test_verify_code_whitespace_trimmed(self, registered_user):
        _inject_otp(registered_user, "333333")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "  333333  ",
        })
        assert resp.status_code == 200

    def test_jwt_contains_correct_role(self, registered_user):
        _inject_otp(registered_user, "444444")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "444444",
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        # Use /auth/me to check role via the JWT
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["role"] in ("user", "admin", "superadmin")

    def test_jwt_contains_email(self, registered_user):
        _inject_otp(registered_user, "555555")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": "555555",
        })
        token = resp.json()["access_token"]
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["email"] == registered_user.lower()

    def test_verify_email_case_insensitive(self, registered_user):
        _inject_otp(registered_user, "666666")
        resp = client.post("/auth/otp/verify", json={
            "email": registered_user.upper(), "code": "666666",
        })
        assert resp.status_code == 200


# ── 3. Full flow: send → verify ───────────────────────────────────────────────

class TestOtpFullFlow:

    def test_full_otp_login_flow(self, registered_user):
        # Step 1: request OTP
        send = client.post("/auth/otp/send", json={"email": registered_user})
        assert send.status_code == 200

        # Step 2: grab the code from in-process store (as backend would)
        entry = auth_router_mod._otp_store.get(registered_user.lower())
        assert entry is not None
        code = entry["code"]

        # Step 3: verify
        verify = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": code,
        })
        assert verify.status_code == 200
        assert "access_token" in verify.json()

    def test_otp_login_grants_access_to_protected_route(self, registered_user):
        client.post("/auth/otp/send", json={"email": registered_user})
        code = auth_router_mod._otp_store[registered_user.lower()]["code"]
        token = client.post("/auth/otp/verify", json={
            "email": registered_user, "code": code,
        }).json()["access_token"]

        # Should be able to hit a user-protected endpoint
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200

    def test_second_send_overwrites_first_code(self, registered_user):
        client.post("/auth/otp/send", json={"email": registered_user})
        code1 = auth_router_mod._otp_store[registered_user.lower()]["code"]

        auth_router_mod._otp_send_attempts.clear()  # reset rate limit
        client.post("/auth/otp/send", json={"email": registered_user})
        code2 = auth_router_mod._otp_store[registered_user.lower()]["code"]

        # Old code is gone — only the latest works
        r = client.post("/auth/otp/verify", json={"email": registered_user, "code": code1})
        # If codes differ, first should fail
        if code1 != code2:
            assert r.status_code == 401
