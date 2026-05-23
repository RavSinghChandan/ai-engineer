"""
Shared DeepSeek API client.
Used by any agent that needs LLM inference via DeepSeek.

Token economics tracking:
  Every call() updates a thread-local accumulator with real token counts
  from the API `usage` field. Callers (e.g. _record_metrics) read it via:
    get_session_usage()   → {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N, "calls": N}
    reset_session_usage() → clears the accumulator for the current thread
"""
from __future__ import annotations
import json
import os
import threading
import urllib.request
from typing import Any, Dict, Optional
from guardrails.production import llm_circuit_breaker, CircuitOpenError

# ── Thread-local token accumulator ───────────────────────────────────────────
_usage_local = threading.local()


def _acc() -> Dict[str, int]:
    if not hasattr(_usage_local, "data"):
        _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
    return _usage_local.data


def get_session_usage() -> Dict[str, int]:
    """Return accumulated token counts for the current thread since last reset."""
    return dict(_acc())


def reset_session_usage() -> None:
    """Reset token accumulator for the current thread (call before each pipeline run)."""
    _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}


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

    http_req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_KEY}",
        },
        method="POST",
    )

    def _do_http_call():
        with urllib.request.urlopen(http_req, timeout=12) as resp:
            return json.loads(resp.read().decode())

    # ── G2: Circuit Breaker wraps the actual HTTP call ────────────────────────
    try:
        data = llm_circuit_breaker.call(_do_http_call)
    except CircuitOpenError as exc:
        raise RuntimeError(str(exc)) from exc

    # ── Accumulate real token counts from API response ────────────────────────
    usage = data.get("usage", {})
    acc = _acc()
    acc["prompt_tokens"]     += usage.get("prompt_tokens", 0)
    acc["completion_tokens"] += usage.get("completion_tokens", 0)
    acc["total_tokens"]      += usage.get("total_tokens", 0)
    acc["calls"]             += 1

    raw = data["choices"][0]["message"]["content"]
    # Strip markdown code fences if present
    if raw.strip().startswith("```"):
        raw = "\n".join(
            line for line in raw.strip().splitlines()
            if not line.strip().startswith("```")
        ).strip()
    return raw
