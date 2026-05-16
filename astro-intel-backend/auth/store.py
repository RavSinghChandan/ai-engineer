"""
Tenant and API-key store — SQLite backend.

Public API is identical to the previous in-memory/JSON version.
All callers (auth/router.py, auth/dependencies.py, auth/users.py, main.py) work unchanged.
"""
from __future__ import annotations

import os
import secrets
import time
from typing import List, Optional

from auth.models import APIKey, Role, Tenant
import database as _db


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_tenant(row) -> Tenant:
    return Tenant(
        tenant_id  = row["tenant_id"],
        name       = row["name"],
        is_active  = bool(row["is_active"]),
        created_at = row["created_at"],
    )


def _row_to_apikey(row) -> APIKey:
    return APIKey(
        key         = row["key"],
        tenant_id   = row["tenant_id"],
        role        = Role(row["role"]),
        description = row["description"],
        is_active   = bool(row["is_active"]),
        created_at  = row["created_at"],
    )


# ── Bootstrap ─────────────────────────────────────────────────────────────────

def load() -> None:
    """Called once at startup — bootstraps superadmin key if needed."""
    _bootstrap_superadmin()


def _bootstrap_superadmin() -> None:
    master_key = os.environ.get("MASTER_API_KEY", "sk-master-astrointel-change-me")
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT key FROM api_keys WHERE key=?", (master_key,)).fetchone()
        if row:
            return  # already exists

        now       = time.time()
        tenant_id = "tenant_master"

        # Ensure master tenant exists
        conn.execute(
            "INSERT OR IGNORE INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,?,?)",
            (tenant_id, "AstroIntel Master", 1, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO api_keys (key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,?,?)",
            (master_key, tenant_id, Role.SUPERADMIN.value,
             "Bootstrap superadmin key — rotate in production", 1, now),
        )
        conn.commit()
        print(f"\n[AUTH] ✓ Bootstrapped SUPERADMIN key: {master_key}\n"
              f"       Set MASTER_API_KEY env var to change this.\n")
    finally:
        conn.close()


# ── Public API ────────────────────────────────────────────────────────────────

def lookup_key(key: str) -> Optional[APIKey]:
    conn = _db.get_conn()
    try:
        row = conn.execute(
            """SELECT k.*, t.is_active AS t_active
               FROM api_keys k JOIN tenants t USING(tenant_id)
               WHERE k.key=? AND k.is_active=1 AND t.is_active=1""",
            (key,)
        ).fetchone()
        return _row_to_apikey(row) if row else None
    finally:
        conn.close()


def get_tenant(tenant_id: str) -> Optional[Tenant]:
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT * FROM tenants WHERE tenant_id=?", (tenant_id,)).fetchone()
        return _row_to_tenant(row) if row else None
    finally:
        conn.close()


def create_tenant(name: str) -> Tenant:
    tenant_id = f"tenant_{secrets.token_hex(6)}"
    now       = time.time()
    conn = _db.get_conn()
    try:
        conn.execute(
            "INSERT INTO tenants (tenant_id, name, is_active, created_at) VALUES (?,?,?,?)",
            (tenant_id, name, 1, now),
        )
        conn.commit()
    finally:
        conn.close()
    return Tenant(tenant_id=tenant_id, name=name, is_active=True, created_at=now)


def create_api_key(tenant_id: str, role: Role, description: str = "") -> APIKey:
    if not get_tenant(tenant_id):
        raise ValueError(f"Tenant '{tenant_id}' does not exist.")
    raw_key = f"sk-{tenant_id[:12]}-{secrets.token_urlsafe(16)}"
    now     = time.time()
    conn = _db.get_conn()
    try:
        conn.execute(
            "INSERT INTO api_keys (key, tenant_id, role, description, is_active, created_at) VALUES (?,?,?,?,?,?)",
            (raw_key, tenant_id, role.value, description, 1, now),
        )
        conn.commit()
    finally:
        conn.close()
    return APIKey(key=raw_key, tenant_id=tenant_id, role=role,
                  description=description, is_active=True, created_at=now)


def revoke_key(key: str) -> bool:
    conn = _db.get_conn()
    try:
        cur = conn.execute("UPDATE api_keys SET is_active=0 WHERE key=?", (key,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_tenants() -> List[Tenant]:
    conn = _db.get_conn()
    try:
        rows = conn.execute("SELECT * FROM tenants ORDER BY created_at").fetchall()
        return [_row_to_tenant(r) for r in rows]
    finally:
        conn.close()


def list_keys_for_tenant(tenant_id: str) -> List[APIKey]:
    conn = _db.get_conn()
    try:
        rows = conn.execute("SELECT * FROM api_keys WHERE tenant_id=?", (tenant_id,)).fetchall()
        return [_row_to_apikey(r) for r in rows]
    finally:
        conn.close()


def set_tenant_active(tenant_id: str, active: bool) -> bool:
    conn = _db.get_conn()
    try:
        cur = conn.execute(
            "UPDATE tenants SET is_active=? WHERE tenant_id=?", (int(active), tenant_id)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_tenant(tenant_id: str) -> bool:
    conn = _db.get_conn()
    try:
        conn.execute("DELETE FROM api_keys WHERE tenant_id=?", (tenant_id,))
        cur = conn.execute("DELETE FROM tenants WHERE tenant_id=?", (tenant_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_all_keys() -> List[APIKey]:
    conn = _db.get_conn()
    try:
        rows = conn.execute("SELECT * FROM api_keys ORDER BY created_at").fetchall()
        return [_row_to_apikey(r) for r in rows]
    finally:
        conn.close()


def clear_for_tests() -> None:
    conn = _db.get_conn()
    try:
        conn.execute("DELETE FROM api_keys")
        conn.execute("DELETE FROM tenants")
        conn.commit()
    finally:
        conn.close()
