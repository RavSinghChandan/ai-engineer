# Senior AI Engineer — Module 8
# Topic: OpenAI API — Retry Logic, Rate Limits, Fallback to Anthropic/Bedrock

---

## 1. Intuition

The OpenAI API is not 100% reliable. Rate limits, transient 500 errors, and latency spikes are normal in production.

Senior engineers build multi-layer resilience: exponential backoff retry, model fallback, and provider fallback. The system gracefully degrades instead of failing hard.

Your Resilience4j experience maps directly — circuit breaker, retry, bulkhead are the same patterns, different library.

---

## 2. Core Concept

### OpenAI Error Types and Handling Strategy

| Error Type | HTTP Code | Cause | Strategy |
|---|---|---|---|
| RateLimitError | 429 | TPM or RPM exceeded | Retry with exponential backoff |
| APITimeoutError | 408/504 | Request took too long | Retry with shorter timeout |
| APIConnectionError | - | Network issue | Retry immediately once, then backoff |
| InternalServerError | 500/503 | OpenAI server error | Retry with backoff |
| BadRequestError | 400 | Invalid prompt, too many tokens | Do NOT retry — fix the request |
| AuthenticationError | 401 | Invalid API key | Do NOT retry — alert |
| InvalidRequestError | 400 | Context length exceeded | Truncate and retry |

### Rate Limit Types

OpenAI has two limits per model:
- **TPM (tokens per minute)**: sum of input + output tokens across all requests
- **RPM (requests per minute)**: number of API calls per minute

Hitting TPM is more common at scale than RPM. When you hit 429, the response includes a `Retry-After` header (seconds to wait).

### Fallback Chain

```
Primary: GPT-4o
    ↓ (timeout / rate limit)
Secondary: GPT-4o-mini (cheaper, faster, lower rate limit contention)
    ↓ (429 or 500)
Tertiary: Claude 3.5 Haiku (Anthropic — different infrastructure, different limits)
    ↓ (all fail)
Cached response or graceful error
```

---

## 3. Code Skeleton (Production-Grade)

```python
import time
import random
import openai
import anthropic
from dataclasses import dataclass
from typing import Optional, Callable
import logging

logger = logging.getLogger(__name__)

@dataclass
class LLMResponse:
    content: str
    model: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: float
    retry_count: int = 0
    fallback_used: bool = False

class RateLimitBudget:
    """Tracks token usage per minute to proactively avoid rate limits"""
    
    def __init__(self, tpm_limit: int = 90_000):  # Leave 10% buffer from 100K TPM
        self.tpm_limit = tpm_limit
        self.window_tokens: list[tuple[float, int]] = []  # (timestamp, tokens)
    
    def can_proceed(self, estimated_tokens: int) -> bool:
        now = time.time()
        # Remove entries older than 60 seconds
        self.window_tokens = [(ts, t) for ts, t in self.window_tokens if now - ts < 60]
        current_usage = sum(t for _, t in self.window_tokens)
        return current_usage + estimated_tokens <= self.tpm_limit
    
    def record(self, tokens: int):
        self.window_tokens.append((time.time(), tokens))


class LLMClientWithFallback:
    def __init__(self, openai_api_key: str, anthropic_api_key: str = None):
        self.openai_client = openai.OpenAI(api_key=openai_api_key)
        self.anthropic_client = anthropic.Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None
        self.rate_budget = RateLimitBudget(tpm_limit=90_000)
        
        # Circuit breaker state per model
        self._failure_counts: dict[str, int] = {}
        self._circuit_open_until: dict[str, float] = {}
    
    def _is_circuit_open(self, model: str) -> bool:
        if model not in self._circuit_open_until:
            return False
        if time.time() > self._circuit_open_until[model]:
            # Half-open: allow one probe request
            del self._circuit_open_until[model]
            self._failure_counts[model] = 0
            return False
        return True
    
    def _record_failure(self, model: str):
        self._failure_counts[model] = self._failure_counts.get(model, 0) + 1
        if self._failure_counts[model] >= 5:
            # Open circuit for 60 seconds after 5 consecutive failures
            self._circuit_open_until[model] = time.time() + 60
            logger.warning(f"Circuit opened for {model} — backing off for 60s")
    
    def _record_success(self, model: str):
        self._failure_counts[model] = 0
    
    def _call_openai_with_retry(
        self,
        model: str,
        messages: list[dict],
        max_tokens: int = 500,
        temperature: float = 0,
        max_retries: int = 3
    ) -> Optional[LLMResponse]:
        
        if self._is_circuit_open(model):
            logger.info(f"Circuit open for {model}, skipping")
            return None
        
        start_time = time.time()
        
        for attempt in range(max_retries):
            try:
                response = self.openai_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30  # never wait more than 30s
                )
                
                usage = response.usage
                latency_ms = (time.time() - start_time) * 1000
                
                self._record_success(model)
                self.rate_budget.record(usage.total_tokens)
                
                return LLMResponse(
                    content=response.choices[0].message.content,
                    model=model,
                    provider="openai",
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    latency_ms=latency_ms,
                    retry_count=attempt
                )
            
            except openai.RateLimitError as e:
                # Check Retry-After header
                retry_after = float(e.response.headers.get("Retry-After", 0)) if hasattr(e, 'response') else 0
                wait = max(retry_after, 2 ** attempt + random.uniform(0, 1))
                
                logger.warning(f"Rate limit on {model}, attempt {attempt+1}/{max_retries}, waiting {wait:.1f}s")
                
                if attempt < max_retries - 1:
                    time.sleep(wait)
                else:
                    self._record_failure(model)
                    logger.error(f"Rate limit exhausted retries for {model}")
                    return None
            
            except openai.APITimeoutError:
                wait = 2 ** attempt + random.uniform(0, 1)
                logger.warning(f"Timeout on {model}, attempt {attempt+1}/{max_retries}, waiting {wait:.1f}s")
                
                if attempt < max_retries - 1:
                    time.sleep(wait)
                else:
                    self._record_failure(model)
                    return None
            
            except openai.InternalServerError:
                wait = 2 ** attempt + random.uniform(0, 1)
                logger.warning(f"OpenAI 500 on {model}, attempt {attempt+1}/{max_retries}")
                
                if attempt < max_retries - 1:
                    time.sleep(wait)
                else:
                    self._record_failure(model)
                    return None
            
            except openai.BadRequestError as e:
                # Don't retry — the request itself is invalid
                logger.error(f"Bad request on {model}: {e}")
                return None
            
            except openai.AuthenticationError:
                # Critical — alert immediately, do not retry
                logger.critical("OpenAI authentication failed — check API key")
                raise  # Propagate — this needs immediate human attention
        
        return None
    
    def _call_anthropic_with_retry(
        self,
        messages: list[dict],
        system_prompt: str,
        max_tokens: int = 500,
        max_retries: int = 2
    ) -> Optional[LLMResponse]:
        
        if not self.anthropic_client:
            return None
        
        # Convert OpenAI message format to Anthropic format
        anthropic_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] != "system"  # system handled separately in Anthropic API
        ]
        
        start_time = time.time()
        
        for attempt in range(max_retries):
            try:
                response = self.anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=max_tokens,
                    system=system_prompt,
                    messages=anthropic_messages
                )
                
                latency_ms = (time.time() - start_time) * 1000
                
                return LLMResponse(
                    content=response.content[0].text,
                    model="claude-haiku-4-5-20251001",
                    provider="anthropic",
                    prompt_tokens=response.usage.input_tokens,
                    completion_tokens=response.usage.output_tokens,
                    latency_ms=latency_ms,
                    retry_count=attempt,
                    fallback_used=True
                )
            
            except anthropic.RateLimitError:
                wait = 2 ** attempt + random.uniform(0, 1)
                if attempt < max_retries - 1:
                    time.sleep(wait)
                else:
                    return None
            
            except Exception as e:
                logger.error(f"Anthropic error: {e}")
                return None
        
        return None
    
    def complete(
        self,
        messages: list[dict],
        max_tokens: int = 500,
        temperature: float = 0,
        require_fast: bool = False
    ) -> LLMResponse:
        """
        Full fallback chain:
        1. GPT-4o (best quality, highest cost)
        2. GPT-4o-mini (faster, cheaper)
        3. Claude Haiku (different provider, different limits)
        
        require_fast=True: skip GPT-4o, go straight to mini
        """
        
        system_prompt = next(
            (m["content"] for m in messages if m["role"] == "system"),
            "You are a helpful assistant."
        )
        
        # Model cascade
        primary_model = "gpt-4o-mini" if require_fast else "gpt-4o"
        fallback_model = "gpt-4o-mini"
        
        # Proactive rate limit check
        estimated_tokens = sum(len(m["content"].split()) * 1.3 for m in messages) + max_tokens
        if not self.rate_budget.can_proceed(estimated_tokens):
            logger.warning("TPM budget exceeded — falling back to mini immediately")
            primary_model = "gpt-4o-mini"
        
        # Try primary
        result = self._call_openai_with_retry(primary_model, messages, max_tokens, temperature)
        if result:
            return result
        
        # Try fallback OpenAI model
        if primary_model != fallback_model:
            logger.info(f"Falling back from {primary_model} to {fallback_model}")
            result = self._call_openai_with_retry(fallback_model, messages, max_tokens, temperature)
            if result:
                result.fallback_used = True
                return result
        
        # Try Anthropic as provider fallback
        logger.info("Both OpenAI models failed — trying Anthropic")
        result = self._call_anthropic_with_retry(messages, system_prompt, max_tokens)
        if result:
            return result
        
        # All providers failed
        raise RuntimeError("All LLM providers failed — check logs for root cause")
    

# Usage
client = LLMClientWithFallback(
    openai_api_key="sk-...",
    anthropic_api_key="sk-ant-..."
)

def call_llm(system_prompt: str, user_message: str, max_tokens: int = 500) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    response = client.complete(messages, max_tokens=max_tokens)
    
    if response.fallback_used:
        logger.info(f"Fallback used: {response.provider}/{response.model}")
    
    return response.content
```

---

## 5. Example (From Your Projects)

**LangChain Service — direct OpenAI wrapper:**

The LangChain service uses `ChatOpenAI` which has basic retry built in. For production, I replace this with direct OpenAI calls wrapped in the above pattern.

Key difference: `ChatOpenAI` retries on 500 errors but does NOT fallback to a different model or provider. The custom wrapper gives full control over the fallback chain.

**AstroIntel — 5 parallel agents:**

AstroIntel makes 5-6 concurrent LLM calls per analysis. Each parallel agent call goes through the LLM client. With 5 concurrent calls, TPM burn rate is 5x the single-call rate. The `RateLimitBudget` tracker proactively detects when approaching the TPM limit and routes to `gpt-4o-mini` before getting a 429 — preventing a retry cascade across all 5 parallel calls simultaneously.

In interview: "AstroIntel runs 5 parallel LLM calls per user request. Without proactive rate limit management, one user could trigger a thundering-herd of 429 retries. I track token usage per minute and route to the cheaper model before hitting the limit. The Anthropic fallback is the last resort for when OpenAI has broader outages — rare but it happened once during a peak event."

---

## 6. Trade-offs

No retry logic:
+ Simpler code, fast failure detection
- 30% of transient errors would become user-visible failures

Naive retry (fixed delay):
+ Simple to implement
- Synchronized retries create thundering herd, worsens rate limit issues

Exponential backoff with jitter:
+ Spreads retries, avoids thundering herd
- Adds latency proportional to retry count

Provider fallback (OpenAI → Anthropic):
+ Survives OpenAI outages
- Different model behavior — output format may differ, requires testing
- Added cost of maintaining Anthropic account and API key management

Circuit breaker:
+ Prevents retry storms during extended outages, fast-fails to fallback
- Circuit state must be shared across instances in multi-process deployment (use Redis)

---

## 7. Interview Questions (Senior Level)

- What is the difference between RPM and TPM rate limits and which do you hit first at scale?
- How does your Resilience4j experience map to LLM API resilience patterns?
- What errors should NOT be retried and why?
- How do you implement provider fallback between OpenAI and Anthropic?
- How do you share circuit breaker state across multiple FastAPI worker processes?

---

## 8. Answer Framework

Step 1 — Classify errors:
"I classify LLM errors into retryable (429, 500, timeout) and non-retryable (400 bad request, 401 auth). Retrying a 400 wastes time — fix the request. Retrying a 429 with backoff is expected."

Step 2 — Retry strategy:
"Exponential backoff with jitter: wait = 2^attempt + random(0, 1). Jitter prevents synchronized retry storms when multiple requests hit the rate limit simultaneously. Same as Resilience4j's exponential backoff configuration."

Step 3 — Fallback chain:
"GPT-4o → GPT-4o-mini → Claude Haiku. Each step is cheaper and faster. The Anthropic fallback handles OpenAI infrastructure outages. I have tested the output format of each model to ensure downstream parsing handles both."

Step 4 — Circuit breaker:
"After 5 consecutive failures, open the circuit for 60 seconds. During open state, skip the failing model and go directly to fallback. This is Resilience4j's CircuitBreaker pattern applied to HTTP calls — same concept."

Step 5 — Proactive rate limit:
"I track tokens per minute in a sliding window and route to the cheaper model before hitting the limit. This avoids the retry latency penalty entirely by predicting the limit breach instead of reacting to it."

---

## 10. Advanced Follow-ups

Q1: How do you handle the OpenAI context window limit in a retry scenario?

Answer:
Context length errors (BadRequestError with "context_length_exceeded" message) should not be retried with the same input — the request will fail again.
Three strategies:
First, truncate messages: remove oldest messages from the conversation history until the input fits. This is the sliding window pattern from Module 2.
Second, compress history: summarize the conversation history into a shorter string, replace the detailed history with the summary.
Third, switch model: GPT-4o has 128K context vs GPT-4o-mini's 128K — same limit, so switching models doesn't help for context. Consider Claude 3 Opus (200K context) for genuinely long documents.
Detection:
```python
except openai.BadRequestError as e:
    if "context_length_exceeded" in str(e):
        # Truncate messages and retry
        messages = truncate_messages_to_fit(messages, target_tokens=120_000)
        return self._call_openai_with_retry(model, messages, max_tokens)
    else:
        raise  # Other bad request errors should not be retried
```

Q2: How do you distribute circuit breaker state across multiple FastAPI worker processes?

Answer:
In-process circuit breaker state (like the dict-based implementation above) is per-process — each Uvicorn worker has its own circuit state. One worker may have the circuit open while another doesn't.
For production: store circuit breaker state in Redis.
```python
import redis

class RedisCircuitBreaker:
    def __init__(self, redis_client: redis.Redis, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.redis = redis_client
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
    
    def record_failure(self, model: str):
        key = f"circuit:{model}:failures"
        count = self.redis.incr(key)
        self.redis.expire(key, 120)  # reset count after 2 minutes
        
        if count >= self.failure_threshold:
            self.redis.setex(f"circuit:{model}:open", self.recovery_timeout, "1")
    
    def is_open(self, model: str) -> bool:
        return bool(self.redis.get(f"circuit:{model}:open"))
```
All FastAPI workers share the same Redis circuit state. When one worker trips the circuit breaker, all workers see the open state immediately. This is equivalent to Resilience4j's distributed circuit breaker using Spring Cloud.

Q3: How do you test LLM resilience code without burning actual API tokens?

Answer:
Mock the OpenAI client in unit tests. The key is to test the retry and fallback logic, not the LLM output quality.
```python
from unittest.mock import MagicMock, patch
import pytest

def test_fallback_to_mini_on_rate_limit():
    mock_client = MagicMock()
    
    # GPT-4o raises rate limit, gpt-4o-mini succeeds
    def mock_create(**kwargs):
        if kwargs["model"] == "gpt-4o":
            raise openai.RateLimitError("Rate limit exceeded", response=MagicMock(), body={})
        return MagicMock(
            choices=[MagicMock(message=MagicMock(content="test response"))],
            usage=MagicMock(total_tokens=100, prompt_tokens=80, completion_tokens=20)
        )
    
    mock_client.chat.completions.create.side_effect = mock_create
    
    client = LLMClientWithFallback.__new__(LLMClientWithFallback)
    client.openai_client = mock_client
    client._failure_counts = {}
    client._circuit_open_until = {}
    client.rate_budget = RateLimitBudget()
    
    result = client._call_openai_with_retry("gpt-4o-mini", [...], max_tokens=100)
    assert result is not None
    assert result.model == "gpt-4o-mini"
```
Unit test the retry logic, the circuit breaker state transitions, and the fallback chain. For integration: use the OpenAI test mode or a local model (Ollama) as a drop-in for smoke tests.
