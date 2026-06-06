"""
P4 — MEMORY-BASED AI
Golden Memory: Retrieve → Context Build → LLM → Store
Stack: FastAPI + AsyncOpenAI + Redis (short-term) + FAISS (long-term)
================================================================
HOW TO USE THIS FILE:
  - Each section is labelled. Read top to bottom once.
  - Copy any section directly into your project.
  - SHORT-TERM MEMORY: Sections 2-3
  - LONG-TERM MEMORY:  Sections 4-5
  - CONTEXT BUILDER:   Section 6
  - MEMORY EXTRACTION: Section 7
  - To change short-term limit: SHORT_TERM_LIMIT constant
  - To change long-term backend: Section 4 (replace FAISS with Pinecone)
================================================================
"""

import os, json, time, logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import faiss
import redis.asyncio as aioredis
from fastapi import FastAPI, Depends, HTTPException, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ── Tuning constants ────────────────────────────────────────────
SHORT_TERM_LIMIT = 10     # max messages in sliding window
SESSION_TTL      = 3600   # Redis TTL in seconds (1 hour)
LONG_TERM_TOP_K  = 3      # how many long-term memories to retrieve per query
EMBEDDING_MODEL  = "text-embedding-3-small"   # MUST be consistent


# ================================================================
# SECTION 1 — REQUEST / RESPONSE MODELS (Pydantic DTOs)
# ================================================================

class ChatRequest(BaseModel):
    message:    str = Field(min_length=1, max_length=5000)
    session_id: str = Field(min_length=1)

class ChatResponse(BaseModel):
    answer:        str
    session_id:    str
    memories_used: int   # how many long-term facts influenced this response


# ================================================================
# SECTION 2 — MEMORY ENTRY (long-term store unit)
# ================================================================

@dataclass
class MemoryEntry:
    user_id:   str
    content:   str                          # the fact to remember
    embedding: list[float] = field(default_factory=list)
    timestamp: float       = field(default_factory=time.time)


# ================================================================
# SECTION 3 — SHORT-TERM MEMORY  (Redis)
# ================================================================
# Key:   session:{session_id}
# Value: JSON list of last SHORT_TERM_LIMIT messages
# TTL:   SESSION_TTL (auto-expires after inactivity)

async def fetch_short_term_memory(
    redis:      aioredis.Redis,
    session_id: str,
) -> list[dict]:
    """Fetch recent conversation history for this session."""
    raw = await redis.get(f"session:{session_id}")
    if not raw:
        return []
    return json.loads(raw)

async def save_short_term_memory(
    redis:      aioredis.Redis,
    session_id: str,
    messages:   list[dict],
    ttl:        int = SESSION_TTL,
) -> None:
    """Save updated history. Trims to last SHORT_TERM_LIMIT messages."""
    trimmed = messages[-SHORT_TERM_LIMIT:]
    await redis.setex(f"session:{session_id}", ttl, json.dumps(trimmed))


# ================================================================
# SECTION 4 — LONG-TERM MEMORY  (FAISS vector store)
# ================================================================
# Key:   user_id (in-memory dict keyed by user_id)
# Value: list of MemoryEntry with embedding vectors
# TTL:   permanent (until explicitly deleted)

async def embed_text(text: str, llm: AsyncOpenAI) -> np.ndarray:
    resp = await llm.embeddings.create(model=EMBEDDING_MODEL, input=[text])
    vec  = np.array([resp.data[0].embedding], dtype=np.float32)
    faiss.normalize_L2(vec)
    return vec

async def fetch_long_term_memory(
    query:         str,
    user_id:       str,
    user_memories: dict[str, list[MemoryEntry]],
    llm:           AsyncOpenAI,
    top_k:         int = LONG_TERM_TOP_K,
) -> list[MemoryEntry]:
    """Retrieve the most relevant long-term memories for this query."""
    memories = user_memories.get(user_id, [])
    if not memories:
        return []

    # Build per-user FAISS index (in-memory, rebuilt each query)
    # For production: maintain persistent index, update incrementally
    vecs = np.array([m.embedding for m in memories], dtype=np.float32)
    faiss.normalize_L2(vecs)
    index = faiss.IndexFlatIP(1536)
    index.add(vecs)

    q_vec = await embed_text(query, llm)
    k     = min(top_k, len(memories))
    _, indices = index.search(q_vec, k=k)

    return [memories[i] for i in indices[0] if i < len(memories)]

async def persist_long_term_memory(
    user_id:       str,
    content:       str,
    user_memories: dict[str, list[MemoryEntry]],
    llm:           AsyncOpenAI,
) -> None:
    """Embed and store a new permanent memory for the user."""
    vec   = await embed_text(content, llm)
    entry = MemoryEntry(user_id=user_id, content=content, embedding=vec[0].tolist())
    if user_id not in user_memories:
        user_memories[user_id] = []
    user_memories[user_id].append(entry)
    logger.info("memory stored user=%s content=%.60s", user_id, content)


# ================================================================
# SECTION 5 — MEMORY EXTRACTION  ← THE FEEDBACK LOOP
# ================================================================
# After every LLM response: ask if anything is worth remembering.
# Returns a fact string, or None if nothing is worth storing.

async def should_store_memory(
    user_message:    str,
    assistant_reply: str,
    llm:             AsyncOpenAI,
) -> Optional[str]:
    """
    Ask the LLM: did this conversation reveal anything worth remembering permanently?
    Returns a fact string if yes, None if no (NOTHING response).
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
        temperature=0.0,   # deterministic extraction
        max_tokens=80,     # short fact only
    )
    result = (response.choices[0].message.content or "").strip()
    return None if result.upper() == "NOTHING" else result


# ================================================================
# SECTION 6 — CONTEXT BUILDER  ← YOUR SKILL
# ================================================================
# Assembles short-term + long-term memory into the LLM messages list.
# Long-term facts go in the system prompt.
# Short-term history goes as conversation messages.

def build_context_messages(
    current_query:      str,
    short_term:         list[dict],
    long_term_memories: list[MemoryEntry],
) -> list[dict]:
    """
    Assemble the full message list for the memory-augmented LLM call.

    Structure:
        [system: role + long-term facts]
        [user: old message]
        [assistant: old response]
        ...  (short-term history)
        [user: current message]
    """
    messages     = []
    memory_text  = ""

    if long_term_memories:
        facts = "\n".join(f"- {m.content}" for m in long_term_memories)
        memory_text = f"\n\nWhat you know about this user:\n{facts}"

    messages.append({
        "role":    "system",
        "content": f"You are a helpful personalized assistant.{memory_text}",
    })

    # Short-term: recent conversation turns
    messages.extend(short_term)

    # Current user message (always last)
    messages.append({"role": "user", "content": current_query})

    return messages


# ================================================================
# SECTION 7 — APP STARTUP
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm  = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3)
    app.state.redis = aioredis.from_url(
        os.environ.get("REDIS_URL", "redis://localhost:6379"),
        decode_responses=True,
    )
    # In production: load user_memories from database here
    app.state.user_memories: dict[str, list[MemoryEntry]] = {}
    yield
    await app.state.redis.aclose()

app = FastAPI(title="Memory AI App", lifespan=lifespan)


# ================================================================
# SECTION 8 — AUTH
# ================================================================

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ================================================================
# SECTION 9 — MAIN ENDPOINT
# ================================================================

@app.post("/chat", response_model=ChatResponse)
async def chat_with_memory(
    req:     ChatRequest,
    request: Req,
    user:    dict = Depends(get_current_user),
) -> ChatResponse:

    user_id    = user["sub"]
    llm        = request.app.state.llm
    redis      = request.app.state.redis
    user_mems  = request.app.state.user_memories

    # ── RETRIEVE ─────────────────────────────────────────────────
    short_term = await fetch_short_term_memory(redis, req.session_id)
    long_term  = await fetch_long_term_memory(
        query=req.message,
        user_id=user_id,
        user_memories=user_mems,
        llm=llm,
    )

    # ── CONTEXT BUILD ─────────────────────────────────────────────
    messages = build_context_messages(req.message, short_term, long_term)

    # ── LLM CALL ─────────────────────────────────────────────────
    try:
        response = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7,
        )
    except Exception as e:
        logger.error("LLM error: %s", e)
        raise HTTPException(502, "LLM unavailable")

    answer = (response.choices[0].message.content or "").strip()

    # ── UPDATE SHORT-TERM MEMORY ──────────────────────────────────
    short_term.append({"role": "user",      "content": req.message})
    short_term.append({"role": "assistant", "content": answer})
    await save_short_term_memory(redis, req.session_id, short_term)

    # ── STORE LONG-TERM MEMORY ────────────────────────────────────
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


# ================================================================
# SECTION 10 — VARIANTS
# ================================================================

# VARIANT A: GET USER MEMORY (debug / admin)
# ───────────────────────────────────────────
# @app.get("/memory/{user_id}")
# async def get_user_memory(
#     user_id: str,
#     request: Req,
#     user:    dict = Depends(get_current_user),
# ) -> dict:
#     memories = request.app.state.user_memories.get(user_id, [])
#     return {
#         "user_id":      user_id,
#         "memory_count": len(memories),
#         "memories":     [{"content": m.content, "timestamp": m.timestamp} for m in memories],
#     }


# VARIANT B: DELETE USER MEMORY (right to be forgotten)
# ───────────────────────────────────────────────────────
# @app.delete("/memory/{user_id}")
# async def delete_user_memory(user_id: str, request: Req):
#     if user_id in request.app.state.user_memories:
#         del request.app.state.user_memories[user_id]
#     # Also clear all Redis sessions for this user if you have a mapping
#     return {"status": "deleted", "user_id": user_id}
