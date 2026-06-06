# P4 — Extensions
### When something new comes to memory-based AI, add it here. This file is your living changelog.

← [Back to README](./README.md)

---

## How to use this file

When you learn something new that applies to memory:
1. Pick the right section below (or add a new one)
2. Add your entry with: what it is, when to use it, 3–5 lines of code
3. Update `flow.md` if it changes the architecture diagram
4. Update `cheatsheet.md` if it produces a new interview question

---

## SECTION A — Short-Term Memory Backends

### ✅ Redis — current default
```python
import redis.asyncio as aioredis
redis = aioredis.from_url("redis://localhost:6379", decode_responses=True)
await redis.setex(f"session:{session_id}", 3600, json.dumps(messages[-10:]))
raw = await redis.get(f"session:{session_id}")
```

### ➕ In-memory dict (dev only, no persistence)
```python
SESSION_STORE: dict[str, list[dict]] = {}

def get_session(session_id: str) -> list[dict]:
    return SESSION_STORE.get(session_id, [])

def save_session(session_id: str, messages: list[dict]):
    SESSION_STORE[session_id] = messages[-10:]
```
**When to use:** local dev only. Dies on restart. Never use in production.

---

## SECTION B — Long-Term Memory Backends

### ✅ FAISS (in-memory vector store) — current default
```python
import faiss, numpy as np
index = faiss.IndexFlatIP(1536)
vecs = np.array([m.embedding for m in memories], dtype=np.float32)
faiss.normalize_L2(vecs)
index.add(vecs)
_, indices = index.search(q_vec, k=3)
```

### ➕ SQLite with vector extension (persistent, no external service)
```python
import sqlite3
# Store: INSERT INTO memories (user_id, content, embedding) VALUES (?, ?, ?)
# Retrieve: load all for user_id, build FAISS index in-memory, search
conn = sqlite3.connect("memory.db")
conn.execute("CREATE TABLE IF NOT EXISTS memories (user_id TEXT, content TEXT, embedding BLOB)")
```
**When to use:** small-medium scale, need durability across restarts, no external service.

### ➕ PostgreSQL + pgvector (production scale)
```python
# CREATE EXTENSION vector;
# CREATE TABLE memories (user_id TEXT, content TEXT, embedding vector(1536));
# SELECT content, embedding <-> $1 AS distance FROM memories WHERE user_id=$2 ORDER BY distance LIMIT 3;
```
**When to use:** production, millions of users, need SQL transactional guarantees.

---

## SECTION C — Memory Extraction Improvements

### ✅ Basic LLM extraction — current default (code.py)

### ➕ Structured extraction (typed output)
```python
from pydantic import BaseModel

class ExtractedMemory(BaseModel):
    worth_storing: bool
    content: str | None  # None if not worth storing
    category: str | None  # "preference" | "goal" | "constraint" | "fact"

response = await llm.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[...],
    response_format=ExtractedMemory,
)
memory = response.choices[0].message.parsed
```
**When to use:** when you want to categorize memories and filter by type later.

### ➕ Memory deduplication
Before storing, check if a very similar memory already exists:
```python
async def is_duplicate(content: str, user_id: str, threshold=0.92) -> bool:
    vec = await embed_text(content, llm)
    results = store.search(vec, top_k=1, user_id=user_id)
    if results and results[0]["score"] > threshold:
        return True  # too similar to an existing memory
    return False
```

---

## SECTION D — Memory Management

### ➕ Memory capping (prevent unbounded growth)
```python
MAX_MEMORIES_PER_USER = 200

def add_memory(user_id: str, entry: MemoryEntry):
    memories = user_memories.get(user_id, [])
    if len(memories) >= MAX_MEMORIES_PER_USER:
        memories.pop(0)   # evict oldest (or evict least-accessed)
    memories.append(entry)
    user_memories[user_id] = memories
```

### ➕ Memory compression (summarize old memories)
```python
# When memory count exceeds threshold, summarize the oldest N into one
async def compress_memories(user_id: str, keep_recent=50, summarize_n=100):
    memories = user_memories[user_id]
    old = memories[:-keep_recent][:summarize_n]
    summary_prompt = f"Summarize these facts about the user in 3-5 sentences:\n" + \
                     "\n".join(f"- {m.content}" for m in old)
    summary = await call_llm(summary_prompt)
    compressed = MemoryEntry(user_id=user_id, content=summary, ...)
    user_memories[user_id] = [compressed] + memories[-keep_recent:]
```

### ➕ Memory deletion (right to be forgotten)
```python
async def delete_user_memory(user_id: str):
    if user_id in user_memories:
        del user_memories[user_id]
    await redis.delete(f"session:{user_id}:*")   # delete all sessions
```

---

## SECTION E — Future patterns that grow out of P4

| What you add to P4 | It becomes |
|---|---|
| + Tool to search memory explicitly | → P3 + P4 (agent with memory) |
| + Stream responses while building context | → P5 + P4 (streaming with memory) |
| + RAG over user's documents + memory | → P2 + P4 (personalized RAG) |
| + Multi-tenant memory with strict isolation | → Production-grade P4 |

---

← [Back to README](./README.md) | [→ Cheatsheet](./cheatsheet.md)
