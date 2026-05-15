"""
Lead capture store.
Persists to leads.json alongside auth_keys.json.
"""
from __future__ import annotations
import json, os, secrets, time
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

_STORE_PATH = Path(os.environ.get("LEADS_STORE_PATH", "leads.json"))

VALID_STATUSES = {"submitted", "admin_notified", "expert_analysis", "report_ready"}

@dataclass
class Lead:
    lead_id:     str
    name:        str
    email:       str
    phone:       str
    dob:         str
    consent:     bool
    status:      str        # submitted | admin_notified | expert_analysis | report_ready
    created_at:  float
    updated_at:  float
    notes:       str = ""
    report_json: str = ""   # JSON-serialized final report, set when admin completes reading

_leads: Dict[str, Lead] = {}


def _flush() -> None:
    try:
        _STORE_PATH.write_text(json.dumps(
            {"leads": [asdict(l) for l in _leads.values()]}, indent=2
        ))
    except Exception:
        pass


def load() -> None:
    if _STORE_PATH.exists():
        try:
            data = json.loads(_STORE_PATH.read_text())
            for d in data.get("leads", []):
                _leads[d["lead_id"]] = Lead(**d)
        except Exception:
            pass


def create_lead(name: str, email: str, phone: str, dob: str, consent: bool) -> Lead:
    lid = f"lead_{secrets.token_hex(6)}"
    now = time.time()
    lead = Lead(
        lead_id=lid, name=name, email=email, phone=phone,
        dob=dob, consent=consent,
        status="submitted", created_at=now, updated_at=now,
    )
    _leads[lid] = lead
    _flush()
    return lead


def get_lead(lead_id: str) -> Optional[Lead]:
    return _leads.get(lead_id)


def list_leads() -> List[Lead]:
    return sorted(_leads.values(), key=lambda l: l.created_at, reverse=True)


def update_status(lead_id: str, status: str, notes: str = "") -> Optional[Lead]:
    lead = _leads.get(lead_id)
    if not lead:
        return None
    lead.status = status
    lead.updated_at = time.time()
    if notes:
        lead.notes = notes
    _flush()
    return lead


def attach_report(lead_id: str, report_json: str) -> Optional[Lead]:
    """Store the completed report JSON against the lead and mark it report_ready."""
    lead = _leads.get(lead_id)
    if not lead:
        return None
    lead.report_json = report_json
    lead.status      = "report_ready"
    lead.updated_at  = time.time()
    _flush()
    return lead


def count_new() -> int:
    return sum(1 for l in _leads.values() if l.status == "submitted")


def clear_for_tests() -> None:
    _leads.clear()
