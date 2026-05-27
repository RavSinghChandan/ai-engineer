# Python for AI Engineering — Phase 3
# Lesson 3: HTTP Clients — requests, httpx

---

## 1. Intuition (Java Anchor)

Java: `HttpClient` (Java 11+), `RestTemplate` (Spring), `WebClient` (Spring WebFlux).
Python: `requests` (sync, simple) and `httpx` (sync + async, modern standard).

| Java | Python |
|---|---|
| `HttpClient.newHttpClient()` | `httpx.Client()` |
| `RestTemplate.getForObject(url, type)` | `httpx.get(url).json()` |
| `WebClient` (reactive/async) | `httpx.AsyncClient()` |
| `HttpRequest.BodyPublishers.ofString(json)` | `client.post(url, json=data)` |
| `response.statusCode()` | `response.status_code` |
| `response.body()` | `response.text` / `response.json()` |
| `HttpResponse.BodyHandlers.ofLines()` | `client.stream(...)` |
| Connection pool via `HttpClient` | `httpx.Client()` as context manager |

As an AI engineer you call LLM APIs, embedding APIs, external tools, and internal microservices — all over HTTP. `httpx` is the standard choice because it handles both sync and async with the same API.

---

## 2. `requests` — Simple Sync HTTP (Java: RestTemplate)

```python
import requests

# GET request (Java: restTemplate.getForObject(url, Map.class)):
response = requests.get("https://api.openai.com/v1/models",
                        headers={"Authorization": f"Bearer {API_KEY}"})

print(response.status_code)    # 200
print(response.json())         # dict — parsed JSON body
print(response.text)           # raw string body
print(response.headers)        # response headers dict

# POST with JSON body (Java: restTemplate.postForObject(url, body, type)):
response = requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json={                           # 'json=' auto-sets Content-Type and serializes
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "What is RAG?"}]
    },
    timeout=30,                      # seconds — always set a timeout
)

# Error handling:
response.raise_for_status()          # raises HTTPError for 4xx/5xx — like Java checking status code

# Query parameters:
response = requests.get(
    "https://api.example.com/roles",
    params={"role": "Python Dev", "limit": 10},   # appended as ?role=Python+Dev&limit=10
    headers={"Authorization": f"Bearer {token}"},
)
```

---

## 3. Sessions — Connection Reuse (Java: HttpClient with connection pooling)

```python
# Problem: requests.get() creates a new connection every call — expensive
# Solution: Session reuses connections (TCP connection pooling)
# Java equivalent: HttpClient with connection pool configured

import requests

# Without session — new connection per call (bad for many LLM calls):
for query in queries:
    r = requests.post(url, json={"query": query})   # new connection each time

# With session — connection pool reused:
with requests.Session() as session:
    session.headers.update({
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    })
    for query in queries:
        r = session.post(url, json={"query": query})  # reuses connection
        results.append(r.json())

# Session also lets you set base headers once — no repetition per call
```

---

## 4. `httpx` — Modern Standard (Sync + Async)

```python
import httpx

# Sync — same API as requests but better defaults:
with httpx.Client(timeout=30.0, base_url="https://api.openai.com") as client:
    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
        },
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

# Async — same API, just add 'async' and 'await':
async def call_llm_async(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={"model": "gpt-4o", "messages": [{"role": "user", "content": prompt}]},
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
```

---

## 5. Timeouts (Java: `HttpRequest.timeout()`)

```python
# Java: HttpRequest.newBuilder().timeout(Duration.ofSeconds(30))
# Python: always set timeouts — LLM APIs can hang indefinitely without them

import httpx

# Single timeout (applies to whole request):
client = httpx.Client(timeout=30.0)

# Granular timeout (Java: no built-in equivalent this clean):
timeout = httpx.Timeout(
    connect=5.0,     # connection establishment
    read=60.0,       # reading response (long for streaming LLM)
    write=10.0,      # sending request body
    pool=5.0,        # waiting for a connection from pool
)
client = httpx.Client(timeout=timeout)

# Per-request timeout override:
response = client.get(url, timeout=10.0)

# No timeout (dangerous — never in production):
response = client.get(url, timeout=None)   # can hang forever
```

---

## 6. Retries with httpx (Java: Spring Retry / Resilience4j)

```python
# httpx does not retry by default — you add it manually or with a library

# Option 1: Manual retry with exponential backoff:
import httpx
import time

def post_with_retry(url: str, payload: dict, max_retries: int = 3) -> dict:
    last_exc = None
    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(url, json=payload)
                r.raise_for_status()
                return r.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            last_exc = e
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code in (400, 401, 403):
                raise   # don't retry on auth/bad request errors
            wait = 2 ** attempt
            print(f"Attempt {attempt+1} failed, retrying in {wait}s: {e}")
            time.sleep(wait)
    raise last_exc

# Option 2: httpx + tenacity library (like Resilience4j):
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
def call_api(url: str, payload: dict) -> dict:
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        return r.json()
```

---

## 7. Streaming HTTP Responses (LLM Token Streaming)

```python
# LLM APIs send tokens as they are generated — Server-Sent Events (SSE)
# You must stream the response, not buffer it

import httpx

def stream_llm(prompt: str):
    """Generator — yields tokens as they arrive from OpenAI streaming API."""
    with httpx.Client(timeout=httpx.Timeout(read=120.0)) as client:
        with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
            },
        ) as response:
            for line in response.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    import json
                    data = json.loads(line[6:])
                    token = data["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token

# Async streaming:
async def stream_llm_async(prompt: str):
    async with httpx.AsyncClient(timeout=httpx.Timeout(read=120.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    data = json.loads(line[6:])
                    token = data["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token
```

---

## 8. Calling Internal Microservices (Java: Feign Client / RestTemplate)

```python
# Java Feign: @FeignClient(name = "user-service", url = "${user.service.url}")
# Python: httpx client with base_url — same concept, explicit

class UserServiceClient:
    """HTTP client for the User microservice — like a Java Feign client."""

    def __init__(self, base_url: str, api_key: str):
        self._client = httpx.Client(
            base_url=base_url,
            headers={"X-API-Key": api_key},
            timeout=10.0,
        )

    def get_user(self, user_id: str) -> dict | None:
        try:
            r = self._client.get(f"/users/{user_id}")
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    def update_progress(self, user_id: str, score: float) -> bool:
        r = self._client.patch(
            f"/users/{user_id}/progress",
            json={"readiness_score": score},
        )
        return r.status_code == 200

    def close(self):
        self._client.close()

    def __enter__(self): return self
    def __exit__(self, *_): self.close()
```

---

## 9. AI Engineering Patterns

```python
# Pattern 1: Embedding API call with batching
async def get_embeddings_batch(texts: list[str], api_key: str) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"input": texts, "model": "text-embedding-3-small"},
        )
        response.raise_for_status()
        data = response.json()["data"]
        return [item["embedding"] for item in sorted(data, key=lambda x: x["index"])]

# Pattern 2: Health check for external LLM API
async def check_llm_health(base_url: str, api_key: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            return r.status_code == 200
    except (httpx.TimeoutException, httpx.ConnectError):
        return False

# Pattern 3: Parallel LLM calls to multiple providers
async def call_with_fallback(prompt: str) -> str:
    providers = [
        ("https://api.openai.com", OPENAI_KEY),
        ("https://api.anthropic.com", ANTHROPIC_KEY),
    ]
    for base_url, key in providers:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(f"{base_url}/v1/messages",
                                      headers={"x-api-key": key},
                                      json={"prompt": prompt})
                r.raise_for_status()
                return r.json()["content"]
        except Exception:
            continue
    raise RuntimeError("All LLM providers failed")
```

---

## 10. Interview Anchor

**"How do you call LLM APIs reliably in production Python code?"**

Say:
> "I use `httpx.AsyncClient` — same API as `requests` but supports async, which matters because all my FastAPI endpoints are async. I always set explicit timeouts — a connect timeout of 5 seconds and a read timeout of 60-120 seconds for streaming LLMs. I add retry logic with exponential backoff for transient errors — rate limits and timeouts — but immediately raise for 400/401/403 because retrying those is pointless. For streaming I use `client.stream()` which is httpx's equivalent of Java's reactive `WebClient` — it lets me yield tokens to the frontend as they arrive without buffering the full response. I wrap the client in a context manager so connections are always closed properly."

---

## 11. Quick Reference

```python
import httpx

# Sync GET / POST
with httpx.Client(timeout=30.0, base_url="https://api.x.com") as client:
    r = client.get("/endpoint", headers=headers, params={"k": "v"})
    r = client.post("/endpoint", headers=headers, json={"key": "val"})
    r.raise_for_status()           # raise on 4xx/5xx
    data = r.json()                # parse JSON body
    text = r.text                  # raw string body
    code = r.status_code           # 200, 404, etc.

# Async GET / POST
async with httpx.AsyncClient(timeout=30.0) as client:
    r = await client.get(url, headers=headers)
    r = await client.post(url, json=payload)

# Streaming
with client.stream("POST", url, json=payload) as r:
    for line in r.iter_lines(): ...

async with client.stream("POST", url, json=payload) as r:
    async for line in r.aiter_lines(): ...

# Timeout config
httpx.Timeout(connect=5.0, read=60.0, write=10.0)

# Java comparison
# httpx.Client()         → HttpClient / RestTemplate
# httpx.AsyncClient()    → WebClient (reactive)
# client.stream()        → WebClient streaming / SSE
# raise_for_status()     → check statusCode() manually
# timeout=               → HttpRequest.timeout(Duration.ofSeconds(n))
```
