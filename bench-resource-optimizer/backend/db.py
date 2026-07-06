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

# BUG FIX: _PRAGMAS was defined but never used — misleading readers into thinking WAL+NORMAL
# were both applied as one call. Only _WAL_PRAGMA is actually executed per connection.
_WAL_PRAGMA = "PRAGMA journal_mode=WAL"


async def init_db() -> None:
    """Create tables if they don't exist. Called once at startup."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
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
            CREATE TABLE IF NOT EXISTS roles (
                role_id          TEXT PRIMARY KEY,
                title            TEXT NOT NULL,
                description      TEXT NOT NULL DEFAULT '',
                required_skills  TEXT NOT NULL DEFAULT '[]',
                preferred_skills TEXT NOT NULL DEFAULT '[]',
                experience_years INTEGER NOT NULL DEFAULT 0,
                internal_notes   TEXT NOT NULL DEFAULT '',
                created_at       REAL NOT NULL,
                updated_at       REAL NOT NULL
            )
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
        await db.execute("""
            CREATE TABLE IF NOT EXISTS readiness_history (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                role    TEXT NOT NULL,
                score   REAL NOT NULL,
                ts      REAL NOT NULL
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_readiness_user
            ON readiness_history(user_id, ts DESC)
        """)
        await db.commit()


# ── User CRUD ────────────────────────────────────────────────────────────────

async def save_user(user_id: str, profile: dict, resume_snippet: str = "") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
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
        "profile": json.loads(row["profile_json"]),
        "resume_snippet": row["resume_snippet"],
    }


async def get_all_users() -> list:
    """Return all bench candidates joined with their latest progress/readiness."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT u.user_id, u.profile_json,
                   p.role, p.completed_task_ids, p.plan_json
            FROM users u
            LEFT JOIN progress p ON u.user_id = p.user_id
            """
        ) as cur:
            rows = await cur.fetchall()

    results = []
    for row in rows:
        profile = json.loads(row["profile_json"])
        plan = json.loads(row["plan_json"]) if row["plan_json"] else {}
        completed = json.loads(row["completed_task_ids"]) if row["completed_task_ids"] else []
        total_tasks = sum(len(d.get("tasks", [])) for d in plan.get("days", []))
        readiness = round(len(completed) / total_tasks * 100, 1) if total_tasks else 0.0
        results.append({
            "user_id": row["user_id"],
            "profile": profile,
            "role": row["role"] or "",
            "readiness_score": readiness,
        })
    return results


# ── Progress CRUD ─────────────────────────────────────────────────────────────

async def save_progress(user_id: str, role: str, plan: dict, completed_task_ids: list) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
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
        "role": row["role"],
        "plan": json.loads(row["plan_json"]),
        "completed_task_ids": json.loads(row["completed_task_ids"]),
    }


async def update_completed_tasks(user_id: str, completed_task_ids: list) -> bool:
    """Update only the completed task list. Returns False if user has no plan."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
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
        await db.execute(_WAL_PRAGMA)
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
        await db.execute(_WAL_PRAGMA)
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
        await db.execute(_WAL_PRAGMA)
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


# ── Roles CRUD ────────────────────────────────────────────────────────────────

def _row_to_role(row: dict) -> dict:
    return {
        "id": row["role_id"],
        "title": row["title"],
        "description": row["description"],
        "required_skills": json.loads(row["required_skills"]),
        "preferred_skills": json.loads(row["preferred_skills"]),
        "experience_years": row["experience_years"],
        "internal_notes": row["internal_notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def get_all_roles_db() -> list:
    """Return all roles from SQLite."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM roles ORDER BY title") as cur:
            rows = await cur.fetchall()
    return [_row_to_role(dict(r)) for r in rows]


async def get_role_db(role_id: str) -> Optional[dict]:
    """Return a single role by ID, or None if not found."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM roles WHERE role_id = ?", (role_id,)) as cur:
            row = await cur.fetchone()
    return _row_to_role(dict(row)) if row else None


async def create_role_db(role: dict) -> dict:
    """
    Insert a new role. Raises ValueError on duplicate role_id.
    role dict must have: id, title. Optional: description, required_skills,
    preferred_skills, experience_years, internal_notes.
    """
    now = time.time()
    role_id = role["id"].strip().lower().replace(" ", "-")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
        try:
            await db.execute(
                """
                INSERT INTO roles
                    (role_id, title, description, required_skills, preferred_skills,
                     experience_years, internal_notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    role_id,
                    role["title"],
                    role.get("description", ""),
                    json.dumps(role.get("required_skills", [])),
                    json.dumps(role.get("preferred_skills", [])),
                    role.get("experience_years", 0),
                    role.get("internal_notes", ""),
                    now, now,
                ),
            )
            await db.commit()
        except Exception as exc:
            if "UNIQUE constraint" in str(exc):
                raise ValueError(f"Role '{role_id}' already exists.")
            raise
    return await get_role_db(role_id)


async def update_role_db(role_id: str, updates: dict) -> Optional[dict]:
    """
    Update an existing role. Returns updated role, or None if not found.
    Only fields present in `updates` are changed.
    """
    existing = await get_role_db(role_id)
    if not existing:
        return None

    now = time.time()
    merged = {
        "title": updates.get("title", existing["title"]),
        "description": updates.get("description", existing["description"]),
        "required_skills": updates.get("required_skills", existing["required_skills"]),
        "preferred_skills": updates.get("preferred_skills", existing["preferred_skills"]),
        "experience_years": updates.get("experience_years", existing["experience_years"]),
        "internal_notes": updates.get("internal_notes", existing["internal_notes"]),
    }
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
        await db.execute(
            """
            UPDATE roles SET
                title            = ?,
                description      = ?,
                required_skills  = ?,
                preferred_skills = ?,
                experience_years = ?,
                internal_notes   = ?,
                updated_at       = ?
            WHERE role_id = ?
            """,
            (
                merged["title"],
                merged["description"],
                json.dumps(merged["required_skills"]),
                json.dumps(merged["preferred_skills"]),
                merged["experience_years"],
                merged["internal_notes"],
                now,
                role_id,
            ),
        )
        await db.commit()
    return await get_role_db(role_id)


async def delete_role_db(role_id: str) -> bool:
    """Delete a role. Returns True if deleted, False if not found."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
        cur = await db.execute("DELETE FROM roles WHERE role_id = ?", (role_id,))
        await db.commit()
        return cur.rowcount > 0


async def seed_roles_from_json(roles_json_path: Path) -> int:
    """
    Migrate roles_knowledge.json → SQLite on first startup.
    Skips roles already in DB (idempotent).
    Returns count of newly inserted roles.
    """
    if not roles_json_path.exists():
        return 0

    import aiofiles
    async with aiofiles.open(roles_json_path) as f:
        content = await f.read()
    data = json.loads(content)

    roles = data.get("roles", [])
    inserted = 0
    for role in roles:
        existing = await get_role_db(role["id"])
        if existing:
            continue
        try:
            await create_role_db(role)
            inserted += 1
        except ValueError:
            pass  # already exists
    return inserted


# ── Readiness History CRUD ────────────────────────────────────────────────────

async def save_readiness_score(user_id: str, role: str, score: float) -> None:
    """Append one readiness score snapshot. Called on every /update-progress."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_WAL_PRAGMA)
        await db.execute(
            "INSERT INTO readiness_history (user_id, role, score, ts) VALUES (?, ?, ?, ?)",
            (user_id, role, score, time.time()),
        )
        await db.commit()


async def get_readiness_history(user_id: str, limit: int = 30) -> list:
    """Return the last `limit` score entries for a user, oldest-first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT role, score, ts FROM (
                SELECT role, score, ts FROM readiness_history
                WHERE user_id = ?
                ORDER BY ts DESC LIMIT ?
            ) ORDER BY ts ASC
            """,
            (user_id, limit),
        ) as cur:
            rows = await cur.fetchall()
    return [{"role": r["role"], "score": r["score"], "ts": r["ts"]} for r in rows]
