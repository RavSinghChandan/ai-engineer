# Architecture 5 — Streaming + Async Production
## Part A Golden Memory: `Generate → Push Token → Repeat`
## Part B Golden Memory: `Accept → Queue → Worker → Status`

---

# PART A — STREAMING

**Use for:** ChatGPT typing effect · real-time chat UI

---

## Architecture Flow — Part A

```
User Request
   ↓
Frontend
   ↓
FastAPI Streaming Endpoint
   ↓
Authentication
   ↓
Prompt Builder
   ↓
LLM Streaming API Call
   ↓
Model Generates Token
   ↓
Send Token via
   ├── SSE
   └── WebSocket
   ↓
Frontend Receives Token
   ↓
Render Incrementally
   ↓
Next Token
   ↓
Repeat
   ↓
End Stream
```

---

## Production Code — Part A

```python
# ============================================================
# STREAMING — COMPLETE PRODUCTION CODE
# Stack: FastAPI + AsyncOpenAI + SSE (StreamingResponse)
# Pattern: Generate → Push Token → Repeat
# ============================================================

import os, json, logging, time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Depends, HTTPException, Request as Req
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from openai import AsyncOpenAI, RateLimitError, APITimeoutError

logger = logging.getLogger(__name__)

# ── 1. MODELS ─────────────────────────────────────────────────

class StreamRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    system_prompt: str = "You are a helpful assistant."

# ── 2. STARTUP ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=120.0)
    yield

app = FastAPI(title="Streaming App", lifespan=lifespan)

# ── 3. AUTH ───────────────────────────────────────────────────

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")

# ── 4. ASYNC TOKEN GENERATOR ─────────────────────────────────

async def token_generator(
    messages: list[dict],
    llm: AsyncOpenAI,
) -> AsyncIterator[str]:
    """
    Yields tokens one by one as they arrive from the LLM.
    Handles errors gracefully — sends error event instead of crashing.
    """
    accumulated = []
    try:
        stream = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                accumulated.append(token)
                yield token   # caller receives one token at a time

    except RateLimitError:
        logger.warning("Rate limit during streaming")
        yield "\n\n[Rate limit — please retry in a moment]"

    except APITimeoutError:
        logger.warning("Timeout during streaming")
        yield "\n\n[Response timed out]"

    except Exception as e:
        logger.error("Streaming error: %s", e)
        yield "\n\n[Error generating response]"

    finally:
        full = "".join(accumulated)
        logger.info("stream complete tokens_approx=%d", len(full.split()))

# ── 5. SSE FORMATTER ──────────────────────────────────────────

async def sse_event_stream(
    messages: list[dict],
    llm: AsyncOpenAI,
) -> AsyncIterator[str]:
    """
    Wraps token_generator into SSE format.
    SSE format: "data: <content>\n\n"  (double newline = end of event)
    Frontend reads with: const source = new EventSource('/stream')
                         source.onmessage = (e) => appendToken(e.data)
    """
    async for token in token_generator(messages, llm):
        safe = token.replace("\n", "\\n")   # newlines break SSE delimiter
        yield f"data: {safe}\n\n"
    yield "data: [DONE]\n\n"               # signal completion to frontend

# ── 6. STREAMING ENDPOINT ─────────────────────────────────────

@app.post("/stream")
async def stream_chat(
    req: StreamRequest,
    request: Req,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:

    messages = [
        {"role": "system", "content": req.system_prompt},
        {"role": "user",   "content": req.message},
    ]

    logger.info("stream start user=%s", user.get("sub"))

    return StreamingResponse(
        sse_event_stream(messages, request.app.state.llm),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",     # CRITICAL: disables Nginx buffering
            "Connection":       "keep-alive",
        },
    )

# ── FRONTEND JAVASCRIPT (for reference) ───────────────────────
# const source = new EventSource('/stream?...');
# source.onmessage = (e) => {
#   if (e.data === '[DONE]') { source.close(); return; }
#   document.getElementById('output').innerText += e.data.replace(/\\n/g, '\n');
# };
```

---

---

# PART B — ASYNC JOBS

**Use for:** large PDF ingestion · batch embeddings · report generation · long AI tasks

---

## Architecture Flow — Part B

```
User Upload / Request
   ↓
FastAPI Endpoint
   ↓
Validation
   ↓
Store Input
   ↓
Create Job ID
   ↓
Push to Queue
   ├── Redis
   ├── Celery
   ├── RabbitMQ
   └── Kafka
   ↓
Immediate API Response
{
  status: "processing",
  jobId: "xyz"
}

━━━━━━━━━━━━━━━━━━━━━━
WORKER FLOW

Background Worker
   ↓
Pull Job
   ↓
Execute Task
   ├── parse file
   ├── chunk
   ├── embeddings
   ├── call LLM
   └── transform
   ↓
Persist Result
   ↓
Update Job Status
   ├── success
   └── failed

━━━━━━━━━━━━━━━━━━━━━━
CLIENT

Frontend Polls
/status/{jobId}
OR
WebSocket Push Update
```

---

## Production Code — Part B

```python
# ============================================================
# ASYNC JOBS — COMPLETE PRODUCTION CODE
# Stack: FastAPI + Celery + Redis
# Pattern: Accept → Queue → Worker → Status
# ============================================================

import os, uuid, json, logging, time
from contextlib import asynccontextmanager
from enum import Enum

import redis.asyncio as aioredis
from celery import Celery
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# ── 1. CELERY SETUP ───────────────────────────────────────────

celery_app = Celery(
    "ai_jobs",
    broker=f"{REDIS_URL}/0",    # task queue
    backend=f"{REDIS_URL}/1",   # result storage
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_expires=3600,        # results expire after 1 hour
)

# ── 2. JOB STATUS MODEL ───────────────────────────────────────

class JobStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    SUCCESS    = "success"
    FAILED     = "failed"

class JobResponse(BaseModel):
    job_id: str
    status: JobStatus

class JobResult(BaseModel):
    job_id: str
    status: JobStatus
    result: dict | None = None
    error: str | None = None

# ── 3. CELERY TASK (runs in separate worker process) ──────────

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_document_task(self, job_id: str, file_content: str, filename: str) -> dict:
    """
    Heavy task: parse → chunk → embed → store.
    Runs in a Celery worker, NOT in the FastAPI process.
    """
    import redis as sync_redis
    r = sync_redis.from_url(REDIS_URL, decode_responses=True)

    try:
        # Update status to PROCESSING
        r.set(f"job:{job_id}:status", JobStatus.PROCESSING)

        # Step 1: parse text
        text = file_content   # real: pdfplumber.extract_text()

        # Step 2: chunk
        chunks = [text[i:i+1000] for i in range(0, len(text), 800)]

        # Step 3: embed (sync OpenAI client inside Celery worker)
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=chunks[:10],   # limit for demo
        )
        embedding_count = len(response.data)

        # Step 4: store result
        result = {
            "filename": filename,
            "chunks": len(chunks),
            "embeddings_created": embedding_count,
        }
        r.set(f"job:{job_id}:result", json.dumps(result))
        r.set(f"job:{job_id}:status", JobStatus.SUCCESS)

        logger.info("job=%s success chunks=%d", job_id, len(chunks))
        return result

    except Exception as exc:
        r.set(f"job:{job_id}:status", JobStatus.FAILED)
        r.set(f"job:{job_id}:error", str(exc))
        raise self.retry(exc=exc)   # retry up to max_retries

# ── 4. FASTAPI APP ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    yield
    await app.state.redis.aclose()

app = FastAPI(title="Async Jobs App", lifespan=lifespan)

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")

# ── 5. SUBMIT ENDPOINT ────────────────────────────────────────

@app.post("/jobs/ingest", response_model=JobResponse, status_code=202)
async def submit_ingest_job(
    file: UploadFile = File(...),
    request: Req = None,
    user: dict = Depends(get_current_user),
) -> JobResponse:

    # Validation
    if not file.filename.endswith((".txt", ".pdf")):
        raise HTTPException(400, "Only .txt and .pdf files supported")

    # Read file
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")

    # Create job ID
    job_id = str(uuid.uuid4())

    # Store initial status
    await request.app.state.redis.set(f"job:{job_id}:status", JobStatus.PENDING)

    # Push to Celery queue — returns immediately
    process_document_task.delay(job_id, text, file.filename)

    logger.info("job submitted job_id=%s user=%s file=%s",
                job_id, user.get("sub"), file.filename)

    # Immediate response — don't wait for the job
    return JobResponse(job_id=job_id, status=JobStatus.PENDING)

# ── 6. STATUS ENDPOINT (frontend polls this) ──────────────────

@app.get("/jobs/{job_id}", response_model=JobResult)
async def get_job_status(
    job_id: str,
    request: Req,
    user: dict = Depends(get_current_user),
) -> JobResult:

    redis = request.app.state.redis
    status_raw = await redis.get(f"job:{job_id}:status")

    if not status_raw:
        raise HTTPException(404, f"Job {job_id} not found")

    status = JobStatus(status_raw)

    result = None
    error  = None

    if status == JobStatus.SUCCESS:
        raw = await redis.get(f"job:{job_id}:result")
        if raw:
            result = json.loads(raw)

    if status == JobStatus.FAILED:
        error = await redis.get(f"job:{job_id}:error")

    return JobResult(job_id=job_id, status=status, result=result, error=error)


# ── START CELERY WORKER (separate terminal) ───────────────────
# celery -A main.celery_app worker --loglevel=info --concurrency=4


# ── INTERVIEW CHEAT SHEET ─────────────────────────────────────
# Q: "How do you handle long-running AI tasks in production?"
#
# STREAMING:
# "AsyncOpenAI with stream=True returns a stream object.
#  I iterate with 'async for chunk in stream' and yield each token.
#  FastAPI StreamingResponse wraps the async generator and writes
#  SSE format: 'data: {token}\\n\\n'. The double newline is the SSE
#  event delimiter. Set X-Accel-Buffering: no so Nginx doesn't buffer.
#  Frontend reads with EventSource API — native browser support."
#
# ASYNC JOBS:
# "The FastAPI endpoint validates input, creates a UUID job ID,
#  stores status=pending in Redis, then calls task.delay() — this
#  pushes the job to the Celery queue and returns immediately.
#  The endpoint responds with 202 Accepted + {jobId}.
#  A Celery worker in a separate process pulls the job and runs it.
#  It updates Redis status: pending → processing → success/failed.
#  Frontend polls /jobs/{jobId} to check status.
#  This pattern is Accept → Queue → Worker → Status."
```
