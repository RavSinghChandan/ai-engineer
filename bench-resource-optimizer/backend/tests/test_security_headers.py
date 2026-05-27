"""
Phase 6 — Security headers middleware tests.

Verifies that every API response carries the required enterprise security
headers: HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy,
Permissions-Policy. Tests use the lightweight /health/live endpoint so no
auth or mocking is needed.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


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


PROBE = "/health/live"


class TestSecurityHeaders:

    def test_positive_hsts_header_present(self, client):
        resp = client.get(PROBE)
        assert "strict-transport-security" in {k.lower() for k in resp.headers}

    def test_positive_hsts_includes_subdomains(self, client):
        resp = client.get(PROBE)
        hsts = resp.headers.get("strict-transport-security", "")
        assert "includeSubDomains" in hsts
        assert "max-age=" in hsts

    def test_positive_x_content_type_options_nosniff(self, client):
        resp = client.get(PROBE)
        assert resp.headers.get("x-content-type-options") == "nosniff"

    def test_positive_x_frame_options_deny(self, client):
        resp = client.get(PROBE)
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_positive_referrer_policy_strict(self, client):
        resp = client.get(PROBE)
        assert "strict-origin" in resp.headers.get("referrer-policy", "")

    def test_positive_permissions_policy_restricts_geolocation(self, client):
        resp = client.get(PROBE)
        pp = resp.headers.get("permissions-policy", "")
        assert "geolocation=()" in pp

    def test_positive_csp_default_src_self(self, client):
        resp = client.get(PROBE)
        csp = resp.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp

    def test_positive_security_headers_present_on_404(self, client):
        """Security headers must appear on error responses too."""
        resp = client.get("/nonexistent-route")
        assert "x-content-type-options" in {k.lower() for k in resp.headers}

    def test_positive_x_request_id_present(self, client):
        """Correlation ID from logging middleware still present alongside security headers."""
        resp = client.get(PROBE)
        assert "x-request-id" in {k.lower() for k in resp.headers}

    def test_positive_security_headers_on_post_endpoints(self, client):
        """Security headers apply to POST responses too."""
        resp = client.post("/auth/login", json={"user_id": "admin", "password": "admin123"})
        assert "x-content-type-options" in {k.lower() for k in resp.headers}
        assert "x-frame-options" in {k.lower() for k in resp.headers}
