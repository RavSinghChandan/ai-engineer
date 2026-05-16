"""
Lead capture store — SQLite backend.

Public API is identical to the previous in-memory/JSON version.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import List, Optional

import database as _db

VALID_STATUSES = {"submitted", "admin_notified", "expert_analysis", "report_ready"}


@dataclass
class Lead:
    lead_id:          str
    name:             str
    email:            str
    phone:            str
    dob:              str
    consent:          bool
    status:           str
    created_at:       float
    updated_at:       float
    tenant_id:        str = ""
    notes:            str = ""
    report_json:      str = ""
    place_of_birth:   str = ""
    time_of_birth:    str = ""
    alias_name:       str = ""
    question:         str = ""
    preferred_language: str = "en"


def _row_to_lead(row) -> Lead:
    return Lead(
        lead_id          = row["lead_id"],
        name             = row["name"],
        email            = row["email"],
        phone            = row["phone"],
        dob              = row["dob"],
        consent          = bool(row["consent"]),
        status           = row["status"],
        created_at       = row["created_at"],
        updated_at       = row["updated_at"],
        tenant_id        = row["tenant_id"],
        notes            = row["notes"],
        report_json      = row["report_json"],
        place_of_birth   = row["place_of_birth"],
        time_of_birth    = row["time_of_birth"],
        alias_name       = row["alias_name"],
        question         = row["question"],
        preferred_language = row["preferred_language"],
    )


# ── Bootstrap ─────────────────────────────────────────────────────────────────

def load() -> None:
    """Called once at startup — no-op for SQLite (schema already created in main.py)."""
    pass


# ── Public API ────────────────────────────────────────────────────────────────

def create_lead(name: str, email: str, phone: str, dob: str, consent: bool,
                place_of_birth: str = "", time_of_birth: str = "",
                alias_name: str = "", question: str = "",
                tenant_id: str = "", preferred_language: str = "en") -> Lead:
    lid = f"lead_{secrets.token_hex(6)}"
    now = time.time()
    conn = _db.get_conn()
    try:
        conn.execute(
            """INSERT INTO leads
               (lead_id, name, email, phone, dob, consent, status,
                created_at, updated_at, tenant_id, notes, report_json,
                place_of_birth, time_of_birth, alias_name, question, preferred_language)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (lid, name, email, phone, dob, int(consent), "submitted",
             now, now, tenant_id, "", "",
             place_of_birth, time_of_birth, alias_name, question, preferred_language),
        )
        conn.commit()
    finally:
        conn.close()

    return Lead(lead_id=lid, name=name, email=email, phone=phone, dob=dob,
                consent=consent, status="submitted", created_at=now, updated_at=now,
                tenant_id=tenant_id, place_of_birth=place_of_birth,
                time_of_birth=time_of_birth, alias_name=alias_name, question=question,
                preferred_language=preferred_language)


def get_lead(lead_id: str) -> Optional[Lead]:
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT * FROM leads WHERE lead_id=?", (lead_id,)).fetchone()
        return _row_to_lead(row) if row else None
    finally:
        conn.close()


def list_leads() -> List[Lead]:
    conn = _db.get_conn()
    try:
        rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
        return [_row_to_lead(r) for r in rows]
    finally:
        conn.close()


def list_leads_for_tenant(tenant_id: str) -> List[Lead]:
    conn = _db.get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM leads WHERE tenant_id=? ORDER BY created_at DESC", (tenant_id,)
        ).fetchall()
        return [_row_to_lead(r) for r in rows]
    finally:
        conn.close()


def update_status(lead_id: str, status: str, notes: str = "") -> Optional[Lead]:
    conn = _db.get_conn()
    try:
        now = time.time()
        if notes:
            conn.execute(
                "UPDATE leads SET status=?, updated_at=?, notes=? WHERE lead_id=?",
                (status, now, notes, lead_id),
            )
        else:
            conn.execute(
                "UPDATE leads SET status=?, updated_at=? WHERE lead_id=?",
                (status, now, lead_id),
            )
        conn.commit()
    finally:
        conn.close()
    return get_lead(lead_id)


def attach_report(lead_id: str, report_json: str) -> Optional[Lead]:
    conn = _db.get_conn()
    try:
        conn.execute(
            "UPDATE leads SET report_json=?, status='report_ready', updated_at=? WHERE lead_id=?",
            (report_json, time.time(), lead_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_lead(lead_id)


def has_pending_lead(tenant_id: str) -> bool:
    conn = _db.get_conn()
    try:
        row = conn.execute(
            "SELECT 1 FROM leads WHERE tenant_id=? AND status != 'report_ready' LIMIT 1",
            (tenant_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def count_new() -> int:
    conn = _db.get_conn()
    try:
        row = conn.execute("SELECT COUNT(*) FROM leads WHERE status='submitted'").fetchone()
        return row[0] if row else 0
    finally:
        conn.close()


def clear_for_tests() -> None:
    conn = _db.get_conn()
    try:
        conn.execute("DELETE FROM leads")
        conn.commit()
    finally:
        conn.close()
