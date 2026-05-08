# Senior AI Engineer — Module 7
# Topic: Async LLM Workflows — Queue, Retry, Dead Letter, Idempotency

---

## 1. Intuition

LLM calls are slow (500ms-30s), expensive, and fallible. Running them synchronously at scale is fragile.
Async queue-based workflows decouple request submission from result retrieval — users submit, workers process, results are delivered when ready.

This is standard async backend architecture. Your Spring Boot + async processing experience maps directly.

---

## 2. Core Concept

### Async Workflow Pattern
```
Submit → Queue → Worker → Result Store
   ↑                           ↓
User polls status          User retrieves result
```

1. User submits a request (document analysis, report generation)
2. API returns immediately: `{task_id: "uuid", status: "queued"}`
3. Worker picks up task, calls LLM, stores result
4. User polls `GET /tasks/{task_id}/status` or receives webhook when done

### Retry Strategy
```
Attempt 1 → fails (rate limit)
    ↓ wait 2s
Attempt 2 → fails (timeout)
    ↓ wait 4s
Attempt 3 → success
    ↓ commit result
```

Exponential backoff + jitter: prevents thundering herd when many retries happen simultaneously.

### Dead Letter Queue
After N failed attempts: move to dead letter queue (DLQ).
DLQ is monitored by an engineer, not automatically retried.
Prevents infinite retry loops for permanently failing tasks.

---

## 3. Code Skeleton (Production-Grade — Celery + Redis)

```python
from celery import Celery
from celery.utils.log import get_task_logger
import redis

# For teams without Kafka: Celery + Redis is simpler and sufficient
celery_app = Celery(
    "ai_workers",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1"
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    task_acks_late=True,              # ack only after success (at-least-once)
    task_reject_on_worker_lost=True,  # requeue if worker crashes
    task_max_retries=3,
    task_default_retry_delay=60,
    task_soft_time_limit=120,         # 2 min soft limit
    task_time_limit=150,              # 2.5 min hard limit (kills task)
)

logger = get_task_logger(__name__)

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    acks_late=True
)
def process_document_analysis(self, task_id: str, doc_id: str, query: str, tenant_id: str):
    try:
        # Update status
        update_task_status(task_id, "processing")
        
        # Retrieve context
        chunks = retrieve_chunks(embed_text(query), tenant_id, filter_doc_id=doc_id)
        
        if not chunks:
            update_task_status(task_id, "completed", result={
                "answer": "No relevant content found in the document.",
                "sources": []
            })
            return
        
        context = build_context(chunks[:5])
        
        # LLM call
        answer = call_with_fallback(
            "Answer from provided context only.",
            f"Context: {context}\nQuestion: {query}"
        )
        
        # Store result
        update_task_status(task_id, "completed", result={
            "answer": answer,
            "sources": [c["metadata"]["source"] for c in chunks[:5]]
        })
        
        logger.info(f"Task {task_id} completed successfully")
        
    except RateLimitError as exc:
        countdown = 2 ** self.request.retries * 10  # 10s, 20s, 40s
        logger.warning(f"Rate limited — retry in {countdown}s")
        raise self.retry(exc=exc, countdown=countdown)
    
    except TimeoutError as exc:
        logger.error(f"Timeout on task {task_id}")
        raise self.retry(exc=exc, countdown=30)
    
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            # All retries exhausted → dead letter
            update_task_status(task_id, "failed", error=str(exc))
            send_to_dead_letter_queue(task_id, str(exc))
            logger.error(f"Task {task_id} failed permanently: {exc}")
        else:
            raise self.retry(exc=exc)

# Task status management
def update_task_status(task_id: str, status: str, result: dict = None, error: str = None):
    db.execute("""
        UPDATE async_tasks
        SET status = ?, result = ?, error = ?, updated_at = NOW()
        WHERE task_id = ?
    """, (status, json.dumps(result) if result else None, error, task_id))

# API endpoint — submit async task
@app.post("/v1/analyze/async")
async def submit_async_analysis(request: AnalysisRequest, user: dict = Depends(verify_api_key)):
    task_id = str(uuid.uuid4())
    
    # Store task record
    db.execute("""
        INSERT INTO async_tasks (task_id, user_id, tenant_id, doc_id, query, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'queued', NOW())
    """, (task_id, user["user_id"], user["tenant_id"], request.doc_id, request.query))
    
    # Enqueue
    process_document_analysis.delay(task_id, request.doc_id, request.query, user["tenant_id"])
    
    return {"task_id": task_id, "status": "queued", "poll_url": f"/v1/tasks/{task_id}"}

# Polling endpoint
@app.get("/v1/tasks/{task_id}")
async def get_task_status(task_id: str, user: dict = Depends(verify_api_key)):
    task = db.query("SELECT * FROM async_tasks WHERE task_id = ? AND user_id = ?",
                    (task_id, user["user_id"])).fetchone()
    if not task:
        raise HTTPException(404, "Task not found")
    
    response = {"task_id": task_id, "status": task["status"]}
    if task["status"] == "completed":
        response["result"] = json.loads(task["result"])
    elif task["status"] == "failed":
        response["error"] = task["error"]
    
    return response
```

---

## 5. Example (From Your Projects — Senior Framing)

**AstroIntel — async upgrade path:**

Current: synchronous 15-second pipeline. User waits.
Async upgrade: submit analysis → get task_id immediately → agents process in background → webhook/SSE when done.

For premium users: high-priority queue processed first.
For bulk analysis (astrologer processes 50 clients): batch submission to queue, progress dashboard.

In interview: "The 15-second synchronous pipeline in AstroIntel is acceptable for the current prototype. For production scale, I would convert it to async: submit → task_id → SSE progress events → result available. This is the same pattern as Spring Boot's @Async with a result future stored in Redis."

---

## 6. Trade-offs

Synchronous:
+ Simpler, immediate result
- Blocks under load, timeouts, poor UX for slow operations

Async with polling:
+ Non-blocking, scalable, retryable
- User must poll, more complex frontend

Async with webhook:
+ No polling, event-driven notification
- Requires client to have a public endpoint to receive webhooks

Async with SSE:
+ Real-time progress updates while async processing occurs
- Long-lived connection management

---

## 7. Interview Questions (Senior Level)

- How do you design a system where users submit AI tasks and get results when ready?
- How does your Spring Boot @Async experience map to Celery task workers?
- What is jitter in exponential backoff and why does it matter?
- How do you handle a Celery worker that crashes mid-task?
- How do you prioritize premium users' tasks over free tier users?

---

## 8. Answer Framework

Step 1 — Async pattern:
"Submit returns task_id immediately. Workers pick up from queue, process, store result. User polls status or receives webhook. Same pattern as Spring @Async with status tracking."

Step 2 — Reliability:
"task_acks_late=True: message is not acknowledged until the task succeeds. If the worker crashes, the message is requeued. After 3 failures, dead letter queue with alert."

Step 3 — From your background:
"Celery + Redis is the Python equivalent of Spring Boot async with message queues. I apply the same patterns: idempotency via task_id check, retry with backoff, DLQ for permanent failures."

Step 4 — Priority:
"Two queues: high_priority and default. Premium users' tasks go to high_priority. Celery workers poll high_priority first. Same concept as Spring's thread pool with priority queue."

Step 5 — Monitoring:
"Track queue depth per queue. Alert if high_priority queue depth > 10 (premium users are waiting). Track worker throughput (tasks/minute). Track failure rate and DLQ growth."

---

## 10. Advanced Follow-ups

Q1: What is jitter in exponential backoff and why is it important?

Answer:
Without jitter: all workers that hit a rate limit at the same time will retry at the same time (t+2s, t+4s, t+8s). This creates a thundering herd — a synchronized burst of retries that overloads the downstream service again.
With jitter: add random noise to the retry delay. Instead of exactly t+2s, retry at t + 2s + random(0, 1s). Workers retry at slightly different times, spreading the load.
Implementation:
```python
import random
def retry_delay_with_jitter(attempt: int, base: float = 2.0, max_delay: float = 60.0) -> float:
    exponential = base ** attempt
    jitter = random.uniform(0, exponential * 0.1)  # 10% jitter
    return min(exponential + jitter, max_delay)
```
This is a well-known distributed systems pattern — AWS's exponential backoff documentation explicitly recommends jitter. It is directly applicable to LLM API retries.

Q2: How do you implement task priority without two separate queues?

Answer:
Most queue systems support priority: Celery supports priority per task (0-10 scale), Redis Sorted Set supports score-based ordering.
Implementation: when submitting a task, pass `priority` as a task argument. High-priority tasks get priority=9, normal tasks get priority=5, batch tasks get priority=1.
```python
process_document_analysis.apply_async(
    args=[task_id, doc_id, query, tenant_id],
    priority=9 if user["tier"] == "premium" else 5
)
```
Workers process higher-priority tasks first when multiple tasks are in the queue.
Two-queue approach (separate high_priority and default queues) is more reliable because you can have dedicated worker pools for each tier. Premium user tasks are never blocked behind a long batch job.

Q3: How do you handle a task that requires multiple sequential LLM calls (a multi-step agent)?

Answer:
Design the task as a state machine, not a single function.
Each LLM call is a step. The task stores its current step and all previous step results in a checkpoint.
If the task fails mid-way (after step 2 of 5), it resumes from step 2, not step 1. This saves LLM call cost and time.
Implementation using Celery chaining:
```python
# Chain of tasks — each runs after the previous completes
workflow = chain(
    extract_key_info.s(doc_id),
    analyze_with_llm.s(),
    generate_report.s(),
    store_result.s(task_id)
)
workflow.apply_async()
```
Each step in the chain receives the output of the previous step. If any step fails, only that step retries — not the entire chain.
This is equivalent to a Spring Batch job with multiple steps and step-level restart capability. Same pattern.
