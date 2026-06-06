# P4 — Interview Cheatsheet
### What to say, what to never say, what catches people out.

← [Back to README](./README.md)

---

## TOP 5 INTERVIEW QUESTIONS — Exact answers

---

### Q1: "How do you implement memory in an AI assistant?"

**Say this:**
> "Two layers. Short-term lives in Redis keyed by session_id — it's a JSON list of the last 10 messages with a TTL of 1 hour. Every request fetches it, appends the new turn, trims to the last 10, and saves back. Long-term is a FAISS vector store keyed by user_id — each entry is an embedded fact about the user: their preferences, goals, constraints. On every request I embed the current query and search the user's memory store for the top-3 most relevant facts by cosine similarity, and inject them into the system prompt. After the LLM responds I run a memory extraction step: ask the LLM if the conversation revealed anything worth remembering permanently. If yes, embed it and store it. This is Retrieve → Context Build → LLM → Store."

**What they're listening for:** two layers, Redis for short-term, FAISS for long-term, same-model embedding, extraction step after LLM call

---

### Q2: "Why not just put all memories in the system prompt?"

**Say this:**
> "Token cost and signal-to-noise ratio. If a user has 500 stored memories and every request includes all 500, that's potentially 100K tokens per call — expensive and slow. More importantly, 497 of those memories are irrelevant to the current question, so they dilute the LLM's attention. Instead I retrieve only the top-3 most relevant memories by embedding the current query and running cosine similarity search. Same principle as RAG — never put everything in the prompt, only what's needed for this specific request."

---

### Q3: "How does the memory extraction step work?"

**Say this:**
> "After the LLM responds, I make a second cheap LLM call with a prompt like: 'User said X. Assistant replied Y. Extract ONE short fact worth remembering about this user — preference, goal, constraint, name, role. If nothing is worth storing, reply with exactly: NOTHING.' If it returns NOTHING (which is most turns), no memory is created. If it returns a fact, I embed it with the same model as the long-term memory store and append it to the user's FAISS index. The extraction model uses temperature=0 and max_tokens=80 — it's fast and cheap."

---

### Q4: "How do you prevent memory from one user affecting another user?"

**Say this:**
> "Strict scoping by user_id on every read and write. The FAISS index is per-user — user A's memories are never in user B's index. Redis keys include the session_id which is derived from the user's JWT — so sessions can't be accessed by other users. In production I'd add a tenant_id check on every memory operation as an extra guard. The pattern from AstroIntel: all memory reads and writes are wrapped in functions that take user_id as a required parameter, so it's impossible to accidentally read cross-tenant."

---

### Q5: "What's the difference between short-term and long-term memory in your system?"

**Say this:**
> "Short-term is conversational — the last N messages of the current session. It answers 'what did we just talk about?' It's stored in Redis, expires after 1 hour, and is scoped to the session_id. Long-term is biographical — persistent facts about the person across all sessions. It answers 'who is this person?' It's stored as embeddings in FAISS, never expires automatically, and is scoped to the user_id. The decision of what goes long-term is made by the LLM extraction step — not everything is worth storing permanently."

---

## QUICK-FIRE Q&A

| Question | Answer |
|---|---|
| Why Redis for short-term? | It's a key-value store with TTL support. Simple, fast, no schema. |
| Why FAISS for long-term? | In-process vector search — no external service needed. Use Pinecone for scale. |
| What's `SHORT_TERM_LIMIT`? | Max messages kept in the sliding window. Usually 10. More = expensive, less = forgets quickly. |
| What's `SESSION_TTL`? | TTL on Redis key. After this time, session history is gone. Usually 3600s (1 hour). |
| What embedding model? | Same as RAG — `text-embedding-3-small`. Must be consistent. |
| What's `memories_used` in response? | How many long-term facts were injected this turn. Useful for debugging. |
| Can you delete a memory? | Yes — remove the MemoryEntry from the user's list and rebuild the FAISS index. |

---

## GOTCHAS — Things that catch people out

**Gotcha 1: Different embedding models for storage and retrieval**
Same as RAG. If you embed memories with model A and query with model B, similarity scores are meaningless.
```python
EMBEDDING_MODEL = "text-embedding-3-small"  # one constant everywhere
```

**Gotcha 2: Not saving short-term memory AFTER getting the answer**
```python
# WRONG — save before LLM so you miss the assistant's response
await save_short_term_memory(redis, session_id, short_term)
answer = await call_llm(messages)

# RIGHT — save after so both turns are in memory
answer = await call_llm(messages)
short_term.append({"role": "user",      "content": req.message})
short_term.append({"role": "assistant", "content": answer})
await save_short_term_memory(redis, session_id, short_term)
```

**Gotcha 3: Storing sensitive data in long-term memory**
The LLM extraction step might try to store passwords, API keys, or PII. Add a filter:
```python
FORBIDDEN_PATTERNS = [r"\bpassword\b", r"\bsecret\b", r"\bkey\b", r"\b\d{4}[-\s]?\d{4}\b"]
```

**Gotcha 4: Memory store grows unbounded**
In-memory dict + FAISS index grows forever. In production: cap per-user memory at N entries, evict oldest when full.

**Gotcha 5: Rebuilding FAISS index from scratch on every request**
```python
# WRONG — O(n) index build per request
index = faiss.IndexFlatIP(1536)
index.add(all_user_memories)
```
For production: maintain a persistent index, add incrementally. Rebuild only when adding is not possible (e.g., after deletions).

---

## WHAT TO SAY IF STUCK

> "Two layers: Redis (short-term, session-scoped, TTL 1 hour, last 10 messages) and FAISS (long-term, user-scoped, permanent facts). Fetch both before calling LLM. After LLM responds: save new turn to Redis, run extraction step to check if anything is worth storing in FAISS. Pattern: Retrieve → Context Build → LLM → Store."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Code](./code.py) | [→ Extensions](./extensions.md)
