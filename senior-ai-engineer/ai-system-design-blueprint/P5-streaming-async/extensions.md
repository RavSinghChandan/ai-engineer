# P5 — Extensions
### When something new comes to streaming or async jobs, add it here. This file is your living changelog.

← [Back to README](./README.md)

---

## How to use this file

When you learn something new that applies to streaming or async jobs:
1. Pick the right section below (or add a new one)
2. Add your entry with: what it is, when to use it, 3–5 lines of code
3. Update `flow.md` if it changes the architecture diagram
4. Update `cheatsheet.md` if it produces a new interview question

---

## SECTION A — Streaming Transports

### ✅ SSE (Server-Sent Events) — current default
```python
# Server: yield "data: {token}\n\n"
# Client: new EventSource('/stream')
# One-way: server → client only
# Pros: native HTTP, works through load balancers, reconnects automatically
```

### ➕ WebSocket (bidirectional)
```python
from fastapi import WebSocket

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # Receive client message
    data = await websocket.receive_text()
    # Stream response
    async for token in token_generator(data, llm):
        await websocket.send_text(token)
    await websocket.close()
```
**When to use:** when the client needs to send messages mid-stream (interrupt, redirect). Otherwise SSE is simpler.

### ➕ WebSocket with reconnect logic
```python
// Frontend
function connectWS() {
    const ws = new WebSocket('/ws');
    ws.onclose = () => setTimeout(connectWS, 2000);   // reconnect after 2s
    ws.onmessage = (e) => appendToken(e.data);
}
```

---

## SECTION B — Async Job Queue Backends

### ✅ Celery + Redis — current default
```python
celery_app = Celery("jobs", broker="redis://localhost:6379/0", backend="redis://localhost:6379/1")
process_document_task.delay(job_id, text, filename)
```

### ➕ Celery + RabbitMQ (more robust for production)
```python
celery_app = Celery("jobs",
    broker="amqp://user:pass@rabbitmq:5672//",
    backend="redis://localhost:6379/1",
)
```
**When to use:** high-volume production, need message durability guarantees.

### ➕ FastAPI BackgroundTasks (no Celery needed for simple cases)
```python
from fastapi import BackgroundTasks

@app.post("/simple-job")
async def submit(background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    background_tasks.add_task(process_task, job_id)   # runs in same process
    return {"job_id": job_id}
```
**When to use:** simple short tasks (< 30s), same process is fine, no worker infrastructure needed.
**Warning:** dies if FastAPI process restarts. Not for heavy or long tasks.

---

## SECTION C — Progress Reporting

### ➕ Progress events via Redis pub/sub
```python
# Worker publishes progress:
r.publish(f"job:{job_id}:progress", json.dumps({"step": "embedding", "pct": 60}))

# SSE endpoint subscribes:
async def stream_job_progress(job_id: str):
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"job:{job_id}:progress")
    async for message in pubsub.listen():
        if message["type"] == "message":
            yield f"data: {message['data']}\n\n"
```

### ➕ Named SSE events (beyond just "message")
```python
# Server sends typed events:
yield f"event: node_start\ndata: {json.dumps({'node': 'parse'})}\n\n"
yield f"event: node_done\ndata: {json.dumps({'node': 'parse', 'ms': 430})}\n\n"

# Frontend listens for specific event types:
source.addEventListener('node_done', (e) => updateProgress(JSON.parse(e.data)));
```

---

## SECTION D — Combined Pattern (P5 Full)

### ➕ submit-stream: job_id + live progress in one SSE connection
```python
@app.post("/submit-stream")
async def submit_stream(file: UploadFile, request: Req, user: dict = Depends(...)):
    job_id = str(uuid.uuid4())

    async def event_generator():
        # Subscribe BEFORE pushing to queue — no race condition
        pubsub = request.app.state.redis.pubsub()
        await pubsub.subscribe(f"job:{job_id}:events")

        # Push to queue
        process_document_task.delay(job_id, text, file.filename)

        # Send job_id first
        yield f"data: {json.dumps({'job_id': job_id, 'status': 'queued'})}\n\n"

        # Stream all worker events
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                yield f"data: {msg['data']}\n\n"
                if json.loads(msg["data"]).get("status") in ("success", "failed"):
                    break

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no"})
```
**Key insight:** subscribe BEFORE publishing — otherwise you miss events that fire during the race between subscription and job start.

---

## SECTION E — Future patterns that grow out of P5

| What you add to P5 | It becomes |
|---|---|
| + Stream RAG answers token by token | → P2 + P5 (streaming RAG) |
| + Stream agent reasoning steps | → P3 + P5 (streaming agent) |
| + Stream with personalized context | → P4 + P5 (streaming with memory) |
| + Kafka instead of Redis for pub/sub | → Production-scale event streaming |

---

← [Back to README](./README.md) | [→ Cheatsheet](./cheatsheet.md)
