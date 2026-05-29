"""
Tests for async SQLite CRUD layer (db.py).
Uses a fresh in-memory/temp DB for each test — does not touch bench.db.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from tests.conftest import SAMPLE_PLAN, SAMPLE_PROFILE


# ── Patch DB_PATH to a temp file so tests never touch the real DB ─────────────

@pytest.fixture
def tmp_db(tmp_path):
    db_file = tmp_path / "test_bench.db"
    with patch("db.DB_PATH", db_file):
        yield db_file


# ═══════════════════════════════════════════════════════════════════════════════
# DB initialisation
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_init_db_creates_tables(tmp_db):
    from db import init_db
    await init_db()
    import aiosqlite
    async with aiosqlite.connect(tmp_db) as db:
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table'") as cur:
            tables = {row[0] async for row in cur}
    assert "users" in tables
    assert "progress" in tables


@pytest.mark.asyncio
async def test_init_db_idempotent(tmp_db):
    from db import init_db
    await init_db()
    await init_db()  # second call must not raise


# ═══════════════════════════════════════════════════════════════════════════════
# User CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_save_and_get_user(tmp_db):
    from db import init_db, save_user, get_user
    await init_db()
    await save_user("usr_001", SAMPLE_PROFILE, "Ravi Singh — Backend Engineer")
    user = await get_user("usr_001")
    assert user is not None
    assert user["profile"]["name"] == "Ravi Singh"
    assert "Backend Engineer" in user["resume_snippet"]


@pytest.mark.asyncio
async def test_positive_save_user_upserts(tmp_db):
    from db import init_db, save_user, get_user
    await init_db()
    await save_user("usr_002", SAMPLE_PROFILE, "snippet v1")
    updated = dict(SAMPLE_PROFILE, name="Ravi Updated")
    await save_user("usr_002", updated, "snippet v2")
    user = await get_user("usr_002")
    assert user["profile"]["name"] == "Ravi Updated"
    assert user["resume_snippet"] == "snippet v2"


@pytest.mark.asyncio
async def test_negative_get_unknown_user_returns_none(tmp_db):
    from db import init_db, get_user
    await init_db()
    result = await get_user("does_not_exist")
    assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# Progress CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_save_and_get_progress(tmp_db):
    from db import init_db, save_progress, get_progress
    await init_db()
    await save_progress("usr_p01", "Senior Python Developer", SAMPLE_PLAN, [])
    prog = await get_progress("usr_p01")
    assert prog is not None
    assert prog["role"] == "Senior Python Developer"
    assert prog["completed_task_ids"] == []
    assert "plan" in prog["plan"]


@pytest.mark.asyncio
async def test_positive_update_completed_tasks(tmp_db):
    from db import init_db, save_progress, get_progress, update_completed_tasks
    await init_db()
    await save_progress("usr_p02", "Dev Role", SAMPLE_PLAN, [])
    ok = await update_completed_tasks("usr_p02", ["d1t1", "d1t2"])
    assert ok is True
    prog = await get_progress("usr_p02")
    assert "d1t1" in prog["completed_task_ids"]
    assert "d1t2" in prog["completed_task_ids"]


@pytest.mark.asyncio
async def test_negative_update_nonexistent_user_returns_false(tmp_db):
    from db import init_db, update_completed_tasks
    await init_db()
    ok = await update_completed_tasks("ghost_user", ["d1t1"])
    assert ok is False


@pytest.mark.asyncio
async def test_negative_get_progress_unknown_user_returns_none(tmp_db):
    from db import init_db, get_progress
    await init_db()
    result = await get_progress("ghost_user")
    assert result is None


@pytest.mark.asyncio
async def test_positive_progress_upserts_on_second_save(tmp_db):
    from db import init_db, save_progress, get_progress
    await init_db()
    await save_progress("usr_p03", "Role A", SAMPLE_PLAN, [])
    plan_v2 = dict(SAMPLE_PLAN, total_days=5)
    await save_progress("usr_p03", "Role B", plan_v2, ["d1t1"])
    prog = await get_progress("usr_p03")
    assert prog["role"] == "Role B"
    assert "d1t1" in prog["completed_task_ids"]


# ═══════════════════════════════════════════════════════════════════════════════
# Resume snippet truncation
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_long_snippet_truncated(tmp_db):
    from db import init_db, save_user, get_user
    await init_db()
    long_snippet = "x" * 1000  # db.py truncates to 500 chars
    await save_user("usr_snip", SAMPLE_PROFILE, long_snippet)
    user = await get_user("usr_snip")
    assert len(user["resume_snippet"]) <= 500
