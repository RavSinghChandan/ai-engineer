# P5 — Interview Cheatsheet
### What to say, what to never say, what catches people out.

← [Back to README](./README.md)

---

## TOP 5 INTERVIEW QUESTIONS — Exact answers

---

### Q1: "How do you implement streaming in a FastAPI LLM endpoint?"

**Say this:**
> "Set stream=True on the AsyncOpenAI call. This makes the SDK return an async stream object instead of a complete response. I iterate it with 'async for chunk in stream' and yield each token wrapped in SSE format — that's 'data: {token}\n\n' — the double newline is the SSE event delimiter. I wrap this generator in FastAPI's StreamingResponse with media_type='text/event-stream'. Two critical headers: Cache-Control: no-cache and X-Accel-Buffering: no — the second one disables Nginx buffering, which would hold all tokens until the response is complete and defeat the purpose of streaming. The frontend reads it with the native EventSource API."

**What they're listening for:** stream=True, async for, SSE format double newline, StreamingResponse, X-Accel-Buffering: no, EventSource

---

### Q2: "How do you handle long-running AI tasks like large PDF ingestion?"

**Say this:**
> "The FastAPI endpoint validates the input, creates a UUID job_id, stores status=pending in Redis — before pushing to the queue so the status endpoint never returns 404 — then calls task.delay() which pushes to Celery and returns immediately without waiting. The endpoint responds with HTTP 202 Accepted and the job_id. A Celery worker in a separate process pulls the job and processes it, updating Redis to processing then success or failed. The frontend polls GET /jobs/{job_id} every few seconds until it sees success or failed. This pattern is Accept → Queue → Worker → Status."

**What they're listening for:** 202 Accepted, task.delay() non-blocking, separate worker process, Redis for status, poll endpoint, retry on failure

---

### Q3: "What's the difference between SSE and WebSocket?"

**Say this:**
> "SSE is unidirectional — server pushes to browser. WebSocket is bidirectional — both sides can send and receive. SSE uses plain HTTP, rides through load balancers and CDNs with no special config, and is natively supported by the browser's EventSource API. WebSocket needs a persistent TCP connection and special proxy configuration. For LLM token streaming, SSE is the right choice — we're only streaming server-to-client. WebSocket makes sense when the client also needs to send messages mid-stream, like interrupting or redirecting the generation."

---

### Q4: "Why does Nginx break streaming and how do you fix it?"

**Say this:**
> "Nginx has a feature called proxy buffering — it accumulates the response body before forwarding it to the client. For regular responses this improves performance. But for SSE streaming, it means Nginx holds all the tokens until the stream is complete, then sends them all at once — defeating the entire purpose. The fix is one header in the FastAPI response: X-Accel-Buffering: no. This tells Nginx to flush each chunk immediately. Without this, streaming looks broken in production even though it works fine in development."

---

### Q5: "Why HTTP 202 instead of 200 for async job submission?"

**Say this:**
> "202 Accepted means 'I received your request and will process it, but the work is not done yet.' 200 OK means 'the work is complete.' Using 202 is semantically correct and signals to the client that they need to poll for completion. Some clients and monitoring tools treat 200 as 'done' and might not check for the result. 202 also communicates intent clearly in code review — anyone reading the endpoint knows it's async."

---

## QUICK-FIRE Q&A

| Question | Answer |
|---|---|
| SSE event format? | `data: {content}\n\n` — double newline terminates each event |
| `[DONE]` signal? | `data: [DONE]\n\n` — tells frontend to close the EventSource |
| Why escape `\n` inside tokens? | A bare newline inside data would terminate the SSE event early |
| What's `task.delay()`? | Celery's way to push a task to the queue asynchronously. Returns immediately. |
| Why set Redis status BEFORE delay()? | So `/status/{job_id}` never returns 404 for a valid job |
| Why sync OpenAI in Celery worker? | Celery is not async-native. Use `openai.OpenAI()` not `AsyncOpenAI` in tasks |
| Job expiry? | `result_expires=3600` in Celery config — results auto-delete after 1 hour |
| WebSocket vs SSE? | SSE = server→client only, HTTP, simple. WebSocket = bidirectional, TCP, complex. |

---

## GOTCHAS — Things that catch people out

**Gotcha 1: Forgetting `X-Accel-Buffering: no`**
Works in dev (no Nginx), broken in prod. Tokens arrive all at once after a long wait.
```python
headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
```

**Gotcha 2: Using `AsyncOpenAI` inside a Celery task**
```python
# WRONG — asyncio event loop not available in Celery worker
async def process(): ...
celery_app.task()(process)   # won't work properly

# RIGHT — use sync client in Celery
from openai import OpenAI   # sync, not async
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
```

**Gotcha 3: Not setting Redis status BEFORE `task.delay()`**
```python
# WRONG — race condition: client polls before status is set
process_document_task.delay(job_id, ...)
await redis.set(f"job:{job_id}:status", "pending")   # too late

# RIGHT — set status first
await redis.set(f"job:{job_id}:status", "pending")
process_document_task.delay(job_id, ...)
```

**Gotcha 4: Not escaping newlines in SSE tokens**
```python
# WRONG — bare newline breaks the SSE event
yield f"data: {token}\n\n"

# RIGHT — escape internal newlines
safe = token.replace("\n", "\\n")
yield f"data: {safe}\n\n"
```

**Gotcha 5: `finish_reason: content_filter` during streaming**
OpenAI can stop mid-stream if content filters trigger. The stream ends without `[DONE]`. Always handle `except` in the generator and yield an error event.
```python
except Exception as e:
    yield f"data: [ERROR: {str(e)}]\n\n"
```

---

## WHAT TO SAY IF STUCK

**Streaming:**
> "stream=True, async for chunk in stream, yield each token as 'data: {token}\\n\\n', StreamingResponse, X-Accel-Buffering: no, EventSource on frontend."

**Async jobs:**
> "Validate → create job_id → Redis status=pending → task.delay() → 202 Accepted. Worker: pull → process → Redis status=success. Client: GET /jobs/{id} until done."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Code](./code.py) | [→ Extensions](./extensions.md)
