# Python for AI Engineering — Phase 2
# Lesson 3: Async Python

---

## 1. Intuition (Java Anchor)

Java concurrency: `Thread`, `ExecutorService`, `CompletableFuture`, `Future<T>`.
Python async: `async/await`, `asyncio` event loop.

| Java | Python |
|---|---|
| `CompletableFuture<T>` | `asyncio.Task` / coroutine |
| `CompletableFuture.supplyAsync()` | `asyncio.create_task()` |
| `CompletableFuture.allOf()` | `asyncio.gather()` |
| `ExecutorService` | `asyncio` event loop |
| `Thread` | `asyncio.Task` (lightweight, not OS thread) |
| `synchronized` | `asyncio.Lock()` |
| `Semaphore` | `asyncio.Semaphore` |

**Key mental shift:** Java concurrency is multi-threaded (parallel CPU).
Python asyncio is **single-threaded cooperative concurrency** — while one coroutine waits for I/O (LLM API, DB, HTTP), another runs. Perfect for AI engineering where most time is spent waiting for LLM responses.

---

## 2. `async def` and `await` (Java: `CompletableFuture`)

```python
import asyncio

# Java:
# CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> callLLM(prompt));
# String result = future.get();  // blocks

# Python:
async def call_llm(prompt: str) -> str:
    # 'async def' makes this a coroutine — doesn't run until awaited
    response = await llm_client.invoke_async(prompt)   # yields control while waiting
    return response.content

# To run a coroutine — need an event loop:
async def main():
    result = await call_llm("What is RAG?")
    print(result)

asyncio.run(main())   # creates event loop, runs coroutine, closes loop

# await = "pause here, let other coroutines run, resume when I/O completes"
# Like Java: future.thenApply() but synchronous-looking code
```

---

## 3. Why Async for AI Engineering

```python
# Without async — sequential (bad):
def process_all_queries_sync(queries: list[str]) -> list[str]:
    results = []
    for query in queries:
        result = call_llm_sync(query)   # waits 1-3s each — SEQUENTIAL
        results.append(result)
    return results
# 10 queries × 2s each = 20s total wall time

# With async — concurrent (good):
async def process_all_queries_async(queries: list[str]) -> list[str]:
    tasks = [call_llm_async(query) for query in queries]
    return await asyncio.gather(*tasks)   # all run concurrently
# 10 queries × 2s each = ~2s total wall time (limited by slowest)
```

---

## 4. `asyncio.gather` (Java: `CompletableFuture.allOf`)

```python
# Java: CompletableFuture.allOf(f1, f2, f3).thenApply(...)
# Python: asyncio.gather — run multiple coroutines concurrently, collect all results

async def parallel_llm_calls():
    # All three calls start at the same time — don't wait for each other
    summary, keywords, sentiment = await asyncio.gather(
        summarize(text),       # coroutine 1
        extract_keywords(text), # coroutine 2
        analyze_sentiment(text), # coroutine 3
    )
    return summary, keywords, sentiment

# With error handling — return_exceptions=True:
results = await asyncio.gather(
    call_llm(q1),
    call_llm(q2),
    call_llm(q3),
    return_exceptions=True,    # don't raise on individual failure — return Exception object
)
# results = ["answer1", Exception("timeout"), "answer3"]
for r in results:
    if isinstance(r, Exception):
        handle_error(r)
    else:
        process(r)
```

---

## 5. `asyncio.create_task` (Java: `ExecutorService.submit`)

```python
# gather waits for all to complete
# create_task starts a task in the background — you can do other work while it runs

async def pipeline_with_background_task(query: str):
    # Start logging in background — don't wait for it
    log_task = asyncio.create_task(log_to_db(query))   # starts immediately

    # Do the main work while logging runs concurrently:
    chunks = await retrieve(query)
    response = await generate(chunks, query)

    # Now wait for the background task to finish:
    await log_task

    return response

# Java: Future<Void> logFuture = executor.submit(() -> logToDb(query));
#       ... main work ...
#       logFuture.get();  // wait
```

---

## 6. `asyncio.Semaphore` — Rate Limiting (Java: Semaphore)

```python
# Java: Semaphore sem = new Semaphore(5);
#       sem.acquire(); try { ... } finally { sem.release(); }

# Python: asyncio.Semaphore — limit concurrent LLM calls
async def process_with_rate_limit(queries: list[str], max_concurrent: int = 5):
    semaphore = asyncio.Semaphore(max_concurrent)  # max 5 concurrent LLM calls

    async def bounded_call(query: str) -> str:
        async with semaphore:          # acquire on enter, release on exit
            return await call_llm(query)

    return await asyncio.gather(*[bounded_call(q) for q in queries])

# Why: LLM APIs have rate limits (e.g., 60 RPM)
# Without semaphore: 100 concurrent calls → rate limit error
# With semaphore(5): max 5 running at once → stays within limit
```

---

## 7. Async Context Managers (Java: try-with-resources in async context)

```python
# async with — like 'with' but for async resources

import aiosqlite
import httpx

async def fetch_and_store(url: str, query: str):
    async with httpx.AsyncClient() as client:         # async HTTP session
        async with aiosqlite.connect("app.db") as db: # async DB connection
            response = await client.get(url)
            await db.execute(
                "INSERT INTO results VALUES (?, ?)",
                (query, response.text)
            )
            await db.commit()
    # Both client and db closed automatically — even on exception

# FastAPI uses async by default — all your endpoints should be async:
from fastapi import FastAPI
app = FastAPI()

@app.post("/query")
async def query_endpoint(query: str):           # async endpoint
    result = await rag_service.query(query)     # await the service call
    return {"answer": result}
```

---

## 8. Async Generator — Streaming LLM Responses

```python
# Regular generator: yield
# Async generator: async def + yield (combines async + generator)

async def stream_llm_tokens(prompt: str):
    """Async generator — yields tokens as they arrive from streaming LLM."""
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            json={"model": "gpt-4o", "messages": [...], "stream": True},
            headers={"Authorization": f"Bearer {API_KEY}"},
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    token = data["choices"][0]["delta"].get("content", "")
                    if token:
                        yield token    # yield each token as it arrives

# FastAPI SSE streaming endpoint:
from fastapi.responses import StreamingResponse

@app.get("/stream")
async def stream_response(query: str):
    async def event_stream():
        async for token in stream_llm_tokens(query):
            yield f"data: {token}\n\n"   # SSE format
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 9. Concurrency Patterns in AI Engineering

```python
# Pattern 1: Parallel retrieval from multiple sources
async def hybrid_retrieval(query: str) -> list[dict]:
    """Retrieve from FAISS and BM25 in parallel, merge results."""
    faiss_results, bm25_results = await asyncio.gather(
        faiss_search(query, top_k=10),
        bm25_search(query, top_k=10),
    )
    # Merge and deduplicate
    all_results = faiss_results + bm25_results
    seen = set()
    unique = []
    for r in all_results:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)
    return sorted(unique, key=lambda x: x["score"], reverse=True)[:10]

# Pattern 2: Multi-agent parallel execution (like Bench Resource Optimizer)
async def run_agents_parallel(profile: dict, roles: list[str]) -> list[dict]:
    """Map one profile against multiple roles simultaneously."""
    sem = asyncio.Semaphore(5)   # max 5 concurrent LLM calls

    async def map_single(role: str) -> dict:
        async with sem:
            return await map_role_async(profile, role)

    return await asyncio.gather(*[map_single(r) for r in roles])

# Pattern 3: Timeout per LLM call
async def call_with_timeout(prompt: str, timeout_sec: float = 30.0) -> str:
    try:
        return await asyncio.wait_for(call_llm(prompt), timeout=timeout_sec)
    except asyncio.TimeoutError:
        raise TimeoutError(f"LLM call exceeded {timeout_sec}s budget")
```

---

## 10. Common Async Mistakes (Java Dev Pitfalls)

```python
# Mistake 1: Calling sync blocking code inside async — blocks the event loop
async def bad_endpoint(query: str):
    time.sleep(2)            # BLOCKS the event loop — all other requests wait!
    result = call_llm_sync() # BLOCKS — use call_llm_async() instead

# Fix: use asyncio.sleep for delays, and async libraries for I/O
async def good_endpoint(query: str):
    await asyncio.sleep(2)       # yields control — other coroutines run
    result = await call_llm()    # non-blocking

# Mistake 2: Forgetting await — coroutine never executes
async def bad():
    result = call_llm_async("prompt")   # MISSING await — result is a coroutine object!
    print(result)   # <coroutine object call_llm_async at 0x...>

async def good():
    result = await call_llm_async("prompt")  # correct
    print(result)   # actual response

# Mistake 3: Running asyncio.run() inside another async function
async def outer():
    asyncio.run(inner())   # RuntimeError: cannot run nested event loop
    await inner()          # correct — just await it
```

---

## 11. Interview Anchor

**"How do you handle concurrent LLM calls in a Python AI backend?"**

Say:
> "asyncio with `asyncio.gather`. If I need to run 10 role-mapping LLM calls for one CV upload, I don't run them sequentially — each call takes 1-3 seconds and they're completely independent. I create async tasks for all of them and `gather` collects all results when they finish. Wall time goes from 30 seconds to ~3 seconds. I add an `asyncio.Semaphore` to cap concurrency at 5 — LLM APIs have rate limits, so I don't fire 100 requests at once. For streaming I use async generators — `async for token in stream_llm(prompt): yield token`. This is equivalent to Java's `CompletableFuture.allOf` + reactive streams, but the syntax is synchronous-looking — much easier to reason about."

---

## 12. Quick Reference

```python
# Define a coroutine
async def fn() -> str: ...

# Await a coroutine
result = await fn()

# Run from sync context
asyncio.run(main())

# Parallel execution (Java: CompletableFuture.allOf)
results = await asyncio.gather(fn1(), fn2(), fn3())

# With error handling
results = await asyncio.gather(fn1(), fn2(), return_exceptions=True)

# Background task
task = asyncio.create_task(fn())   # starts now
await task                          # wait later

# Rate limiting
sem = asyncio.Semaphore(5)
async with sem:
    await limited_call()

# Timeout
await asyncio.wait_for(fn(), timeout=30.0)

# Async context manager
async with resource() as r: ...

# Async generator
async def stream():
    yield token

# Consume async generator
async for token in stream(): ...

# Java comparison
# await fn()           → future.get()
# asyncio.gather()     → CompletableFuture.allOf()
# create_task()        → executor.submit()
# Semaphore            → java.util.concurrent.Semaphore
# asyncio.sleep()      → Thread.sleep() but non-blocking
```
