from unittest.mock import patch
from agents.intent_agent import intent_agent, INTENTS


def _state(text="How much does the session cost?"):
    return {"message_text": text, "agent_log": []}


def test_valid_intent_returned():
    mock_resp = '{"intent": "INQUIRY", "confidence": 0.9, "reasoning": "asking about price"}'
    with patch("agents.intent_agent.call_llm", return_value=mock_resp):
        result = intent_agent(_state())
    assert result["intent"] == "INQUIRY"
    assert result["intent_confidence"] == 0.9


def test_unknown_intent_becomes_other():
    mock_resp = '{"intent": "GARBAGE", "confidence": 0.5, "reasoning": "unknown"}'
    with patch("agents.intent_agent.call_llm", return_value=mock_resp):
        result = intent_agent(_state())
    assert result["intent"] == "OTHER"


def test_json_parse_failure_defaults_other():
    with patch("agents.intent_agent.call_llm", return_value="not json at all"):
        result = intent_agent(_state())
    assert result["intent"] == "OTHER"
    assert result["intent_confidence"] == 0.0


def test_hot_lead_intent():
    mock_resp = '{"intent": "HOT_LEAD", "confidence": 0.95, "reasoning": "ready to buy"}'
    with patch("agents.intent_agent.call_llm", return_value=mock_resp):
        result = intent_agent(_state("I want to buy right now, where do I pay?"))
    assert result["intent"] == "HOT_LEAD"


def test_agent_log_appended():
    mock_resp = '{"intent": "INTEREST", "confidence": 0.8, "reasoning": "interested"}'
    with patch("agents.intent_agent.call_llm", return_value=mock_resp):
        result = intent_agent(_state())
    assert any("intent_agent" in e for e in result["agent_log"])


def test_all_valid_intents_accepted():
    for intent in INTENTS:
        mock_resp = f'{{"intent": "{intent}", "confidence": 0.7, "reasoning": "test"}}'
        with patch("agents.intent_agent.call_llm", return_value=mock_resp):
            result = intent_agent(_state())
        assert result["intent"] == intent
