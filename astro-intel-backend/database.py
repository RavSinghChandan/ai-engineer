"""
SQLite persistence layer for AstroIntel.

Replaces JSON file stores (auth_keys.json, users.json, leads.json) with a
single SQLite database (astrointel.db) that survives backend restarts reliably.

Public API:
    get_conn()            → sqlite3.Connection (WAL mode, FK enforcement)
    init_db()             → CREATE TABLE IF NOT EXISTS (idempotent, safe to call always)
    migrate_from_json()   → one-shot INSERT OR IGNORE from existing JSON files
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

_DB_PATH = Path(os.environ.get("SQLITE_DB_PATH", "astrointel.db"))


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
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


_DDL = """
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

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
"""


def init_db() -> None:
    with _tx() as conn:
        conn.executescript(_DDL)
    print("[DB] SQLite schema ready:", _DB_PATH)


def migrate_from_json() -> None:
    """
    One-shot migration from legacy JSON files to SQLite.
    Uses INSERT OR IGNORE so it is safe to run on every startup — duplicate rows are skipped.
    """
    _migrate_auth_keys()
    _migrate_users()
    _migrate_leads()


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
            conn.execute(
                "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,?,?)",
                (t["tenant_id"], t["name"], int(t.get("is_active", True)), t.get("created_at", time.time())),
            )
        for k in data.get("api_keys", []):
            conn.execute(
                "INSERT OR IGNORE INTO api_keys (key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,?,?)",
                (k["key"], k["tenant_id"], k["role"], k.get("description", ""),
                 int(k.get("is_active", True)), k.get("created_at", time.time())),
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
            conn.execute(
                """INSERT OR IGNORE INTO users
                   (user_id, email, name, role, pw_hash, is_active, created_at, tenant_id, phone)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (u["user_id"], u["email"], u.get("name", ""), u.get("role", "user"),
                 u["pw_hash"], int(u.get("is_active", True)), u.get("created_at", 0),
                 u.get("tenant_id", ""), u.get("phone", "")),
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
            conn.execute(
                """INSERT OR IGNORE INTO leads
                   (lead_id, name, email, phone, dob, consent, status,
                    created_at, updated_at, tenant_id, notes, report_json,
                    place_of_birth, time_of_birth, alias_name, question, preferred_language)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (l["lead_id"], l.get("name", ""), l.get("email", ""), l.get("phone", ""),
                 l.get("dob", ""), int(l.get("consent", False)), l.get("status", "submitted"),
                 l.get("created_at", time.time()), l.get("updated_at", time.time()),
                 l.get("tenant_id", ""), l.get("notes", ""), l.get("report_json", ""),
                 l.get("place_of_birth", ""), l.get("time_of_birth", ""),
                 l.get("alias_name", ""), l.get("question", ""),
                 l.get("preferred_language", "en")),
            )

    print(f"[DB] Migrated leads from {_LEADS_STORE_PATH}")
