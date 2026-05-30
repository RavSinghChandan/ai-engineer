import urllib.request
import urllib.parse
import json
from platforms.instagram.auth import get_access_token

GRAPH_API_BASE = "https://graph.instagram.com/v19.0"


def _post(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def reply_to_comment(media_id: str, comment_id: str, message: str) -> dict:
    """Reply to an Instagram comment."""
    token = get_access_token()
    url = f"{GRAPH_API_BASE}/{comment_id}/replies?access_token={token}"
    return _post(url, {"message": message})


def send_dm(recipient_id: str, message: str) -> dict:
    """Send an Instagram Direct Message."""
    token = get_access_token()
    url = f"{GRAPH_API_BASE}/me/messages?access_token={token}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message},
    }
    return _post(url, payload)


def get_media_comments(media_id: str) -> list[dict]:
    """Fetch comments on a media object (polling fallback)."""
    token = get_access_token()
    url = (
        f"{GRAPH_API_BASE}/{media_id}/comments"
        f"?fields=id,text,username,timestamp"
        f"&access_token={token}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("data", [])
