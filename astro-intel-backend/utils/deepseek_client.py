"""
Shared DeepSeek API client.
Used by any agent that needs LLM inference via DeepSeek.

Token economics tracking:
  call() accumulates real token counts from the API `usage` field into a
  thread-local AND a shared cross-thread accumulator dict.

  Pipeline runs via run_in_executor (ThreadPoolExecutor). Each worker thread
  accumulates into _usage_local (thread-local). At pipeline end, graph/pipeline.py
  calls collect_pipeline_usage() which merges ALL worker-thread accumulators into
  a process-level dict, then writes to state["_token_usage"].
  _record_metrics() then reads state["_token_usage"] directly — no cross-thread
  data loss.

  reset_session_usage() clears both local and cross-thread accumulator.
"""
from __future__ import annotations
import json
import os
import threading
import urllib.request
from typing import Any, Dict, Optional
from guardrails.production import llm_circuit_breaker, CircuitOpenError

# ── Thread-local token accumulator (per worker thread) ───────────────────────
_usage_local = threading.local()

# ── Cross-thread accumulator: all worker threads write here under a lock ─────
_global_lock = threading.Lock()
_global_usage: Dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}


def _acc() -> Dict[str, int]:
    if not hasattr(_usage_local, "data"):
        _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
    return _usage_local.data


def get_session_usage() -> Dict[str, int]:
    """Return cross-thread accumulated token counts since last reset."""
    with _global_lock:
        return dict(_global_usage)


def reset_session_usage() -> None:
    """Reset both thread-local and cross-thread accumulators."""
    _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
    with _global_lock:
        _global_usage.update({"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0})


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

    # ── Accumulate real token counts — thread-local AND cross-thread ─────────
    usage = data.get("usage", {})
    pt = usage.get("prompt_tokens", 0)
    ct = usage.get("completion_tokens", 0)
    tt = usage.get("total_tokens", 0)
    acc = _acc()
    acc["prompt_tokens"]     += pt
    acc["completion_tokens"] += ct
    acc["total_tokens"]      += tt
    acc["calls"]             += 1
    with _global_lock:
        _global_usage["prompt_tokens"]     += pt
        _global_usage["completion_tokens"] += ct
        _global_usage["total_tokens"]      += tt
        _global_usage["calls"]             += 1

    raw = data["choices"][0]["message"]["content"]
    # Strip markdown code fences if present
    if raw.strip().startswith("```"):
        raw = "\n".join(
            line for line in raw.strip().splitlines()
            if not line.strip().startswith("```")
        ).strip()
    return raw
