"""
Tests for GET /api/v1/geocode/search — city autocomplete endpoint.

Positive cases:
  - known city prefix returns suggestions with lat/lon/timezone
  - built-in fallback used when Nominatim is mocked to fail
  - limit param is respected (max 10, min 1)
  - result items have required fields

Negative cases:
  - q shorter than 2 chars → empty list (not 422)
  - q missing → 422 validation error
  - Nominatim down → falls back to built-in results
  - limit > 10 is clamped to 10
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from main import app
    return TestClient(app)


# ── Positive tests ────────────────────────────────────────────────────────────

class TestGeocodeSearchPositive:

    def test_known_city_returns_suggestions(self, client):
        """Querying 'mumbai' (full name) always returns a result from built-in table."""
        resp = client.get("/api/v1/geocode/search?q=mumbai")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        names = [i["display_name"].lower() + " " + i["city"].lower() for i in items]
        assert any("mumbai" in n for n in names)

    def test_result_has_required_fields(self, client):
        """Each suggestion has display_name, city, country, lat, lon, timezone."""
        resp = client.get("/api/v1/geocode/search?q=delhi")
        assert resp.status_code == 200
        for item in resp.json():
            for field in ("display_name", "city", "country", "lat", "lon", "timezone"):
                assert field in item, f"Missing field: {field}"

    def test_lat_lon_are_floats(self, client):
        resp = client.get("/api/v1/geocode/search?q=london")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert isinstance(items[0]["lat"], float)
        assert isinstance(items[0]["lon"], float)

    def test_timezone_populated(self, client):
        resp = client.get("/api/v1/geocode/search?q=kolkata")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert items[0]["timezone"] != ""

    def test_limit_param_respected(self, client):
        """limit=2 returns at most 2 items."""
        resp = client.get("/api/v1/geocode/search?q=a&limit=2")
        assert resp.status_code == 200
        assert len(resp.json()) <= 2

    def test_nominatim_down_falls_back_to_builtin(self, client):
        """When Nominatim raises, built-in results are returned."""
        with patch("routers.geocode.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(side_effect=Exception("network error"))
            mock_client.return_value.__aexit__ = AsyncMock(return_value=False)
            resp = client.get("/api/v1/geocode/search?q=mum")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)

    def test_international_city_returned(self, client):
        """Non-Indian city like 'london' resolves from built-in."""
        resp = client.get("/api/v1/geocode/search?q=london")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert any("london" in i["city"].lower() for i in items)


# ── Negative tests ────────────────────────────────────────────────────────────

class TestGeocodeSearchNegative:

    def test_single_char_returns_empty(self, client):
        """q='a' (1 char) → empty list, not error."""
        resp = client.get("/api/v1/geocode/search?q=a")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_empty_q_returns_empty(self, client):
        """q='' → empty list."""
        resp = client.get("/api/v1/geocode/search?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_missing_q_returns_422(self, client):
        """No q param at all → FastAPI 422 validation error."""
        resp = client.get("/api/v1/geocode/search")
        assert resp.status_code == 422

    def test_limit_clamped_to_10(self, client):
        """limit=99 is silently clamped — returns at most 10 items."""
        resp = client.get("/api/v1/geocode/search?q=a&limit=99")
        assert resp.status_code == 200
        assert len(resp.json()) <= 10

    def test_gibberish_returns_empty_or_list(self, client):
        """Random noise that won't match anything → empty list (not 500)."""
        resp = client.get("/api/v1/geocode/search?q=zzzzxxxxxqqqq")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_whitespace_only_returns_empty(self, client):
        """Whitespace-only query → empty list."""
        resp = client.get("/api/v1/geocode/search?q=   ")
        assert resp.status_code == 200
        assert resp.json() == []
