"""
Shared DeepSeek API client.
Used by any agent that needs LLM inference via DeepSeek.
"""
from __future__ import annotations
import json
import os
import urllib.request
from typing import Any, Dict, Optional


def _load_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if key:
        return key
    # Walk up from this file to find .env
    search = os.path.dirname(__file__)
    for _ in range(4):
        env_path = os.path.join(search, ".env")
        if os.path.isfile(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DEEPSEEK_API_KEY="):
                        return line.split("=", 1)[1].strip()
        search = os.path.dirname(search)
    return ""


_KEY: Optional[str] = None


def call(
    system: str,
    user: str,
    temperature: float = 0.7,
    max_tokens: int = 800,
    model: str = "deepseek-chat",
) -> str:
    """
    Call DeepSeek chat completions API.
    Returns the raw text content of the first choice.
    Raises RuntimeError if key is missing or API returns an error.
    """
    global _KEY
    if not _KEY:
        _KEY = _load_key()
    if not _KEY:
        raise RuntimeError("DEEPSEEK_API_KEY not set. Add it to your .env file.")

    payload = json.dumps({
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())

    raw = data["choices"][0]["message"]["content"]
    # Strip markdown code fences if present
    if raw.strip().startswith("```"):
        raw = "\n".join(
            line for line in raw.strip().splitlines()
            if not line.strip().startswith("```")
        ).strip()
    return raw
