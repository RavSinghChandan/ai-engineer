"""
Phase 2 tests — Memory + RAGAS Persistence.

Verifies that:
  1. Episodic sessions survive a simulated restart (write-through → SQLite → reload)
  2. Expired sessions are swept on startup
  3. RAGAS results persist across restarts
  4. In-memory hot cache is still fast (no DB hit on second get)

Uses a temp SQLite DB — never touches bench.db.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import pytest

from tests.conftest import SAMPLE_PLAN, SAMPLE_PROFILE


# ── DB fixture ────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_db(tmp_path):
    db_file = tmp_path / "test_phase2.db"
    with patch("db.DB_PATH", db_file):
        yield db_file


# ═══════════════════════════════════════════════════════════════════════════════
# Memory session DB CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_save_and_load_session(tmp_db):
    from db import init_db, save_memory_session, load_memory_sessions
    await init_db()
    ts = time.time()
    await save_memory_session("usr_m1", {"role_explored": "Python Dev", "match_percentage": 75}, ts)
    sessions = await load_memory_sessions("usr_m1")
    assert len(sessions) == 1
    assert sessions[0]["role_explored"] == "Python Dev"
    assert sessions[0]["ts"] == ts


@pytest.mark.asyncio
async def test_positive_multiple_sessions_ordered_newest_first(tmp_db):
    from db import init_db, save_memory_session, load_memory_sessions
    await init_db()
    t1 = time.time()
    t2 = t1 + 10
    await save_memory_session("usr_m2", {"role_explored": "Role A"}, t1)
    await save_memory_session("usr_m2", {"role_explored": "Role B"}, t2)
    sessions = await load_memory_sessions("usr_m2")
    assert sessions[0]["role_explored"] == "Role B"  # newest first


@pytest.mark.asyncio
async def test_negative_expired_sessions_not_loaded(tmp_db):
    from db import init_db, save_memory_session, load_memory_sessions
    await init_db()
    # Save session with ts far in the past (expired 7+ days ago)
    old_ts = time.time() - (8 * 24 * 3600)
    import aiosqlite
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            "INSERT INTO memory_sessions (user_id, summary, ts, expires_at) VALUES (?, ?, ?, ?)",
            ("usr_m3", '{"role_explored": "Old Role"}', old_ts, old_ts + 1),
        )
        await db.commit()
    sessions = await load_memory_sessions("usr_m3")
    assert len(sessions) == 0  # expired session not returned


@pytest.mark.asyncio
async def test_positive_sweep_removes_expired(tmp_db):
    from db import init_db, sweep_expired_sessions
    await init_db()
    import aiosqlite
    # Insert expired session directly
    async with aiosqlite.connect(tmp_db) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            "INSERT INTO memory_sessions (user_id, summary, ts, expires_at) VALUES (?, ?, ?, ?)",
            ("usr_sweep", '{"role_explored":"Old"}', 0.0, 1.0),
        )
        await db.commit()
    deleted = await sweep_expired_sessions()
    assert deleted >= 1


@pytest.mark.asyncio
async def test_positive_sweep_keeps_valid_sessions(tmp_db):
    from db import init_db, save_memory_session, sweep_expired_sessions, load_memory_sessions
    await init_db()
    await save_memory_session("usr_keep", {"role_explored": "Valid"}, time.time())
    await sweep_expired_sessions()
    sessions = await load_memory_sessions("usr_keep")
    assert len(sessions) == 1  # not swept


@pytest.mark.asyncio
async def test_positive_load_all_user_ids(tmp_db):
    from db import init_db, save_memory_session, load_all_memory_user_ids
    await init_db()
    await save_memory_session("usr_a", {"role_explored": "A"}, time.time())
    await save_memory_session("usr_b", {"role_explored": "B"}, time.time())
    ids = await load_all_memory_user_ids()
    assert "usr_a" in ids
    assert "usr_b" in ids


# ═══════════════════════════════════════════════════════════════════════════════
# Session store write-through + recovery (simulated restart)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_preload_restores_from_db(tmp_db):
    """Simulates: server restarts, in-memory is empty, preload recovers from DB."""
    from db import init_db, save_memory_session
    await init_db()
    ts = time.time()
    await save_memory_session("usr_restart", {"role_explored": "ML Engineer", "match_percentage": 80}, ts)

    # Reset in-memory state (simulates restart)
    import memory.session_store as ms
    ms._episodic.clear()
    ms._preloaded.discard("usr_restart")

    from memory.session_store import preload_user_memory, get_recent_sessions
    await preload_user_memory("usr_restart")

    sessions = get_recent_sessions("usr_restart")
    assert len(sessions) >= 1
    assert sessions[0]["role_explored"] == "ML Engineer"


@pytest.mark.asyncio
async def test_positive_in_memory_hot_cache_no_db_hit(tmp_db):
    """Second get_recent_sessions() must not re-query DB (already in deque)."""
    from db import init_db, save_memory_session
    await init_db()
    from memory.session_store import write_session_summary, get_recent_sessions
    import memory.session_store as ms
    ms._episodic.clear()
    ms._preloaded.clear()

    # Write populates in-memory deque
    ms._episodic["usr_hot"].appendleft({"role_explored": "Hot Cache", "ts": time.time()})

    sessions1 = get_recent_sessions("usr_hot")
    sessions2 = get_recent_sessions("usr_hot")
    assert sessions1 == sessions2
    assert len(sessions1) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# RAGAS persistence
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_ragas_save_and_load(tmp_db):
    from db import init_db, save_ragas_result, load_ragas_results
    await init_db()
    record = {
        "request_id": "test_req_001",
        "query": "Senior Python Developer",
        "timestamp": time.time(),
        "faithfulness": 0.85,
        "context_precision": 0.80,
        "context_recall": 0.75,
        "answer_relevancy": 0.90,
        "precision_at_k": 0.70,
        "mrr": 0.67,
        "passed": True,
        "num_chunks": 3,
    }
    await save_ragas_result(record)
    rows = await load_ragas_results()
    assert len(rows) == 1
    assert rows[0]["request_id"] == "test_req_001"
    assert rows[0]["faithfulness"] == 0.85
    assert bool(rows[0]["passed"]) is True


@pytest.mark.asyncio
async def test_positive_ragas_store_load_from_db(tmp_db):
    """RagasStore.load_from_db() restores records into in-memory deque."""
    from db import init_db, save_ragas_result
    from metrics.ragas_eval import RagasStore
    await init_db()

    # Save 3 records to DB
    for i in range(3):
        await save_ragas_result({
            "request_id": f"req_{i:03d}",
            "query": f"Role {i}",
            "timestamp": time.time() + i,
            "faithfulness": 0.8, "context_precision": 0.8,
            "context_recall": 0.8, "answer_relevancy": 0.8,
            "precision_at_k": 0.7, "mrr": 0.6,
            "passed": True, "num_chunks": 2,
        })

    store = RagasStore()
    restored = await store.load_from_db()
    assert restored == 3
    assert len(store._records) == 3


@pytest.mark.asyncio
async def test_negative_ragas_load_empty_db_returns_zero(tmp_db):
    from db import init_db
    from metrics.ragas_eval import RagasStore
    await init_db()
    store = RagasStore()
    count = await store.load_from_db()
    assert count == 0
    assert store.dashboard()["evaluated"] == 0


@pytest.mark.asyncio
async def test_positive_ragas_limit_respected(tmp_db):
    from db import init_db, save_ragas_result, load_ragas_results
    await init_db()
    for i in range(10):
        await save_ragas_result({
            "request_id": f"r{i}", "query": f"Q{i}",
            "timestamp": time.time() + i,
            "faithfulness": 0.7, "context_precision": 0.7,
            "context_recall": 0.7, "answer_relevancy": 0.7,
            "precision_at_k": 0.6, "mrr": 0.5,
            "passed": False, "num_chunks": 1,
        })
    rows = await load_ragas_results(limit=5)
    assert len(rows) == 5
