import os
import pytest
import tempfile

# Point at a temp DB for all tests in this module
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name

from database.db import init_db
from database.leads_store import (
    create_lead, get_lead_by_sender, update_lead_stage,
    list_leads, count_leads_by_stage,
)
from database.interactions_store import (
    log_interaction, get_recent_interactions, count_interactions_by_intent,
)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def test_create_and_retrieve_lead():
    lead = create_lead("sender_001", "instagram", "Alice")
    assert lead["sender_id"] == "sender_001"
    assert lead["funnel_stage"] == "NEW_LEAD"

    fetched = get_lead_by_sender("sender_001", "instagram")
    assert fetched["id"] == lead["id"]


def test_create_lead_idempotent():
    create_lead("sender_002", "instagram")
    create_lead("sender_002", "instagram")  # should not raise
    fetched = get_lead_by_sender("sender_002", "instagram")
    assert fetched is not None


def test_update_lead_stage():
    lead = create_lead("sender_003", "instagram")
    update_lead_stage(lead["id"], "INTERESTED")
    fetched = get_lead_by_sender("sender_003", "instagram")
    assert fetched["funnel_stage"] == "INTERESTED"


def test_unknown_sender_returns_none():
    result = get_lead_by_sender("nonexistent_999", "instagram")
    assert result is None


def test_list_leads_returns_results():
    create_lead("sender_004", "instagram")
    leads = list_leads(limit=100)
    assert len(leads) >= 1


def test_log_and_retrieve_interactions():
    lead = create_lead("sender_005", "instagram")
    log_interaction(lead["id"], "customer", "How much does it cost?", intent="INQUIRY")
    log_interaction(lead["id"], "agent", "It costs ₹999.", intent="REPLY")

    history = get_recent_interactions(lead["id"])
    assert len(history) == 2
    assert history[0]["role"] == "customer"
    assert history[1]["role"] == "agent"


def test_count_leads_by_stage():
    create_lead("sender_006", "instagram")
    counts = count_leads_by_stage()
    assert "NEW_LEAD" in counts
    assert counts["NEW_LEAD"] >= 1


def test_count_interactions_by_intent():
    lead = create_lead("sender_007", "instagram")
    log_interaction(lead["id"], "customer", "Tell me more.", intent="INTEREST")
    counts = count_interactions_by_intent()
    assert counts.get("INTEREST", 0) >= 1
