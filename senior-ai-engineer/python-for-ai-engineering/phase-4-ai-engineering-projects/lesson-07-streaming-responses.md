# Python for AI Engineering — Phase 4
# Lesson 7: Streaming Responses — Token Streaming, Generators, Async Streaming APIs

---

## 1. Intuition (Java Anchor)

Java: `WebClient` with `Flux<String>` for reactive streaming, or `HttpServletResponse.getWriter().write()` for SSE.
Python: `yield` in a generator function — much simpler syntax, same concept.

The core idea: instead of waiting for the entire LLM response (5–30 seconds), send each token as it arrives — users see the answer appear in real time.

| Java Pattern | Python Streaming Equivalent |
|---|---|
| `Flux<String>` (WebFlux) | `AsyncGenerator[str, None]` |
| `ServerSentEventHttpMessageConverter` | FastAPI `StreamingResponse` with `text/event-stream` |
| `HttpServletResponse.getWriter().flush()` | `yield f"data: {token}\n\n"` |
| `Publisher.subscribe(onNext, onError)` | `async for token in stream_generator()` |
| `Flux.fromIterable(list)` | `async for chunk in openai_stream` |
| `WebClient.retrieve().bodyToFlux()` | `client.chat.completions.create(stream=True)` |
| `BlockingQueue` consumer pattern | `async for` consuming an async generator |

---

## 2. Sync Streaming — Basic Pattern

```python
from openai import OpenAI

client = OpenAI()

# stream=True returns a stream object, not a completed ChatCompletion
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain RAG in 3 sentences."}],
    stream=True,
)

# Each chunk has a delta (the new token), not the full message:
for chunk in stream:
    token = chunk.choices[0].delta.content   # None for the last chunk
    if token is not None:
        print(token, end="", flush=True)     # print without newline, flush immediately

# Collect full response (when you need both streaming + final text):
def stream_and_collect(prompt: str) -> tuple[str, int]:
    """Stream to console and return (full_text, token_count)."""
    full_text = []
    total_tokens = 0

    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        stream_options={"include_usage": True},   # request token count in stream
    )
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            token = chunk.choices[0].delta.content
            full_text.append(token)
            print(token, end="", flush=True)
        if chunk.usage:
            total_tokens = chunk.usage.total_tokens

    return "".join(full_text), total_tokens
```

---

## 3. Sync Generator — Reusable Streaming Function

```python
from typing import Iterator
from openai import OpenAI

client = OpenAI()

def stream_tokens(prompt: str, system: str = "", model: str = "gpt-4o") -> Iterator[str]:
    """
    Generator that yields tokens one by one.
    Java: Iterable<String> — iterate over tokens with for-each.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )
    for chunk in stream:
        token = chunk.choices[0].delta.content
        if token is not None:
            yield token   # each yield suspends and returns one token

# Consumer — call the generator with a for loop:
for token in stream_tokens("Write a job description for Python developer"):
    print(token, end="", flush=True)

# Collect into full string (Java: Collectors.joining()):
full_response = "".join(stream_tokens("Summarize this CV: ..."))

# Pipeline — transform tokens before yielding (Java: Flux.map()):
def stream_uppercase(prompt: str) -> Iterator[str]:
    for token in stream_tokens(prompt):
        yield token.upper()
```

---

## 4. Async Generator — For FastAPI

```python
from typing import AsyncIterator
from openai import AsyncOpenAI
import asyncio

async_client = AsyncOpenAI()

async def stream_tokens_async(
    prompt: str,
    system: str = "",
    model: str = "gpt-4o",
) -> AsyncIterator[str]:
    """
    Async generator — use inside async functions and FastAPI endpoints.
    Java: Flux<String> from WebFlux reactive pipeline.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    stream = await async_client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token is not None:
            yield token

# Consuming async generator:
async def collect_stream(prompt: str) -> str:
    tokens = []
    async for token in stream_tokens_async(prompt):
        tokens.append(token)
    return "".join(tokens)

# Or with list comprehension:
async def collect_stream_v2(prompt: str) -> str:
    return "".join([t async for t in stream_tokens_async(prompt)])
```

---

## 5. FastAPI SSE Endpoint (Server-Sent Events)

```python
# SSE = Server-Sent Events — HTTP response that stays open and pushes text chunks
# Browser JavaScript EventSource API reads it automatically
# Java: Spring WebFlux @GetMapping + Flux<ServerSentEvent<String>>

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.get("/stream")
async def stream_endpoint(prompt: str) -> StreamingResponse:
    """
    SSE endpoint — streams LLM tokens to the browser in real time.
    Java: @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    """
    async def event_stream():
        async for token in stream_tokens_async(prompt):
            # SSE format: "data: <content>\n\n"
            # The double newline signals end of one event
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"   # signal completion — browser checks for this

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering — critical for SSE
        },
    )

# Angular client reads SSE with EventSource:
# const source = new EventSource('/stream?prompt=...');
# source.onmessage = (e) => { if (e.data !== '[DONE]') appendToken(e.data); }

# POST endpoint for longer prompts (GET has URL length limits):
@app.post("/stream")
async def stream_post(request: CVAnalysisRequest) -> StreamingResponse:
    async def event_stream():
        system = "You are a recruiter. Analyze the CV for the given role."
        prompt = f"Role: {request.target_role}\nCV: {request.cv_text}"
        async for token in stream_tokens_async(prompt, system=system):
            # Escape newlines in token — SSE uses \n\n as delimiter
            safe_token = token.replace("\n", "\\n")
            yield f"data: {safe_token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 6. Streaming with Error Handling

```python
from openai import AsyncOpenAI, APITimeoutError, RateLimitError
import logging

logger = logging.getLogger(__name__)
async_client = AsyncOpenAI()

async def stream_with_error_handling(prompt: str) -> AsyncIterator[str]:
    """Stream tokens with graceful error recovery."""
    try:
        stream = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            timeout=60.0,
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token is not None:
                yield token

    except RateLimitError:
        logger.warning("Rate limit during streaming")
        yield "\n\n[Rate limit reached — please retry in a moment]"

    except APITimeoutError:
        logger.warning("Timeout during streaming")
        yield "\n\n[Response timed out — the answer may be incomplete]"

    except Exception as e:
        logger.error("Unexpected streaming error: %s", e)
        yield "\n\n[An error occurred]"

# FastAPI SSE with error handling:
@app.get("/stream-safe")
async def safe_stream(prompt: str) -> StreamingResponse:
    async def event_stream():
        async for token in stream_with_error_handling(prompt):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 7. Streaming with Accumulation — Partial Results

```python
# Use case: stream to UI while also accumulating for post-processing (save to DB, log)

from openai import AsyncOpenAI
from typing import AsyncIterator
import time

async_client = AsyncOpenAI()

async def stream_and_save(
    prompt: str,
    user_id: str,
) -> AsyncIterator[str]:
    """Stream tokens to caller while accumulating full response for storage."""
    accumulated = []
    start = time.perf_counter()

    stream = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token is not None:
            accumulated.append(token)
            yield token   # send to UI immediately

    # After streaming completes — save full response:
    full_response = "".join(accumulated)
    elapsed_ms = (time.perf_counter() - start) * 1000

    await save_response_to_db(
        user_id=user_id,
        prompt=prompt,
        response=full_response,
        elapsed_ms=elapsed_ms,
    )

# FastAPI endpoint that streams + saves:
@app.post("/analyze/stream")
async def analyze_stream(
    request: CVAnalysisRequest,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    async def event_stream():
        async for token in stream_and_save(request.cv_text, current_user["sub"]):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 8. Interview Anchor

**"How do you implement LLM response streaming in a FastAPI service?"**

Say:
> "Three layers. First, the OpenAI SDK: `create(..., stream=True)` returns a stream object; I iterate it with `async for chunk in stream` and yield `chunk.choices[0].delta.content` — each iteration gives one token. Second, an async generator function wraps the iteration and yields tokens — this separates the streaming logic from the HTTP layer. Third, FastAPI's `StreamingResponse` consumes that generator and writes SSE-formatted events: `data: {token}\n\n` for each token, then `data: [DONE]\n\n` at the end — the double newline is the SSE event delimiter. The browser reads it with the native `EventSource` API. Two production details: set `X-Accel-Buffering: no` in the response headers so Nginx doesn't buffer the stream, and accumulate tokens in the generator so you can save the full response to the database after streaming completes — you get real-time UX and a complete audit log."

---

## 9. Quick Reference

```python
from openai import OpenAI, AsyncOpenAI
from fastapi.responses import StreamingResponse
from typing import Iterator, AsyncIterator

# Sync streaming
stream = client.chat.completions.create(model=..., messages=..., stream=True)
for chunk in stream:
    token = chunk.choices[0].delta.content   # None on last chunk
    if token: print(token, end="", flush=True)

# Sync generator
def stream_tokens(prompt: str) -> Iterator[str]:
    for chunk in client.chat.completions.create(..., stream=True):
        t = chunk.choices[0].delta.content
        if t: yield t

# Collect sync
full = "".join(stream_tokens(prompt))

# Async generator
async def stream_tokens_async(prompt: str) -> AsyncIterator[str]:
    async for chunk in (await async_client.chat.completions.create(..., stream=True)):
        t = chunk.choices[0].delta.content
        if t: yield t

# Collect async
full = "".join([t async for t in stream_tokens_async(prompt)])

# FastAPI SSE
@app.get("/stream")
async def endpoint(prompt: str) -> StreamingResponse:
    async def events():
        async for t in stream_tokens_async(prompt):
            yield f"data: {t}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no"})

# Java comparison
# Iterator[str]            → Iterable<String>
# AsyncIterator[str]       → Flux<String> (WebFlux)
# yield token              → emitter.next(token)
# StreamingResponse(gen)   → return ResponseEntity with Flux body
# text/event-stream        → MediaType.TEXT_EVENT_STREAM_VALUE
# async for chunk in stream → publisher.subscribe(onNext -> ...)
# data: [DONE]\n\n         → completion signal in SSE protocol
```
