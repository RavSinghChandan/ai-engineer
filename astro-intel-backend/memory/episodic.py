"""
Episodic Memory — Chandan's correction store.

Every time an insight is edited before approval, we log:
  (insight_id, original_text, corrected_text, query_type, intent, domains, reason_tag, ts)

At pipeline time, the top-K most similar past corrections are retrieved
and injected into the LangGraph state as `chandan_preferences` so every
agent knows Chandan's known biases, tone, and structural preferences.

Similarity is cosine distance on a tiny TF-IDF-style keyword overlap
(no external vector DB needed — keeps this self-contained).
"""
from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from typing import Any, Dict, List, Optional

import database as _db

# ── DDL (called from database.init_db via migration hook) ────────────────────

_DDL_SQLITE = """
CREATE TABLE IF NOT EXISTS episodic_corrections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_id      TEXT    NOT NULL,
    query_type      TEXT    NOT NULL DEFAULT 'general',
    intent          TEXT    NOT NULL DEFAULT 'general',
    domains         TEXT    NOT NULL DEFAULT '[]',
    original_text   TEXT    NOT NULL,
    corrected_text  TEXT    NOT NULL,
    reason_tag      TEXT    NOT NULL DEFAULT '',
    similarity_key  TEXT    NOT NULL DEFAULT '',
    created_at      REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ec_intent    ON episodic_corrections(intent);
CREATE INDEX IF NOT EXISTS idx_ec_created   ON episodic_corrections(created_at DESC);
"""

_DDL_PG = """
CREATE TABLE IF NOT EXISTS episodic_corrections (
    id              SERIAL  PRIMARY KEY,
    insight_id      TEXT    NOT NULL,
    query_type      TEXT    NOT NULL DEFAULT 'general',
    intent          TEXT    NOT NULL DEFAULT 'general',
    domains         TEXT    NOT NULL DEFAULT '[]',
    original_text   TEXT    NOT NULL,
    corrected_text  TEXT    NOT NULL,
    reason_tag      TEXT    NOT NULL DEFAULT '',
    similarity_key  TEXT    NOT NULL DEFAULT '',
    created_at      DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ec_intent    ON episodic_corrections(intent);
CREATE INDEX IF NOT EXISTS idx_ec_created   ON episodic_corrections(created_at DESC);
"""

_DDL_PERSONA_SQLITE = """
CREATE TABLE IF NOT EXISTS persona_preferences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pref_key    TEXT    NOT NULL UNIQUE,
    pref_value  TEXT    NOT NULL,
    updated_at  REAL    NOT NULL
);
"""

_DDL_PERSONA_PG = """
CREATE TABLE IF NOT EXISTS persona_preferences (
    id          SERIAL  PRIMARY KEY,
    pref_key    TEXT    NOT NULL UNIQUE,
    pref_value  TEXT    NOT NULL,
    updated_at  DOUBLE PRECISION NOT NULL
);
"""


def init_episodic_tables() -> None:
    """Idempotent — safe to call every startup."""
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute(_DDL_PG)
            cur.execute(_DDL_PERSONA_PG)
        else:
            conn.executescript(_DDL_SQLITE + _DDL_PERSONA_SQLITE)


# ── Tokeniser (no external deps) ─────────────────────────────────────────────

_STOP = {
    "the","a","an","is","are","was","were","will","in","on","at","to","for",
    "of","and","or","but","with","your","this","that","you","i","it","be",
    "have","has","had","do","does","not","from","by","as","can","may","would",
}

def _tokenise(text: str) -> List[str]:
    tokens = re.findall(r"[a-z]+", text.lower())
    return [t for t in tokens if t not in _STOP and len(t) > 2]


def _cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    dot = sum(a[k] * b.get(k, 0) for k in a)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0


def _similarity_key(text: str) -> str:
    """Bag-of-words fingerprint stored alongside each row for fast re-scoring."""
    c = Counter(_tokenise(text))
    return " ".join(f"{k}:{v}" for k, v in sorted(c.items()))


def _parse_key(key: str) -> Counter:
    c: Counter = Counter()
    for pair in key.split():
        parts = pair.split(":")
        if len(parts) == 2:
            c[parts[0]] = int(parts[1])
    return c


# ── Write ─────────────────────────────────────────────────────────────────────

def log_correction(
    *,
    insight_id:     str,
    original_text:  str,
    corrected_text: str,
    intent:         str  = "general",
    query_type:     str  = "general",
    domains:        List[str] = None,
    reason_tag:     str  = "",
) -> int:
    """
    Persist one correction.  Returns the new row id.
    Called from the /approve endpoint whenever edited_insights are provided.
    """
    domains = domains or []
    sim_key = _similarity_key(original_text)
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO episodic_corrections
                  (insight_id, query_type, intent, domains,
                   original_text, corrected_text, reason_tag, similarity_key, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
                """,
                (insight_id, query_type, intent, json.dumps(domains),
                 original_text, corrected_text, reason_tag, sim_key, time.time()),
            )
            row = cur.fetchone()
            return row[0]
        else:
            cur = conn.execute(
                """
                INSERT INTO episodic_corrections
                  (insight_id, query_type, intent, domains,
                   original_text, corrected_text, reason_tag, similarity_key, created_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (insight_id, query_type, intent, json.dumps(domains),
                 original_text, corrected_text, reason_tag, sim_key, time.time()),
            )
            return cur.lastrowid


# ── Read ──────────────────────────────────────────────────────────────────────

def retrieve_similar_corrections(
    query: str,
    intent: str = "general",
    top_k: int = 5,
    min_score: float = 0.12,
) -> List[Dict[str, Any]]:
    """
    Return up to top_k past corrections whose original_text is semantically
    similar to `query`.  Filtered first by intent, then ranked by cosine score.
    Used by the persona injector at pipeline start.
    """
    q_vec = Counter(_tokenise(query))
    if not q_vec:
        return []

    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, insight_id, original_text, corrected_text, reason_tag, "
                "similarity_key, intent, domains FROM episodic_corrections "
                "WHERE intent=%s OR intent='general' ORDER BY created_at DESC LIMIT 200",
                (intent,),
            )
            rows = cur.fetchall()
        else:
            rows = conn.execute(
                "SELECT id, insight_id, original_text, corrected_text, reason_tag, "
                "similarity_key, intent, domains FROM episodic_corrections "
                "WHERE intent=? OR intent='general' ORDER BY created_at DESC LIMIT 200",
                (intent,),
            ).fetchall()

    scored = []
    for row in rows:
        sim_key = row[5] if _db._USE_PG else row["similarity_key"]
        r_vec   = _parse_key(sim_key)
        score   = _cosine(q_vec, r_vec)
        if score >= min_score:
            scored.append((score, row))

    scored.sort(key=lambda x: x[0], reverse=True)

    result = []
    for score, row in scored[:top_k]:
        if _db._USE_PG:
            result.append({
                "score":          round(score, 3),
                "insight_id":     row[1],
                "original":       row[2],
                "corrected":      row[3],
                "reason_tag":     row[4],
                "intent":         row[6],
                "domains":        json.loads(row[7] or "[]"),
            })
        else:
            result.append({
                "score":          round(score, 3),
                "insight_id":     row["insight_id"],
                "original":       row["original_text"],
                "corrected":      row["corrected_text"],
                "reason_tag":     row["reason_tag"],
                "intent":         row["intent"],
                "domains":        json.loads(row["domains"] or "[]"),
            })
    return result


def list_corrections(limit: int = 50, intent: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return recent corrections for the admin dashboard."""
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            if intent:
                cur.execute(
                    "SELECT id, insight_id, intent, original_text, corrected_text, "
                    "reason_tag, domains, created_at FROM episodic_corrections "
                    "WHERE intent=%s ORDER BY created_at DESC LIMIT %s",
                    (intent, limit),
                )
            else:
                cur.execute(
                    "SELECT id, insight_id, intent, original_text, corrected_text, "
                    "reason_tag, domains, created_at FROM episodic_corrections "
                    "ORDER BY created_at DESC LIMIT %s", (limit,),
                )
            rows = cur.fetchall()
            return [
                {
                    "id": r[0], "insight_id": r[1], "intent": r[2],
                    "original": r[3], "corrected": r[4], "reason_tag": r[5],
                    "domains": json.loads(r[6] or "[]"), "created_at": r[7],
                }
                for r in rows
            ]
        else:
            if intent:
                rows = conn.execute(
                    "SELECT id, insight_id, intent, original_text, corrected_text, "
                    "reason_tag, domains, created_at FROM episodic_corrections "
                    "WHERE intent=? ORDER BY created_at DESC LIMIT ?",
                    (intent, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, insight_id, intent, original_text, corrected_text, "
                    "reason_tag, domains, created_at FROM episodic_corrections "
                    "ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [
                {
                    "id": r["id"], "insight_id": r["insight_id"], "intent": r["intent"],
                    "original": r["original_text"], "corrected": r["corrected_text"],
                    "reason_tag": r["reason_tag"],
                    "domains": json.loads(r["domains"] or "[]"), "created_at": r["created_at"],
                }
                for r in rows
            ]


def correction_stats() -> Dict[str, Any]:
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM episodic_corrections")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT intent, COUNT(*) as cnt FROM episodic_corrections "
                "GROUP BY intent ORDER BY cnt DESC"
            )
            by_intent = {r[0]: r[1] for r in cur.fetchall()}
        else:
            total = conn.execute("SELECT COUNT(*) FROM episodic_corrections").fetchone()[0]
            by_intent = {
                r["intent"]: r["cnt"]
                for r in conn.execute(
                    "SELECT intent, COUNT(*) as cnt FROM episodic_corrections "
                    "GROUP BY intent ORDER BY cnt DESC"
                ).fetchall()
            }
    return {"total_corrections": total, "by_intent": by_intent}


# ── Persona preferences (key-value store for Chandan's static prefs) ─────────

def set_persona_pref(key: str, value: str) -> None:
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO persona_preferences (pref_key, pref_value, updated_at) "
                "VALUES (%s,%s,%s) ON CONFLICT(pref_key) DO UPDATE SET "
                "pref_value=EXCLUDED.pref_value, updated_at=EXCLUDED.updated_at",
                (key, value, time.time()),
            )
        else:
            conn.execute(
                "INSERT INTO persona_preferences (pref_key, pref_value, updated_at) "
                "VALUES (?,?,?) ON CONFLICT(pref_key) DO UPDATE SET "
                "pref_value=excluded.pref_value, updated_at=excluded.updated_at",
                (key, value, time.time()),
            )


def get_persona_prefs() -> Dict[str, str]:
    with _db._tx() as conn:
        if _db._USE_PG:
            cur = conn.cursor()
            cur.execute("SELECT pref_key, pref_value FROM persona_preferences")
            rows = cur.fetchall()
            return {r[0]: r[1] for r in rows}
        else:
            rows = conn.execute(
                "SELECT pref_key, pref_value FROM persona_preferences"
            ).fetchall()
            return {r["pref_key"]: r["pref_value"] for r in rows}
