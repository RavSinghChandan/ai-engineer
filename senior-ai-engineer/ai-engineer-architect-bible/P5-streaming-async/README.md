# P5 — Streaming + Async Jobs
### Part A: `Generate → Push Token → Repeat` · Part B: `Accept → Queue → Worker → Status`

> **2-minute promise:** Read this page top to bottom. Click any link. You will understand both streaming and async job patterns — and be able to explain them in any interview.

---

## 🗺️ What is this pattern?

Two patterns for handling **time** in AI systems:

**Part A — SSE Streaming:**
Instead of waiting for the full LLM response, push each token to the browser as it arrives. The ChatGPT typing effect. Users see output immediately.

**Part B — Async Jobs (Celery):**
For tasks too slow to wait on (large PDF ingestion, batch embeddings, report generation). Accept the request, push to a queue, return a job ID immediately, worker processes in the background, client polls for status.

**When to use streaming:**
- Chat UI (typing effect)
- Long-form generation (articles, code)
- Real-time summarization

**When to use async jobs:**
- Large file ingestion
- Batch embedding pipelines
- Report generation (10+ seconds)
- Any task where response > 30 seconds

---

## 🧭 Navigation — Click to explore

| What you want | Go here |
|---|---|
| 🎨 **See the INTERACTIVE flow** (colorful, clickable, animated) | [→ **flow.html**](./flow.html) ← open in browser |
| 📄 **Mermaid flow** (VS Code / GitHub) | [→ flow.md](./flow.md) |
| 💻 **See the production code** (copy-paste ready) | [→ code.py](./code.py) |
| 🧠 **Understand it in 2 minutes** (mental model, story) | [→ mental-model.md](./mental-model.md) |
| 🎯 **Interview Q&A + what to say** | [→ cheatsheet.md](./cheatsheet.md) |
| ➕ **Add something new to this pattern** | [→ extensions.md](./extensions.md) |

---

## ⚡ 30-second summary

**Part A — Streaming:**
```
stream=True → async for chunk in stream → yield token → SSE format → browser
The key: X-Accel-Buffering: no (disables Nginx buffering)
```

**Part B — Async Jobs:**
```
POST /ingest → create job_id → task.delay() → return 202 {job_id}
Worker: pull job → process → Redis status=success
Client: GET /jobs/{job_id} → poll until done
```

---

## 🏗️ Real projects using this pattern

| Project | Where it's used |
|---|---|
| AstroIntel 360° | Part A: SSE node_start/node_done events from pipeline. Part B: /submit returns job_id, /job/{id} polls status. Combined: /submit-stream delivers both in one SSE connection. |
| Bench Resource Optimizer | Async job for heavy resource matching across large teams |

---

## 🔮 Future additions (track here)

When something new comes to this pattern, add it to [extensions.md](./extensions.md).

Examples of what might come:
- WebSocket (bidirectional, vs SSE which is server-only)
- Kafka instead of Redis (for distributed workers)
- Progress percentage events (node_progress with 0–100%)
- Combined pattern: submit-stream (Part A + B in one connection)
