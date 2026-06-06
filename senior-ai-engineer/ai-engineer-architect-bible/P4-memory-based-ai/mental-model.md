# P4 — Mental Model
### Understand this in 2 minutes. Never forget it.

← [Back to README](./README.md)

---

## The Story: You're a Therapist with Two Notebooks

Imagine you're a therapist. A patient comes in for their appointment.

You have **two notebooks**:

```
SCRATCHPAD (short-term = Redis)
┌────────────────────────────────────┐
│  Today's session notes:            │
│  - Patient mentioned back pain     │
│  - Asked about yoga                │
│  - Seemed stressed about work      │
│  (throw away after session ends)   │
└────────────────────────────────────┘

PATIENT FILE (long-term = FAISS)
┌────────────────────────────────────┐
│  Permanent facts about this person:│
│  - Allergic to penicillin          │
│  - Prefers morning appointments    │
│  - Has two kids, ages 8 and 11     │
│  - Software engineer, high stress  │
└────────────────────────────────────┘
```

Before each session, you read BOTH notebooks. Then you tailor your response to this specific person.

**That's P4. The scratchpad is Redis (session memory). The patient file is FAISS (long-term facts). You (the LLM) never start cold.**

---

## The Two Memory Layers

```
SHORT-TERM MEMORY (Redis)
  Key:    session:{session_id}
  Value:  JSON list of last 10 messages
  TTL:    1 hour (auto-expires)
  Use:    "What did we say earlier in this conversation?"

LONG-TERM MEMORY (FAISS / Vector)
  Key:    user_id
  Value:  list of MemoryEntry (text + embedding vector)
  TTL:    permanent (until explicitly deleted)
  Use:    "What do I know about this person?"
```

---

## The Store Step: How Memories Are Created

After every LLM response, you ask:
```
"Did this conversation reveal anything worth remembering permanently?"
```

The LLM answers either:
- `"NOTHING"` → no permanent memory created (most turns)
- `"User prefers Python over Java"` → embed it, store in FAISS

This is the **feedback loop** that makes the system improve over time. Every conversation potentially adds to what you know about the user.

---

## Why Not Just Put All Memories in Every Prompt?

This is the question everyone asks. The answer: **tokens and relevance**.

```
User has 500 stored memories.
User asks: "What's the capital of France?"

All 500 memories → prompt → 500k tokens → expensive + slow + noisy

TOP 3 relevant memories → prompt → 3 facts → cheap + fast + on-point
```

You retrieve only the relevant memories for THIS specific question. Same principle as RAG (P2). The retrieval mechanism IS the key skill.

---

## The 3 Dials

| Dial | What it controls | Typical value |
|---|---|---|
| `SHORT_TERM_LIMIT` | How many messages in sliding window | `10` |
| `SESSION_TTL` | How long sessions persist | `3600` (1 hour) |
| `top_k` | How many long-term memories retrieved | `3` |

---

## Failure Modes

| Failure | Why it happens | Fix |
|---|---|---|
| Bot forgets mid-conversation | SHORT_TERM_LIMIT too small | Increase limit |
| Context window overflow | Too many memories retrieved | Decrease top_k, or compress memories |
| Wrong memories retrieved | Embedding model mismatch | Use same model for storage + retrieval |
| Memory leaks PII | No memory filter | Filter what gets stored (no names, no credentials) |
| Cross-user memory bleed | Missing user_id scoping | Always scope reads/writes to `user_id` |

---

## In One Sentence (interview answer)

> "Two memory layers: short-term in Redis keyed by session_id — last 10 messages, 1-hour TTL — and long-term in FAISS keyed by user_id — embedded facts retrieved by cosine similarity. After each LLM response, an extraction step asks the LLM if anything is worth storing permanently. If yes, embed and append to FAISS. The key insight is to retrieve only the top-K relevant long-term memories — same principle as RAG — never put everything in the prompt."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Cheatsheet](./cheatsheet.md)
