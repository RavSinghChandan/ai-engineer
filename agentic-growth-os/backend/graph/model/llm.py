"""Optional DeepSeek copy generation.

The key is read from the environment only. It is never logged, never returned
in an API response, and never written to a file in this repository. If the key
is absent the caller falls back to the built-in templates, so the app runs
fully offline with no configuration.
"""

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
TIMEOUT_SECONDS = 20


def is_enabled() -> bool:
    return bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())


def _endpoint() -> str:
    base = os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    return f"{base}/chat/completions"


def generate_ad_copy(
    campaign_type: str,
    product_name: str,
    target_audience: str,
    key_benefit: str,
    tone: str,
    headline_strategy: str,
) -> Optional[Dict[str, str]]:
    """Return {headline, description, cta} from DeepSeek, or None on any failure.

    Returning None rather than raising is deliberate: ad copy is not worth
    failing a campaign run over, and the template path is always available.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None

    prompt = (
        f"Write one ad for a {campaign_type.replace('_', ' ')} campaign in India.\n"
        f"Product: {product_name}\n"
        f"Target audience: {target_audience}\n"
        f"Key benefit: {key_benefit}\n"
        f"Tone: {tone.replace('_', ' ')}\n"
        f"Headline strategy: {headline_strategy.replace('_', ' ')}\n\n"
        "Return strict JSON with exactly these keys and no other text: "
        '{"headline": "...", "description": "...", "cta": "..."}. '
        "Headline max 60 characters, description max 120 characters, "
        "cta max 25 characters. Use Indian rupee figures where money is mentioned."
    )

    payload = json.dumps({
        "model": os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL),
        "messages": [
            {"role": "system", "content": "You are a senior performance-marketing copywriter. You reply with JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.8,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    request = urllib.request.Request(
        _endpoint(),
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError, json.JSONDecodeError):
        # Deliberately opaque: an error here must not leak the request, which
        # carries the API key in its headers.
        return None

    headline = str(parsed.get("headline", "")).strip()
    description = str(parsed.get("description", "")).strip()
    cta = str(parsed.get("cta", "")).strip()
    if not headline or not description:
        return None

    return {"headline": headline, "description": description, "cta": cta}


def status() -> Dict[str, Any]:
    """Safe-to-serialise status. Never includes the key or any part of it."""
    return {
        "provider": "deepseek",
        "enabled": is_enabled(),
        "model": os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL),
    }
