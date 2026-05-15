"""
User store — email + hashed-password accounts.

Separate from the API-key store (auth/store.py). Both coexist:
  - API keys: internal/service auth, kept for tests + backend-to-backend
  - User accounts: human login via email+password on the UI

On first boot, a SUPERADMIN user is created from env vars:
  SUPERADMIN_EMAIL    (default: admin@aura.local)
  SUPERADMIN_PASSWORD (default: AuraAdmin2024!)
"""
from __future__ import annotations

import hashlib, hmac, json, os, secrets, time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Dict, List, Optional

from auth.models import Role

_STORE_PATH = Path(os.environ.get("USERS_STORE_PATH", "users.json"))


@dataclass
class User:
    user_id:    str
    email:      str
    name:       str
    role:       str          # "user" | "admin" | "superadmin"
    pw_hash:    str          # sha256-hmac of password
    is_active:  bool = True
    created_at: float = 0.0
    tenant_id:  str = ""     # links to the tenant in auth/store.py


_users: Dict[str, User] = {}   # email → User
_SALT  = os.environ.get("PW_SALT", "astrointel-pw-salt-change-me")


def _hash(password: str) -> str:
    return hmac.new(_SALT.encode(), password.encode(), hashlib.sha256).hexdigest()


def _flush() -> None:
    try:
        _STORE_PATH.write_text(
            json.dumps({"users": [asdict(u) for u in _users.values()]}, indent=2)
        )
    except Exception:
        pass


def load() -> None:
    if _STORE_PATH.exists():
        try:
            data = json.loads(_STORE_PATH.read_text())
            for d in data.get("users", []):
                _users[d["email"]] = User(**d)
        except Exception:
            pass
    _bootstrap_superadmin()


def _bootstrap_superadmin() -> None:
    sa_email = os.environ.get("SUPERADMIN_EMAIL", "admin@aura.local")
    sa_pass  = os.environ.get("SUPERADMIN_PASSWORD", "AuraAdmin2024!")
    if sa_email in _users:
        return
    import auth.store as store
    # Ensure master tenant exists
    tenant = store.get_tenant("tenant_master")
    if not tenant:
        store.load()
        tenant = store.get_tenant("tenant_master")

    _users[sa_email] = User(
        user_id    = "user_superadmin",
        email      = sa_email,
        name       = "AstroIntel Admin",
        role       = Role.SUPERADMIN.value,
        pw_hash    = _hash(sa_pass),
        is_active  = True,
        created_at = time.time(),
        tenant_id  = "tenant_master",
    )
    _flush()
    print(f"\n[AUTH] ✓ SUPERADMIN user: {sa_email}  /  password from SUPERADMIN_PASSWORD env\n")


def get_by_email(email: str) -> Optional[User]:
    return _users.get(email.lower().strip())


def verify_password(user: User, password: str) -> bool:
    return hmac.compare_digest(user.pw_hash, _hash(password))


def create_user(email: str, name: str, password: str,
                role: str = "user", tenant_id: str = "") -> User:
    """Create a new user. Raises ValueError if email already exists."""
    key = email.lower().strip()
    if key in _users:
        raise ValueError("An account with this email already exists.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    import auth.store as store
    # Create a personal tenant for the user if not provided
    if not tenant_id:
        tenant = store.create_tenant(name or email.split("@")[0])
        tenant_id = tenant.tenant_id

    user = User(
        user_id    = f"user_{secrets.token_hex(8)}",
        email      = key,
        name       = name.strip() or key,
        role       = role,
        pw_hash    = _hash(password),
        is_active  = True,
        created_at = time.time(),
        tenant_id  = tenant_id,
    )
    _users[key] = user
    _flush()
    return user


def create_admin_user(email: str, name: str, password: str,
                      tenant_id: str = "") -> User:
    """SUPERADMIN creates an admin account. Raises on duplicate."""
    return create_user(email, name, password, role="admin", tenant_id=tenant_id)


def list_users() -> List[User]:
    return sorted(_users.values(), key=lambda u: u.created_at, reverse=True)


def set_active(email: str, active: bool) -> bool:
    user = _users.get(email.lower())
    if not user:
        return False
    user.is_active = active
    _flush()
    return True


def delete_user(email: str) -> bool:
    key = email.lower()
    if key not in _users:
        return False
    # Protect superadmin
    if _users[key].role == "superadmin":
        raise ValueError("Cannot delete SUPERADMIN account.")
    del _users[key]
    _flush()
    return True


def clear_for_tests() -> None:
    _users.clear()
