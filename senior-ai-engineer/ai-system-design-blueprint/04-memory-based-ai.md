# Architecture 4 — Memory-Based AI
## Golden Memory: `Retrieve → Context Build → LLM → Store`

**Use for:** personalized assistants · long chat memory · user preference bots

---

## Architecture Flow

```
User Request
   ↓
FastAPI Endpoint
   ↓
DTO Validation
   ↓
Authentication
   ↓
Identify User Session
   ↓
Fetch Short-term Memory
   ├── recent messages
   ├── session history
   └── active context
   ↓
Fetch Long-term Memory
   ├── user profile
   ├── preferences
   ├── previous interactions
   └── vector memory retrieval
   ↓
Memory Ranking / Relevance Filter
   ↓
Context Builder
   ├── current query
   ├── short-term memory
   └── long-term memory
   ↓
Prompt Assembly
   ↓
LLM API
   ↓
Response Generation
   ↓
Memory Extraction Step
   ↓
Decision: Should this be stored?
   ↓
YES
   ↓
Persist Memory
   ├── Redis
   ├── DB
   └── Vector store
   ↓
Return Response
```

---

## Production Code

```python
# ============================================================
# MEMORY-BASED AI — COMPLETE PRODUCTION CODE
# Stack: FastAPI + OpenAI SDK + Redis (short-term) + FAISS (long-term)
# Pattern: Retrieve → Context Build → LLM → Store
# ============================================================

import os, json, time, logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np
import faiss
import redis.asyncio as aioredis
from fastapi import FastAPI, Depends, HTTPException, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ── 1. MODELS ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    session_id: str = Field(min_length=1)

class ChatResponse(BaseModel):
    answer: str
    session_id: str
    memories_used: int

@dataclass
class MemoryEntry:
    user_id: str
    content: str                      # what to remember
    embedding: list[float] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

# ── 2. SHORT-TERM MEMORY — Redis ─────────────────────────────
# Stores the last N messages of a session (sliding window)
# Key: "session:{session_id}" → JSON list of messages

SHORT_TERM_LIMIT = 10   # keep last 10 messages

async def fetch_short_term_memory(redis: aioredis.Redis, session_id: str) -> list[dict]:
    """Fetch recent messages for this session."""
    raw = await redis.get(f"session:{session_id}")
    if not raw:
        return []
    return json.loads(raw)

async def save_short_term_memory(
    redis: aioredis.Redis,
    session_id: str,
    messages: list[dict],
    ttl: int = 3600,   # 1 hour session TTL
) -> None:
    """Persist updated message history."""
    trimmed = messages[-SHORT_TERM_LIMIT:]   # keep last N
    await redis.setex(f"session:{session_id}", ttl, json.dumps(trimmed))

# ── 3. LONG-TERM MEMORY — FAISS vector store ─────────────────
# Stores persistent facts/preferences about the user
# Key: user_id → list of MemoryEntry with embeddings

async def embed_text(text: str, llm: AsyncOpenAI) -> np.ndarray:
    response = await llm.embeddings.create(model="text-embedding-3-small", input=[text])
    vec = np.array([response.data[0].embedding], dtype=np.float32)
    faiss.normalize_L2(vec)
    return vec

async def fetch_long_term_memory(
    query: str,
    user_id: str,
    user_memories: dict[str, list[MemoryEntry]],
    llm: AsyncOpenAI,
    top_k: int = 3,
) -> list[MemoryEntry]:
    """Retrieve the most relevant long-term memories for this query."""
    memories = user_memories.get(user_id, [])
    if not memories:
        return []

    # Build FAISS index for this user's memories
    vecs = np.array([m.embedding for m in memories], dtype=np.float32)
    index = faiss.IndexFlatIP(1536)
    faiss.normalize_L2(vecs)
    index.add(vecs)

    # Embed query and search
    q_vec = await embed_text(query, llm)
    k = min(top_k, len(memories))
    _, indices = index.search(q_vec, k=k)

    return [memories[i] for i in indices[0] if i < len(memories)]

# ── 4. MEMORY EXTRACTION ─────────────────────────────────────

async def should_store_memory(
    user_message: str,
    assistant_reply: str,
    llm: AsyncOpenAI,
) -> Optional[str]:
    """
    Ask the LLM: is there something worth remembering long-term?
    Returns a memory string if yes, None if no.
    """
    prompt = (
        f"User said: {user_message}\n"
        f"Assistant replied: {assistant_reply}\n\n"
        "Extract ONE short fact worth remembering about this user for future conversations "
        "(preference, goal, constraint, name, role). "
        "If nothing is worth storing, reply with exactly: NOTHING"
    )
    response = await llm.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=80,
    )
    result = response.choices[0].message.content.strip()
    return None if result == "NOTHING" else result

async def persist_long_term_memory(
    user_id: str,
    content: str,
    user_memories: dict[str, list[MemoryEntry]],
    llm: AsyncOpenAI,
) -> None:
    """Embed and store a new memory for the user."""
    vec = await embed_text(content, llm)
    entry = MemoryEntry(user_id=user_id, content=content, embedding=vec[0].tolist())
    if user_id not in user_memories:
        user_memories[user_id] = []
    user_memories[user_id].append(entry)
    logger.info("memory stored user=%s: %.60s", user_id, content)

# ── 5. CONTEXT BUILDER ────────────────────────────────────────

def build_context_messages(
    current_query: str,
    short_term: list[dict],
    long_term_memories: list[MemoryEntry],
) -> list[dict]:
    """Assemble the full message list for the LLM."""
    messages = []

    # System prompt with long-term memory injected
    memory_text = ""
    if long_term_memories:
        facts = "\n".join(f"- {m.content}" for m in long_term_memories)
        memory_text = f"\n\nWhat you know about this user:\n{facts}"

    messages.append({
        "role": "system",
        "content": f"You are a helpful personalized assistant.{memory_text}",
    })

    # Short-term: recent conversation history
    messages.extend(short_term)

    # Current user message
    messages.append({"role": "user", "content": current_query})

    return messages

# ── 6. STARTUP ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3)
    app.state.redis = aioredis.from_url(
        os.environ.get("REDIS_URL", "redis://localhost:6379"),
        decode_responses=True,
    )
    app.state.user_memories: dict[str, list[MemoryEntry]] = {}   # in-memory; use DB in prod
    yield
    await app.state.redis.aclose()

app = FastAPI(title="Memory AI App", lifespan=lifespan)

# ── 7. AUTH ───────────────────────────────────────────────────

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")

# ── 8. ENDPOINT ───────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat_with_memory(
    req: ChatRequest,
    request: Req,
    user: dict = Depends(get_current_user),
) -> ChatResponse:

    user_id    = user["sub"]
    llm        = request.app.state.llm
    redis      = request.app.state.redis
    user_mems  = request.app.state.user_memories

    # ── RETRIEVE ──────────────────────────────────────────────

    # Short-term: session message history
    short_term = await fetch_short_term_memory(redis, req.session_id)

    # Long-term: relevant memories for this query
    long_term = await fetch_long_term_memory(
        query=req.message,
        user_id=user_id,
        user_memories=user_mems,
        llm=llm,
    )

    # ── CONTEXT BUILD ─────────────────────────────────────────

    messages = build_context_messages(req.message, short_term, long_term)

    # ── LLM CALL ──────────────────────────────────────────────

    response = await llm.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.7,
    )
    answer = response.choices[0].message.content.strip()

    # ── UPDATE SHORT-TERM MEMORY ──────────────────────────────

    short_term.append({"role": "user",      "content": req.message})
    short_term.append({"role": "assistant", "content": answer})
    await save_short_term_memory(redis, req.session_id, short_term)

    # ── STORE LONG-TERM MEMORY ────────────────────────────────

    memory_to_store = await should_store_memory(req.message, answer, llm)
    if memory_to_store:
        await persist_long_term_memory(user_id, memory_to_store, user_mems, llm)

    logger.info("memory_chat user=%s session=%s lt_memories=%d",
                user_id, req.session_id, len(long_term))

    return ChatResponse(
        answer=answer,
        session_id=req.session_id,
        memories_used=len(long_term),
    )


# ── INTERVIEW CHEAT SHEET ─────────────────────────────────────
# Q: "How do you implement memory in an AI assistant?"
#
# A: "Two layers. Short-term memory lives in Redis keyed by session ID —
#    it's a JSON list of the last 10 messages, TTL of 1 hour. Every request
#    fetches it, appends the new turn, and saves it back.
#
#    Long-term memory is a vector store keyed by user ID — each entry is
#    an embedded fact about the user (preference, goal, role). On every
#    request I embed the current query and search the user's memory store
#    for relevant facts — top 3 by cosine similarity — and inject them
#    into the system prompt.
#
#    After getting the LLM answer I run a memory extraction step: ask the
#    LLM if the conversation revealed anything worth remembering long-term.
#    If yes, embed it and store it. This is the 'Store' step in
#    Retrieve → Context Build → LLM → Store.
#
#    The key design decision: never put all memories in the prompt.
#    You retrieve only the relevant ones — same principle as RAG."
```

---

## Real Project Example — AstroIntel 360°

AstroIntel is a production implementation of the P4 pattern. Here is how each step maps:

| P4 Step | AstroIntel implementation | File |
|---------|--------------------------|------|
| **Retrieve** | `build_tenant_context(query, tenant_id)` fetches top-K past corrections by TF-IDF cosine similarity, scoped strictly to that tenant | `memory/persona.py` |
| **Context Build** | `persona_injection_node` (first LangGraph node) formats corrections into `persona_context` string and stores in LangGraph state | `graph/pipeline.py` |
| **LLM** | All 15 domain agents call `build_prompt(persona_context=state["persona_context"], ...)` — tone rules and known corrections apply automatically | `agents/` |
| **Store** | `POST /api/v1/analysis/approve` with `edited_insights` → `log_correction()` → `episodic_corrections` SQLite table | `memory/episodic.py` |

**What makes this production-grade vs the template above:**
- No external Redis or vector DB needed — TF-IDF cosine similarity runs in-process
- Multi-tenant isolation: Tenant A's corrections never appear in Tenant B's pipeline
- Persona preferences as a separate key-value store (`persona_preferences` table) — tenant can set tone, forbidden phrases, structural preferences
- SQLite WAL mode — corrections survive process restarts
- Memory is observable: `GET /api/v1/feedback/memory-summary` returns the full memory profile for any tenant

**Demo the P4 pattern directly:**
```bash
# See what memory looks like for the superadmin tenant
curl -H "X-API-Key: sk-master-test-superadmin" \
     http://localhost:8080/api/v1/feedback/memory-summary

# Log a correction (Store step)
curl -X POST -H "X-API-Key: sk-master-test-superadmin" \
     -H "Content-Type: application/json" \
     -d '{"insight_id":"q1_i1","original_text":"Saturn may affect career","corrected_text":"Saturn in 10th house directly delays career milestone until age 36","intent":"career"}' \
     http://localhost:8080/api/v1/corrections

# Next /run for same tenant auto-retrieves this correction (Retrieve step)
```

**Interview answer using AstroIntel:**
> "In AstroIntel I implemented two-layer tenant-scoped memory. Short-term is the in-process LangGraph state for that session — cleared after the response. Long-term is a SQLite episodic corrections table: every time an admin edits an insight before approving it, we log the original and corrected text with the intent and tenant_id. On the next run for that tenant, we cosine-score the current query against all past corrections, take the top 5, and inject them as persona_context before the first agent runs. The Store step is the /approve endpoint — the correction loop is closed without any extra user action. The key insight: memory is not a feature I added on top — it's the feedback mechanism that makes the system improve with every admin review."
