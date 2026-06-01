import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from database.models import ALL_TABLES, CREATE_INDEXES

DB_PATH = os.getenv("DATABASE_PATH", str(Path(__file__).parent.parent / "runbookai.db"))

# Columns added progressively — safe to re-run (OperationalError = already exists)
_MIGRATIONS = [
    # Phase 6 — tenant isolation
    "ALTER TABLE runbooks ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE",
    "ALTER TABLE ingest_jobs ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
    # Multi-source — source provenance columns
    "ALTER TABLE runbooks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'internal'",
    "ALTER TABLE runbooks ADD COLUMN source_name TEXT NOT NULL DEFAULT 'Internal Runbook'",
    "ALTER TABLE runbooks ADD COLUMN source_url  TEXT NOT NULL DEFAULT ''",
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        for ddl in ALL_TABLES:
            conn.execute(ddl)
        _run_migrations(conn)
        # Create indexes after tables exist; each is IF NOT EXISTS — safe to re-run
        for stmt in CREATE_INDEXES.strip().splitlines():
            stmt = stmt.strip()
            if stmt:
                conn.execute(stmt)
        conn.commit()


def _run_migrations(conn: sqlite3.Connection) -> None:
    for sql in _MIGRATIONS:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError:
            # Column already exists — safe to skip
            pass


@contextmanager
def get_conn():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
