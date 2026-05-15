"""
Auth domain models.

Role hierarchy (lowest → highest):
  USER  — can run analysis, approve/translate their own sessions only
  ADMIN — all USER permissions + metrics, guardrail stats, all sessions in their tenant
  SUPERADMIN — all ADMIN permissions + manage tenants, reset circuit breakers, see all tenants
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Role(str, Enum):
    USER       = "user"
    ADMIN      = "admin"
    SUPERADMIN = "superadmin"

    def can(self, required: "Role") -> bool:
        """Return True if this role meets or exceeds the required role."""
        order = [Role.USER, Role.ADMIN, Role.SUPERADMIN]
        return order.index(self) >= order.index(required)


@dataclass
class Tenant:
    tenant_id:   str
    name:        str
    is_active:   bool = True
    created_at:  float = 0.0   # unix timestamp


@dataclass
class APIKey:
    key:         str            # sk-<tenant_id>-<random>
    tenant_id:   str
    role:        Role
    description: str = ""
    is_active:   bool = True
    created_at:  float = 0.0


@dataclass
class TenantContext:
    """Injected into every authenticated request."""
    tenant_id:  str
    role:       Role
    api_key:    str             # the key that was presented
    tenant_name: str = ""

    def is_superadmin(self) -> bool:
        return self.role == Role.SUPERADMIN

    def is_admin_or_above(self) -> bool:
        return self.role.can(Role.ADMIN)


@dataclass
class TokenPayload:
    """JWT claims."""
    tenant_id:  str
    role:       str
    api_key:    str
    tenant_name: str = ""
    exp:        Optional[int] = None
