from platforms.instagram.webhook import parse_webhook_payload


def _comment_payload(text="How much is the tarot reading?", comment_id="c_001", media_id="m_001"):
    return {
        "entry": [{
            "changes": [{
                "field": "comments",
                "value": {
                    "from": {"id": "user_123", "username": "rahul_k"},
                    "text": text,
                    "timestamp": 1716979200,
                    "media": {"id": media_id},
                    "id": comment_id,
                }
            }]
        }]
    }


def _dm_payload(text="I want to book a session", sender_id="user_456"):
    return {
        "entry": [{
            "messaging": [{
                "sender": {"id": sender_id},
                "message": {"text": text, "mid": "m_dm_001"},
                "timestamp": 1716979200,
            }]
        }]
    }


def test_parse_comment():
    messages = parse_webhook_payload(_comment_payload())
    assert len(messages) == 1
    msg = messages[0]
    assert msg["message_type"] == "comment"
    assert msg["message_text"] == "How much is the tarot reading?"
    assert msg["sender_id"] == "user_123"
    assert msg["sender_name"] == "rahul_k"
    assert msg["media_id"] == "m_001"


def test_parse_dm():
    messages = parse_webhook_payload(_dm_payload())
    assert len(messages) == 1
    msg = messages[0]
    assert msg["message_type"] == "dm"
    assert msg["sender_id"] == "user_456"
    assert msg["message_text"] == "I want to book a session"


def test_empty_payload_returns_empty_list():
    assert parse_webhook_payload({}) == []


def test_non_comment_field_skipped():
    payload = {
        "entry": [{"changes": [{"field": "likes", "value": {}}]}]
    }
    assert parse_webhook_payload(payload) == []


def test_multiple_comments_parsed():
    payload = {
        "entry": [{
            "changes": [
                {"field": "comments", "value": {"from": {"id": "u1", "username": "a"}, "text": "msg1", "timestamp": 1, "media": {"id": "m1"}}},
                {"field": "comments", "value": {"from": {"id": "u2", "username": "b"}, "text": "msg2", "timestamp": 2, "media": {"id": "m1"}}},
            ]
        }]
    }
    messages = parse_webhook_payload(payload)
    assert len(messages) == 2


def test_dm_with_empty_text_skipped():
    payload = {
        "entry": [{
            "messaging": [{"sender": {"id": "u1"}, "message": {"text": ""}, "timestamp": 1}]
        }]
    }
    assert parse_webhook_payload(payload) == []
