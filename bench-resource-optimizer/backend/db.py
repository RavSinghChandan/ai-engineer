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


async def _conn() -> aiosqlite.Connection:
    """Return an open WAL-mode connection. Caller must close."""
    db = await aiosqlite.connect(DB_PATH)
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA synchronous=NORMAL")
    db.row_factory = aiosqlite.Row
    return db


async def init_db() -> None:
    """Create tables if they don't exist. Called once at startup."""
    async with await _conn() as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id       TEXT PRIMARY KEY,
                profile_json  TEXT NOT NULL,
                resume_snippet TEXT,
                created_at    REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id              TEXT PRIMARY KEY,
                role                 TEXT NOT NULL,
                plan_json            TEXT NOT NULL,
                completed_task_ids   TEXT NOT NULL DEFAULT '[]',
                updated_at           REAL NOT NULL
            )
        """)
        await db.commit()


# ── User CRUD ────────────────────────────────────────────────────────────────

async def save_user(user_id: str, profile: dict, resume_snippet: str = "") -> None:
    async with await _conn() as db:
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
    async with await _conn() as db:
        async with db.execute(
            "SELECT profile_json, resume_snippet FROM users WHERE user_id = ?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    return {
        "profile": json.loads(row["profile_json"]),
        "resume_snippet": row["resume_snippet"],
    }


# ── Progress CRUD ─────────────────────────────────────────────────────────────

async def save_progress(user_id: str, role: str, plan: dict, completed_task_ids: list) -> None:
    async with await _conn() as db:
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
    async with await _conn() as db:
        async with db.execute(
            "SELECT role, plan_json, completed_task_ids FROM progress WHERE user_id = ?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    return {
        "role": row["role"],
        "plan": json.loads(row["plan_json"]),
        "completed_task_ids": json.loads(row["completed_task_ids"]),
    }


async def update_completed_tasks(user_id: str, completed_task_ids: list) -> bool:
    """Update only the completed tasks list. Returns False if user has no plan."""
    async with await _conn() as db:
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
