"""
AstroIntel persistence layer.

Supports two backends, selected by the DATABASE_URL environment variable:

  SQLite  (default, local dev):
    DATABASE_URL not set  →  uses SQLITE_DB_PATH (default: astrointel.db)

  PostgreSQL (cloud / docker-compose with postgres service):
    DATABASE_URL=postgresql://user:pass@host:5432/dbname

Public API — same for both backends:
    get_conn()            → connection object (sqlite3.Connection | psycopg2 connection)
    init_db()             → CREATE TABLE IF NOT EXISTS (idempotent)
    migrate_from_json()   → one-shot INSERT OR IGNORE from legacy JSON files
"""
from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path

_DATABASE_URL = os.environ.get("DATABASE_URL", "")
_USE_PG = _DATABASE_URL.startswith("postgresql://") or _DATABASE_URL.startswith("postgres://")

# ── SQLite path (only used when not PostgreSQL) ───────────────────────────────
_SQLITE_DB_PATH = Path(os.environ.get("SQLITE_DB_PATH", "astrointel.db"))


# ── Connection factory ────────────────────────────────────────────────────────

class _PgConnShim:
    """Let PostgreSQL accept the SQLite call style used across this codebase.

    The rest of the code calls conn.execute("... WHERE x=?", (v,)) and chains
    .fetchone()/.fetchall() straight off it. psycopg2 needs a cursor and uses
    %s placeholders, so translate both here rather than rewriting every query.
    """

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        import psycopg2.extras
        # SQLite-only syntax that PostgreSQL spells differently
        if "INSERT OR IGNORE INTO" in sql:
            sql = sql.replace("INSERT OR IGNORE INTO", "INSERT INTO")
            if "ON CONFLICT" not in sql:
                sql = sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        sql = sql.replace("?", "%s")
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(sql, params)
        return cur

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_conn():
    """Return a live database connection (SQLite or PostgreSQL)."""
    if _USE_PG:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(_DATABASE_URL)
        conn.autocommit = False
        return _PgConnShim(conn)
    else:
        import sqlite3
        conn = sqlite3.connect(str(_SQLITE_DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn


@contextmanager
def _tx():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── DDL — parameterised for both dialects ─────────────────────────────────────

def _ddl() -> str:
    if _USE_PG:
        return """
        CREATE TABLE IF NOT EXISTS tenants (
            tenant_id  TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            is_active  BOOLEAN NOT NULL DEFAULT TRUE,
            created_at DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            key        TEXT PRIMARY KEY,
            tenant_id  TEXT NOT NULL REFERENCES tenants(tenant_id),
            role       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            is_active  BOOLEAN NOT NULL DEFAULT TRUE,
            created_at DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            user_id    TEXT PRIMARY KEY,
            email      TEXT NOT NULL UNIQUE,
            name       TEXT NOT NULL DEFAULT '',
            role       TEXT NOT NULL DEFAULT 'user',
            pw_hash    TEXT NOT NULL,
            is_active  BOOLEAN NOT NULL DEFAULT TRUE,
            created_at DOUBLE PRECISION NOT NULL DEFAULT 0,
            tenant_id  TEXT NOT NULL DEFAULT '',
            phone      TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS leads (
            lead_id          TEXT PRIMARY KEY,
            name             TEXT NOT NULL DEFAULT '',
            email            TEXT NOT NULL DEFAULT '',
            phone            TEXT NOT NULL DEFAULT '',
            dob              TEXT NOT NULL DEFAULT '',
            consent          BOOLEAN NOT NULL DEFAULT FALSE,
            status           TEXT NOT NULL DEFAULT 'submitted',
            created_at       DOUBLE PRECISION NOT NULL,
            updated_at       DOUBLE PRECISION NOT NULL,
            tenant_id        TEXT NOT NULL DEFAULT '',
            notes            TEXT NOT NULL DEFAULT '',
            report_json      TEXT NOT NULL DEFAULT '',
            place_of_birth   TEXT NOT NULL DEFAULT '',
            time_of_birth    TEXT NOT NULL DEFAULT '',
            alias_name       TEXT NOT NULL DEFAULT '',
            question         TEXT NOT NULL DEFAULT '',
            preferred_language TEXT NOT NULL DEFAULT 'en'
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id  TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL DEFAULT '',
            state_json  TEXT NOT NULL DEFAULT '{}',
            created_at  DOUBLE PRECISION NOT NULL,
            updated_at  DOUBLE PRECISION NOT NULL,
            expires_at  DOUBLE PRECISION NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
        CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON leads(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_exp    ON sessions(expires_at);
        """
    else:
        return """
        CREATE TABLE IF NOT EXISTS tenants (
            tenant_id  TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            is_active  INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            key        TEXT PRIMARY KEY,
            tenant_id  TEXT NOT NULL REFERENCES tenants(tenant_id),
            role       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            is_active  INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            user_id    TEXT PRIMARY KEY,
            email      TEXT NOT NULL UNIQUE,
            name       TEXT NOT NULL DEFAULT '',
            role       TEXT NOT NULL DEFAULT 'user',
            pw_hash    TEXT NOT NULL,
            is_active  INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL DEFAULT 0,
            tenant_id  TEXT NOT NULL DEFAULT '',
            phone      TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS leads (
            lead_id          TEXT PRIMARY KEY,
            name             TEXT NOT NULL DEFAULT '',
            email            TEXT NOT NULL DEFAULT '',
            phone            TEXT NOT NULL DEFAULT '',
            dob              TEXT NOT NULL DEFAULT '',
            consent          INTEGER NOT NULL DEFAULT 0,
            status           TEXT NOT NULL DEFAULT 'submitted',
            created_at       REAL NOT NULL,
            updated_at       REAL NOT NULL,
            tenant_id        TEXT NOT NULL DEFAULT '',
            notes            TEXT NOT NULL DEFAULT '',
            report_json      TEXT NOT NULL DEFAULT '',
            place_of_birth   TEXT NOT NULL DEFAULT '',
            time_of_birth    TEXT NOT NULL DEFAULT '',
            alias_name       TEXT NOT NULL DEFAULT '',
            question         TEXT NOT NULL DEFAULT '',
            preferred_language TEXT NOT NULL DEFAULT 'en'
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id  TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL DEFAULT '',
            state_json  TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            expires_at  REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
        CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON leads(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_exp    ON sessions(expires_at);
        """


# ── Public API ────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables if they don't exist. Safe to call on every startup."""
    with _tx() as conn:
        if _USE_PG:
            cur = conn.cursor()
            cur.execute(_ddl())
        else:
            conn.executescript(_ddl())
    db_label = _DATABASE_URL.split("@")[-1] if _USE_PG else str(_SQLITE_DB_PATH)
    print(f"[DB] Schema ready ({'PostgreSQL' if _USE_PG else 'SQLite'}): {db_label}")
    # Episodic memory tables (correction store + persona preferences)
    from memory.episodic import init_episodic_tables
    init_episodic_tables()
    print("[DB] Episodic memory tables ready.")


def migrate_from_json() -> None:
    """
    One-shot migration from legacy JSON files to the database.
    Uses INSERT OR IGNORE (SQLite) / ON CONFLICT DO NOTHING (PostgreSQL).
    Safe to run on every startup — duplicate rows are skipped.
    """
    _seed_master_tenant()
    _migrate_auth_keys()
    _migrate_users()
    _migrate_leads()


def _seed_master_tenant() -> None:
    """Ensure tenant_master always exists — required for superadmin user."""
    with _tx() as conn:
        _insert_or_ignore(conn, "tenants",
            ["tenant_id", "name", "is_active", "created_at"],
            ("tenant_master", "AstroIntel Master", 1 if not _USE_PG else True, time.time()),
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _insert_or_ignore(conn, table: str, columns: list[str], values: tuple) -> None:
    cols = ", ".join(columns)
    placeholders = ", ".join(["%s" if _USE_PG else "?"] * len(columns))
    conflict = "ON CONFLICT DO NOTHING" if _USE_PG else "OR IGNORE"
    if _USE_PG:
        sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    else:
        sql = f"INSERT OR IGNORE INTO {table} ({cols}) VALUES ({placeholders})"
    if _USE_PG:
        conn.cursor().execute(sql, values)
    else:
        conn.execute(sql, values)


# ── Auth keys migration ───────────────────────────────────────────────────────

_AUTH_STORE_PATH = Path(os.environ.get("AUTH_STORE_PATH", "auth_keys.json"))


def _migrate_auth_keys() -> None:
    if not _AUTH_STORE_PATH.exists():
        return
    try:
        data = json.loads(_AUTH_STORE_PATH.read_text())
    except Exception:
        return

    with _tx() as conn:
        for t in data.get("tenants", []):
            _insert_or_ignore(conn, "tenants",
                ["tenant_id", "name", "is_active", "created_at"],
                (t["tenant_id"], t["name"],
                 bool(t.get("is_active", True)) if _USE_PG else int(t.get("is_active", True)),
                 t.get("created_at", time.time())),
            )
        for k in data.get("api_keys", []):
            _insert_or_ignore(conn, "api_keys",
                ["key", "tenant_id", "role", "description", "is_active", "created_at"],
                (k["key"], k["tenant_id"], k["role"], k.get("description", ""),
                 bool(k.get("is_active", True)) if _USE_PG else int(k.get("is_active", True)),
                 k.get("created_at", time.time())),
            )
    print(f"[DB] Migrated auth_keys from {_AUTH_STORE_PATH}")


# ── Users migration ───────────────────────────────────────────────────────────

_USERS_STORE_PATH = Path(os.environ.get("USERS_STORE_PATH", "users.json"))


def _migrate_users() -> None:
    if not _USERS_STORE_PATH.exists():
        return
    try:
        data = json.loads(_USERS_STORE_PATH.read_text())
    except Exception:
        return

    with _tx() as conn:
        for u in data.get("users", []):
            _insert_or_ignore(conn, "users",
                ["user_id", "email", "name", "role", "pw_hash", "is_active",
                 "created_at", "tenant_id", "phone"],
                (u["user_id"], u["email"], u.get("name", ""), u.get("role", "user"),
                 u["pw_hash"],
                 bool(u.get("is_active", True)) if _USE_PG else int(u.get("is_active", True)),
                 u.get("created_at", 0), u.get("tenant_id", ""), u.get("phone", "")),
            )
    print(f"[DB] Migrated users from {_USERS_STORE_PATH}")


# ── Leads migration ───────────────────────────────────────────────────────────

_LEADS_STORE_PATH = Path(os.environ.get("LEADS_STORE_PATH", "leads.json"))


def _migrate_leads() -> None:
    if not _LEADS_STORE_PATH.exists():
        return
    try:
        data = json.loads(_LEADS_STORE_PATH.read_text())
    except Exception:
        return

    with _tx() as conn:
        for l in data.get("leads", []):
            _insert_or_ignore(conn, "leads",
                ["lead_id", "name", "email", "phone", "dob", "consent", "status",
                 "created_at", "updated_at", "tenant_id", "notes", "report_json",
                 "place_of_birth", "time_of_birth", "alias_name", "question", "preferred_language"],
                (l["lead_id"], l.get("name", ""), l.get("email", ""), l.get("phone", ""),
                 l.get("dob", ""),
                 bool(l.get("consent", False)) if _USE_PG else int(l.get("consent", False)),
                 l.get("status", "submitted"),
                 l.get("created_at", time.time()), l.get("updated_at", time.time()),
                 l.get("tenant_id", ""), l.get("notes", ""), l.get("report_json", ""),
                 l.get("place_of_birth", ""), l.get("time_of_birth", ""),
                 l.get("alias_name", ""), l.get("question", ""),
                 l.get("preferred_language", "en")),
            )
    print(f"[DB] Migrated leads from {_LEADS_STORE_PATH}")
