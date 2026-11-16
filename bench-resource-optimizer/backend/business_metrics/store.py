"""
Allocation recommendations — one row per staffing suggestion, followed to its outcome.

    created     /map-role recommends a candidate for a role (source "ai"), or a manager
                logs an allocation made without the system (source "manual")
    decided     the manager accepts it as-is, accepts it with changes ("modified"),
                or rejects it
    allocated   accepted or modified → the candidate is allocated (allocated_at)
    outcome     later: did the allocation work? ("success" | "failed")

needs_help is set by the agent itself when it could not stand behind its answer
(no role document retrieved, unsupported claims, blocked output, unfaithful answer).

The table lives in the same database as the FDE ledger (fde.config.get_conn), so a
recommendation's model cost is read from its fde_tasks row by task_id.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from fde import config

TABLE = "allocation_recommendations"

DECISIONS = ("accepted", "modified", "rejected")
OUTCOMES = ("success", "failed")


class NotFound(Exception):
    pass


class InvalidTransition(Exception):
    pass


def _ddl() -> List[str]:
    real = config.REAL_TYPE
    return [
        f"""CREATE TABLE IF NOT EXISTS {TABLE} (
            rec_id          TEXT PRIMARY KEY,
            source          TEXT NOT NULL,
            task_id         TEXT NOT NULL DEFAULT '',
            candidate_id    TEXT NOT NULL,
            target_role     TEXT NOT NULL,
            match_pct       {real},
            needs_help      INTEGER NOT NULL DEFAULT 0,
            help_reasons    TEXT NOT NULL DEFAULT '[]',
            requested_at    {real} NOT NULL,
            created_at      {real} NOT NULL,
            decision        TEXT NOT NULL DEFAULT '',
            decided_by      TEXT NOT NULL DEFAULT '',
            decided_at      {real},
            decision_note   TEXT NOT NULL DEFAULT '',
            allocated_at    {real},
            outcome         TEXT NOT NULL DEFAULT '',
            outcome_at      {real},
            outcome_note    TEXT NOT NULL DEFAULT ''
        )""",
        f"CREATE INDEX IF NOT EXISTS idx_alloc_rec_created ON {TABLE}(created_at)",
    ]


def init_table() -> None:
    conn = config.get_conn()
    try:
        for stmt in _ddl():
            conn.execute(stmt)
        conn.commit()
    finally:
        conn.close()


def help_reasons(result: Dict[str, Any]) -> List[str]:
    """Why the agent itself would want a human to look closer at this role mapping."""
    reasons = []
    evidence = result.get("evidence") or {}
    if evidence.get("blocked"):
        reasons.append("output blocked by the guardrail")
    if evidence.get("quarantined"):
        reasons.append("a retrieved role document was quarantined")
    if evidence.get("checked") == 0 and evidence.get("note"):
        reasons.append("no role document retrieved")
    elif evidence.get("unsupported"):
        reasons.append(f"{len(evidence['unsupported'])} claim(s) not supported by the role documents")
    if result.get("_faithfulness_warning"):
        reasons.append("answer not faithful to the retrieved context")
    return reasons


def create_ai(*, task_id: str, candidate_id: str, target_role: str, match_pct: Optional[float],
              reasons: List[str], requested_at: float) -> str:
    return _insert(source="ai", task_id=task_id, candidate_id=candidate_id, target_role=target_role,
                   match_pct=match_pct, reasons=reasons, requested_at=requested_at)


def create_manual(*, candidate_id: str, target_role: str, started_at: float, allocated_at: float,
                  by: str, note: str = "") -> str:
    """An allocation a manager made without the system, timed from start to allocation."""
    if allocated_at < started_at:
        raise InvalidTransition("allocated_at is before started_at")
    rec_id = _insert(source="manual", task_id="", candidate_id=candidate_id, target_role=target_role,
                     match_pct=None, reasons=[], requested_at=started_at)
    _update(rec_id, "decision=?, decided_by=?, decided_at=?, decision_note=?, allocated_at=?",
            ("accepted", by, allocated_at, note, allocated_at))
    return rec_id


def _insert(*, source: str, task_id: str, candidate_id: str, target_role: str,
            match_pct: Optional[float], reasons: List[str], requested_at: float) -> str:
    rec_id = uuid.uuid4().hex
    init_table()
    conn = config.get_conn()
    try:
        conn.execute(
            f"INSERT INTO {TABLE} (rec_id, source, task_id, candidate_id, target_role, match_pct, "
            f"needs_help, help_reasons, requested_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (rec_id, source, task_id, candidate_id, target_role, match_pct, int(bool(reasons)),
             json.dumps(reasons), requested_at, time.time()))
        conn.commit()
    finally:
        conn.close()
    return rec_id


def _update(rec_id: str, sets: str, params: tuple) -> None:
    conn = config.get_conn()
    try:
        conn.execute(f"UPDATE {TABLE} SET {sets} WHERE rec_id=?", (*params, rec_id))
        conn.commit()
    finally:
        conn.close()


def decide(rec_id: str, decision: str, *, by: str, note: str = "",
           at: Optional[float] = None) -> Dict[str, Any]:
    if decision not in DECISIONS:
        raise InvalidTransition(f"decision must be one of {DECISIONS}")
    rec = get(rec_id)
    if rec["source"] != "ai":
        raise InvalidTransition("only AI recommendations take a decision")
    if rec["decision"]:
        raise InvalidTransition(f"already {rec['decision']}")
    at = at or time.time()
    allocated_at = at if decision != "rejected" else None
    _update(rec_id, "decision=?, decided_by=?, decided_at=?, decision_note=?, allocated_at=?",
            (decision, by, at, note, allocated_at))
    return get(rec_id)


def record_outcome(rec_id: str, outcome: str, *, note: str = "",
                   at: Optional[float] = None) -> Dict[str, Any]:
    if outcome not in OUTCOMES:
        raise InvalidTransition(f"outcome must be one of {OUTCOMES}")
    rec = get(rec_id)
    if rec["allocated_at"] is None:
        raise InvalidTransition("no allocation was made for this recommendation")
    _update(rec_id, "outcome=?, outcome_at=?, outcome_note=?", (outcome, at or time.time(), note))
    return get(rec_id)


_COLUMNS = ("rec_id", "source", "task_id", "candidate_id", "target_role", "match_pct", "needs_help",
            "help_reasons", "requested_at", "created_at", "decision", "decided_by", "decided_at",
            "decision_note", "allocated_at", "outcome", "outcome_at", "outcome_note")


def _row(r) -> Dict[str, Any]:
    d = dict(zip(_COLUMNS, tuple(r)))
    d["needs_help"] = bool(d["needs_help"])
    d["help_reasons"] = json.loads(d["help_reasons"] or "[]")
    return d


def get(rec_id: str) -> Dict[str, Any]:
    init_table()
    conn = config.get_conn()
    try:
        r = conn.execute(f"SELECT {', '.join(_COLUMNS)} FROM {TABLE} WHERE rec_id=?",
                         (rec_id,)).fetchone()
    finally:
        conn.close()
    if r is None:
        raise NotFound(rec_id)
    return _row(r)


def fetch(since: float) -> List[Dict[str, Any]]:
    """Recommendations created since a timestamp, newest first, with the model cost of each."""
    init_table()
    conn = config.get_conn()
    try:
        has_ledger = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='fde_tasks'").fetchone()
        rows = conn.execute(
            f"SELECT {', '.join(_COLUMNS)} FROM {TABLE} WHERE created_at >= ? ORDER BY created_at DESC",
            (since,)).fetchall()
        costs: Dict[str, float] = {}
        if has_ledger:
            for task_id, cost in conn.execute(
                    f"SELECT t.task_id, t.cost_usd + t.review_cost_usd FROM fde_tasks t "
                    f"JOIN {TABLE} r ON r.task_id = t.task_id WHERE r.created_at >= ?", (since,)):
                costs[task_id] = float(cost or 0)
    finally:
        conn.close()
    out = []
    for r in rows:
        d = _row(r)
        d["model_cost_usd"] = costs.get(d["task_id"], 0.0)
        out.append(d)
    return out
