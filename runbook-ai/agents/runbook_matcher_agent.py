"""
RAGless runbook matcher.
Uses structured SQL queries (category, severity, keyword search in title/description)
to find matching runbooks. No vector similarity — deterministic, explainable.
"""
import json
from typing import List
from database.db import get_conn


def match_runbooks(
    category: str,
    severity: str,
    search_terms: List[str],
    limit: int = 5,
) -> List[dict]:
    """
    Find matching runbooks using SQL full-text search on title, description, tags.
    Strategy:
      1. Exact category + severity match (highest confidence)
      2. Category match only (medium confidence)
      3. Keyword match in title/description (lower confidence)
    Returns ranked list with confidence scores.
    """
    results = []
    seen_ids = set()

    with get_conn() as conn:
        # Strategy 1: exact category + severity
        rows = conn.execute(
            """SELECT id, title, description, category, severity, tags
               FROM runbooks
               WHERE status='active' AND category=? AND severity=?
               ORDER BY created_at DESC LIMIT ?""",
            (category, severity, limit),
        ).fetchall()
        for row in rows:
            rb = dict(row)
            rb["tags"] = json.loads(rb["tags"])
            rb["match_reason"] = f"Exact match: category={category}, severity={severity}"
            rb["confidence"] = "HIGH"
            rb["step_count"] = _get_step_count(conn, rb["id"])
            results.append(rb)
            seen_ids.add(rb["id"])

        # Strategy 2: category match only
        rows = conn.execute(
            """SELECT id, title, description, category, severity, tags
               FROM runbooks
               WHERE status='active' AND category=? AND id NOT IN ({})
               ORDER BY created_at DESC LIMIT ?""".format(
                ",".join("?" * len(seen_ids)) if seen_ids else "0"
            ),
            (category, *seen_ids, limit),
        ).fetchall()
        for row in rows:
            rb = dict(row)
            rb["tags"] = json.loads(rb["tags"])
            rb["match_reason"] = f"Category match: {category}"
            rb["confidence"] = "MEDIUM"
            rb["step_count"] = _get_step_count(conn, rb["id"])
            results.append(rb)
            seen_ids.add(rb["id"])

        # Strategy 3: keyword match in title or description
        for term in search_terms[:3]:
            if len(results) >= limit:
                break
            rows = conn.execute(
                """SELECT id, title, description, category, severity, tags
                   FROM runbooks
                   WHERE status='active'
                     AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
                     AND id NOT IN ({})
                   ORDER BY created_at DESC LIMIT ?""".format(
                    ",".join("?" * len(seen_ids)) if seen_ids else "0"
                ),
                (f"%{term.lower()}%", f"%{term.lower()}%", *seen_ids, limit),
            ).fetchall()
            for row in rows:
                rb = dict(row)
                rb["tags"] = json.loads(rb["tags"])
                rb["match_reason"] = f"Keyword match: '{term}' in title/description"
                rb["confidence"] = "LOW"
                rb["step_count"] = _get_step_count(conn, rb["id"])
                results.append(rb)
                seen_ids.add(rb["id"])

    return results[:limit]


def _get_step_count(conn, runbook_id: int) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM steps WHERE runbook_id=? AND is_rollback=0",
        (runbook_id,),
    ).fetchone()[0]
