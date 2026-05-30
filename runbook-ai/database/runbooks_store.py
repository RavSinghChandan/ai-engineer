import json
import time
from typing import Optional
from database.db import get_conn
from graph.state import ExtractionState


def save_runbook(state: ExtractionState, filename: str, total_pages: int,
                 tenant_id: Optional[int] = None) -> int:
    """Persist a fully extracted runbook and its steps. Returns runbook_id."""
    now = time.time()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO runbooks
               (filename, title, description, category, severity, tags,
                prerequisites, estimated_duration_minutes, total_pages,
                status, tenant_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)""",
            (
                filename,
                state.get("title", filename),
                state.get("description", ""),
                state.get("category", "other"),
                state.get("severity", "P3"),
                json.dumps(state.get("tags", [])),
                json.dumps(state.get("prerequisites", [])),
                state.get("estimated_duration_minutes", 15),
                total_pages,
                tenant_id,
                now, now,
            ),
        )
        runbook_id = cur.lastrowid

        # Save steps
        for step in state.get("steps", []):
            conn.execute(
                """INSERT INTO steps
                   (runbook_id, step_number, title, description, commands,
                    expected_output, depends_on, is_optional, timeout_seconds, is_rollback)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    runbook_id,
                    step["step_number"],
                    step.get("title", ""),
                    step.get("description", ""),
                    json.dumps(step.get("commands", [])),
                    step.get("expected_output", ""),
                    json.dumps(step.get("depends_on", [])),
                    1 if step.get("is_optional") else 0,
                    step.get("timeout_seconds", 60),
                ),
            )

        # Save rollback steps
        for step in state.get("rollback_steps", []):
            conn.execute(
                """INSERT INTO steps
                   (runbook_id, step_number, title, description, commands,
                    expected_output, depends_on, is_optional, timeout_seconds, is_rollback)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (
                    runbook_id,
                    step.get("step_number", 0),
                    step.get("title", ""),
                    step.get("description", ""),
                    json.dumps(step.get("commands", [])),
                    step.get("expected_output", ""),
                    json.dumps(step.get("depends_on", [])),
                    1 if step.get("is_optional") else 0,
                    step.get("timeout_seconds", 30),
                ),
            )

        conn.commit()
    return runbook_id


def get_runbook(runbook_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM runbooks WHERE id=?", (runbook_id,)
        ).fetchone()
        if not row:
            return None
        rb = dict(row)
        rb["tags"] = json.loads(rb["tags"])
        rb["prerequisites"] = json.loads(rb["prerequisites"])
        rb["steps"] = _get_steps(conn, runbook_id, is_rollback=False)
        rb["rollback_steps"] = _get_steps(conn, runbook_id, is_rollback=True)
        return rb


def count_runbooks(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    tenant_id: Optional[int] = None,
) -> int:
    query = "SELECT COUNT(*) FROM runbooks WHERE status='active'"
    params: list = []
    if tenant_id is not None:
        query += " AND tenant_id=?"
        params.append(tenant_id)
    if category:
        query += " AND category=?"
        params.append(category)
    if severity:
        query += " AND severity=?"
        params.append(severity)
    with get_conn() as conn:
        return conn.execute(query, params).fetchone()[0]


def list_runbooks(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    tenant_id: Optional[int] = None,
) -> list[dict]:
    query = "SELECT * FROM runbooks WHERE status='active'"
    params: list = []
    if tenant_id is not None:
        query += " AND tenant_id=?"
        params.append(tenant_id)
    if category:
        query += " AND category=?"
        params.append(category)
    if severity:
        query += " AND severity=?"
        params.append(severity)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params += [limit, offset]

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        result = []
        for row in rows:
            rb = dict(row)
            rb["tags"] = json.loads(rb["tags"])
            rb["prerequisites"] = json.loads(rb["prerequisites"])
            rb["step_count"] = conn.execute(
                "SELECT COUNT(*) FROM steps WHERE runbook_id=? AND is_rollback=0",
                (rb["id"],)
            ).fetchone()[0]
            result.append(rb)
        return result


def _get_steps(conn, runbook_id: int, is_rollback: bool) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM steps WHERE runbook_id=? AND is_rollback=? ORDER BY step_number",
        (runbook_id, 1 if is_rollback else 0),
    ).fetchall()
    steps = []
    for row in rows:
        s = dict(row)
        s["commands"] = json.loads(s["commands"])
        s["depends_on"] = json.loads(s["depends_on"])
        s["is_optional"] = bool(s["is_optional"])
        s["is_rollback"] = bool(s["is_rollback"])
        steps.append(s)
    return steps


def create_ingest_job(filename: str, tenant_id: Optional[int] = None) -> int:
    now = time.time()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO ingest_jobs (filename, status, tenant_id, created_at, updated_at) VALUES (?, 'pending', ?, ?, ?)",
            (filename, tenant_id, now, now),
        )
        conn.commit()
        return cur.lastrowid


def update_ingest_job(job_id: int, status: str, runbook_id: int = None,
                      error: str = "", agent_log: list = None) -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE ingest_jobs
               SET status=?, runbook_id=?, error=?, agent_log=?, updated_at=?
               WHERE id=?""",
            (status, runbook_id, error, json.dumps(agent_log or []), time.time(), job_id),
        )
        conn.commit()


def get_ingest_job(job_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ingest_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            return None
        j = dict(row)
        j["agent_log"] = json.loads(j["agent_log"])
        return j
