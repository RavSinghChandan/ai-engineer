# Birla Opus (Aditya Birla Group) — AI Engineer Interview Learnings
**Date:** 2026-05-12
**Role:** Senior AI Engineer
**Recruiter:** Rupesh, Team Forward (forward.net.in)

---

## What Was Asked

The interviewer tested RAG system design end-to-end, both conceptually and as live coding:

1. **Top-K retrieval and reranking strategies**
2. **Hallucination mitigation strategies**
3. **Embedding concepts and choices**
4. **Live coding:** Given `demo.txt` (sample JSON/documents) and a starter `app-policy.py`, write from scratch:
   - Chunking code
   - Embedding code
   - LLM call
   - Retrieval
   - Answer generation
   - No Google. No autocomplete. Raw Python.

---

## Where You Missed

- Top-K tuning and reranking — couldn't explain the "why" behind strategies
- Hallucination handling approaches — not structured enough
- Live coding the full RAG pipeline from scratch without IDE help

---

## PART 1 — RAG Concepts You Must Know Cold

### 1.1 What is Top-K Retrieval?

When you embed a query and search a vector store, `top_k` is how many nearest neighbor chunks you return.

```
query → embed → similarity search → top_k chunks → LLM
```

**Problem with raw Top-K:**
- Chunk 1 score: 0.91 (very relevant)
- Chunk 2 score: 0.89 (relevant)
- Chunk 3 score: 0.87 (barely relevant, adds noise)

If k=10, you flood the LLM context with noise → hallucinations go up, quality goes down.

**Strategies:**

| Strategy | What It Does | When to Use |
|---|---|---|
| Fixed Top-K | Always return k chunks | Simple, fast, baseline |
| Score threshold | Only return chunks above similarity score X | When you need precision over recall |
| MMR (Maximal Marginal Relevance) | Diversify results — avoid returning near-duplicate chunks | When your doc has repetitive sections |
| Reranking (Cross-Encoder) | Re-score top-K with a heavier model (e.g. Cohere Rerank, BGE) | When retrieval precision matters most |
| Hybrid Search | BM25 (keyword) + dense vector, combine scores | When users use exact terms AND semantic meaning |

---

### 1.2 Reranking — The Critical Step You Missed

**Two-stage retrieval:**

```
Stage 1: Bi-encoder (fast, approximate)
  query → embed → FAISS/Chroma → top 20 chunks

Stage 2: Cross-encoder (slow, precise)
  (query, chunk_i) → CrossEncoder model → relevance score
  → re-sort → take top 5
```

**Why cross-encoders are better but slower:**
- Bi-encoder: encodes query and doc *separately*, compares vectors
- Cross-encoder: sees query + doc *together*, understands their relationship
- Cross-encoder is 10-50x more compute but much more accurate

**Tools:**
- `sentence-transformers` CrossEncoder
- Cohere Rerank API
- BGE Reranker (open source, strong)

**Interview answer for "why rerank?":**
> "Bi-encoders optimize for speed at retrieval time, but they miss nuanced relevance because they never see the query and document together. A cross-encoder reranks the top-N candidates by scoring each (query, doc) pair jointly — much more accurate. We use two stages because running a cross-encoder over the full corpus would be too slow."

---

### 1.3 Hallucination — Strategies You Must Know

Hallucination = LLM generates content not supported by the retrieved context.

**Root causes in RAG:**
1. Retrieved chunks are irrelevant → LLM fills gaps
2. k is too high → too much noise in context
3. Prompt doesn't constrain the LLM enough
4. LLM over-relies on parametric (training) knowledge

**Mitigation strategies:**

| Strategy | How | Impact |
|---|---|---|
| Constrained prompt | "Answer ONLY from the context below. If not found, say I don't know." | High — easiest win |
| Score threshold gating | Don't call LLM if max similarity < 0.7 | Prevents low-confidence answers |
| Faithfulness check | After answer, verify each sentence is grounded in a retrieved chunk (RAG-as-judge) | High quality, more latency |
| Source citation | Force LLM to cite which chunk it used | Makes hallucinations visible |
| Reduce k | Start with k=3 not k=10 | Less noise in context |
| Reranking | Better chunks = less hallucination | High |
| Self-consistency | Ask LLM same Q 3 times, majority vote | Expensive but high quality |

**Interview answer for "how do you handle hallucination?":**
> "First I constrain the prompt — 'use only the context below, say I don't know if not found.' Second I gate on retrieval confidence — if similarity score is below a threshold, I don't call the LLM at all. Third I use reranking to ensure the chunks going into context are actually relevant. For high-stakes use cases I add a faithfulness check — a second LLM pass that verifies each claim in the answer against the retrieved chunks."

---

### 1.4 Embeddings — What the Interviewer Expected

**What is an embedding?**
A dense vector representation of text that captures semantic meaning. Similar meaning → similar vectors → close in vector space.

**Embedding model choices:**

| Model | Size | Quality | Speed | Cost |
|---|---|---|---|---|
| `text-embedding-ada-002` (OpenAI) | 1536-dim | Good | Fast | Paid |
| `text-embedding-3-small` (OpenAI) | 1536-dim | Better | Fast | Cheap |
| `BAAI/bge-small-en` | 384-dim | Very Good | Very Fast | Free |
| `sentence-transformers/all-MiniLM-L6-v2` | 384-dim | Good | Fast | Free |
| `BAAI/bge-large-en-v1.5` | 1024-dim | Excellent | Slower | Free |

**Key concepts:**
- Cosine similarity: angle between two vectors (0 to 1, higher = more similar)
- Dot product: faster, used when vectors are normalized
- Chunking affects embedding quality — chunk must be semantically complete
- Same model must be used for indexing AND querying

**Interview answer for "how do you choose embeddings?":**
> "I consider three things: domain fit (general vs domain-specific), dimensionality (higher = more expressive but more memory), and cost. For production I'd benchmark top-3 candidates on a gold set of query-document pairs from the actual use case. For HR policy RAG like this, `bge-small-en` is a strong free baseline — fast, 384-dim, outperforms ada-002 on many benchmarks."

---

## PART 2 — The Live Coding Task (What He Wanted You to Write)

Given `demo.txt` documents and a broken/incomplete `app-policy.py`, write a complete RAG pipeline from scratch.

### What a Complete Solution Looks Like

```python
# birla_opus_rag.py
# Complete RAG pipeline: chunk → embed → store → retrieve → generate

import os
import re
import json
import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Tuple
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# ─────────────────────────────────────────
# 1. DATA — the documents from demo.txt
# ─────────────────────────────────────────

documents = [
    {
        "id": "leave_policy",
        "text": """
Employees are entitled to 12 casual leaves annually.
Unused casual leaves cannot be carried forward.
Sick leave requires manager approval for more than 2 consecutive days.
"""
    },
    {
        "id": "travel_policy",
        "text": """
Employees traveling within city limits can claim cab reimbursement up to INR 1500 per day.
Hotel booking is allowed only for travel exceeding 100 km.
"""
    }
]

queries = [
    "Can I carry forward my casual leaves?",
    "Can I claim hotel reimbursement for local travel?"
]


# ─────────────────────────────────────────
# 2. CHUNKING
# ─────────────────────────────────────────

@dataclass
class Chunk:
    chunk_id: str
    source_doc: str
    content: str
    metadata: dict = field(default_factory=dict)


def chunk_document(doc_id: str, text: str, max_chars: int = 300, overlap_chars: int = 50) -> List[Chunk]:
    """Split document text into overlapping chunks."""
    # Split on double newlines (paragraph boundaries)
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    
    chunks = []
    buffer = ""
    chunk_index = 0

    for para in paragraphs:
        if len(buffer) + len(para) <= max_chars:
            buffer += (" " if buffer else "") + para
        else:
            if buffer:
                chunks.append(Chunk(
                    chunk_id=f"{doc_id}_chunk_{chunk_index}",
                    source_doc=doc_id,
                    content=buffer,
                    metadata={"index": chunk_index}
                ))
                chunk_index += 1
                # carry overlap forward
                buffer = buffer[-overlap_chars:] + " " + para
            else:
                buffer = para

    if buffer:
        chunks.append(Chunk(
            chunk_id=f"{doc_id}_chunk_{chunk_index}",
            source_doc=doc_id,
            content=buffer,
            metadata={"index": chunk_index}
        ))

    return chunks


# ─────────────────────────────────────────
# 3. EMBEDDING
# ─────────────────────────────────────────

def embed_texts(texts: List[str]) -> np.ndarray:
    """Embed a list of texts using OpenAI. Returns (N, D) float32 array."""
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )
    vectors = [item.embedding for item in response.data]
    return np.array(vectors, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


# ─────────────────────────────────────────
# 4. IN-MEMORY VECTOR STORE
# ─────────────────────────────────────────

class SimpleVectorStore:
    def __init__(self):
        self.chunks: List[Chunk] = []
        self.vectors: np.ndarray = None

    def add(self, chunks: List[Chunk], vectors: np.ndarray):
        self.chunks.extend(chunks)
        if self.vectors is None:
            self.vectors = vectors
        else:
            self.vectors = np.vstack([self.vectors, vectors])

    def search(self, query_vec: np.ndarray, top_k: int = 3) -> List[Tuple[Chunk, float]]:
        """Return top_k (chunk, score) sorted by cosine similarity."""
        scores = [cosine_similarity(query_vec, v) for v in self.vectors]
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        return [(self.chunks[i], score) for i, score in ranked[:top_k]]


# ─────────────────────────────────────────
# 5. RETRIEVAL
# ─────────────────────────────────────────

def retrieve(store: SimpleVectorStore, query: str, top_k: int = 3, threshold: float = 0.5) -> List[Chunk]:
    """Embed query, search store, filter by threshold."""
    query_vec = embed_texts([query])[0]
    results = store.search(query_vec, top_k=top_k)
    
    # Hallucination guard: only use chunks above similarity threshold
    filtered = [chunk for chunk, score in results if score >= threshold]
    
    if not filtered:
        print(f"[WARN] No chunks above threshold {threshold} for query: '{query}'")
    
    return filtered


# ─────────────────────────────────────────
# 6. PROMPT + LLM CALL
# ─────────────────────────────────────────

def build_prompt(query: str, chunks: List[Chunk]) -> str:
    context = "\n\n".join(f"[{c.source_doc}] {c.content}" for c in chunks)
    return f"""You are an HR Assistant.
Answer the question using ONLY the context below.
If the answer is not in the context, say: "I don't have that information in the policy."

Context:
{context}

Question: {query}
Answer:"""


def generate_answer(query: str, chunks: List[Chunk]) -> str:
    if not chunks:
        return "I don't have that information in the policy."
    
    prompt = build_prompt(query, chunks)
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,       # deterministic — reduces hallucination
        max_tokens=256
    )
    return response.choices[0].message.content.strip()


# ─────────────────────────────────────────
# 7. PIPELINE — wire it all together
# ─────────────────────────────────────────

def build_index(documents: List[Dict]) -> SimpleVectorStore:
    store = SimpleVectorStore()
    
    for doc in documents:
        chunks = chunk_document(doc["id"], doc["text"])
        if not chunks:
            continue
        texts = [c.content for c in chunks]
        vectors = embed_texts(texts)
        store.add(chunks, vectors)
        print(f"Indexed '{doc['id']}': {len(chunks)} chunk(s)")
    
    return store


def run_rag(store: SimpleVectorStore, queries: List[str]):
    print("\n" + "="*60)
    for query in queries:
        print(f"\nQ: {query}")
        chunks = retrieve(store, query, top_k=3, threshold=0.5)
        answer = generate_answer(query, chunks)
        print(f"A: {answer}")
        print("-"*60)


if __name__ == "__main__":
    store = build_index(documents)
    run_rag(store, queries)
```

---

## PART 3 — Bugs in Your Original `app-policy.py`

The interviewer's starter file had these issues. Know them — he may ask you to spot them:

| Line | Bug | Fix |
|---|---|---|
| `char(10).join(context)` | `char` is not Python — should be `"\n".join(context)` | Use string literal |
| `class HRPolicyChunker` — `chunk_document` not indented | Method is outside the class | Indent under class |
| `section_content`, `section_titile` not defined | Variable used before assignment | Assign from the `sections` dict loop |
| `final_chunks.exntend(...)` | Typo — `exntend` → `extend` | Fix spelling |
| `re.finditer(section_pattern)` — missing `text` arg | `finditer` takes `(pattern, string)` | Pass `text` as second arg |
| `for i, matches in enumerate(matches)` | Loop variable shadows outer `matches` | Rename loop var to `match` |
| `matches[i+1].start()` | `matches` is now the loop var, not the list | Use the list (rename it `all_matches`) |
| `medtadata` in `@dataclass Chunk` | Typo in field name | Should be `metadata` |
| `re.split(r" \ns*\n", content)` | Regex wrong — `\ns*` should be `\n\s*` | Fix escape |

---

## PART 4 — Concepts to Review Before Next Interview

### Chunking Strategies

| Strategy | Best For |
|---|---|
| Fixed-size (chars/tokens) | Simple, fast — good baseline |
| Paragraph/sentence boundary | HR policies, structured docs |
| Semantic chunking | When topics shift mid-paragraph |
| Hierarchical | Large docs with clear sections (chunk section + chunk paragraph) |
| Overlap | Always use — preserves context across chunk boundaries |

**Rule of thumb:** chunk size should match the granularity of queries. If users ask narrow factual questions → small chunks (200-400 chars). If questions need broader context → larger chunks (800-1200 chars).

### Why `temperature=0` Matters for RAG

Setting `temperature=0` makes the LLM deterministic — it picks the highest-probability token at each step. For factual Q&A over policy documents you want this. Higher temperature = more creative = more hallucination risk.

### Vector Store Options

| Store | Best For |
|---|---|
| FAISS | Local, fast, no server needed — great for demos |
| Chroma | Local + persistent, easy LangChain integration |
| Pinecone | Managed, production scale |
| Weaviate | Production + hybrid search built in |
| pgvector | If you're already on Postgres |

---

## PART 5 — Questions to Ask the Interviewer Next Time

These show seniority:

1. "What's the primary data source for the RAG — internal documents, web, or structured DB?"
2. "What are the latency SLAs — is this user-facing real-time or async batch?"
3. "Do you need multilingual support or is it English-only?"
4. "How do you currently handle model versioning and embedding drift?"
5. "What's the observability story — do you track retrieval quality metrics like MRR or NDCG?"

---

## Summary — What to Practice Before Next Interview

- [ ] Write the full RAG pipeline from scratch in <20 minutes, no IDE help
- [ ] Explain Top-K vs reranking in 3 sentences
- [ ] Explain hallucination mitigations — at least 4 strategies
- [ ] Name 3 embedding models and when to use each
- [ ] Spot the 9 bugs in `app-policy.py` in 5 minutes
- [ ] Know chunking strategies and when to use each
