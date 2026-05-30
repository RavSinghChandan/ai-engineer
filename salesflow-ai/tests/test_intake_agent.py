from agents.intake_agent import intake_agent


def _base_state(overrides=None):
    state = {
        "raw_message": {
            "platform": "instagram",
            "sender_id": "user_123",
            "sender_name": "Rahul",
            "message_text": "  How much does the tarot session cost?  ",
            "message_type": "comment",
            "timestamp": "1716979200",
            "media_id": "media_456",
        },
        "agent_log": [],
    }
    if overrides:
        state["raw_message"].update(overrides)
    return state


def test_normalizes_message_text():
    result = intake_agent(_base_state())
    assert result["message_text"] == "How much does the tarot session cost?"


def test_sets_platform():
    result = intake_agent(_base_state())
    assert result["platform"] == "instagram"


def test_sets_sender_id():
    result = intake_agent(_base_state())
    assert result["sender_id"] == "user_123"


def test_sets_message_type():
    result = intake_agent(_base_state())
    assert result["message_type"] == "comment"


def test_appends_agent_log():
    result = intake_agent(_base_state())
    assert any("intake_agent" in entry for entry in result["agent_log"])


def test_defaults_empty_message():
    state = {"raw_message": {}, "agent_log": []}
    result = intake_agent(state)
    assert result["message_text"] == ""
    assert result["platform"] == "instagram"
