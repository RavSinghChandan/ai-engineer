"""
Role-based access to the ontology. Default deny: a role that is not in POLICY sees nothing.

    admin            every record, every field
    project_manager  - projects: the ones they manage (their user id is in project.manager_ids)
                     - allocations: the ones on those projects
                     - employees: staffed on those projects (active allocation), or on the
                       bench (no active allocation anywhere); without email, phone and cost rate
                     - skills and roles: the shared catalogues

A record a principal may not see is reported as not found, so its existence does not
leak. Every decision goes to the audit trail (``decisions()``).

    view = View(onto, Principal("pm.meera", "project_manager"))
    view.employees()              # only permitted employees, masked
    view.can_see("project", "P-ATLAS")   # False
"""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Any, Deque, Dict, List, Set

from ontology.model import Allocation, Employee, Ontology, Project

ADMIN = "admin"
PROJECT_MANAGER = "project_manager"

# Fields of an employee each role may read. Contact details and cost stay with HR/admin.
EMPLOYEE_FIELDS: Dict[str, Set[str]] = {
    ADMIN: {"id", "name", "email", "phone", "grade", "location", "cost_rate_per_day", "skills", "source"},
    PROJECT_MANAGER: {"id", "name", "grade", "location", "skills", "source"},
}
POLICY = set(EMPLOYEE_FIELDS)


class AccessDenied(PermissionError):
    """The principal's role has no access to the ontology at all."""


class NotVisible(LookupError):
    """The record does not exist, or the principal may not see it (the two look the same)."""


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str


_audit: Deque[Dict[str, Any]] = deque(maxlen=500)
_lock = threading.Lock()


def _log(principal: Principal, action: str, target: str, decision: str) -> None:
    with _lock:
        _audit.appendleft({"ts": time.time(), "user": principal.user_id, "role": principal.role,
                           "action": action, "target": target, "decision": decision})


def decisions(limit: int = 100) -> List[Dict[str, Any]]:
    with _lock:
        return list(_audit)[:limit]


def manager_ids(onto: Ontology) -> Set[str]:
    """User ids named as a manager on any project: the accounts that log in as project managers."""
    return {m for p in onto.projects.values() for m in p.manager_ids}


class View:
    """The part of the ontology one principal may see."""

    def __init__(self, onto: Ontology, principal: Principal):
        if principal.role not in POLICY:
            _log(principal, "open", "ontology", "deny")
            raise AccessDenied(f"Role '{principal.role}' has no access to the ontology.")
        self.onto = onto
        self.principal = principal
        self.is_admin = principal.role == ADMIN
        self._projects = {pid for pid, p in onto.projects.items()
                          if self.is_admin or principal.user_id in p.manager_ids}
        self._allocations = {aid for aid, a in onto.allocations.items() if a.project_id in self._projects}
        if self.is_admin:
            self._employees = set(onto.employees)
        else:
            staffed = {a.employee_id for a in onto.allocations.values()
                       if a.active and a.project_id in self._projects}
            busy = {a.employee_id for a in onto.allocations.values() if a.active}
            self._employees = staffed | (set(onto.employees) - busy)

    # ── checks ───────────────────────────────────────────────────────────────
    def can_see(self, entity: str, record_id: str) -> bool:
        if record_id not in self.onto.table(entity):
            return False
        if entity in ("skill", "role"):
            return True
        allowed = {"employee": self._employees, "project": self._projects,
                   "allocation": self._allocations}[entity]
        return record_id in allowed

    def require(self, entity: str, record_id: str, action: str = "read") -> None:
        ok = self.can_see(entity, record_id)
        _log(self.principal, action, f"{entity}:{record_id}", "allow" if ok else "deny")
        if not ok:
            raise NotVisible(f"No {entity} {record_id}")

    # ── reads ────────────────────────────────────────────────────────────────
    def employee(self, record: Employee) -> Dict[str, Any]:
        """One employee with only the fields this role may read."""
        data = asdict(record)
        fields = EMPLOYEE_FIELDS[self.principal.role]
        return {k: v for k, v in data.items() if k in fields}

    def employees(self) -> List[Dict[str, Any]]:
        _log(self.principal, "list", "employee", "allow")
        return [self.employee(e) for eid, e in sorted(self.onto.employees.items()) if eid in self._employees]

    def projects(self) -> List[Dict[str, Any]]:
        _log(self.principal, "list", "project", "allow")
        return [asdict(p) for pid, p in sorted(self.onto.projects.items()) if pid in self._projects]

    def allocations(self) -> List[Dict[str, Any]]:
        _log(self.principal, "list", "allocation", "allow")
        return [asdict(a) for aid, a in sorted(self.onto.allocations.items()) if aid in self._allocations]

    def visible_allocations_of(self, employee_id: str) -> List[Allocation]:
        return [a for a in self.onto.allocations_of(employee_id) if a.id in self._allocations]

    def project(self, project_id: str) -> Project:
        self.require("project", project_id)
        return self.onto.projects[project_id]

    def employee_ids(self) -> Set[str]:
        return set(self._employees)
