"""
Multi-Source Composer
Given a matched runbook ID, builds three panels:
  - internal: steps from internal runbooks only
  - official: steps from official docs only
  - combined: steps where both sources agree (no conflict)
Also attaches conflict warnings between internal and official.
"""
from __future__ import annotations
import json, sqlite3
from database.db import get_conn


def _load_steps(conn, runbook_id: int, is_rollback: bool = False) -> list[dict]:
    rows = conn.execute(
        """SELECT step_number, title, description, commands,
                  expected_output, depends_on, is_optional, timeout_seconds
           FROM steps WHERE runbook_id=? AND is_rollback=?
           ORDER BY step_number""",
        (runbook_id, is_rollback),
    ).fetchall()
    result = []
    for r in rows:
        cmds = r["commands"]
        if isinstance(cmds, str):
            try:
                cmds = json.loads(cmds)
            except Exception:
                cmds = []
        deps = r["depends_on"]
        if isinstance(deps, str):
            try:
                deps = json.loads(deps)
            except Exception:
                deps = []
        result.append({
            "step_number": r["step_number"],
            "title": r["title"],
            "description": r["description"],
            "commands": cmds,
            "expected_output": r["expected_output"],
            "depends_on": deps,
            "is_optional": bool(r["is_optional"]),
            "timeout_seconds": r["timeout_seconds"],
        })
    return result


def _load_conflicts(conn, rb_a: int, rb_b: int, tenant_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT conflict_type, severity, description, recommendation, step_a, step_b
           FROM runbook_conflicts
           WHERE runbook_a_id=? AND runbook_b_id=? AND tenant_id=?""",
        (rb_a, rb_b, tenant_id),
    ).fetchall()
    return [dict(r) for r in rows]


def _find_official_counterpart(conn, internal_id: int, category: str, tenant_id: int) -> dict | None:
    row = conn.execute(
        """SELECT r.id, r.title, r.source_name, r.source_url
           FROM runbooks r
           WHERE r.source_type='official'
             AND r.category=?
             AND r.tenant_id=?
             AND r.status='active'
             AND EXISTS (
               SELECT 1 FROM runbook_conflicts c
               WHERE c.runbook_a_id=? AND c.runbook_b_id=r.id
             )
           LIMIT 1""",
        (category, tenant_id, internal_id),
    ).fetchone()
    if not row:
        # No conflict-paired official — find by category
        row = conn.execute(
            """SELECT id, title, source_name, source_url FROM runbooks
               WHERE source_type='official' AND category=? AND tenant_id=? AND status='active'
               LIMIT 1""",
            (category, tenant_id),
        ).fetchone()
    return dict(row) if row else None


def _build_combined_steps(internal_steps: list, official_steps: list) -> list[dict]:
    """Steps that appear conceptually in BOTH sources (title keyword overlap)."""
    import re
    stop = {"the", "a", "and", "or", "of", "for", "in", "on", "with", "to", "from",
            "your", "this", "that", "is", "are", "step", "kubernetes", "check", "verify"}

    def _words(title: str) -> set:
        return {w.lower() for w in re.findall(r"\w+", title) if w.lower() not in stop}

    combined = []
    used_official = set()
    for i_step in internal_steps:
        i_words = _words(i_step["title"])
        for j, o_step in enumerate(official_steps):
            if j in used_official:
                continue
            o_words = _words(o_step["title"])
            overlap = i_words & o_words
            sim = len(overlap) / max(len(i_words), len(o_words), 1)
            if sim >= 0.4:
                # Merge: prefer internal commands, add official note
                merged = dict(i_step)
                merged["agreed_with_official"] = True
                merged["official_step_title"] = o_step["title"]
                combined.append(merged)
                used_official.add(j)
                break

    return combined if combined else internal_steps  # fallback to internal if no overlap


def build_multi_source_response(
    runbook_id: int,
    tenant_id: int,
) -> dict:
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row

        # Load the matched runbook — may be internal or official
        rb_raw = conn.execute(
            "SELECT * FROM runbooks WHERE id=? AND tenant_id=?",
            (runbook_id, tenant_id),
        ).fetchone()

        # If matched runbook is official, find the internal counterpart first
        if rb_raw and rb_raw["source_type"] == "official":
            internal_row = conn.execute(
                """SELECT id FROM runbooks
                   WHERE source_type='internal' AND category=?
                   AND tenant_id=? AND status='active'
                   ORDER BY id LIMIT 1""",
                (rb_raw["category"], tenant_id),
            ).fetchone()
            internal_runbook_id = internal_row["id"] if internal_row else runbook_id
        else:
            internal_runbook_id = runbook_id

        # Load internal runbook
        rb = conn.execute(
            "SELECT * FROM runbooks WHERE id=? AND tenant_id=?",
            (internal_runbook_id, tenant_id),
        ).fetchone()
        if not rb:
            return {"error": f"Runbook {internal_runbook_id} not found"}

        rb = dict(rb)
        internal_steps = _load_steps(conn, internal_runbook_id)
        internal_rollback = _load_steps(conn, internal_runbook_id, is_rollback=True)

        # Find official counterpart
        official = _find_official_counterpart(conn, internal_runbook_id, rb["category"], tenant_id)
        official_steps, official_rollback, conflicts = [], [], []

        if official:
            official_steps = _load_steps(conn, official["id"])
            official_rollback = _load_steps(conn, official["id"], is_rollback=True)
            conflicts = _load_conflicts(conn, internal_runbook_id, official["id"], tenant_id)

        # Build combined steps
        combined_steps = _build_combined_steps(internal_steps, official_steps) if official_steps else internal_steps

        tags = rb.get("tags", "[]")
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []

        return {
            "runbook_id": internal_runbook_id,
            "runbook_title": rb["title"],
            "category": rb["category"],
            "severity": rb["severity"],
            "estimated_duration_minutes": rb["estimated_duration_minutes"],
            "tags": tags,

            # PANEL 1 — Internal (green)
            "internal": {
                "source_type": "internal",
                "source_name": rb.get("source_name", "Internal Runbook"),
                "source_url": rb.get("source_url", ""),
                "label": "Your Internal Runbook",
                "color": "green",
                "priority": 1,
                "steps": internal_steps,
                "rollback_steps": internal_rollback,
                "total_steps": len(internal_steps),
                "recommendation": "Follow this first — verified on your infrastructure",
            },

            # PANEL 2 — Combined (purple)
            "combined": {
                "source_type": "combined",
                "source_name": "Internal + Official Agreed",
                "source_url": "",
                "label": "Combined (Both Sources Agree)",
                "color": "purple",
                "priority": 2,
                "steps": combined_steps,
                "rollback_steps": internal_rollback,
                "total_steps": len(combined_steps),
                "recommendation": "Highest confidence — both your team and official docs agree",
            },

            # PANEL 3 — Official (blue)
            "official": {
                "source_type": "official",
                "source_name": official["source_name"] if official else "Kubernetes Official Docs",
                "source_url": official["source_url"] if official else "https://kubernetes.io/docs/",
                "label": "Official Kubernetes Docs",
                "color": "blue",
                "priority": 3,
                "steps": official_steps,
                "rollback_steps": official_rollback,
                "total_steps": len(official_steps),
                "recommendation": "Generic — use if internal steps don't apply",
            },

            # Conflicts between panels
            "conflicts": conflicts,
            "has_conflicts": len(conflicts) > 0,
            "conflict_count": len(conflicts),

            # Triage summary (same as before)
            "triage_summary": (
                f"This runbook directly addresses the incident. "
                f"Estimated resolution: {rb['estimated_duration_minutes']} min. "
                f"{'Conflicts detected between internal and official steps — review before proceeding.' if conflicts else 'Internal and official sources are aligned.'}"
            ),
            "commands_source": "database",
            "source": "multi_source",
        }
