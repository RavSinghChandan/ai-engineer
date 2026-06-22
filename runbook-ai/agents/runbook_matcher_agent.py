"""
RAGless runbook matcher.
Uses structured SQL queries (category, severity, keyword search in title/description)
to find matching runbooks. No vector similarity — deterministic, explainable.
"""
import json
import logging
from typing import List, Optional
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
    tenant_id: Optional[int] = 1,
) -> List[dict]:
    """
    Find matching runbooks using SQL full-text search on title, description, tags.
    Strategy (all three run and merged, keyword hits promoted first):
      1. Keyword title match (always runs, across all severities — catches cross-severity hits)
      2. Exact category + severity match (high confidence)
      3. Category-only match (fills remaining slots)

    Scoped to the given tenant_id (defaults to 1 for unauthenticated callers).
    Official runbooks are always included regardless of tenant.
    """
    seen_ids: set = set()
    keyword_hits: list = []
    severity_hits: list = []
    category_hits: list = []

    # Tenant filter: include tenant's own runbooks, unassigned (NULL), OR official docs
    tenant_clause = "(tenant_id=? OR tenant_id IS NULL OR source_type='official')"

    with get_conn() as conn:
        # ── Strategy 1: keyword match on title (always runs, cross-severity) ──────
        # Each search term is split into individual words so "RBAC 403 forbidden"
        # can still match "Kubernetes RBAC Permission Denied Runbook" via the word "RBAC".
        for term in search_terms[:5]:
            words = [w.strip(".,;:!?") for w in term.split() if len(w) > 2]
            for word in words[:3]:
                # BUG FIX: LLM-generated terms can contain SQLite LIKE wildcards (% and _).
                safe_word = word.lower().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
                rows = conn.execute(
                    """SELECT id, title, description, category, severity, tags
                       FROM runbooks
                       WHERE status='active'
                         AND category=?
                         AND {tenant}
                         AND LOWER(title) LIKE ? ESCAPE '\\'
                         AND id NOT IN ({seen})
                       ORDER BY severity ASC, id ASC LIMIT ?""".format(
                        tenant=tenant_clause,
                        seen=",".join("?" * len(seen_ids)) if seen_ids else "0"
                    ),
                    (category, tenant_id, f"%{safe_word}%", *seen_ids, limit),
                ).fetchall()
                for row in rows:
                    rb = dict(row)
                    rb["tags"] = _safe_tags(rb.get("tags"))
                    rb["match_reason"] = f"Title match: '{word}' from '{term}'"
                    rb["confidence"] = "HIGH"
                    rb["step_count"] = _get_step_count(conn, rb["id"])
                    keyword_hits.append(rb)
                    seen_ids.add(rb["id"])

        # ── Strategy 2: exact category + severity ────────────────────────────────
        rows = conn.execute(
            """SELECT id, title, description, category, severity, tags
               FROM runbooks
               WHERE status='active'
                 AND category=? AND severity=?
                 AND {tenant}
                 AND id NOT IN ({seen})
               ORDER BY created_at DESC LIMIT ?""".format(
                tenant=tenant_clause,
                seen=",".join("?" * len(seen_ids)) if seen_ids else "0"
            ),
            (category, severity, tenant_id, *seen_ids, limit),
        ).fetchall()
        for row in rows:
            rb = dict(row)
            rb["tags"] = _safe_tags(rb.get("tags"))
            rb["match_reason"] = f"Exact match: category={category}, severity={severity}"
            rb["confidence"] = "HIGH"
            rb["step_count"] = _get_step_count(conn, rb["id"])
            severity_hits.append(rb)
            seen_ids.add(rb["id"])

        # ── Strategy 3: category-only (fills remaining slots) ───────────────────
        remaining = limit - len(keyword_hits) - len(severity_hits)
        if remaining > 0:
            rows = conn.execute(
                """SELECT id, title, description, category, severity, tags
                   FROM runbooks
                   WHERE status='active'
                     AND category=?
                     AND {tenant}
                     AND id NOT IN ({seen})
                   ORDER BY created_at DESC LIMIT ?""".format(
                    tenant=tenant_clause,
                    seen=",".join("?" * len(seen_ids)) if seen_ids else "0"
                ),
                (category, tenant_id, *seen_ids, remaining),
            ).fetchall()
            for row in rows:
                rb = dict(row)
                rb["tags"] = _safe_tags(rb.get("tags"))
                rb["match_reason"] = f"Category match: {category}"
                rb["confidence"] = "MEDIUM"
                rb["step_count"] = _get_step_count(conn, rb["id"])
                category_hits.append(rb)
                seen_ids.add(rb["id"])

    # Keyword hits first (most relevant), then exact severity, then category fallback
    return (keyword_hits + severity_hits + category_hits)[:limit]


def _get_step_count(conn, runbook_id: int) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM steps WHERE runbook_id=? AND is_rollback=0",
        (runbook_id,),
    ).fetchone()[0]
