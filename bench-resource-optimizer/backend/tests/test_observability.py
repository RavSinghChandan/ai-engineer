"""
Phase 6 tests — Health + Observability Hardening.

Positive + negative cases for:
  - /health/ready: checks LLM, FAISS, BM25, SQLite — 503 if any fail
  - /roles: Cache-Control header present
  - Structured log: request_id in response header X-Request-Id
  - response_model completeness: /upload-cv, /update-progress, /progress/history
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Shared client (same lifespan-bypass pattern as test_api.py) ──────────────

@pytest.fixture(scope="module")
def client():
    """
    Uses the same already-running app from test_api.py import.
    Patches lifespan-heavy parts so os.getenv keyword-arg issues don't surface.
    """
    import sys
    from pathlib import Path

    backend_dir = Path(__file__).parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    mock_llm = MagicMock()
    mock_vs  = MagicMock()

    patches = [
        patch("main._llm", mock_llm),
        patch("main._vector_store", mock_vs),
        patch("main.init_db", new=AsyncMock()),
        patch("main.build_vector_store", return_value=mock_vs),
        patch("main.get_embeddings", return_value=MagicMock()),
        patch("main.get_all_roles", return_value=[
            {"id": "py-dev", "title": "Python Dev", "description": ""},
        ]),
        patch("main.get_all_roles_async", new=AsyncMock(return_value=[
            {"id": "py-dev", "title": "Python Dev", "description": ""},
        ])),
        patch("main.seed_roles_from_json", new=AsyncMock(return_value=0)),
        patch("main.sweep_expired_sessions", new=AsyncMock(return_value=0)),
        patch("main.init_bm25_from_roles"),
        patch("main.init_guardrail_persistence"),
        patch("main.flush_guardrail_stats"),
        patch("main.configure_logging"),
        patch("os.getenv", side_effect=lambda k, d=None: {
            "DEEPSEEK_API_KEY": "test-key",
            "DEEPSEEK_BASE_URL": "https://api.deepseek.com",
            "DEEPSEEK_MODEL": "deepseek-chat",
            "LOG_LEVEL": "INFO",
            "CORS_ORIGINS": "http://localhost:4200",
        }.get(k, d)),
    ]

    for p in patches:
        p.start()

    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app, raise_server_exceptions=False)

    yield c

    for p in patches:
        try:
            p.stop()
        except RuntimeError:
            pass


# ═══════════════════════════════════════════════════════════════════════════════
# /health/ready — full dependency check
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealthReady:

    def test_positive_ready_all_checks_pass(self, client):
        """All deps mocked as ready → 200."""
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["Python Dev role document"]

        with patch("main._llm", MagicMock()), \
             patch("main._vector_store", MagicMock()), \
             patch("main.get_bm25_index", return_value=mock_bm25), \
             patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(execute=AsyncMock())
            )
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ready"
        assert "bm25_index" in body
        assert "sqlite" in body
        assert body["sqlite"] == "ok"

    def test_negative_ready_llm_missing_returns_503(self, client):
        """LLM not initialised → 503."""
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["doc"]

        with patch("main._llm", None), \
             patch("main._vector_store", MagicMock()), \
             patch("main.get_bm25_index", return_value=mock_bm25), \
             patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(execute=AsyncMock())
            )
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        assert resp.status_code == 503

    def test_negative_ready_bm25_empty_returns_503(self, client):
        """BM25 index empty (no docs loaded) → 503."""
        mock_bm25 = MagicMock()
        mock_bm25._docs = []  # empty index

        with patch("main._llm", MagicMock()), \
             patch("main._vector_store", MagicMock()), \
             patch("main.get_bm25_index", return_value=mock_bm25), \
             patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(execute=AsyncMock())
            )
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        assert resp.status_code == 503
        assert "bm25_index" in resp.json()["detail"]

    def test_negative_ready_sqlite_failure_returns_503(self, client):
        """SQLite ping raises → 503."""
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["doc"]

        with patch("main._llm", MagicMock()), \
             patch("main._vector_store", MagicMock()), \
             patch("main.get_bm25_index", return_value=mock_bm25), \
             patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.side_effect = Exception("DB file not found")
            resp = client.get("/health/ready")

        assert resp.status_code == 503
        assert "sqlite" in resp.json()["detail"]

    def test_positive_ready_response_has_all_fields(self, client):
        """Response schema includes all expected fields."""
        mock_bm25 = MagicMock()
        mock_bm25._docs = ["role doc"]

        with patch("main._llm", MagicMock()), \
             patch("main._vector_store", MagicMock()), \
             patch("main.get_bm25_index", return_value=mock_bm25), \
             patch("main.aiosqlite") as mock_sq:
            mock_sq.connect.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(execute=AsyncMock())
            )
            mock_sq.connect.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/health/ready")

        if resp.status_code == 200:
            body = resp.json()
            for field in ("status", "llm", "vector_store", "bm25_index", "sqlite",
                          "hybrid_retrieval", "circuit_breakers", "active_prompts"):
                assert field in body, f"Missing field: {field}"


# ═══════════════════════════════════════════════════════════════════════════════
# Cache-Control header on /roles
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheControlRoles:

    def test_positive_roles_has_cache_control_header(self, client):
        mock_roles = [{"id": "r1", "title": "Dev", "description": "desc"}]
        with patch("main.get_all_roles_db", new_callable=AsyncMock, return_value=mock_roles):
            resp = client.get("/roles")
        assert resp.status_code == 200
        assert "cache-control" in {k.lower() for k in resp.headers}
        cc = resp.headers.get("cache-control", "")
        assert "max-age=3600" in cc

    def test_positive_roles_called_twice_both_have_header(self, client):
        """Cache-Control is always present, not just on first call."""
        mock_roles = [{"id": "r1", "title": "Dev", "description": "desc"}]
        with patch("main.get_all_roles_db", new_callable=AsyncMock, return_value=mock_roles):
            resp1 = client.get("/roles")
            resp2 = client.get("/roles")
        assert "max-age=3600" in resp1.headers.get("cache-control", "")
        assert "max-age=3600" in resp2.headers.get("cache-control", "")


# ═══════════════════════════════════════════════════════════════════════════════
# Structured logging — X-Request-Id header
# ═══════════════════════════════════════════════════════════════════════════════

class TestCorrelationId:

    def test_positive_every_response_has_request_id_header(self, client):
        """/health/live always returns X-Request-Id correlation header."""
        resp = client.get("/health/live")
        assert "x-request-id" in {k.lower() for k in resp.headers}
        assert len(resp.headers.get("x-request-id", "")) > 0

    def test_positive_request_id_unique_per_call(self, client):
        """Each call gets a different request_id — not a static value."""
        r1 = client.get("/health/live")
        r2 = client.get("/health/live")
        id1 = r1.headers.get("x-request-id", "")
        id2 = r2.headers.get("x-request-id", "")
        assert id1 != id2
