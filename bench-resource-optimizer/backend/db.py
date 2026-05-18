"""
Async SQLite storage — replaces flat JSON files.

Why SQLite over JSON files for production:
  - Concurrent-safe: SQLite WAL mode handles multiple writers without corruption
  - ACID: atomic writes, no partial-write data loss
  - Queryable: filter users by role, date, readiness score
  - Drop-in replacement path: swap sqlite3 connection string for PostgreSQL (asyncpg) with no API change
  - 1M+ reads/day on a single file is well within SQLite's capability

Schema:
  users(user_id, profile_json, resume_snippet, created_at)
  progress(user_id, role, plan_json, completed_task_ids_json, updated_at)
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import aiosqlite

DB_PATH = Path(__file__).parent / "data" / "bench.db"

_PRAGMAS = "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"


async def init_db() -> None:
    """Create tables if they don't exist. Called once at startup."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=NORMAL")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id        TEXT PRIMARY KEY,
                profile_json   TEXT NOT NULL,
                resume_snippet TEXT,
                created_at     REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id            TEXT PRIMARY KEY,
                role               TEXT NOT NULL,
                plan_json          TEXT NOT NULL,
                completed_task_ids TEXT NOT NULL DEFAULT '[]',
                updated_at         REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS memory_sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    TEXT NOT NULL,
                summary    TEXT NOT NULL,
                ts         REAL NOT NULL,
                expires_at REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_memory_user
            ON memory_sessions(user_id, ts DESC)
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS ragas_results (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id        TEXT NOT NULL,
                query             TEXT NOT NULL,
                timestamp         REAL NOT NULL,
                faithfulness      REAL NOT NULL,
                context_precision REAL NOT NULL,
                context_recall    REAL NOT NULL,
                answer_relevancy  REAL NOT NULL,
                precision_at_k    REAL NOT NULL,
                mrr               REAL NOT NULL,
                passed            INTEGER NOT NULL,
                num_chunks        INTEGER NOT NULL
            )
        """)
        await db.commit()


# ── User CRUD ────────────────────────────────────────────────────────────────

async def save_user(user_id: str, profile: dict, resume_snippet: str = "") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            """
            INSERT INTO users (user_id, profile_json, resume_snippet, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                profile_json   = excluded.profile_json,
                resume_snippet = excluded.resume_snippet
            """,
            (user_id, json.dumps(profile), resume_snippet[:500], time.time()),
        )
        await db.commit()


async def get_user(user_id: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT profile_json, resume_snippet FROM users WHERE user_id = ?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    return {
        "profile":         json.loads(row["profile_json"]),
        "resume_snippet":  row["resume_snippet"],
    }


# ── Progress CRUD ─────────────────────────────────────────────────────────────

async def save_progress(user_id: str, role: str, plan: dict, completed_task_ids: list) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            """
            INSERT INTO progress (user_id, role, plan_json, completed_task_ids, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                role               = excluded.role,
                plan_json          = excluded.plan_json,
                completed_task_ids = excluded.completed_task_ids,
                updated_at         = excluded.updated_at
            """,
            (user_id, role, json.dumps(plan), json.dumps(completed_task_ids), time.time()),
        )
        await db.commit()


async def get_progress(user_id: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT role, plan_json, completed_task_ids FROM progress WHERE user_id = ?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    return {
        "role":               row["role"],
        "plan":               json.loads(row["plan_json"]),
        "completed_task_ids": json.loads(row["completed_task_ids"]),
    }


async def update_completed_tasks(user_id: str, completed_task_ids: list) -> bool:
    """Update only the completed task list. Returns False if user has no plan."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        cur = await db.execute(
            """
            UPDATE progress
            SET completed_task_ids = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (json.dumps(completed_task_ids), time.time(), user_id),
        )
        await db.commit()
        return cur.rowcount > 0


# ── Memory session CRUD ───────────────────────────────────────────────────────

_7_DAYS = 7 * 24 * 3600


async def save_memory_session(user_id: str, summary: dict, ts: float) -> None:
    """Persist one episodic session summary. Write-through from session_store."""
    expires_at = ts + _7_DAYS
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            "INSERT INTO memory_sessions (user_id, summary, ts, expires_at) VALUES (?, ?, ?, ?)",
            (user_id, json.dumps(summary), ts, expires_at),
        )
        await db.commit()


async def load_memory_sessions(user_id: str, n: int = 10) -> list:
    """Load the n most recent non-expired sessions for a user (startup recovery)."""
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT summary, ts FROM memory_sessions
            WHERE user_id = ? AND expires_at > ?
            ORDER BY ts DESC LIMIT ?
            """,
            (user_id, now, n),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(**json.loads(r["summary"]), ts=r["ts"]) for r in rows]


async def sweep_expired_sessions() -> int:
    """Delete sessions older than 7 days. Returns count deleted. Call at startup."""
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        cur = await db.execute(
            "DELETE FROM memory_sessions WHERE expires_at <= ?", (now,)
        )
        await db.commit()
        return cur.rowcount


async def load_all_memory_user_ids() -> list:
    """Return all distinct user_ids that have non-expired sessions (for preload)."""
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT DISTINCT user_id FROM memory_sessions WHERE expires_at > ?", (now,)
        ) as cur:
            rows = await cur.fetchall()
    return [r[0] for r in rows]


# ── RAGAS results CRUD ────────────────────────────────────────────────────────

async def save_ragas_result(record_dict: dict) -> None:
    """Persist one RAGAS evaluation record."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            """
            INSERT INTO ragas_results
                (request_id, query, timestamp, faithfulness, context_precision,
                 context_recall, answer_relevancy, precision_at_k, mrr, passed, num_chunks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_dict["request_id"],
                record_dict["query"],
                record_dict["timestamp"],
                record_dict["faithfulness"],
                record_dict["context_precision"],
                record_dict["context_recall"],
                record_dict["answer_relevancy"],
                record_dict["precision_at_k"],
                record_dict["mrr"],
                int(record_dict["passed"]),
                record_dict["num_chunks"],
            ),
        )
        await db.commit()


async def load_ragas_results(limit: int = 200) -> list:
    """Load the last `limit` RAGAS records (startup recovery)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM ragas_results ORDER BY timestamp DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in reversed(rows)]
