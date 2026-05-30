"""
RAGless conflict detector.
Finds contradicting commands across multiple runbooks using exact string
matching and structural analysis — no vector similarity.

Examples of conflicts:
- Runbook A says: kubectl scale deployment/myapp --replicas=0
- Runbook B says: kubectl scale deployment/myapp --replicas=3
  → Direct conflict: scaling to 0 vs 3 on the same resource

- Runbook A says: systemctl stop postgresql
- Runbook B says: systemctl restart postgresql
  → Operational conflict: stop vs restart on same service
"""
from __future__ import annotations
import re
from typing import List, Optional
from database.runbooks_store import get_runbook


CONFLICT_PATTERNS = [
    # kubectl scale conflicts
    (r"kubectl scale (.+?) --replicas=(\d+)", "scale"),
    # systemctl start/stop/restart conflicts
    (r"systemctl (start|stop|restart|disable|enable) (\S+)", "service_control"),
    # docker/compose stop vs start
    (r"docker(?:-compose)? (start|stop|restart|kill|rm) (\S+)", "container_control"),
    # database drop/create
    (r"DROP (TABLE|DATABASE|INDEX) (\S+)", "db_drop"),
    (r"CREATE (TABLE|DATABASE|INDEX) (\S+)", "db_create"),
    # network interface up/down
    (r"ip link set (\S+) (up|down)", "network_interface"),
]

INVERSE_ACTIONS = {
    "start": "stop", "stop": "start",
    "up": "down", "down": "up",
    "enable": "disable", "disable": "enable",
    "restart": "stop",
}


def detect_conflicts(runbook_ids: List[int]) -> List[dict]:
    """
    Compare commands across multiple runbooks.
    Returns list of conflict dicts, empty list if no conflicts found.
    """
    if len(runbook_ids) < 2:
        return []

    # Build command registry: {runbook_id: [commands]}
    registry = {}
    for rb_id in runbook_ids:
        rb = get_runbook(rb_id)
        if not rb:
            continue
        commands = []
        for step in rb.get("steps", []):
            for cmd in step.get("commands", []):
                commands.append({
                    "runbook_id": rb_id,
                    "runbook_title": rb["title"],
                    "step_number": step["step_number"],
                    "step_title": step["title"],
                    "command": cmd,
                })
        registry[rb_id] = commands

    conflicts = []
    rb_ids = list(registry.keys())

    for i in range(len(rb_ids)):
        for j in range(i + 1, len(rb_ids)):
            id_a, id_b = rb_ids[i], rb_ids[j]
            found = _compare_command_sets(registry[id_a], registry[id_b])
            conflicts.extend(found)

    return conflicts


def _compare_command_sets(cmds_a: List[dict], cmds_b: List[dict]) -> List[dict]:
    conflicts = []

    for cmd_a in cmds_a:
        for cmd_b in cmds_b:
            conflict = _check_conflict(cmd_a, cmd_b)
            if conflict:
                conflicts.append(conflict)

    return conflicts


def _check_conflict(cmd_a: dict, cmd_b: dict) -> Optional[dict]:
    text_a = cmd_a["command"].strip()
    text_b = cmd_b["command"].strip()

    for pattern, conflict_type in CONFLICT_PATTERNS:
        match_a = re.search(pattern, text_a, re.IGNORECASE)
        match_b = re.search(pattern, text_b, re.IGNORECASE)
        if not match_a or not match_b:
            continue
        result = _evaluate_conflict(cmd_a, cmd_b, conflict_type, match_a, match_b)
        if result:
            return result

    return None


def _evaluate_conflict(
    cmd_a: dict, cmd_b: dict,
    conflict_type: str,
    match_a: re.Match, match_b: re.Match,
) -> Optional[dict]:
    if conflict_type == "scale":
        return _check_scale_conflict(cmd_a, cmd_b, conflict_type, match_a, match_b)
    if conflict_type in ("service_control", "container_control", "network_interface"):
        return _check_operation_conflict(cmd_a, cmd_b, conflict_type, match_a, match_b)
    if conflict_type in ("db_drop", "db_create"):
        return _check_schema_conflict(cmd_a, cmd_b, conflict_type, match_a, match_b)
    return None


def _check_scale_conflict(
    cmd_a: dict, cmd_b: dict, conflict_type: str,
    match_a: re.Match, match_b: re.Match,
) -> Optional[dict]:
    resource_a, replicas_a = match_a.group(1), int(match_a.group(2))
    resource_b, replicas_b = match_b.group(1), int(match_b.group(2))
    if resource_a != resource_b or replicas_a == replicas_b:
        return None
    return _make_conflict(
        cmd_a, cmd_b, conflict_type,
        f"Scale conflict on '{resource_a}': replicas={replicas_a} vs replicas={replicas_b}",
        severity="HIGH",
    )


def _check_operation_conflict(
    cmd_a: dict, cmd_b: dict, conflict_type: str,
    match_a: re.Match, match_b: re.Match,
) -> Optional[dict]:
    action_a, target_a = match_a.group(1), match_a.group(2)
    action_b, target_b = match_b.group(1), match_b.group(2)
    if target_a != target_b or action_a == action_b:
        return None
    inverse = INVERSE_ACTIONS.get(action_a.lower())
    sev = "HIGH" if inverse == action_b.lower() else "MEDIUM"
    return _make_conflict(
        cmd_a, cmd_b, conflict_type,
        f"Operation conflict on '{target_a}': '{action_a}' vs '{action_b}'",
        severity=sev,
    )


def _check_schema_conflict(
    cmd_a: dict, cmd_b: dict, conflict_type: str,
    match_a: re.Match, match_b: re.Match,
) -> Optional[dict]:
    obj_type_a, obj_name_a = match_a.group(1), match_a.group(2)
    obj_type_b, obj_name_b = match_b.group(1), match_b.group(2)
    if obj_type_a != obj_type_b or obj_name_a.upper() != obj_name_b.upper():
        return None
    return _make_conflict(
        cmd_a, cmd_b, conflict_type,
        f"Schema conflict on '{obj_name_a}': DROP and CREATE for same object",
        severity="CRITICAL",
    )


def _make_conflict(
    cmd_a: dict, cmd_b: dict,
    conflict_type: str, description: str, severity: str,
) -> dict:
    return {
        "conflict_type": conflict_type,
        "severity": severity,
        "description": description,
        "runbook_a": {
            "id": cmd_a["runbook_id"],
            "title": cmd_a["runbook_title"],
            "step_number": cmd_a["step_number"],
            "step_title": cmd_a["step_title"],
            "command": cmd_a["command"],
        },
        "runbook_b": {
            "id": cmd_b["runbook_id"],
            "title": cmd_b["runbook_title"],
            "step_number": cmd_b["step_number"],
            "step_title": cmd_b["step_title"],
            "command": cmd_b["command"],
        },
        "recommendation": _recommend(severity),
    }


def _recommend(severity: str) -> str:
    if severity == "CRITICAL":
        return "STOP — do not run both runbooks simultaneously. Resolve conflict before proceeding."
    if severity == "HIGH":
        return "Run runbooks sequentially, not in parallel. Verify desired end state before executing."
    return "Review both commands carefully. Coordinate execution order with your team."
