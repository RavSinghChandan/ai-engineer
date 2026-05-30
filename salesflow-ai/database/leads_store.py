import time
from typing import Optional
from database.db import get_conn


def get_lead_by_sender(sender_id: str, platform: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM leads WHERE sender_id=? AND platform=?",
            (sender_id, platform),
        ).fetchone()
        return dict(row) if row else None


def create_lead(sender_id: str, platform: str, sender_name: str = "") -> dict:
    now = time.time()
    with get_conn() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO leads
               (sender_id, platform, sender_name, funnel_stage, created_at, updated_at)
               VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)""",
            (sender_id, platform, sender_name, now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM leads WHERE sender_id=? AND platform=?",
            (sender_id, platform),
        ).fetchone()
        return dict(row)


def update_lead_stage(lead_id: int, stage: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE leads SET funnel_stage=?, updated_at=? WHERE id=?",
            (stage, time.time(), lead_id),
        )
        conn.commit()


def list_leads(limit: int = 100, offset: int = 0) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM leads ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]


def count_leads_by_stage() -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT funnel_stage, COUNT(*) as cnt FROM leads GROUP BY funnel_stage"
        ).fetchall()
        return {r["funnel_stage"]: r["cnt"] for r in rows}
