import hashlib
import hmac
import json
from typing import Any
from platforms.instagram.auth import INSTAGRAM_APP_SECRET


def verify_signature(payload_body: bytes, x_hub_signature: str) -> bool:
    """Verify the X-Hub-Signature-256 header from Meta."""
    if not x_hub_signature or not x_hub_signature.startswith("sha256="):
        return False
    expected = hmac.new(
        INSTAGRAM_APP_SECRET.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    received = x_hub_signature[len("sha256="):]
    return hmac.compare_digest(expected, received)


def parse_webhook_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Parse a raw Meta webhook payload into a list of normalized message dicts.
    Handles both comment and DM (messaging) events.
    """
    messages = []

    for entry in payload.get("entry", []):
        # DM events
        for messaging in entry.get("messaging", []):
            sender_id = messaging.get("sender", {}).get("id", "")
            message_obj = messaging.get("message", {})
            text = message_obj.get("text", "")
            if not text:
                continue
            messages.append({
                "platform": "instagram",
                "message_type": "dm",
                "sender_id": sender_id,
                "sender_name": "",
                "message_text": text,
                "timestamp": str(messaging.get("timestamp", "")),
                "media_id": "",
            })

        # Comment events
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "comments":
                continue
            messages.append({
                "platform": "instagram",
                "message_type": "comment",
                "sender_id": value.get("from", {}).get("id", ""),
                "sender_name": value.get("from", {}).get("username", ""),
                "message_text": value.get("text", ""),
                "timestamp": str(value.get("timestamp", "")),
                "media_id": value.get("media", {}).get("id", ""),
            })

    return messages
