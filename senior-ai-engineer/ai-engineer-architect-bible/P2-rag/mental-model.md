# P2 — Mental Model
### Understand this in 2 minutes. Never forget it.

← [Back to README](./README.md)

---

## The Story: You're a Brilliant Librarian

Imagine you are a librarian with access to a vast library of documents. A customer walks in and asks a question.

A **bad librarian** would make up an answer from memory.

A **good librarian** (RAG) does this:

```
Customer asks: "What's our refund policy for electronics?"
       ↓
You run to the shelves and find the 3 most relevant pages
       ↓
You read those pages
       ↓
You answer: "According to page 7 of the Returns Policy doc:
             electronics can be returned within 30 days..."
```

**That's RAG. The LLM is the librarian. Your vector database is the library. The chunks are the book pages.**

---

## The Two Pipelines Mental Model

RAG has two separate jobs. Keep them mentally separate:

```
INGESTION (done once, offline)
┌─────────────────────────────────────────────────┐
│  Documents → Parse → Chunk → Embed → Store      │
│                                                 │
│  Think: "filling the library with books"        │
└─────────────────────────────────────────────────┘

QUERY (done per request, online)
┌─────────────────────────────────────────────────┐
│  Question → Embed → Search → Rerank → Answer    │
│                                                 │
│  Think: "librarian finding the right pages"     │
└─────────────────────────────────────────────────┘
```

The ingestion pipeline runs once (or when documents change). The query pipeline runs on every user request.

---

## The Critical Rule: Same Model, Both Sides

This catches a lot of people:

```
Ingestion:  text → [embedding model A] → vector [0.1, 0.4, 0.7, ...]
Query:      text → [embedding model B] → vector [0.3, 0.1, 0.9, ...]
```

If you use **different embedding models** for ingestion and query, the vectors are in completely different mathematical spaces. Cosine similarity between them is meaningless. You will get random results.

**Rule: always use the same embedding model for ingestion and query.**

---

## The 3 Quality Dials

| Dial | What it controls | Typical value |
|---|---|---|
| `chunk_size` | How much context per chunk | `800` chars (tune per domain) |
| `overlap` | Context preserved at boundaries | `150` chars |
| `top_k` | How many chunks to retrieve | `5` (then rerank to 3) |

---

## Why Reranking Matters

Vector search gives you **recall** (finds broadly relevant chunks).
Reranker gives you **precision** (finds the MOST relevant chunk for THIS exact question).

```
Vector search returns top 5:
  chunk 3 — score 0.87 (about refunds in general)
  chunk 1 — score 0.85 (about electronics refunds ← THE RIGHT ONE)
  chunk 7 — score 0.83 (about returns process)
  ...

Reranker re-scores:
  chunk 1 — score 0.94 ← now ranked first
  chunk 3 — score 0.61
  chunk 7 — score 0.45
```

Without reranking, your LLM answers from the wrong chunk.

---

## Why RAG Beats Fine-tuning (for most use cases)

| | RAG | Fine-tuning |
|---|---|---|
| Update knowledge | Add document, re-ingest | Retrain the model |
| Cost | Cheap (embedding is cheap) | Expensive |
| Transparency | Can show source citations | Black box |
| When to use | Live / changing knowledge | Style/behaviour change |

---

## In One Sentence (interview answer)

> "RAG splits into two pipelines: ingestion (parse → chunk → embed → store) runs offline; query (embed → search → rerank → augment → generate) runs per request. The key engineering decisions are chunk size and overlap (preserving boundary context), using the same embedding model on both sides (compatible vector spaces), and always reranking before context assembly (precision over recall)."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Cheatsheet](./cheatsheet.md)
