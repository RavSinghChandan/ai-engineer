from agents.guardrail_agent import guardrail_agent


def _state(reply="", intent="INQUIRY"):
    return {"draft_reply": reply, "intent": intent, "agent_log": []}


def test_approves_clean_reply():
    state = _state("Thanks for asking! Our tarot session starts at ₹599. DM us to book.")
    result = guardrail_agent(state)
    assert result["reply_approved"] is True


def test_blocks_empty_reply():
    result = guardrail_agent(_state(""))
    assert result["reply_approved"] is False
    assert "empty" in result["guardrail_reason"]


def test_blocks_guaranteed_claim():
    state = _state("100% guaranteed results or your money back!")
    result = guardrail_agent(state)
    assert result["reply_approved"] is False


def test_truncates_long_reply():
    long = "word " * 200
    state = _state(long)
    result = guardrail_agent(state)
    assert len(result["draft_reply"]) <= 503  # 500 + ellipsis


def test_sanitizes_blocked_pattern_in_reply():
    state = _state("We offer a lifetime guarantee on all sessions!")
    result = guardrail_agent(state)
    assert "[offer details in DM]" in result["draft_reply"]


def test_agent_log_appended():
    state = _state("Great question! DM us for pricing.")
    result = guardrail_agent(state)
    assert any("guardrail_agent" in e for e in result["agent_log"])


def test_spam_empty_reply_blocked():
    state = _state("", intent="SPAM")
    result = guardrail_agent(state)
    assert result["reply_approved"] is False
