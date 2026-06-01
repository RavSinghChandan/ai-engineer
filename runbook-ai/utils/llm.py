"""
LLM utility — calls DeepSeek or Anthropic with httpx.

Production decisions:
- httpx replaces urllib.request (connection pooling, cleaner error types)
- 20s read timeout (down from 60s) — incident response demands fast failure
- 2 retries with 1s backoff on transient network errors
"""
from __future__ import annotations
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "deepseek")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

_TIMEOUT = httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0)
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
    if LLM_PROVIDER == "anthropic":
        return _call_anthropic(system_prompt, user_prompt, max_tokens)
    return _call_deepseek(system_prompt, user_prompt, max_tokens)


def _call_deepseek(system: str, user: str, max_tokens: int) -> str:
    return _post_with_retry(
        url="https://api.deepseek.com/v1/chat/completions",
        payload={
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.1,
        },
        headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
        extract=lambda r: r["choices"][0]["message"]["content"].strip(),
    )


def _call_anthropic(system: str, user: str, max_tokens: int) -> str:
    return _post_with_retry(
        url="https://api.anthropic.com/v1/messages",
        payload={
            "model": ANTHROPIC_MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        extract=lambda r: r["content"][0]["text"].strip(),
    )


def _post_with_retry(url: str, payload: dict, headers: dict, extract) -> str:
    """POST with retry on transient errors. Raises RuntimeError on permanent failure."""
    last_exc: Exception = RuntimeError("no attempts made")
    for attempt in range(1, _MAX_RETRIES + 2):
        try:
            with httpx.Client(timeout=_TIMEOUT) as client:
                resp = client.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json", **headers},
                )
            if resp.status_code == 429:
                raise RuntimeError("LLM rate limited (429) — retry later")
            if resp.status_code >= 500:
                raise RuntimeError(f"LLM server error {resp.status_code}: {resp.text[:200]}")
            resp.raise_for_status()
            return extract(resp.json())
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
            last_exc = exc
            if attempt <= _MAX_RETRIES:
                logger.warning("LLM attempt %d/%d failed (%s), retrying…", attempt, _MAX_RETRIES + 1, exc)
                time.sleep(_RETRY_DELAY)
        except RuntimeError:
            raise
        except Exception as exc:
            last_exc = exc
            break
    raise RuntimeError(f"LLM call failed after {_MAX_RETRIES + 1} attempts: {last_exc}") from last_exc
