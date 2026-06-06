"""
P5 — STREAMING + ASYNC JOBS
Part A Golden Memory: Generate → Push Token → Repeat
Part B Golden Memory: Accept → Queue → Worker → Status
Stack: FastAPI + AsyncOpenAI (Part A) + Celery + Redis (Part B)
================================================================
HOW TO USE THIS FILE:
  - Each section is labelled. Read top to bottom once.
  - PART A (Streaming): Sections 1-5
  - PART B (Async Jobs): Sections 6-11
  - To change streaming model: Section 3 (token_generator)
  - To change job queue backend: Section 7 (celery_app broker)
================================================================
"""

import os, uuid, json, logging, time
from contextlib import asynccontextmanager
from typing import AsyncIterator
from enum import Enum

import redis.asyncio as aioredis
from celery import Celery
from fastapi import FastAPI, Depends, HTTPException, Request as Req, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI, RateLimitError, APITimeoutError

logger    = logging.getLogger(__name__)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


# ================================================================
# PART A — STREAMING
# ================================================================

# ================================================================
# SECTION 1 — STREAMING REQUEST MODEL
# ================================================================

class StreamRequest(BaseModel):
    message:       str = Field(min_length=1, max_length=10_000)
    system_prompt: str = "You are a helpful assistant."


# ================================================================
# SECTION 2 — ASYNC TOKEN GENERATOR
# ================================================================
# Iterates the LLM stream and yields one token at a time.
# Handles errors gracefully — sends error event instead of crashing.

async def token_generator(
    messages: list[dict],
    llm:      AsyncOpenAI,
) -> AsyncIterator[str]:
    """
    Yields tokens one by one as they arrive from the LLM.
    stream=True makes the SDK return an async iterator instead of a full response.
    """
    accumulated = []
    try:
        stream = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            stream=True,   # KEY: returns async iterator, not complete response
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                accumulated.append(token)
                yield token   # push each token immediately

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


# ================================================================
# SECTION 3 — SSE FORMATTER  ← YOUR SKILL
# ================================================================
# Wraps token_generator into SSE format.
# SSE format: "data: <content>\n\n"  (double newline = end of event)

async def sse_event_stream(
    messages: list[dict],
    llm:      AsyncOpenAI,
) -> AsyncIterator[str]:
    """
    SSE rules:
    - Each event: "data: {content}\\n\\n" (double newline is the delimiter)
    - Newlines INSIDE the token must be escaped to "\\n" (single backslash-n)
      otherwise the bare newline terminates the event early
    - Final event: "data: [DONE]\\n\\n" signals completion to frontend
    """
    async for token in token_generator(messages, llm):
        safe = token.replace("\n", "\\n")   # escape internal newlines
        yield f"data: {safe}\n\n"
    yield "data: [DONE]\n\n"                # signal completion


# ================================================================
# SECTION 4 — STREAMING ENDPOINT
# ================================================================
# CRITICAL HEADERS:
#   Cache-Control: no-cache     — don't cache SSE responses
#   X-Accel-Buffering: no       — disable Nginx buffering (MUST have in prod)
#   Connection: keep-alive      — keep connection open

@app.post("/stream")   # app defined in Section 10 below
async def stream_chat(
    req:     StreamRequest,
    request: Req,
    user:    dict = Depends(lambda: {}),  # replace with get_current_user
) -> StreamingResponse:

    messages = [
        {"role": "system", "content": req.system_prompt},
        {"role": "user",   "content": req.message},
    ]

    logger.info("stream start user=%s", user.get("sub", "anon"))

    return StreamingResponse(
        sse_event_stream(messages, request.app.state.llm),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",        # disables Nginx proxy buffering
            "Connection":        "keep-alive",
        },
    )

# ── Frontend JavaScript reference ─────────────────────────────
# const source = new EventSource('/stream?...');
# source.onmessage = (e) => {
#   if (e.data === '[DONE]') { source.close(); return; }
#   document.getElementById('output').innerText += e.data.replace(/\\n/g, '\n');
# };
# source.onerror = () => source.close();


# ================================================================
# PART B — ASYNC JOBS
# ================================================================

# ================================================================
# SECTION 5 — JOB STATUS MODEL
# ================================================================

class JobStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    SUCCESS    = "success"
    FAILED     = "failed"

class JobResponse(BaseModel):
    job_id: str
    status: JobStatus

class JobResult(BaseModel):
    job_id:  str
    status:  JobStatus
    result:  dict | None = None
    error:   str  | None = None


# ================================================================
# SECTION 6 — CELERY SETUP
# ================================================================
# broker  = task queue (where tasks are pushed + pulled from)
# backend = result storage (where results/status are stored)
# Both use Redis here. RabbitMQ can be used for broker in prod.

celery_app = Celery(
    "ai_jobs",
    broker=f"{REDIS_URL}/0",    # channel 0 = task queue
    backend=f"{REDIS_URL}/1",   # channel 1 = result storage
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_expires=3600,         # auto-delete results after 1 hour
)


# ================================================================
# SECTION 7 — CELERY TASK (runs in worker process, NOT FastAPI)
# ================================================================
# This function runs in a SEPARATE Celery worker process.
# Use sync OpenAI client here — NOT AsyncOpenAI.
# bind=True gives access to self.retry()

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_document_task(self, job_id: str, file_content: str, filename: str) -> dict:
    """
    Heavy task: parse → chunk → embed → store.
    Status lifecycle: pending → processing → success / failed
    """
    import redis as sync_redis
    r = sync_redis.from_url(REDIS_URL, decode_responses=True)

    try:
        # Mark as processing
        r.set(f"job:{job_id}:status", JobStatus.PROCESSING)

        # Step 1: parse text (real: pdfplumber / docx)
        text = file_content

        # Step 2: chunk
        chunks = [text[i:i + 1000] for i in range(0, len(text), 800)]

        # Step 3: embed  — SYNC client inside Celery worker
        from openai import OpenAI   # NOT AsyncOpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=chunks[:10],   # limit for demo; process all in production
        )
        embedding_count = len(response.data)

        # Step 4: store result
        result = {
            "filename":           filename,
            "chunks":             len(chunks),
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


# ================================================================
# SECTION 8 — APP STARTUP
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm   = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=120.0)
    app.state.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    yield
    await app.state.redis.aclose()

app = FastAPI(title="Streaming + Async Jobs App", lifespan=lifespan)


# ================================================================
# SECTION 9 — AUTH
# ================================================================

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ================================================================
# SECTION 10 — SUBMIT ENDPOINT (202 Accepted)
# ================================================================
# Pattern: validate → create job_id → set Redis status=pending →
#          task.delay() → return 202 immediately
# IMPORTANT: set Redis BEFORE delay() to avoid 404 on /status

@app.post("/jobs/ingest", response_model=JobResponse, status_code=202)
async def submit_ingest_job(
    file:    UploadFile = File(...),
    request: Req        = None,
    user:    dict       = Depends(get_current_user),
) -> JobResponse:

    # Validate
    if not file.filename.endswith((".txt", ".pdf")):
        raise HTTPException(400, "Only .txt and .pdf files supported")

    content = await file.read()
    text    = content.decode("utf-8", errors="ignore")

    # Create job ID
    job_id = str(uuid.uuid4())

    # Store initial status BEFORE pushing to queue
    await request.app.state.redis.set(f"job:{job_id}:status", JobStatus.PENDING)

    # Push to Celery queue — non-blocking, returns immediately
    process_document_task.delay(job_id, text, file.filename)

    logger.info("job submitted job_id=%s user=%s file=%s",
                job_id, user.get("sub"), file.filename)

    return JobResponse(job_id=job_id, status=JobStatus.PENDING)


# ================================================================
# SECTION 11 — STATUS ENDPOINT (client polls this)
# ================================================================

@app.get("/jobs/{job_id}", response_model=JobResult)
async def get_job_status(
    job_id:  str,
    request: Req,
    user:    dict = Depends(get_current_user),
) -> JobResult:

    redis      = request.app.state.redis
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


# ================================================================
# SECTION 12 — HOW TO START THE CELERY WORKER
# ================================================================
# In a separate terminal:
#   celery -A code.celery_app worker --loglevel=info --concurrency=4
#
# In development (single process):
#   celery -A code.celery_app worker --loglevel=debug --concurrency=1
