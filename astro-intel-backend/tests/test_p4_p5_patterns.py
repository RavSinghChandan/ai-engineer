"""
Test Suite: P4 (Memory-Based AI) + P5 (Streaming+Async Combined) patterns.

P4 tests: GET /api/v1/feedback/memory-summary
P5 tests: POST /api/v1/analysis/submit-stream

All tests are unit-level: no real LLM calls, no external services.
Uses the same fixture pattern as test_async_session_coverage.py.
"""
from __future__ import annotations
import os
import sys
import time
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
import auth.store as auth_store
from auth.models import Role
from database import get_conn

# ── Test credentials ──────────────────────────────────────────────────────────

P4_KEY    = "sk-p4-pattern-test"
P4_TENANT = "tenant_p4_test"

P5_KEY    = "sk-p5-pattern-test"
P5_TENANT = "tenant_p5_test"


def _insert_key(tenant_id, tenant_name, key, role):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,1,?)",
            (tenant_id, tenant_name, time.time()),
        )
        conn.execute(
            "INSERT OR IGNORE INTO api_keys "
            "(key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,1,?)",
            (key, tenant_id, role.value, "p4p5 test", time.time()),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def reset_state():
    auth_store.clear_for_tests()
    _insert_key(P4_TENANT, "P4 Test Tenant", P4_KEY, Role.ADMIN)
    _insert_key(P5_TENANT, "P5 Test Tenant", P5_KEY, Role.ADMIN)
    yield
    auth_store.clear_for_tests()


@pytest.fixture()
def client():
    import cache.store as cache_store
    cache_store.clear()
    return TestClient(app, raise_server_exceptions=False)


P4_H = {"X-API-Key": P4_KEY}
P5_H = {"X-API-Key": P5_KEY}

_GOOD_REQUEST = {
    "user_profile": {
        "full_name":     "Pattern Test User",
        "date_of_birth": "1985-03-20",
        "time_of_birth": "08:00",
        "place_of_birth": "Mumbai",
    },
    "user_question":    "What does my chart say about career?",
    "questions":        [],
    "selected_modules": ["astrology"],
}


# ── P4 — Memory-Based AI Pattern Tests ───────────────────────────────────────

class TestP4MemorySummary:

    def test_memory_summary_returns_200(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        assert resp.status_code == 200

    def test_memory_summary_has_pattern_label(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pattern"] == "P4-Memory-Based-AI"

    def test_memory_summary_has_flow_key(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        assert resp.status_code == 200
        data = resp.json()
        assert "flow" in data
        assert "retrieve" in data["flow"]
        assert "store" in data["flow"]

    def test_memory_summary_has_tenant_id(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tenant_id"] == P4_TENANT

    def test_memory_summary_has_required_fields(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        assert resp.status_code == 200
        data = resp.json()
        for field in ("correction_count", "by_intent", "preferences",
                      "recent_corrections", "persona_preview", "how_it_works"):
            assert field in data, f"Missing field: {field}"

    def test_memory_summary_how_it_works_explains_pattern(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        data = resp.json()
        hw = data["how_it_works"]
        assert "retrieve" in hw
        assert "context_build" in hw
        assert "llm" in hw
        assert "store" in hw

    def test_memory_summary_unauthenticated_returns_401(self, client):
        resp = client.get("/api/v1/feedback/memory-summary")
        assert resp.status_code == 401

    def test_memory_summary_correction_count_is_integer(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        data = resp.json()
        assert isinstance(data["correction_count"], int)
        assert data["correction_count"] >= 0

    def test_memory_summary_recent_corrections_is_list(self, client):
        resp = client.get("/api/v1/feedback/memory-summary", headers=P4_H)
        data = resp.json()
        assert isinstance(data["recent_corrections"], list)


# ── P5 — Streaming + Async Combined Pattern Tests ────────────────────────────

def _read_first_sse_chunk(client, url, json_body, headers):
    """
    Read only the first complete SSE event from a streaming endpoint.
    Uses stream=True so the test does not wait for the full stream to close.
    Returns (status_code, headers, first_chunk_text).
    """
    with client.stream("POST", url, json=json_body, headers=headers) as resp:
        chunks = []
        for chunk in resp.iter_lines():
            chunks.append(chunk)
            # Two consecutive empty lines = one complete SSE event
            if len(chunks) >= 2 and chunks[-1] == "" and chunks[-2] == "":
                break
            # Also stop once we have the data line of the first event
            if any(line.startswith("data: ") for line in chunks):
                # grab one more line to complete the event
                break
        return resp.status_code, dict(resp.headers), "\n".join(chunks)


class TestP5SubmitStream:

    def test_submit_stream_unauthenticated_returns_401(self, client):
        resp = client.post(
            "/api/v1/analysis/submit-stream",
            json=_GOOD_REQUEST,
        )
        assert resp.status_code == 401

    def test_submit_stream_invalid_body_returns_422(self, client):
        resp = client.post(
            "/api/v1/analysis/submit-stream",
            json={"bad": "data"},
            headers=P5_H,
        )
        assert resp.status_code == 422

    def test_submit_stream_returns_200_and_event_stream(self, client):
        status, headers, _ = _read_first_sse_chunk(
            client, "/api/v1/analysis/submit-stream", _GOOD_REQUEST, P5_H
        )
        assert status == 200
        assert "text/event-stream" in headers.get("content-type", "")

    def test_submit_stream_no_cache_header(self, client):
        status, headers, _ = _read_first_sse_chunk(
            client, "/api/v1/analysis/submit-stream", _GOOD_REQUEST, P5_H
        )
        assert status == 200
        assert headers.get("cache-control") == "no-cache"

    def test_submit_stream_first_event_is_job_queued(self, client):
        _, _, chunk = _read_first_sse_chunk(
            client, "/api/v1/analysis/submit-stream", _GOOD_REQUEST, P5_H
        )
        assert "job_queued" in chunk

    def test_submit_stream_first_event_contains_job_id(self, client):
        _, _, chunk = _read_first_sse_chunk(
            client, "/api/v1/analysis/submit-stream", _GOOD_REQUEST, P5_H
        )
        lines = chunk.splitlines()
        job_id = None
        for i, line in enumerate(lines):
            if line.startswith("event: job_queued") and i + 1 < len(lines):
                data_line = lines[i + 1]
                if data_line.startswith("data: "):
                    payload = json.loads(data_line[len("data: "):])
                    job_id = payload.get("job_id")
                    break
            elif line.startswith("data: "):
                try:
                    payload = json.loads(line[len("data: "):])
                    job_id = payload.get("job_id")
                except Exception:
                    pass
                break
        assert job_id is not None, f"job_id not found in chunk: {chunk!r}"
        assert len(job_id) > 0

    def test_submit_stream_first_event_status_is_queued(self, client):
        _, _, chunk = _read_first_sse_chunk(
            client, "/api/v1/analysis/submit-stream", _GOOD_REQUEST, P5_H
        )
        lines = chunk.splitlines()
        for line in lines:
            if line.startswith("data: "):
                payload = json.loads(line[len("data: "):])
                assert payload.get("status") == "queued"
                return
        pytest.fail(f"No data: line in first SSE chunk: {chunk!r}")
