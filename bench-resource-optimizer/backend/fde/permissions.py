"""
Agent permission matrix — which agent may READ which data, WRITE (modify)
which records, and which actions must go to a HUMAN for approval.

The matrix itself is data, defined per project in fde/config.py:

    PERMISSION_MATRIX = {
        "role_mapping_agent": {
            "description": "Matches a profile to a role",
            "read":     ["user_profile", "role_catalog"],
            "write":    ["role_mapping"],
            "approval": [],             # actions on these resources need a human
        },
        "human_admin": {"description": "...", "read": ["*"], "write": ["*"], "approval": []},
    }

Default deny: anything not listed is refused.

    permissions.authorize("role_mapping_agent", "read", "user_profile")   # ok
    permissions.authorize("role_mapping_agent", "write", "role_catalog")  # PermissionDenied
    permissions.needs_approval("report_agent", "final_report")            # True → human gate

Every decision is counted (fde.counters → stored with the task) and kept in a
short in-memory audit trail for the dashboard.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List

from fde import config, counters

ACTIONS = ("read", "write")


class PermissionDenied(PermissionError):
    pass


_audit: Deque[Dict[str, Any]] = deque(maxlen=200)
_lock = threading.Lock()


def _allowed(entry: Dict[str, Any], action: str, resource: str) -> bool:
    granted = entry.get(action, [])
    return "*" in granted or resource in granted


def _log(agent: str, action: str, resource: str, decision: str) -> None:
    with _lock:
        _audit.appendleft({"ts": time.time(), "agent": agent, "action": action,
                           "resource": resource, "decision": decision})


def check(agent: str, action: str, resource: str) -> bool:
    """True/False without raising (still counted and audited)."""
    if action not in ACTIONS:
        raise ValueError(f"unknown action '{action}' (use one of {ACTIONS})")
    entry = config.PERMISSION_MATRIX.get(agent)
    ok = bool(entry) and _allowed(entry, action, resource)
    counters.incr("permission_checks")
    if not ok:
        counters.incr("permission_denials")
    _log(agent, action, resource, "allow" if ok else "deny")
    return ok


def authorize(agent: str, action: str, resource: str) -> None:
    """Raise PermissionDenied unless the matrix grants agent → action → resource."""
    if not check(agent, action, resource):
        raise PermissionDenied(f"{agent} may not {action} {resource}")


def needs_approval(agent: str, resource: str) -> bool:
    """True when an action by this agent on this resource must be approved by a human."""
    entry = config.PERMISSION_MATRIX.get(agent) or {}
    required = resource in entry.get("approval", [])
    if required:
        counters.incr("approvals_requested")
        _log(agent, "request_approval", resource, "human_required")
    return required


def matrix() -> Dict[str, Any]:
    """Matrix as a grid for the dashboard: resources × agents → read / write / approval."""
    agents = config.PERMISSION_MATRIX
    resources: List[str] = sorted({
        res for e in agents.values() for k in ("read", "write", "approval")
        for res in e.get(k, []) if res != "*"
    })
    grid = {
        name: {
            res: {
                "read": _allowed(e, "read", res),
                "write": _allowed(e, "write", res),
                "approval": res in e.get("approval", []),
            }
            for res in resources
        }
        for name, e in agents.items()
    }
    return {
        "agents": [{"name": n, "description": e.get("description", ""), "kind": e.get("kind", "agent")}
                   for n, e in agents.items()],
        "resources": resources,
        "grid": grid,
        "policy": "default deny — anything not granted is refused",
    }


def audit_trail(limit: int = 50) -> List[Dict[str, Any]]:
    with _lock:
        return list(_audit)[:limit]
