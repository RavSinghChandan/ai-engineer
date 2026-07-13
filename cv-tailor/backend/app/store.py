"""SQLite store for tailored applications (one row per job)."""
import json
import sqlite3
import time
import uuid
from pathlib import Path

from app.config import DB_PATH


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                id TEXT PRIMARY KEY,
                company TEXT,
                role TEXT,
                apply_url TEXT,
                job_description TEXT,
                ats_score INTEGER,
                matched_keywords TEXT,
                missing_keywords TEXT,
                tex_path TEXT,
                pdf_path TEXT,
                created_at REAL
            )
            """
        )


def add_application(**kw) -> str:
    app_id = uuid.uuid4().hex[:12]
    with _conn() as conn:
        conn.execute(
            """INSERT INTO applications
               (id, company, role, apply_url, job_description, ats_score,
                matched_keywords, missing_keywords, tex_path, pdf_path, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                app_id, kw.get("company", ""), kw.get("role", ""), kw.get("apply_url", ""),
                kw.get("job_description", ""), kw.get("ats_score", 0),
                json.dumps(kw.get("matched_keywords", [])),
                json.dumps(kw.get("missing_keywords", [])),
                kw.get("tex_path", ""), kw.get("pdf_path", ""), time.time(),
            ),
        )
    return app_id


def list_applications() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM applications ORDER BY created_at DESC").fetchall()
    return [_row(r) for r in rows]


def get_application(app_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()
    return _row(row) if row else None


def delete_application(app_id: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM applications WHERE id=?", (app_id,))


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["matched_keywords"] = json.loads(d.get("matched_keywords") or "[]")
    d["missing_keywords"] = json.loads(d.get("missing_keywords") or "[]")
    return d
