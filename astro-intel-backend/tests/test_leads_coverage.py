"""
Coverage boost for:
  - leads/store.py    (41% → 85%+)
  - leads/router.py   (50% → 80%+)
  - email_service.py  (51% → 75%+)
"""
from __future__ import annotations
import os
import sys
import time
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
import auth.store as auth_store
from auth.models import Role
from database import get_conn

ADMIN_KEY = "sk-leads-cov-admin"
USER_KEY  = "sk-leads-cov-user"
TENANT_ID = "tenant_leads_cov"


def _insert_key(tenant_id, tenant_name, key, role):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,1,?)",
            (tenant_id, tenant_name, time.time()),
        )
        conn.execute(
            "INSERT OR IGNORE INTO api_keys (key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,1,?)",
            (key, tenant_id, role.value, "test", time.time()),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def reset_state():
    auth_store.clear_for_tests()
    _insert_key(TENANT_ID, "Leads Cov Tenant", ADMIN_KEY, Role.ADMIN)
    _insert_key(TENANT_ID, "Leads Cov Tenant", USER_KEY, Role.USER)
    import leads.store as lstore
    lstore.clear_for_tests()
    yield
    auth_store.clear_for_tests()
    lstore.clear_for_tests()


@pytest.fixture()
def client():
    import cache.store as cache_store
    cache_store.clear()
    return TestClient(app, raise_server_exceptions=False)


ADMIN_H = {"X-API-Key": ADMIN_KEY}
USER_H  = {"X-API-Key": USER_KEY}

_GOOD_LEAD = {
    "name": "Arjun Sharma",
    "email": "arjun@test.com",
    "phone": "9876543210",
    "dob": "1990-05-15",
    "consent": True,
    "place_of_birth": "Delhi",
    "time_of_birth": "10:30",
    "alias_name": "",
    "question": "What does my chart say about my career?",
    "preferred_language": "en",
}


class TestLeadsStore:
    def test_create_lead_returns_lead(self):
        import leads.store as ls
        lead = ls.create_lead(
            name="Test User", email="t@t.com", phone="9876543210",
            dob="1990-01-01", consent=True, place_of_birth="Mumbai",
            tenant_id=TENANT_ID,
        )
        assert lead.lead_id.startswith("lead_")
        assert lead.status == "submitted"

    def test_get_lead_missing_returns_none(self):
        import leads.store as ls
        result = ls.get_lead("lead_nonexistent_xyz")
        assert result is None

    def test_get_lead_found(self):
        import leads.store as ls
        lead = ls.create_lead("Test", "t@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        found = ls.get_lead(lead.lead_id)
        assert found is not None
        assert found.lead_id == lead.lead_id

    def test_list_leads_returns_list(self):
        import leads.store as ls
        ls.create_lead("A", "a@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        result = ls.list_leads()
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_list_leads_for_tenant(self):
        import leads.store as ls
        ls.create_lead("A", "a@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        result = ls.list_leads_for_tenant(TENANT_ID)
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_update_status_success(self):
        import leads.store as ls
        lead = ls.create_lead("B", "b@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        updated = ls.update_status(lead.lead_id, "reviewed", "Looks good")
        assert updated is not None
        assert updated.status == "reviewed"

    def test_update_status_not_found(self):
        import leads.store as ls
        result = ls.update_status("nonexistent", "reviewed")
        assert result is None

    def test_attach_report_success(self):
        import leads.store as ls
        lead = ls.create_lead("C", "c@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        updated = ls.attach_report(lead.lead_id, '{"sections": []}')
        assert updated is not None
        assert updated.report_json == '{"sections": []}'

    def test_attach_report_not_found(self):
        import leads.store as ls
        result = ls.attach_report("nonexistent", "{}")
        assert result is None

    def test_has_pending_lead_false_when_empty(self):
        import leads.store as ls
        result = ls.has_pending_lead("tenant_no_leads")
        assert result is False

    def test_has_pending_lead_true_when_submitted(self):
        import leads.store as ls
        ls.create_lead("D", "d@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        result = ls.has_pending_lead(TENANT_ID)
        assert result is True

    def test_count_new_returns_int(self):
        import leads.store as ls
        result = ls.count_new()
        assert isinstance(result, int)

    def test_clear_for_tests(self):
        import leads.store as ls
        ls.create_lead("E", "e@t.com", "9", "1990-01-01", True, tenant_id=TENANT_ID)
        ls.clear_for_tests()
        assert len(ls.list_leads()) == 0


class TestLeadsRouter:
    def test_submit_lead_success(self, client):
        resp = client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        assert resp.status_code == 201
        data = resp.json()
        assert "lead_id" in data

    def test_submit_lead_no_consent_returns_400(self, client):
        payload = {**_GOOD_LEAD, "consent": False}
        resp = client.post("/leads", json=payload, headers=USER_H)
        assert resp.status_code == 400

    def test_submit_lead_empty_name_returns_400(self, client):
        payload = {**_GOOD_LEAD, "name": "   "}
        resp = client.post("/leads", json=payload, headers=USER_H)
        assert resp.status_code == 400

    def test_submit_lead_invalid_email_returns_400(self, client):
        payload = {**_GOOD_LEAD, "email": "not-an-email"}
        resp = client.post("/leads", json=payload, headers=USER_H)
        assert resp.status_code == 400

    def test_submit_lead_no_place_of_birth_returns_400(self, client):
        payload = {**_GOOD_LEAD, "place_of_birth": ""}
        resp = client.post("/leads", json=payload, headers=USER_H)
        assert resp.status_code == 400

    def test_submit_lead_no_question_returns_400(self, client):
        payload = {**_GOOD_LEAD, "question": "  "}
        resp = client.post("/leads", json=payload, headers=USER_H)
        assert resp.status_code == 400

    def test_submit_lead_duplicate_returns_409(self, client):
        client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        resp = client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        assert resp.status_code == 409

    def test_get_lead_not_found_returns_404(self, client):
        resp = client.get("/leads/lead_nonexistent_xyz", headers=USER_H)
        assert resp.status_code == 404

    def test_get_lead_found(self, client):
        resp = client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        lead_id = resp.json()["lead_id"]
        get_resp = client.get(f"/leads/{lead_id}", headers=USER_H)
        assert get_resp.status_code == 200
        assert get_resp.json()["lead_id"] == lead_id

    def test_count_new_admin(self, client):
        resp = client.get("/admin/leads/count-new", headers=ADMIN_H)
        assert resp.status_code == 200
        assert "count" in resp.json()

    def test_list_leads_admin(self, client):
        resp = client.get("/admin/leads", headers=ADMIN_H)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_update_status_invalid_status_returns_400(self, client):
        resp = client.patch("/admin/leads/any-lead/status",
                            json={"status": "invalid_status", "notes": ""},
                            headers=ADMIN_H)
        assert resp.status_code == 400

    def test_update_status_not_found_returns_404(self, client):
        resp = client.patch("/admin/leads/lead_nonexistent_xyz/status",
                            json={"status": "admin_notified", "notes": ""},
                            headers=ADMIN_H)
        assert resp.status_code == 404

    def test_update_status_success(self, client):
        create_resp = client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        lead_id = create_resp.json()["lead_id"]
        resp = client.patch(f"/admin/leads/{lead_id}/status",
                            json={"status": "admin_notified", "notes": "Good lead"},
                            headers=ADMIN_H)
        assert resp.status_code == 200

    def test_get_report_not_found_returns_404(self, client):
        resp = client.get("/leads/lead_nonexistent_xyz/report", headers=USER_H)
        assert resp.status_code == 404

    def test_get_report_no_report_attached_returns_404(self, client):
        create_resp = client.post("/leads", json=_GOOD_LEAD, headers=USER_H)
        lead_id = create_resp.json()["lead_id"]
        resp = client.get(f"/leads/{lead_id}/report", headers=USER_H)
        assert resp.status_code == 404


class TestEmailService:
    def test_send_otp_email_no_provider(self):
        from email_service import send_otp_email
        result = send_otp_email("test@example.com", "Test User", "123456")
        assert isinstance(result, bool)

    def test_send_report_ready_no_provider(self):
        from email_service import send_report_ready
        result = send_report_ready(
            to_email="user@test.com",
            to_name="Test User",
            report_summary="Your career looks promising.",
            lead_id="lead_abc123",
        )
        assert isinstance(result, bool)

    def test_otp_html_renders_code(self):
        from email_service import _otp_html
        result = _otp_html("Alice", "999888")
        assert "999888" in result
        assert "Alice" in result

    def test_report_html_renders(self):
        from email_service import _report_html
        result = _report_html("Bob", "Career is bright.", "https://example.com/report")
        assert isinstance(result, str)
        assert len(result) > 0
