"""
Phase 4 tests — Readiness Score History (time-series).

Positive + negative cases for:
  - DB layer: save_readiness_score, get_readiness_history
  - API layer: GET /progress/{user_id}/history
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


# ── DB fixture ────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_db(tmp_path):
    db_file = tmp_path / "test_phase4.db"
    with patch("db.DB_PATH", db_file):
        yield db_file


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — save_readiness_score / get_readiness_history
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_save_and_load_history(tmp_db):
    from db import init_db, save_readiness_score, get_readiness_history
    await init_db()
    await save_readiness_score("usr1", "Python Dev", 40.0)
    history = await get_readiness_history("usr1")
    assert len(history) == 1
    assert history[0]["score"] == 40.0
    assert history[0]["role"] == "Python Dev"
    assert "ts" in history[0]


@pytest.mark.asyncio
async def test_positive_multiple_scores_ordered_oldest_first(tmp_db):
    from db import init_db, save_readiness_score, get_readiness_history
    await init_db()
    await save_readiness_score("usr2", "Role A", 20.0)
    await save_readiness_score("usr2", "Role A", 40.0)
    await save_readiness_score("usr2", "Role A", 60.0)
    history = await get_readiness_history("usr2")
    # Oldest first — ascending ts order for chart rendering
    scores = [h["score"] for h in history]
    assert scores == [20.0, 40.0, 60.0]


@pytest.mark.asyncio
async def test_negative_no_history_returns_empty_list(tmp_db):
    """User with no progress history → empty list, not 404."""
    from db import init_db, get_readiness_history
    await init_db()
    history = await get_readiness_history("no-such-user")
    assert history == []


@pytest.mark.asyncio
async def test_positive_limit_caps_results(tmp_db):
    from db import init_db, save_readiness_score, get_readiness_history
    await init_db()
    for i in range(10):
        await save_readiness_score("usr3", "Role B", float(i * 10))
    history = await get_readiness_history("usr3", limit=5)
    assert len(history) == 5
    # Should return the 5 most-recent, oldest-first within that window
    scores = [h["score"] for h in history]
    assert scores == [50.0, 60.0, 70.0, 80.0, 90.0]


@pytest.mark.asyncio
async def test_positive_history_isolated_by_user(tmp_db):
    """History is filtered per user — one user's scores don't leak to another."""
    from db import init_db, save_readiness_score, get_readiness_history
    await init_db()
    await save_readiness_score("usr_a", "Role X", 33.0)
    await save_readiness_score("usr_b", "Role X", 66.0)
    history_a = await get_readiness_history("usr_a")
    history_b = await get_readiness_history("usr_b")
    assert len(history_a) == 1 and history_a[0]["score"] == 33.0
    assert len(history_b) == 1 and history_b[0]["score"] == 66.0


@pytest.mark.asyncio
async def test_positive_100_updates_last_30_returned(tmp_db):
    """100 progress updates → only last 30 returned."""
    from db import init_db, save_readiness_score, get_readiness_history
    await init_db()
    for i in range(100):
        await save_readiness_score("usr4", "Role C", float(i))
    history = await get_readiness_history("usr4", limit=30)
    assert len(history) == 30
    # Should be the last 30 (70..99), oldest first
    assert history[0]["score"] == 70.0
    assert history[-1]["score"] == 99.0


# API-layer tests for GET /progress/{user_id}/history live in test_api.py
# to reuse its already-wired TestClient fixture without triggering the lifespan
# os.getenv mock issues.
