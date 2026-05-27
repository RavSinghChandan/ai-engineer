# Python for AI Engineering — Phase 4
# Lesson 8: Rate Limiting & Retries — Exponential Backoff, Throttling, Provider-Safe Wrappers

---

## 1. Intuition (Java Anchor)

Java: `@Retryable` from Spring Retry, Resilience4j `RateLimiter`, `CircuitBreaker`.
Python: `tenacity` library for retries, `asyncio.Semaphore` for concurrency control, manual token bucket for rate limiting.

The LLM provider enforces rate limits by HTTP status code: 429 (too many requests). Your code must handle it — not crash, not hammer the API, but back off gracefully and retry.

| Java Pattern | Python Equivalent |
|---|---|
| `@Retryable(maxAttempts=3, backoff=@Backoff(delay=1000, multiplier=2))` | `@retry(wait=wait_exponential(min=1, max=16))` |
| `@Recover` fallback method | `retry_error_callback` in tenacity |
| Resilience4j `RateLimiter` | `asyncio.Semaphore` + token bucket |
| Resilience4j `CircuitBreaker` | tenacity `stop_after_delay` + state flag |
| `@CircuitBreaker(fallbackMethod="fallback")` | `retry_error_callback` + default value |
| `Thread.sleep(ms)` | `asyncio.sleep(seconds)` |
| `CompletableFuture.exceptionally()` | `tenacity` on async function |
| Bulkhead pattern | `asyncio.Semaphore(max_concurrent)` |

---

## 2. Built-in SDK Retries — First Line of Defense

```python
from openai import OpenAI, AsyncOpenAI

# OpenAI SDK retries 429 and 5xx automatically — use this always:
client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    max_retries=3,       # retries on 429, 500, 502, 503 — Java: @Retryable(maxAttempts=3)
    timeout=60.0,        # total request timeout including retries
)

# What the SDK retries automatically:
# 429 RateLimitError   — too many requests
# 500 APIStatusError   — internal server error
# 502/503              — bad gateway / service unavailable
# Connection errors    — network timeouts

# What it does NOT retry (don't retry these yourself either):
# 400 BadRequestError  — invalid request (bug in your code)
# 401 AuthenticationError — bad API key
# 404 NotFoundError    — wrong model name

# For most applications, max_retries=3 is sufficient.
# Add tenacity only when you need custom backoff logic or circuit breaking.
```

---

## 3. Tenacity — Custom Retry Logic

```python
# pip install tenacity
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)
from openai import RateLimitError, APITimeoutError
import logging

logger = logging.getLogger(__name__)

# Sync retry decorator (Java: @Retryable):
@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_exponential(multiplier=1, min=1, max=60),   # 1s, 2s, 4s, 8s, ... max 60s
    stop=stop_after_attempt(5),                            # Java: maxAttempts=5
    before_sleep=before_sleep_log(logger, logging.WARNING), # log each retry
)
def call_llm_with_retry(prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content

# Async retry (Java: @Retryable on @Async method):
@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_exponential(multiplier=1, min=1, max=60),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
async def call_llm_async_with_retry(prompt: str) -> str:
    response = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content

# Handle exhausted retries (Java: @Recover):
async def safe_call(prompt: str) -> str | None:
    try:
        return await call_llm_async_with_retry(prompt)
    except RetryError:
        logger.error("LLM call failed after all retries for prompt: %.50s", prompt)
        return None   # or raise a domain-specific exception
```

---

## 4. Retry with Jitter — Prevent Thundering Herd

```python
# Problem: if 100 requests all hit a rate limit at the same moment,
# they all sleep for the same duration and retry simultaneously — hammering the API again.
# Solution: add random jitter to spread the retry times.
# Java: Resilience4j supports jitter via IntervalFunction.ofExponentialRandomBackoff()

from tenacity import wait_random_exponential

@retry(
    retry=retry_if_exception_type(RateLimitError),
    wait=wait_random_exponential(min=1, max=60),   # exponential with random jitter
    stop=stop_after_attempt(5),
)
async def call_with_jitter(prompt: str) -> str:
    response = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content

# Manual backoff with jitter (when you don't use tenacity):
import asyncio
import random

async def manual_retry_with_jitter(prompt: str, max_attempts: int = 5) -> str:
    for attempt in range(max_attempts):
        try:
            response = await async_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content
        except RateLimitError:
            if attempt == max_attempts - 1:
                raise
            base_wait = 2 ** attempt           # 1, 2, 4, 8, 16
            jitter = random.uniform(0, base_wait * 0.1)   # ±10% jitter
            wait = base_wait + jitter
            logger.warning("Rate limited — waiting %.1fs (attempt %d)", wait, attempt + 1)
            await asyncio.sleep(wait)
```

---

## 5. Concurrency Control — Semaphore as Rate Limiter

```python
# Problem: 100 concurrent requests will exceed the API's requests-per-minute limit.
# Solution: asyncio.Semaphore limits simultaneous in-flight calls.
# Java: Semaphore(n) — exact same concept

import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

class RateLimitedLLMClient:
    """
    Wraps AsyncOpenAI with concurrency control.
    Java: a thread-safe wrapper around RestTemplate with Semaphore.
    """
    def __init__(self, max_concurrent: int = 5):
        self._client = AsyncOpenAI(max_retries=3, timeout=60.0)
        self._semaphore = asyncio.Semaphore(max_concurrent)   # Java: new Semaphore(5)
        self._total_calls = 0
        self._total_tokens = 0

    async def complete(self, prompt: str, system: str = "") -> str:
        async with self._semaphore:   # acquire before call, release after — Java: semaphore.acquire()
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
            )
            self._total_calls += 1
            self._total_tokens += response.usage.total_tokens
            return response.choices[0].message.content

    @property
    def stats(self) -> dict:
        return {"calls": self._total_calls, "tokens": self._total_tokens}


# Batch processing with rate control:
async def process_batch(prompts: list[str], max_concurrent: int = 5) -> list[str]:
    """Process many prompts in parallel but cap concurrency."""
    client = RateLimitedLLMClient(max_concurrent=max_concurrent)
    tasks = [client.complete(p) for p in prompts]
    return await asyncio.gather(*tasks)   # runs up to max_concurrent at once
```

---

## 6. Token Bucket Rate Limiter

```python
# More precise rate limiting: limit calls per second/minute
# Java: Guava RateLimiter.create(5.0) — 5 permits/second

import asyncio
import time

class TokenBucketRateLimiter:
    """
    Allow at most `rate` calls per `period` seconds.
    Java: Guava RateLimiter / Resilience4j RateLimiter.
    """
    def __init__(self, rate: int, period: float = 60.0):
        self.rate = rate          # max calls per period
        self.period = period      # seconds
        self.tokens = rate        # start full
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill

            # Refill tokens proportionally to elapsed time:
            self.tokens = min(
                self.rate,
                self.tokens + elapsed * (self.rate / self.period),
            )
            self.last_refill = now

            if self.tokens < 1:
                # Not enough tokens — wait for refill:
                wait_time = (1 - self.tokens) * (self.period / self.rate)
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1

# Usage:
limiter = TokenBucketRateLimiter(rate=60, period=60.0)   # 60 calls/minute

async def rate_limited_call(prompt: str) -> str:
    await limiter.acquire()
    return await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    ).choices[0].message.content
```

---

## 7. Production LLM Wrapper — All Patterns Combined

```python
from openai import AsyncOpenAI, RateLimitError, APITimeoutError, BadRequestError
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type
import asyncio, logging, time

logger = logging.getLogger(__name__)

class ProductionLLMClient:
    """
    Production-grade LLM client:
    - Concurrency control (Semaphore)
    - Automatic retry with jitter (tenacity)
    - Token tracking
    - Structured logging
    Java: @Service + @Retryable + Semaphore + Metrics
    """
    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        max_concurrent: int = 5,
        max_retries_sdk: int = 3,
        timeout: float = 60.0,
        model: str = "gpt-4o",
    ):
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            max_retries=max_retries_sdk,
            timeout=timeout,
        )
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._model = model
        self._total_tokens = 0
        self._total_calls = 0

    @retry(
        retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
        wait=wait_random_exponential(min=1, max=60),
        stop=stop_after_attempt(4),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    async def _call_api(self, messages: list[dict], temperature: float) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
        )
        self._total_tokens += response.usage.total_tokens
        self._total_calls += 1
        return response.choices[0].message.content

    async def complete(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.2,
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        start = time.perf_counter()
        async with self._semaphore:
            try:
                result = await self._call_api(messages, temperature)
                elapsed_ms = (time.perf_counter() - start) * 1000
                logger.info(
                    "llm call=ok model=%s tokens=%d ms=%.0f",
                    self._model, self._total_tokens, elapsed_ms,
                )
                return result
            except BadRequestError as e:
                logger.error("bad request (will not retry): %s", e)
                raise
            except Exception as e:
                logger.error("llm call failed after retries: %s", e)
                raise

    @property
    def stats(self) -> dict:
        return {"total_calls": self._total_calls, "total_tokens": self._total_tokens}
```

---

## 8. Interview Anchor

**"How do you handle rate limits and retries for LLM API calls in production?"**

Say:
> "Three layers. First, the SDK's built-in `max_retries=3` — the OpenAI SDK automatically retries 429 and 5xx with exponential backoff. That handles 95% of transient failures without any code. Second, tenacity on top for custom backoff: I use `wait_random_exponential(min=1, max=60)` — the jitter is critical for batch workloads because without it, 50 threads hit the same rate limit and all retry at the same moment, doubling the problem. I exclude `BadRequestError` from retries — a 400 is a bug in my code, not a transient failure. Third, an `asyncio.Semaphore` to cap concurrency: even with retries, sending 100 simultaneous requests will hit rate limits. A Semaphore(5) means at most 5 in-flight at once — the throughput is the same long-term but the API sees a smooth 5 QPS instead of a burst of 100. The Java mental model: Semaphore is identical, `@Retryable(backoff=@Backoff(multiplier=2))` maps to `wait_exponential`, and `@Recover` maps to `retry_error_callback`."

---

## 9. Quick Reference

```python
# SDK retries (always use)
client = AsyncOpenAI(max_retries=3, timeout=60.0)

# tenacity retry decorator
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_random_exponential(min=1, max=60),
    stop=stop_after_attempt(5),
)
async def my_llm_call(): ...

# Concurrency limit
semaphore = asyncio.Semaphore(5)   # max 5 concurrent calls
async with semaphore:
    result = await client.chat.completions.create(...)

# Manual exponential backoff
for attempt in range(5):
    try:
        return await client.chat.completions.create(...)
    except RateLimitError:
        wait = 2 ** attempt + random.uniform(0, 1)
        await asyncio.sleep(wait)

# Batch with concurrency control
async def batch(prompts, max_concurrent=5):
    sem = asyncio.Semaphore(max_concurrent)
    async def one(p):
        async with sem: return await call(p)
    return await asyncio.gather(*[one(p) for p in prompts])

# Error types to know
from openai import (
    RateLimitError,       # 429 — retry with backoff
    APITimeoutError,      # timeout — retry
    APIConnectionError,   # network — retry
    BadRequestError,      # 400 — bug in code, don't retry
    AuthenticationError,  # 401 — bad key, don't retry
)

# Java comparison
# AsyncOpenAI(max_retries=3)          → @Retryable(maxAttempts=3)
# wait_random_exponential()           → @Backoff(multiplier=2, random=true)
# stop_after_attempt(5)               → maxAttempts=5
# retry_if_exception_type(...)        → include/exclude exception types
# asyncio.Semaphore(5)                → new Semaphore(5)
# async with semaphore                → semaphore.acquire() / release()
# retry_error_callback                → @Recover
```
