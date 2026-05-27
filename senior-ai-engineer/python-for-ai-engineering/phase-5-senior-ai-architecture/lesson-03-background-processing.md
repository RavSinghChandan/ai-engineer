# Python for AI Engineering — Phase 5
# Lesson 3: Background Processing — Async Tasks, Queues, Workers

---

## 1. Intuition (Java Anchor)

Java: `@Async` for fire-and-forget, Spring Batch for heavy jobs, Kafka/RabbitMQ for distributed queues.
Python: `asyncio` background tasks for lightweight work, `Celery` + Redis for distributed task queues, `asyncio.Queue` for in-process pipelines.

AI engineering creates many background processing needs: re-embedding documents when a new CV is uploaded, running nightly RAGAS evaluations, rebuilding FAISS indexes after data changes.

| Java Pattern | Python Equivalent |
|---|---|
| `@Async` method | FastAPI `BackgroundTasks` / `asyncio.create_task` |
| `ThreadPoolExecutor.submit()` | `asyncio.create_task(coroutine)` |
| Spring Batch `Job` | Python script + cron / Celery beat |
| `BlockingQueue` producer-consumer | `asyncio.Queue` |
| Kafka consumer | Celery worker consuming Redis queue |
| `@Scheduled(fixedRate=3600000)` | Celery beat / APScheduler |
| `CompletableFuture.supplyAsync()` | `asyncio.create_task()` |
| `ExecutorService.awaitTermination()` | `await asyncio.gather(*tasks)` |

---

## 2. FastAPI `BackgroundTasks` — Simplest Pattern

```python
# Use for: fire-and-forget after response — send email, update cache, log to DB
# Java: @Async on service method called from @PostMapping handler

from fastapi import FastAPI, BackgroundTasks, Depends

app = FastAPI()

async def reindex_candidate(user_id: str, cv_text: str) -> None:
    """Runs after the HTTP response is already sent."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Reindexing candidate %s", user_id)
    embedding = await compute_embedding(cv_text)
    await vector_store.upsert(user_id, embedding, {"user_id": user_id, "text": cv_text})
    logger.info("Reindex complete for %s", user_id)

@app.post("/upload-cv")
async def upload_cv(
    request: CVUploadRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    # Save to DB immediately — return fast
    await save_cv_to_db(request.user_id, request.cv_text)

    # Schedule reindex in background — Java: @Async call
    background_tasks.add_task(reindex_candidate, request.user_id, request.cv_text)

    return {"status": "uploaded", "message": "CV saved. Indexing in background."}

# Limitation: BackgroundTasks runs in the same process.
# If the server restarts, in-flight tasks are lost.
# For durability, use Celery (see below).
```

---

## 3. `asyncio.create_task` — Long-Running Background Coroutine

```python
# Use for: background loop that runs for the lifetime of the app
# Java: daemon thread that runs indefinitely

import asyncio
import logging

logger = logging.getLogger(__name__)

async def periodic_reindex_loop(vector_store, interval_seconds: int = 3600) -> None:
    """Rebuild FAISS index every hour."""
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            logger.info("Starting periodic reindex")
            await vector_store.rebuild_index()
            logger.info("Periodic reindex complete")
        except asyncio.CancelledError:
            logger.info("Reindex loop cancelled — shutting down")
            break
        except Exception as e:
            logger.error("Reindex loop error: %s", e)
            # Don't break — log and continue next cycle

# Start in lifespan:
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    app.state.vector_store = VectorStore()

    # Start background loop — Java: executor.submit(daemon_runnable)
    reindex_task = asyncio.create_task(
        periodic_reindex_loop(app.state.vector_store, interval_seconds=3600)
    )
    yield

    # Cancel on shutdown — Java: executor.shutdownNow()
    reindex_task.cancel()
    try:
        await reindex_task
    except asyncio.CancelledError:
        pass
```

---

## 4. `asyncio.Queue` — Producer-Consumer Pipeline

```python
# Use for: decoupled pipeline — one coroutine produces work, another consumes
# Java: BlockingQueue<T> with producer thread and consumer thread

import asyncio
from dataclasses import dataclass

@dataclass
class EmbedTask:
    user_id: str
    cv_text: str

async def embedding_producer(queue: asyncio.Queue, cv_uploads: list[EmbedTask]) -> None:
    """Puts tasks into the queue — Java: producer.put(item)"""
    for task in cv_uploads:
        await queue.put(task)
    # Signal workers to stop:
    await queue.put(None)   # sentinel value

async def embedding_consumer(queue: asyncio.Queue, worker_id: int) -> int:
    """Pulls tasks from queue and embeds — Java: consumer.take()"""
    processed = 0
    while True:
        task = await queue.get()
        if task is None:
            queue.task_done()
            break   # sentinel received — stop this worker
        try:
            embedding = await compute_embedding(task.cv_text)
            await vector_store.upsert(task.user_id, embedding, {"user_id": task.user_id})
            processed += 1
        finally:
            queue.task_done()   # Java: no equivalent — Python queue tracking
    return processed

async def run_embedding_pipeline(cv_uploads: list[EmbedTask], num_workers: int = 3) -> int:
    queue: asyncio.Queue[EmbedTask | None] = asyncio.Queue(maxsize=50)

    producer = asyncio.create_task(embedding_producer(queue, cv_uploads))
    workers = [
        asyncio.create_task(embedding_consumer(queue, i))
        for i in range(num_workers)
    ]

    await producer
    # After producer sends one None, workers will each need a None to stop:
    for _ in range(num_workers - 1):
        await queue.put(None)   # one None per extra worker

    results = await asyncio.gather(*workers)
    return sum(results)
```

---

## 5. Celery — Distributed Task Queue (Production)

```python
# Use for: tasks that must survive server restarts, run on separate machines,
# or be scheduled/retried independently.
# Java: Spring + RabbitMQ/Kafka consumer workers.

# pip install celery redis
from celery import Celery

celery_app = Celery(
    "bench_optimizer",
    broker="redis://localhost:6379/0",     # task queue backend
    backend="redis://localhost:6379/1",    # result storage
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_expires=3600,
    timezone="UTC",
)

# Task definition (Java: @Component that implements Runnable):
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def embed_cv_task(self, user_id: str, cv_text: str) -> dict:
    """Celery task — runs in a separate worker process."""
    try:
        import asyncio
        from openai import OpenAI
        client = OpenAI()
        response = client.embeddings.create(model="text-embedding-3-small", input=cv_text)
        embedding = response.data[0].embedding
        # Store in vector DB...
        return {"user_id": user_id, "status": "embedded", "dim": len(embedding)}
    except Exception as exc:
        raise self.retry(exc=exc)   # retry up to max_retries times

# Enqueue from FastAPI (producer):
@app.post("/upload-cv")
async def upload_cv(request: CVUploadRequest) -> dict:
    await save_cv_to_db(request.user_id, request.cv_text)
    # Send to Celery queue — runs in worker process, not this web server:
    embed_cv_task.delay(request.user_id, request.cv_text)
    return {"status": "queued"}

# Check result (optional):
result = embed_cv_task.delay("user1", cv_text)
print(result.id)           # task ID — store this in DB
task_result = result.get(timeout=30)  # block until done

# Start worker (separate process — Java: start consumer application):
# $ celery -A main.celery_app worker --loglevel=info --concurrency=4
```

---

## 6. Scheduled Tasks — APScheduler

```python
# APScheduler: cron-like scheduled tasks inside the Python process
# Java: @Scheduled(cron="0 0 * * * *") or Quartz Scheduler

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

async def nightly_reindex():
    """Runs every night at 2am — rebuild FAISS index from latest data."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Starting nightly reindex")
    await vector_store.rebuild_index()
    logger.info("Nightly reindex complete")

async def hourly_stats():
    """Log system stats every hour."""
    stats = await collect_system_stats()
    logging.getLogger(__name__).info("stats=%s", stats)

# Register jobs:
scheduler.add_job(nightly_reindex, CronTrigger(hour=2, minute=0))   # 2:00 AM
scheduler.add_job(hourly_stats,   "interval", hours=1)

# Start/stop with app lifespan:
@asynccontextmanager
async def lifespan(app):
    scheduler.start()
    yield
    scheduler.shutdown()
```

---

## 7. Interview Anchor

**"How do you handle background processing in a Python AI service?"**

Say:
> "Three tiers depending on durability requirements. For fire-and-forget tasks that can be lost on restart — sending a webhook, updating a cache after upload — FastAPI's `BackgroundTasks.add_task()` is sufficient. It runs after the HTTP response is sent in the same process. For lightweight long-running loops — a periodic FAISS reindex every hour — I use `asyncio.create_task` in the `lifespan` context manager and cancel it on shutdown. The task runs indefinitely with a `while True: await asyncio.sleep(interval)` loop, and any error is logged and the loop continues. For production-grade distributed tasks that must survive server restarts — re-embedding thousands of CVs, sending batched emails, running overnight evaluation jobs — I use Celery with a Redis broker. The web server enqueues with `.delay()` and returns immediately; a separate Celery worker process does the actual work. The Java mental model: FastAPI BackgroundTasks is @Async, asyncio loop is a daemon thread, and Celery is Spring + RabbitMQ."

---

## 8. Quick Reference

```python
# FastAPI BackgroundTasks (fire-and-forget, same process)
@app.post("/upload")
async def upload(tasks: BackgroundTasks):
    tasks.add_task(my_async_fn, arg1, arg2)
    return {"status": "ok"}

# asyncio.create_task (background loop)
task = asyncio.create_task(my_coroutine())
task.cancel()              # cancel on shutdown
await task                 # wait for cancellation

# asyncio.Queue (producer-consumer)
queue: asyncio.Queue = asyncio.Queue(maxsize=100)
await queue.put(item)      # producer
item = await queue.get()   # consumer
queue.task_done()          # signal item processed
await queue.join()         # wait until all items processed

# Celery task
@celery_app.task(max_retries=3)
def my_task(arg): ...

my_task.delay(arg)         # enqueue (non-blocking)
result = my_task.delay(arg)
result.get(timeout=30)     # wait for result

# APScheduler
scheduler = AsyncIOScheduler()
scheduler.add_job(fn, CronTrigger(hour=2))
scheduler.add_job(fn, "interval", minutes=30)
scheduler.start(); scheduler.shutdown()

# Java comparison
# BackgroundTasks.add_task()  → @Async method call
# asyncio.create_task()       → executor.submit(runnable)
# asyncio.Queue               → BlockingQueue<T>
# Celery + Redis              → Spring + RabbitMQ/Kafka
# @celery_app.task            → @RabbitListener / @KafkaListener
# APScheduler CronTrigger     → @Scheduled(cron="...")
# scheduler.start()           → ThreadPoolTaskScheduler.initialize()
```
