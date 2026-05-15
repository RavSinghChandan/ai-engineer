"""
Tenant and API-key store.

Storage: in-memory dict + JSON file backup (auth_keys.json next to main.py).
On startup the file is loaded; every write is flushed to disk immediately.
No database needed for now — swap to Postgres later without touching the interface.

SUPERADMIN bootstrap:
  On first run, if the store is empty, one SUPERADMIN key is created automatically
  using the MASTER_API_KEY env var (default: sk-master-astrointel-change-me).
  Print it to stdout so you can copy it on first deploy.
"""
from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path
from typing import Dict, List, Optional

from auth.models import APIKey, Role, Tenant

# ── File path ────────────────────────────────────────────────────────────────
_STORE_PATH = Path(os.environ.get("AUTH_STORE_PATH", "auth_keys.json"))

# ── In-memory state ───────────────────────────────────────────────────────────
_tenants:  Dict[str, Tenant] = {}   # tenant_id → Tenant
_api_keys: Dict[str, APIKey] = {}   # key string → APIKey


# ── Persistence helpers ───────────────────────────────────────────────────────

def _to_dict() -> dict:
    return {
        "tenants": [
            {"tenant_id": t.tenant_id, "name": t.name,
             "is_active": t.is_active, "created_at": t.created_at}
            for t in _tenants.values()
        ],
        "api_keys": [
            {"key": k.key, "tenant_id": k.tenant_id, "role": k.role.value,
             "description": k.description, "is_active": k.is_active,
             "created_at": k.created_at}
            for k in _api_keys.values()
        ],
    }


def _from_dict(data: dict) -> None:
    for t in data.get("tenants", []):
        _tenants[t["tenant_id"]] = Tenant(**t)
    for k in data.get("api_keys", []):
        k["role"] = Role(k["role"])
        _api_keys[k["key"]] = APIKey(**k)


def _flush() -> None:
    try:
        _STORE_PATH.write_text(json.dumps(_to_dict(), indent=2))
    except Exception:
        pass   # never crash on persistence failure


def load() -> None:
    """Load store from disk. Call once at startup."""
    if _STORE_PATH.exists():
        try:
            _from_dict(json.loads(_STORE_PATH.read_text()))
        except Exception:
            pass
    _bootstrap_superadmin()


def _bootstrap_superadmin() -> None:
    """Create the SUPERADMIN tenant + key on first run if store is empty."""
    if _api_keys:
        return  # already have keys

    master_key = os.environ.get("MASTER_API_KEY", "sk-master-astrointel-change-me")
    tenant_id  = "tenant_master"
    now        = time.time()

    _tenants[tenant_id] = Tenant(
        tenant_id  = tenant_id,
        name       = "AstroIntel Master",
        is_active  = True,
        created_at = now,
    )
    _api_keys[master_key] = APIKey(
        key         = master_key,
        tenant_id   = tenant_id,
        role        = Role.SUPERADMIN,
        description = "Bootstrap superadmin key — rotate in production",
        is_active   = True,
        created_at  = now,
    )
    _flush()
    print(f"\n[AUTH] ✓ Bootstrapped SUPERADMIN key: {master_key}\n"
          f"       Set MASTER_API_KEY env var to change this.\n")


# ── Public API ────────────────────────────────────────────────────────────────

def lookup_key(key: str) -> Optional[APIKey]:
    """Return APIKey if it exists and is active, else None."""
    entry = _api_keys.get(key)
    if entry and entry.is_active:
        tenant = _tenants.get(entry.tenant_id)
        if tenant and tenant.is_active:
            return entry
    return None


def get_tenant(tenant_id: str) -> Optional[Tenant]:
    return _tenants.get(tenant_id)


def create_tenant(name: str) -> Tenant:
    """Create a new tenant. Returns the Tenant object."""
    tenant_id = f"tenant_{secrets.token_hex(6)}"
    now       = time.time()
    tenant    = Tenant(tenant_id=tenant_id, name=name, is_active=True, created_at=now)
    _tenants[tenant_id] = tenant
    _flush()
    return tenant


def create_api_key(tenant_id: str, role: Role, description: str = "") -> APIKey:
    """Generate a new API key for a tenant+role. Returns the APIKey."""
    if tenant_id not in _tenants:
        raise ValueError(f"Tenant '{tenant_id}' does not exist.")
    raw_key = f"sk-{tenant_id[:12]}-{secrets.token_urlsafe(16)}"
    now     = time.time()
    api_key = APIKey(
        key         = raw_key,
        tenant_id   = tenant_id,
        role        = role,
        description = description,
        is_active   = True,
        created_at  = now,
    )
    _api_keys[raw_key] = api_key
    _flush()
    return api_key


def revoke_key(key: str) -> bool:
    """Mark a key inactive. Returns True if it existed."""
    entry = _api_keys.get(key)
    if entry:
        entry.is_active = False
        _flush()
        return True
    return False


def list_tenants() -> List[Tenant]:
    return list(_tenants.values())


def list_keys_for_tenant(tenant_id: str) -> List[APIKey]:
    return [k for k in _api_keys.values() if k.tenant_id == tenant_id]


def set_tenant_active(tenant_id: str, active: bool) -> bool:
    """Lock or unlock a tenant. Returns True if found."""
    tenant = _tenants.get(tenant_id)
    if not tenant:
        return False
    tenant.is_active = active
    _flush()
    return True


def delete_tenant(tenant_id: str) -> bool:
    """Delete a tenant and all their keys. Returns True if found."""
    if tenant_id not in _tenants:
        return False
    _tenants.pop(tenant_id)
    keys_to_remove = [k for k, v in _api_keys.items() if v.tenant_id == tenant_id]
    for k in keys_to_remove:
        _api_keys.pop(k)
    _flush()
    return True


def list_all_keys() -> List[APIKey]:
    """Return every API key across all tenants (SUPERADMIN use only)."""
    return list(_api_keys.values())


def clear_for_tests() -> None:
    """Reset all state — only call from tests."""
    _tenants.clear()
    _api_keys.clear()
