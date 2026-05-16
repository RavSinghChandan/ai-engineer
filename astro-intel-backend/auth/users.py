"""
User store — email + hashed-password accounts — SQLite backend.

Public API is identical to the previous in-memory/JSON version.

On first boot, a SUPERADMIN user is created from env vars:
  SUPERADMIN_EMAIL    (default: admin@aura.local)
  SUPERADMIN_PASSWORD (default: AuraAdmin2024!)
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from dataclasses import dataclass
from typing import List, Optional

from auth.models import Role
import database as _db

_SALT = os.environ.get("PW_SALT", "astrointel-pw-salt-change-me")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class User:
    user_id:    str
    email:      str
    name:       str
    role:       str
    pw_hash:    str
    is_active:  bool  = True
    created_at: float = 0.0
    tenant_id:  str   = ""
    phone:      str   = ""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return hmac.new(_SALT.encode(), password.encode(), hashlib.sha256).hexdigest()


def _row_to_user(row) -> User:
    return User(
        user_id    = row["user_id"],
        email      = row["email"],
        name       = row["name"],
        role       = row["role"],
        pw_hash    = row["pw_hash"],
        is_active  = bool(row["is_active"]),
        created_at = row["created_at"],
        tenant_id  = row["tenant_id"],
        phone      = row["phone"],
    )


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"[^\d+]", "", phone.strip())
    if len(digits) == 10 and digits.isdigit():
        digits = "+91" + digits
    return digits


# ── Bootstrap ─────────────────────────────────────────────────────────────────

def load() -> None:
    """Called once at startup — bootstraps superadmin user if needed."""
    _bootstrap_superadmin()


def _bootstrap_superadmin() -> None:
    sa_email = os.environ.get("SUPERADMIN_EMAIL", "admin@aura.local")
    sa_pass  = os.environ.get("SUPERADMIN_PASSWORD", "AuraAdmin2024!")

    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT user_id FROM users WHERE email=?", (sa_email,)).fetchone()
        if row:
            return

        import auth.store as store
        tenant = store.get_tenant("tenant_master")
        if not tenant:
            store.load()
            tenant = store.get_tenant("tenant_master")

        conn.execute(
            """INSERT OR IGNORE INTO users
               (user_id, email, name, role, pw_hash, is_active, created_at, tenant_id, phone)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            ("user_superadmin", sa_email, "AstroIntel Admin", Role.SUPERADMIN.value,
             _hash(sa_pass), 1, time.time(), "tenant_master", ""),
        )
        conn.commit()
        print(f"\n[AUTH] ✓ SUPERADMIN user: {sa_email}  /  password from SUPERADMIN_PASSWORD env\n")
    finally:
        conn.close()


# ── Public API ────────────────────────────────────────────────────────────────

def get_by_email(email: str) -> Optional[User]:
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email.lower().strip(),)).fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def get_by_phone(phone: str) -> Optional[User]:
    normalized = _normalize_phone(phone)
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE phone=?", (normalized,)).fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def verify_password(user: User, password: str) -> bool:
    return hmac.compare_digest(user.pw_hash, _hash(password))


def set_password(email: str, password: str) -> bool:
    conn = _db.get_conn()
    try:
        cur = conn.execute(
            "UPDATE users SET pw_hash=? WHERE email=?", (_hash(password), email.lower())
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def set_name(email: str, name: str) -> bool:
    conn = _db.get_conn()
    try:
        cur = conn.execute(
            "UPDATE users SET name=? WHERE email=?", (name.strip(), email.lower())
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def update_phone(email: str, phone: str) -> bool:
    normalized = _normalize_phone(phone) if phone else ""
    conn = _db.get_conn()
    try:
        cur = conn.execute(
            "UPDATE users SET phone=? WHERE email=?", (normalized, email.lower())
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def create_user(email: str, name: str, password: str,
                role: str = "user", tenant_id: str = "", phone: str = "") -> User:
    key = email.lower().strip()
    if not _EMAIL_RE.match(key):
        raise ValueError("Please enter a valid email address.")
    if not name.strip():
        raise ValueError("Name is required.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    # Check duplicate
    if get_by_email(key):
        raise ValueError("An account with this email already exists.")

    import auth.store as store
    if not tenant_id:
        tenant = store.create_tenant(name or email.split("@")[0])
        tenant_id = tenant.tenant_id

    user_id = f"user_{secrets.token_hex(8)}"
    now     = time.time()
    norm_phone = _normalize_phone(phone) if phone else ""

    conn = _db.get_conn()
    try:
        conn.execute(
            """INSERT INTO users
               (user_id, email, name, role, pw_hash, is_active, created_at, tenant_id, phone)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (user_id, key, name.strip() or key, role,
             _hash(password), 1, now, tenant_id, norm_phone),
        )
        conn.commit()
    finally:
        conn.close()

    return User(user_id=user_id, email=key, name=name.strip() or key, role=role,
                pw_hash=_hash(password), is_active=True, created_at=now,
                tenant_id=tenant_id, phone=norm_phone)


def create_admin_user(email: str, name: str, password: str, tenant_id: str = "") -> User:
    return create_user(email, name, password, role="admin", tenant_id=tenant_id)


def list_users() -> List[User]:
    conn = _db.get_conn()
    try:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        return [_row_to_user(r) for r in rows]
    finally:
        conn.close()


def set_active(email: str, active: bool) -> bool:
    conn = _db.get_conn()
    try:
        cur = conn.execute(
            "UPDATE users SET is_active=? WHERE email=?", (int(active), email.lower())
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_user(email: str) -> bool:
    key = email.lower()
    user = get_by_email(key)
    if not user:
        return False
    if user.role == "superadmin":
        raise ValueError("Cannot delete SUPERADMIN account.")
    conn = _db.get_conn()
    try:
        cur = conn.execute("DELETE FROM users WHERE email=?", (key,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def clear_for_tests() -> None:
    conn = _db.get_conn()
    try:
        conn.execute("DELETE FROM users")
        conn.commit()
    finally:
        conn.close()
