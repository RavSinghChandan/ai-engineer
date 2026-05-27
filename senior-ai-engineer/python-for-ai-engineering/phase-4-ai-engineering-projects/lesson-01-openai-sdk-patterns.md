# Python for AI Engineering — Phase 4
# Lesson 1: OpenAI SDK Patterns

---

## 1. Intuition (Java Anchor)

Java Spring has `RestTemplate` / `WebClient` for calling external APIs.
The OpenAI Python SDK wraps HTTP into a typed client — like a Feign client with auto-retry, streaming support, and typed response objects.

As a senior AI engineer you don't call the OpenAI REST API raw with httpx — you use the SDK. But you must understand what it does underneath so you can debug it, mock it in tests, and swap providers.

| Java Pattern | OpenAI SDK Equivalent |
|---|---|
| `new RestTemplate()` | `openai.OpenAI(api_key=...)` |
| `restTemplate.postForObject(url, body, Cls)` | `client.chat.completions.create(...)` |
| `WebClient` streaming | `client.chat.completions.create(..., stream=True)` |
| Feign client interface | `openai.OpenAI` client class |
| `@Retryable` | `client = openai.OpenAI(max_retries=3)` |
| `@CircuitBreaker` | Manual with tenacity / custom logic |

---

## 2. Client Initialization

```python
from openai import OpenAI, AsyncOpenAI
import os

# Sync client — for standard FastAPI endpoints or scripts
client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],   # never hardcode
    max_retries=3,                           # built-in retry on 429/500
    timeout=60.0,                            # seconds
)

# Async client — for async FastAPI endpoints (use this in production)
async_client = AsyncOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    max_retries=3,
    timeout=60.0,
)

# Custom base URL — for DeepSeek, Azure OpenAI, local Ollama:
deepseek_client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",    # same SDK, different provider
)

# Module-level singleton (like Java Spring @Bean singleton):
_client: OpenAI | None = None

def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client
```

---

## 3. Chat Completions — Core Pattern

```python
from openai import OpenAI

client = OpenAI()

# Basic call (Java: restTemplate.postForObject with JSON body):
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a senior AI engineer assistant."},
        {"role": "user",   "content": "What is RAG?"},
    ],
    temperature=0.2,
    max_tokens=500,
)

# Extract the response text:
answer = response.choices[0].message.content
print(answer)

# Token usage — critical for cost tracking:
print(response.usage.prompt_tokens)      # tokens in input
print(response.usage.completion_tokens)  # tokens in output
print(response.usage.total_tokens)       # total

# Response model is a Pydantic-like object — not a raw dict:
print(type(response))           # ChatCompletion
print(type(response.choices))  # list[Choice]
print(response.model)          # "gpt-4o"
print(response.id)             # "chatcmpl-abc123"
```

---

## 4. Async Pattern (Use in FastAPI)

```python
from openai import AsyncOpenAI
import asyncio

async_client = AsyncOpenAI()

async def call_llm(prompt: str, system: str = "") -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.2,
        max_tokens=500,
    )
    return response.choices[0].message.content

# FastAPI endpoint — async all the way:
@app.post("/ask")
async def ask(query: str) -> dict:
    answer = await call_llm(query, system="Answer concisely.")
    return {"answer": answer}
```

---

## 5. Structured Output — JSON Mode

```python
import json

# Force LLM to return valid JSON:
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "Return JSON only. No markdown."},
        {"role": "user",   "content": f"Extract skills from: {cv_text}"},
    ],
    response_format={"type": "json_object"},   # guarantees valid JSON output
    temperature=0.0,    # deterministic — important for structured output
)

raw_json = response.choices[0].message.content
data = json.loads(raw_json)

# With Pydantic validation on top:
from pydantic import BaseModel

class CVSkills(BaseModel):
    name: str
    skills: list[str]
    experience_years: int

parsed = CVSkills.model_validate_json(raw_json)

# OpenAI also supports structured_outputs with Pydantic (newer API):
response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": f"Extract from: {cv_text}"}],
    response_format=CVSkills,   # Pydantic model directly
)
result: CVSkills = response.choices[0].message.parsed   # already parsed
```

---

## 6. Streaming — Token by Token

```python
from openai import OpenAI

client = OpenAI()

# Sync streaming generator:
def stream_response(prompt: str):
    """Yields tokens as they arrive — use for real-time UI updates."""
    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True,    # enables streaming
    )
    for chunk in stream:
        token = chunk.choices[0].delta.content
        if token is not None:
            yield token

# Async streaming (for FastAPI SSE):
async def stream_response_async(prompt: str):
    stream = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token is not None:
            yield token

# FastAPI SSE endpoint:
from fastapi.responses import StreamingResponse

@app.get("/stream")
async def stream_endpoint(prompt: str):
    async def event_stream():
        async for token in stream_response_async(prompt):
            yield f"data: {token}\n\n"   # SSE format
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 7. Embeddings

```python
# Get vector embedding for text — used for semantic search, RAG

response = client.embeddings.create(
    model="text-embedding-3-small",
    input="Senior Python developer with FastAPI experience",
)

embedding = response.data[0].embedding      # list of 1536 floats
print(len(embedding))                        # 1536 dimensions

# Batch embedding — multiple texts in one call (100x cheaper than one-by-one):
texts = ["Python developer", "Java developer", "DevOps engineer"]
response = client.embeddings.create(
    model="text-embedding-3-small",
    input=texts,                             # pass list directly
)

# Response data is ordered by index:
embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]

# Convert to numpy for FAISS:
import numpy as np
embedding_matrix = np.array(embeddings, dtype=np.float32)
print(embedding_matrix.shape)   # (3, 1536)
```

---

## 8. Retry and Error Handling

```python
from openai import OpenAI, RateLimitError, APITimeoutError, APIConnectionError
import time

client = OpenAI(max_retries=3)  # SDK handles 429 and 500 automatically

# For custom retry logic on top:
def call_with_backoff(prompt: str, max_attempts: int = 5) -> str:
    for attempt in range(max_attempts):
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                timeout=30,
            )
            return response.choices[0].message.content

        except RateLimitError:
            wait = 2 ** attempt   # 1s, 2s, 4s, 8s, 16s
            print(f"Rate limited — waiting {wait}s (attempt {attempt+1})")
            time.sleep(wait)

        except APITimeoutError:
            if attempt == max_attempts - 1:
                raise
            time.sleep(2)

        except APIConnectionError as e:
            raise RuntimeError(f"Cannot reach OpenAI API: {e}") from e

    raise RuntimeError("Max retries exhausted")

# Key error types to handle:
# RateLimitError    — 429, too many requests
# APITimeoutError   — request took too long
# APIConnectionError — network issue
# BadRequestError   — 400, invalid request (don't retry)
# AuthenticationError — 401, bad API key (don't retry)
```

---

## 9. Provider Abstraction (Same SDK for Multiple Providers)

```python
# DeepSeek, Azure OpenAI, Groq — all work with the OpenAI SDK via base_url:

from openai import OpenAI

def make_client(provider: str) -> OpenAI:
    if provider == "openai":
        return OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    elif provider == "deepseek":
        return OpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com",
        )

    elif provider == "azure":
        from openai import AzureOpenAI
        return AzureOpenAI(
            api_key=os.environ["AZURE_OPENAI_KEY"],
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_version="2024-02-01",
        )

    elif provider == "local":
        return OpenAI(
            api_key="ollama",                # dummy key for local
            base_url="http://localhost:11434/v1",
        )

    raise ValueError(f"Unknown provider: {provider}")

# Usage:
client = make_client(os.getenv("LLM_PROVIDER", "deepseek"))
response = client.chat.completions.create(
    model=os.getenv("LLM_MODEL", "deepseek-chat"),
    messages=[{"role": "user", "content": prompt}],
)
```

---

## 10. Production Pattern — LLM Service Class

```python
from openai import AsyncOpenAI
from pydantic import BaseModel
import os, json, time, logging

logger = logging.getLogger(__name__)

class LLMService:
    """Production LLM service — async, structured output, token tracking."""

    def __init__(self):
        self._client = AsyncOpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            max_retries=3,
            timeout=60.0,
        )
        self._model = os.environ.get("LLM_MODEL", "deepseek-chat")
        self._total_tokens = 0

    async def complete(self, prompt: str, system: str = "", temperature: float = 0.2) -> str:
        start = time.perf_counter()
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    *([{"role": "system", "content": system}] if system else []),
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
            )
            self._total_tokens += response.usage.total_tokens
            elapsed = (time.perf_counter() - start) * 1000
            logger.info(f"LLM | tokens={response.usage.total_tokens} | {elapsed:.0f}ms")
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM error: {e}")
            raise

    async def complete_json(self, prompt: str, schema: type[BaseModel]) -> BaseModel:
        raw = await self.complete(
            prompt,
            system=f"Return JSON only matching this schema: {schema.model_json_schema()}",
            temperature=0.0,
        )
        return schema.model_validate_json(raw)

    @property
    def total_tokens_used(self) -> int:
        return self._total_tokens
```

---

## 11. Interview Anchor

**"How do you structure OpenAI SDK usage in a production Python AI service?"**

Say:
> "Three principles. First, a singleton async client initialized at startup with `max_retries=3` and explicit `timeout` — never create a new client per request. Second, always use `response_format=json_object` or `beta.chat.completions.parse` with a Pydantic model for structured output — this eliminates the class of bugs where the LLM returns a slightly different JSON shape and breaks downstream code. Third, token tracking on every call — I log `usage.total_tokens`, latency, and model name as structured JSON so I can alert when cost-per-query doubles. For streaming I use async generators with FastAPI `StreamingResponse` — same pattern as Spring WebFlux reactive streaming but much simpler syntax."

---

## 12. Quick Reference

```python
from openai import OpenAI, AsyncOpenAI

# Client
client = OpenAI(api_key=key, max_retries=3, timeout=60.0)
client = OpenAI(api_key=key, base_url="https://api.deepseek.com")  # other provider

# Chat completion
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}],
    temperature=0.2,
    max_tokens=500,
    response_format={"type": "json_object"},  # force JSON
)
text   = response.choices[0].message.content
tokens = response.usage.total_tokens

# Async
response = await async_client.chat.completions.create(...)

# Streaming
stream = client.chat.completions.create(..., stream=True)
for chunk in stream:
    token = chunk.choices[0].delta.content

# Embeddings
resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
vecs = [d.embedding for d in resp.data]

# Error types
from openai import RateLimitError, APITimeoutError, BadRequestError

# Java comparison
# OpenAI(api_key=...)     → new RestTemplate() / @FeignClient
# .create(messages=...)   → restTemplate.postForObject()
# max_retries=3           → @Retryable(maxAttempts=3)
# stream=True             → WebClient SSE / Flux<String>
# response.usage          → no Java equiv — must parse manually from raw HTTP
```
