# P2 — Interview Cheatsheet
### What to say, what to never say, what catches people out.

← [Back to README](./README.md)

---

## TOP 5 INTERVIEW QUESTIONS — Exact answers

---

### Q1: "Walk me through how RAG works."

**Say this:**
> "RAG has two pipelines. Ingestion runs offline: parse documents into text, split into overlapping chunks (e.g. 800 chars with 150 overlap), embed each chunk with a model like text-embedding-3-small, and store the vectors in FAISS or Pinecone. At query time: embed the user's question with the same model, run a vector search for top-K similar chunks, rerank them with a cross-encoder for precision, assemble the top chunks as context in the system prompt, and call the LLM with temperature=0. The LLM answers only from the context — it can't hallucinate because the prompt says 'answer only from what's below'."

**What they're listening for:** two pipelines, same embedding model both sides, reranking, temperature=0, grounding instruction

---

### Q2: "Why do you need chunking? Why not just put the whole document in the prompt?"

**Say this:**
> "Three reasons. First, context window limits — gpt-4o has 128K tokens but a large knowledge base could be millions of tokens. Second, cost — sending 100K tokens per request is expensive. Third, noise — the LLM's attention dilutes when there's too much context. Chunking lets you retrieve only the 3–5 most relevant sections for this specific question. The engineering trade-off is chunk size: too small and you lose context around key sentences; too large and you retrieve too much noise. I use chunk_size=800 with overlap=150 as a starting point and tune per domain."

---

### Q3: "What is reranking and why does it matter?"

**Say this:**
> "Vector search uses embedding similarity — fast but coarse. A cross-encoder reranker takes each retrieved chunk and the full query together as input, and predicts a relevance score. It's more expensive (runs the full model on each pair) but far more accurate. I use it as a second-pass filter: retrieve top-5 by vector search, rerank to get top-3, pass those 3 to the LLM. Without reranking, the highest-cosine-similarity chunk isn't always the most relevant — the reranker fixes that gap."

---

### Q4: "How do you prevent hallucination in RAG?"

**Say this:**
> "Three layers. First, the system prompt instruction: 'Answer ONLY from the context below. If the answer is not in the context, say I don't know.' This grounds the LLM and prevents it from using training knowledge. Second, temperature=0 for factual tasks — no creative generation. Third, return source citations so the user can verify. If I want to go further, I add a verification step: a second LLM call that checks whether the answer is actually supported by the retrieved chunks."

---

### Q5: "What's the difference between RAG and fine-tuning?"

**Say this:**
> "Fine-tuning bakes knowledge into the model weights — expensive, can't update without retraining, no transparency. RAG keeps knowledge external — cheap, update by re-ingesting documents, fully transparent because you can show which chunks the answer came from. I use RAG for any domain knowledge that changes (product docs, policies, recent data). I use fine-tuning only to change behaviour or style — teaching the model to write in a specific format, for example. For most production use cases, RAG is the right choice."

---

## QUICK-FIRE Q&A

| Question | Answer |
|---|---|
| What's the embedding model? | `text-embedding-3-small` (OpenAI) — 1536 dimensions |
| Same model both sides? | YES — mandatory. Different models = incompatible vector spaces |
| What's FAISS? | Facebook AI Similarity Search — fast in-process vector index |
| What's cosine similarity? | Angle between two vectors. L2-normalise + inner product = cosine |
| What's a cross-encoder? | Model that takes (query, chunk) as one input. Slower but more accurate than bi-encoder |
| What's BM25? | Keyword search algorithm. Combine with vector search for hybrid RAG |
| What's HyDE? | Hypothetical Document Embedding — generate a fake answer, embed it, use that as the search query |
| What's chunk overlap? | Shared text between adjacent chunks. Prevents losing context at chunk boundaries |

---

## GOTCHAS — Things that catch people out

**Gotcha 1: Different embedding models for ingest and query**
The single most common RAG bug. Results look random. Fix: always hardcode the model name as a constant.
```python
EMBEDDING_MODEL = "text-embedding-3-small"  # one constant, used everywhere
```

**Gotcha 2: Not normalising vectors before FAISS inner product**
```python
faiss.normalize_L2(vecs)   # MUST do this before index.add() and index.search()
```
Without L2 normalisation, inner product ≠ cosine similarity.

**Gotcha 3: Forgetting the grounding instruction**
```python
# WRONG
"Answer this question based on the context."
# RIGHT
"Answer ONLY from the context below. If the answer is not in the context, say 'I don't know.'"
```
Without "only" and the "I don't know" fallback, the LLM uses its training data and hallucinates.

**Gotcha 4: chunk_size too small**
Chunks of 100–200 characters lose all surrounding context. The retrieved chunk is a fragment that doesn't make sense on its own. Use at least 500–800 characters.

**Gotcha 5: Not tracking retrieval quality**
You can't tune what you can't measure. Log: which chunks were retrieved, their scores, and whether the LLM actually used them. Without this, RAG is a black box.

---

## WHAT TO SAY IF STUCK

> "RAG = two pipelines. Ingestion: parse, chunk with overlap, embed, store. Query: embed question with same model, vector search, rerank, assemble context, call LLM at temperature 0 with 'answer only from context' instruction. The key engineering decisions are chunk size, same embedding model on both sides, and reranking for precision."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Code](./code.py) | [→ Extensions](./extensions.md)
