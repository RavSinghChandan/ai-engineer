"""
RAGless runbook matcher.
Uses structured SQL queries (category, severity, keyword search in title/description)
to find matching runbooks. No vector similarity — deterministic, explainable.
"""
import json
import logging
from typing import List
from database.db import get_conn

logger = logging.getLogger(__name__)


def _safe_tags(raw) -> list:
    # BUG FIX: raw json.loads() crashed with ValueError on corrupt/null tags from DB;
    # use defensive parse matching the pattern in runbooks_store._safe_json
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Corrupt tags in runbook row, defaulting to []. Value: %.60r", raw)
        return []


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
            rb["tags"] = _safe_tags(rb.get("tags"))
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
            rb["tags"] = _safe_tags(rb.get("tags"))
            rb["match_reason"] = f"Category match: {category}"
            rb["confidence"] = "MEDIUM"
            rb["step_count"] = _get_step_count(conn, rb["id"])
            results.append(rb)
            seen_ids.add(rb["id"])

        # Strategy 3: keyword match in title or description
        for term in search_terms[:3]:
            if len(results) >= limit:
                break
            # BUG FIX: LLM-generated terms can contain SQLite LIKE wildcards (% and _).
            # Without escaping, a term like "100%" matches every row; "_" matches any char.
            safe_term = term.lower().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
            rows = conn.execute(
                """SELECT id, title, description, category, severity, tags
                   FROM runbooks
                   WHERE status='active'
                     AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')
                     AND id NOT IN ({})
                   ORDER BY created_at DESC LIMIT ?""".format(
                    ",".join("?" * len(seen_ids)) if seen_ids else "0"
                ),
                (f"%{safe_term}%", f"%{safe_term}%", *seen_ids, limit),
            ).fetchall()
            for row in rows:
                rb = dict(row)
                rb["tags"] = _safe_tags(rb.get("tags"))
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
