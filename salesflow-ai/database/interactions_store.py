import time
from database.db import get_conn


def log_interaction(
    lead_id: int,
    role: str,
    content: str,
    intent: str = "",
    platform: str = "",
    message_type: str = "",
) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO interactions
               (lead_id, role, content, intent, platform, message_type, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (lead_id, role, content, intent, platform, message_type, time.time()),
        )
        conn.commit()


def get_recent_interactions(lead_id: int, limit: int = 10) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT role, content, intent, created_at
               FROM interactions WHERE lead_id=?
               ORDER BY created_at DESC LIMIT ?""",
            (lead_id, limit),
        ).fetchall()
        return [dict(r) for r in reversed(rows)]


def count_interactions_by_intent() -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT intent, COUNT(*) as cnt FROM interactions WHERE role='customer' GROUP BY intent"
        ).fetchall()
        return {r["intent"]: r["cnt"] for r in rows}
