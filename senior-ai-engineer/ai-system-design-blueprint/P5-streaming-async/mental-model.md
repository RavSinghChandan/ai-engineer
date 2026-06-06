# P5 — Mental Model
### Understand this in 2 minutes. Never forget it.

← [Back to README](./README.md)

---

## Two Problems, Two Patterns

P5 solves two different "time" problems in AI systems:

```
PROBLEM A: LLM takes 10 seconds to respond.
           User stares at a spinner for 10 seconds.
           SOLUTION: Stream tokens as they arrive.
           User sees output after ~0.5 seconds.

PROBLEM B: Task takes 3 minutes (large PDF ingestion).
           You can't stream — user doesn't watch a progress bar for 3 minutes.
           SOLUTION: Accept immediately, process in background.
           User gets a job_id in < 1 second. Polls for status.
```

---

## Part A Mental Model: The Pipe

```
LLM generates:  [T] [h] [e] [ ] [w] [e] [a] [t] [h] [e] [r] ...
                  ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓
Your code:        yield each token as SSE event
                  ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓
Browser:          append each token to the output div
```

You are a pipe. Don't buffer. Don't collect. Just pass each token through immediately.

The two critical settings that keep the pipe open:
- `stream=True` — tells OpenAI to stream
- `X-Accel-Buffering: no` — tells Nginx NOT to buffer (without this, Nginx holds all tokens until done)

---

## Part A: SSE Format

SSE is just plain text. Every event is:
```
data: hello world\n\n
```
That double `\n\n` at the end is the event delimiter. One `\n` is a continuation. Two `\n` = end of event, fire `onmessage`.

If a token contains a newline character, you must escape it:
```python
safe = token.replace("\n", "\\n")   # don't break the SSE delimiter
yield f"data: {safe}\n\n"
```

---

## Part B Mental Model: The Ticket System

```
You walk into a restaurant:

WITHOUT async jobs:
  "I'd like the 3-course meal please."
  Waiter stands at your table for 45 minutes while food is prepared.
  Other customers can't be served.

WITH async jobs:
  "I'd like the 3-course meal please."
  Waiter hands you a ticket: "Your order is #42."
  Waiter goes to serve other customers.
  You check on your order when you want.
  Kitchen (Celery worker) prepares your meal independently.
```

The ticket is the `job_id`. The kitchen is the Celery worker. The check-in is `GET /jobs/{job_id}`.

---

## Part B: The Status Machine

Every job moves through exactly these states:
```
pending → processing → success
                    ↘ failed → retry → processing → ...
```

The client polls until it sees `success` or `failed`. Never stays in `pending` forever (that's a bug — worker died without updating status).

---

## The 3 Things You Must Not Forget

**Part A:**
1. `stream=True` on the LLM call
2. `X-Accel-Buffering: no` header
3. Escape `\n` inside tokens to `\\n` before the SSE `\n\n`

**Part B:**
1. Set Redis status **before** calling `task.delay()` — so `/status` never returns 404
2. `task.delay()` is non-blocking — the endpoint returns immediately
3. Worker uses the **sync** OpenAI client (not async) — Celery is not an async framework

---

## In One Sentence (interview answer — Part A)

> "Set stream=True on the AsyncOpenAI call. Iterate with 'async for chunk in stream' and yield each token wrapped in SSE format — 'data: {token}\\n\\n'. FastAPI's StreamingResponse wraps the async generator. Set X-Accel-Buffering: no so Nginx doesn't buffer. Frontend reads with the EventSource API."

## In One Sentence (interview answer — Part B)

> "The endpoint validates, creates a UUID job_id, stores status=pending in Redis, calls task.delay() — which pushes to Celery and returns immediately — then responds with 202 Accepted and the job_id. A Celery worker in a separate process pulls the job, processes it, and updates Redis to success or failed. Frontend polls GET /jobs/{job_id} until done."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Cheatsheet](./cheatsheet.md)
