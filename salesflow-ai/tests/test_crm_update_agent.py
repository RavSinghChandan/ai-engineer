import os
import tempfile
import pytest

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
from database.leads_store import create_lead, get_lead_by_sender
from agents.crm_update_agent import crm_update_agent


@pytest.fixture(autouse=True)
def setup():
    init_db()


def _make_lead(sender_id="crm_sender_001"):
    return create_lead(sender_id, "instagram", "Test User")


def _state(lead, intent, sent=True, reply="Great question! DM us."):
    return {
        "lead_id": lead["id"],
        "funnel_stage": lead["funnel_stage"],
        "intent": intent,
        "message_text": "How much?",
        "draft_reply": reply,
        "sent": sent,
        "platform": "instagram",
        "message_type": "comment",
        "agent_log": [],
    }


def test_inquiry_advances_new_lead_to_engaged():
    lead = _make_lead("crm_001")
    result = crm_update_agent(_state(lead, "INQUIRY"))
    assert result["funnel_stage"] == "ENGAGED"


def test_interest_advances_engaged_to_interested():
    lead = _make_lead("crm_002")
    from database.leads_store import update_lead_stage
    update_lead_stage(lead["id"], "ENGAGED")
    lead["funnel_stage"] = "ENGAGED"
    result = crm_update_agent(_state(lead, "INTEREST"))
    assert result["funnel_stage"] == "INTERESTED"


def test_hot_lead_advances_to_negotiating():
    lead = _make_lead("crm_003")
    result = crm_update_agent(_state(lead, "HOT_LEAD"))
    assert result["funnel_stage"] == "NEGOTIATING"


def test_spam_does_not_advance_stage():
    lead = _make_lead("crm_004")
    result = crm_update_agent(_state(lead, "SPAM"))
    assert result["funnel_stage"] == "NEW_LEAD"


def test_agent_log_records_transition():
    lead = _make_lead("crm_005")
    result = crm_update_agent(_state(lead, "INQUIRY"))
    assert any("crm_update_agent" in e for e in result["agent_log"])


def test_no_reply_logged_when_not_sent():
    lead = _make_lead("crm_006")
    state = _state(lead, "INQUIRY", sent=False, reply="")
    result = crm_update_agent(state)
    assert result["funnel_stage"] == "ENGAGED"
