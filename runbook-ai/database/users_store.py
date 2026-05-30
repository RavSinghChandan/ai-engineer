"""CRUD for tenants and users."""
from __future__ import annotations
import time
from typing import Optional, List
from database.db import get_conn


# ── Tenants ──────────────────────────────────────────────────────────────────

def create_tenant(name: str, slug: str, plan: str = "free") -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO tenants (name, slug, plan, is_active, created_at) VALUES (?,?,?,1,?)",
            (name, slug, plan, time.time()),
        )
        conn.commit()
        return cur.lastrowid


def get_tenant(tenant_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE id=?", (tenant_id,)).fetchone()
        return dict(row) if row else None


def get_tenant_by_slug(slug: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE slug=?", (slug,)).fetchone()
        return dict(row) if row else None


def list_tenants() -> List[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM tenants ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(email: str, hashed_password: str, full_name: str, role: str, tenant_id: int) -> int:
    now = time.time()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO users (email, hashed_password, full_name, role, tenant_id, is_active, created_at, updated_at)
               VALUES (?,?,?,?,?,1,?,?)""",
            (email, hashed_password, full_name, role, tenant_id, now, now),
        )
        conn.commit()
        return cur.lastrowid


def get_user_by_email(email: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        return dict(row) if row else None


def get_user(user_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None


def list_users_for_tenant(tenant_id: int) -> List[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, email, full_name, role, is_active, created_at FROM users WHERE tenant_id=? ORDER BY created_at",
            (tenant_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def update_user_role(user_id: int, role: str) -> bool:
    with get_conn() as conn:
        n = conn.execute(
            "UPDATE users SET role=?, updated_at=? WHERE id=?",
            (role, time.time(), user_id),
        ).rowcount
        conn.commit()
        return n > 0
